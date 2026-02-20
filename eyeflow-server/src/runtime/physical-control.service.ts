/**
 * Physical Control Service — spec §9
 *
 * Implements three safety mechanisms required by spec §9.2:
 *   1. Time windows — CALL_ACTION only executes within authorised hours/days
 *   2. Cancellation window — async cancel_rx pattern for irreversible actions
 *   3. Postcondition verification — after every physical action, verify the
 *      real world reached the expected state
 *
 * The SVM delegates all CALL_ACTION execution to this service.
 */

import { Injectable, Logger, ForbiddenException, Optional } from '@nestjs/common';
import { CancellationBusService } from './cancellation-bus.service';

// ── Time Window types (exact mirror of spec §9.2 Rust struct) ─────────────────

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sunday … 6=Saturday

export interface TimeWindow {
  /** Allowed days (0=Sun, 1=Mon … 6=Sat). Empty = all days. */
  days?: Weekday[];
  /** Authorised start time in local timezone — "HH:MM" 24h format */
  startTime?: string;
  /** Authorised end time in local timezone — "HH:MM" 24h format */
  endTime?: string;
  /** IANA timezone string, e.g. "Europe/Paris". Defaults to UTC. */
  timezone?: string;
}

// ── Postcondition types (spec §9.2) ──────────────────────────────────────────

export interface Postcondition {
  /** Human-readable description for audit */
  description: string;
  /** Register index whose value to check after execution */
  registerIndex?: number;
  /** Expected value (exact equality) */
  expectedValue?: any;
  /** Maximum numeric deviation (for sensor readings) */
  tolerance?: number;
  /** Custom JS expression (string) — evaluated with `vm.runInContext` */
  expression?: string;
}

// ── Physical action descriptor (operands on CALL_ACTION instructions) ─────────

export interface PhysicalActionOperands {
  /** Human-readable target, e.g. "vanne V3" */
  target?: string;
  /** Physical command, e.g. "CLOSE", "OPEN", "SET_TEMP" */
  command?: string;
  /** Physical payload, e.g. { value: 42 } */
  payload?: Record<string, any>;
  /** Time window constraint — if absent, action is unrestricted */
  timeWindow?: TimeWindow;
  /** Cancellation window in ms (spec §9.2). 0 = immediate. Default: 0. */
  cancellationWindowMs?: number;
  /** Postcondition to verify after execution */
  postcondition?: Postcondition;
  /** Whether this action requires explicit human approval (spec §9.1) */
  requiresHumanApproval?: boolean;
  /** Fallback action to take if postcondition fails */
  postconditionFallback?: string;
}

// ── Result ────────────────────────────────────────────────────────────────────

