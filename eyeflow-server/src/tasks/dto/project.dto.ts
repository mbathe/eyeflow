/**
 * Project DTOs
 * Input/Output validation for API endpoints
 */

import { IsString, IsOptional, IsArray, IsObject, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus } from '../types/project.types';

// ============================================================================
// CREATE PROJECT
// ============================================================================

export class CreateLLMProjectDto {
  @ApiProperty({ description: 'Project name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Project description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Allowed connector types',
    example: ['slack', 'kafka', 'postgres'],
  })
  @IsArray()
  @IsString({ each: true })
  allowedConnectorIds!: string[];

  @ApiProperty({
    description: 'Allowed function IDs',
    example: ['send_message', 'query_db'],
  })
  @IsArray()
  @IsString({ each: true })
  allowedFunctionIds!: string[];

  @ApiProperty({
    description: 'Allowed trigger types',
    example: ['on_create', 'on_schedule'],
  })
  @IsArray()
  @IsString({ each: true })
  allowedTriggerTypes!: string[];

  @ApiPropertyOptional({
    description: 'Allowed specific node/instance IDs',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedNodeIds?: string[];

  @ApiPropertyOptional({ description: 'LLM model preference' })
  @IsOptional()
  @IsString()
  llmModel?: string;

  @ApiPropertyOptional({ description: 'Default execution timeout (ms)' })
  @IsOptional()
  defaultTimeoutMs?: number;

  @ApiPropertyOptional({ type: Object, description: 'Custom metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ type: [String], description: 'Tags' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

// ============================================================================
// UPDATE PROJECT
// ============================================================================

export class UpdateLLMProjectDto {
  @ApiPropertyOptional({ description: 'Project name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Project description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Allowed connector types',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedConnectorIds?: string[];

  @ApiPropertyOptional({
    description: 'Allowed function IDs',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedFunctionIds?: string[];

  @ApiPropertyOptional({
    description: 'Allowed trigger types',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedTriggerTypes?: string[];

  @ApiPropertyOptional({
    description: 'Allowed specific node IDs',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedNodeIds?: string[];

  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @ApiPropertyOptional({ description: 'LLM model preference' })
  @IsOptional()
  @IsString()
  llmModel?: string;

  @ApiPropertyOptional({ description: 'Default execution timeout (ms)' })
  @IsOptional()
  defaultTimeoutMs?: number;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

// ============================================================================
// PROJECT RESPONSES
// ============================================================================

export class LLMProjectDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ type: [String] })
  allowedConnectorIds!: string[];

  @ApiProperty({ type: [String] })
  allowedFunctionIds!: string[];

  @ApiProperty({ type: [String] })
  allowedTriggerTypes!: string[];

  @ApiPropertyOptional({ type: [String] })
  allowedNodeIds?: string[];

  @ApiProperty({ enum: ProjectStatus })
  status!: ProjectStatus;

  @ApiProperty()
  currentVersion!: number;

  @ApiPropertyOptional({ format: 'uuid' })
  activeVersionId?: string;

  @ApiProperty()
  totalVersions!: number;

  @ApiProperty()
  totalTasks!: number;

  @ApiProperty()
  totalExecutions!: number;

  @ApiPropertyOptional()
  lastExecutionAt?: Date;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional()
  archivedAt?: Date;

  @ApiPropertyOptional({ type: Object })
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ type: [String] })
  tags?: string[];
}

// ============================================================================
// PROJECT VERSION DTOs
// ============================================================================

export class CreateProjectVersionDto {
  @ApiProperty({
    description: 'DAG definition (JSON)',
    type: Object,
  })
  @IsObject()
  dagDefinition!: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Why this version was created',
  })
  @IsOptional()
  @IsString()
  changeReason?: string;

  @ApiPropertyOptional({
    description: 'Fields that changed',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  changedFields?: string[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class ProjectVersionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty()
  version!: number;

  @ApiPropertyOptional()
  parentVersion?: number;

  @ApiProperty()
  status!: string;

  @ApiProperty({ type: Object })
  dagDefinition!: Record<string, any>;

  @ApiProperty()
  dagChecksum!: string;

  @ApiProperty()
  irChecksum!: string;

  @ApiPropertyOptional({ type: Object })
  validationReport?: Record<string, any>;

  @ApiPropertyOptional({ format: 'uuid' })
  validatedBy?: string;

  @ApiPropertyOptional()
  validatedAt?: Date;

  @ApiProperty()
  compiledAt!: Date;

  @ApiProperty()
  totalExecutions!: number;

  @ApiProperty()
  successfulExecutions!: number;

  @ApiProperty()
  failedExecutions!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional()
  archivedAt?: Date;

  @ApiPropertyOptional()
  lastExecutionAt?: Date;

  @ApiPropertyOptional({ type: Object })
  metadata?: Record<string, any>;
}

// ============================================================================
// EXECUTION MEMORY STATE DTO
// ============================================================================

export class ExecutionMemoryStateDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectVersionId!: string;

  @ApiProperty({ format: 'uuid' })
  executionId!: string;

  @ApiProperty()
  nodeId!: string;

  @ApiProperty()
  triggerCount!: number;

  @ApiPropertyOptional({ type: Object })
  lastEventData?: Record<string, any>;

  @ApiPropertyOptional()
  lastEventAt?: Date;

  @ApiProperty()
  consecutiveMatches!: number;

  @ApiProperty()
  actionsTriggeredInState!: number;

  @ApiPropertyOptional()
  lastError?: string;

  @ApiProperty()
  consecutiveErrors!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional()
  updatedAt?: Date;
}

// ============================================================================
// EXECUTION RECORD DTO
// ============================================================================

export class ExecutionRecordDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectVersionId!: string;

  @ApiProperty()
  triggerType!: string;

  @ApiPropertyOptional()
  triggerSource?: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  startedAt!: Date;

  @ApiPropertyOptional()
  completedAt?: Date;

  @ApiPropertyOptional()
  durationMs?: number;

  @ApiPropertyOptional()
  executedOnNode?: string;

  @ApiPropertyOptional({ type: Object })
  output?: Record<string, any>;

  @ApiPropertyOptional()
  errorMessage?: string;

  @ApiPropertyOptional({ type: [String] })
  warnings?: string[];

  @ApiPropertyOptional({ type: [Object] })
  stepsExecuted?: any[];

  @ApiProperty()
  retryAttempt!: number;

  @ApiProperty()
  recordedAt!: Date;

  @ApiPropertyOptional({ type: Object })
  metadata?: Record<string, any>;
}
