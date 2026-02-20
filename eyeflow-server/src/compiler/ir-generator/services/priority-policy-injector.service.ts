/**
 * Priority Policy Injector — spec §6.5
 *
 * "Quand plusieurs workflows compilés nécessitent la même ressource
 *  simultanément, la SVM applique la politique de priorité définie à la
 *  compilation — jamais une décision prise au runtime."
 *
 * This service annotates each resource-consuming IR instruction
 * (LOAD_RESOURCE, CALL_SERVICE / CALL_ACTION, LLM_CALL) with a PriorityPolicy
 * that the SVM Rust node will enforce via its ResourceArbiter (binary semaphore
 * per service_id + timeout).
 *
 * Priority levels:
 *   0   — CRITICAL   (medical/safety control loops, physical actuators)
 *   64  — HIGH       (core business workflows, real-time IoT)
 *   128 — NORMAL     (standard automation)
 *   192 — LOW        (analytics, reporting, async enrichment)
 *   255 — BACKGROUND (maintenance, audit export)
 */

import { Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { Inject } from '@nestjs/common';
import {
  IRInstruction,
  IROpcode,
  LLMIntermediateRepresentation,
  PriorityPolicy,
} from '../interfaces/ir.interface';

// ── Priority levels ──────────────────────────────────────────────────────────
export const PRIORITY_CRITICAL   = 0;
export const PRIORITY_HIGH       = 64;
export const PRIORITY_NORMAL     = 128;
export const PRIORITY_LOW        = 192;
export const PRIORITY_BACKGROUND = 255;

// ── Opcodes that interact with shared external resources ─────────────────────
const RESOURCE_OPCODES = new Set<IROpcode>([
  IROpcode.LOAD_RESOURCE,
  IROpcode.CALL_FUNCTION,
  IROpcode.CALL_API,
  IROpcode.CALL_ACTION,
]);

export interface PriorityPolicyInjectionResult {
  /** IR with priority_policy fields populated */
  annotatedInstructions: IRInstruction[];
  /** Number of instructions that received a PriorityPolicy */
  annotatedCount: number;
  errors: string[];
}

@Injectable()
export class PriorityPolicyInjectorService {
  constructor(@Inject('LOGGER') private logger: Logger) {}

  /**
   * Annotate all resource-consuming instructions in `ir` with a
   * compile-time PriorityPolicy (spec §6.5).
   */
  injectPriorityPolicies(
    ir: LLMIntermediateRepresentation,
  ): PriorityPolicyInjectionResult {
    const errors: string[] = [];
    let annotatedCount = 0;

    try {
      for (const instr of ir.instructions) {
        if (!RESOURCE_OPCODES.has(instr.opcode)) continue;

        const policy = this.derivePolicy(instr);
        instr.priority = policy;
        annotatedCount++;

        this.logger.debug(
          `[PriorityPolicy] instr ${instr.id}: level=${policy.priorityLevel}` +
          ` preemptible=${policy.preemptible} maxWait=${policy.maxWaitMs}ms`,
          { context: 'PriorityPolicyInjector' },
        );
      }

      this.logger.debug('PriorityPolicy injection complete', {
        context: 'PriorityPolicyInjector',
        annotatedCount,
        total: ir.instructions.length,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(msg);
      this.logger.error(`PriorityPolicy injection failed: ${msg}`, {
        context: 'PriorityPolicyInjector',
      });
    }

    return {
      annotatedInstructions: ir.instructions,
      annotatedCount,
      errors,
    };
  }

  // ── Heuristic policy derivation ───────────────────────────────────────────

  /**
   * Derive the PriorityPolicy for a single instruction.
   *
   * The compiler uses three signals to assign priority:
   *   1. `metadata.criticality` ('HIGH' | 'MEDIUM' | 'LOW') from earlier stages
   *   2. opcode type (CALL_ACTION on physical actuators = highest default)
   *   3. comment text (keywords like 'safety', 'medical', 'critical')
   */
  private derivePolicy(instr: IRInstruction): PriorityPolicy {
    const criticality = instr.metadata?.criticality ?? 'MEDIUM';
    const comment     = (instr.comment ?? '').toLowerCase();
    const timeoutMs   = instr.metadata?.timeoutMs ?? 5_000;

    // Keyword boost: safety-critical descriptions get CRITICAL priority
    const isSafetyCritical = /\b(safety|critical|medical|fhir|sil|iec 61508|mdr|emergency|alarm)\b/.test(comment);
    const isPhysicalControl = instr.opcode === IROpcode.CALL_ACTION;
    const isAnalytic        = /\b(report|analytic|export|aggregate|dashboard)\b/.test(comment);

    let priorityLevel: number;
    let preemptible:   boolean;
    let maxWaitMs:     number;

    if (isSafetyCritical || (isPhysicalControl && criticality === 'HIGH')) {
      // CRITICAL — never preemptible, very short wait (fail-safe)
      priorityLevel = PRIORITY_CRITICAL;
      preemptible   = false;
      maxWaitMs     = Math.min(timeoutMs, 500);
    } else if (isPhysicalControl || criticality === 'HIGH') {
      // HIGH — not preemptible by default, moderate wait
      priorityLevel = PRIORITY_HIGH;
      preemptible   = false;
      maxWaitMs     = Math.min(timeoutMs, 2_000);
    } else if (criticality === 'LOW' || isAnalytic) {
      // LOW / BACKGROUND
      priorityLevel = isAnalytic ? PRIORITY_BACKGROUND : PRIORITY_LOW;
      preemptible   = true;
      maxWaitMs     = timeoutMs;
    } else {
      // NORMAL (default)
      priorityLevel = PRIORITY_NORMAL;
      preemptible   = true;
      maxWaitMs     = Math.min(timeoutMs, 10_000);
    }

    return { priorityLevel, preemptible, maxWaitMs };
  }
}
