/**
 * INTEGRATION EXAMPLE
 * 
 * How to integrate LLMContextEnricherService into task-compiler.service.ts
 * to enable powerful rule generation with full context
 * 
 * This file shows the EXACT CODE CHANGES needed
 */

// ============================================================
// PART 1: Add imports
// ============================================================

import { LLMContextEnricherService } from './llm-context-enricher.service';
import { EventRuleExtendedEntity, ConditionType, ActionExecutionMode, ComposedAction, ActionStep, DocumentReference } from '../entities/event-rule-extended.entity';

// ============================================================
// PART 2: Inject the enricher service
// ============================================================

export class TaskCompilerService {
  constructor(
    // ... existing injections
    private llmContextEnhanced: LLMContextEnhancedService,
    private llmParser: LLMIntentParserService,
    private contextEnricher: LLMContextEnricherService,  // 🔷 ADD THIS
    private connectorRegistry: ConnectorRegistryService,
    private eventRuleRepository: Repository<EventRuleEntity>,
    private globalTaskRepository: Repository<GlobalTaskEntity>,
    // ... rest
  ) {}

  // ============================================================
  // PART 3: ENHANCED VERSION OF generateEventRuleFromIntent
  // ============================================================

  async generateEventRuleFromIntentEnhanced(
    userId: string,
    description: string,
    create = false,
  ): Promise<any> {
    try {
      // Step 1: Get base LLM context
      const baseContext = await this.llmContextEnhanced.getContext();

      // 🔷 Step 2: ENRICH context with documents and complex examples
      // This is the key difference - the LLM now knows about complex patterns!
      const enrichedContext = await this.contextEnricher.enrichContextForComplexRuleGeneration(
        baseContext,
        userId,
        {
          // In real app, fetch actual documents from database
          availableDocuments: await this.getAvailableDocuments(userId),
          userHint: description, // Optional: hint about what user is trying to do
        },
      );

      // Step 3: Call LLM with rich context
      this.logger.log(
        `🔷 Calling LLM with enriched context (${enrichedContext.availableDocuments?.length || 0} docs, ${enrichedContext.advancedExampleRules?.length || 0} examples)`,
      );

      const parsed = await this.llmParser.buildRuleFromDescription(
        description,
        enrichedContext, // 🔷 Pass enriched context!
        userId,
      );

      if (!parsed.success) {
        return {
          success: false,
          message: 'LLM could not understand intent',
          confidence: parsed.confidence,
        };
      }

      // Step 4: Process suggestions - include complexity level
      const suggestions = parsed.ruleSuggestions || [];

      this.logger.log(
        `✅ LLM generated ${suggestions.length} rule suggestions (confidence: ${parsed.confidence})`,
      );

      // For preview mode (create=false), just return suggestions
      if (!create) {
        return {
          success: true,
          suggestions: suggestions.map((s) => ({
            ...s,
            // 🔷 Indicate which ones are complex
            complexity: this.assessRuleComplexity(s),
            capabilities: this.extractCapabilities(s),
          })),
          confidence: parsed.confidence,
          enrichmentInfo: {
            documentsConsidered: enrichedContext.availableDocuments?.map(d => d.name),
            patternsApplied: enrichedContext.compositionPatterns?.map(p => p.name),
          },
        };
      }

      // Step 5: For creation mode, create extended rules
      if (suggestions.length === 0) {
        return {
          success: false,
          suggestions,
          confidence: parsed.confidence,
          message: 'No valid rule suggestions from LLM',
        };
      }

      // 🔷 Use first suggestion to create EXTENDED rule
      const suggestion = suggestions[0];
      const complexity = this.assessRuleComplexity(suggestion);
      const hints: string[] = [];

      let createdRule;

      // Create GlobalTask placeholder
      const taskId = uuidv4();
      const task = new GlobalTaskEntity();
      task.id = taskId;
      task.userId = userId;
      task.type = GlobalTaskType.MONITORING;
      task.status = GlobalTaskStatus.ACTIVE;
      task.originalUserInput = description;
      task.intent = {
        action: 'generated_rule',
        parameters: {},
        confidence: parsed.confidence,
        parsingModel: 'llm',
        parsingCompletedAt: new Date(),
      };
      await this.globalTaskRepository.save(task);

      // 🔷 If simple rule: use basic EventRuleEntity
      if (complexity === 'SIMPLE') {
        const createDto = this.suggestToEventRuleCreateDto(suggestion);
        createdRule = await this.createEventRule(userId, createDto, taskId);
        hints.push(`Created simple rule: ${createDto.name}`);
      }
      // 🔷 If complex rule: use EventRuleExtendedEntity
      else {
        createdRule = await this.createExtendedEventRule(userId, suggestion, taskId, complexity);
        hints.push(`Created ${complexity} rule with capabilities: ${this.extractCapabilities(suggestion).join(', ')}`);

        // Add hints about document references
        if (suggestion.documentReferences && suggestion.documentReferences.length > 0) {
          hints.push(
            `Rule references: ${suggestion.documentReferences.map(d => d.name || d.id).join(', ')}`,
          );
        }
      }

      return {
        success: true,
        createdRule: {
          id: createdRule.id,
          name: createdRule.name,
          status: createdRule.status,
          complexity, // 🔷 Include complexity
          sourceConnectorType: createdRule.sourceConnectorType,
        },
        suggestions: suggestions.map((s) => ({
          ...s,
          complexity: this.assessRuleComplexity(s),
        })),
        confidence: parsed.confidence,
        resolutionHints: hints,
      };
    } catch (error) {
      this.logger.error(`❌ generateEventRuleFromIntent failed: ${error}`);
      return {
        success: false,
        message: error.message,
        confidence: 0,
      };
    }
  }

