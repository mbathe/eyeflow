/**
 * Execution Record Entity
 * 
 * Complete audit log of every DAG execution
 * = Where did it run, which version, what was the result
 * = Immutable once created
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectVersionEntity } from './project-version.entity';
import { ExecutionStatus } from '../types/project.types';

@Entity('execution_records')
@Index(['projectVersionId', 'startedAt'])
@Index(['projectVersionId', 'status'])
@Index(['userId'])
@Index(['startedAt'])
export class ExecutionRecordEntity {
  // ==========================================
  // PRIMARY IDENTIFIERS
  // ==========================================

  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Which project version executed
   */
  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  projectVersionId!: string;

  @ManyToOne(() => ProjectVersionEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'projectVersionId' })
  projectVersion!: ProjectVersionEntity;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  userId!: string;

  // ==========================================
  // TRIGGER & CONTEXT
  // ==========================================

  /**
   * What triggered this execution
   */
  @ApiProperty({ description: 'Trigger type' })
  @Column({ type: 'varchar', length: 100 })
  triggerType!: string; // 'on_create', 'on_schedule', 'webhook', etc.

  @ApiPropertyOptional({ description: 'Trigger source' })
  @Column({ type: 'varchar', length: 255, nullable: true })
  triggerSource?: string; // 'kafka://topic_name', 'webhook://endpoint', etc.

  /**
   * Trigger event data
   */
  @ApiPropertyOptional({ type: Object })
  @Column({ type: 'jsonb', nullable: true })
  triggerEventData?: Record<string, any>;

  /**
   * Input parameters
   */
  @ApiPropertyOptional({ type: Object })
  @Column({ type: 'jsonb', nullable: true })
  inputParameters?: Record<string, any>;

  // ==========================================
  // EXECUTION DETAILS
  // ==========================================

  @ApiProperty({ enum: ExecutionStatus })
  @Column({
    type: 'varchar',
    length: 50,
  })
  status!: ExecutionStatus;

  @ApiProperty()
  @Column({ type: 'timestamp' })
  startedAt!: Date;

  @ApiPropertyOptional()
  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @ApiPropertyOptional({ description: 'Duration in milliseconds' })
  @Column({ type: 'integer', nullable: true })
  durationMs?: number;

  /**
   * Which execution node ran this
   */
  @ApiPropertyOptional({ description: 'Execution node ID' })
  @Column({ type: 'varchar', length: 255, nullable: true })
  executedOnNode?: string; // 'nest_js_central', 'rust_device_a', etc.

  /**
   * IR signature verification
   */
  @ApiPropertyOptional({ description: 'Was IR signature valid' })
  @Column({ type: 'boolean', default: true })
  irSignatureVerified?: boolean;

  // ==========================================
  // RESULTS
  // ==========================================

  /**
   * Execution output
   */
  @ApiPropertyOptional({ type: Object })
  @Column({ type: 'jsonb', nullable: true })
  output?: Record<string, any>;

  /**
   * Error details
   */
  @ApiPropertyOptional({ description: 'Error message if failed' })
  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @ApiPropertyOptional({ description: 'Error stack trace' })
  @Column({ type: 'text', nullable: true })
  errorStack?: string;

  /**
   * Warnings (non-blocking issues)
   */
  @ApiPropertyOptional({ type: [String] })
  @Column({ type: 'text', array: true, nullable: true })
  warnings?: string[];

  /**
   * Steps executed in the DAG
   */
  @ApiPropertyOptional({ type: [Object] })
  @Column({ type: 'jsonb', nullable: true })
  stepsExecuted?: Array<{
    step_id: string;
    step_name: string;
    status: ExecutionStatus;
    started_at: Date;
    completed_at?: Date;
    duration_ms?: number;
    output?: any;
    error?: string;
  }>;

  // ==========================================
  // PERFORMANCE METRICS
  // ==========================================

  @ApiPropertyOptional({ description: 'Peak memory usage (bytes)' })
  @Column({ type: 'integer', nullable: true })
  peakMemoryBytes?: number;

  @ApiPropertyOptional({ description: 'CPU time (ms)' })
  @Column({ type: 'integer', nullable: true })
  cpuTimeMs?: number;

  @ApiPropertyOptional({ description: 'Wall time from start to end (ms)' })
  @Column({ type: 'integer', nullable: true })
  wallTimeMs?: number;

  // ==========================================
  // AUDIT TRAIL
  // ==========================================

  /**
   * Concurrency group
   * For tracking related/parallel executions
   */
  @ApiPropertyOptional({ description: 'Concurrency group ID' })
  @Column({ type: 'uuid', nullable: true })
  concurrencyGroupId?: string;

  /**
   * Retry attempt number
   */
  @ApiProperty({ description: 'Retry attempt (0 = first attempt)' })
  @Column({ type: 'integer', default: 0 })
  retryAttempt!: number;

  /**
   * If this is a retry, reference the original execution
   */
  @ApiPropertyOptional({ format: 'uuid', description: 'Original execution ID if retry' })
  @Column({ type: 'uuid', nullable: true })
  originalExecutionId?: string;

  /**
   * State snapshot at execution end
   */
  @ApiPropertyOptional({ type: Object })
  @Column({ type: 'jsonb', nullable: true })
  stateSnapshot?: Record<string, any>;

  /**
   * Execution log entries
   * Keep the last N log entries for debugging
   */
  @ApiPropertyOptional({ type: [String] })
  @Column({ type: 'text', array: true, nullable: true })
  logs?: string[]; // Last 100 lines

  // ==========================================
  // METADATA
  // ==========================================

  @ApiPropertyOptional({ type: [String] })
  @Column({ type: 'text', array: true, nullable: true })
  tags?: string[];

  @ApiPropertyOptional({ type: Object })
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // ==========================================
  // TIMESTAMPS (immutable)
  // ==========================================

  @ApiProperty()
  @CreateDateColumn()
  recordedAt!: Date;
}
