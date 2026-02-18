import { IsString, IsEnum, IsOptional, IsObject, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GlobalTaskType } from '../types/task.types';

/**
 * DTO for compiling a task (lightweight planning without immediate execution)
 * Mode 2 pre-execution step: parse intent → generate missions → validate
 */
export class CompileTaskDto {
  /**
   * Natural language user input to compile
   */
  @ApiProperty({
    description: 'Natural language task description to compile',
    example: 'Send a Slack message to #alerts channel saying "System down"',
  })
  @IsString()
  userInput!: string;

  /**
   * Task type the user intends
   */
  @ApiProperty({
    description: 'Intended task type',
    enum: GlobalTaskType,
    example: GlobalTaskType.DIRECT,
  })
  @IsEnum(GlobalTaskType)
  type!: GlobalTaskType;

  /**
   * Optional manual intent for testing/debugging
   */
  @ApiPropertyOptional({
    description: 'Manual intent override for testing',
  })
  @IsOptional()
  @IsObject()
  manualIntentOverride?: Record<string, any>;

  /**
   * Optional LLM model preference (if multiple available)
   */
  @ApiPropertyOptional({
    description: 'Preferred LLM model for parsing (gpt-4, claude-3, etc)',
    example: 'gpt-4',
  })
  @IsOptional()
  @IsString()
  llmModelPreference?: string;

  /**
   * Confidence threshold for LLM intent parsing (0-1)
   * Compilation fails if confidence below this threshold
   */
  @ApiPropertyOptional({
    description: 'LLM confidence threshold for accepting parsed intent',
    example: 0.85,
  })
  @IsOptional()
  @IsNumber()
  confidenceThreshold?: number;

  /**
   * Custom metadata for the compilation request
   */
  @ApiPropertyOptional({
    description: 'Custom metadata',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
