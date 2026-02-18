import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ConditionState } from '../types/task.types';

@Entity('global_task_states')
@Index(['userId', 'globalTaskId'])
@Unique(['globalTaskId'])
export class GlobalTaskStateEntity {
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
  // WHICH TASK WE'RE TRACKING
  // ==========================================

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  globalTaskId!: string;

  // ==========================================
  // STATE MACHINE
  // ==========================================

  @ApiProperty({ enum: ConditionState })
  @Column({
    type: 'enum',
    enum: ConditionState,
  })
  currentState!: ConditionState;

  @ApiProperty({ enum: ConditionState })
  @Column({ type: 'varchar', length: 50, nullable: true })
  previousState?: string;

  @ApiProperty()
  @UpdateDateColumn()
  stateChangedAt!: Date;

  // ==========================================
  // EVENT CONTEXT
  // ==========================================

  @ApiProperty({ type: Object })
  @Column({ type: 'jsonb' })
  lastEventData!: Record<string, any>;

  // ==========================================
  // DEBOUNCE TRACKING (Prevent spam)
  // ==========================================

  @ApiProperty()
  @Column({ type: 'timestamp' })
  lastTriggerTime!: Date;

  @ApiProperty()
  @Column({ type: 'integer', default: 0 })
  consecutiveMatches!: number;

  // ==========================================
  // SAFETY LIMITS
  // ==========================================

  @ApiProperty()
  @Column({ type: 'integer', default: 0 })
  actionsTriggeredInCurrentState!: number;

  @ApiProperty()
  @Column({ type: 'integer', default: 100 })
  maxActionsPerStateAllowed!: number;
}
