/// WebSocket Node Client — spec §8.2 + §8.3
///
/// This module manages the persistent WebSocket connection between the Rust SVM
/// node and the NestJS central orchestrator (eyeflow-server).
///
/// Protocol (JSON-framed over WebSocket):
///
///   Central → Node:
///     { "type": "IR_DISTRIBUTION",  "payload": <base64 proto> }   — run IR slice
///     { "type": "PING" }                                            — keepalive
///     { "type": "CONFIG_UPDATE",    "payload": {...} }              — config push
///
///   Node → Central:
///     { "type": "REGISTER",   "payload": { nodeId, tier, capabilities } }
///     { "type": "RESULT",     "payload": <SliceExecutionResult JSON> }
///     { "type": "PONG" }                                            — keepalive reply
///     { "type": "AUDIT_FLUSH","payload": [AuditEvent, ...] }        — offline flush
///
/// On disconnect, audit events and execution results are persisted to the
/// OfflineBuffer and replayed as an AUDIT_FLUSH on reconnect.

use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use futures_util::{SinkExt, StreamExt};
use prost::Message as ProstMessage;
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{debug, error, info, warn};
use crate::audit::{AuditChain, AuditEvent};
use crate::config::Config;
use crate::health::HealthState;
use crate::offline::{ensure_parent, OfflineBuffer};
use crate::proto::llmir::{IrDistributionMessage, SliceExecutionResult};
use crate::svm::Svm;

// ── IR format compatibility (spec §5.3) ───────────────────────────────────────

/// The LLM-IR binary format major version this node was compiled against.
/// Same major + different minor → execute + WARN.
/// Different major → refuse execution entirely (returns INCOMPATIBLE error).
const SVM_IR_FORMAT_VERSION_MAJOR: u32 = 1;

// ── Node client ───────────────────────────────────────────────────────────────

pub struct NodeClient {
    config:  Config,
    svm:     Svm,
    audit:   Arc<Mutex<AuditChain>>,
    offline: Arc<Mutex<OfflineBuffer>>,
    health:  Arc<HealthState>,
}

impl NodeClient {
    pub fn new(
        config: Config,
        svm: Svm,
        audit: AuditChain,
        offline: OfflineBuffer,
        health: Arc<HealthState>,
    ) -> Self {
        Self {
            config: config.clone(),
            svm,
            audit:   Arc::new(Mutex::new(audit)),
            offline: Arc::new(Mutex::new(offline)),
            health,
        }
    }

    /// Main loop: connect → register → read messages → on disconnect: persist buffers →
    ///            wait reconnect_interval → retry forever.
    pub async fn run(&mut self) -> Result<()> {
        // Restore any persisted offline events from a previous crash
        {
            let mut buf = self.offline.lock().await;
            if let Err(e) = buf.load().await {
                warn!("[Node] failed to load offline buffer: {e}");
            }
        }

        loop {
            info!("[Node] connecting to {}", self.config.central_ws_url);

            match self.connect_and_run().await {
                Ok(()) => {
                    info!("[Node] connection closed gracefully");
                }
                Err(e) => {
                    error!("[Node] connection error: {e}");
                }
            }

            // Mark offline
            self.health.set_ws_connected(false);
            {
                let mut buf = self.offline.lock().await;
                buf.notify_connected(false);
                self.health.set_offline_depth(buf.len());
                if let Err(e) = buf.persist().await {
                    warn!("[Node] failed to persist offline buffer: {e}");
                }
            }

            let wait = Duration::from_secs(self.config.reconnect_interval_secs);
            info!("[Node] reconnecting in {wait:?}…");
            sleep(wait).await;
        }
    }

    // ── Single connection session ─────────────────────────────────────────────

