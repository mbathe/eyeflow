import { IsString, IsUUID, IsOptional, IsArray, IsBoolean, IsObject, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for executing an existing GlobalTask
 * Mode 2: Execute a previously compiled or created task
 * Triggers mission generation and dispatch to NexusNode(s)
 */
export class ExecuteTaskDto {
  /**
   * ID of the GlobalTask to execute
   */
  @ApiProperty({
    description: 'Global task UUID to execute',
    format: 'uuid',
  })
  @IsUUID()
  globalTaskId!: string;

  /**
   * Override target connector IDs for this execution
   * If provided, overrides the task's default targetConnectorIds
   */
  @ApiPropertyOptional({
    description: 'Override target connectors for this execution',
    example: ['connector-override-1'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  overrideTargetConnectorIds?: string[];

  /**
   * Override action parameters for this execution
   * Useful for one-time parameter changes without modifying task definition
   */
  @ApiPropertyOptional({
    description: 'Override action parameters',
    example: { message: 'Custom message for this run' },
  })
  @IsOptional()
  @IsObject()
  overrideParameters?: Record<string, any>;

  /**
   * Skip the compilation step (assume task is already compiled)
   * Faster execution if you know the task is valid
   */
  @ApiPropertyOptional({
    description: 'Skip compilation, use existing task as-is',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  skipCompilation?: boolean;

  /**
   * Wait for execution results before responding
   * If false, returns immediately with mission IDs (async)
   * If true, waits up to timeoutMs for completion
   */
  @ApiPropertyOptional({
    description: 'Wait for execution to complete',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  waitForCompletion?: boolean;

  /**
   * Timeout for waiting on completion (in milliseconds)
   * Only relevant if waitForCompletion=true
   */
  @ApiPropertyOptional({
    description: 'Timeout for waitForCompletion in ms',
    example: 30000,
  })
  @IsOptional()
  @IsNumber()
  completionTimeoutMs?: number;

  /**
   * Custom execution context/metadata
   */
  @ApiPropertyOptional({
    description: 'Execution context metadata',
  })
  @IsOptional()
  @IsObject()
  executionContext?: Record<string, any>;
}
