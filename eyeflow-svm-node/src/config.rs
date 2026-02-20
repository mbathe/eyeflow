/// Configuration — loaded from environment variables / .env file (spec §8.4)
use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    /// Node identifier (UUID, unique per deployment)
    pub node_id: String,
    /// Tier this node belongs to: CENTRAL | LINUX | MCU | ANY
    pub node_tier: String,
    /// WebSocket URL of the NestJS central node (spec §8.2)
    pub central_ws_url: String,
    /// HTTP base URL of the central node (for REST health + logs)
    pub central_http_url: String,
    /// Bearer token for authenticating to the central node
    pub auth_token: String,
    /// Ed25519 private key PEM — used for audit event signatures
    pub signing_private_key_pem: Option<String>,
    /// Path for the offline buffer file (spec §8.3)
    pub offline_buffer_path: String,
    /// Maximum number of events in the offline buffer
    pub offline_buffer_max: usize,
    /// Reconnect interval in seconds when central node is unreachable
    pub reconnect_interval_secs: u64,
    /// Log level (TRACE | DEBUG | INFO | WARN | ERROR)
    pub log_level: String,

    // ── Vault configuration (spec §6.1 + §13.2) ───────────────────────────
    /// HashiCorp Vault address (e.g. "http://vault:8200")
    pub vault_addr: Option<String>,
    /// HashiCorp Vault root/service token
    pub vault_token: Option<String>,
    /// HashiCorp Vault namespace (Enterprise feature; empty for OSS)
    pub vault_namespace: Option<String>,

    // IR version compatibility (spec §5.3)
    pub ir_version_major: u32,

    // ── HealthMonitor (spec §8) ────────────────────────────────────────────
    /// TCP port for the /health, /metrics, /ready HTTP endpoints (default: 9090)
    pub health_port: u16,
}

impl Config {
    /// Load configuration from environment variables.
    /// All variables have sensible defaults for development.
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();

        let node_id = env::var("SVM_NODE_ID")
            .unwrap_or_else(|_| format!("node-{}", &uuid::Uuid::new_v4().to_string()[..8]));

        Config {
            node_id,
            node_tier: env::var("SVM_NODE_TIER").unwrap_or_else(|_| "LINUX".into()),
            central_ws_url: env::var("CENTRAL_WS_URL")
                .unwrap_or_else(|_| "ws://localhost:3000/nodes".into()),
            central_http_url: env::var("CENTRAL_HTTP_URL")
                .unwrap_or_else(|_| "http://localhost:3000".into()),
            auth_token: env::var("SVM_AUTH_TOKEN").unwrap_or_default(),
            signing_private_key_pem: env::var("SVM_SIGNING_PRIVATE_KEY_PEM").ok(),
            offline_buffer_path: env::var("OFFLINE_BUFFER_PATH")
                .unwrap_or_else(|_| "/tmp/eyeflow_svm_offline.ndjson".into()),
            offline_buffer_max: env::var("OFFLINE_BUFFER_MAX")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10_000),
            reconnect_interval_secs: env::var("RECONNECT_INTERVAL_SECS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(15),
            log_level: env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),

            // Vault (spec §6.1 + §13.2)
            vault_addr:      env::var("VAULT_ADDR").ok(),
            vault_token:     env::var("VAULT_TOKEN").ok(),
            vault_namespace: env::var("VAULT_NAMESPACE").ok(),

            // IR version compatibility (spec §5.3)
            ir_version_major: env::var("SVM_IR_VERSION_MAJOR")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1),

            // Health monitor
            health_port: env::var("SVM_HEALTH_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(9090),
        }
    }
}
