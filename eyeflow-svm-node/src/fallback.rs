/// FallbackEngine — spec §6.4
///
/// Five resilience strategies for handling instruction-level failures in the
/// Rust SVM node.  The strategy is compiled into the LLM-IR at build time
/// (field `fallback_strategy` in `IrInstruction.operands_json`) and applied at
/// runtime by the SVM when an opcode handler returns an error.
///
/// Strategy matrix (spec §6.4):
/// ┌─────────────────────────────┬────────────────────────────────────────────┐
/// │ Strategy                    │ Behaviour                                  │
/// ├─────────────────────────────┼────────────────────────────────────────────┤
/// │ FAIL_SAFE                   │ Return a pre-defined safe default value;   │
/// │                             │ continue pipeline execution                │
/// │ DEGRADED_MODE               │ Skip the failed instruction; emit a WARN   │
/// │                             │ audit event; continue with null register   │
/// │ RETRY_WITH_BACKOFF          │ Retry up to `max_attempts` times with      │
/// │                             │ exponential back-off (base 2s)             │
/// │ LLM_REASONING               │ Forward the failure to the central LLM     │
/// │                             │ service for dynamic re-planning (max 3     │
/// │                             │ attempts); fall back to FAIL_SAFE if all   │
/// │                             │ attempts fail                              │
/// │ SUPERVISED_RECOMPILE        │ Notify central that the IR slice needs     │
/// │                             │ recompilation; return FAIL_SAFE output     │
/// │                             │ while human supervisor reviews the DAG     │
/// └─────────────────────────────┴────────────────────────────────────────────┘

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{debug, error, info, warn};

// ── Strategy enum ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FallbackStrategy {
    /// Return a pre-defined safe default; pipeline continues (spec §6.4)
    FailSafe,
    /// Skip instruction; emit WARN; pipeline continues with null (spec §6.4)
    DegradedMode,
    /// Retry with exponential back-off (spec §6.4)
    RetryWithBackoff,
    /// Forward to central LLM for dynamic reasoning (max 3 attempts) (spec §6.4)
    LlmReasoning,
    /// Request human-supervised recompilation (spec §6.4)
    SupervisedRecompile,
}

impl Default for FallbackStrategy {
    fn default() -> Self {
        Self::FailSafe
    }
}

impl std::fmt::Display for FallbackStrategy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::FailSafe            => "FAIL_SAFE",
            Self::DegradedMode        => "DEGRADED_MODE",
            Self::RetryWithBackoff    => "RETRY_WITH_BACKOFF",
            Self::LlmReasoning        => "LLM_REASONING",
            Self::SupervisedRecompile => "SUPERVISED_RECOMPILE",
        };
        write!(f, "{s}")
    }
}

impl FallbackStrategy {
    /// Parse strategy from string in operands_json (case-insensitive).
    pub fn from_str(s: &str) -> Self {
        match s.to_uppercase().replace('-', "_").as_str() {
            "FAIL_SAFE"             => Self::FailSafe,
            "DEGRADED_MODE"         => Self::DegradedMode,
            "RETRY_WITH_BACKOFF"    => Self::RetryWithBackoff,
            "LLM_REASONING"         => Self::LlmReasoning,
            "SUPERVISED_RECOMPILE"  => Self::SupervisedRecompile,
            _                       => Self::FailSafe,
        }
    }
}

// ── Per-instruction fallback config (decoded from operands_json) ──────────────

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstructionFallbackConfig {
    /// Strategy to use on failure (default: FAIL_SAFE)
    #[serde(default)]
    pub strategy: Option<String>,
    /// Safe default value returned by FAIL_SAFE strategy (default: null)
    pub safe_default: Option<Value>,
    /// Maximum retries for RETRY_WITH_BACKOFF (default: 3)
    #[serde(default = "default_max_attempts")]
    pub max_attempts: u32,
    /// Base back-off in ms for RETRY_WITH_BACKOFF (default: 2000)
    #[serde(default = "default_backoff_base_ms")]
    pub backoff_base_ms: u64,
}

fn default_max_attempts() -> u32 { 3 }
fn default_backoff_base_ms() -> u64 { 2_000 }

// ── FallbackEngine ────────────────────────────────────────────────────────────

pub struct FallbackEngine {
    /// HTTP client shared across strategies (LLM_REASONING, SUPERVISED_RECOMPILE)
    http: reqwest::Client,
    /// Central NestJS HTTP URL (e.g. "http://localhost:3000")
    central_http_url: String,
    /// Node ID (included in SUPERVISED_RECOMPILE notifications)
    node_id: String,
}

/// Result of executing a fallback strategy.
#[derive(Debug)]
pub enum FallbackResult {
    /// Strategy produced a replacement value; pipeline continues.
    Recovered(Value),
    /// Strategy decided to abort the current instruction/slice.
    Abort(anyhow::Error),
}

