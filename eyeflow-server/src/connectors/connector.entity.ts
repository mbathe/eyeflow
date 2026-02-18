import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ConnectorType, ConnectorStatus, AuthType, AnyConnectorConfig } from './connector.types';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Entity TypeORM pour stocker les configurations des connecteurs
 * Les credentials sont chiffrées avant stockage
 */
@Entity('connectors')
@Index(['userId', 'type'])
@Index(['userId', 'status'])
export class ConnectorEntity {
  @ApiProperty({ format: 'uuid', description: 'Unique connector ID' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'User ID for data isolation' })
  @Column({ type: 'uuid' })
  userId!: string;

  @ApiProperty({ description: 'Connector name' })
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @ApiProperty({ nullable: true, description: 'Connector description' })
  @Column({ type: 'text', nullable: true })
  description?: string;

  @ApiProperty({
    enum: ConnectorType,
    description: 'Type of connector',
  })
  @Column({
    type: 'enum',
    enum: ConnectorType,
  })
  type!: ConnectorType;

  @ApiProperty({
    enum: ConnectorStatus,
    default: ConnectorStatus.INACTIVE,
    description: 'Current status',
  })
  @Column({
    type: 'enum',
    enum: ConnectorStatus,
    default: ConnectorStatus.INACTIVE,
  })
  status!: ConnectorStatus;

  @ApiProperty({
    enum: AuthType,
    description: 'Authentication type',
  })
  @Column({
    type: 'enum',
    enum: AuthType,
  })
  authType!: AuthType;

  @ApiProperty({
    type: String,
    description: 'Encrypted credentials (AES-256-CBC)',
  })
  @Column({ type: 'text' })
  encryptedCredentials!: string;

  @ApiProperty({
    type: Object,
    nullable: true,
    description: 'Configuration without credentials',
  })
  @Column({ type: 'jsonb', nullable: true })
  config?: Partial<AnyConnectorConfig>;

  @ApiProperty({ default: 30000, description: 'Timeout in milliseconds' })
  @Column({ type: 'integer', default: 30000 })
  timeout = 30000;

  @ApiProperty({ default: 3, description: 'Number of retries' })
  @Column({ type: 'integer', default: 3 })
  retryCount = 3;

  @ApiProperty({ default: 1000, description: 'Retry delay in milliseconds' })
  @Column({ type: 'integer', default: 1000 })
  retryDelay = 1000;

  @ApiProperty({ nullable: true, description: 'Rate limit (req/sec)' })
  @Column({ type: 'float', nullable: true })
  rateLimit?: number;

  @ApiProperty({ nullable: true, description: 'Last test timestamp' })
  @Column({ type: 'timestamp', nullable: true })
  lastTestedAt?: Date;

  @ApiProperty({ default: false, description: 'Last test successful' })
  @Column({ type: 'boolean', default: false })
  lastTestSuccessful = false;

  @ApiProperty({ nullable: true, description: 'Last test error message' })
  @Column({ type: 'text', nullable: true })
  lastTestError?: string;

  @ApiProperty({ default: 0, description: 'Total calls made' })
  @Column({ type: 'integer', default: 0 })
  totalCalls = 0;

  @ApiProperty({ default: 0, description: 'Successful calls' })
  @Column({ type: 'integer', default: 0 })
  successfulCalls = 0;

  @ApiProperty({ default: 0, description: 'Failed calls' })
  @Column({ type: 'integer', default: 0 })
  failedCalls = 0;

  @ApiProperty({ nullable: true, description: 'Average latency in ms' })
  @Column({ type: 'float', nullable: true })
  averageLatency?: number;

  @ApiProperty({ description: 'Created timestamp' })
  @CreateDateColumn()
  createdAt!: Date;

  @ApiProperty({ description: 'Last updated timestamp' })
  @UpdateDateColumn()
  updatedAt!: Date;

  @ApiProperty({ nullable: true, description: 'Soft delete timestamp' })
  @Column({ type: 'timestamp', nullable: true })
  deletedAt?: Date; // Soft delete
}