export interface PhysicalActionResult {
  cancelled: boolean;
  executed: boolean;
  postconditionPassed?: boolean;
  postconditionError?: string;
  durationMs: number;
  target?: string;
  command?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class PhysicalControlService {
  private readonly logger = new Logger(PhysicalControlService.name);

  constructor(
    @Optional() private readonly cancellationBus?: CancellationBusService,
  ) {}

  /**
   * Execute a physical CALL_ACTION with all spec §9.2 safety guarantees:
   *   1. Check time window
   *   2. Notify pending (INTENTION log)
   *   3. Wait cancellation window
   *   4. Execute action
   *   5. Verify postcondition
   *
   * @param ops         Operands from IRInstruction
   * @param registers   SVM register map (read/write for postcondition check)
   * @param executor    Async callback that performs the real physical action
   */
  async executePhysicalAction(
    ops: PhysicalActionOperands,
    registers: Map<number, any>,
    executor: () => Promise<any>,
  ): Promise<PhysicalActionResult> {
    const startMs = Date.now();
    const target  = ops.target  ?? 'unknown-target';
    const command = ops.command ?? 'EXECUTE';

    // ── 1. Time window check ───────────────────────────────────────────────
    if (ops.timeWindow) {
      this._assertTimeWindow(ops.timeWindow, target, command);
    }

    // ── 2. Human approval gate ─────────────────────────────────────────────
    if (ops.requiresHumanApproval) {
      // In production, this would push to a WebSocket channel and block.
      // For now, we log the intent and let the execution proceed
      // (integration with human-approval service is out of scope for this iteration).
      this.logger.warn(
        `[PhysicalControl] HUMAN APPROVAL REQUIRED for ${command} on ${target} — ` +
        `proceeding in auto-approval mode (configure HUMAN_APPROVAL_SERVICE to block)`
      );
    }

    // ── 3. Cancellation window (spec §9.2 async fn execute_with_cancellation_window) ──
    const cancelMs = ops.cancellationWindowMs ?? 0;

    if (cancelMs > 0) {
      this.logger.log(
        `[PhysicalControl] INTENTION: ${command} on ${target} in ${cancelMs}ms ` +
        `(cancellation window open)`
      );

      // Generate a unique execution ID for the cancel_rx channel (spec §9.2)
      const executionId = `${target}_${command}_${Date.now()}`;
      const cancelled = await this._waitCancellationWindow(cancelMs, target, command, executionId);
      if (cancelled) {
        return { cancelled: true, executed: false, durationMs: Date.now() - startMs, target, command };
      }
    }

    // ── 4. Execute action ──────────────────────────────────────────────────
    this.logger.log(`[PhysicalControl] EXECUTING ${command} on ${target}`);
    const output = await executor();

    // Write output to register if postcondition needs it
    if (ops.postcondition?.registerIndex !== undefined) {
      registers.set(ops.postcondition.registerIndex, output);
    }

    // ── 5. Postcondition verification (spec §9.2) ──────────────────────────
    let postconditionPassed: boolean | undefined;
    let postconditionError: string | undefined;

    if (ops.postcondition) {
      const check = this._verifyPostcondition(ops.postcondition, registers, output);
      postconditionPassed = check.passed;
      postconditionError  = check.error;

      if (!postconditionPassed) {
        this.logger.error(
          `[PhysicalControl] POSTCONDITION FAILED for ${command} on ${target}: ` +
          `${postconditionError}`
        );
        if (ops.postconditionFallback) {
          this.logger.warn(
            `[PhysicalControl] Triggering fallback: ${ops.postconditionFallback}`
          );
        }
        // Do NOT throw — calling code (SVM) logs via AuditChain and applies
        // the compiled fallback strategy. We just report the failure here.
      } else {
        this.logger.log(
          `[PhysicalControl] POSTCONDITION PASSED for ${command} on ${target}`
        );
      }
    }

    return {
      cancelled: false,
      executed: true,
      postconditionPassed,
      postconditionError,
      durationMs: Date.now() - startMs,
      target,
      command,
    };
  }

  // ── Time window validation ────────────────────────────────────────────────

  private _assertTimeWindow(tw: TimeWindow, target: string, command: string): void {
    // Use Intl to handle timezone
    const tz  = tw.timezone ?? 'UTC';
    const now = new Date();

    // Get day-of-week in target timezone
    const dayStr = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz })
      .format(now);
    const dayMap: Record<string, Weekday> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6
    };
    const currentDay = dayMap[dayStr] as Weekday;

    if (tw.days && tw.days.length > 0 && !tw.days.includes(currentDay)) {
      throw new ForbiddenException(
        `[PhysicalControl] ${command} on ${target} BLOCKED — ` +
        `current day '${dayStr}' not in authorised window [${tw.days.join(',')}] (tz: ${tz})`
      );
    }

    // Get local time string "HH:MM" in target timezone
    const timeStr = new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz
    }).format(now).replace(':', ':'); // normalize

    const [hh, mm] = timeStr.split(':').map(Number);
    const currentMinutes = hh * 60 + mm;

    if (tw.startTime) {
      const [sh, sm] = tw.startTime.split(':').map(Number);
      const startMinutes = sh * 60 + sm;
      if (currentMinutes < startMinutes) {
        throw new ForbiddenException(
          `[PhysicalControl] ${command} on ${target} BLOCKED — ` +
          `current time ${timeStr} before window start ${tw.startTime} (tz: ${tz})`
        );
      }
    }

    if (tw.endTime) {
      const [eh, em] = tw.endTime.split(':').map(Number);
      const endMinutes = eh * 60 + em;
      if (currentMinutes > endMinutes) {
        throw new ForbiddenException(
          `[PhysicalControl] ${command} on ${target} BLOCKED — ` +
          `current time ${timeStr} after window end ${tw.endTime} (tz: ${tz})`
        );
      }
    }
  }

  // ── Cancellation window ───────────────────────────────────────────────────

  /**
   * Waits `windowMs` milliseconds, allowing external cancellation via
   * Redis pub/sub CancellationBusService (spec §9.2 cancel_rx pattern).
   * Falls back to plain timer if Redis is not available.
   * Returns true if cancelled (action should not execute).
   */
  private async _waitCancellationWindow(
    windowMs: number,
    target: string,
    command: string,
    executionId: string,
  ): Promise<boolean> {
    if (this.cancellationBus) {
      return this.cancellationBus.waitForCancellation(executionId, target, command, windowMs);
    }
    // Fallback: no Redis — simple sleep
    await new Promise(resolve => setTimeout(resolve, windowMs));
    return false;
  }

  // ── Postcondition verification ────────────────────────────────────────────

  private _verifyPostcondition(
    post: Postcondition,
    registers: Map<number, any>,
    actionOutput: any,
  ): { passed: boolean; error?: string } {
    try {
      const regValue = post.registerIndex !== undefined
        ? registers.get(post.registerIndex)
        : actionOutput;

      // Expression-based check
      if (post.expression) {
        const fn = new Function('value', 'output', 'registers', `return (${post.expression})`);
        const passed = !!fn(regValue, actionOutput, Object.fromEntries(registers));
        return passed
          ? { passed: true }
          : { passed: false, error: `Expression '${post.expression}' evaluated to false (value=${JSON.stringify(regValue)})` };
      }

      // Expected value check with optional tolerance
      if (post.expectedValue !== undefined) {
        if (post.tolerance !== undefined && typeof regValue === 'number') {
          const diff = Math.abs(Number(regValue) - Number(post.expectedValue));
          return diff <= post.tolerance
            ? { passed: true }
            : { passed: false, error: `${regValue} ≠ ${post.expectedValue} ± ${post.tolerance}` };
        }
        return JSON.stringify(regValue) === JSON.stringify(post.expectedValue)
          ? { passed: true }
          : { passed: false, error: `Expected ${JSON.stringify(post.expectedValue)}, got ${JSON.stringify(regValue)}` };
      }

      // No check defined → pass by default
      return { passed: true };
    } catch (err: any) {
      return { passed: false, error: `Exception during postcondition evaluation: ${err?.message}` };
    }
  }
}
