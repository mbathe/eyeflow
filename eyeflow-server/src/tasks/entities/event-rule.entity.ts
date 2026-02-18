import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
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

  @ApiProperty({ type: Object })
  @Column({ type: 'jsonb' })
  condition!: Condition;

  // ==========================================
  // ACTIONS (The "THEN" clause)
  // ==========================================

  @ApiProperty({ type: [String] })
  @Column({ type: 'text', array: true })
  actions!: string[];

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
  @Column({ type: 'integer', default: 0 })
  totalTriggers!: number;

  @ApiProperty()
  @Column({ type: 'timestamp', nullable: true })
  lastTriggeredAt?: Date;

  @ApiProperty()
  @Column({ type: 'timestamp', nullable: true })
  nextScheduledCheckAt?: Date;
}
