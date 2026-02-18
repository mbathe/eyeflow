import { IsString, IsEnum, IsOptional, IsArray, ValidateNested, IsObject, IsNumber, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventRuleStatus, DebounceStrategy, ConditionOperator } from '../types/task.types';

/**
 * DTO for a single condition in an event rule
 * Single condition applied to incoming events
 */
export class ConditionDto {
  /**
   * Field name to check in the event data
   * Example: "heart_rate", "status", "temperature"
   */
  @ApiProperty({
    description: 'Event field to evaluate',
    example: 'heart_rate',
  })
  @IsString()
  fieldName!: string;

  /**
   * Comparison operator
   */
  @ApiProperty({
    description: 'Condition operator',
    enum: ConditionOperator,
    example: ConditionOperator.GT,
  })
  @IsEnum(ConditionOperator)
  operator!: ConditionOperator;

  /**
   * Value to compare against
   */
  @ApiProperty({
    description: 'Comparison value',
    example: 100,
  })
  @IsOptional()
  value?: string | number | boolean;

  /**
   * Duration requirement (milliseconds)
   * For threshold conditions: "must exceed this value for X milliseconds"
   */
  @ApiPropertyOptional({
    description: 'Duration condition must be true (ms)',
    example: 300000, // 5 minutes
  })
  @IsOptional()
  @IsNumber()
  durationMs?: number;
}

/**
 * DTO for debounce configuration
 * Controls how often and how many times actions trigger
 */
export class DebounceConfigDto {
  /**
   * Debounce strategy
   */
  @ApiProperty({
    description: 'Debounce strategy',
    enum: DebounceStrategy,
    example: DebounceStrategy.DEBOUNCE,
  })
  @IsEnum(DebounceStrategy)
  strategy!: DebounceStrategy;

  /**
   * Minimum interval between triggers (milliseconds)
   */
  @ApiProperty({
    description: 'Min time between triggers (ms)',
    example: 300000, // 5 minutes
  })
  @IsNumber()
  @IsInt()
  minIntervalMs!: number;

  /**
   * Maximum number of actions per hour
   */
  @ApiProperty({
    description: 'Max actions per hour',
    example: 20,
  })
  @IsNumber()
  @IsInt()
  maxActionsPerHour!: number;

  /**
   * Use state machine tracking (prevent alert spam)
   */
  @ApiPropertyOptional({
    description: 'Use state tracking debounce',
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  useStateMachine?: boolean;
}

/**
 * DTO for a single action to execute when rule triggers
 */
export class ActionDto {
  /**
   * Action type/name
   * Example: "send_slack_message", "create_incident", "send_email"
   */
  @ApiProperty({
    description: 'Action to execute',
    example: 'send_slack_message',
  })
  @IsString()
  name!: string;

  /**
   * Parameters for the action
   */
  @ApiProperty({
    description: 'Action parameters',
    example: { channel: '#alerts', message: 'High heart rate detected' },
  })
  @IsObject()
  parameters!: Record<string, any>;

  /**
   * Execution order (0, 1, 2, ... for sequential execution)
   */
  @ApiPropertyOptional({
    description: 'Execution order',
    example: 0,
  })
  @IsOptional()
  @IsNumber()
  @IsInt()
  order?: number;

  /**
   * Stop execution on failure (don't proceed to next action)
   */
  @ApiPropertyOptional({
    description: 'Fail fast on error',
    example: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  failFast?: boolean;
}

/**
 * DTO for creating an event rule (Mode 3 - Continuous Monitoring)
 * Defines a surveillance rule that continuously monitors events
 */
export class CreateEventRuleDto {
  /**
   * Human-readable name for the rule
   */
  @ApiProperty({
    description: 'Rule name',
    example: 'High Heart Rate Alert',
  })
  @IsString()
  name!: string;

  /**
   * Long description of what the rule monitors
   */
  @ApiPropertyOptional({
    description: 'Detailed rule description',
    example: 'Triggers when heart rate exceeds 100 bpm for more than 5 minutes',
  })
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * Source connector type to monitor
   * Example: "SENSOR_HEART_RATE", "POSTGRESQL", "KAFKA"
   */
  @ApiProperty({
    description: 'Connector type to monitor',
    example: 'SENSOR_HEART_RATE',
  })
  @IsString()
  sourceConnectorType!: string;

  /**
   * Specific connector instance ID (optional, null = monitor all of this type)
   */
  @ApiPropertyOptional({
    description: 'Specific connector instance',
    example: 'heart-rate-device-1',
  })
  @IsOptional()
  @IsString()
  sourceConnectorId?: string;

  /**
   * Condition(s) to check incoming events against
   */
  @ApiProperty({
    description: 'Rule condition',
    type: ConditionDto,
  })
  @ValidateNested()
  @Type(() => ConditionDto)
  condition!: ConditionDto;

  /**
   * Actions to execute when condition is met
   */
  @ApiProperty({
    description: 'Actions to execute on trigger',
    type: [ActionDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionDto)
  actions!: ActionDto[];

  /**
   * Debounce configuration (prevents alert spam)
   */
  @ApiProperty({
    description: 'Debounce settings',
    type: DebounceConfigDto,
  })
  @ValidateNested()
  @Type(() => DebounceConfigDto)
  debounceConfig!: DebounceConfigDto;

  /**
   * Whether rule is enabled by default
   */
  @ApiPropertyOptional({
    description: 'Enable rule immediately',
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  enabled?: boolean;

  /**
   * Custom metadata for the rule
   */
  @ApiPropertyOptional({
    description: 'Custom metadata',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
