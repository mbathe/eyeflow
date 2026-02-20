/**
 * LLM Project Entity
 * 
 * Represents a persistent project/session—not ephemeral.
 * = Une conversation avec le LLM qui crée/modifie des tâches compilées
 * = Un container pour tâches, versions, historique d'exécution complet
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus } from '../types/project.types';

@Entity('llm_projects')
@Index(['userId', 'status'])
@Index(['createdAt'])
@Index(['updatedAt'])
export class LLMProjectEntity {
  // ==========================================
  // PRIMARY IDENTIFIERS
  // ==========================================

  @ApiProperty({ format: 'uuid', description: 'Project UUID (stable across all versions)' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  userId!: string;

  // ==========================================
  // METADATA
  // ==========================================

  @ApiProperty({ description: 'Human-readable project name' })
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @ApiPropertyOptional({ description: 'Detailed project description' })
  @Column({ type: 'text', nullable: true })
  description?: string;

  // ==========================================
  // SECURITY CONTEXT (inherited by all tasks)
  // ==========================================

  /**
   * Allowed connector types in this project
   * User chooses these when creating the project
   * All tasks inherit this scoping
   */
  @ApiProperty({ type: [String], description: 'Allowed connector IDs' })
  @Column({ type: 'text', array: true })
  allowedConnectorIds!: string[]; // ['slack', 'kafka', 'postgres']

  /**
   * Allowed function IDs
   * Which actions the LLM can suggest
   */
  @ApiProperty({ type: [String], description: 'Allowed function IDs' })
  @Column({ type: 'text', array: true })
  allowedFunctionIds!: string[];

  /**
   * Allowed trigger types
   * Which event sources can trigger tasks here
   */
  @ApiProperty({ type: [String], description: 'Allowed trigger types' })
  @Column({ type: 'text', array: true })
  allowedTriggerTypes!: string[]; // ['on_create', 'on_schedule', 'on_webhook']

  /**
   * Allowed node IDs
   * Which specific connector instances (e.g., 'postgres_prod_db_1')
   */
  @ApiPropertyOptional({ type: [String], description: 'Allowed node IDs (specific instances)' })
  @Column({ type: 'text', array: true, nullable: true })
  allowedNodeIds?: string[];

  // ==========================================
  // STATUS & LIFECYCLE
  // ==========================================

  @ApiProperty({ enum: ProjectStatus })
  @Column({
    type: 'varchar',
    length: 50,
    default: ProjectStatus.DRAFT,
  })
  status!: ProjectStatus; // 'draft' | 'active' | 'archived' | 'paused'

  // ==========================================
  // CURRENT VERSION TRACKING
  // ==========================================

  @ApiPropertyOptional({ format: 'uuid', description: 'Current active version ID' })
  @Column({ type: 'uuid', nullable: true })
  activeVersionId?: string;

  @ApiProperty({ description: 'Current version number' })
  @Column({ type: 'integer', default: 1 })
  currentVersion!: number;

  // ==========================================
  // CONFIGURATION
  // ==========================================

  /**
   * LLM model preference for this project
   */
  @ApiPropertyOptional({ description: 'LLM model for rule generation' })
  @Column({ type: 'varchar', length: 100, nullable: true })
  llmModel?: string;

  /**
   * Execution timeout for tasks in this project
   */
  @ApiPropertyOptional({ description: 'Default task execution timeout (ms)' })
  @Column({ type: 'integer', default: 30000 })
  defaultTimeoutMs?: number;

  /**
   * Retry policy
   */
  @ApiPropertyOptional({ type: Object })
  @Column({ type: 'jsonb', nullable: true })
  retryPolicy?: {
    maxAttempts: number;
    backoffMs: number;
  };

  // ==========================================
  // TAGS & CATEGORIZATION
  // ==========================================

  @ApiPropertyOptional({ type: [String] })
  @Column({ type: 'text', array: true, nullable: true })
  tags?: string[];

  @ApiPropertyOptional({ type: Object })
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // ==========================================
  // AUDIT & TIMESTAMPS
  // ==========================================

  @ApiProperty()
  @CreateDateColumn()
  createdAt!: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updatedAt!: Date;

  @ApiPropertyOptional()
  @Column({ type: 'timestamp', nullable: true })
  archivedAt?: Date;

  // ==========================================
  // STATISTICS
  // ==========================================

  @ApiProperty({ description: 'Total versions created' })
  @Column({ type: 'integer', default: 1 })
  totalVersions!: number;

  @ApiProperty({ description: 'Total tasks in this project' })
  @Column({ type: 'integer', default: 0 })
  totalTasks!: number;

  @ApiProperty({ description: 'Total executions across all versions' })
  @Column({ type: 'integer', default: 0 })
  totalExecutions!: number;

  @ApiPropertyOptional({ description: 'Last execution timestamp' })
  @Column({ type: 'timestamp', nullable: true })
  lastExecutionAt?: Date;

  @ApiPropertyOptional({ description: 'Last error message' })
  @Column({ type: 'text', nullable: true })
  lastError?: string;
}
