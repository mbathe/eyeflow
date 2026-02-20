/// VaultClient — spec §6.1 + §13.2
///
/// HashiCorp Vault-compatible secret injection for Rust SVM edge nodes.
///
/// Secrets are NEVER stored in the LLM-IR. They are referenced by path
/// (e.g. "sap/api_key") in `dynamic_slots` and resolved here at runtime,
/// then immediately cleared from memory after the instruction completes.
///
/// Resolution strategy (in order):
///   1. HashiCorp Vault HTTP API (KV v2 at VAULT_ADDR / VAULT_TOKEN)
///   2. Environment variables (VAULT_SECRET_<UPPER_SNAKE> pattern)
///   3. Raw env key (e.g. "OPENAI_API_KEY" directly)
///
/// TTL cache: 30 seconds (avoids hammering Vault on every instruction).

use anyhow::{anyhow, Result};
use serde::Deserialize;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tracing::{debug, warn};

// ── Cache entry ───────────────────────────────────────────────────────────────

struct CacheEntry {
    value: String,
    expires_at: Instant,
}

// ── VaultClient ───────────────────────────────────────────────────────────────

pub struct VaultClient {
    http: reqwest::Client,
    vault_addr: Option<String>,
    vault_token: Option<String>,
    vault_namespace: Option<String>,
    cache: HashMap<String, CacheEntry>,
    cache_ttl: Duration,
}

#[derive(Debug)]
pub struct SecretValue {
    pub value: String,
    pub source: SecretSource,
}

#[derive(Debug, PartialEq)]
pub enum SecretSource {
    HashiCorpVault,
    EnvVar,
    RawEnvKey,
}

/// HashiCorp Vault KV v2 API response (subset)
#[derive(Deserialize)]
struct VaultResponse {
    data: VaultData,
}
#[derive(Deserialize)]
struct VaultData {
    data: HashMap<String, serde_json::Value>,
}

impl VaultClient {
    pub fn new(
        http: reqwest::Client,
        vault_addr: Option<String>,
        vault_token: Option<String>,
        vault_namespace: Option<String>,
    ) -> Self {
        Self {
            http,
            vault_addr,
            vault_token,
            vault_namespace,
            cache: HashMap::new(),
            cache_ttl: Duration::from_secs(30),
        }
    }

    /// Create a VaultClient from environment variables.
    pub fn from_env(http: reqwest::Client) -> Self {
        Self::new(
            http,
            std::env::var("VAULT_ADDR").ok(),
            std::env::var("VAULT_TOKEN").ok(),
            std::env::var("VAULT_NAMESPACE").ok(),
        )
    }

    /// Fetch a secret by its vault path (e.g. "sap/api_key").
    ///
    /// The returned value is only valid for the duration of the instruction.
    /// The caller must not store it beyond the instruction's lifetime.
    pub async fn fetch_secret(&mut self, path: &str) -> Result<SecretValue> {
        // 1. Check TTL cache
        if let Some(entry) = self.cache.get(path) {
            if entry.expires_at > Instant::now() {
                debug!("[Vault] cache hit for \"{path}\"");
                return Ok(SecretValue {
                    value: entry.value.clone(),
                    source: SecretSource::HashiCorpVault,
                });
            } else {
                self.cache.remove(path);
            }
        }

        // 2. Try HashiCorp Vault HTTP API (KV v2)
        if let (Some(addr), Some(token)) = (&self.vault_addr, &self.vault_token) {
            match self.fetch_from_hashicorp(addr, token, path).await {
                Ok(value) => {
                    self.cache.insert(path.to_owned(), CacheEntry {
                        value: value.clone(),
                        expires_at: Instant::now() + self.cache_ttl,
                    });
                    return Ok(SecretValue { value, source: SecretSource::HashiCorpVault });
                }
                Err(e) => {
                    warn!(
                        "[Vault] HashiCorp fetch failed for \"{path}\": {e} — \
                         falling back to env var"
                    );
                }
            }
        }

        // 3. Try VAULT_SECRET_<UPPER_SNAKE> env var pattern
        let env_key = path_to_env_key(path);
        if let Ok(value) = std::env::var(&env_key) {
            debug!("[Vault] using env var {env_key} for \"{path}\"");
            return Ok(SecretValue { value, source: SecretSource::EnvVar });
        }

        // 4. Try raw env key (e.g. path = "OPENAI_API_KEY")
        let raw_key = path.to_uppercase().replace('/', "_").replace('-', "_");
        if let Ok(value) = std::env::var(&raw_key) {
            debug!("[Vault] using raw env key {raw_key} for \"{path}\"");
            return Ok(SecretValue { value, source: SecretSource::RawEnvKey });
        }

        Err(anyhow!(
            "secret \"{path}\" not found in HashiCorp Vault, env var {env_key}, \
             or raw env key {raw_key}"
        ))
    }

