import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GlobalTaskStatus, MissionStatus, ActionStatus, AuditResultStatus } from '../types/task.types';

/**
 * DTO for error information in responses
 */
export class LastErrorDto {
  @ApiProperty({ description: 'Error code', example: 'NETWORK_TIMEOUT' })
  code!: string;

  @ApiProperty({ description: 'Error message' })
  message!: string;

  @ApiProperty({ description: 'Timestamp when error occurred' })
  timestamp!: Date;

  @ApiPropertyOptional({ description: 'Error details' })
  details?: Record<string, any>;
}

/**
 * DTO for parsed intent information
 */
export class ParsedIntentDto {
  @ApiProperty({ description: 'Parsed action name', example: 'send_slack_message' })
  action!: string;

  @ApiProperty({ description: 'Action parameters', example: { channel: '#alerts', message: 'Alert' } })
  parameters!: Record<string, any>;

  @ApiProperty({ description: 'LLM confidence score (0-1)', example: 0.92 })
  confidence!: number;

  @ApiPropertyOptional({ description: 'LLM model used' })
  model?: string;

  @ApiPropertyOptional({ description: 'Parsing metadata' })
  metadata?: Record<string, any>;
}

/**
 * DTO for execution proof from a NexusNode
 */
export class ExecutionProofDto {
  @ApiProperty({ description: 'Raw execution result from NexusNode' })
  result!: Record<string, any>;

  @ApiProperty({ description: 'Exit code (0 = success)' })
  exitCode!: number;

  @ApiPropertyOptional({ description: 'Execution stdout' })
  stdout?: string;

  @ApiPropertyOptional({ description: 'Execution stderr' })
  stderr?: string;

  @ApiProperty({ description: 'Execution duration in milliseconds' })
  durationMs!: number;

  @ApiProperty({ description: 'Timestamp of execution' })
  executedAt!: Date;

  @ApiPropertyOptional({ description: 'Executor node ID' })
  executorNodeId?: string;
}

/**
 * DTO for mission execution status
 * One mission per action sequence to one target connector
 */
export class MissionStatusDto {
  @ApiProperty({ description: 'Mission UUID' })
  id!: string;

  @ApiProperty({ description: 'Global task UUID' })
  globalTaskId!: string;

  @ApiProperty({ description: 'Mission status' })
  status!: MissionStatus;

  @ApiProperty({ description: 'Target connector ID' })
  targetNodeId!: string;

  @ApiPropertyOptional({ description: 'Actual executor node (may differ from target)' })
  executedByNodeId?: string;

  @ApiProperty({ description: 'Sequence of actions in this mission', example: ['send_message', 'log_event'] })
  actions!: string[];

  @ApiPropertyOptional({ description: 'Execution proof from NexusNode' })
  executionProof?: ExecutionProofDto;

  @ApiPropertyOptional({ description: 'Last error if failed' })
  lastError?: LastErrorDto;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: Date;

  @ApiPropertyOptional({ description: 'Completion timestamp' })
  completedAt?: Date;

  @ApiPropertyOptional({ description: 'Failover attempt count' })
  failoverAttempt?: number;

  @ApiPropertyOptional({ description: 'Cryptographic signature from executor node' })
  cryptographicSignature?: string;

  @ApiPropertyOptional({ description: 'Signature algorithm (ECDSA-P256, RSA-2048)' })
  signatureAlgorithm?: string;
}

/**
 * DTO for task compilation result
 * Returned from compile-task endpoint
 */
export class TaskCompilationResultDto {
  @ApiProperty({ description: 'Global task UUID' })
  taskId!: string;

  @ApiProperty({ description: 'Task status after compilation' })
  status!: GlobalTaskStatus;

  @ApiProperty({ description: 'Parsed intent from LLM' })
  intent!: ParsedIntentDto;

  @ApiPropertyOptional({ description: 'Mission IDs generated from compilation' })
  missionIds?: string[];

  @ApiPropertyOptional({ description: 'Linked event rule ID (if MONITORING mode)' })
  eventRuleId?: string;

  @ApiPropertyOptional({
    description: 'Estimated execution duration (useful for async operations)',
    example: 5000,
  })
  estimatedDurationMs?: number;

  @ApiProperty({ description: 'Compilation completed at' })
  compiledAt!: Date;

  @ApiPropertyOptional({ description: 'Validation warnings (non-blocking)' })
  warnings?: string[];

  @ApiPropertyOptional({ description: 'User-provided metadata' })
  metadata?: Record<string, any>;
}

/**
 * DTO for full task status with all details
 */
export class TaskStatusDetailDto {
  @ApiProperty({ description: 'Global task UUID' })
  id!: string;

  @ApiProperty({ description: 'Current task status' })
  status!: GlobalTaskStatus;

  @ApiProperty({ description: 'Task type (DIRECT or MONITORING)' })
  type!: string;

  @ApiProperty({ description: 'Original user input' })
  userInput!: string;

  @ApiPropertyOptional({ description: 'Parsed intent' })
  intent?: ParsedIntentDto;

  @ApiProperty({ description: 'Associated missions' })
  missions!: MissionStatusDto[];

  @ApiPropertyOptional({ description: 'Linked event rule (for MONITORING mode)' })
  eventRuleId?: string;

  @ApiPropertyOptional({ description: 'Last error if any' })
  lastError?: LastErrorDto;

