/*! eyeflow-svm-node::health — HealthMonitor HTTP endpoint + metrics
 *
 * Exposes a minimal HTTP/1.1 server on `SVM_HEALTH_PORT` (default 9090).
 *
 * Endpoints:
 *   GET /health   → JSON health object (status, uptime, ws_state, ...)
 *   GET /metrics  → Prometheus text format (for Grafana/Alert scraping)
 *   GET /ready    → 200 if ws_connected, 503 otherwise (k8s readiness probe)
 *
 * State is updated by other modules via the shared `HealthState` handle:
 *   – `NodeClient` calls `HealthState::set_ws_connected(true/false)`
 *   – `OfflineBuffer` calls  `HealthState::set_offline_depth(n)`
 *   – `Svm` calls            `HealthState::record_execution(elapsed_ms, ok)`
 *
 * No extra Cargo dependencies — uses raw `tokio::net::TcpListener`.
 */

use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use anyhow::Result;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tracing::{debug, error, info, warn};

// ── HealthState ───────────────────────────────────────────────────────────────

/// Shared, thread-safe health state.
/// All fields use lock-free atomics — safe to update from any task.
#[derive(Debug)]
pub struct HealthState {
    /// Whether the WebSocket to CENTRAL is currently connected.
    pub ws_connected: AtomicBool,
    /// Number of events currently queued in the offline buffer.
    pub offline_depth: AtomicUsize,
    /// Total number of IR executions since startup.
    pub executions_total: AtomicU64,
    /// Total number of failed IR executions since startup.
    pub executions_failed: AtomicU64,
    /// Total execution time accumulated (milliseconds) - for avg computation.
    pub exec_duration_ms_total: AtomicU64,
    /// Unix timestamp (seconds) when the node started.
    start_ts: u64,
    /// Node ID for identification.
    pub node_id: String,
    /// Node tier (CENTRAL / LINUX / MCU / ANY).
    pub node_tier: String,
}

impl HealthState {
    pub fn new(node_id: &str, node_tier: &str) -> Arc<Self> {
        Arc::new(Self {
            ws_connected:        AtomicBool::new(false),
            offline_depth:       AtomicUsize::new(0),
            executions_total:    AtomicU64::new(0),
            executions_failed:   AtomicU64::new(0),
            exec_duration_ms_total: AtomicU64::new(0),
            start_ts: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
            node_id:   node_id.to_owned(),
            node_tier: node_tier.to_owned(),
        })
    }

    // ── Setters (called by other modules) ──────────────────────────────────

    /// Update WebSocket connectivity state.
    pub fn set_ws_connected(&self, connected: bool) {
        self.ws_connected.store(connected, Ordering::Relaxed);
    }

    /// Update the offline buffer queue depth.
    pub fn set_offline_depth(&self, depth: usize) {
        self.offline_depth.store(depth, Ordering::Relaxed);
    }

    /// Record one IR execution result.
    ///
    /// `ok = true`  → success
    /// `ok = false` → fault (after all retries)
    pub fn record_execution(&self, elapsed_ms: u64, ok: bool) {
        self.executions_total.fetch_add(1, Ordering::Relaxed);
        self.exec_duration_ms_total.fetch_add(elapsed_ms, Ordering::Relaxed);
        if !ok {
            self.executions_failed.fetch_add(1, Ordering::Relaxed);
        }
    }

    // ── Computed metrics ──────────────────────────────────────────────────

