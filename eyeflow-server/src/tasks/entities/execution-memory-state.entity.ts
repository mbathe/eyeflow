/**
 * Execution Memory State Entity
 * 
 * Persistent state during DAG execution
 * = Append-only history of state changes
 * = Survives node/system restarts
 * = Referenced by each execution to maintain continuity
 * 
 * NOT HERE:
 * - Pipeline buffer (in-memory only)
 * - Context/permissions (rehydrated at execution start)
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

@Entity('execution_memory_states')
@Index(['projectVersionId', 'createdAt'])
@Index(['executionId'])
@Index(['nodeId'])
export class ExecutionMemoryStateEntity {
  // ==========================================
  // PRIMARY IDENTIFIERS
  // ==========================================

  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Which project version this state belongs to
   */
  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  projectVersionId!: string;

  @ManyToOne(() => ProjectVersionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectVersionId' })
  projectVersion!: ProjectVersionEntity;

  /**
   * Which execution is this state for
   */
  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  executionId!: string;

  /**
   * Which DAG node produced this state
   */
  @ApiProperty({ description: 'DAG node ID' })
  @Column({ type: 'varchar', length: 255 })
  nodeId!: string;

  // ==========================================
  // STATE VARIABLES (Persisted)
  // ==========================================

  /**
   * Trigger counter
   * How many times has this trigger fired
   */
  @ApiProperty({ description: 'Times this trigger has fired' })
  @Column({ type: 'integer', default: 0 })
  triggerCount!: number;

  /**
   * Last event data seen by this trigger
   */
  @ApiPropertyOptional({ type: Object })
  @Column({ type: 'jsonb', nullable: true })
  lastEventData?: Record<string, any>;

  /**
   * Last event timestamp
   */
  @ApiPropertyOptional()
  @Column({ type: 'timestamp', nullable: true })
  lastEventAt?: Date;

  /**
   * Last execution timestamp
   */
  @ApiPropertyOptional()
  @Column({ type: 'timestamp', nullable: true })
  lastExecutionAt?: Date;

  /**
   * Condition match history
   * List of recent condition evaluations
   * [
   *   { timestamp: "2026-02-19T10:00:00Z", matched: true, reason: "temp > 30" },
   *   { timestamp: "2026-02-19T09:55:00Z", matched: false, reason: "temp <= 30" }
   * ]
   */
  @ApiPropertyOptional({ type: [Object] })
  @Column({ type: 'jsonb', nullable: true })
  conditionHistory?: Array<{
    timestamp: Date;
    matched: boolean;
    reason?: string;
    value?: any;
  }>;

  /**
   * Consecutive matches count
   * For debouncing/throttling
   */
  @ApiProperty({ description: 'Consecutive times condition matched' })
  @Column({ type: 'integer', default: 0 })
  consecutiveMatches!: number;

  /**
   * Actions triggered in current state window
   */
  @ApiProperty({ description: 'Actions triggered in current state' })
  @Column({ type: 'integer', default: 0 })
  actionsTriggeredInState!: number;

  /**
   * Error tracking
   */
  @ApiPropertyOptional({ description: 'Last error message' })
  @Column({ type: 'text', nullable: true })
  lastError?: string;

  @ApiPropertyOptional()
  @Column({ type: 'timestamp', nullable: true })
  lastErrorAt?: Date;

  /**
   * Error count
   */
  @ApiProperty({ description: 'Consecutive error count' })
  @Column({ type: 'integer', default: 0 })
  consecutiveErrors!: number;

  /**
   * Custom state (node-specific)
   * Allows each DAG node to store arbitrary state
   */
  @ApiPropertyOptional({ type: Object })
  @Column({ type: 'jsonb', nullable: true })
  customState?: Record<string, any>;

  // ==========================================
  // STATE MACHINE TRACKING (for complex workflows)
  // ==========================================

  /**
   * Current state in a state machine
   * e.g., "idle" -> "alert_sent" -> "acknowledged"
   */
  @ApiPropertyOptional({ description: 'Current state in workflow' })
  @Column({ type: 'varchar', length: 100, nullable: true })
  currentStateMachine?: string;

  /**
   * Previous state
   */
  @ApiPropertyOptional({ description: 'Previous state' })
  @Column({ type: 'varchar', length: 100, nullable: true })
  previousStateMachine?: string;

  /**
   * State transition history
   */
  @ApiPropertyOptional({ type: [Object] })
  @Column({ type: 'jsonb', nullable: true })
  stateTransitions?: Array<{
    from: string;
    to: string;
    timestamp: Date;
    trigger?: string;
  }>;

  // ==========================================
  // AUDIT & TIMESTAMPS
  // ==========================================

  @ApiProperty()
  @CreateDateColumn()
  createdAt!: Date;

  @ApiPropertyOptional()
  @Column({ type: 'timestamp', nullable: true })
  updatedAt?: Date;

  /**
   * When was this state last accessed
   */
  @ApiPropertyOptional()
  @Column({ type: 'timestamp', nullable: true })
  lastAccessedAt?: Date;

  // ==========================================
  // METADATA
  // ==========================================

  @ApiPropertyOptional({ type: Object })
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;
}
