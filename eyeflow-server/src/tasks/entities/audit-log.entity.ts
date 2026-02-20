import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditResultStatus, SignatureVerificationStatus } from '../types/task.types';

@Entity('audit_logs')
@Index(['userId', 'timestamp'])
@Index(['missionId'])
@Index(['globalTaskId'])
@Index(['eventRuleId'])
export class AuditLogEntity {
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
  // WHAT HAPPENED
  // ==========================================

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  missionId!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', nullable: true })
  globalTaskId?: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', nullable: true })
  eventRuleId?: string;

  @ApiProperty()
  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @ApiProperty({ enum: AuditResultStatus })
  @Column({
    type: 'enum',
    enum: AuditResultStatus,
  })
  result!: AuditResultStatus;

  // ==========================================
  // EXECUTION PROOF (from NexusNode)
  // ==========================================

  @ApiProperty({ type: Object })
  @Column({ type: 'jsonb' })
  executionProof!: Record<string, any>;

  // ==========================================
  // 🔐 CRYPTOGRAPHIC SIGNING (Compliance)
  // ==========================================

  @ApiProperty({ description: 'Hex-encoded cryptographic signature' })
  @Column({ type: 'text' })
  cryptographicSignature!: string;

  @ApiProperty({ format: 'uuid', description: 'Which node signed this' })
  @Column({ type: 'uuid' })
  signedByNodeId!: string;

  @ApiProperty({ description: 'Node public certificate (PEM format)' })
  @Column({ type: 'text' })
  nodeCertificatePem!: string;

  @ApiProperty({ description: 'Signature algorithm used' })
  @Column({ type: 'varchar', length: 50 })
  signatureAlgorithm!: string;

  @ApiProperty({ description: 'When was the signature created' })
  @Column({ type: 'timestamp' })
  signatureTimestamp!: Date;

  @ApiProperty({ enum: SignatureVerificationStatus })
  @Column({
    type: 'enum',
    enum: SignatureVerificationStatus,
  })
  verificationStatus!: SignatureVerificationStatus;

  @ApiProperty({ description: 'Error details if verification failed' })
  @Column({ type: 'text', nullable: true })
  verificationError?: string;

  // ==========================================
  // 🔗 CRYPTOGRAPHIC CHAIN (spec §12.1)
  // Blockchain-like: each event references previous hash → tamper-evident
  // ==========================================

  @ApiProperty({ description: 'SHA-256 of previous event — forms append-only chain' })
  @Column({ type: 'char', length: 64, nullable: true })
  previousEventHash?: string;

  @ApiProperty({ description: 'SHA-256 of this event payload (for chain integrity)' })
  @Column({ type: 'char', length: 64, nullable: true })
  selfHash?: string;

  @ApiProperty({ description: 'SHA-256 of input data at time of action' })
  @Column({ type: 'char', length: 64, nullable: true })
  inputHash?: string;

  @ApiProperty({ description: 'SHA-256 of output data produced by action' })
  @Column({ type: 'char', length: 64, nullable: true })
  outputHash?: string;

  @ApiProperty({ description: 'Exact workflow version number used (spec §11.1)' })
  @Column({ type: 'int', nullable: true })
  workflowVersion?: number;

  @ApiProperty({ description: 'Precise instruction index in the LLM-IR' })
  @Column({ type: 'varchar', length: 100, nullable: true })
  instructionId?: string;

  @ApiProperty({ description: 'Structured audit event type (spec §12.1 AuditEventType)' })
  @Column({ type: 'varchar', length: 50, nullable: true })
  eventType?: string;

  @ApiProperty({ description: 'Duration in milliseconds for this instruction' })
  @Column({ type: 'int', nullable: true })
  durationMs?: number;

  // ==========================================
  // WHEN
  // ==========================================

  @ApiProperty()
  @CreateDateColumn({ precision: 6 })  // nanosecond precision (spec §12.1)
  timestamp!: Date;

  // ==========================================
  // CONTEXT
  // ==========================================

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  notes?: string;
}
