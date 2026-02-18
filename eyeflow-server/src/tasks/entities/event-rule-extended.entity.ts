/**
 * EXTENDED EVENT RULE ENTITY
 * 
 * Extends the simple EventRuleEntity to support:
 * - Composed conditions (SERVICE_CALL, DATABASE_QUERY, nested, boolean logic)
 * - Composed actions (CHAINED, CONDITIONAL, PARALLEL)
 * - References to other documents (for cross-document validation)
 * - Complex trigger types
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { EventRuleStatus, RuleApprovalStatus } from '../types/task.types';

/**
 * Complex condition types that EventRule now supports
 */
export enum ConditionType {
  SIMPLE = 'SIMPLE',                    // field/operator/value
  SERVICE_CALL = 'SERVICE_CALL',        // Call external service for validation
  DATABASE_QUERY = 'DATABASE_QUERY',    // Query database for decision
  COMPOSITE = 'COMPOSITE',              // Multiple conditions with AND/OR logic
  LLM_ANALYSIS = 'LLM_ANALYSIS',        // Use LLM to analyze data
  ML_PREDICTION = 'ML_PREDICTION',      // ML model predictions
  PATTERN_MATCH = 'PATTERN_MATCH',      // Regex/keyword matching
}

/**
 * Action execution model
 */
export enum ActionExecutionMode {
  SEQUENTIAL = 'SEQUENTIAL',    // Actions run one after another (CHAINED)
  CONDITIONAL = 'CONDITIONAL',  // Execute IF condition is true
  PARALLEL = 'PARALLEL',        // Actions run simultaneously
}

/**
 * A single action step
 */
export interface ActionStep {
  // Identification
  stepId: string;
  stepIndex: number;

  // What to do (connector + function)
  connector: string;
  function: string;

  // Parameters (can reference $event, $result, $step0, etc)
  parameters: Record<string, any>;

  // Execution policy
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };

  // Error handling
  onError?: {
    strategy: 'SKIP' | 'RETRY' | 'FAIL' | 'FALLBACK';
    fallbackAction?: ActionStep;
  };

  // Condition for this action (if ExecutionMode is CONDITIONAL)
  executionCondition?: {
    type: ConditionType;
    definition: any;
  };
}

/**
 * Composed action definition
 */
export interface ComposedAction {
  mode: ActionExecutionMode;
  steps: ActionStep[];

  // Error handling at action group level
  onGroupError?: {
    strategy: 'ABORT' | 'CONTINUE' | 'COMPENSATE';
    compensation?: ActionStep[];
  };
}

/**
 * Cross-document reference
 * Ex: "Use schema from doc:customer-validation-schema"
 */
export interface DocumentReference {
  documentId: string;
  documentName?: string;
  fieldPath?: string; // If nested in the document
  usedFor: 'SCHEMA_VALIDATION' | 'COMPARISON' | 'LOOKUP' | 'ENRICHMENT';
}

/**
 * Extended EventRuleEntity
 * Backwards compatible with simple rules, but supports complex ones too
 */
@Entity('event_rules_extended')
@Index(['userId', 'status'])
@Index(['sourceConnectorType', 'status'])
@Index(['globalTaskId'])
@Index(['complexity'])
export class EventRuleExtendedEntity {
  // ==========================================
  // PRIMARY IDENTIFIERS
  // ==========================================

  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  globalTaskId!: string;

  // ==========================================
  // DESCRIPTION
  // ==========================================

  @ApiProperty()
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  description?: string;

  // ==========================================
  // RULE COMPLEXITY & CAPABILITY TRACKING
  // ==========================================

  @ApiProperty({ enum: ['SIMPLE', 'COMPOSED', 'ADVANCED'] })
  @Column({ type: 'varchar', length: 20, default: 'SIMPLE' })
  complexity!: 'SIMPLE' | 'COMPOSED' | 'ADVANCED';

  /**
   * Capabilities this rule uses (for filtering/auditing)
   * Example: ['SERVICE_CALL', 'CHAINED_ACTIONS', 'DOCUMENT_REFERENCE']
   */
  @ApiProperty({ type: [String], nullable: true })
  @Column({ type: 'text', array: true, nullable: true })
  usedCapabilities!: string[];

  // ==========================================
  // DATA SOURCE
  // ==========================================

  @ApiProperty()
  @Column({ type: 'varchar', length: 100 })
  sourceConnectorType!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  @Column({ type: 'uuid', nullable: true })
  sourceConnectorId?: string;

  // ==========================================
  // TRIGGER DEFINITION (the "WHEN")
  // ==========================================

  @ApiProperty({ type: Object })
  @Column({ type: 'jsonb', nullable: true })
  trigger?: {
    type: 'ON_CREATE' | 'ON_UPDATE' | 'ON_DELETE' | 'ON_SCHEDULE' | 'ON_EVENT'; 
    source: string; // connector or scheduler
    filters?: Record<string, any>;
    interval?: string; // For ON_SCHEDULE (e.g., "5m")
  };

  // ==========================================
  // CONDITION DEFINITION (the "IF" clause) - NOW COMPLEX!
  // ==========================================

  @ApiProperty({ enum: ConditionType })
  @Column({ type: 'varchar', length: 50 })
  conditionType!: ConditionType;

  @ApiProperty({ type: Object })
  @Column({ type: 'jsonb' })
  condition!: any; // Can be simple or complex based on conditionType

