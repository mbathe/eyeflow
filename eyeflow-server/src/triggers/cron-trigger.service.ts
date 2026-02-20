/**
 * Cron Trigger Service — spec §7 "Cron / Schedule"
 *
 * Implements cron expression-based workflow triggering.
 * Each registered schedule fires a callback at the appropriate time,
 * creating an AgentMission that enters the standard compilation/execution pipeline.
 *
 * Compatible with standard cron expression (5 or 6 fields):
 *   "0 9 * * 1-5"    = weekdays at 9:00
 *   "STAR/15 * * * *" = every 15 minutes  (use * slash N in real expressions)
 *
 * Uses the Node.js built-in setTimeout loop (no external cron library required).
 * For production, integrate with BullMQ repeatable jobs (spec 16.3 BullMQ).
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

export interface CronSchedule {
  id: string;
  /** Standard cron expression (5 fields: min hour day month weekday) */
  expression: string;
  /** Human-readable label */
  label: string;
  /** Workflow task ID to trigger */
  taskId: string;
  /** Optional parameters to pass as user input */
  params?: Record<string, any>;
  /** Timezone (IANA), default UTC */
  timezone?: string;
  /** Whether this schedule is currently active */
  enabled: boolean;
}

export interface CronFireEvent {
  scheduleId: string;
  taskId: string;
  firedAt: Date;
  params?: Record<string, any>;
}

type CronFireCallback = (event: CronFireEvent) => void | Promise<void>;

