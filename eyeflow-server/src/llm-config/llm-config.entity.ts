import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { LlmProvider, LlmModel, LocalLlmConfig, ApiLlmConfig } from './llm-config.types';
import { ApiProperty } from '@nestjs/swagger';

@Entity('llm_configs')
@Index(['userId', 'isDefault'])
export class LlmConfigEntity {
  @ApiProperty({ format: 'uuid', description: 'Unique config ID' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'User ID for data isolation' })
  @Column({ type: 'uuid' })
  userId!: string;

  @ApiProperty({
    enum: LlmProvider,
    description: 'LLM provider (openai, anthropic, ollama_local, etc)',
  })
  @Column({
    type: 'enum',
    enum: LlmProvider,
  })
  provider!: LlmProvider;

  @ApiProperty({
    enum: LlmModel,
    description: 'Model name',
  })
  @Column({
    type: 'enum',
    enum: LlmModel,
  })
  model!: LlmModel;

  @ApiProperty({ default: false, description: 'Is this the default config' })
  @Column({ type: 'boolean', default: false })
  isDefault = false;

  @ApiProperty({ default: 0.7, description: 'Temperature parameter' })
  @Column({ type: 'float', default: 0.7 })
  temperature = 0.7;

  @ApiProperty({ default: 2000, description: 'Max tokens to generate' })
  @Column({ type: 'integer', default: 2000 })
  maxTokens = 2000;

  @ApiProperty({ default: 1, description: 'Top-p parameter' })
  @Column({ type: 'float', default: 1 })
  topP = 1;

  @ApiProperty({ default: 0, description: 'Frequency penalty parameter' })
  @Column({ type: 'float', default: 0 })
  frequencyPenalty = 0;

  @ApiProperty({ default: 0, description: 'Presence penalty parameter' })
  @Column({ type: 'float', default: 0 })
  presencePenalty = 0;

  @ApiProperty({
    type: Object,
    nullable: true,
    description: 'Local LLM configuration (Ollama, llama.cpp)',
  })
  @Column({ type: 'jsonb', nullable: true })
  localConfig?: LocalLlmConfig;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Encrypted API configuration',
  })
  @Column({ type: 'text', nullable: true })
  encryptedApiConfig?: string;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'Last health check timestamp',
  })
  @Column({ type: 'timestamp', nullable: true })
  lastHealthCheckAt?: Date;

  @ApiProperty({
    default: true,
    description: 'Last health check result',
  })
  @Column({ type: 'boolean', default: true })
  lastHealthCheckSuccessful = true;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Last health check error',
  })
  @Column({ type: 'text', nullable: true })
  lastHealthCheckError?: string;

  @ApiProperty({ default: 0, description: 'Total inferences made' })
  @Column({ type: 'integer', default: 0 })
  totalInferences = 0;

  @ApiProperty({ default: 0, description: 'Total tokens used' })
  @Column({ type: 'bigint', default: 0 })
  totalTokensUsed = 0;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Estimated cost in USD',
  })
  @Column({ type: 'float', nullable: true })
  estimatedCostUsd?: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Average latency in milliseconds',
  })
  @Column({ type: 'float', nullable: true })
  averageLatency?: number;

  @ApiProperty({ description: 'Created timestamp' })
  @CreateDateColumn()
  createdAt!: Date;

  @ApiProperty({ description: 'Last updated timestamp' })
  @UpdateDateColumn()
  updatedAt!: Date;
}