  /**
   * For composed conditions: sub-conditions with boolean logic
   */
  @ApiProperty({ type: [Object], nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  composedConditions?: Array<{
    type: ConditionType;
    definition: any;
    operator?: 'AND' | 'OR';
  }>;

  // ==========================================
  // ACTION DEFINITIONS (the "THEN" clause) - NOW COMPLEX!
  // ==========================================

  /**
   * Simple mode: just function IDs (legacy)
   * Used when complexity === 'SIMPLE'
   */
  @ApiProperty({ type: [String], nullable: true })
  @Column({ type: 'text', array: true, nullable: true })
  actions?: string[];

  /**
   * Complex mode: composed action with steps, retry, error handling
   * Used when complexity === 'COMPOSED' or 'ADVANCED'
   */
  @ApiProperty({ type: Object, nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  composedAction?: ComposedAction;

  // ==========================================
  // CROSS-DOCUMENT REFERENCES
  // For rules that validate against schemas or enrich with data from other docs
  // ==========================================

  @ApiProperty({ type: [Object], nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  documentReferences?: DocumentReference[];

  // ==========================================
  // RULE COMPOSITION METADATA
  // Shows how this rule was generated
  // ==========================================

  @ApiProperty({ type: Object, nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  generationMetadata?: {
    generatedByLLM: boolean;
    llmModel?: string;
    llmConfidence?: number;
    generatedAt?: string;
    userIntent?: string; // Original user request
    capabilities?: {
      supportsServiceCalls: boolean;
      supportsDatabaseQueries: boolean;
      supportsChaining: boolean;
      supportsConditionalActions: boolean;
    };
  };

  // ==========================================
  // DEBOUNCE CONFIGURATION (Prevent spam)
  // ==========================================

  @ApiProperty({ type: Object })
  @Column({ type: 'jsonb' })
  debounceConfig!: {
    enabled: boolean;
    strategy: 'IMMEDIATE' | 'DEBOUNCE' | 'THROTTLE';
    minIntervalMs?: number;
    maxActionsPerHour?: number;
  };

  // ==========================================
  // EXECUTION LIMITS & SAFEGUARDS
  // ==========================================

  @ApiProperty()
  @Column({ type: 'integer', default: 30 })
  executionTimeoutSeconds!: number;

  @ApiProperty()
  @Column({ type: 'integer', default: 5 })
  maxExecutionRetries!: number;

  @ApiProperty()
  @Column({ type: 'boolean', default: false })
  requiresApprovalBeforeExecution!: boolean;

  // ==========================================
  // COMPILATION & APPROVAL STATE
  // ==========================================

  @ApiProperty({ enum: RuleApprovalStatus })
  @Column({
    type: 'varchar',
    length: 30,
    default: RuleApprovalStatus.DRAFT,
    nullable: true,
  })
  approvalStatus?: RuleApprovalStatus;

  @ApiProperty({ format: 'uuid', nullable: true })
  @Column({ type: 'uuid', nullable: true })
  compilationId?: string;

  @ApiProperty({ type: Object, nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  compilationReport?: any; // Full CompilationReport object

  @ApiProperty({ type: Object, nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  dag?: any; // DAGVisualization object

  @ApiProperty({ type: Object, nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  userApprovalFeedback?: {
    approved: boolean;
    feedback: string;
    approvedAt: Date;
    approvedBy: string; // userId
  };

  @ApiProperty({ type: String, nullable: true })
  @Column({ type: 'text', nullable: true })
  userMessage?: string; // Rejection reason or user feedback

  // ==========================================
  // STATUS & LIFECYCLE
  // ==========================================

  @ApiProperty({ enum: EventRuleStatus })
  @Column({
    type: 'enum',
    enum: EventRuleStatus,
  })
  status!: EventRuleStatus;

  // ==========================================
  // AUDIT & HISTORY
  // ==========================================

  @ApiProperty()
  @CreateDateColumn()
  createdAt!: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'integer', default: 0 })
  timesTriggered!: number;

  @Column({ type: 'integer', default: 0 })
  timesSucceeded!: number;

  @Column({ type: 'integer', default: 0 })
  timesFailed!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  lastError?: string;

  @Column({ type: 'timestamp', nullable: true })
  lastExecutionAt?: Date;

  // ==========================================
  // TAGS AND CATEGORIZATION
  // ==========================================

  @ApiProperty({ type: [String], nullable: true })
  @Column({ type: 'text', array: true, nullable: true })
  tags!: string[];
}

/**
 * Type guard: Check if this is a composed rule
 */
export function isComposedRule(rule: EventRuleExtendedEntity): boolean {
  return rule.complexity !== 'SIMPLE' && rule.composedAction !== undefined;
}

/**
 * Type guard: Check if rule has document references
 */
export function hasDocumentReferences(rule: EventRuleExtendedEntity): boolean {
  return rule.documentReferences !== undefined && rule.documentReferences.length > 0;
}

/**
 * Translate a composed rule to a human-readable description
 */
export function describeComposedRule(rule: EventRuleExtendedEntity): string {
  if (!isComposedRule(rule)) {
    return rule.name || 'Simple rule';
  }

  let description = `Rule: ${rule.name}\n`;
  description += `Complex rule with ${rule.complexity} composition\n`;
  description += `Capabilities: ${rule.usedCapabilities.join(', ')}\n`;

  if (hasDocumentReferences(rule) && rule.documentReferences) {
    description += `References: ${rule.documentReferences.map(d => `${d.documentName}(${d.usedFor})`).join(', ')}\n`;
  }

  const action = rule.composedAction;
  if (action) {
    description += `Execution: ${action.mode} with ${action.steps.length} steps\n`;
    action.steps.forEach((step, i) => {
      description += `  Step ${i + 1}: ${step.connector}.${step.function}()\n`;
    });
  }

  return description;
}
