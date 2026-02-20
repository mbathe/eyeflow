/**
 * Project Version Entity
 * 
 * Represents a specific version of a project's DAG
 * = Immutable once created
 * = Always has task_id + version number
 * = Contains both JSON (human) and IR (machine) representations
 * = Signed cryptographically
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
import { LLMProjectEntity } from './llm-project.entity';
import { ProjectVersionStatus } from '../types/project.types';

@Entity('project_versions')
@Index(['projectId', 'version'])
@Index(['projectId', 'status'])
@Index(['createdAt'])
export class ProjectVersionEntity {
  // ==========================================
  // PRIMARY IDENTIFIERS
  // ==========================================

  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  projectId!: string;

  @ManyToOne(() => LLMProjectEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project!: LLMProjectEntity;

  // ==========================================
  // VERSIONING
  // ==========================================

  @ApiProperty({ description: 'Version number (1, 2, 3, ...)' })
  @Column({ type: 'integer' })
  version!: number;

  @ApiPropertyOptional({ description: 'Parent version (for lineage)' })
  @Column({ type: 'integer', nullable: true })
  parentVersion?: number;

  // ==========================================
  // STATUS
  // ==========================================

  @ApiProperty({ enum: ProjectVersionStatus })
  @Column({
    type: 'varchar',
    length: 50,
    default: ProjectVersionStatus.DRAFT,
  })
  status!: ProjectVersionStatus; // 'draft' | 'validating' | 'active' | 'archived' | 'executing'

  // ==========================================
  // DAG DEFINITION (JSON - Source of Truth for Humans)
  // ==========================================

  /**
   * The semantic DAG in JSON format
   * = Source of truth for humans
   * = Readable, modifiable during DRAFT phase
   * = Locked when moved to VALIDATING/ACTIVE
   * 
   * Structure:
   * {
   *   "dag_id": "uuid",
   *   "version": 2,
   *   "nodes": [
   *     {
   *       "id": "node_1",
   *       "type": "TRIGGER",
   *       "semantic_label": "Monitor temp sensor",
   *       "connector": "kafka://sensors/temperature",
   *       "config": { ... }
   *     }
   *   ],
   *   "edges": [
   *     { "from": "node_1", "to": "node_2", "condition": "value > 30" }
   *   ]
   * }
   */
  @ApiProperty({ type: Object, description: 'DAG definition (JSON semantic)' })
  @Column({ type: 'jsonb' })
  dagDefinition!: Record<string, any>;

  /**
   * Checksum of the DAG JSON
   * Used to detect unauthorized modifications
   */
  @ApiProperty({ description: 'SHA256 checksum of DAG JSON' })
  @Column({ type: 'varchar', length: 64 })
  dagChecksum!: string; // sha256

  // ==========================================
  // LLM-IR BINARY (Source of Truth for Machines)
  // ==========================================

  /**
   * Compiled LLM-IR binary
   * = Source of truth for the SVM/Rust nodes
   * = Derived from DAG JSON via compiler
   * = Signed cryptographically
   * = NEVER edited directly
   * 
   * Stored as base64-encoded binary
   */
  @ApiProperty({ description: 'Compiled LLM-IR binary (base64-encoded)' })
  @Column({ type: 'text' })
  irBinary!: string;

  /**
   * IR binary checksum (for verification)
   */
  @ApiProperty({ description: 'SHA256 checksum of IR binary' })
  @Column({ type: 'varchar', length: 64 })
  irChecksum!: string;

  /**
   * Cryptographic signature of IR binary
   * Signed by the compilation service
   * Verified by Rust nodes before execution
   */
  @ApiProperty({ description: 'Digital signature of IR binary' })
  @Column({ type: 'text' })
  irSignature!: string;

  /**
   * Public key used to sign the IR
   */
  @ApiProperty({ description: 'Public key ID used for signing' })
  @Column({ type: 'varchar', length: 255 })
  signatureKeyId!: string;

  // ==========================================
  // NODE PLACEMENT DECISIONS
  // ==========================================

  /**
   * Where each DAG node executes
   * Determined during compilation
   * { dag_node_1: { target_node_id: 'rust_device_a', executor_type: 'trigger_handler' } }
   */
  @ApiProperty({ type: Object, description: 'Node placement decisions' })
  @Column({ type: 'jsonb' })
  nodePlacements!: Record<string, any>;

  // ==========================================
  // PRELOAD RESOURCES
  // ==========================================

  /**
   * Resources to preload on execution nodes
   * Cache connections, schemas, permissions before execution starts
   */
  @ApiPropertyOptional({ type: [Object], description: 'Resources to preload' })
  @Column({ type: 'jsonb', nullable: true })
  preloadResources?: Array<{
    resource_id: string;
    type: string;
    connector_id?: string;
    expires_at?: Date;
  }>;

  // ==========================================
  // COMPILATION METADATA
  // ==========================================

  @ApiProperty({ description: 'When this version was compiled' })
  @Column({ type: 'timestamp' })
  compiledAt!: Date;

  @ApiPropertyOptional({ description: 'Compilation duration (ms)' })
  @Column({ type: 'integer', nullable: true })
  compilationTimeMs?: number;

  /**
   * Validation report (errors, warnings, optimization info)
   */
  @ApiPropertyOptional({ type: Object })
  @Column({ type: 'jsonb', nullable: true })
  validationReport?: Record<string, any>;

  // ==========================================
  // HUMAN VALIDATION
  // ==========================================

  @ApiPropertyOptional({ format: 'uuid', description: 'User who validated' })
  @Column({ type: 'uuid', nullable: true })
  validatedBy?: string;

  @ApiPropertyOptional({ description: 'When was it validated' })
  @Column({ type: 'timestamp', nullable: true })
  validatedAt?: Date;

  @ApiPropertyOptional({ description: 'Reason for validation' })
  @Column({ type: 'text', nullable: true })
  validationReason?: string;

  // ==========================================
  // MODIFICATION TRACKING
  // ==========================================

  @ApiPropertyOptional({ description: 'Why this version was created' })
  @Column({ type: 'text', nullable: true })
  changeReason?: string;

  @ApiPropertyOptional({ type: [String], description: 'Fields that changed' })
  @Column({ type: 'text', array: true, nullable: true })
  changedFields?: string[];

  // ==========================================
  // EXECUTION LIMITS (per version)
  // ==========================================

  @ApiPropertyOptional({ description: 'Max concurrent executions of this version' })
  @Column({ type: 'integer', nullable: true })
  maxConcurrentExecutions?: number;

  @ApiPropertyOptional({ description: 'Rate limit (executions per minute)' })
  @Column({ type: 'integer', nullable: true })
  rateLimit?: number;

  // ==========================================
  // STATISTICS (for this version)
  // ==========================================

  @ApiProperty({ description: 'Total executions using this version' })
  @Column({ type: 'integer', default: 0 })
  totalExecutions!: number;

  @ApiProperty({ description: 'Successful executions' })
  @Column({ type: 'integer', default: 0 })
  successfulExecutions!: number;

  @ApiProperty({ description: 'Failed executions' })
  @Column({ type: 'integer', default: 0 })
  failedExecutions!: number;

  @ApiPropertyOptional({ description: 'Last execution timestamp' })
  @Column({ type: 'timestamp', nullable: true })
  lastExecutionAt?: Date;

  // ==========================================
  // AUDIT & TIMESTAMPS
  // ==========================================

  @ApiProperty()
  @CreateDateColumn()
  createdAt!: Date;

  @ApiPropertyOptional()
  @Column({ type: 'timestamp', nullable: true })
  archivedAt?: Date;

  // ==========================================
  // TAGS & METADATA
  // ==========================================

  @ApiPropertyOptional({ type: [String] })
  @Column({ type: 'text', array: true, nullable: true })
  tags?: string[];

  @ApiPropertyOptional({ type: Object })
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;
}