impl FallbackEngine {
    pub fn new(
        http: reqwest::Client,
        central_http_url: impl Into<String>,
        node_id: impl Into<String>,
    ) -> Self {
        Self {
            http,
            central_http_url: central_http_url.into(),
            node_id: node_id.into(),
        }
    }

    /// Determine the fallback strategy from the instruction's `operands_json`.
    pub fn strategy_for(operands_json: &str) -> (FallbackStrategy, InstructionFallbackConfig) {
        let cfg: InstructionFallbackConfig = serde_json::from_str(operands_json)
            .unwrap_or_default();
        let strategy = cfg.strategy.as_deref()
            .map(FallbackStrategy::from_str)
            .unwrap_or_default();
        (strategy, cfg)
    }

    /// Apply the given strategy for a failed instruction.
    ///
    /// # Arguments
    /// * `strategy`   – strategy to apply
    /// * `cfg`        – per-instruction fallback configuration
    /// * `error`      – the original error that triggered the fallback
    /// * `workflow_id`– for logging / LLM_REASONING context
    /// * `service_id` – for SUPERVISED_RECOMPILE notification
    /// * `execute`    – async closure that re-runs the failed operation
    ///                  (used by RETRY_WITH_BACKOFF and LLM_REASONING)
    pub async fn apply<F, Fut>(
        &self,
        strategy: FallbackStrategy,
        cfg: &InstructionFallbackConfig,
        error: anyhow::Error,
        workflow_id: &str,
        service_id: &str,
        execute: F,
    ) -> FallbackResult
    where
        F: Fn() -> Fut,
        Fut: std::future::Future<Output = Result<Value>>,
    {
        info!(
            "[Fallback] applying strategy={strategy} for service={service_id} error=\"{error}\""
        );

        match strategy {
            // ── FAIL_SAFE ────────────────────────────────────────────────────
            FallbackStrategy::FailSafe => {
                let default_val = cfg.safe_default.clone().unwrap_or(Value::Null);
                warn!(
                    "[Fallback] FAIL_SAFE: returning safe_default={} for service={service_id}",
                    default_val
                );
                FallbackResult::Recovered(default_val)
            }

            // ── DEGRADED_MODE ────────────────────────────────────────────────
            FallbackStrategy::DegradedMode => {
                warn!(
                    "[Fallback] DEGRADED_MODE: skipping service={service_id} — \
                     pipeline continues with null register"
                );
                FallbackResult::Recovered(Value::Null)
            }

            // ── RETRY_WITH_BACKOFF ───────────────────────────────────────────
            FallbackStrategy::RetryWithBackoff => {
                let max = cfg.max_attempts.max(1) as usize;
                let base_ms = cfg.backoff_base_ms;

                for attempt in 1..=max {
                    let wait_ms = base_ms * (1u64 << (attempt - 1).min(6));
                    debug!(
                        "[Fallback] RETRY_WITH_BACKOFF attempt={attempt}/{max} \
                         wait={wait_ms}ms service={service_id}"
                    );
                    sleep(Duration::from_millis(wait_ms)).await;

                    match execute().await {
                        Ok(v) => {
                            info!(
                                "[Fallback] RETRY_WITH_BACKOFF recovered after \
                                 {attempt} attempt(s) for service={service_id}"
                            );
                            return FallbackResult::Recovered(v);
                        }
                        Err(e) => {
                            if attempt == max {
                                warn!(
                                    "[Fallback] RETRY_WITH_BACKOFF exhausted ({max} attempts) \
                                     for service={service_id}: {e}"
                                );
                                return FallbackResult::Abort(e);
                            }
                        }
                    }
                }
                // Unreachable but compiler needs it
                FallbackResult::Abort(error)
            }

            // ── LLM_REASONING ────────────────────────────────────────────────
            // Forward failure context to central LLM service; it returns an
            // alternative JSON value.  Max 3 attempts before falling back to
            // FAIL_SAFE (spec §6.4 "max 3 attempts").
            FallbackStrategy::LlmReasoning => {
                let url = format!("{}/api/fallback/llm-reasoning", self.central_http_url);
                for attempt in 1u32..=3 {
                    let payload = serde_json::json!({
                        "workflowId": workflow_id,
                        "serviceId":  service_id,
                        "error":      error.to_string(),
                        "attempt":    attempt,
                        "nodeId":     self.node_id,
                    });

                    match self.http.post(&url).json(&payload).send().await {
                        Ok(resp) if resp.status().is_success() => {
                            match resp.json::<Value>().await {
                                Ok(body) => {
                                    info!(
                                        "[Fallback] LLM_REASONING recovered (attempt={attempt}) \
                                         service={service_id}"
                                    );
                                    let result = body.get("result")
                                        .cloned()
                                        .unwrap_or(cfg.safe_default.clone().unwrap_or(Value::Null));
                                    return FallbackResult::Recovered(result);
                                }
                                Err(e) => {
                                    warn!(
                                        "[Fallback] LLM_REASONING response decode error \
                                         (attempt={attempt}): {e}"
                                    );
                                }
                            }
                        }
                        Ok(resp) => {
                            warn!(
                                "[Fallback] LLM_REASONING HTTP {} (attempt={attempt})",
                                resp.status()
                            );
                        }
                        Err(e) => {
                            warn!(
                                "[Fallback] LLM_REASONING request failed (attempt={attempt}): {e}"
                            );
                        }
                    }

                    // Exponential back-off between reasoning attempts
                    if attempt < 3 {
                        sleep(Duration::from_secs(2u64.pow(attempt))).await;
                    }
                }

                // All LLM attempts exhausted — degrade to FAIL_SAFE
                warn!(
                    "[Fallback] LLM_REASONING: all 3 attempts failed — \
                     falling back to FAIL_SAFE for service={service_id}"
                );
                let default_val = cfg.safe_default.clone().unwrap_or(Value::Null);
                FallbackResult::Recovered(default_val)
            }

            // ── SUPERVISED_RECOMPILE ─────────────────────────────────────────
            // Notify central that this IR slice needs human review.
            // Return FAIL_SAFE output immediately; the supervisor will trigger
            // a new compilation cycle when ready.
            FallbackStrategy::SupervisedRecompile => {
                let url = format!("{}/api/nodes/recompile-request", self.central_http_url);
                let payload = serde_json::json!({
                    "workflowId": workflow_id,
                    "serviceId":  service_id,
                    "error":      error.to_string(),
                    "nodeId":     self.node_id,
                    "requestedAt": chrono::Utc::now().to_rfc3339(),
                });

                match self.http.post(&url).json(&payload).send().await {
                    Ok(resp) => {
                        info!(
                            "[Fallback] SUPERVISED_RECOMPILE notification sent \
                             (HTTP {}) for workflow={workflow_id}",
                            resp.status()
                        );
                    }
                    Err(e) => {
                        error!(
                            "[Fallback] SUPERVISED_RECOMPILE notification failed: {e}"
                        );
                    }
                }

                let default_val = cfg.safe_default.clone().unwrap_or(Value::Null);
                FallbackResult::Recovered(default_val)
            }
        }
    }
    /// Apply a fallback strategy WITHOUT a retry executor (convenience wrapper).
    ///
    /// For RETRY_WITH_BACKOFF: degrades gracefully to FAIL_SAFE since no
    /// retry executor is provided.  Use `apply()` for full retry support.
    pub async fn apply_simple(
        &self,
        strategy: FallbackStrategy,
        cfg: &InstructionFallbackConfig,
        error: anyhow::Error,
        workflow_id: &str,
        service_id: &str,
    ) -> Result<Value> {
        // RETRY_WITH_BACKOFF without an executor → degrade to FAIL_SAFE
        let effective = if strategy == FallbackStrategy::RetryWithBackoff {
            warn!(
                "[Fallback] apply_simple called with RETRY_WITH_BACKOFF — \
                 no retry executor provided, degrading to FAIL_SAFE"
            );
            FallbackStrategy::FailSafe
        } else {
            strategy
        };

        let result = self.apply(
            effective, cfg, error, workflow_id, service_id,
            || async { Err::<Value, _>(anyhow!("no retry executor")) },
        ).await;

        match result {
            FallbackResult::Recovered(v) => Ok(v),
            FallbackResult::Abort(e)     => Err(e),
        }
    }
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strategy_from_str() {
        assert_eq!(FallbackStrategy::from_str("FAIL_SAFE"),            FallbackStrategy::FailSafe);
        assert_eq!(FallbackStrategy::from_str("fail_safe"),            FallbackStrategy::FailSafe);
        assert_eq!(FallbackStrategy::from_str("DEGRADED_MODE"),        FallbackStrategy::DegradedMode);
        assert_eq!(FallbackStrategy::from_str("RETRY_WITH_BACKOFF"),   FallbackStrategy::RetryWithBackoff);
        assert_eq!(FallbackStrategy::from_str("LLM_REASONING"),        FallbackStrategy::LlmReasoning);
        assert_eq!(FallbackStrategy::from_str("SUPERVISED_RECOMPILE"), FallbackStrategy::SupervisedRecompile);
        assert_eq!(FallbackStrategy::from_str("unknown"),              FallbackStrategy::FailSafe);
    }

    #[test]
    fn test_strategy_for_empty_operands() {
        let (strategy, cfg) = FallbackEngine::strategy_for("{}");
        assert_eq!(strategy, FallbackStrategy::FailSafe);
        assert_eq!(cfg.max_attempts, 3);
        assert_eq!(cfg.backoff_base_ms, 2000);
    }

    #[test]
    fn test_strategy_for_explicit() {
        let json = r#"{"strategy":"RETRY_WITH_BACKOFF","maxAttempts":5,"backoffBaseMs":1000}"#;
        let (strategy, cfg) = FallbackEngine::strategy_for(json);
        assert_eq!(strategy, FallbackStrategy::RetryWithBackoff);
        assert_eq!(cfg.max_attempts, 5);
        assert_eq!(cfg.backoff_base_ms, 1000);
    }
}