    /// Seconds since the node started.
    pub fn uptime_secs(&self) -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
            .saturating_sub(self.start_ts)
    }

    /// Average execution duration in ms (0 if no executions).
    pub fn avg_exec_ms(&self) -> u64 {
        let total = self.executions_total.load(Ordering::Relaxed);
        if total == 0 { return 0; }
        self.exec_duration_ms_total.load(Ordering::Relaxed) / total
    }

    /// Whether the node is considered healthy (WS connected, offline buffer < 1000).
    pub fn is_healthy(&self) -> bool {
        self.ws_connected.load(Ordering::Relaxed)
            && self.offline_depth.load(Ordering::Relaxed) < 1000
    }

    // ── Serialisation ─────────────────────────────────────────────────────

    /// Render the health state as a compact JSON string.
    pub fn to_json(&self) -> String {
        let ws         = self.ws_connected.load(Ordering::Relaxed);
        let offline    = self.offline_depth.load(Ordering::Relaxed);
        let total      = self.executions_total.load(Ordering::Relaxed);
        let failed     = self.executions_failed.load(Ordering::Relaxed);
        let avg_ms     = self.avg_exec_ms();
        let uptime     = self.uptime_secs();
        let status_str = if self.is_healthy() { "ok" } else { "degraded" };

        format!(
            r#"{{"status":"{status_str}","node_id":"{node_id}","tier":"{tier}",\
"uptime_secs":{uptime},"ws_connected":{ws},"offline_depth":{offline},\
"executions":{{"total":{total},"failed":{failed},"avg_ms":{avg_ms}}}}}"#,
            status_str = status_str,
            node_id    = self.node_id,
            tier       = self.node_tier,
            uptime     = uptime,
            ws         = ws,
            offline    = offline,
            total      = total,
            failed     = failed,
            avg_ms     = avg_ms,
        )
    }

    /// Render Prometheus text format.
    ///
    /// Compatible with `prometheus.io/scrape: "true"` annotation in k8s.
    pub fn to_prometheus(&self) -> String {
        let ws         = if self.ws_connected.load(Ordering::Relaxed) { 1 } else { 0 };
        let offline    = self.offline_depth.load(Ordering::Relaxed);
        let total      = self.executions_total.load(Ordering::Relaxed);
        let failed     = self.executions_failed.load(Ordering::Relaxed);
        let avg_ms     = self.avg_exec_ms();
        let uptime     = self.uptime_secs();
        let healthy    = if self.is_healthy() { 1 } else { 0 };
        let node_id    = &self.node_id;
        let tier       = &self.node_tier;

        format!(
            "# HELP eyeflow_node_healthy 1 if node is healthy\n\
             # TYPE eyeflow_node_healthy gauge\n\
             eyeflow_node_healthy{{node_id=\"{node_id}\",tier=\"{tier}\"}} {healthy}\n\
             # HELP eyeflow_node_uptime_seconds Node uptime in seconds\n\
             # TYPE eyeflow_node_uptime_seconds counter\n\
             eyeflow_node_uptime_seconds{{node_id=\"{node_id}\"}} {uptime}\n\
             # HELP eyeflow_ws_connected 1 if WebSocket link to CENTRAL is up\n\
             # TYPE eyeflow_ws_connected gauge\n\
             eyeflow_ws_connected{{node_id=\"{node_id}\"}} {ws}\n\
             # HELP eyeflow_offline_buffer_depth Events queued in offline buffer\n\
             # TYPE eyeflow_offline_buffer_depth gauge\n\
             eyeflow_offline_buffer_depth{{node_id=\"{node_id}\"}} {offline}\n\
             # HELP eyeflow_executions_total Total IR executions\n\
             # TYPE eyeflow_executions_total counter\n\
             eyeflow_executions_total{{node_id=\"{node_id}\"}} {total}\n\
             # HELP eyeflow_executions_failed Total failed IR executions\n\
             # TYPE eyeflow_executions_failed counter\n\
             eyeflow_executions_failed{{node_id=\"{node_id}\"}} {failed}\n\
             # HELP eyeflow_execution_avg_ms Average IR execution duration (ms)\n\
             # TYPE eyeflow_execution_avg_ms gauge\n\
             eyeflow_execution_avg_ms{{node_id=\"{node_id}\"}} {avg_ms}\n",
        )
    }
}

// ── HTTP server ───────────────────────────────────────────────────────────────

/// Start the HealthMonitor HTTP server on `0.0.0.0:{port}`.
///
/// This is a minimal async HTTP/1.1 server built directly on
/// `tokio::net::TcpListener` — no additional dependencies required.
///
/// Spawn in main with:
/// ```
/// tokio::spawn(health::run(health_state.clone(), config.health_port));
/// ```
pub async fn run(state: Arc<HealthState>, port: u16) -> Result<()> {
    let addr = format!("0.0.0.0:{port}");
    let listener = TcpListener::bind(&addr).await?;
    info!("[Health] HTTP server listening on http://{addr}");

    loop {
        match listener.accept().await {
            Ok((mut socket, peer)) => {
                let state = state.clone();
                tokio::spawn(async move {
                    // Read request line (we only care about the path)
                    let mut buf = [0u8; 512];
                    let n = match socket.read(&mut buf).await {
                        Ok(n) if n > 0 => n,
                        _ => return,
                    };

                    let req = std::str::from_utf8(&buf[..n]).unwrap_or("");
                    let path = req
                        .lines()
                        .next()
                        .and_then(|l| l.split_whitespace().nth(1))
                        .unwrap_or("/health");

                    let (status, content_type, body) = match path {
                        "/metrics" => (
                            "200 OK",
                            "text/plain; version=0.0.4; charset=utf-8",
                            state.to_prometheus(),
                        ),
                        "/ready" => {
                            if state.is_healthy() {
                                ("200 OK", "application/json", r#"{"ready":true}"#.into())
                            } else {
                                ("503 Service Unavailable", "application/json", r#"{"ready":false}"#.into())
                            }
                        }
                        _ => (
                            "200 OK",
                            "application/json",
                            state.to_json(),
                        ),
                    };

                    let response = format!(
                        "HTTP/1.1 {status}\r\nContent-Type: {ct}\r\nContent-Length: {len}\r\nConnection: close\r\n\r\n{body}",
                        status = status,
                        ct     = content_type,
                        len    = body.len(),
                        body   = body,
                    );

                    if let Err(e) = socket.write_all(response.as_bytes()).await {
                        debug!("[Health] write error for {peer}: {e}");
                    }
                });
            }
            Err(e) => {
                warn!("[Health] accept error: {e}");
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        }
    }
}
