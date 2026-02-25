import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { LlmProvider, LocalLlmConfig, ApiLlmConfig, LlmSkillTag, LlmTaskAffinity } from './llm-config.types';
import { ApiProperty } from '@nestjs/swagger';

@Entity('llm_configs')
@Index(['userId', 'isDefault'])
export class LlmConfigEntity {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  userId!: string;

  // ── Agent identity ─────────────────────────────────────────────────────────

  @ApiProperty({ nullable: true, description: 'Human-readable alias for this LLM agent' })
  @Column({ type: 'varchar', nullable: true })
  name?: string;

  @ApiProperty({ nullable: true, description: 'What this LLM agent is configured for' })
  @Column({ type: 'text', nullable: true })
  description?: string;

  @ApiProperty({ nullable: true, description: 'System prompt injected before every call' })
  @Column({ type: 'text', nullable: true })
  systemPrompt?: string;

  @ApiProperty({ nullable: true, description: 'Declared skill tags' })
  @Column({ type: 'jsonb', nullable: true })
  skills?: LlmSkillTag[];

  @ApiProperty({ nullable: true, description: 'Per-task affinity scores' })
  @Column({ type: 'jsonb', nullable: true })
  taskAffinities?: LlmTaskAffinity[];

  // ── Provider / model ───────────────────────────────────────────────────────

  @ApiProperty({ enum: LlmProvider, description: 'LLM provider' })
  @Column({ type: 'varchar' })
  provider!: string;

  @ApiProperty({ description: 'Model identifier (free string to support new models)' })
  @Column({ type: 'varchar' })
  model!: string;

  @ApiProperty({ default: false })
  @Column({ type: 'boolean', default: false })
  isDefault = false;

  // ── Base generation params ─────────────────────────────────────────────────

  @ApiProperty({ default: 0.7, description: 'Temperature 0-2' })
  @Column({ type: 'float', default: 0.7 })
  temperature = 0.7;

  @ApiProperty({ default: 2000, description: 'Max tokens to generate' })
  @Column({ type: 'integer', default: 2000 })
  maxTokens = 2000;

  // ── Advanced generation params ─────────────────────────────────────────────

  @ApiProperty({ type: Number, nullable: true, description: 'Top-p (nucleus sampling) 0-1' })
  @Column({ type: 'float', nullable: true })
  topP?: number;

  @ApiProperty({ type: Number, nullable: true, description: 'Frequency penalty -2 to 2' })
  @Column({ type: 'float', nullable: true })
  frequencyPenalty?: number;

  @ApiProperty({ type: Number, nullable: true, description: 'Presence penalty -2 to 2' })
  @Column({ type: 'float', nullable: true })
  presencePenalty?: number;

  @ApiProperty({ type: Number, nullable: true, description: 'Seed for reproducibility' })
  @Column({ type: 'integer', nullable: true })
  seed?: number;

  @ApiProperty({ nullable: true, description: 'text | json_object' })
  @Column({ type: 'varchar', nullable: true })
  responseFormat?: 'text' | 'json_object';

  @ApiProperty({ type: Number, nullable: true, description: 'Context window override (tokens)' })
  @Column({ type: 'integer', nullable: true })
  contextWindow?: number;

  @ApiProperty({ nullable: true, description: 'Custom stop sequences' })
  @Column({ type: 'jsonb', nullable: true })
  stopSequences?: string[];

  // ── Provider-specific config ───────────────────────────────────────────────

  @ApiProperty({ type: Object, nullable: true, description: 'Local LLM config (Ollama, llama.cpp)' })
  @Column({ type: 'jsonb', nullable: true })
  localConfig?: LocalLlmConfig;

  @ApiProperty({ type: String, nullable: true, description: 'Encrypted API configuration' })
  @Column({ type: 'text', nullable: true })
  encryptedApiConfig?: string;

  // ── Observability ──────────────────────────────────────────────────────────

  @ApiProperty({ type: Date, nullable: true })
  @Column({ type: 'timestamp', nullable: true })
  lastHealthCheckAt?: Date;

  @ApiProperty({ default: true })
  @Column({ type: 'boolean', default: true })
  lastHealthCheckSuccessful = true;

  @ApiProperty({ type: String, nullable: true })
  @Column({ type: 'text', nullable: true })
  lastHealthCheckError?: string;

  @ApiProperty({ default: 0 })
  @Column({ type: 'integer', default: 0 })
  totalInferences = 0;

  @ApiProperty({ default: 0 })
  @Column({ type: 'bigint', default: 0 })
  totalTokensUsed = 0;

  @ApiProperty({ type: Number, nullable: true })
  @Column({ type: 'float', nullable: true })
  estimatedCostUsd?: number;

  @ApiProperty({ type: Number, nullable: true })
  @Column({ type: 'float', nullable: true })
  averageLatency?: number;

  @ApiProperty()
  @CreateDateColumn()
  createdAt!: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updatedAt!: Date;
}
