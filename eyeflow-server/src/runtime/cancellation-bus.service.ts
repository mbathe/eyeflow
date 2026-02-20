/**
 * Cancellation Bus Service — spec §9.2
 *
 * Implements the `cancel_rx` channel described in spec §9.2:
 *   "async fn execute_with_cancellation_window(cancel_rx: Receiver<()>)"
 *
 * Uses Redis pub/sub (node-redis v5) so that any authorised client
 * (WebSocket gateway, CLI, admin UI) can cancel a pending physical action
 * during the cancellation window.
 *
 * Channel naming convention:
 *   eyeflow:cancel:<executionId>
 *   eyeflow:cancel:<target>:<command>
 *
 * Publish a cancellation:
 *   PUBLISH eyeflow:cancel:<executionId> "CANCEL"
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CancellationRegistration {
  executionId: string;
  channel: string;
  resolve: (cancelled: boolean) => void;
  timeout: ReturnType<typeof setTimeout>;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class CancellationBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CancellationBusService.name);

  private publisher!: RedisClientType;
  private subscriber!: RedisClientType;
  private connected = false;

  /** Active registrations waiting for cancellation signal or timeout */
  private pending = new Map<string, CancellationRegistration>();

  // ── Module lifecycle ──────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

    if (process.env.CANCELLATION_BUS_DISABLED === 'true') {
      this.logger.warn(
        '[CancellationBus] Disabled (CANCELLATION_BUS_DISABLED=true) — ' +
        'cancellation window will use local timer fallback'
      );
      return;
    }

    try {
      this.publisher  = createClient({ url: redisUrl }) as RedisClientType;
      this.subscriber = createClient({ url: redisUrl }) as RedisClientType;

      this.publisher.on('error',  err => this.logger.error(`[CancellationBus] Publisher error: ${err?.message}`));
      this.subscriber.on('error', err => this.logger.error(`[CancellationBus] Subscriber error: ${err?.message}`));

      await Promise.all([this.publisher.connect(), this.subscriber.connect()]);

      this.connected = true;
      this.logger.log(`[CancellationBus] Connected to Redis (${redisUrl})`);
    } catch (err: any) {
      this.logger.warn(
        `[CancellationBus] Could not connect to Redis — ` +
        `cancellation window will fall back to local timer: ${err?.message}`
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Resolve all pending with false (no cancellation)
    for (const reg of this.pending.values()) {
      clearTimeout(reg.timeout);
      reg.resolve(false);
    }
    this.pending.clear();

    try {
      if (this.subscriber?.isOpen) await this.subscriber.unsubscribe();
      if (this.subscriber?.isOpen) await this.subscriber.quit();
      if (this.publisher?.isOpen)  await this.publisher.quit();
    } catch { /* ignore disconnect errors */ }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Wait up to `windowMs` for a CANCEL signal on the Redis channel.
   *
   * Returns `true` if the action was cancelled (caller should abort),
   * `false` if the window expired normally (caller should proceed).
   *
   * @param executionId  Unique identifier for this execution (UUID)
   * @param target       Physical target (e.g. "vanne_V3")
   * @param command      Physical command (e.g. "CLOSE")
   * @param windowMs     Cancellation window duration in milliseconds
   */
  async waitForCancellation(
    executionId: string,
    target: string,
    command: string,
    windowMs: number,
  ): Promise<boolean> {
    // Fallback: no Redis — use plain timer with no cancellation capability
    if (!this.connected) {
      this.logger.debug(
        `[CancellationBus] Fallback timer for ${command}@${target} (${windowMs}ms)`
      );
      await new Promise(resolve => setTimeout(resolve, windowMs));
      return false;
    }

    const channel = `eyeflow:cancel:${executionId}`;

    return new Promise<boolean>((resolve) => {
      // Safety timeout — window expires → proceed
      const timeout = setTimeout(async () => {
        this.pending.delete(executionId);
        try {
          await this.subscriber.unsubscribe(channel);
        } catch { /* ignore */ }
        this.logger.debug(
          `[CancellationBus] Window expired for ${command}@${target} — proceeding`
        );
        resolve(false);
      }, windowMs);

      const reg: CancellationRegistration = { executionId, channel, resolve, timeout };
      this.pending.set(executionId, reg);

      // Subscribe and listen
      this.subscriber.subscribe(channel, (message: string) => {
        if (message.trim().toUpperCase() === 'CANCEL') {
          clearTimeout(timeout);
          this.pending.delete(executionId);
          void this.subscriber.unsubscribe(channel);
          this.logger.log(
            `[CancellationBus] CANCEL received for ${command}@${target} (exec: ${executionId})`
          );
          resolve(true);
        }
      }).catch(err => {
        this.logger.error(`[CancellationBus] Subscribe error: ${err?.message}`);
        clearTimeout(timeout);
        this.pending.delete(executionId);
        resolve(false);
      });
    });
  }

  /**
   * Publish a CANCEL signal for a given execution.
   * Can be called from AdminController, WebSocket gateway, or CLI.
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    if (!this.connected) {
      this.logger.warn('[CancellationBus] Cannot cancel — not connected to Redis');
      return false;
    }

    const channel = `eyeflow:cancel:${executionId}`;
    await this.publisher.publish(channel, 'CANCEL');
    this.logger.log(`[CancellationBus] Published CANCEL on ${channel}`);
    return true;
  }

  /**
   * Cancel all pending executions for a given target (emergency stop).
   */
  async emergencyStop(target: string): Promise<number> {
    if (!this.connected) return 0;

    let cancelled = 0;
    for (const reg of this.pending.values()) {
      if (reg.channel.includes(target)) {
        await this.publisher.publish(reg.channel, 'CANCEL');
        cancelled++;
      }
    }

    this.logger.warn(`[CancellationBus] EMERGENCY STOP: cancelled ${cancelled} pending action(s) for target '${target}'`);
    return cancelled;
  }

  /** List currently pending execution IDs awaiting cancellation window */
  getPendingExecutions(): string[] {
    return Array.from(this.pending.keys());
  }
}
