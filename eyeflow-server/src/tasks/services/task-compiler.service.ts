import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Entities
import { GlobalTaskEntity } from '../entities/global-task.entity';
import { EventRuleEntity } from '../entities/event-rule.entity';
import { MissionEntity } from '../entities/mission.entity';
import { GlobalTaskStateEntity } from '../entities/task-state.entity';
import { AuditLogEntity } from '../entities/audit-log.entity';

// DTOs
import {
  CreateTaskDto,
  CompileTaskDto,
  ExecuteTaskDto,
  CreateEventRuleDto,
  TaskCompilationResultDto,
  TaskStatusDetailDto,
  TaskExecutionResponseDto,
  EventRuleResponseDto,
} from '../dto';

// Types
import { GlobalTaskStatus, GlobalTaskType, MissionStatus, ConditionState, EventRuleStatus, ConditionOperator, AuditResultStatus, SignatureVerificationStatus } from '../types/task.types';

// Services
import { ConnectorRegistryService } from './connector-registry.service';
import { LLMContextBuilderService } from './llm-context-builder.service';
import { LLMContextEnhancedService } from './llm-context-enhanced.service';
import { LLMIntentParserService } from './llm-intent-parser.abstraction';
import { TaskValidatorService } from './task-validator.service';
import { AgentBrokerService } from './agent-broker.service';
import { RuleCompilerService } from './rule-compiler.service';
import { CompilationFeedbackService } from './compilation-feedback.service';
import { LLMContextEnricherService } from './llm-context-enricher.service';

@Injectable()
export class TaskCompilerService {
  private readonly logger = new Logger(TaskCompilerService.name);

  constructor(
    // TypeORM Repositories
    @InjectRepository(GlobalTaskEntity)
    private readonly globalTaskRepository: Repository<GlobalTaskEntity>,
    @InjectRepository(EventRuleEntity)
    private readonly eventRuleRepository: Repository<EventRuleEntity>,
    @InjectRepository(MissionEntity)
    private readonly missionRepository: Repository<MissionEntity>,
    @InjectRepository(GlobalTaskStateEntity)
    private readonly taskStateRepository: Repository<GlobalTaskStateEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditLogRepository: Repository<AuditLogEntity>,

    // New Services
    private readonly connectorRegistry: ConnectorRegistryService,
    private readonly contextBuilder: LLMContextBuilderService,
    private readonly contextEnhanced: LLMContextEnhancedService,
    @Inject('LLMIntentParser')
    private readonly llmParser: LLMIntentParserService,
    private readonly validator: TaskValidatorService,
    // Compilation Services
    private readonly agentBroker: AgentBrokerService,
    private readonly ruleCompiler: RuleCompilerService,
    private readonly compilationFeedback: CompilationFeedbackService,
    private readonly contextEnricher: LLMContextEnricherService,
  ) {}

