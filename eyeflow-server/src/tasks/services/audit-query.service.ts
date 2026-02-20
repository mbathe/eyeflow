/**
 * Audit Query Service — spec §12.4
 *
 * Exposes read operations over the append-only audit chain stored in
 * `audit_logs` table. Supports:
 *   - Query by workflowId (missionId)
 *   - Query by time range
 *   - Query by event type
 *   - Chain integrity verification (replays SHA-256 linkage)
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import * as crypto from 'crypto';
import { AuditLogEntity } from '../entities/audit-log.entity';

// ── DTOs / response shapes ─────────────────────────────────────────────────

export interface AuditChainQueryOptions {
  workflowId?: string;       // maps to missionId
  userId?: string;
  eventType?: string;        // eventType column
  from?: Date;               // timestamp >= from
  to?: Date;                 // timestamp <= to
  limit?: number;            // default 200
  offset?: number;
}

export interface AuditChainVerification {
  workflowId: string;
  totalEvents: number;
  verified: boolean;
  firstBrokenAt?: number;    // index of first tampered event (0-based)
  errorDetails?: string;
}

export interface AuditEventSummary {
  id: string;
  timestamp: Date;
  eventType?: string;
  action: string;
  result: string;
  selfHash?: string;
  previousEventHash?: string;
  instructionId?: string;
  durationMs?: number;
  workflowVersion?: number;
}

// ── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class AuditQueryService {
  private readonly logger = new Logger(AuditQueryService.name);

  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
  ) {}

  // ── Query ────────────────────────────────────────────────────────────────

  /** Fetch audit events matching the given query options */
  async queryEvents(opts: AuditChainQueryOptions): Promise<AuditLogEntity[]> {
    const where: Record<string, any> = {};

    if (opts.workflowId) where['missionId'] = opts.workflowId;
    if (opts.userId)     where['userId']    = opts.userId;
    if (opts.eventType)  where['eventType'] = opts.eventType;

    if (opts.from && opts.to) {
      where['timestamp'] = Between(opts.from, opts.to);
    } else if (opts.from) {
      where['timestamp'] = MoreThanOrEqual(opts.from);
    } else if (opts.to) {
      where['timestamp'] = LessThanOrEqual(opts.to);
    }

    const findOpts: FindManyOptions<AuditLogEntity> = {
      where,
      order: { timestamp: 'ASC' },
      take: Math.min(opts.limit ?? 200, 1000),
      skip: opts.offset ?? 0,
    };

    return this.repo.find(findOpts);
  }

  /** Summarized view suitable for API responses (redacts heavy fields) */
  async querySummary(opts: AuditChainQueryOptions): Promise<AuditEventSummary[]> {
    const events = await this.queryEvents(opts);
    return events.map(e => ({
      id:                  e.id,
      timestamp:           e.timestamp,
      eventType:           e.eventType,
      action:              e.action,
      result:              e.result,
      selfHash:            e.selfHash,
      previousEventHash:   e.previousEventHash,
      instructionId:       e.instructionId,
      durationMs:          e.durationMs,
      workflowVersion:     e.workflowVersion,
    }));
  }

  // ── Chain verification ────────────────────────────────────────────────────

  /**
   * Replay the SHA-256 chain for a workflowId and verify every link.
   * Reports the first broken event index if tampering is detected.
   * Mirrors CryptoAuditChainService.verifyChain() but reads from DB.
   */
  async verifyChain(workflowId: string): Promise<AuditChainVerification> {
    const events = await this.queryEvents({ workflowId, limit: 1000 });

    if (events.length === 0) {
      return {
        workflowId,
        totalEvents: 0,
        verified: true,
      };
    }

    const genesis = '0'.repeat(64);
    let previousHash = genesis;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];

      // 1. Check previousEventHash link
      if (i === 0) {
        if (ev.previousEventHash && ev.previousEventHash !== genesis) {
          return {
            workflowId,
            totalEvents: events.length,
            verified: false,
            firstBrokenAt: 0,
            errorDetails: `Event[0] has non-genesis previousEventHash: ${ev.previousEventHash}`,
          };
        }
      } else {
        if (ev.previousEventHash && ev.previousEventHash !== previousHash) {
          return {
            workflowId,
            totalEvents: events.length,
            verified: false,
            firstBrokenAt: i,
            errorDetails:
              `Event[${i}] previousEventHash mismatch — ` +
              `expected ${previousHash}, got ${ev.previousEventHash}`,
          };
        }
      }

      // 2. Recompute selfHash from event content
      if (ev.selfHash) {
        const payload = {
          id:               ev.id,
          userId:           ev.userId,
          missionId:        ev.missionId,
          action:           ev.action,
          result:           ev.result,
          eventType:        ev.eventType,
          instructionId:    ev.instructionId,
          previousEventHash: ev.previousEventHash ?? genesis,
        };
        const recomputed = crypto
          .createHash('sha256')
          .update(JSON.stringify(payload))
          .digest('hex');

        if (recomputed !== ev.selfHash) {
          return {
            workflowId,
            totalEvents: events.length,
            verified: false,
            firstBrokenAt: i,
            errorDetails:
              `Event[${i}] selfHash mismatch — content may have been tampered`,
          };
        }
      }

      // Advance chain
      previousHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(ev))
        .digest('hex');
    }

    return {
      workflowId,
      totalEvents: events.length,
      verified: true,
    };
  }

  // ── Statistics ────────────────────────────────────────────────────────────

  /** Aggregate stats for a workflow execution */
  async getWorkflowStats(workflowId: string): Promise<{
    totalEvents: number;
    byEventType: Record<string, number>;
    totalDurationMs: number;
    firstEventAt?: Date;
    lastEventAt?: Date;
  }> {
    const events = await this.queryEvents({ workflowId, limit: 1000 });

    const byEventType: Record<string, number> = {};
    let totalDurationMs = 0;

    for (const ev of events) {
      const key = ev.eventType ?? 'UNKNOWN';
      byEventType[key] = (byEventType[key] ?? 0) + 1;
      totalDurationMs += ev.durationMs ?? 0;
    }

    return {
      totalEvents:   events.length,
      byEventType,
      totalDurationMs,
      firstEventAt:  events[0]?.timestamp,
      lastEventAt:   events[events.length - 1]?.timestamp,
    };
  }
}
