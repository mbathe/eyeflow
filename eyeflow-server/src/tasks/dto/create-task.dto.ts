import { IsString, IsEnum, IsOptional, IsArray, ValidateNested, IsNumber, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GlobalTaskType } from '../types/task.types';
import { Action } from '../types/task.types';

/**
 * DTO for creating a new GlobalTask via API
 * Used for both Mode 2 (Direct) and Mode 3 (Monitoring) task creation
 */
export class CreateTaskDto {
  /**
   * Natural language user input describing the desired task
   * Example: "Alert me when my heart rate exceeds 100 bpm for more than 5 minutes"
   */
  @ApiProperty({
    description: 'Natural language description of the task',
    example: 'Alert me when my heart rate exceeds 100 bpm for more than 5 minutes',
  })
  @IsString()
  userInput!: string;

  /**
   * Task type: DIRECT (immediate execution) or MONITORING (continuous surveillance)
   */
  @ApiProperty({
    description: 'Task type: DIRECT for immediate execution, MONITORING for surveillance',
    enum: GlobalTaskType,
    example: GlobalTaskType.DIRECT,
  })
  @IsEnum(GlobalTaskType)
  type!: GlobalTaskType;

  /**
   * For DIRECT mode: IDs of connectors/services to execute actions on
   * For MONITORING mode: can be empty (rules will specify target connectors)
   */
  @ApiPropertyOptional({
    description: 'Target connector IDs for action execution',
    example: ['slack-connector-1', 'email-connector-1'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetConnectorIds?: string[];

  /**
   * Optional manual override for parsing intent (if LLM parsing fails)
   * Allows advanced users to specify exact intent structure
   */
  @ApiPropertyOptional({
    description: 'Manual intent override for testing/advanced usage',
    example: {
      action: 'send_message',
      parameters: { message: 'Test alert', target: 'channel-1' },
      confidence: 1.0,
    },
  })
  @IsOptional()
  @IsObject()
  manualIntentOverride?: Record<string, any>;

  /**
   * Optional custom metadata attached to the task
   */
  @ApiPropertyOptional({
    description: 'Custom metadata for the task',
    example: { priority: 'high', team: 'ops' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  /**
   * Maximum retry attempts before task fails (default: 3)
   */
  @ApiPropertyOptional({
    description: 'Maximum retry attempts',
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  maxRetries?: number;

  /**
   * Timeout in milliseconds for task execution (default: 30000)
   */
  @ApiPropertyOptional({
    description: 'Task execution timeout in milliseconds',
    example: 30000,
  })
  @IsOptional()
  @IsNumber()
  timeoutMs?: number;
}