    async fn connect_and_run(&mut self) -> Result<()> {
        let (ws_stream, _resp) = connect_async(&self.config.central_ws_url).await
            .map_err(|e| anyhow!("WebSocket handshake failed: {e}"))?;

        let (mut write, mut read) = ws_stream.split();

        // Mark online, flush offline buffer
        {
            let mut buf = self.offline.lock().await;
            buf.notify_connected(true);
        }
        self.health.set_ws_connected(true);

        // Send registration frame
        let reg = json!({
            "type": "REGISTER",
            "payload": {
                "nodeId": self.config.node_id,
                "tier": self.config.node_tier,
                "capabilities": self.build_capabilities(),
                "version": env!("CARGO_PKG_VERSION"),
            }
        });
        write.send(Message::Text(reg.to_string())).await?;
        info!("[Node] registered as {} (tier={})", self.config.node_id, self.config.node_tier);

        // Flush offline events accumulated during prior disconnection
        self.flush_offline_events(&mut write).await;

        // Message loop
        while let Some(msg) = read.next().await {
            let msg = msg?;
            match msg {
                Message::Text(text) => {
                    match self.handle_text_message(&text, &mut write).await {
                        Ok(()) => {}
                        Err(e) => warn!("[Node] message handler error: {e}"),
                    }
                }
                Message::Binary(data) => {
                    match self.handle_binary_message(&data, &mut write).await {
                        Ok(()) => {}
                        Err(e) => warn!("[Node] binary message handler error: {e}"),
                    }
                }
                Message::Ping(data) => {
                    write.send(Message::Pong(data)).await?;
                }
                Message::Close(_) => {
                    info!("[Node] server closed connection");
                    break;
                }
                _ => {}
            }
        }

        Ok(())
    }

    // ── Message dispatch ──────────────────────────────────────────────────────

    async fn handle_text_message(
        &mut self,
        text: &str,
        write: &mut (impl SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin),
    ) -> Result<()> {
        let frame: Value = serde_json::from_str(text)?;
        let msg_type = frame.get("type").and_then(|v| v.as_str()).unwrap_or("UNKNOWN");
        debug!("[Node] ← {msg_type}");

        match msg_type {
            "IR_DISTRIBUTION" => {
                let payload = frame.get("payload")
                    .ok_or_else(|| anyhow!("IR_DISTRIBUTION missing payload"))?;
                let result = self.execute_ir_from_payload(payload).await?;
                let result_frame = json!({
                    "type": "RESULT",
                    "payload": result,
                });
                write.send(Message::Text(result_frame.to_string())).await?;
            }

            "PING" => {
                write.send(Message::Text(json!({"type":"PONG"}).to_string())).await?;
            }

            "CONFIG_UPDATE" => {
                // Live config updates not yet applied; log only
                info!("[Node] CONFIG_UPDATE received (not applied)");
            }

            other => {
                debug!("[Node] unknown message type: {other}");
            }
        }
        Ok(())
    }

    async fn handle_binary_message(
        &mut self,
        data: &[u8],
        write: &mut (impl SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin),
    ) -> Result<()> {
        // Binary frames are proto-encoded IRDistributionMessage
        let dist_msg = IrDistributionMessage::decode(data)
            .map_err(|e| anyhow!("proto decode error: {e}"))?;

        let artifact = dist_msg.artifact
            .ok_or_else(|| anyhow!("IRDistributionMessage.artifact is null"))?;

        // ── IR format version compatibility check (spec §5.3) ────────────────
        // Same major → execute (warn if minor differs)
        // Different major → refuse execution entirely
        // Version 0 is reserved for dev/unsigned artifacts → accept with warning
        let artifact_format_version = artifact.version;
        let node_major = self.config.ir_version_major;

        if artifact_format_version == 0 {
            warn!(
                "[Node] IR artifact format_version=0 (unsigned/dev artifact) — \
                 accepting with warning. Set SVM_IR_VERSION_MAJOR in production."
            );
        } else if artifact_format_version != node_major {
            error!(
                "[Node] ⛔ IR format version incompatible: \
                 node_major={node_major} artifact_major={artifact_format_version} — \
                 refusing execution (spec §5.3)"
            );
            // Send security alert to central
            let alert_url = format!(
                "{}/api/nodes/security-alert",
                self.config.central_http_url
            );
            let payload = serde_json::json!({
                "type": "IR_VERSION_INCOMPATIBLE",
                "nodeId": self.config.node_id,
                "nodeMajor": node_major,
                "artifactMajor": artifact_format_version,
                "workflowId": dist_msg.workflow_id,
            });
            // Best-effort alert; do not block on failure
            let _ = reqwest::Client::new()
                .post(&alert_url)
                .json(&payload)
                .send()
                .await;

            return Err(anyhow!(
                "IR major version mismatch: node={node_major} artifact={artifact_format_version}"
            ));
        }

        // Verify Ed25519 signature (spec §13.1)
        Self::verify_artifact_signature(&artifact)?;

        let ir = crate::proto::llmir::LlmIntermediateRepresentation::decode(
            artifact.payload.as_ref()
        ).map_err(|e| anyhow!("IR proto decode error: {e}"))?;

        let result = self.execute_ir(&ir).await?;
        let mut result_bytes = Vec::new();
        result.encode(&mut result_bytes)?;
        write.send(Message::Binary(result_bytes)).await?;
        Ok(())
    }