    /// Inject vault secrets into a prompt template, replacing `{{secret:path}}` placeholders.
    ///
    /// Example: `"Bearer {{secret:sap/api_key}}"` → `"Bearer sk-abc123"`
    pub async fn inject_into_template(&mut self, template: &str) -> Result<String> {
        let mut result = template.to_owned();
        let re = regex_lite::Regex::new(r"\{\{secret:([^}]+)\}\}").unwrap();

        // Collect all unique secret paths first
        let paths: Vec<String> = re.captures_iter(template)
            .map(|cap| cap[1].to_owned())
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();

        for path in paths {
            match self.fetch_secret(&path).await {
                Ok(secret) => {
                    let placeholder = format!("{{{{secret:{path}}}}}");
                    result = result.replace(&placeholder, &secret.value);
                }
                Err(e) => {
                    warn!("[Vault] inject_into_template: failed to resolve \"{path}\": {e}");
                    // Leave placeholder intact — upstream will see it and may abort
                }
            }
        }

        Ok(result)
    }

    /// Resolve a list of `(slot_id, vault_path)` pairs.
    ///
    /// Only resolves slots whose vault_path is non-empty.
    /// Returns a map of slot_id → resolved secret value.
    pub async fn resolve_slots(
        &mut self,
        slots: &[(&str, &str)],
    ) -> HashMap<String, String> {
        let mut resolved = HashMap::new();

        for (slot_id, vault_path) in slots {
            if vault_path.is_empty() {
                continue;
            }
            match self.fetch_secret(vault_path).await {
                Ok(secret) => {
                    resolved.insert(slot_id.to_string(), secret.value);
                }
                Err(e) => {
                    warn!(
                        "[Vault] failed to resolve slot \"{slot_id}\" from \
                         path \"{vault_path}\": {e}"
                    );
                }
            }
        }

        resolved
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    async fn fetch_from_hashicorp(
        &self,
        addr: &str,
        token: &str,
        secret_path: &str,
    ) -> Result<String> {
        // KV v2 path format: /v1/secret/data/<path>
        // Support both "mount/key" and "mount/subpath/key" formats
        let parts: Vec<&str> = secret_path.splitn(2, '/').collect();
        let (mount, key) = if parts.len() == 2 {
            (parts[0], parts[1])
        } else {
            ("secret", secret_path)
        };

        let url = format!("{}/v1/{}/data/{}", addr.trim_end_matches('/'), mount, key);

        let mut req = self.http
            .get(&url)
            .header("X-Vault-Token", token);

        if let Some(ns) = &self.vault_namespace {
            req = req.header("X-Vault-Namespace", ns);
        }

        let resp = req.send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Vault HTTP {}: {}", resp.status(), url));
        }

        let body: VaultResponse = resp.json().await
            .map_err(|e| anyhow!("Vault response parse error: {e}"))?;

        // Take the first value from the KV map (or look for the key part)
        let kv_key = secret_path.rsplit('/').next().unwrap_or(secret_path);
        let value = body.data.data
            .get(kv_key)
            .or_else(|| body.data.data.values().next())
            .and_then(|v| v.as_str().map(|s| s.to_owned()))
            .ok_or_else(|| anyhow!("Vault KV key \"{kv_key}\" not found at {url}"))?;

        Ok(value)
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Convert a vault path to an env var key.
/// "sap/api_key" → "VAULT_SECRET_SAP_API_KEY"
fn path_to_env_key(path: &str) -> String {
    let normalized = path
        .to_uppercase()
        .replace('/', "_")
        .replace('-', "_")
        .replace('.', "_");
    format!("VAULT_SECRET_{normalized}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_path_to_env_key() {
        assert_eq!(path_to_env_key("sap/api_key"),   "VAULT_SECRET_SAP_API_KEY");
        assert_eq!(path_to_env_key("db/password"),    "VAULT_SECRET_DB_PASSWORD");
        assert_eq!(path_to_env_key("OPENAI_API_KEY"), "VAULT_SECRET_OPENAI_API_KEY");
    }
}