  // ============================================================
  // PART 4: NEW METHOD - Create Extended Rule
  // ============================================================

  private async createExtendedEventRule(
    userId: string,
    suggestion: any,
    globalTaskId: string,
    complexity: 'SIMPLE' | 'COMPOSED' | 'ADVANCED',
  ): Promise<EventRuleExtendedEntity> {
    const extendedRule = new EventRuleExtendedEntity();

    extendedRule.userId = userId;
    extendedRule.globalTaskId = globalTaskId;
    extendedRule.name = suggestion.name || suggestion.description || 'Generated Rule';
    extendedRule.description = suggestion.description;

    // 🔷 Mark complexity level
    extendedRule.complexity = complexity;

    // 🔷 Extract capabilities used in this rule
    extendedRule.usedCapabilities = this.extractCapabilities(suggestion);

    // 🔷 Source connector
    extendedRule.sourceConnectorType = suggestion.trigger?.source || 'unknown';

    // 🔷 Store trigger
    extendedRule.trigger = suggestion.trigger;

    // 🔷 CONDITION: Determine if it's simple or complex
    if (suggestion.conditions && suggestion.conditions.length > 0 && suggestion.conditions[0].type === 'SERVICE_CALL') {
      extendedRule.conditionType = ConditionType.SERVICE_CALL;
      extendedRule.condition = suggestion.conditions[0];
      extendedRule.usedCapabilities.push('SERVICE_CALL');
    } else if (suggestion.conditions && suggestion.conditions.length > 1) {
      extendedRule.conditionType = ConditionType.COMPOSITE;
      extendedRule.composedConditions = suggestion.conditions;
      extendedRule.condition = suggestion.conditions[0]; // Fallback
      extendedRule.usedCapabilities.push('COMPOSITE_CONDITIONS');
    } else {
      extendedRule.conditionType = ConditionType.SIMPLE;
      extendedRule.condition = suggestion.condition || {};
    }

    // 🔷 ACTIONS: Determine if they're simple or composed
    if (
      suggestion.actions &&
      Array.isArray(suggestion.actions) &&
      suggestion.actions.length > 1
    ) {
      // Multiple actions → compose them
      extendedRule.composedAction = {
        mode: 'SEQUENTIAL' as ActionExecutionMode,
        steps: suggestion.actions.map((action, index) => ({
          stepId: `step-${index}`,
          stepIndex: index,
          connector: action.connector || action.payload?.connector || 'unknown',
          function: action.function || action.type || 'execute',
          parameters: action.params || action.payload || {},
        })),
      };
      extendedRule.usedCapabilities.push('CHAINED_ACTIONS');
    } else if (suggestion.actionType === 'CONDITIONAL') {
      // Conditional actions
      extendedRule.composedAction = {
        mode: ActionExecutionMode.CONDITIONAL,
        steps: this.buildConditionalActionSteps(suggestion),
      };
      extendedRule.usedCapabilities.push('CONDITIONAL_ACTIONS');
    } else {
      // Single action → simple
      if (suggestion.actions && suggestion.actions.length > 0) {
        extendedRule.actions = suggestion.actions.map(
          (a) => a.connector + '.' + (a.function || a.type),
        );
      }
    }

    // 🔷 DOCUMENT REFERENCES
    if (suggestion.documentReferences && suggestion.documentReferences.length > 0) {
      extendedRule.documentReferences = suggestion.documentReferences;
      extendedRule.usedCapabilities.push('DOCUMENT_REFERENCE');
    }

    // 🔷 GENERATION METADATA
    extendedRule.generationMetadata = {
      generatedByLLM: true,
      llmModel: 'claude-3-haiku',
      llmConfidence: suggestion.confidence || 0.9,
      generatedAt: new Date().toISOString(),
      userIntent: suggestion.description,
      capabilities: {
        supportsServiceCalls: extendedRule.conditionType === ConditionType.SERVICE_CALL,
        supportsDatabaseQueries: extendedRule.conditionType === ConditionType.DATABASE_QUERY,
        supportsChaining: extendedRule.composedAction?.mode === ActionExecutionMode.SEQUENTIAL,
        supportsConditionalActions: extendedRule.composedAction?.mode === ActionExecutionMode.CONDITIONAL,
      },
    };

    // 🔷 Safety settings
    extendedRule.status = EventRuleStatus.ACTIVE;
    extendedRule.executionTimeoutSeconds = 30;
    extendedRule.requiresApprovalBeforeExecution = complexity === 'ADVANCED';
    extendedRule.debounceConfig = {
      enabled: true,
      strategy: 'DEBOUNCE',
      minIntervalMs: 1000,
      maxActionsPerHour: 100,
    };

    // Save to database
    const saved = await this.eventRuleExtendedRepository.save(extendedRule);
    this.logger.log(`✅ Created ${complexity} extended rule: ${saved.id}`);

    return saved;
  }