  async createTask(userId: string, dto: CreateTaskDto): Promise<TaskCompilationResultDto> {
    try {
      const taskId = uuidv4();
      const intent = dto.manualIntentOverride || null;
      
      const task = new GlobalTaskEntity();
      task.id = taskId;
      task.userId = userId;
      task.type = dto.type;
      task.originalUserInput = dto.userInput;
      task.status = GlobalTaskStatus.PENDING;
      task.intent = intent as any;
      task.targetConnectorIds = dto.targetConnectorIds || [];
      task.retryAttempts = 0;
      task.nextRetryAt = undefined;
      task.lastError = undefined;

      await this.globalTaskRepository.save(task);

      if (dto.type === GlobalTaskType.MONITORING) {
        const state = new GlobalTaskStateEntity();
        state.id = uuidv4();
        state.userId = userId;
        state.globalTaskId = taskId;
        state.currentState = ConditionState.NORMAL;
        state.previousState = ConditionState.NORMAL;
        state.lastEventData = {};
        state.lastTriggerTime = new Date();
        state.consecutiveMatches = 0;
        state.actionsTriggeredInCurrentState = 0;
        state.maxActionsPerStateAllowed = 20;
        await this.taskStateRepository.save(state);
      }

      return {
        taskId,
        status: GlobalTaskStatus.PENDING,
        intent: intent ? { ...intent, confidence: intent.confidence || 1.0 } as any : undefined,
        missionIds: [],
        estimatedDurationMs: 5000,
        compiledAt: new Date(),
        metadata: dto.metadata,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(`Failed to create task: ${msg}`);
    }
  }

  /**
   * Compile task from natural language
   * Steps:
   * 1. Build full LLM context (all connectors, functions, schemas, triggers)
   * 2. Send to LLM parser to extract intent
   * 3. Validate intent (functions exist, types match, user has permissions)
   * 4. Create task + missions in database
   */
  async compileTask(userId: string, dto: CompileTaskDto): Promise<TaskCompilationResultDto> {
    try {
      const taskId = uuidv4();
      this.logger.log(`Compiling task for user ${userId}: "${dto.userInput.substring(0, 50)}..."`);

      // Step 1: Build rich LLM context
      const llmContext = this.contextBuilder.buildContext(userId);

      // Step 2: Validate that LLM would have enough context
      const compilationValidation = await this.validator.validateCompilation(
        dto.userInput,
        llmContext,
        userId,
      );
      if (!compilationValidation.valid) {
        throw new BadRequestException('LLM compilation validation failed: ' + compilationValidation.errors.join(', '));
      }

      // Step 3: Parse intent using LLM (with manual override if provided)
      const parsedIntent: any = dto.manualIntentOverride
        ? {
            success: true,
            confidence: 1.0,
            intent: { action: dto.type, actionType: 'EXECUTE' as const },
            targets: [],
            parameters: [],
            missions: [],
            validation: { isExecutable: true, issues: [], warnings: [] },
          }
        : (await this.llmParser.parseIntent(dto.userInput, llmContext, userId, {
            llmModel: dto.llmModelPreference,
            confidenceThreshold: dto.confidenceThreshold,
          }));

      // Step 4: Check confidence threshold
      if (!parsedIntent.success || parsedIntent.confidence < (dto.confidenceThreshold || 0.7)) {
        throw new BadRequestException(
          `Failed to parse task intent. Confidence ${parsedIntent.confidence} below threshold ${dto.confidenceThreshold || 0.7}`,
        );
      }

      // Step 5: Validate parsed intent
      const intentValidation = await this.validator.validateIntent(parsedIntent, llmContext, userId);
      if (!intentValidation.valid) {
        throw new BadRequestException('Intent validation failed: ' + intentValidation.errors.join(', '));
      }

      // Step 6: Create task in database
      const task = new GlobalTaskEntity();
      task.id = taskId;
      task.userId = userId;
      task.type = dto.type;
      task.originalUserInput = dto.userInput;
      task.status = GlobalTaskStatus.PENDING;
      task.intent = parsedIntent.intent as any;
      task.targetConnectorIds = parsedIntent.targets.map((t: any) => t.connectorId);
      task.retryAttempts = 0;

      await this.globalTaskRepository.save(task);
      this.logger.log(
        `Task compiled successfully: ${taskId}, confidence: ${parsedIntent.confidence}`,
      );

      return {
        taskId,
        status: GlobalTaskStatus.PENDING,
        intent: {
          action: parsedIntent.intent.action,
          confidence: parsedIntent.confidence,
        } as any,
        missionIds: [],
        estimatedDurationMs: 5000,
        compiledAt: new Date(),
        metadata: {
          connectorsSuggested: parsedIntent.targets.length,
          missionCount: parsedIntent.missions.length,
          validationWarnings: intentValidation.warnings,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Task compilation failed: ${msg}`);
      throw new InternalServerErrorException(`Failed to compile task: ${msg}`);
    }
  }

  async executeTask(userId: string, globalTaskId: string, dto: ExecuteTaskDto): Promise<TaskExecutionResponseDto> {
    try {
      const task = await this.globalTaskRepository.findOne({
        where: { id: globalTaskId, userId },
      });

      if (!task) {
        throw new NotFoundException(`Task ${globalTaskId} not found`);
      }

      task.status = GlobalTaskStatus.EXECUTING;
      await this.globalTaskRepository.save(task);

      const missionIds = await this.generateMockMissions(userId, globalTaskId, task);

      return {
        taskId: globalTaskId,
        missionIds,
        status: GlobalTaskStatus.EXECUTING,
        isComplete: false,
        startedAt: new Date(),
        estimatedRemainingMs: 5000,
        message: `Task execution started with ${missionIds.length} mission(s) dispatched`,
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(`Failed to execute task: ${msg}`);
    }
  }

  async getTaskStatus(userId: string, taskId: string): Promise<TaskStatusDetailDto> {
    try {
      const task = await this.globalTaskRepository.findOne({
        where: { id: taskId, userId },
      });

      if (!task) {
        throw new NotFoundException(`Task ${taskId} not found`);
      }

      const missions = await this.missionRepository.find({
        where: { userId, globalTaskId: taskId },
      });

      const auditLogs = await this.auditLogRepository.find({
        where: { userId, globalTaskId: taskId },
        take: 100,
      });

      return {
        id: taskId,
        status: task.status,
        type: task.type,
        userInput: task.originalUserInput,
        intent: (task.intent as any) ? { ...(task.intent as any), confidence: (task.intent as any)?.confidence || 0.5 } : undefined,
        missions: missions.map((m) => ({
          id: m.id,
          globalTaskId: m.globalTaskId,
          status: m.status,
          targetNodeId: m.targetNodeId,
          executedByNodeId: m.executedByNodeId || undefined,
          actions: Array.isArray(m.actions) ? m.actions.map((a: any) => a.name || '') : [],
          createdAt: m.createdAt,
          completedAt: m.completedAt || undefined,
        })),
        eventRuleId: task.linkedEventRuleId || undefined,
        lastError: task.lastError ? JSON.parse(task.lastError as any) : undefined,
        retriesRemaining: 3 - (task.retryAttempts || 0),
        createdAt: task.createdAt,
        completedAt: task.completedAt || undefined,
        totalDurationMs: task.completedAt ? task.completedAt.getTime() - task.createdAt.getTime() : undefined,
        auditLogIds: auditLogs.map((log) => log.id),
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(`Failed to get task status: ${msg}`);
    }
  }

  /**
   * Create Event Rule from natural language (Mode 3)
   * Examples:
   * - "Check compliance every time a new customer is created"
   * - "Send alert to Slack if customer is non-compliant"
   * - "Verify document against conformity rules when contract is updated"
   *
   * Steps:
   * 1. Build LLM context focused on triggers and conditions
   * 2. Parse natural rule description to extract:
   *    - Trigger (what event to listen for)
   *    - Condition (what to check)
   *    - Actions (what to do)
   * 3. Validate all components exist and are compatible
   * 4. Create rule with debounce/throttle config for performance
   */
  async createEventRule(userId: string, dto: CreateEventRuleDto, globalTaskId?: string): Promise<EventRuleResponseDto> {
    try {
      const ruleId = uuidv4();
      this.logger.log(
        `Creating event rule for user ${userId}: "${dto.name}"`,
      );

      // Step 1: Build LLM context for rules
      const llmContext = this.contextBuilder.buildRuleContext(userId);

      // Step 2: Validate rule structure (derive triggerType from condition when possible)
      let triggerType: string | undefined = undefined;
      try {
        if (dto.condition && dto.condition.fieldName) {
          const field = dto.condition.fieldName;
          const matchedTrigger = llmContext.triggers.find((t: any) => Array.isArray(t.trigger.filterableFields) && t.trigger.filterableFields.includes(field));
          if (matchedTrigger) triggerType = matchedTrigger.trigger.type;
        }

        // Fallback: treat numeric/duration conditions as metric thresholds when available
        if (!triggerType && (dto.condition?.durationMs || typeof dto.condition?.value === 'number')) {
          const metricTrigger = llmContext.triggers.find((t: any) => {
            const tt = (t.trigger.type || '').toString().toLowerCase();
            return tt.includes('metric') || tt.includes('threshold');
          });
          if (metricTrigger) triggerType = metricTrigger.trigger.type;
        }

        // Final fallback: use first available trigger type or a generic ON_EVENT
        if (!triggerType) triggerType = (llmContext.triggers && llmContext.triggers[0] && llmContext.triggers[0].trigger && llmContext.triggers[0].trigger.type) || 'ON_EVENT';
      } catch (err) {
        triggerType = 'ON_EVENT';
      }

      const actionsForValidation = dto.actions.map((a: any) => ({ functionId: a.name, connectorId: dto.sourceConnectorType }));

      const ruleValidation = await this.validator.validateRule(
        dto.name,
        triggerType,
        actionsForValidation,
        llmContext,
        userId,
      );

      if (!ruleValidation.valid) {
        throw new BadRequestException(
          'Rule validation failed: ' + ruleValidation.errors.join(', '),
        );
      }

      // Step 3: Create rule entity
      const rule = new EventRuleEntity();
      rule.id = ruleId;
      rule.userId = userId;
      rule.globalTaskId = globalTaskId as any;
      rule.name = dto.name;
      rule.description = dto.description || '';
      rule.sourceConnectorType = dto.sourceConnectorType;
      rule.sourceConnectorId = dto.sourceConnectorId || undefined;
      rule.condition = (dto.condition as any);
      rule.actions = (dto.actions as any);
      rule.debounceConfig = (dto.debounceConfig as any) || {
        enabled: true,
        windowMs: 5000,
        maxTriggersInWindow: 1,
      };
      rule.status = dto.enabled !== false ? EventRuleStatus.ACTIVE : EventRuleStatus.PAUSED;
      rule.totalTriggers = 0;
      rule.lastTriggeredAt = undefined;
      rule.nextScheduledCheckAt = new Date();

      const saved = await this.eventRuleRepository.save(rule);

      // Step 4: Link to global task if provided
      if (globalTaskId) {
        const task = await this.globalTaskRepository.findOne({
          where: { id: globalTaskId, userId },
        });
        if (task) {
          task.linkedEventRuleId = ruleId;
          await this.globalTaskRepository.save(task);
          this.logger.log(`Rule ${ruleId} linked to task ${globalTaskId}`);
        }
      }

      // Step 5: Create audit log (use safe defaults for required fields in dev)
      const auditLog = new AuditLogEntity();
      auditLog.id = uuidv4();
      auditLog.userId = userId;
      auditLog.missionId = ruleId as any; // Use ruleId as mission placeholder
      auditLog.eventRuleId = ruleId;
      auditLog.action = 'CREATE_RULE';
      // Required audit fields - populate with benign defaults for generated rules
      auditLog.result = AuditResultStatus.SUCCESS;
      auditLog.executionProof = {};
      auditLog.cryptographicSignature = '';
      auditLog.signedByNodeId = '00000000-0000-0000-0000-000000000000';
      auditLog.nodeCertificatePem = '';
      auditLog.signatureAlgorithm = 'none';
      auditLog.signatureTimestamp = new Date();
      auditLog.verificationStatus = SignatureVerificationStatus.PENDING;
      await this.auditLogRepository.save(auditLog);

      this.logger.log(`Event rule created successfully: ${ruleId}`);

      return {
        id: ruleId,
        name: saved.name,
        status: saved.status,
        sourceConnectorType: saved.sourceConnectorType,
        sourceConnectorId: saved.sourceConnectorId || undefined,
        condition: saved.condition,
        actions: (saved.actions as any) || [],
        totalTriggers: saved.totalTriggers,
        createdAt: saved.createdAt,
        updatedAt: saved.createdAt,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Event rule creation failed: ${msg}`);
      throw new InternalServerErrorException(`Failed to create event rule: ${msg}`);
    }
  }

  /**
   * Generate rule(s) from a natural language description using the configured LLM parser.
   * If `create` is true, persist the first suggested rule and return it.
   */
  async generateEventRuleFromIntent(userId: string, description: string, create = false): Promise<any> {
    // Try to write to process.stderr  
    process.stderr.write(`\n${'█'.repeat(50)} GENERATEEVENTRULEFROMINTENT CALLED ${'█'.repeat(50)}\n`);
    console.error('█████ GENERATEEVENTRULEFROMINTENT CALLED █████');
    fs.appendFileSync('/tmp/debug.log', `[${new Date().toISOString()}] generateEventRuleFromIntent called. userId=${userId}, create=${create}, description=${description.substring(0, 50)}\n`);
    // Build enriched rule-specific LLM context
    const llmContext = await this.getEnrichedRuleContext(userId);

    // Ask the LLM parser to build rule(s)
    const parsed = await this.llmParser.buildRuleFromDescription(description, llmContext, userId);

    if (!parsed || !parsed.success) {
      return {
        success: false,
        suggestions: [],
        confidence: parsed?.confidence || 0,
      };
    }

    const suggestions = (parsed.ruleSuggestions || []).map((r: any) => ({
      description: r.description,
      trigger: r.trigger || {},
      condition: r.condition || null,
      actions: r.actions || [],
    }));
    
    fs.appendFileSync('/tmp/debug.log', `[${new Date().toISOString()}] After parsing LLM. suggestions.length=${suggestions.length}, parsed.confidence=${parsed.confidence}\n`);
    // Helper: try to resolve a suggestion into a valid CreateEventRuleDto using connector registry heuristics
    const tryResolveSuggestion = (s: any): { createDto?: CreateEventRuleDto; hints?: string[] } => {
      const hints: string[] = [];
      const connectors = this.connectorRegistry.getAllConnectors();

      // Extract tokens from suggestion to help matching
      const action = (s.actions && s.actions[0]) || {};
      const tokens = [
        (action.functionId || '').toString(),
        (action.type || '').toString(),
        (action.payload?.connector || '').toString(),
        (action.payload?.channel || '').toString(),
        (s.trigger?.type || '').toString(),
        (s.trigger?.metric || '').toString(),
        (s.description || '').toString(),
      ]
        .join(' ')
        .toLowerCase();

      // Score connectors by simple heuristics (id/name/functions)
      let best: { connector?: any; score: number } = { connector: undefined, score: 0 };
      for (const c of connectors) {
        let score = 0;
        const hay = (c.id + ' ' + (c.name || '') + ' ' + (c.displayName || '')).toLowerCase();
        if (hay.includes('slack') && tokens.includes('slack')) score += 10;
        if (tokens.includes(c.id.toLowerCase())) score += 8;
        if (hay.includes(tokens)) score += 6;

        // check functions and nodes for better match
        const fnMatch = (c.functions || []).some((f: any) => (f.id || f.name || '').toLowerCase().includes(tokens));
        if (fnMatch) score += 7;
        const nodeFnMatch = (c.nodes || []).some((n: any) => (n.availableFunctions || []).some((af: any) => (af.id || af.name || '').toLowerCase().includes(tokens)));
        if (nodeFnMatch) score += 6;

        if (score > best.score) best = { connector: c, score };
      }

      if (!best.connector || best.score < 5) {
        hints.push('Aucun connecteur évident trouvé pour cette suggestion.');
        return { hints };
      }

      const resolvedConnector = best.connector;

      // Find best function on resolved connector
      const desired = (action.functionId || action.type || '').toString().toLowerCase();
      let chosenFn: any = undefined;

      // Search top-level functions
      chosenFn = (resolvedConnector.functions || []).find((f: any) => (f.id || f.name || '').toLowerCase().includes(desired));
      if (!chosenFn) {
        // Search node-level availableFunctions
        for (const node of (resolvedConnector.nodes || [])) {
          const found = (node.availableFunctions || []).find((af: any) => (af.id || af.name || '').toLowerCase().includes(desired));
          if (found) {
            chosenFn = found;
            break;
          }
        }
      }

      // Fallback: pick a sensible write function if none matched
      if (!chosenFn) {
        chosenFn = (resolvedConnector.functions || []).find((f: any) => f.category === 'WRITE')
          || (resolvedConnector.nodes && resolvedConnector.nodes[0] && ((resolvedConnector.nodes[0].availableFunctions || [])[0]));
      }

      if (!chosenFn) {
        hints.push(`Aucun ${resolvedConnector.id} function trouvée pour l'action suggérée.`);
        return { hints };
      }

      // Build condition DTO from trigger or fallback
      let conditionDto: any = { fieldName: 'unknown', operator: ConditionOperator.EQ, value: true };
      if (s.trigger && s.trigger.type === 'metric_threshold') {
        const metric = s.trigger.metric || 'metric';
        const threshold = s.trigger.threshold ?? s.trigger.value ?? null;
        const durationSec = s.trigger.duration ?? null;
        const operator = (typeof threshold === 'number' && (s.description || '').includes('<')) ? ConditionOperator.LT : ConditionOperator.GT;
        conditionDto = {
          fieldName: metric,
          operator,
          value: threshold,
          durationMs: durationSec ? durationSec * 1000 : undefined,
        };
      } else if (s.condition && s.condition.field) {
        conditionDto = {
          fieldName: s.condition.field || 'unknown',
          operator: (s.condition.operator || 'eq') as ConditionOperator,
          value: s.condition.value || true,
          durationMs: s.condition.duration ? s.condition.duration * 1000 : undefined,
        };
      }

      // Map action parameters (handle Slack common case)
      const params: Record<string, any> = {};
      if (resolvedConnector.id === 'slack') {
        params.channel = action.payload?.channel || action.connectorId || '#ops-alerts';
        params.text = action.payload?.message || action.payload?.text || s.description || 'Alert';
      } else {
        // generic mapping: copy payload into parameters and prefer message/text fields
        Object.assign(params, action.payload || {});
        if (!params.message && (s.description || '')) params.message = s.description;
      }

      const createDto: CreateEventRuleDto = {
        name: (s.description && s.description.substring(0, 48)) || 'Generated rule',
        description: s.description || description,
        sourceConnectorType: resolvedConnector.id,
        sourceConnectorId: undefined,
        condition: conditionDto,
        actions: [
          {
            name: chosenFn.id || chosenFn.name || 'generated_action',
            parameters: params,
            order: 0,
          },
        ],
        debounceConfig: { strategy: 0, minIntervalMs: 60000, maxActionsPerHour: 20 } as any,
        enabled: true,
      } as CreateEventRuleDto;

      hints.push(`Résolution automatique: connector=${resolvedConnector.id}, action=${createDto.actions[0].name}`);
      return { createDto, hints };
    };

    if (create && suggestions.length > 0) {
      fs.appendFileSync('/tmp/debug.log', `[${new Date().toISOString()}] ✅ Entering create && suggestions path\n`);
      const s = suggestions[0];
      fs.appendFileSync('/tmp/debug.log', `[${new Date().toISOString()}] Have suggestion, calling tryResolveSuggestion\n`);
      const resolved = tryResolveSuggestion(s);
      fs.appendFileSync('/tmp/debug.log', `[${new Date().toISOString()}] resolved.createDto exists? ${!!resolved.createDto}\n`);
      if (!resolved.createDto) {
        // Return helpful error instead of failing validation
        fs.appendFileSync('/tmp/debug.log', `[${new Date().toISOString()}] No createDto - returning error\n`);
        return { success: false, suggestions, confidence: parsed.confidence, message: 'Impossible d\'affecter automatiquement la suggestion à un connecteur/fonction connu.', resolutionHints: resolved.hints || [] };
      }

      try {
        // Create a minimal GlobalTask to attach the generated rule (globalTaskId is required in DB)
        const taskId = uuidv4();
        const task = new GlobalTaskEntity();
        task.id = taskId;
        task.userId = userId;
        task.type = GlobalTaskType.MONITORING;
        task.originalUserInput = description;
        task.status = GlobalTaskStatus.PENDING;
        task.intent = {
          action: 'generated_rule',
          parameters: {},
          confidence: parsed.confidence || 0.9,
          parsingModel: 'llm',
          parsingCompletedAt: new Date(),
        } as any;
        await this.globalTaskRepository.save(task);

        // ⭐ NEW: Compile the rule before creating it
        fs.appendFileSync('/tmp/debug.log', `[${new Date().toISOString()}] About to compile rule. taskId=${taskId}\n`);
        const ruleCompilationReport = await this.compileRuleForCreation(resolved.createDto!, taskId);
        fs.appendFileSync('/tmp/debug.log', `[${new Date().toISOString()}] Compilation complete. isValid=${ruleCompilationReport.isValid}\n`);
        
        if (!ruleCompilationReport.isValid) {
          // Compilation failed - return feedback to user and LLM
          fs.appendFileSync('/tmp/debug.log', `[${new Date().toISOString()}] Compilation FAILED - returning error path\n`);
          const userMessage = this.compilationFeedback.generateUserFeedback(
            ruleCompilationReport,
            description,
          );
          const llmFeedback = this.compilationFeedback.generateLLMFeedback(
            ruleCompilationReport,
            description,
            this.connectorRegistry.getAllConnectors(),
          );
          
          return {
            success: false,
            suggestions,
            confidence: parsed.confidence,
            compilationFailed: true,
            compilationReport: ruleCompilationReport,
            userMessage,
            llmFeedback,
            resolutionHints: resolved.hints || [],
          };
        }

        const created = await this.createEventRule(userId, resolved.createDto!, taskId);
        fs.appendFileSync('/tmp/debug.log', `[${new Date().toISOString()}] Compilation PASSED - returning success with compilationReport\n`);
        return {
          success: true,
          createdRule: created,
          suggestions,
          confidence: parsed.confidence,
          compilationReport: ruleCompilationReport,
          compilationVerified: true,
          resolutionHints: resolved.hints || [],
        };
      } catch (err) {
        return { success: false, suggestions, confidence: parsed.confidence, message: `Persistance échouée: ${(err as any).message || err}`, resolutionHints: resolved.hints || [] };
      }
    }

    return { success: true, suggestions, confidence: parsed.confidence };
  }

  async getEventRuleStatus(userId: string, ruleId: string): Promise<EventRuleResponseDto> {
    try {
      const rule = await this.eventRuleRepository.findOne({
        where: { id: ruleId, userId },
      });

      if (!rule) {
        throw new NotFoundException(`Event rule ${ruleId} not found`);
      }

      return {
        id: rule.id,
        name: rule.name,
        status: rule.status,
        sourceConnectorType: rule.sourceConnectorType,
        sourceConnectorId: rule.sourceConnectorId || undefined,
        condition: rule.condition,
        actions: (rule.actions as any) || [],
        totalTriggers: rule.totalTriggers,
        lastTriggeredAt: rule.lastTriggeredAt || undefined,
        createdAt: rule.createdAt,
        updatedAt: rule.createdAt,
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(`Failed to get event rule status: ${msg}`);
    }
  }

  /**
   * Get all connector manifests
   * Used by UI and LLM service to understand capabilities
   */
  getConnectorManifests(): any[] {
    return this.connectorRegistry.getAllConnectors();
  }

  /**
   * Build complete LLM context for a user
   * Includes all connectors, functions, schemas, triggers, operators
   */
  getLLMContext(userId: string): any {
    return this.contextBuilder.buildContext(userId);
  }

  /**
   * Export LLM context as formatted JSON
   * Useful for documentation and external services
   */
  exportLLMContextJSON(userId: string): string {
    const context = this.contextBuilder.buildContext(userId);
    return this.contextBuilder.exportContextAsJSON(context);
  }

  /**
   * 🆕 Get enhanced LLM context with complex conditions and error handling
   * Includes all condition types, action types, context variables, resilience patterns
   */
  async getEnrichedLLMContext(userId: string): Promise<any> {
    return this.contextEnhanced.buildEnrichedContext(userId);
  }

  /**
   * 🆕 Get enriched LLM context specifically for rules (Module 3)
   */
  async getEnrichedRuleContext(userId: string): Promise<any> {
    return this.contextEnhanced.buildRuleContext(userId);
  }

  /**
   * 🆕 Get enriched LLM context specifically for tasks (Module 2)
   */
  async getEnrichedTaskContext(userId: string): Promise<any> {
    return this.contextEnhanced.buildTaskContext(userId);
  }

  /**
   * 🆕 Export enriched context as formatted JSON
   */
  async exportEnrichedContextJSON(userId: string): Promise<string> {
    const context = await this.contextEnhanced.buildEnrichedContext(userId);
    return this.contextEnhanced.exportContextAsJSON(context);
  }

  /**
   * 🆕 Export enriched rule context as formatted JSON
   */
  async exportEnrichedRuleContextJSON(userId: string): Promise<string> {
    const context = await this.contextEnhanced.buildRuleContext(userId);
    return this.contextEnhanced.exportContextAsJSON(context);
  }

  /**
   * 🆕 Export enriched task context as formatted JSON
   */
  async exportEnrichedTaskContextJSON(userId: string): Promise<string> {
    const context = await this.contextEnhanced.buildTaskContext(userId);
    return this.contextEnhanced.exportContextAsJSON(context);
  }

  // ============================================================================
  // 🆕 AGGREGATED CONTEXT: From all registered providers (extensible!)
  // ============================================================================

  /**
   * 🆕 Get aggregated context from ALL modules
   */
  async getAggregatedLLMContext(userId: string): Promise<any> {
    return this.contextEnhanced.buildAggregatedContext(userId);
  }

  /**
   * 🆕 Get provider-specific context
   */
  async getProviderSpecificContext(userId: string, providerId: string): Promise<any> {
    return this.contextEnhanced.getProviderSpecificContext(userId, providerId);
  }

  /**
   * 🆕 Export aggregated context as JSON
   */
  async exportAggregatedContextJSON(userId: string): Promise<string> {
    return this.contextEnhanced.exportAggregatedContextJSON(userId);
  }

  /**
   * 🆕 Export provider-specific context as JSON
   */
  async exportProviderSpecificContextJSON(userId: string, providerId: string): Promise<string> {
    return this.contextEnhanced.exportProviderSpecificContextJSON(userId, providerId);
  }

  /**
   * 🆕 Get list of all registered providers
   */
  getRegisteredProviders(): any[] {
    return this.contextEnhanced.getProvidersInfo();
  }

  private async generateMockMissions(userId: string, globalTaskId: string, task: GlobalTaskEntity): Promise<string[]> {
    const missionIds: string[] = [];
    const targetConnectorIds = task.targetConnectorIds || [];

    for (const connectorId of targetConnectorIds.slice(0, 1)) {
      const mission = new MissionEntity();
      mission.id = uuidv4();
      mission.userId = userId;
      mission.globalTaskId = globalTaskId;
      mission.eventRuleId = undefined;
      mission.status = MissionStatus.PENDING_EXECUTION;
      mission.actions = (task.intent as any)?.parameters || {};
      mission.targetNodeId = connectorId;
      mission.backupNodeIds = [];
      mission.executedByNodeId = undefined;
      mission.failoverAttempt = 0;
      mission.executionProofCollected = undefined;
      mission.estimatedDurationMs = 5000;

      const saved = await this.missionRepository.save(mission);
      missionIds.push(saved.id);
    }

    return missionIds;
  }

  /**
   * 🔨 Compile a rule before creation
   * Validates that the rule can actually execute with available connectors
   */
  private async compileRuleForCreation(dto: CreateEventRuleDto, taskId: string): Promise<any> {
    try {
      // Convert DTO to compilation format
      const rule: any = {
        id: uuidv4(),
        name: dto.name,
        trigger: {
          type: 'ON_EVENT',
          sourceConnectorType: dto.sourceConnectorType,
          sourceConnectorId: dto.sourceConnectorId,
        },
        condition: dto.condition,
        actions: dto.actions.map((a: any) => ({
          connector: dto.sourceConnectorType,
          function: a.name,
          parameters: a.parameters || {},
          retryPolicy: { retries: 0 },
          errorHandling: 'STOP',
        })),
      };

      // Get available connectors for validation
      const availableConnectors = this.connectorRegistry.getAllConnectors();

      // Validate basic structure
      const report: any = {
        ruleId: rule.id,
        ruleName: rule.name,
        isValid: true,
        totalIssues: 0,
        errorCount: 0,
        warningCount: 0,
        issues: [],
        missingRequirements: {
          connectors: [],
          agents: [],
          nodes: [],
          documents: [],
        },
        recommendations: [],
        estimatedExecutionTime: 150,
      };

      // Check 1: Trigger validation
      if (!rule.trigger.sourceConnectorType) {
        report.issues.push({
          type: 'MISSING_TRIGGER_SOURCE',
          severity: 'ERROR',
          message: 'No trigger source connector specified',
        });
        report.errorCount++;
      }

      // Check 2: Connector exists
      const connector = availableConnectors.find(
        (c: any) => c.id === rule.trigger.sourceConnectorType,
      );
      if (!connector) {
        report.issues.push({
          type: 'CONNECTOR_NOT_FOUND',
          severity: 'ERROR',
          message: `Connector '${rule.trigger.sourceConnectorType}' not found`,
          affectedComponent: rule.trigger.sourceConnectorType,
        });
        report.errorCount++;
        report.missingRequirements.connectors.push(rule.trigger.sourceConnectorType);
      }

      // Check 3: Actions validation
      for (let i = 0; i < rule.actions.length; i++) {
        const action = rule.actions[i];
        const actionConnector = availableConnectors.find((c: any) => c.id === action.connector);

        if (!actionConnector) {
          report.issues.push({
            type: 'CONNECTOR_NOT_FOUND',
            severity: 'ERROR',
            message: `Action connector '${action.connector}' not found`,
            path: `actions[${i}].connector`,
            affectedComponent: action.connector,
          });
          report.errorCount++;
          report.missingRequirements.connectors.push(action.connector);
          continue;
        }

        // Check function exists
        const functions = [
          ...(actionConnector.functions || []),
          ...((actionConnector.nodes || []).flatMap((n: any) => n.availableFunctions || [])),
        ];

        const func = functions.find(
          (f: any) => f.id === action.function || f.name === action.function,
        );

        if (!func) {
          report.issues.push({
            type: 'FUNCTION_NOT_FOUND',
            severity: 'ERROR',
            message: `Function '${action.function}' not found in connector '${action.connector}'`,
            path: `actions[${i}].function`,
            affectedComponent: action.function,
            suggestion: `Available functions: ${functions.map((f: any) => f.id || f.name).join(', ')}`,
          });
          report.errorCount++;
        }
      }

      // Check 4: Data flow validation
      report.dataFlow = [
        {
          stepId: 'trigger',
          stepName: 'Trigger',
          outputs: [{ name: '$event', type: 'object' }],
        },
        {
          stepId: 'condition',
          stepName: 'Condition',
          inputs: [{ name: '$event' }],
          outputs: [{ name: '$result', type: 'boolean' }],
        },
        ...rule.actions.map((a: any, i: number) => ({
          stepId: i,
          stepName: `Action ${i + 1}: ${a.function}`,
          inputs: [{ name: '$event' }],
          outputs: [{ name: `$step${i}`, type: 'object' }],
        })),
      ];

      // Set validity
      report.isValid = report.errorCount === 0;
      report.totalIssues = report.errorCount + report.warningCount;

      this.logger.log(`Compilation result: ${report.isValid ? 'VALID ✓' : 'INVALID ✗'}`);
      if (!report.isValid) {
        this.logger.warn(`Compilation issues: ${JSON.stringify(report.issues)}`);
      }

      return report;
    } catch (error) {
      this.logger.error(`Compilation error: ${(error as any).message}`);
      return {
        ruleId: uuidv4(),
        ruleName: dto.name,
        isValid: false,
        errorCount: 1,
        issues: [
          {
            type: 'COMPILATION_ERROR',
            severity: 'ERROR',
            message: `Compilation error: ${(error as any).message}`,
          },
        ],
        missingRequirements: {
          connectors: [],
          agents: [],
          nodes: [],
          documents: [],
        },
      };
    }
  }
}

