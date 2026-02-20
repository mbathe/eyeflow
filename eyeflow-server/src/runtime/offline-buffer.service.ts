/**
 * Offline Buffer Service — spec §8.3
 *
 * "Le nœud continue d'exécuter les workflows compilés stockés localement,
 *  bufferise en mémoire flash locale les événements (audit, résultats)
 *  et les rejoue dès reconnexion."
 *
 * Buffers audit events and execution results when the central server
 * (Kafka / DB) is unreachable. Flushes automatically on reconnection.
 *
 * Integration points:
 *   - CryptoAuditChainService calls `enqueueAuditEvent()` when writing to DB
 *   - KafkaConsumerService calls `notifyConnected(true|false)` on state change
 *   - On reconnect, `flush()` replays all buffered events in FIFO order
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BufferedEventKind = 'AUDIT' | 'EXECUTION_RESULT' | 'TRIGGER_FIRE';

export interface BufferedEvent {
  id: string;
  kind: BufferedEventKind;
  timestamp: string;   // ISO-8601
  workflowId?: string;
  payload: Record<string, any>;
  retries: number;
}

export type FlushHandler = (events: BufferedEvent[]) => Promise<boolean[]>;

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Path of the local persistence file (simulates "mémoire flash locale").
 * Can be overridden via environment variable OFFLINE_BUFFER_PATH.
 */
const BUFFER_FILE = process.env.OFFLINE_BUFFER_PATH
  ?? path.join(os.tmpdir(), 'eyeflow_offline_buffer.ndjson');

/** Maximum in-memory queue size before oldest entries are dropped */
const MAX_QUEUE_SIZE = parseInt(process.env.OFFLINE_BUFFER_MAX ?? '10000', 10);

