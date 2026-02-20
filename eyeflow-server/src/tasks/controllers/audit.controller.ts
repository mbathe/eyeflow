/**
 * Audit Controller — spec §12.4
 *
 * REST endpoints to query and verify the cryptographic audit chain.
 *
 * Routes:
 *   GET  /audit/chain/:workflowId           — events for a workflow (summary)
 *   GET  /audit/chain/:workflowId/full      — full event payloads
 *   GET  /audit/chain/:workflowId/verify    — verify chain integrity
 *   GET  /audit/chain/:workflowId/stats     — aggregate statistics
 *   GET  /audit/events                      — query with filters
 */

import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  Optional,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import {
  AuditQueryService,
  AuditChainVerification,
  AuditEventSummary,
} from '../services/audit-query.service';

@ApiTags('Audit Chain')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly auditQuery: AuditQueryService) {}

  // ── GET /audit/chain/:workflowId ────────────────────────────────────────

  @Get('chain/:workflowId')
  @ApiOperation({
    summary: 'Get audit trail for a workflow (summarized)',
    description:
      'Returns the ordered list of audit events for a given workflow ID. ' +
      'Events include hash fields for manual chain verification.',
  })
  @ApiParam({ name: 'workflowId', description: 'Mission / workflow UUID' })
  @ApiQuery({ name: 'limit',  required: false, type: Number, description: 'Max events (default 200)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Pagination offset' })
  @ApiResponse({ status: 200, description: 'Audit event summaries' })
  async getChain(
    @Param('workflowId') workflowId: string,
    @Query('limit',  new DefaultValuePipe(200), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0),   ParseIntPipe) offset: number,
  ): Promise<AuditEventSummary[]> {
    return this.auditQuery.querySummary({ workflowId, limit, offset });
  }

  // ── GET /audit/chain/:workflowId/full ───────────────────────────────────

  @Get('chain/:workflowId/full')
  @ApiOperation({
    summary: 'Get full audit trail with all fields',
    description:
      'Returns the complete AuditLogEntity rows including cryptographic ' +
      'proof, signature, and execution proof fields.',
  })
  @ApiParam({ name: 'workflowId', description: 'Mission / workflow UUID' })
  @ApiQuery({ name: 'limit',  required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getChainFull(
    @Param('workflowId') workflowId: string,
    @Query('limit',  new DefaultValuePipe(200), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0),   ParseIntPipe) offset: number,
  ) {
    return this.auditQuery.queryEvents({ workflowId, limit, offset });
  }

  // ── GET /audit/chain/:workflowId/verify ─────────────────────────────────

  @Get('chain/:workflowId/verify')
  @ApiOperation({
    summary: 'Verify cryptographic chain integrity (spec §12.4)',
    description:
      'Replays the SHA-256 hash chain and reports the first tampered event ' +
      'if integrity is broken. Returns { verified: true } if the chain is intact.',
  })
  @ApiParam({ name: 'workflowId', description: 'Mission / workflow UUID' })
  @ApiResponse({ status: 200, description: 'Verification result' })
  async verifyChain(
    @Param('workflowId') workflowId: string,
  ): Promise<AuditChainVerification> {
    return this.auditQuery.verifyChain(workflowId);
  }

  // ── GET /audit/chain/:workflowId/stats ──────────────────────────────────

  @Get('chain/:workflowId/stats')
  @ApiOperation({
    summary: 'Aggregate statistics for a workflow audit trail',
    description:
      'Returns counts by event type, total duration, and time range.',
  })
  @ApiParam({ name: 'workflowId', description: 'Mission / workflow UUID' })
  async getChainStats(@Param('workflowId') workflowId: string) {
    return this.auditQuery.getWorkflowStats(workflowId);
  }

  // ── GET /audit/events ───────────────────────────────────────────────────

  @Get('events')
  @ApiOperation({
    summary: 'Query audit events across workflows',
    description:
      'Filter by userId, eventType, time range. Returns summarized events.',
  })
  @ApiQuery({ name: 'userId',    required: false, type: String })
  @ApiQuery({ name: 'eventType', required: false, type: String })
  @ApiQuery({ name: 'from',      required: false, type: String, description: 'ISO-8601 datetime' })
  @ApiQuery({ name: 'to',        required: false, type: String, description: 'ISO-8601 datetime' })
  @ApiQuery({ name: 'limit',     required: false, type: Number })
  @ApiQuery({ name: 'offset',    required: false, type: Number })
  async queryEvents(
    @Query('userId')    userId?: string,
    @Query('eventType') eventType?: string,
    @Query('from')      fromStr?: string,
    @Query('to')        toStr?: string,
    @Query('limit',  new DefaultValuePipe(200), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0),   ParseIntPipe) offset?: number,
  ): Promise<AuditEventSummary[]> {
    const from = fromStr ? new Date(fromStr) : undefined;
    const to   = toStr   ? new Date(toStr)   : undefined;
    return this.auditQuery.querySummary({ userId, eventType, from, to, limit, offset });
  }
}
