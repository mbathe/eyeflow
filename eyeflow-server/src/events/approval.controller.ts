/**
 * ApprovalController
 *
 * REST endpoints for the Human-in-the-Loop approval dashboard:
 *
 *   GET  /approvals              → List all pending gates
 *   GET  /approvals/summary      → Quick count summary
 *   GET  /approvals/:gateId      → Get a specific gate with full context
 *   POST /approvals/:gateId      → Submit a decision (APPROVED | REJECTED)
 *   DELETE /approvals/:gateId    → Cancel a gate (emergency abort)
 *
 * The POST endpoint calls HumanApprovalService.resolve(), which emits a
 * synthetic TriggerEvent picked up by EventStateMachineService.
 * The FSM then advances deterministically through the HUMAN_APPROVAL branch —
 * exactly like a sensor reading crossing a threshold.
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  NotFoundException,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  HumanApprovalService,
  ApprovalResult,
  PendingApprovalGate,
} from './human-approval.service';

// ──────────────────────────────────────────────────────────────────────────────
// DTOs
// ──────────────────────────────────────────────────────────────────────────────

export class SubmitDecisionDto {
  /** 'APPROVED' or 'REJECTED' */
  decision!: 'APPROVED' | 'REJECTED';
  /** Username or email of the person making the decision */
  decidedBy!: string;
  /** Optional human-readable comment */
  comment?: string;
  /** ISO timestamp — defaults to now if omitted */
  decidedAt?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Controller
// ──────────────────────────────────────────────────────────────────────────────

@Controller('approvals')
export class ApprovalController {
  private readonly logger = new Logger(ApprovalController.name);

  constructor(private readonly approvalService: HumanApprovalService) {}

  /**
   * GET /approvals
   * Returns all currently pending gates (PENDING status only).
   */
  @Get()
  listPending(): PendingApprovalGate[] {
    return this.approvalService.listPending();
  }

  /**
   * GET /approvals/summary
   * Lightweight count for dashboard widgets.
   */
  @Get('summary')
  summary(): { pending: number; total: number } {
    return this.approvalService.summary();
  }

  /**
   * GET /approvals/:gateId
   * Returns full gate details including the contextSnapshot for the approver UI.
   */
  @Get(':gateId')
  getGate(@Param('gateId') gateId: string): PendingApprovalGate {
    const gate = this.approvalService.getGate(gateId);
    if (!gate) {
      throw new NotFoundException(`Approval gate "${gateId}" not found or already resolved`);
    }
    return gate;
  }

  /**
   * POST /approvals/:gateId
   * Submit an approve or reject decision.
   * Triggers FSM resume deterministically via synthetic TriggerEvent.
   */
  @Post(':gateId')
  @HttpCode(HttpStatus.OK)
  submitDecision(
    @Param('gateId') gateId: string,
    @Body() dto: SubmitDecisionDto,
  ): { ok: boolean; gateId: string; decision: string } {
    if (!dto.decision || !['APPROVED', 'REJECTED'].includes(dto.decision)) {
      throw new BadRequestException(
        `"decision" must be "APPROVED" or "REJECTED", got "${dto.decision}"`,
      );
    }
    if (!dto.decidedBy?.trim()) {
      throw new BadRequestException('"decidedBy" is required');
    }

    const gate = this.approvalService.getGate(gateId);
    if (!gate) {
      throw new NotFoundException(`Approval gate "${gateId}" not found or already resolved`);
    }
    if (gate.status !== 'PENDING') {
      throw new BadRequestException(
        `Gate "${gateId}" is already "${gate.status}" — cannot submit another decision`,
      );
    }

    const result: ApprovalResult = {
      gateId,
      decision: dto.decision,
      decidedBy: dto.decidedBy.trim(),
      decidedAt: dto.decidedAt ?? new Date().toISOString(),
      comment: dto.comment,
    };

    this.approvalService.resolve(result);

    this.logger.log(
      `[ApprovalCtrl] Gate "${gateId}" → ${dto.decision} by "${dto.decidedBy}"`,
    );

    return { ok: true, gateId, decision: dto.decision };
  }

  /**
   * DELETE /approvals/:gateId
   * Emergency cancellation — removes the gate without emitting a decision event.
   * The FSM instance will remain suspended (or time out naturally).
   */
  @Delete(':gateId')
  @HttpCode(HttpStatus.OK)
  cancelGate(@Param('gateId') gateId: string): { ok: boolean; gateId: string } {
    const cancelled = this.approvalService.cancelGate(gateId);
    if (!cancelled) {
      throw new NotFoundException(`Approval gate "${gateId}" not found`);
    }

    this.logger.warn(`[ApprovalCtrl] Gate "${gateId}" cancelled via DELETE`);
    return { ok: true, gateId };
  }
}