/** Retry flush interval in ms when still offline */
const RETRY_INTERVAL_MS = parseInt(process.env.OFFLINE_BUFFER_RETRY_MS ?? '15000', 10);

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class OfflineBufferService implements OnModuleDestroy {
  private readonly logger = new Logger(OfflineBufferService.name);

  /** In-memory FIFO queue — survives transient disconnects without I/O */
  private queue: BufferedEvent[] = [];

  /** Registered flush handlers — called in order when connectivity resumes */
  private flushHandlers: FlushHandler[] = [];

  /** True when the upstream transport (Kafka/DB) is reachable */
  private connected = true;

  private retryTimer?: ReturnType<typeof setInterval>;

  // ── Connectivity management ───────────────────────────────────────────────

  /**
   * Called by KafkaConsumerService (or any transport layer) when
   * connectivity state changes.
   */
  notifyConnected(isConnected: boolean): void {
    const wasConnected = this.connected;
    this.connected = isConnected;

    if (!isConnected && wasConnected) {
      this.logger.warn('[OfflineBuffer] Transport DISCONNECTED — buffering mode ON');
      this._startRetryLoop();
    }

    if (isConnected && !wasConnected) {
      this.logger.log('[OfflineBuffer] Transport RECONNECTED — flushing buffer');
      this._stopRetryLoop();
      void this.flush();
    }
  }

  /** True when currently in offline buffering mode */
  get isBuffering(): boolean {
    return !this.connected;
  }

  // ── Enqueue ───────────────────────────────────────────────────────────────

  /**
   * Enqueue an audit event for deferred delivery.
   * Emits a warning if already connected (caller should write directly).
   */
  enqueueAuditEvent(
    workflowId: string,
    eventType: string,
    payload: Record<string, any>,
  ): void {
    this._enqueue({
      kind: 'AUDIT',
      workflowId,
      payload: { eventType, ...payload },
    });
  }

  /** Enqueue an execution result (slice result, postcondition outcome, etc.) */
  enqueueExecutionResult(
    workflowId: string,
    instructionId: string,
    result: Record<string, any>,
  ): void {
    this._enqueue({
      kind: 'EXECUTION_RESULT',
      workflowId,
      payload: { instructionId, ...result },
    });
  }

  /** Enqueue a trigger fire event (Cron / IMAP / CDC) */
  enqueueTriggerFire(
    workflowId: string,
    triggerType: string,
    data: Record<string, any>,
  ): void {
    this._enqueue({
      kind: 'TRIGGER_FIRE',
      workflowId,
      payload: { triggerType, ...data },
    });
  }

  // ── Flush ─────────────────────────────────────────────────────────────────

  /**
   * Register a handler that will be called during flush.
   * The handler receives the batch of buffered events and must return
   * a boolean[] indicating which events were successfully delivered
   * (true = delivered, false = keep for retry).
   */
  registerFlushHandler(handler: FlushHandler): void {
    this.flushHandlers.push(handler);
  }

  /**
   * Flush the buffer: call all registered handlers with queued events,
   * remove successfully delivered events, persist remaining to disk.
   */
  async flush(): Promise<{ delivered: number; remaining: number }> {
    if (this.queue.length === 0) {
      return { delivered: 0, remaining: 0 };
    }

    const batch = [...this.queue];
    this.logger.log(`[OfflineBuffer] Flushing ${batch.length} buffered event(s)`);

    let deliveredSet = new Set<string>();

    for (const handler of this.flushHandlers) {
      try {
        const results = await handler(batch);
        results.forEach((ok, i) => {
          if (ok) deliveredSet.add(batch[i].id);
        });
      } catch (err: any) {
        this.logger.error(`[OfflineBuffer] Flush handler error: ${err?.message}`);
      }
    }

    const remaining = batch.filter(e => !deliveredSet.has(e.id));
    const deliveredCount = batch.length - remaining.length;

    this.queue = remaining;
    this._persistToDisk();

    this.logger.log(
      `[OfflineBuffer] Flush complete — delivered: ${deliveredCount}, remaining: ${remaining.length}`
    );

    return { delivered: deliveredCount, remaining: remaining.length };
  }

  // ── Status ────────────────────────────────────────────────────────────────

  /** Current buffer length */
  get size(): number {
    return this.queue.length;
  }

  /** List all buffered events (read-only snapshot) */
  getSnapshot(): ReadonlyArray<BufferedEvent> {
    return [...this.queue];
  }

  // ── Persistence (mémoire flash) ───────────────────────────────────────────

  /**
   * Load events persisted to disk from a previous crash or restart.
   * Call once at application startup.
   */
  loadFromDisk(): number {
    try {
      if (!fs.existsSync(BUFFER_FILE)) return 0;
      const lines = fs.readFileSync(BUFFER_FILE, 'utf-8')
        .split('\n')
        .filter(Boolean);
      const loaded: BufferedEvent[] = [];
      for (const line of lines) {
        try { loaded.push(JSON.parse(line)); } catch { /* skip corrupt line */ }
      }
      this.queue.unshift(...loaded); // prepend (older events first)
      this.logger.log(`[OfflineBuffer] Loaded ${loaded.length} event(s) from disk (${BUFFER_FILE})`);
      return loaded.length;
    } catch (err: any) {
      this.logger.warn(`[OfflineBuffer] Could not load buffer from disk: ${err?.message}`);
      return 0;
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  onModuleDestroy(): void {
    this._stopRetryLoop();
    if (this.queue.length > 0) {
      this.logger.warn(
        `[OfflineBuffer] Module destroyed with ${this.queue.length} unsent event(s) — persisting to disk`
      );
      this._persistToDisk();
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _enqueue(partial: Omit<BufferedEvent, 'id' | 'timestamp' | 'retries'>): void {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      // Drop oldest entry (sliding window — spec §8.3: "mémoire flash bornée")
      const dropped = this.queue.shift();
      this.logger.warn(
        `[OfflineBuffer] Queue full (${MAX_QUEUE_SIZE}) — dropped oldest: ${dropped?.id}`
      );
    }

    const event: BufferedEvent = {
      id: `buf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      retries: 0,
      ...partial,
    };

    this.queue.push(event);

    this.logger.debug(
      `[OfflineBuffer] Enqueued ${event.kind} event (total: ${this.queue.length})`
    );
  }

  private _persistToDisk(): void {
    try {
      const ndjson = this.queue.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(BUFFER_FILE, ndjson, 'utf-8');
    } catch (err: any) {
      this.logger.warn(`[OfflineBuffer] Could not persist buffer to disk: ${err?.message}`);
    }
  }

  private _startRetryLoop(): void {
    if (this.retryTimer) return;
    this.retryTimer = setInterval(async () => {
      if (this.connected) {
        this._stopRetryLoop();
        return;
      }
      if (this.queue.length > 0) {
        this.logger.debug(
          `[OfflineBuffer] Retry tick — still offline, ${this.queue.length} event(s) waiting`
        );
      }
    }, RETRY_INTERVAL_MS);
  }

  private _stopRetryLoop(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = undefined;
    }
  }
}