  // ============================================================
  // PART 5: HELPER METHODS
  // ============================================================

  /**
   * Assess rule complexity
   */
  private assessRuleComplexity(suggestion: any): 'SIMPLE' | 'COMPOSED' | 'ADVANCED' {
    const capabilities = this.extractCapabilities(suggestion);

    // Complex: uses SERVICE_CALL, DATABASE_QUERY, or composition
    if (
      capabilities.includes('SERVICE_CALL') ||
      capabilities.includes('DATABASE_QUERY') ||
      capabilities.includes('CHAINED_ACTIONS') ||
      capabilities.includes('CONDITIONAL_ACTIONS')
    ) {
      return capabilities.length > 2 ? 'ADVANCED' : 'COMPOSED';
    }

    return 'SIMPLE';
  }

  /**
   * Extract capabilities used by a rule
   */
  private extractCapabilities(suggestion: any): string[] {
    const capabilities = new Set<string>();

    // Check condition types
    if (suggestion.conditions) {
      suggestion.conditions.forEach((c: any) => {
        if (c.type === 'SERVICE_CALL') capabilities.add('SERVICE_CALL');
        if (c.type === 'DATABASE_QUERY') capabilities.add('DATABASE_QUERY');
      });
    }

    // Check action types
    if (suggestion.actions) {
      if (Array.isArray(suggestion.actions) && suggestion.actions.length > 1) {
        capabilities.add('CHAINED_ACTIONS');
      }
    }

    if (suggestion.actionType === 'CONDITIONAL') {
      capabilities.add('CONDITIONAL_ACTIONS');
    }

    // Check document references
    if (suggestion.documentReferences && suggestion.documentReferences.length > 0) {
      capabilities.add('DOCUMENT_REFERENCE');
    }

    return Array.from(capabilities);
  }

