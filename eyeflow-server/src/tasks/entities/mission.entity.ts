import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { MissionStatus, Action, ExecutionProof } from '../types/task.types';

@Entity('missions')
@Index(['userId', 'status'])
@Index(['globalTaskId'])
@Index(['targetNodeId'])
@Index(['eventRuleId'])
export class MissionEntity {
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
  // RELATIONSHIPS
  // ==========================================

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  globalTaskId!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', nullable: true })
  eventRuleId?: string;

  // ==========================================
  // EXECUTION STATUS
  // ==========================================

  @ApiProperty({ enum: MissionStatus })
  @Column({
    type: 'enum',
    enum: MissionStatus,
  })
  status!: MissionStatus;

  // ==========================================
  // ACTIONS (What to do)
  // ==========================================

  @ApiProperty({ type: [Object] })
  @Column({ type: 'jsonb' })
  actions!: Action[];

  // ==========================================
  // NODE ASSIGNMENT (With failover)
  // ==========================================

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  targetNodeId!: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  @Column({ type: 'uuid', array: true, nullable: true })
  backupNodeIds!: string[];

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', nullable: true })
  executedByNodeId?: string;

  @ApiProperty()
  @Column({ type: 'integer', default: 0 })
  failoverAttempt!: number;

  // ==========================================
  // EXECUTION PROOF & CRYPTOGRAPHY (Safety)
  // ==========================================

  @ApiProperty({ type: Object })
  @Column({ type: 'jsonb', nullable: true })
  executionProofCollected?: ExecutionProof;

  // ==========================================
  // TIMING
  // ==========================================

  @ApiProperty()
  @CreateDateColumn()
  createdAt!: Date;

  @ApiProperty()
  @Column({ type: 'timestamp', nullable: true })
  startedAt?: Date;

  @ApiProperty()
  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @ApiProperty()
  @Column({ type: 'integer', nullable: true })
  estimatedDurationMs?: number;
}
