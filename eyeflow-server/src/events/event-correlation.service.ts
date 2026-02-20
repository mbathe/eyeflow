/**
 * EventCorrelationService
 *
 * Manages the temporal correlation windows for EventStateMachine instances.
 *
 * Responsibility: start, cancel, and fire expiry callbacks for the time-bounded
 * windows compiled into ESM descriptors (e.g. "all conditions within 10 minutes").
 *
 * Design decisions:
 * – Pure timeout management: no FSM logic here.
 * – Callback-based expiry: avoids circular injection between this service
 *   and EventStateMachineService.
 * – One window per FSM instance (instanceId): if the same FSM fires multiple
 *   times in parallel (unlikely but possible), each execution is distinct.
 */

import { Injectable, Logger } from '@nestjs/common';

export interface WindowEntry {
  instanceId: string;
  machineId: string;
  startedAt: Date;
  expiresAt: Date;
  windowMs: number;
  handle: ReturnType<typeof setTimeout>;
}

@Injectable()
export class EventCorrelationService {
  private readonly logger = new Logger(EventCorrelationService.name);

  /** Active window timers keyed by instanceId */
  private readonly windows = new Map<string, WindowEntry>();

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Start a correlation window for `instanceId`.
   * After `windowMs` milliseconds, calls `onExpired(instanceId)`.
   *
   * If a window already exists for this instanceId, it is silently ignored
   * (idempotent — the FSM should not start the window twice).
   */
  startWindow(
    instanceId: string,
    machineId: string,
    windowMs: number,
    onExpired: (instanceId: string) => void,
  ): WindowEntry {
    if (this.windows.has(instanceId)) {
      this.logger.warn(
        `[Correlation] Window already active for instance "${instanceId}" — ignoring duplicate start`,
      );
      return this.windows.get(instanceId)!;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + windowMs);

    const handle = setTimeout(() => {
      this.windows.delete(instanceId);
      this.logger.log(
        `[Correlation] Window EXPIRED for FSM "${machineId}" instance "${instanceId}" ` +
        `after ${windowMs}ms`,
      );
      onExpired(instanceId);
    }, windowMs);

    const entry: WindowEntry = {
      instanceId,
      machineId,
      startedAt: now,
      expiresAt,
      windowMs,
      handle,
    };

    this.windows.set(instanceId, entry);
    this.logger.log(
      `[Correlation] Window STARTED for FSM "${machineId}" instance "${instanceId}" ` +
      `expires in ${windowMs}ms at ${expiresAt.toISOString()}`,
    );
    return entry;
  }

  /**
   * Cancel an active window (e.g. FULL_MATCH was reached before expiry).
   * Returns true if a window was found and cancelled, false if none existed.
   */
  cancelWindow(instanceId: string): boolean {
    const entry = this.windows.get(instanceId);
    if (!entry) return false;

    clearTimeout(entry.handle);
    this.windows.delete(instanceId);
    const remainingMs = entry.expiresAt.getTime() - Date.now();
    this.logger.log(
      `[Correlation] Window CANCELLED for FSM "${entry.machineId}" instance "${instanceId}" ` +
      `(${remainingMs}ms remaining)`,
    );
    return true;
  }

  /**
   * Returns true if a window is currently active and unexpired for `instanceId`.
   */
  isWindowActive(instanceId: string): boolean {
    const entry = this.windows.get(instanceId);
    if (!entry) return false;
    return Date.now() < entry.expiresAt.getTime();
  }

  /**
   * Returns remaining time in ms for the active window, or 0 if expired/none.
   */
  remainingMs(instanceId: string): number {
    const entry = this.windows.get(instanceId);
    if (!entry) return 0;
    return Math.max(0, entry.expiresAt.getTime() - Date.now());
  }

  /** Retrieve the window entry (useful for serializing into PropagatedEvent.timeWindow) */
  getWindow(instanceId: string): WindowEntry | undefined {
    return this.windows.get(instanceId);
  }

  /** Cancel all active windows (clean shutdown) */
  cancelAll(): void {
    for (const [instanceId, entry] of this.windows) {
      clearTimeout(entry.handle);
      this.logger.debug(`[Correlation] Cancelled window for instance "${instanceId}" on shutdown`);
    }
    this.windows.clear();
  }

  /** Summary for health checks / dashboard */
  summary(): { activeWindows: number; entries: Array<{ instanceId: string; machineId: string; expiresAt: string; remainingMs: number }> } {
    const entries = Array.from(this.windows.values()).map(e => ({
      instanceId: e.instanceId,
      machineId: e.machineId,
      expiresAt: e.expiresAt.toISOString(),
      remainingMs: Math.max(0, e.expiresAt.getTime() - Date.now()),
    }));
    return { activeWindows: this.windows.size, entries };
  }
}
