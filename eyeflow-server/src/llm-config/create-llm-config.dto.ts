import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsNumber, IsString, IsBoolean, IsObject } from 'class-validator';
import { LlmProvider, LlmModel } from './llm-config.types';

/**
 * DTO pour créer une configuration LLM via l'API
 */
export class CreateLlmConfigDto {
  @ApiProperty({
    enum: LlmProvider,
    description: 'LLM provider (openai, anthropic, ollama_local, etc)',
    example: LlmProvider.OPENAI,
  })
  @IsEnum(LlmProvider)
  provider!: LlmProvider;

  @ApiProperty({
    enum: LlmModel,
    description: 'Model name',
    example: LlmModel.GPT4,
  })
  @IsEnum(LlmModel)
  model!: LlmModel;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Set this as default configuration',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({
    type: Number,
    description: 'Temperature parameter (0-2)',
    example: 0.7,
    default: 0.7,
  })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Maximum tokens to generate',
    example: 2000,
    default: 2000,
  })
  @IsOptional()
  @IsNumber()
  maxTokens?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Top-p parameter',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  topP?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Frequency penalty parameter',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  frequencyPenalty?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Presence penalty parameter',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  presencePenalty?: number;

  @ApiPropertyOptional({
    type: String,
    description: 'API key (for cloud providers)',
    example: 'sk-...',
  })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional({
    type: Object,
    description: 'Local configuration (Ollama URL, model name, etc)',
    example: {
      baseUrl: 'http://localhost:11434',
      modelName: 'llama2',
    },
  })
  @IsOptional()
  @IsObject()
  localConfig?: Record<string, any>;

  @ApiPropertyOptional({
    type: String,
    description: 'Optional description',
  })
  @IsOptional()
  @IsString()
  description?: string;
}

/**
 * DTO pour mettre à jour une configuration LLM
 */
export class UpdateLlmConfigDto {
  @ApiPropertyOptional({
    enum: LlmModel,
    description: 'Model name',
  })
  @IsOptional()
  @IsEnum(LlmModel)
  model?: LlmModel;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Set this as default configuration',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({
    type: Number,
    description: 'Temperature parameter (0-2)',
  })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Maximum tokens to generate',
  })
  @IsOptional()
  @IsNumber()
  maxTokens?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Top-p parameter',
  })
  @IsOptional()
  @IsNumber()
  topP?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Frequency penalty parameter',
  })
  @IsOptional()
  @IsNumber()
  frequencyPenalty?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Presence penalty parameter',
  })
  @IsOptional()
  @IsNumber()
  presencePenalty?: number;

  @ApiPropertyOptional({
    type: String,
    description: 'API key (for cloud providers)',
  })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional({
    type: Object,
    description: 'Local configuration',
  })
  @IsOptional()
  @IsObject()
  localConfig?: Record<string, any>;

  @ApiPropertyOptional({
    type: String,
    description: 'Optional description',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