@Injectable()
export class CronTriggerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CronTriggerService.name);

  private schedules = new Map<string, CronSchedule>();
  private timers    = new Map<string, NodeJS.Timeout>();
  private callbacks: CronFireCallback[] = [];

  onModuleInit() {
    this.logger.log('[CronTrigger] Service initialized — schedules will be loaded from DB');
  }

  onModuleDestroy() {
    this._clearAll();
    this.logger.log('[CronTrigger] All schedules cleared');
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Register a callback to receive cron fire events */
  onFire(callback: CronFireCallback): void {
    this.callbacks.push(callback);
  }

  /** Add or replace a schedule */
  register(schedule: CronSchedule): void {
    this.schedules.set(schedule.id, schedule);
    if (schedule.enabled) {
      this._scheduleNext(schedule);
    }
    this.logger.log(
      `[CronTrigger] Registered "${schedule.label}" (${schedule.expression}) → task ${schedule.taskId}`
    );
  }

  /** Remove a schedule */
  unregister(scheduleId: string): void {
    const timer = this.timers.get(scheduleId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(scheduleId);
    }
    this.schedules.delete(scheduleId);
    this.logger.log(`[CronTrigger] Unregistered schedule ${scheduleId}`);
  }

  /** Enable or disable a schedule without removing it */
  setEnabled(scheduleId: string, enabled: boolean): void {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) return;
    schedule.enabled = enabled;
    if (!enabled) {
      const timer = this.timers.get(scheduleId);
      if (timer) { clearTimeout(timer); this.timers.delete(scheduleId); }
    } else {
      this._scheduleNext(schedule);
    }
  }

  /** List all registered schedules */
  listSchedules(): CronSchedule[] {
    return [...this.schedules.values()];
  }

  /** Manually fire a schedule (for testing) */
  async manualFire(scheduleId: string): Promise<void> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) throw new Error(`Schedule ${scheduleId} not found`);
    await this._fire(schedule);
  }

  // ── Private scheduling logic ──────────────────────────────────────────────

  private _scheduleNext(schedule: CronSchedule): void {
    const msUntilNext = this._msUntilNextFire(schedule.expression, schedule.timezone);

    if (msUntilNext < 0) {
      this.logger.warn(`[CronTrigger] Cannot compute next fire for "${schedule.expression}"`);
      return;
    }

    const timer = setTimeout(async () => {
      if (!schedule.enabled) return; // may have been disabled during sleep
      await this._fire(schedule);
      // Re-schedule for the next occurrence
      this._scheduleNext(schedule);
    }, msUntilNext);

    // Allow process to exit even with pending timers
    if (timer.unref) timer.unref();

    this.timers.set(schedule.id, timer);
    this.logger.debug(
      `[CronTrigger] "${schedule.label}" fires in ${Math.round(msUntilNext / 1000)}s`
    );
  }

  private async _fire(schedule: CronSchedule): Promise<void> {
    const event: CronFireEvent = {
      scheduleId: schedule.id,
      taskId:     schedule.taskId,
      firedAt:    new Date(),
      params:     schedule.params,
    };

    this.logger.log(
      `[CronTrigger] FIRED "${schedule.label}" → task ${schedule.taskId} at ${event.firedAt.toISOString()}`
    );

    for (const cb of this.callbacks) {
      try {
        await cb(event);
      } catch (err: any) {
        this.logger.error(`[CronTrigger] Callback error for "${schedule.label}": ${err.message}`);
      }
    }
  }

  private _clearAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  /**
   * Compute milliseconds until the next cron fire.
   * Parses a 5-field cron expression: min hour dom month dow
   *
   * This is a lightweight parser — for production use BullMQ's cron support
   * (spec §16.3) which uses a full-featured cron parser.
   */
  private _msUntilNextFire(expression: string, timezone?: string): number {
    try {
      const fields = expression.trim().split(/\s+/);
      if (fields.length < 5) return -1;

      const [minuteField, hourField, , , dowField] = fields;

      // Get current time in target timezone
      const tz  = timezone ?? 'UTC';
      const now = new Date();
      const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));

      const currentMin  = local.getMinutes();
      const currentHour = local.getHours();
      const currentDow  = local.getDay(); // 0=Sun

      // Parse each field (only handle simple values and */N patterns for now)
      const nextMin  = this._nextValue(minuteField,  currentMin,  0, 59);
      const nextHour = this._nextValue(hourField,     currentHour, 0, 23);
      const nextDow  = dowField !== '*' ? this._parseDow(dowField) : null;

      // Build the candidate date
      const candidate = new Date(local);
      candidate.setSeconds(0);
      candidate.setMilliseconds(0);

      // Simple heuristic: advance minute until all conditions are met
      for (let advance = 0; advance < 10080; advance++) { // max 1 week lookahead in minutes
        candidate.setMinutes(candidate.getMinutes() + (advance === 0 ? 0 : 1));

        const m   = candidate.getMinutes();
        const h   = candidate.getHours();
        const dow = candidate.getDay();

        if (advance === 0 && candidate <= now) {
          candidate.setMinutes(candidate.getMinutes() + 1);
          continue;
        }

        const minOk  = this._matchField(minuteField,  m);
        const hourOk = this._matchField(hourField,     h);
        const dowOk  = nextDow === null || nextDow.includes(dow);

        if (minOk && hourOk && dowOk) {
          return candidate.getTime() - now.getTime();
        }
      }

      return -1; // Could not compute
    } catch {
      return -1;
    }
  }

  private _matchField(field: string, value: number): boolean {
    if (field === '*') return true;
    if (field.startsWith('*/')) {
      const step = parseInt(field.slice(2));
      return value % step === 0;
    }
    const values = field.split(',').map(Number);
    return values.includes(value);
  }

  private _nextValue(field: string, current: number, min: number, max: number): number {
    if (field === '*') return current;
    if (field.startsWith('*/')) {
      const step = parseInt(field.slice(2));
      for (let v = current; v <= max; v++) { if (v % step === 0) return v; }
      return min;
    }
    const values = field.split(',').map(Number).sort((a, b) => a - b);
    return values.find(v => v >= current) ?? values[0];
  }

  private _parseDow(field: string): number[] {
    if (field === '*') return [0, 1, 2, 3, 4, 5, 6];
    if (field.includes('-')) {
      const [start, end] = field.split('-').map(Number);
      return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }
    return field.split(',').map(Number);
  }
}
