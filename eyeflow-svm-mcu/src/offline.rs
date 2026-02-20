/*! eyeflow-svm-mcu::offline — Flash-backed offline action buffer
 *
 * Spec §8.4 / §15 — Resilience at the MCU level
 *
 * When the USART link to the edge node is unavailable, action results and
 * telemetry reports are queued here in SRAM (heapless ring buffer).
 * When the link is restored, the flush_pending() method drains the queue
 * back to the edge node.
 *
 * For larger MCUs with external SPI flash, the same API is intended to
 * back the queue with persistent flash storage (feature = "spi-flash-buf").
 * The fallback in this implementation is pure SRAM.
 *
 * Queue layout:
 *   Each entry = 4 bytes:
 *     [0]     type  : u8  (0x01 = REPORT, 0x02 = ACTION_RESULT)
 *     [1]     flags : u8  (0x01 = urgent)
 *     [2..3]  value : u16 BE
 *
 * Capacity: 128 entries × 4 bytes = 512 bytes (heapless SRAM ring)
 * When full, oldest entries are dropped (tail overwrites head) — spec §8.4:
 * "MCU MUST NOT block on offline buffer overflow."
 */

use heapless::Deque;
use defmt;

// ── Constants ─────────────────────────────────────────────────────────────────

/// Number of offline entries that fit in SRAM.
const OFFLINE_CAPACITY: usize = 128;

/// Bytes per entry.
const ENTRY_LEN: usize = 4;

// ── Entry types ───────────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, defmt::Format)]
#[repr(u8)]
pub enum EntryType {
    Report       = 0x01,
    ActionResult = 0x02,
}

#[derive(Clone, Copy, Debug, defmt::Format)]
pub struct OfflineEntry {
    pub entry_type: EntryType,
    pub flags:      u8,
    pub value:      u16,
}

impl OfflineEntry {
    fn to_bytes(self) -> [u8; ENTRY_LEN] {
        let v = self.value.to_be_bytes();
        [self.entry_type as u8, self.flags, v[0], v[1]]
    }

    fn from_bytes(b: [u8; ENTRY_LEN]) -> Self {
        let entry_type = match b[0] {
            0x01 => EntryType::Report,
            _    => EntryType::ActionResult,
        };
        OfflineEntry {
            entry_type,
            flags: b[1],
            value: u16::from_be_bytes([b[2], b[3]]),
        }
    }
}

// ── OfflineBuffer ─────────────────────────────────────────────────────────────

pub struct OfflineBuffer {
    queue: Deque<OfflineEntry, OFFLINE_CAPACITY>,
    /// Total entries dropped due to overflow.
    dropped: u32,
    /// Whether the edge-link is currently considered available.
    link_up: bool,
}

impl OfflineBuffer {
    pub fn new() -> Self {
        Self {
            queue:   Deque::new(),
            dropped: 0,
            link_up: false,
        }
    }

    /// Set the link state. Called by edge_link_task on connect/disconnect.
    pub fn set_link_up(&mut self, up: bool) {
        self.link_up = up;
        if up {
            defmt::info!("[Offline] Link up — {} entries pending flush", self.queue.len());
        } else {
            defmt::warn!("[Offline] Link down — buffering mode active");
        }
    }

    /// Enqueue a telemetry report value.
    pub async fn enqueue_report(&mut self, value: u16) {
        self.push(OfflineEntry {
            entry_type: EntryType::Report,
            flags: 0x00,
            value,
        });
    }

    /// Enqueue an action result.
    pub async fn enqueue_action_result(&mut self, value: u16, urgent: bool) {
        self.push(OfflineEntry {
            entry_type: EntryType::ActionResult,
            flags: if urgent { 0x01 } else { 0x00 },
            value,
        });
    }

    /// Flush all pending entries over the USART link (if link is up).
    ///
    /// In a real implementation this would write to the USART channel.
    /// Stubbed here because the concrete USART handle is not passed in.
    /// Production code should inject a `&mut Uart` or a heapless channel.
    pub async fn flush_pending(&mut self) {
        if !self.link_up {
            defmt::trace!("[Offline] flush_pending called but link is down");
            return;
        }

        let count = self.queue.len();
        if count == 0 {
            return;
        }

        defmt::info!("[Offline] Flushing {} queued entries", count);

        while let Some(entry) = self.queue.pop_front() {
            let bytes = entry.to_bytes();
            // TODO: inject USART handle or signal via channel
            defmt::debug!(
                "[Offline] Flush entry: type={} flags={} value={}",
                entry.entry_type, entry.flags, entry.value
            );
            // In production: uart.write(&bytes).await;
            let _ = bytes; // prevent unused warning
        }

        if self.dropped > 0 {
            defmt::warn!("[Offline] {} entries were dropped due to buffer overflow", self.dropped);
            self.dropped = 0;
        }
    }

    /// Returns the number of queued entries.
    pub fn pending(&self) -> usize {
        self.queue.len()
    }

    /// Returns the total number of dropped entries since last flush.
    pub fn dropped(&self) -> u32 {
        self.dropped
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    fn push(&mut self, entry: OfflineEntry) {
        if self.queue.push_back(entry).is_err() {
            // Buffer full — drop the oldest entry (ring overflow policy: §8.4)
            self.queue.pop_front();
            self.dropped += 1;
            defmt::warn!(
                "[Offline] Buffer full — dropped oldest entry (total dropped: {})",
                self.dropped
            );
            // Retry (will always succeed after making room)
            let _ = self.queue.push_back(entry);
        }
    }
}
