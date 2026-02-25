import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsNumber,
  IsString,
  IsBoolean,
  IsObject,
  IsArray,
  IsIn,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Sub-DTO: task affinity entry { taskType, score }
 */
export class TaskAffinityDto {
  @IsString()
  taskType!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  score!: number;
}

/**
 * DTO pour créer une configuration LLM / agent LLM
 */
export class CreateLlmConfigDto {
  // ─── Identity ──────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ type: String, description: "Nom de l'agent LLM" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ type: String, description: "Description de l'agent" })
  @IsOptional()
  @IsString()
  description?: string;

  // ─── Provider / Model ──────────────────────────────────────────────────────

  @ApiProperty({ type: String, description: 'LLM provider', example: 'openai' })
  @IsString()
  provider!: string;

  @ApiProperty({ type: String, description: 'Model identifier', example: 'gpt-4o' })
  @IsString()
  model!: string;

  // ─── API credentials ───────────────────────────────────────────────────────

  @ApiPropertyOptional({ type: Object, description: 'API credentials: { apiKey, apiUrl, organization, apiVersion, deployment }' })
  @IsOptional()
  @IsObject()
  apiConfig?: Record<string, any>;

  @ApiPropertyOptional({ type: Object, description: 'Local LLM config (Ollama / llama.cpp)' })
  @IsOptional()
  @IsObject()
  localConfig?: Record<string, any>;

  // ─── Base generation params ────────────────────────────────────────────────

  @ApiPropertyOptional({ type: Boolean, description: 'Définir comme agent par défaut', example: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ type: Number, description: 'Température (0–2)', example: 0.7 })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional({ type: Number, description: 'Max tokens', example: 2000 })
  @IsOptional()
  @IsNumber()
  maxTokens?: number;

  // ─── Advanced generation params ────────────────────────────────────────────

  @ApiPropertyOptional({ type: Number, description: 'Top-P (0–1)' })
  @IsOptional()
  @IsNumber()
  topP?: number;

  @ApiPropertyOptional({ type: Number, description: 'Frequency penalty (-2–2)' })
  @IsOptional()
  @IsNumber()
  frequencyPenalty?: number;

  @ApiPropertyOptional({ type: Number, description: 'Presence penalty (-2–2)' })
  @IsOptional()
  @IsNumber()
  presencePenalty?: number;

  @ApiPropertyOptional({ type: Number, description: 'Seed for deterministic output' })
  @IsOptional()
  @IsNumber()
  seed?: number;

  @ApiPropertyOptional({ type: String, enum: ['text', 'json_object'] })
  @IsOptional()
  @IsIn(['text', 'json_object'])
  responseFormat?: 'text' | 'json_object';

  @ApiPropertyOptional({ type: Number, description: 'Override context window size (tokens)' })
  @IsOptional()
  @IsNumber()
  contextWindow?: number;

  @ApiPropertyOptional({ type: [String], description: 'Stop sequences' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  stopSequences?: string[];

  // ─── Agent persona ─────────────────────────────────────────────────────────

  @ApiPropertyOptional({ type: String, description: 'System prompt injecté automatiquement' })
  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @ApiPropertyOptional({ type: [String], description: 'Compétences déclarées (LlmSkillTag[])' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ type: [TaskAffinityDto], description: 'Affinités par type de tâche [{ taskType, score }]' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskAffinityDto)
  taskAffinities?: TaskAffinityDto[];
}

/**
 * DTO pour mettre à jour une configuration LLM / agent LLM
 * Tous les champs sont optionnels.
 */
export class UpdateLlmConfigDto {
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() provider?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() model?: string;

  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() apiConfig?: Record<string, any>;
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() localConfig?: Record<string, any>;

  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional({ type: Number })  @IsOptional() @IsNumber()  temperature?: number;
  @ApiPropertyOptional({ type: Number })  @IsOptional() @IsNumber()  maxTokens?: number;
  @ApiPropertyOptional({ type: Number })  @IsOptional() @IsNumber()  topP?: number;
  @ApiPropertyOptional({ type: Number })  @IsOptional() @IsNumber()  frequencyPenalty?: number;
  @ApiPropertyOptional({ type: Number })  @IsOptional() @IsNumber()  presencePenalty?: number;
  @ApiPropertyOptional({ type: Number })  @IsOptional() @IsNumber()  seed?: number;

  @ApiPropertyOptional({ type: String, enum: ['text', 'json_object'] })
  @IsOptional() @IsIn(['text', 'json_object'])
  responseFormat?: 'text' | 'json_object';

  @ApiPropertyOptional({ type: Number })  @IsOptional() @IsNumber()  contextWindow?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  stopSequences?: string[];

  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() systemPrompt?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ type: [TaskAffinityDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TaskAffinityDto)
  taskAffinities?: TaskAffinityDto[];
}
