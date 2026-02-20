import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiParam,
} from '@nestjs/swagger';

import { TaskCompilerService } from '../services/task-compiler.service';
import { RuleApprovalService } from '../services/rule-approval.service';
import {
  CreateTaskDto,
  CompileTaskDto,
  ExecuteTaskDto,
  CreateEventRuleDto,
  GenerateRuleFromIntentDto,
  TaskCompilationResultDto,
  TaskStatusDetailDto,
  TaskExecutionResponseDto,
  EventRuleResponseDto,
  SuccessResponseDto,
  ErrorResponseDto,
} from '../dto';

/**
 * TasksController
 * REST API endpoints for task compilation and execution
 *
 * Endpoints Overview:
 * - POST /tasks/compile: Compile task from natural language (Mode 2)
 * - POST /tasks: Create task (Mode 2 or Mode 3)
 * - GET /tasks/:id: Get task status with full details
 * - POST /tasks/:id/execute: Execute a compiled/created task
 * - POST /tasks/rules: Create surveillance rule (Mode 3)
 * - GET /tasks/rules/:id: Get rule status
 * - PUT /tasks/rules/:id: Update rule
 * - DELETE /tasks/rules/:id: Disable/delete rule
 */
@ApiTags('Task Compiler (Phase 2.0)')
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly taskCompilerService: TaskCompilerService,
    private readonly ruleApprovalService: RuleApprovalService,
  ) {}

  /**
   * POST /tasks/compile
   * Compile a task from natural language without executing
   * Mode 2: Planning phase - parse intent, generate missions, validate
   *
   * Request:
   * {
   *   "userInput": "Send a Slack message to #alerts",
   *   "type": "DIRECT",
   *   "llmModelPreference": "gpt-4",
   *   "confidenceThreshold": 0.85
   * }
   *
   * Response:
   * {
   *   "taskId": "uuid",
   *   "status": "PENDING",
   *   "intent": { "action": "...", "confidence": 0.92 },
   *   "missionIds": ["uuid1", "uuid2"],
   *   "estimatedDurationMs": 5000,
   *   "compiledAt": "2026-02-18T12:00:00.000Z"
   * }
   */
  @Post('compile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Compile task from natural language',
    description:
      'Parse user input, determine intent, generate execution missions. Does not execute immediately.',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID for multi-tenancy',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Task compilation successful',
    type: TaskCompilationResultDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request or parsing failed',
    type: ErrorResponseDto,
  })
  async compileTask(
    @Headers('X-User-ID') userId: string,
    @Body() dto: CompileTaskDto,
  ): Promise<TaskCompilationResultDto> {
    return this.taskCompilerService.compileTask(userId, dto);
  }

  /**
   * POST /tasks
   * Create a new task (Mode 2 Direct or Mode 3 Monitoring)
   * Does not compile or execute - just stores the task definition
   *
   * Request:
   * {
   *   "userInput": "Alert me when heart rate > 100",
   *   "type": "MONITORING",
   *   "targetConnectorIds": ["slack-connector-1"]
   * }
   *
   * Response:
   * {
   *   "taskId": "uuid",
   *   "status": "PENDING",
   *   "compiledAt": "..."
   * }
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new task',
    description:
      'Create task definition without compilation. For Mode 2 or Mode 3. Compilation happens on demand or execution.',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID for multi-tenancy',
    required: true,
  })
  @ApiResponse({
    status: 201,
    description: 'Task created successfully',
    type: TaskCompilationResultDto,
  })
  async createTask(
    @Headers('X-User-ID') userId: string,
    @Body() dto: CreateTaskDto,
  ): Promise<TaskCompilationResultDto> {
    return this.taskCompilerService.createTask(userId, dto);
  }

  /**
   * GET /tasks/:id
   * Get full task status and details
   * Includes: intent, missions, audit logs, error info, execution time
   *
   * Response:
   * {
   *   "id": "uuid",
   *   "status": "EXECUTING",
   *   "type": "DIRECT",
   *   "userInput": "...",
   *   "intent": { "action": "...", "confidence": 0.92 },
   *   "missions": [ { "id": "...", "status": "COMPLETED" } ],
   *   "createdAt": "...",
   *   "completedAt": "...",
   *   "totalDurationMs": 1234,
   *   "auditLogIds": ["uuid1", "uuid2"]
   * }
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get task status and details',
    description: 'Retrieve full task status including missions, audit trail, and execution proof',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID for multi-tenancy',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Task details retrieved',
    type: TaskStatusDetailDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Task not found',
    type: ErrorResponseDto,
  })
  async getTaskStatus(
    @Headers('X-User-ID') userId: string,
    @Param('id') taskId: string,
  ): Promise<TaskStatusDetailDto> {
    return this.taskCompilerService.getTaskStatus(userId, taskId);
  }

  /**
   * POST /tasks/:id/execute
   * Execute a compiled or created task
   * Mode 2: Sends missions to NexusNode(s) for immediate execution
   * Returns mission IDs (can wait for completion if waitForCompletion=true)
   *
   * Request:
   * {
   *   "globalTaskId": "uuid",
   *   "skipCompilation": false,
   *   "waitForCompletion": false,
   *   "completionTimeoutMs": 30000
   * }
   *
   * Response (async):
   * {
   *   "taskId": "uuid",
   *   "missionIds": ["uuid1", "uuid2"],
   *   "status": "EXECUTING",
   *   "isComplete": false,
   *   "startedAt": "...",
   *   "estimatedRemainingMs": 5000,
   *   "message": "Task execution started with 2 mission(s) dispatched"
   * }
   *
   * Response (synchronous with waitForCompletion=true):
   * {
   *   "taskId": "uuid",
   *   "missionIds": ["uuid1", "uuid2"],
   *   "missions": [
   *     {
   *       "id": "uuid1",
   *       "status": "COMPLETED",
   *       "executionProof": { "result": {...}, "exitCode": 0, "durationMs": 1234 }
   *     }
   *   ],
   *   "status": "COMPLETED",
   *   "isComplete": true,
   *   "completedAt": "...",
   *   "message": "Task execution completed"
   * }
   */
  @Post(':id/execute')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Execute a task',
    description:
      'Execute previously created/compiled task. Sends missions to NexusNode(s). Returns immediately (async) or waits for completion.',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID for multi-tenancy',
    required: true,
  })
  @ApiResponse({
    status: 202,
    description: 'Task execution started',
    type: TaskExecutionResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Task not found',
    type: ErrorResponseDto,
  })
  async executeTask(
    @Headers('X-User-ID') userId: string,
    @Param('id') taskId: string,
    @Body() dto: ExecuteTaskDto,
  ): Promise<TaskExecutionResponseDto> {
    return this.taskCompilerService.executeTask(userId, taskId, dto);
  }

  /**
   * POST /tasks/rules
   * Create a new surveillance rule (Mode 3 - Continuous Monitoring)
   * Defines what to monitor and what actions to execute on trigger
   *
   * Request:
   * {
   *   "name": "High Heart Rate Alert",
   *   "sourceConnectorType": "SENSOR_HEART_RATE",
   *   "condition": {
   *     "fieldName": "heart_rate",
   *     "operator": "gt",
   *     "value": 100,
   *     "durationMs": 300000
   *   },
   *   "actions": [
   *     {
   *       "name": "send_slack_message",
   *       "parameters": { "channel": "#alerts", "message": "Alert" },
   *       "order": 0
   *     }
   *   ],
   *   "debounceConfig": {
   *     "strategy": "debounce",
   *     "minIntervalMs": 300000,
   *     "maxActionsPerHour": 20
   *   }
   * }
   *
   * Response:
   * {
   *   "id": "uuid",
   *   "name": "High Heart Rate Alert",
   *   "status": "ACTIVE",
   *   "sourceConnectorType": "SENSOR_HEART_RATE",
   *   "condition": {...},
   *   "actions": [...],
   *   "totalTriggers": 0,
   *   "createdAt": "...",
   *   "updatedAt": "..."
   * }
   */
  @Post('rules')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create surveillance rule',
    description:
      'Define a rule that continuously monitors incoming events and executes actions when conditions are met. Mode 3 (Continuous Monitoring).',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID for multi-tenancy',
    required: true,
  })
  @ApiResponse({
    status: 201,
    description: 'Rule created successfully',
    type: EventRuleResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid rule definition',
    type: ErrorResponseDto,
  })
  async createEventRule(
    @Headers('X-User-ID') userId: string,
    @Body() dto: CreateEventRuleDto,
  ): Promise<EventRuleResponseDto> {
    return this.taskCompilerService.createEventRule(userId, dto);
  }

  /**
   * POST /tasks/rules/generate-from-intent
   * Generate rule suggestions from a natural language description using the LLM service.
   * If `create=true` in the request body, persist the first suggestion and return it.
   */
  @Post('rules/generate-from-intent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate rule(s) from natural language intent (LLM)', description: 'Use configured LLM to suggest event rule(s) from a textual description. Optionally persist the first suggestion.' })
  @ApiHeader({ name: 'X-User-ID', description: 'User ID for multi-tenancy', required: true })
  @ApiResponse({ status: 200, description: 'Generated rule suggestions (and created rule if requested) with compilation report if available', type: Object })
  async generateRuleFromIntent(
    @Headers('X-User-ID') userId: string,
    @Body() dto: GenerateRuleFromIntentDto,
  ): Promise<any> {
    const fs = require('fs');
    fs.writeFileSync('/tmp/controller_was_called.txt', `CONTROLLER HIT AT ${new Date().toISOString()}`);
    const result = await this.taskCompilerService.generateEventRuleFromIntent(userId, dto.description, dto.create || false, dto.sessionId);
    // Return full result including compilation data
    return result;
  }



  /**
   * GET /tasks/manifest/connectors
   * List all available connectors with their complete manifests
   * Used by LLM service to understand what it can do
   */
  @Get('manifest/connectors')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get connector manifests',
    description:
      'Retrieve all available connector manifests with schemas, functions, triggers, and capabilities. Used by LLM Intent Parser and for documentation.',
  })
  @ApiResponse({
    status: 200,
    description: 'All connector manifests',
    type: Object,
  })
  async getConnectorManifests(): Promise<any> {
    // Return all connectors for LLM to understand capabilities
    const manifests = {
      connectors: this.taskCompilerService.getConnectorManifests(),
      timestamp: new Date(),
      version: '1.0.0',
    };
    return manifests;
  }

  /**
   * GET /tasks/manifest/llm-context
   * Get rich LLM context for a user
   * The LLM service calls this to get everything it needs to parse a task
   */
  @Get('manifest/llm-context')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get LLM context',
    description:
      'Build and return complete LLM context including all connectors, functions, schemas, triggers, and operators. This is sent to the LLM Intent Parser.',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID for multi-tenancy',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Complete LLM context',
    type: Object,
  })
  async getLLMContext(@Headers('X-User-ID') userId: string): Promise<any> {
    return this.taskCompilerService.getLLMContext(userId);
  }

  /**
   * GET /tasks/manifest/llm-context/json
   * Export LLM context as formatted JSON
   * Useful for debugging and for sending to external LLM services
   */
  @Get('manifest/llm-context/json')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Export LLM context as JSON',
    description: 'Export the complete LLM context as formatted JSON for debugging or external services',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID for multi-tenancy',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'LLM context as JSON string',
    type: String,
  })
  async exportLLMContextJSON(@Headers('X-User-ID') userId: string): Promise<string> {
    return this.taskCompilerService.exportLLMContextJSON(userId);
  }

  // ============================================================================
  // 🆕 ENHANCED LLM CONTEXT ENDPOINTS (Module 2 & 3 - with full power!)
  // ============================================================================

  /**
   * GET /tasks/manifest/llm-context/enhanced
   * 🆕 Get enriched LLM context with all capabilities
   * Includes: 7 condition types, 5 action types, resilience patterns, best practices
   */
  @Get('manifest/llm-context/enhanced')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get enhanced LLM context with all system capabilities',
    description:
      'Returns complete LLM context including complex conditions, actions, context variables, error handling patterns. Use this for powerful rule/task generation.',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID for multi-tenancy',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Enhanced LLM context with full system capabilities',
    type: Object,
  })
  async getEnrichedLLMContext(@Headers('X-User-ID') userId: string): Promise<any> {
    return this.taskCompilerService.getEnrichedLLMContext(userId);
  }

  /**
   * GET /tasks/manifest/llm-context/enhanced/rule
   * 🆕 Get enriched LLM context specifically for RULES (Module 3)
   * Optimized for event-driven automation scenarios
   */
  @Get('manifest/llm-context/enhanced/rule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get enhanced LLM context for rule creation (Module 3)',
    description:
      'Returns LLM context optimized for creating complex event-driven rules with triggers, conditions, and actions. Includes advanced examples.',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID for multi-tenancy',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Enhanced LLM context optimized for rules',
    type: Object,
  })
  async getEnrichedRuleContext(@Headers('X-User-ID') userId: string): Promise<any> {
    return this.taskCompilerService.getEnrichedRuleContext(userId);
  }

  /**
   * GET /tasks/manifest/llm-context/enhanced/task
   * 🆕 Get enriched LLM context specifically for TASKS (Module 2)
   * Optimized for one-time execution scenarios
   */
  @Get('manifest/llm-context/enhanced/task')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get enhanced LLM context for task creation (Module 2)',
    description:
      'Returns LLM context optimized for creating one-time tasks from natural language. Includes action chaining and integration examples.',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID for multi-tenancy',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Enhanced LLM context optimized for tasks',
    type: Object,
  })
  async getEnrichedTaskContext(@Headers('X-User-ID') userId: string): Promise<any> {
    return this.taskCompilerService.getEnrichedTaskContext(userId);
  }

  /**
   * GET /tasks/manifest/llm-context/enhanced/json
   * 🆕 Export enhanced LLM context as formatted JSON
   */
  @Get('manifest/llm-context/enhanced/json')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Export enhanced LLM context as JSON',
    description: 'Export the complete enhanced context as formatted JSON string for external services',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID for multi-tenancy',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Enhanced LLM context as JSON string',
    type: String,
  })
  async exportEnrichedContextJSON(@Headers('X-User-ID') userId: string): Promise<string> {
    return this.taskCompilerService.exportEnrichedContextJSON(userId);
  }

  /**
   * GET /tasks/manifest/llm-context/enhanced/rule/json
   * 🆕 Export enhanced rule context as formatted JSON
   */
  @Get('manifest/llm-context/enhanced/rule/json')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Export enhanced rule context as JSON',
    description: 'Export rule-optimized context as formatted JSON for external services',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID for multi-tenancy',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Enhanced rule context as JSON string',
    type: String,
  })
  async exportEnrichedRuleContextJSON(@Headers('X-User-ID') userId: string): Promise<string> {
    return this.taskCompilerService.exportEnrichedRuleContextJSON(userId);
  }

  /**
   * GET /tasks/manifest/llm-context/enhanced/task/json
   * 🆕 Export enhanced task context as formatted JSON
   */
  @Get('manifest/llm-context/enhanced/task/json')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Export enhanced task context as JSON',
    description: 'Export task-optimized context as formatted JSON for external services',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID for multi-tenancy',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Enhanced task context as JSON string',
    type: String,
  })
  async exportEnrichedTaskContextJSON(@Headers('X-User-ID') userId: string): Promise<string> {
    return this.taskCompilerService.exportEnrichedTaskContextJSON(userId);
  }

  // ============================================================================
  // 🆕 AGGREGATED LLM CONTEXT: From ALL registered modules (Extensible!)
  // ============================================================================

  /**
   * GET /tasks/manifest/llm-context/aggregated
   * 🆕 Get AGGREGATED context from ALL registered modules
   * Combines: Tasks + Analytics + Notifications + Workflow + Custom modules
   */
  @Get('manifest/llm-context/aggregated')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get aggregated LLM context from all modules',
    description:
      'Returns combined context from Tasks module + all registered provider modules (Analytics, Notifications, Workflow, etc.). ' +
      'Updated in real-time as new modules register themselves.',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID for multi-tenancy',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Aggregated context from all modules',
    type: Object,
  })
  async getAggregatedLLMContext(@Headers('X-User-ID') userId: string): Promise<any> {
    return this.taskCompilerService.getAggregatedLLMContext(userId);
  }

  /**
   * GET /tasks/manifest/llm-context/aggregated/json
   * 🆕 Export aggregated context as JSON
   */
  @Get('manifest/llm-context/aggregated/json')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Export aggregated context as JSON',
    description: 'Export combined context from all modules as formatted JSON',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID for multi-tenancy',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Aggregated context as JSON string',
    type: String,
  })
  async exportAggregatedContextJSON(@Headers('X-User-ID') userId: string): Promise<string> {
    return this.taskCompilerService.exportAggregatedContextJSON(userId);
  }

  /**
   * GET /tasks/manifest/llm-context/providers
   * 🆕 Get list of all registered LLM context providers
   * Shows what modules have registered their capabilities
   */
  @Get('manifest/llm-context/providers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all registered LLM context providers',
    description:
      'Returns metadata about all modules that have registered as LLM context providers. ' +
      'Shows their capabilities, versions, and descriptions.',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID for multi-tenancy',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'List of registered providers',
    type: Array,
  })
  async getRegisteredProviders(@Headers('X-User-ID') userId: string): Promise<any[]> {
    return this.taskCompilerService.getRegisteredProviders();
  }

  /**
   * GET /tasks/manifest/llm-context/provider/:providerId
   * 🆕 Get context specific to one provider
   * Example: /tasks/manifest/llm-context/provider/analytics-module
   */
  @Get('manifest/llm-context/provider/:providerId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get context specific to one provider',
    description:
      'Returns base Tasks context + context specific to the requested provider module. ' +
      'Use this when you want to focus on a specific module\'s capabilities.',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID for multi-tenancy',
    required: true,
  })
  @ApiParam({
    name: 'providerId',
    description: 'The provider ID (e.g., analytics-module, notifications-module)',
  })
  @ApiResponse({
    status: 200,
    description: 'Provider-specific context',
    type: Object,
  })
  @ApiResponse({
    status: 404,
    description: 'Provider not found',
  })
  async getProviderSpecificContext(
    @Headers('X-User-ID') userId: string,
    @Param('providerId') providerId: string,
  ): Promise<any> {
    return this.taskCompilerService.getProviderSpecificContext(userId, providerId);
  }

  /**
   * GET /tasks/manifest/llm-context/provider/:providerId/json
   * 🆕 Export provider-specific context as JSON
   */
  @Get('manifest/llm-context/provider/:providerId/json')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Export provider-specific context as JSON',
    description: 'Export provider-specific context as formatted JSON for external services',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID for multi-tenancy',
    required: true,
  })
  @ApiParam({
    name: 'providerId',
    description: 'The provider ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Provider context as JSON string',
    type: String,
  })
  @ApiResponse({
    status: 404,
    description: 'Provider not found',
  })
  async exportProviderSpecificContextJSON(
    @Headers('X-User-ID') userId: string,
    @Param('providerId') providerId: string,
  ): Promise<string> {
    return this.taskCompilerService.exportProviderSpecificContextJSON(userId, providerId);
  }

  // ==========================================
  // APPROVAL WORKFLOW ENDPOINTS
  // ==========================================

  /**
   * GET /tasks/rules/pending-approval
   * 🆕 Get all rules pending user approval
   */
  @Get('rules/pending-approval')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get rules pending approval',
    description: 'Returns all compiled rules waiting for user approval with DAG visualization and compilation report',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'List of pending approval rules',
    type: Array,
  })
  async getPendingApprovalRules(
    @Headers('X-User-ID') userId: string,
  ): Promise<any> {
    const rules = await this.ruleApprovalService.getPendingApproval(userId);
    return {
      success: true,
      count: rules.length,
      rules,
    };
  }

  /**
   * GET /tasks/rules/:ruleId/for-approval
   * 🆕 Get rule details with DAG for approval review
   */
  @Get('rules/:ruleId/for-approval')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get rule with DAG for approval',
    description: 'Returns rule details including DAG visualization and compilation report for user review',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID',
    required: true,
  })
  @ApiParam({
    name: 'ruleId',
    description: 'Rule ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Rule with DAG and compilation details',
  })
  @ApiResponse({
    status: 404,
    description: 'Rule not found',
  })
  async getRuleForApproval(
    @Param('ruleId') ruleId: string,
    @Headers('X-User-ID') userId: string,
  ): Promise<any> {
    const result = await this.ruleApprovalService.getRuleForApproval(ruleId, userId);
    return {
      success: true,
      ...result,
    };
  }

  /**
   * POST /tasks/rules/:ruleId/approve
   * 🆕 Approve a rule and activate it
   */
  @Post('rules/:ruleId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve and activate a rule',
    description: 'User approves the DAG and compilation report. Rule becomes ACTIVE.',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID',
    required: true,
  })
  @ApiParam({
    name: 'ruleId',
    description: 'Rule ID to approve',
  })
  @ApiResponse({
    status: 200,
    description: 'Rule approved and activated',
  })
  @ApiResponse({
    status: 400,
    description: 'Rule not pending approval',
  })
  @ApiResponse({
    status: 404,
    description: 'Rule not found',
  })
  async approveRule(
    @Param('ruleId') ruleId: string,
    @Headers('X-User-ID') userId: string,
    @Body() dto?: { feedback?: string },
  ): Promise<any> {
    const result = await this.ruleApprovalService.approveRule(ruleId, userId);
    return {
      success: result.success,
      message: result.message,
      rule: result.rule,
    };
  }

  /**
   * POST /tasks/rules/:ruleId/reject
   * 🆕 Reject a rule and save feedback for LLM retry
   */
  @Post('rules/:ruleId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject a rule with feedback',
    description: 'User rejects the DAG. Feedback is recorded. LLM can retry with this feedback for refinement.',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID',
    required: true,
  })
  @ApiParam({
    name: 'ruleId',
    description: 'Rule ID to reject',
  })
  @ApiResponse({
    status: 200,
    description: 'Rule rejected, feedback recorded',
  })
  @ApiResponse({
    status: 400,
    description: 'Rule not pending approval',
  })
  @ApiResponse({
    status: 404,
    description: 'Rule not found',
  })
  async rejectRule(
    @Param('ruleId') ruleId: string,
    @Headers('X-User-ID') userId: string,
    @Body() dto: { feedback: string },
  ): Promise<any> {
    const result = await this.ruleApprovalService.rejectRule(ruleId, userId, dto.feedback);
    return {
      success: result.success,
      message: result.message,
      rule: result.rule,
    };
  }

  /**
   * GET /tasks/rules/:ruleId/dag
   * 🆕 Get DAG visualization for a rule
   */
  @Get('rules/:ruleId/dag')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get DAG visualization for a rule',
    description: 'Returns the Directed Acyclic Graph (DAG) showing rule execution flow with nodes and edges',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID',
    required: true,
  })
  @ApiParam({
    name: 'ruleId',
    description: 'Rule ID',
  })
  @ApiResponse({
    status: 200,
    description: 'DAG visualization structure',
  })
  @ApiResponse({
    status: 404,
    description: 'Rule or DAG not found',
  })
  async getDAGForRule(
    @Param('ruleId') ruleId: string,
    @Headers('X-User-ID') userId: string,
  ): Promise<any> {
    const result = await this.ruleApprovalService.getRuleForApproval(ruleId, userId);
    return {
      success: true,
      ruleId,
      ruleName: result.rule.name,
      dag: result.dag,
      metadata: result.dag?.metadata,
    };
  }

  /**
   * GET /tasks/approval/stats
   * 🆕 Get approval statistics for user
   */
  @Get('approval/stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get approval workflow statistics',
    description: 'Returns counts of pending, approved, rejected, and total rules',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Approval statistics',
  })
  async getApprovalStats(
    @Headers('X-User-ID') userId: string,
  ): Promise<any> {
    // TODO: Fix type inference for ruleApprovalService
    const stats = await (this.ruleApprovalService as any).getApprovalStats(userId);
    return {
      success: true,
      stats,
    };
  }



  /**
   * GET /tasks/rules/:id
   * Get surveillance rule status
   *
   * Response:
   * {
   *   "id": "uuid",
   *   "name": "High Heart Rate Alert",
   *   "status": "ACTIVE",
   *   "sourceConnectorType": "SENSOR_HEART_RATE",
   *   "totalTriggers": 42,
   *   "lastTriggeredAt": "2026-02-18T10:30:00.000Z",
   *   "createdAt": "...",
   *   "updatedAt": "..."
   * }
   */
  @Get('rules/:id')
  @ApiOperation({
    summary: 'Get rule status',
    description: 'Retrieve surveillance rule details and statistics',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID for multi-tenancy',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Rule retrieved',
    type: EventRuleResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Rule not found',
    type: ErrorResponseDto,
  })
  async getEventRuleStatus(
    @Headers('X-User-ID') userId: string,
    @Param('id') ruleId: string,
  ): Promise<EventRuleResponseDto> {
    return this.taskCompilerService.getEventRuleStatus(userId, ruleId);
  }
}

