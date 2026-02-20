/**
 * HumanApprovalService
 *
 * Registry for pending human-in-the-loop approval gates.
 *
 * DESIGN: The FSM/pipeline is NOT blocked waiting for approval.
 * When a HUMAN_APPROVAL_GATE fires:
 *  1. FSM suspends in its current state (no timer, no event loop needed)
 *  2. This service registers the gate + sends notifications
 *  3. A manager calls POST /approvals/:gateId/approve (or /reject)
 *  4. This service emits a synthetic TriggerEvent (driverId: 'human_approval')
 *  5. EventStateMachineService receives the event → HUMAN_APPROVAL condition fires
 *  6. FSM resumes the correct branch deterministically
 *
 * This keeps the FSM deterministic: the human decision is just another
 * "sensor reading" that arrives via the same TriggerBusService pipeline.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import * as crypto from 'crypto';

import { HumanApprovalGateDescriptor } from '../compiler/interfaces/event-state-machine.interface';
import { TriggerEvent } from '../triggers/interfaces/trigger-driver.interface';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ApprovalDecision = 'APPROVED' | 'REJECTED';

export interface PendingApprovalGate {
  gateId: string;
  instanceId: string;   // FSM instance that created this gate
  machineId: string;
  workflowId: string;
  assigneeRule: string; // Compiled rule (resolve at runtime to actual user/email)
  description?: string;
  /** Context data to render in the approver's dashboard */
  contextSnapshot: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
  timeoutHandle: ReturnType<typeof setTimeout>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'TIMED_OUT';
}

export interface ApprovalResult {
  gateId: string;
  decision: ApprovalDecision;
  decidedBy: string;     // Username / email of the approver
  decidedAt: string;     // ISO timestamp
  comment?: string;
}

@Injectable()
export class HumanApprovalService {
  private readonly logger = new Logger(HumanApprovalService.name);

  /** All pending gates keyed by gateId */
  private readonly gates = new Map<string, PendingApprovalGate>();

  /**
   * Subject that emits synthetic TriggerEvents when a human decides.
   * EventStateMachineService subscribes to this to route decisions into FSMs.
   */
  readonly approvalEvents$ = new Subject<TriggerEvent>();

  // ──────────────────────────────────────────────────────────────────────────
  // Gate registration (called by EventStateMachineService when FSM enters
  // HUMAN_APPROVAL_GATE on-entry action)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Register a new pending approval gate.
   * Returns the gateId for display to the approver.
   */
  registerGate(
    descriptor: HumanApprovalGateDescriptor,
    instanceId: string,
    machineId: string,
    workflowId: string,
    contextSnapshot: Record<string, unknown>,
  ): PendingApprovalGate {
    const { gateId, timeoutMs, onTimeout, assigneeRule, description } = descriptor;

    if (this.gates.has(gateId)) {
      this.logger.warn(`[HumanApproval] Gate "${gateId}" already pending — replacing`);
      this.cancelGate(gateId);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + timeoutMs);

    const timeoutHandle = setTimeout(() => {
      this.handleTimeout(gateId, onTimeout);
    }, timeoutMs);

    const gate: PendingApprovalGate = {
      gateId,
      instanceId,
      machineId,
      workflowId,
      assigneeRule,
      description,
      contextSnapshot,
      createdAt: now,
      expiresAt,
      timeoutHandle,
      status: 'PENDING',
    };

    this.gates.set(gateId, gate);

    this.logger.log(
      `[HumanApproval] Gate REGISTERED: gateId="${gateId}" ` +
      `assignee="${assigneeRule}" instance="${instanceId}" ` +
      `expires=${expiresAt.toISOString()}`,
    );

    // TODO: emit notification to dashboard / email / Slack based on assigneeRule
    // e.g. this.notificationService.notifyAssignee(assigneeRule, gate);

    return gate;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Decision resolution (called by REST endpoint / dashboard)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Record a human decision for a pending gate.
   * Emits a synthetic TriggerEvent so the FSM can advance deterministically.
   */
  resolve(result: ApprovalResult): void {
    const gate = this.gates.get(result.gateId);
    if (!gate) {
      this.logger.warn(`[HumanApproval] No pending gate found: "${result.gateId}"`);
      return;
    }
    if (gate.status !== 'PENDING') {
      this.logger.warn(
        `[HumanApproval] Gate "${result.gateId}" already ${gate.status} — ignoring`,
      );
      return;
    }

    clearTimeout(gate.timeoutHandle);
    gate.status = result.decision;

    this.logger.log(
      `[HumanApproval] Gate "${result.gateId}" → ${result.decision} ` +
      `by "${result.decidedBy}" at ${result.decidedAt}`,
    );

    // Emit a synthetic TriggerEvent that the FSM evaluator will recognize as
    // a HUMAN_APPROVAL ConditionDescriptor match
    const triggerEvent: TriggerEvent = {
      eventId: crypto.randomUUID(),
      occurredAt: result.decidedAt,
      driverId: 'human_approval',
      workflowId: gate.workflowId,
      workflowVersion: 0,
      payload: {
        gateId: result.gateId,
        decision: result.decision,
        decidedBy: result.decidedBy,
        comment: result.comment,
        // Include gate context so FSM can enrich its matchedValues
        contextSnapshot: gate.contextSnapshot,
      },
      source: { actor: 'human', decidedBy: result.decidedBy },
    };

    this.approvalEvents$.next(triggerEvent);
    this.gates.delete(result.gateId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Timeout handling
  // ──────────────────────────────────────────────────────────────────────────

  private handleTimeout(gateId: string, strategy: string | undefined): void {
    const gate = this.gates.get(gateId);
    if (!gate || gate.status !== 'PENDING') return;

    gate.status = 'TIMED_OUT';
    this.logger.warn(
      `[HumanApproval] Gate "${gateId}" TIMED OUT ` +
      `(strategy: ${strategy ?? 'FAIL_SAFE'})`,
    );

    // Emit timeout event — FSM will route to appropriate fallback branch
    const triggerEvent: TriggerEvent = {
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      driverId: 'human_approval',
      workflowId: gate.workflowId,
      workflowVersion: 0,
      payload: {
        gateId,
        decision: 'TIMED_OUT',
        strategy,
      },
      source: { actor: 'system', reason: 'timeout' },
    };

    this.approvalEvents$.next(triggerEvent);
    this.gates.delete(gateId);
  }

  cancelGate(gateId: string): boolean {
    const gate = this.gates.get(gateId);
    if (!gate) return false;
    clearTimeout(gate.timeoutHandle);
    this.gates.delete(gateId);
    return true;
  }

  cancelAllForInstance(instanceId: string): void {
    for (const [gateId, gate] of this.gates) {
      if (gate.instanceId === instanceId) {
        this.cancelGate(gateId);
        this.logger.debug(`[HumanApproval] Cancelled gate "${gateId}" (instance reset)`);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Introspection (for REST controller / dashboard)
  // ──────────────────────────────────────────────────────────────────────────

  listPending(): PendingApprovalGate[] {
    return Array.from(this.gates.values()).filter(g => g.status === 'PENDING');
  }

  getGate(gateId: string): PendingApprovalGate | undefined {
    return this.gates.get(gateId);
  }

  summary(): { pending: number; total: number } {
    const pending = [...this.gates.values()].filter(g => g.status === 'PENDING').length;
    return { pending, total: this.gates.size };
  }
}
