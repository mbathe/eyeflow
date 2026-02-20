/**
 * Cron Trigger Driver  — example driver (spec §7 + existing CronTriggerService)
 *
 * Schedules a recurring trigger using a lightweight built-in cron parser
 * (same approach as CronTriggerService — no external cron library required).
 *
 * Supported tiers : CENTRAL, LINUX
 * Required protocol: (none — local scheduler)
 *
 * Config shape:
 * {
 *   expression : string     — cron expression, e.g. "0 * * * *" (every hour)
 *   timezone?  : string     — IANA timezone, e.g. "Europe/Paris"
 *   label?     : string     — human-readable label
 * }
 */

import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import {
  ITriggerDriver,
  TriggerEvent,
} from '../interfaces/trigger-driver.interface';
import { NodeTier } from '../../nodes/interfaces/node-capability.interface';

// ── Config ────────────────────────────────────────────────────────────────

interface CronDriverConfig {
  expression: string;
  timezone?:  string;
  label?:     string;
}

// ── Driver ────────────────────────────────────────────────────────────────

@Injectable()
export class CronTriggerDriver implements ITriggerDriver {
  readonly driverId    = 'cron';
  readonly displayName = 'Scheduled Cron Trigger';
  readonly supportedTiers: NodeTier[] = [NodeTier.CENTRAL, NodeTier.LINUX];
  readonly configSchema = {
    expression: { type: 'string', required: true,  example: '0 9 * * 1-5' },
    timezone:   { type: 'string', required: false, example: 'Europe/Paris' },
    label:      { type: 'string', required: false },
  };
  readonly requiredProtocols: string[] = [];

  private readonly logger = new Logger(CronTriggerDriver.name);
  private readonly activations = new Map<string, {
    stop$: Subject<void>;
    timer: NodeJS.Timeout | null;
  }>();

  activate(
    activationId: string,
    config: Record<string, any>,
    workflowId: string,
    version: number,
  ): Observable<TriggerEvent> {
    const cfg     = config as CronDriverConfig;
    const stop$   = new Subject<void>();
    const subject = new Subject<TriggerEvent>();

    if (!cfg.expression || cfg.expression.trim().split(/\s+/).length < 5) {
      this.logger.error(`[Cron:${activationId.slice(0, 8)}] Invalid cron expression: "${cfg.expression}"`);
      return new Observable(o => o.error(new Error(`Invalid cron expression: ${cfg.expression}`)));
    }

    const entry: { stop$: Subject<void>; timer: NodeJS.Timeout | null } =
      { stop$, timer: null };
    this.activations.set(activationId, entry);

    const scheduleNext = () => {
      const msUntilNext = this._msUntilNextFire(cfg.expression, cfg.timezone);
      if (msUntilNext < 0) {
        this.logger.warn(`[Cron:${activationId.slice(0, 8)}] Cannot compute next fire`);
        return;
      }

      const t = setTimeout(() => {
        if (!this.activations.has(activationId)) return;
        const event: TriggerEvent = {
          eventId:         uuidv4(),
          occurredAt:      new Date().toISOString(),
          driverId:        this.driverId,
          workflowId,
          workflowVersion: version,
          payload: {
            expression: cfg.expression,
            label:      cfg.label ?? 'cron',
            firedAt:    new Date().toISOString(),
          },
          source: { expression: cfg.expression },
        };
        subject.next(event);
        scheduleNext();
      }, msUntilNext);

      if ((t as any).unref) (t as any).unref();
      entry.timer = t;
    };

    scheduleNext();

    this.logger.log(
      `[Cron:${activationId.slice(0, 8)}] Scheduled: "${cfg.expression}"` +
      (cfg.timezone ? ` (${cfg.timezone})` : ''),
    );

    stop$.subscribe(() => {
      if (entry.timer) clearTimeout(entry.timer);
      subject.complete();
    });

    return subject.asObservable().pipe(takeUntil(stop$));
  }

  deactivate(activationId: string): void {
    const entry = this.activations.get(activationId);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.stop$.next();
    entry.stop$.complete();
    this.activations.delete(activationId);
    this.logger.log(`[Cron] Deactivated: ${activationId}`);
  }

  deactivateAll(): void {
    for (const id of this.activations.keys()) this.deactivate(id);
  }

  isHealthy(): boolean {
    return true;
  }

  // ── Lightweight cron math (same logic as CronTriggerService) ────────────

  private _msUntilNextFire(expression: string, timezone?: string): number {
    try {
      const fields = expression.trim().split(/\s+/);
      if (fields.length < 5) return -1;

      const [minuteField, hourField, , , dowField] = fields;
      const tz    = timezone ?? 'UTC';
      const now   = new Date();
      const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));

      const candidate = new Date(local);
      candidate.setSeconds(0);
      candidate.setMilliseconds(0);

      for (let advance = 0; advance < 10_080; advance++) {
        if (advance > 0) candidate.setMinutes(candidate.getMinutes() + 1);
        if (candidate <= now) continue;

        const m   = candidate.getMinutes();
        const h   = candidate.getHours();
        const dow = candidate.getDay();

        const minOk  = this._matchField(minuteField, m);
        const hourOk = this._matchField(hourField, h);
        const dowOk  = dowField === '*' || this._parseDow(dowField).includes(dow);

        if (minOk && hourOk && dowOk) {
          return candidate.getTime() - now.getTime();
        }
      }

      return -1;
    } catch {
      return -1;
    }
  }

  private _matchField(field: string, value: number): boolean {
    if (field === '*') return true;
    if (field.startsWith('*/')) return value % parseInt(field.slice(2), 10) === 0;
    if (field.includes('-')) {
      const [start, end] = field.split('-').map(Number);
      return value >= start && value <= end;
    }
    return field.split(',').map(Number).includes(value);
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
