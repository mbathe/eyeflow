import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { GlobalTaskType, GlobalTaskStatus, ParsedIntent, LastError } from '../types/task.types';

@Entity('global_tasks')
@Index(['userId', 'type'])
@Index(['userId', 'status'])
@Index(['linkedEventRuleId'])
export class GlobalTaskEntity {
  // ==========================================
  // PRIMARY IDENTIFIERS
  // ==========================================

  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  userId!: string;

  // ==========================================
  // CORE FIELDS
  // ==========================================

  @ApiProperty({ enum: GlobalTaskType })
  @Column({
    type: 'enum',
    enum: GlobalTaskType,
  })
  type!: GlobalTaskType;

  @ApiProperty({ enum: GlobalTaskStatus })
  @Column({
    type: 'enum',
    enum: GlobalTaskStatus,
  })
  status!: GlobalTaskStatus;

  // ==========================================
  // INTENT PARSING
  // ==========================================

  @ApiProperty({ description: 'Original user input' })
  @Column({ type: 'text' })
  originalUserInput!: string;

  @ApiProperty({ type: Object })
  @Column({ type: 'jsonb' })
  intent!: ParsedIntent;

  // ==========================================
  // MODE 2 SPECIFIC (DIRECT EXECUTION)
  // ==========================================

  @ApiProperty({ type: [String], format: 'uuid' })
  @Column({ type: 'uuid', array: true, nullable: true })
  targetConnectorIds?: string[];

  @ApiProperty({ type: [String], format: 'uuid' })
  @Column({ type: 'uuid', array: true, nullable: true })
  missionIds?: string[];

  // ==========================================
  // MODE 3 SPECIFIC (CONTINUOUS MONITORING)
  // ==========================================

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', nullable: true })
  linkedEventRuleId?: string;

  // ==========================================
  // TRACKING & TIMING
  // ==========================================

  @ApiProperty()
  @CreateDateColumn()
  createdAt!: Date;

  @ApiProperty()
  @Column({ type: 'timestamp', nullable: true })
  startedExecutingAt?: Date;

  @ApiProperty()
  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @ApiProperty()
  @Column({ type: 'timestamp', nullable: true })
  stoppedAt?: Date;

  // ==========================================
  // RESILIENCE & SAFETY
  // ==========================================

  @ApiProperty()
  @Column({ type: 'integer', default: 0 })
  retryAttempts!: number;

  @ApiProperty()
  @Column({ type: 'timestamp', nullable: true })
  nextRetryAt?: Date;

  @ApiProperty({ type: Object })
  @Column({ type: 'jsonb', nullable: true })
  lastError?: LastError;
}
