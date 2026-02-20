/// Offline Buffer — spec §8.3
///
/// NDJSON-backed persistent queue that accumulates events when the central
/// WebSocket connection is down.  On reconnect, the caller drains the buffer
/// and, on successful delivery, removes the flushed entries from disk.
///
/// This mirrors the NestJS `OfflineBufferService` (295 lines) in Rust.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tracing::{debug, info, warn};

use crate::audit::AuditEvent;

// ── Event envelope ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BufferedEvent {
    AuditEvent {
        payload: AuditEvent,
        enqueued_at: String,
    },
    ExecutionResult {
        payload: serde_json::Value,
        enqueued_at: String,
    },
    TriggerFire {
        payload: serde_json::Value,
        enqueued_at: String,
    },
}

impl BufferedEvent {
    fn timestamp() -> String {
        chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
    }

    pub fn from_audit(ev: AuditEvent) -> Self {
        Self::AuditEvent { payload: ev, enqueued_at: Self::timestamp() }
    }

    pub fn from_execution(result: serde_json::Value) -> Self {
        Self::ExecutionResult { payload: result, enqueued_at: Self::timestamp() }
    }

    pub fn from_trigger(fire: serde_json::Value) -> Self {
        Self::TriggerFire { payload: fire, enqueued_at: Self::timestamp() }
    }
}

// ── Buffer ────────────────────────────────────────────────────────────────────

pub struct OfflineBuffer {
    queue: VecDeque<BufferedEvent>,
    path: PathBuf,
    max_size: usize,
    is_online: bool,
}

impl OfflineBuffer {
    /// Create a new buffer.  The NDJSON file at `path` is created on first
    /// write; if it already exists the queue is restored from it on `load()`.
    pub fn new(path: impl Into<PathBuf>, max_size: usize) -> Self {
        Self {
            queue: VecDeque::new(),
            path: path.into(),
            max_size,
            is_online: false,
        }
    }

    // ── Connectivity notifications ────────────────────────────────────────────

    /// Signal connectivity change to the buffer.
    pub fn notify_connected(&mut self, online: bool) {
        if self.is_online != online {
            info!("[OfflineBuffer] connectivity → {}", if online { "ONLINE" } else { "OFFLINE" });
        }
        self.is_online = online;
    }

    pub fn is_buffering(&self) -> bool {
        !self.is_online
    }

    // ── Enqueue ───────────────────────────────────────────────────────────────

    pub fn enqueue_audit_event(&mut self, event: AuditEvent) {
        self.push(BufferedEvent::from_audit(event));
    }

    pub fn enqueue_execution_result(&mut self, result: serde_json::Value) {
        self.push(BufferedEvent::from_execution(result));
    }

    pub fn enqueue_trigger_fire(&mut self, fire: serde_json::Value) {
        self.push(BufferedEvent::from_trigger(fire));
    }

    fn push(&mut self, event: BufferedEvent) {
        if self.queue.len() >= self.max_size {
            warn!(
                "[OfflineBuffer] max_size={} reached — dropping oldest event",
                self.max_size
            );
            self.queue.pop_front();
        }
        debug!("[OfflineBuffer] enqueued (queue_len={})", self.queue.len() + 1);
        self.queue.push_back(event);
    }

    // ── Drain / flush ─────────────────────────────────────────────────────────

    /// Drain all queued events for flushing.  The caller is responsible for
    /// calling `confirm_flushed(count)` after successful delivery.
    pub fn drain_for_flush(&mut self) -> Vec<BufferedEvent> {
        self.queue.drain(..).collect()
    }

    /// Return a snapshot without consuming the queue.
    pub fn snapshot(&self) -> Vec<&BufferedEvent> {
        self.queue.iter().collect()
    }

    pub fn len(&self) -> usize {
        self.queue.len()
    }

    pub fn is_empty(&self) -> bool {
        self.queue.is_empty()
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    /// Persist the entire queue to an NDJSON file (one JSON object per line).
    /// Atomically replaces the existing file to avoid corruption.
    pub async fn persist(&self) -> Result<()> {
        if self.queue.is_empty() {
            // Truncate file if queue emptied
            if self.path.exists() {
                fs::write(&self.path, b"").await?;
            }
            return Ok(());
        }

        // Write to a temp file, then rename
        let tmp = self.path.with_extension("ndjson.tmp");
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&tmp)
            .await?;

        for event in &self.queue {
            let mut line = serde_json::to_string(event)?;
            line.push('\n');
            file.write_all(line.as_bytes()).await?;
        }
        file.flush().await?;
        drop(file);
        fs::rename(&tmp, &self.path).await?;

        info!("[OfflineBuffer] persisted {} events to {:?}", self.queue.len(), self.path);
        Ok(())
    }

    /// Load queue from NDJSON file (called on startup to restore state after crash).
    pub async fn load(&mut self) -> Result<usize> {
        if !self.path.exists() {
            return Ok(0);
        }
        let content = fs::read_to_string(&self.path).await?;
        let mut count = 0usize;
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            match serde_json::from_str::<BufferedEvent>(line) {
                Ok(event) => {
                    self.queue.push_back(event);
                    count += 1;
                }
                Err(e) => {
                    warn!("[OfflineBuffer] Skipping unreadable line: {e}");
                }
            }
            if self.queue.len() >= self.max_size {
                warn!("[OfflineBuffer] max_size reached during load — truncating");
                break;
            }
        }
        info!("[OfflineBuffer] loaded {} events from {:?}", count, self.path);
        Ok(count)
    }

    /// Delete the persistence file (after confirmed delivery).
    pub async fn clear_disk(&self) -> Result<()> {
        if self.path.exists() {
            fs::remove_file(&self.path).await?;
        }
        Ok(())
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Ensure the parent directory for `path` exists.
pub async fn ensure_parent(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).await?;
        }
    }
    Ok(())
}
