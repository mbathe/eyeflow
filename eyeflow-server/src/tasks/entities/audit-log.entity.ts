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
  // WHEN
  // ==========================================

  @ApiProperty()
  @CreateDateColumn()
  timestamp!: Date;

  // ==========================================
  // CONTEXT
  // ==========================================

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  notes?: string;
}