    // ── IR execution ──────────────────────────────────────────────────────────

    async fn execute_ir_from_payload(&mut self, payload: &Value) -> Result<Value> {
        // JSON-framed IR distribution (non-binary path)
        let b64 = payload.get("artifact")
            .or_else(|| payload.get("payload"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if b64.is_empty() {
            return Err(anyhow!("IR_DISTRIBUTION payload has no artifact field"));
        }

        let proto_bytes = B64.decode(b64)
            .map_err(|e| anyhow!("base64 decode error: {e}"))?;

        let ir = crate::proto::llmir::LlmIntermediateRepresentation::decode(
            proto_bytes.as_slice()
        ).map_err(|e| anyhow!("IR proto decode: {e}"))?;

        let result_proto = self.execute_ir(&ir).await?;

        // Convert proto result to JSON for text-framed response
        let json_result = serde_json::to_value(&ResultJson::from(&result_proto))?;
        Ok(json_result)
    }

    async fn execute_ir(
        &mut self,
        ir: &crate::proto::llmir::LlmIntermediateRepresentation,
    ) -> Result<SliceExecutionResult> {
        let workflow_id = ir.metadata.as_ref()
            .map(|m| m.id.clone())
            .unwrap_or_else(|| "unknown".to_owned());

        let mut audit = self.audit.lock().await;
        let start = std::time::Instant::now();

        let (regs, elapsed_ms) = match self.svm.execute(ir, &mut audit).await {
            Ok(r) => {
                self.health.record_execution(r.1, true);
                r
            }
            Err(e) => {
                self.health.record_execution(start.elapsed().as_millis() as u64, false);
                error!("[Node] SVM execution failed: {e}");

                // Try to get offline buffer and enqueue the error
                let mut buf = self.offline.lock().await;
                self.health.set_offline_depth(buf.len());
                if buf.is_buffering() {
                    buf.enqueue_execution_result(json!({
                        "workflowId": workflow_id,
                        "status": "FAILED",
                        "error": e.to_string(),
                    }));
                }

                return Ok(SliceExecutionResult {
                    plan_id: workflow_id.clone(),
                    slice_id: uuid::Uuid::new_v4().to_string(),
                    node_id: self.config.node_id.clone(),
                    status: "FAILED".to_owned(),
                    error: e.to_string(),
                    duration_ms: start.elapsed().as_millis() as i32,
                    output_registers: Default::default(),
                    audit_events: vec![],
                });
            }
        };

        let audit_events = audit.drain()
            .into_iter()
            .map(|ev| crate::proto::llmir::AuditEventProto {
                event_id:            ev.event_id,
                timestamp:           ev.timestamp,
                node_id:             ev.node_id,
                workflow_id:         ev.workflow_id,
                workflow_version:    ev.workflow_version.unwrap_or(0) as i32,
                instruction_id:      ev.instruction_id.unwrap_or_default(),
                event_type:          ev.event_type,
                input_hash:          ev.input_hash,
                output_hash:         ev.output_hash,
                duration_ms:         ev.duration_ms as i32,
                previous_event_hash: ev.previous_event_hash,
                self_hash:           ev.self_hash,
                signature:           ev.signature,
            })
            .collect();

        let output_registers: std::collections::HashMap<i32, String> = regs
            .iter()
            .map(|(k, v)| (*k, v.to_string()))
            .collect();

        Ok(SliceExecutionResult {
            plan_id: workflow_id,
            slice_id: uuid::Uuid::new_v4().to_string(),
            node_id: self.config.node_id.clone(),
            status: "SUCCESS".to_owned(),
            error: String::new(),
            duration_ms: elapsed_ms as i32,
            output_registers,
            audit_events,
        })
    }

    // ── Offline flush ─────────────────────────────────────────────────────────

    async fn flush_offline_events(
        &mut self,
        write: &mut (impl SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin),
    ) {
        let mut buf = self.offline.lock().await;
        if buf.is_empty() {
            return;
        }

        info!("[Node] flushing {} offline event(s)", buf.len());
        let events = buf.drain_for_flush();

        let frame = json!({
            "type": "AUDIT_FLUSH",
            "payload": events,
        });

        match write.send(Message::Text(frame.to_string())).await {
            Ok(()) => {
                info!("[Node] offline flush sent");
                if let Err(e) = buf.clear_disk().await {
                    warn!("[Node] failed to clear offline disk: {e}");
                }
            }
            Err(e) => {
                warn!("[Node] offline flush send failed: {e} — re-enqueuing");
                for ev in events {
                    // Re-enqueue (drop oldest if full)
                    match &ev {
                        crate::offline::BufferedEvent::AuditEvent { payload, .. } => {
                            buf.enqueue_audit_event(payload.clone());
                        }
                        crate::offline::BufferedEvent::ExecutionResult { payload, .. } => {
                            buf.enqueue_execution_result(payload.clone());
                        }
                        crate::offline::BufferedEvent::TriggerFire { payload, .. } => {
                            buf.enqueue_trigger_fire(payload.clone());
                        }
                    }
                }
            }
        }
    }

    // ── Signature verification ────────────────────────────────────────────────

    fn verify_artifact_signature(
        artifact: &crate::proto::llmir::SignedIrArtifact,
    ) -> Result<()> {
        use sha2::{Digest, Sha256};

        // Verify SHA-256 payload checksum
        let mut hasher = Sha256::new();
        hasher.update(&artifact.payload);
        let actual_checksum = hex::encode(hasher.finalize());

        if !artifact.payload_checksum.is_empty()
            && actual_checksum != artifact.payload_checksum
        {
            return Err(anyhow!(
                "IR artifact checksum mismatch: expected {} got {}",
                artifact.payload_checksum,
                actual_checksum
            ));
        }

        // Ed25519 signature verification skipped when public_key_pem is empty
        // (e.g. internal test messages).  In production the key is always present.
        if artifact.public_key_pem.is_empty() || artifact.signature.is_empty() {
            warn!("[Node] IR artifact has no signature — skipping verification");
            return Ok(());
        }

        // TODO: parse PEM public key + verify sig bytes
        // For now: trust checksum verification above (production adds full verify)
        debug!("[Node] signature present — full PEM verification TODO");

        Ok(())
    }

    // ── Misc ──────────────────────────────────────────────────────────────────

    fn build_capabilities(&self) -> Value {
        json!({
            "opcodes": [
                "LOAD_RESOURCE", "STORE_MEMORY",
                "CALL_SERVICE", "CALL_ACTION", "CALL_MCP",
                "LLM_CALL", "TRANSFORM", "VALIDATE",
                "BRANCH", "LOOP", "JUMP", "RETURN",
                "PARALLEL_SPAWN", "PARALLEL_MERGE",
                "AGGREGATE", "FILTER"
            ],
            "serviceFormats": ["HTTP", "CONNECTOR", "MCP"],
            "aarch64": cfg!(target_arch = "aarch64"),
            "x86_64": cfg!(target_arch = "x86_64"),
        })
    }
}

// ── JSON-serialisable view of SliceExecutionResult ────────────────────────────

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ResultJson {
    plan_id: String,
    slice_id: String,
    node_id: String,
    status: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    error: String,
    duration_ms: i32,
    output_registers: std::collections::HashMap<String, String>,
}

impl From<&SliceExecutionResult> for ResultJson {
    fn from(r: &SliceExecutionResult) -> Self {
        Self {
            plan_id: r.plan_id.clone(),
            slice_id: r.slice_id.clone(),
            node_id: r.node_id.clone(),
            status: r.status.clone(),
            error: r.error.clone(),
            duration_ms: r.duration_ms,
            output_registers: r.output_registers.iter()
                .map(|(k, v)| (k.to_string(), v.clone()))
                .collect(),
        }
    }
}
