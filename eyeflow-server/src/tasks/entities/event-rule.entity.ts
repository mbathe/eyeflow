import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { EventRuleStatus, Condition, DebounceConfig } from '../types/task.types';

@Entity('event_rules')
@Index(['userId', 'status'])
@Index(['sourceConnectorType', 'status'])
@Index(['globalTaskId'])
export class EventRuleEntity {
  // ==========================================
  // PRIMARY IDENTIFIERS
  // ==========================================

  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  globalTaskId!: string;

  // ==========================================
  // DESCRIPTION
  // ==========================================

  @ApiProperty()
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  description?: string;

  // ==========================================
  // DATA SOURCE
  // ==========================================

  @ApiProperty()
  @Column({ type: 'varchar', length: 100 })
  sourceConnectorType!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', nullable: true })
  sourceConnectorId?: string;

  // ==========================================
  // CONDITION DEFINITION (The "IF" clause)
  // ==========================================

  @ApiProperty({ type: Object, required: false })
  @Column({ type: 'jsonb', nullable: true, default: null })
  condition?: Condition | null;

  // ==========================================
  // ACTIONS (The "THEN" clause)
  // ==========================================

  @ApiProperty({ type: [Object] })
  @Column({ type: 'jsonb', default: '[]' })
  actions!: Array<{
    name: string;
    channel?: string;
    recipients?: string[];
    params?: Record<string, any>;
    parameters?: Record<string, any>;
  }>;

  // ==========================================
  // DEBOUNCE CONFIGURATION (Prevent spam)
  // ==========================================

  @ApiProperty({ type: Object })
  @Column({ type: 'jsonb' })
  debounceConfig!: DebounceConfig;

  // ==========================================
  // STATUS & LIFECYCLE
  // ==========================================

  @ApiProperty({ enum: EventRuleStatus })
  @Column({
    type: 'enum',
    enum: EventRuleStatus,
  })
  status!: EventRuleStatus;

  // ==========================================
  // STATISTICS & TRACKING
  // ==========================================

  @ApiProperty()
  @CreateDateColumn()
  createdAt!: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updatedAt!: Date;

  @ApiProperty()
  @Column({ type: 'integer', default: 0 })
  totalTriggers!: number;

  @ApiProperty()
  @Column({ type: 'timestamp', nullable: true })
  lastTriggeredAt?: Date;

  @ApiProperty()
  @Column({ type: 'timestamp', nullable: true })
  nextScheduledCheckAt?: Date;

  /** Last N execution records stored inline **/
  @ApiProperty({ type: [Object] })
  @Column({ type: 'jsonb', default: '[]', nullable: true })
  executionLogs?: Array<{
    ts: string;
    status: 'success' | 'error' | 'skipped';
    durationMs: number;
    message: string;
    triggeredBy: 'manual' | 'schedule' | 'event';
  }>;
}
