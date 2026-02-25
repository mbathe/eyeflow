import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export type ReportStatus  = 'generated' | 'archived';
export type ReportType    = 'execution' | 'performance' | 'error';

@Entity('rule_reports')
@Index(['userId'])
@Index(['ruleId'])
@Index(['userId', 'ruleId'])
export class RuleReportEntity {
  // ── Primary ────────────────────────────────────────────────────────────────

  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  ruleId!: string;

  @ApiProperty()
  @Column({ type: 'varchar', length: 255, nullable: true })
  ruleName?: string;

  // ── Content ────────────────────────────────────────────────────────────────

  @ApiProperty()
  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  summary?: string;

  @ApiProperty()
  @Column({ type: 'varchar', length: 50, default: 'execution' })
  type!: ReportType;

  @ApiProperty()
  @Column({ type: 'varchar', length: 50, default: 'generated' })
  status!: ReportStatus;

  // ── Period ─────────────────────────────────────────────────────────────────

  @ApiProperty({ type: Object })
  @Column({ type: 'jsonb', default: '{}' })
  period!: {
    from?: string;
    to?: string;
    durationLabel?: string;
  };

  // ── Statistics ─────────────────────────────────────────────────────────────

  @ApiProperty({ type: Object })
  @Column({ type: 'jsonb', default: '{}' })
  stats!: {
    totalExecutions: number;
    successCount:    number;
    errorCount:      number;
    skippedCount:    number;
    successRate:     number;
    avgDurationMs:   number;
    minDurationMs:   number;
    maxDurationMs:   number;
  };

  // ── Log snapshot ───────────────────────────────────────────────────────────

  /** Snapshot of the execution logs at time of report generation */
  @ApiProperty({ type: [Object] })
  @Column({ type: 'jsonb', default: '[]' })
  logs!: Array<{
    ts: string;
    status: 'success' | 'error' | 'skipped';
    durationMs: number;
    message: string;
    triggeredBy: 'manual' | 'schedule' | 'event';
  }>;

  // ── Metadata ───────────────────────────────────────────────────────────────

  @ApiProperty()
  @CreateDateColumn()
  generatedAt!: Date;
}
