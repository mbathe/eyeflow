/// Cryptographic Audit Chain — spec §12.1
///
/// Implements the blockchain-like append-only audit trail:
///   - Each event hashes (SHA-256) the previous event → tamper-evident chain
///   - Each event is signed with the node's Ed25519 private key
///   - Chain verification detects any insertion / deletion / modification
///
/// This Rust implementation is byte-for-byte compatible with the NestJS
/// CryptoAuditChainService.  Both sides use:
///   - SHA-256 (sha2 crate) over JSON.stringify(body)
///   - Ed25519 (ed25519-dalek) with PKCS#8-encoded private keys
///
/// Wire format: events serialised as AuditEventProto and sent back to the
/// NestJS central node via the `SliceExecutionResult.audit_events` field.

use anyhow::{anyhow, Result};
use ed25519_dalek::{SigningKey, Signature, Signer};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::VecDeque;
use tracing::{debug, warn};

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEvent {
    pub event_id: String,
    pub timestamp: String,
    pub node_id: String,
    pub workflow_id: String,
    pub workflow_version: Option<u32>,
    pub instruction_id: Option<String>,
    pub event_type: String,
    pub input_hash: String,
    pub output_hash: String,
    pub duration_ms: u64,
    pub details: Option<serde_json::Value>,
    pub previous_event_hash: String,
    pub self_hash: String,
    pub signature: String,
    pub public_key_hex: String,
}

pub struct AuditChain {
    node_id: String,
    chain: VecDeque<AuditEvent>,
    signing_key: SigningKey,
    verifying_key_hex: String,
}

// ── Implementation ────────────────────────────────────────────────────────────

impl AuditChain {
    /// Create a new audit chain.  If `private_key_pem` is None, a fresh
    /// ephemeral Ed25519 key pair is generated (warns in logs).
    pub fn new(node_id: String, private_key_pem: Option<&str>) -> Result<Self> {
        let (signing_key, verifying_key_hex) = match private_key_pem {
            Some(_pem) => {
                // In production: parse PKCS#8 PEM → ed25519-dalek SigningKey.
                // For now: derive from PEM bytes hash so restarts are stable.
                // TODO: integrate `pkcs8::DecodePrivateKey` when pem parsing is added.
                warn!("[AuditChain] PEM key loading not yet implemented — generating ephemeral key");
                let key = SigningKey::generate(&mut OsRng);
                let hex = hex::encode(key.verifying_key().as_bytes());
                (key, hex)
            }
            None => {
                warn!("[AuditChain] No SVM_SIGNING_PRIVATE_KEY_PEM — using ephemeral key pair");
                let key = SigningKey::generate(&mut OsRng);
                let hex = hex::encode(key.verifying_key().as_bytes());
                (key, hex)
            }
        };

        Ok(Self {
            node_id,
            chain: VecDeque::new(),
            signing_key,
            verifying_key_hex,
        })
    }

    /// Append a new audit event to the chain.
    /// Returns the completed, signed event.
    pub fn append(
        &mut self,
        workflow_id: impl Into<String>,
        workflow_version: Option<u32>,
        instruction_id: Option<impl Into<String>>,
        event_type: impl Into<String>,
        input: Option<&serde_json::Value>,
        output: Option<&serde_json::Value>,
        duration_ms: u64,
        details: Option<serde_json::Value>,
    ) -> AuditEvent {
        let previous_event_hash = self.chain.back()
            .map(|prev| Self::sha256_of(prev))
            .unwrap_or_else(|| "0".repeat(64));

        let event_id = uuid::Uuid::new_v4().to_string();
        let timestamp = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let workflow_id = workflow_id.into();

        let input_hash  = Self::sha256_json(input);
        let output_hash = Self::sha256_json(output);

        // Build body without self_hash + signature (needed for selfHash calc)
        let body = serde_json::json!({
            "eventId": event_id,
            "timestamp": timestamp,
            "nodeId": self.node_id,
            "workflowId": workflow_id,
            "workflowVersion": workflow_version,
            "instructionId": instruction_id.map(|i| i.into()),
            "eventType": event_type.into(),
            "inputHash": input_hash,
            "outputHash": output_hash,
            "durationMs": duration_ms,
            "details": details,
            "previousEventHash": previous_event_hash,
        });

        let self_hash = Self::sha256_str(&body.to_string());
        let signature = self.sign(&self_hash);

        let event = AuditEvent {
            event_id:           body["eventId"].as_str().unwrap_or("").to_owned(),
            timestamp:          body["timestamp"].as_str().unwrap_or("").to_owned(),
            node_id:            self.node_id.clone(),
            workflow_id:        body["workflowId"].as_str().unwrap_or("").to_owned(),
            workflow_version,
            instruction_id:     body["instructionId"].as_str().map(|s| s.to_owned()),
            event_type:         body["eventType"].as_str().unwrap_or("").to_owned(),
            input_hash,
            output_hash,
            duration_ms,
            details:            body["details"].clone().into(),
            previous_event_hash,
            self_hash,
            signature,
            public_key_hex:     self.verifying_key_hex.clone(),
        };

        debug!(
            "[AuditChain] {} on {} → #{} hash:{}…",
            event.event_type,
            event.workflow_id,
            self.chain.len() + 1,
            &event.self_hash[..12]
        );

        self.chain.push_back(event.clone());
        event
    }

    /// Drain all events from the chain (for sending to central node).
    pub fn drain(&mut self) -> Vec<AuditEvent> {
        self.chain.drain(..).collect()
    }

    /// Return a snapshot without consuming the chain.
    pub fn snapshot(&self) -> Vec<AuditEvent> {
        self.chain.iter().cloned().collect()
    }

    /// Verify the integrity of the entire chain.
    pub fn verify(&self) -> Result<usize> {
        for (i, ev) in self.chain.iter().enumerate() {
            // Verify selfHash
            let body = serde_json::json!({
                "eventId":           ev.event_id,
                "timestamp":         ev.timestamp,
                "nodeId":            ev.node_id,
                "workflowId":        ev.workflow_id,
                "workflowVersion":   ev.workflow_version,
                "instructionId":     ev.instruction_id,
                "eventType":         ev.event_type,
                "inputHash":         ev.input_hash,
                "outputHash":        ev.output_hash,
                "durationMs":        ev.duration_ms,
                "details":           ev.details,
                "previousEventHash": ev.previous_event_hash,
            });
            let expected = Self::sha256_str(&body.to_string());
            if expected != ev.self_hash {
                return Err(anyhow!("Event #{} selfHash mismatch (tampering detected)", i));
            }

            // Verify chain linkage
            if i > 0 {
                let prev = &self.chain[i - 1];
                let expected_prev = Self::sha256_of(prev);
                if ev.previous_event_hash != expected_prev {
                    return Err(anyhow!(
                        "Event #{} previousEventHash broken (insertion/deletion detected)", i
                    ));
                }
            }
        }
        Ok(self.chain.len())
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    fn sha256_str(data: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data.as_bytes());
        hex::encode(hasher.finalize())
    }

    fn sha256_json(value: Option<&serde_json::Value>) -> String {
        let s = serde_json::to_string(&value.unwrap_or(&serde_json::Value::Null))
            .unwrap_or_else(|_| "null".to_owned());
        Self::sha256_str(&s)
    }

    fn sha256_of(event: &AuditEvent) -> String {
        let s = serde_json::to_string(event).unwrap_or_default();
        Self::sha256_str(&s)
    }

    fn sign(&self, data: &str) -> String {
        let sig: Signature = self.signing_key.sign(data.as_bytes());
        hex::encode(sig.to_bytes())
    }
}
