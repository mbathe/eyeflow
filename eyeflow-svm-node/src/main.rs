/// Eyeflow SVM Node — entry point (spec §6, §8)
///
/// Start-up sequence:
///   1. Parse Config from environment variables (see src/config.rs)
///   2. Initialise structured logging (RUST_LOG / SVM_LOG_LEVEL)
///   3. Restore any persisted offline buffer (NDJSON file)
///   4. Build AuditChain with Ed25519 signing key
///   5. Build Svm executor
///   6. Enter NodeClient.run() — reconnect loop with exponential back-off

mod audit;
mod config;
mod fallback;
mod health;
mod node;
mod offline;
mod proto;
mod svm;
mod vault;

use anyhow::Result;
use offline::{ensure_parent, OfflineBuffer};
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    // ── 1. Config ─────────────────────────────────────────────────────────────
    // Load .env file if present (development convenience)
    let _ = dotenvy::dotenv();
    let config = config::Config::from_env();

    // ── 2. Logging ────────────────────────────────────────────────────────────
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| {
            tracing_subscriber::EnvFilter::new(&config.log_level)
        });

    tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_target(true)
        .compact()
        .init();

    info!(
        "eyeflow-svm-node v{} starting (node_id={}, tier={})",
        env!("CARGO_PKG_VERSION"),
        config.node_id,
        config.node_tier,
    );

    // ── 3. Offline buffer ─────────────────────────────────────────────────────
    let buf_path = std::path::PathBuf::from(&config.offline_buffer_path);
    ensure_parent(&buf_path).await?;
    let offline = OfflineBuffer::new(&buf_path, config.offline_buffer_max);

    // ── 4. Audit chain ────────────────────────────────────────────────────────
    let audit = audit::AuditChain::new(
        config.node_id.clone(),
        config.signing_private_key_pem.as_deref(),
    )?;

    // ── 4b. HealthMonitor ─────────────────────────────────────────────────────
    let health_state = health::HealthState::new(&config.node_id, &config.node_tier);
    let health_port  = config.health_port;
    {
        let hs = health_state.clone();
        tokio::spawn(async move {
            if let Err(e) = health::run(hs, health_port).await {
                tracing::error!("[Health] server exited: {e}");
            }
        });
    }
    info!("[Health] HealthMonitor started on port {health_port}");

    // ── 5. SVM executor ────────────────────────────────────────────────────────
    let svm = svm::Svm::new(config.clone());

    // ── 6. Node client — runs forever ─────────────────────────────────────────────────
    let mut client = node::NodeClient::new(config, svm, audit, offline, health_state);
    client.run().await
}