  @ApiProperty({ description: 'Retry attempts remaining' })
  retriesRemaining!: number;

  @ApiProperty({ description: 'Task creation timestamp' })
  createdAt!: Date;

  @ApiPropertyOptional({ description: 'Task completion timestamp' })
  completedAt?: Date;

  @ApiPropertyOptional({ description: 'Total execution duration' })
  totalDurationMs?: number;

  @ApiPropertyOptional({ description: 'Audit trail IDs (for compliance)' })
  auditLogIds?: string[];

  @ApiPropertyOptional({ description: 'Custom metadata' })
  metadata?: Record<string, any>;
}

/**
 * DTO for task execution response
 */
export class TaskExecutionResponseDto {
  @ApiProperty({ description: 'Global task UUID' })
  taskId!: string;

  @ApiProperty({ description: 'Generated mission IDs' })
  missionIds!: string[];

  @ApiProperty({ description: 'Execution status' })
  status!: GlobalTaskStatus;

  @ApiPropertyOptional({ description: 'Whether execution is complete (or still running)' })
  isComplete?: boolean;

  @ApiPropertyOptional({ description: 'Mission statuses' })
  missions?: MissionStatusDto[];

  @ApiProperty({ description: 'Execution started at' })
  startedAt!: Date;

  @ApiPropertyOptional({ description: 'Execution completed at (if complete)' })
  completedAt?: Date;

  @ApiPropertyOptional({ description: 'Estimated remaining time (if async)' })
  estimatedRemainingMs?: number;

  @ApiPropertyOptional({ description: 'Message for user' })
  message?: string;
}

/**
 * DTO for event rule response
 */
export class EventRuleResponseDto {
  @ApiProperty({ description: 'Event rule UUID' })
  id!: string;

  @ApiProperty({ description: 'Rule name' })
  name!: string;

  @ApiProperty({ description: 'Rule status' })
  status!: string;

  @ApiProperty({ description: 'Source connector type' })
  sourceConnectorType!: string;

  @ApiPropertyOptional({ description: 'Source connector instance' })
  sourceConnectorId?: string;

  @ApiProperty({ description: 'Condition definition' })
  condition!: Record<string, any>;

  @ApiProperty({ description: 'Actions to execute' })
  actions!: Record<string, any>[];

  @ApiProperty({ description: 'Total times triggered' })
  totalTriggers!: number;

  @ApiPropertyOptional({ description: 'Last trigger timestamp' })
  lastTriggeredAt?: Date;

  @ApiProperty({ description: 'Rule creation timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Rule last updated timestamp' })
  updatedAt!: Date;
}

export class RuleSuggestionDto {
  @ApiProperty({ description: 'Short description of the suggested rule' })
  description!: string;

  @ApiProperty({ description: 'Suggested trigger', type: Object })
  trigger!: Record<string, any>;

  @ApiPropertyOptional({ description: 'Suggested condition', type: Object })
  condition?: Record<string, any>;

  @ApiProperty({ description: 'Suggested actions', type: [Object] })
  actions!: Record<string, any>[];
}

export class GenerateRuleFromIntentResponseDto {
  @ApiProperty({ description: 'Whether generation succeeded' })
  success!: boolean;

  @ApiPropertyOptional({ description: 'Created rule when create=true', type: EventRuleResponseDto })
  createdRule?: EventRuleResponseDto;

  @ApiProperty({ description: 'List of suggested rules', type: [RuleSuggestionDto] })
  suggestions!: RuleSuggestionDto[];

  @ApiPropertyOptional({ description: "LLM confidence (0-1) if available", example: 0.92 })
  confidence?: number;

  @ApiPropertyOptional({ description: 'Compilation report (if rule was compiled)', type: Object })
  compilationReport?: any;

  @ApiPropertyOptional({ description: 'Whether rule passed compilation', type: Boolean })
  compilationVerified?: boolean;

  @ApiPropertyOptional({ description: 'Compilation failed flag', type: Boolean })
  compilationFailed?: boolean;

  @ApiPropertyOptional({ description: 'Error message if applicable' })
  message?: string;

  @ApiPropertyOptional({ description: 'Resolution hints' })
  resolutionHints?: string[];

  @ApiPropertyOptional({ description: 'User-friendly message (for compilation failures)' })
  userMessage?: any;

  @ApiPropertyOptional({ description: 'LLM feedback (for compilation failures)' })
  llmFeedback?: any;
}

/**
 * Generic success response wrapper
 */
export class SuccessResponseDto<T> {
  @ApiProperty({ description: 'Operation success indicator' })
  success: boolean = true;

  @ApiProperty({ description: 'Response data' })
  data!: T;

  @ApiPropertyOptional({ description: 'Optional message' })
  message?: string;

  @ApiProperty({ description: 'Response timestamp' })
  timestamp: Date = new Date();
}

/**
 * Generic error response wrapper
 */
export class ErrorResponseDto {
  @ApiProperty({ description: 'Operation success indicator' })
  success: boolean = false;

  @ApiProperty({ description: 'Error code' })
  error!: string;

  @ApiProperty({ description: 'Error message' })
  message!: string;

  @ApiPropertyOptional({ description: 'Additional error details' })
  details?: Record<string, any>;

  @ApiProperty({ description: 'Response timestamp' })
  timestamp: Date = new Date();

  @ApiPropertyOptional({ description: 'Correlation ID for debugging' })
  correlationId?: string;
}