  /**
   * Build conditional action steps
   */
  private buildConditionalActionSteps(suggestion: any): ActionStep[] {
    const steps: ActionStep[] = [];

    if (suggestion.ifTrue && Array.isArray(suggestion.ifTrue)) {
      suggestion.ifTrue.forEach((action, index) => {
        steps.push({
          stepId: `if-true-${index}`,
          stepIndex: index * 2,
          connector: action.connector || 'unknown',
          function: action.function || action.type,
          parameters: action.params || action.payload || {},
          executionCondition: {
            type: ConditionType.SIMPLE,
            definition: { field: '$result.condition', operator: 'EQ', value: true },
          },
        });
      });
    }

    if (suggestion.ifFalse && Array.isArray(suggestion.ifFalse)) {
      suggestion.ifFalse.forEach((action, index) => {
        steps.push({
          stepId: `if-false-${index}`,
          stepIndex: index * 2 + 1,
          connector: action.connector || 'unknown',
          function: action.function || action.type,
          parameters: action.params || action.payload || {},
          executionCondition: {
            type: ConditionType.SIMPLE,
            definition: { field: '$result.condition', operator: 'EQ', value: false },
          },
        });
      });
    }

    return steps;
  }

  /**
   * Get available documents for context enrichment
   * In real system, fetch from DocumentService
   */
  private async getAvailableDocuments(userId: string): Promise<any[]> {
    // TODO: Implement document fetching from DocumentService
    // For now, return mock documents
    return [
      {
        id: 'schema-invoice',
        name: 'Invoice Validation Schema',
        type: 'SCHEMA',
      },
      {
        id: 'config-compliance',
        name: 'Compliance Configuration',
        type: 'CONFIG',
      },
    ];
  }

  /**
   * Convert simple suggestion to EventRuleEntity DTO
   */
  private suggestToEventRuleCreateDto(suggestion: any): any {
    return {
      name: suggestion.name || 'Generated Rule',
      description: suggestion.description,
      sourceConnectorType: suggestion.trigger?.source || 'unknown',
      condition: suggestion.condition || {},
      actions: suggestion.actions?.map((a: any) => a.connector + '.' + (a.type || a.function)) || [],
    };
  }
}

// ============================================================
// PART 6: DATABASE MIGRATION
// ============================================================

/**
 * TypeORM migration to create event_rules_extended table
 * 
 * File: src/database/migrations/CreateEventRulesExtended.ts
 */
export class CreateEventRulesExtended {
  public async up(queryRunner: any): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE event_rules_extended (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        userId UUID NOT NULL,
        globalTaskId UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        complexity VARCHAR(20) NOT NULL DEFAULT 'SIMPLE',
        usedCapabilities TEXT[] DEFAULT ARRAY[]::TEXT[],
        sourceConnectorType VARCHAR(100) NOT NULL,
        sourceConnectorId UUID,
        trigger JSONB,
        conditionType VARCHAR(50) NOT NULL DEFAULT 'SIMPLE',
        condition JSONB NOT NULL,
        composedConditions JSONB,
        actions TEXT[],
        composedAction JSONB,
        documentReferences JSONB[] DEFAULT ARRAY[]::JSONB[],
        generationMetadata JSONB,
        debounceConfig JSONB NOT NULL DEFAULT '{
          "enabled": true,
          "strategy": "DEBOUNCE",
          "minIntervalMs": 1000,
          "maxActionsPerHour": 100
        }'::JSONB,
        executionTimeoutSeconds INT DEFAULT 30,
        maxExecutionRetries INT DEFAULT 5,
        requiresApprovalBeforeExecution BOOLEAN DEFAULT FALSE,
        status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        timesTriggered INT DEFAULT 0,
        timesSucceeded INT DEFAULT 0,
        timesFailed INT DEFAULT 0,
        lastError VARCHAR(500),
        lastExecutionAt TIMESTAMP,
        tags TEXT[] DEFAULT ARRAY[]::TEXT[],
        FOREIGN KEY (globalTaskId) REFERENCES global_tasks(id) ON DELETE CASCADE,
        INDEX (userId, status),
        INDEX (sourceConnectorType, status),
        INDEX (complexity)
      )
    `);
  }

  public async down(queryRunner: any): Promise<void> {
    await queryRunner.dropTable('event_rules_extended');
  }
}
