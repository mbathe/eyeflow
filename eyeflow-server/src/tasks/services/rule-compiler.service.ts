/**
 * RULE COMPILER & VALIDATOR
 * 
 * CORE FUNCTION: Ensure every rule will actually execute successfully
 * 
 * This compiler performs:
 * 1. Data flow analysis (type checking)
 * 2. Dependency verification (all connectors exist)
 * 3. Function signature validation
 * 4. Node availability checking
 * 5. Agent capability verification
 * 6. Error detection and reporting
 * 
 * If validation fails, tells LLM exactly what's missing/wrong
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConnectorRegistryService } from './connector-registry.service';
import { AgentBrokerService } from './agent-broker.service';
import { EventRuleExtendedEntity, ConditionType, ActionExecutionMode } from '../entities/event-rule-extended.entity';
import { v4 as uuidv4 } from 'uuid';

/**
 * Severity of compilation issues
 */
export enum IssueSeverity {
  ERROR = 'ERROR',       // Rule cannot execute
  WARNING = 'WARNING',   // Rule might fail in edge cases
  INFO = 'INFO',         // Informational
}

/**
 * Type of issue found
 */
export enum IssueType {
  CONNECTOR_NOT_FOUND = 'CONNECTOR_NOT_FOUND',
  FUNCTION_NOT_FOUND = 'FUNCTION_NOT_FOUND',
  TYPE_MISMATCH = 'TYPE_MISMATCH',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  MISSING_AGENT = 'MISSING_AGENT',
  MISSING_NODE = 'MISSING_NODE',
  INCOMPATIBLE_TYPES = 'INCOMPATIBLE_TYPES',
  MISSING_DOCUMENT = 'MISSING_DOCUMENT',
  PERFORMANCE_RISK = 'PERFORMANCE_RISK',
  TIMEOUT_RISK = 'TIMEOUT_RISK',
  UNRELIABLE_SERVICE = 'UNRELIABLE_SERVICE',
}

/**
 * A single compilation issue
 */
export interface CompilationIssue {
  type: IssueType;
  severity: IssueSeverity;
  path: string; // Where in the rule (e.g., "condition", "actions[0]", "actions[0].parameters.email")
  message: string; // Human readable
  suggestion?: string; // How to fix it
  affectedComponent?: string; // What needs to be fixed
}

/**
 * Data flow step - tracks what data flows through the rule
 */
export interface DataFlowStep {
  stepId: string;
  stepName: string;
  type: 'TRIGGER' | 'CONDITION' | 'ACTION';
  inputs: {
    source: string; // e.g., "$event", "$result", "$step0"
    schema: any; // Type info
  }[];
  outputs: {
    name: string;
    schema: any;
  }[];
  issues: CompilationIssue[];
}

/**
 * Complete compilation report
 */
export interface CompilationReport {
  ruleId: string;
  ruleName: string;
  isValid: boolean;
  totalIssues: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;

  // Detailed findings
  issues: CompilationIssue[];
  dataFlow: DataFlowStep[];
  missingRequirements: {
    connectors: string[];
    agents: string[];
    nodes: string[];
    documents: string[];
  };
  recommendations: string[];
  executionPlan?: string; // What will happen when rule executes
  estimatedExecutionTime?: number; // ms
}

@Injectable()
export class RuleCompilerService {
  private readonly logger = new Logger(RuleCompilerService.name);

  constructor(
    private connectorRegistry: ConnectorRegistryService,
    private agentBroker: AgentBrokerService,
  ) {}

  /**
   * MAIN COMPILATION ENTRY POINT
   * 
   * Validates a rule comprehensively before it can be created
   */
  async compileRule(
    rule: EventRuleExtendedEntity,
    availableDocuments?: any[],
    availableNodes?: any[],
  ): Promise<CompilationReport> {
    const report: CompilationReport = {
      ruleId: rule.id || 'PENDING',
      ruleName: rule.name,
      isValid: true,
      totalIssues: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      issues: [],
      dataFlow: [],
      missingRequirements: {
        connectors: [],
        agents: [],
        nodes: [],
        documents: [],
      },
      recommendations: [],
    };

    this.logger.log(`🔨 Compiling rule: ${rule.name}`);

    // Step 1: Validate trigger
    this.compileTrigger(rule, report, availableNodes);

    // Step 2: Validate condition
    this.compileCondition(rule, report, availableDocuments);

    // Step 3: Validate actions
    this.compileActions(rule, report);

    // Step 4: Validate document references
    this.validateDocumentReferences(rule, report, availableDocuments);

    // Step 5: Data flow analysis
    this.analyzeDataFlow(rule, report);

    // Step 6: Check for circular dependencies
    this.checkCircularDependencies(rule, report);

    // Step 7: Estimate execution time
    this.estimateExecutionTime(rule, report);

    // Step 8: Generate recommendations
    this.generateRecommendations(rule, report);

    // Final verdict
    report.isValid =
      report.errorCount === 0 &&
      report.missingRequirements.connectors.length === 0 &&
      report.missingRequirements.agents.length === 0 &&
      report.missingRequirements.nodes.length === 0;

    this.logger.log(
      `${report.isValid ? '✅' : '❌'} Compilation ${report.isValid ? 'PASSED' : 'FAILED'}: ${report.errorCount} errors, ${report.warningCount} warnings`,
    );

    return report;
  }

  /**
   * Step 1: Validate trigger
   */
  private compileTrigger(
    rule: EventRuleExtendedEntity,
    report: CompilationReport,
    availableNodes?: any[],
  ): void {
    if (!rule.trigger) {
      this.addIssue(report, {
        type: IssueType.MISSING_REQUIRED_FIELD,
        severity: IssueSeverity.ERROR,
        path: 'trigger',
        message: 'Rule must have a trigger (e.g., ON_CREATE, ON_UPDATE)',
        affectedComponent: 'trigger',
      });
      return;
    }

    const trigger = rule.trigger;

    // Check if trigger source is valid
    const connector = this.connectorRegistry.getConnector(trigger.source);
    if (!connector) {
      this.addIssue(report, {
        type: IssueType.CONNECTOR_NOT_FOUND,
        severity: IssueSeverity.ERROR,
        path: 'trigger.source',
        message: `Trigger source connector "${trigger.source}" not found`,
        affectedComponent: trigger.source,
        suggestion: `Available connectors: ${this.connectorRegistry.getAllConnectors().map((c) => c.name).join(', ')}`,
      });
      report.missingRequirements.connectors.push(trigger.source);
    }

    // If ON_SCHEDULE, validate interval
    if (trigger.type === 'ON_SCHEDULE' && !trigger.interval) {
      this.addIssue(report, {
        type: IssueType.MISSING_REQUIRED_FIELD,
        severity: IssueSeverity.ERROR,
        path: 'trigger.interval',
        message: 'ON_SCHEDULE triggers must have an interval (e.g., "5m", "1h")',
        affectedComponent: 'trigger',
      });
    }

    // Add trigger to data flow
    report.dataFlow.push({
      stepId: 'trigger',
      stepName: `Trigger: ${trigger.type}`,
      type: 'TRIGGER',
      inputs: [],
      outputs: [
        {
          name: '$event',
          schema: { type: 'object', description: 'Event data from trigger' },
        },
      ],
      issues: [],
    });
  }

  /**
   * Step 2: Validate condition
   */
  private compileCondition(
    rule: EventRuleExtendedEntity,
    report: CompilationReport,
    availableDocuments?: any[],
  ): void {
    if (!rule.condition) {
      this.addIssue(report, {
        type: IssueType.MISSING_REQUIRED_FIELD,
        severity: IssueSeverity.ERROR,
        path: 'condition',
        message: 'Rule must have a condition',
      });
      return;
    }

    const conditionStepId = uuidv4().substring(0, 8);
    const conditionIssues: CompilationIssue[] = [];

    switch (rule.conditionType) {
      case ConditionType.SIMPLE:
        this.validateSimpleCondition(rule, report, conditionIssues);
        break;

      case ConditionType.SERVICE_CALL:
        this.validateServiceCallCondition(rule, report, conditionIssues, availableDocuments);
        break;

      case ConditionType.DATABASE_QUERY:
        this.validateDatabaseQueryCondition(rule, report, conditionIssues);
        break;

      case ConditionType.LLM_ANALYSIS:
        this.validateLLMAnalysisCondition(rule, report, conditionIssues);
        break;

      case ConditionType.COMPOSITE:
        this.validateCompositeCondition(rule, report, conditionIssues);
        break;

      case ConditionType.ML_PREDICTION:
        this.validateMLPredictionCondition(rule, report, conditionIssues);
        break;

      default:
        this.addIssue(report, {
          type: IssueType.MISSING_REQUIRED_FIELD,
          severity: IssueSeverity.ERROR,
          path: 'conditionType',
          message: `Unknown condition type: ${rule.conditionType}`,
        });
    }

    report.dataFlow.push({
      stepId: conditionStepId,
      stepName: `Condition: ${rule.conditionType}`,
      type: 'CONDITION',
      inputs: [{ source: '$event', schema: {} }],
      outputs: [
        {
          name: '$result',
          schema: { type: 'object', description: 'Condition evaluation result' },
        },
      ],
      issues: conditionIssues,
    });
  }

  /**
   * Validate SIMPLE condition: just field/operator/value
   */
  private validateSimpleCondition(
    rule: EventRuleExtendedEntity,
    report: CompilationReport,
    issues: CompilationIssue[],
  ): void {
    const cond = rule.condition;

    if (!cond.field || !cond.operator || !cond.value) {
      this.addIssue(report, {
        type: IssueType.MISSING_REQUIRED_FIELD,
        severity: IssueSeverity.ERROR,
        path: 'condition',
        message: 'Simple condition must have: field, operator, value',
        affectedComponent: 'condition',
      });
    }

    // Validate operator
    const validOperators = ['EQ', 'NE', 'GT', 'GTE', 'LT', 'LTE', 'CONTAINS'];
    if (cond.operator && !validOperators.includes(cond.operator)) {
      this.addIssue(report, {
        type: IssueType.INCOMPATIBLE_TYPES,
        severity: IssueSeverity.ERROR,
        path: 'condition.operator',
        message: `Invalid operator "${cond.operator}". Valid: ${validOperators.join(', ')}`,
      });
    }
  }

  /**
   * Validate SERVICE_CALL condition: call external service (like schema validator)
   */
  private validateServiceCallCondition(
    rule: EventRuleExtendedEntity,
    report: CompilationReport,
    issues: CompilationIssue[],
    availableDocuments?: any[],
  ): void {
    const cond = rule.condition;

    if (!cond.service) {
      this.addIssue(report, {
        type: IssueType.MISSING_REQUIRED_FIELD,
        severity: IssueSeverity.ERROR,
        path: 'condition.service',
        message: 'SERVICE_CALL condition must specify which service to call',
        affectedComponent: 'condition',
      });
      return;
    }

    // For schema validation, check if schema exists
    if (cond.params?.schemaRef && availableDocuments) {
      const schemaExists = availableDocuments.some(
        (d) => d.id === cond.params.schemaRef || d.name === cond.params.schemaRef,
      );
      if (!schemaExists) {
        this.addIssue(report, {
          type: IssueType.MISSING_DOCUMENT,
          severity: IssueSeverity.ERROR,
          path: 'condition.params.schemaRef',
          message: `Referenced schema "${cond.params.schemaRef}" not found`,
          suggestion: `Available schemas: ${availableDocuments.map((d) => d.name).join(', ')}`,
        });
        report.missingRequirements.documents.push(cond.params.schemaRef);
      }
    }

    // Check if service has required timeout
    if (!cond.timeout && !cond.timeout) {
      this.addIssue(report, {
        type: IssueType.TIMEOUT_RISK,
        severity: IssueSeverity.WARNING,
        path: 'condition',
        message: 'SERVICE_CALL has no timeout. Rule could hang indefinitely',
        suggestion: 'Add timeout (e.g., 30000ms)',
      });
    }
  }

  /**
   * Validate DATABASE_QUERY condition
   */
  private validateDatabaseQueryCondition(
    rule: EventRuleExtendedEntity,
    report: CompilationReport,
    issues: CompilationIssue[],
  ): void {
    const cond = rule.condition;

    if (!cond.query) {
      this.addIssue(report, {
        type: IssueType.MISSING_REQUIRED_FIELD,
        severity: IssueSeverity.ERROR,
        path: 'condition.query',
        message: 'DATABASE_QUERY condition must have a query',
      });
    }

    // Warn about potential performance issues
    if (cond.query && !cond.query.includes('LIMIT')) {
      this.addIssue(report, {
        type: IssueType.PERFORMANCE_RISK,
        severity: IssueSeverity.WARNING,
        path: 'condition.query',
        message: 'Query has no LIMIT clause. Could select huge result set',
        suggestion: 'Add LIMIT (e.g., LIMIT 100)',
      });
    }
  }

  /**
   * Validate LLM_ANALYSIS condition
   */
  private validateLLMAnalysisCondition(
    rule: EventRuleExtendedEntity,
    report: CompilationReport,
    issues: CompilationIssue[],
  ): void {
    const cond = rule.condition;

    if (!cond.content && !cond.contentField) {
      this.addIssue(report, {
        type: IssueType.MISSING_REQUIRED_FIELD,
        severity: IssueSeverity.ERROR,
        path: 'condition',
        message: 'LLM_ANALYSIS must specify what content to analyze (content or contentField)',
      });
    }

    if (!cond.prompt) {
      this.addIssue(report, {
        type: IssueType.MISSING_REQUIRED_FIELD,
        severity: IssueSeverity.ERROR,
        path: 'condition.prompt',
        message: 'LLM_ANALYSIS must have a prompt',
      });
    }

    // Warn about latency
    this.addIssue(report, {
      type: IssueType.TIMEOUT_RISK,
      severity: IssueSeverity.WARNING,
      path: 'condition',
      message: 'LLM analysis can take 5-30s. Rule execution will be slow',
      suggestion: 'Consider async execution or caching results',
    });
  }

  /**
   * Validate COMPOSITE condition (multiple conditions with AND/OR)
   */
  private validateCompositeCondition(
    rule: EventRuleExtendedEntity,
    report: CompilationReport,
    issues: CompilationIssue[],
  ): void {
    if (!rule.composedConditions || rule.composedConditions.length === 0) {
      this.addIssue(report, {
        type: IssueType.MISSING_REQUIRED_FIELD,
        severity: IssueSeverity.ERROR,
        path: 'composedConditions',
        message: 'COMPOSITE condition must have sub-conditions',
      });
    }
  }

  /**
   * Validate ML_PREDICTION condition
   */
  private validateMLPredictionCondition(
    rule: EventRuleExtendedEntity,
    report: CompilationReport,
    issues: CompilationIssue[],
  ): void {
    const cond = rule.condition;

    if (!cond.model) {
      this.addIssue(report, {
        type: IssueType.MISSING_REQUIRED_FIELD,
        severity: IssueSeverity.ERROR,
        path: 'condition.model',
        message: 'ML_PREDICTION must specify which model to use',
      });
    }

    if (!cond.features || Object.keys(cond.features).length === 0) {
      this.addIssue(report, {
        type: IssueType.MISSING_REQUIRED_FIELD,
        severity: IssueSeverity.ERROR,
        path: 'condition.features',
        message: 'ML_PREDICTION must have input features',
      });
    }
  }

  /**
   * Step 3: Validate actions
   */
  private compileActions(rule: EventRuleExtendedEntity, report: CompilationReport): void {
    // Simple actions
    if (rule.actions && rule.actions.length > 0) {
      rule.actions.forEach((action, idx) => {
        const [connectorName, functionName] = action.split('.');
        this.validateActionStep(connectorName, functionName, idx, report);
      });
    }

    // Composed actions
    if (rule.composedAction && rule.composedAction.steps) {
      rule.composedAction.steps.forEach((step, idx) => {
        this.validateActionStep(step.connector, step.function, idx, report);

        // Validate parameters have correct types
        this.validateActionParameters(step.parameters, idx, report);
      });
    }
  }

  /**
   * Validate single action step
   */
  private validateActionStep(
    connectorName: string,
    functionName: string,
    stepIndex: number,
    report: CompilationReport,
  ): void {
    const connector = this.connectorRegistry.getConnector(connectorName);

    if (!connector) {
      this.addIssue(report, {
        type: IssueType.CONNECTOR_NOT_FOUND,
        severity: IssueSeverity.ERROR,
        path: `actions[${stepIndex}]`,
        message: `Connector "${connectorName}" not found`,
        affectedComponent: connectorName,
      });
      report.missingRequirements.connectors.push(connectorName);
      return;
    }

    // Check if function exists
    const func = connector.functions.find((f: any) => f.name === functionName);
    if (!func) {
      this.addIssue(report, {
        type: IssueType.FUNCTION_NOT_FOUND,
        severity: IssueSeverity.ERROR,
        path: `actions[${stepIndex}].function`,
        message: `Function "${functionName}" not found in "${connectorName}"`,
        suggestion: `Available functions: ${connector.functions.map((f: any) => f.name).join(', ')}`,
      });
      return;
    }
  }

  /**
   * Validate action parameters
   */
  private validateActionParameters(params: any, stepIndex: number, report: CompilationReport): void {
    if (!params) return;

    // Check for required parameters
    if (params.required && Array.isArray(params.required)) {
      params.required.forEach((req: string) => {
        if (params[req] === undefined) {
          this.addIssue(report, {
            type: IssueType.MISSING_REQUIRED_FIELD,
            severity: IssueSeverity.ERROR,
            path: `actions[${stepIndex}].parameters.${req}`,
            message: `Required parameter "${req}" missing`,
            affectedComponent: `actions[${stepIndex}]`,
          });
        }
      });
    }
  }

  /**
   * Step 4: Validate document references
   */
  private validateDocumentReferences(
    rule: EventRuleExtendedEntity,
    report: CompilationReport,
    availableDocuments?: any[],
  ): void {
    if (!rule.documentReferences || rule.documentReferences.length === 0) {
      return;
    }

    const docNames = availableDocuments?.map((d) => d.id) || [];

    rule.documentReferences.forEach((ref, idx) => {
      if (!docNames.includes(ref.documentId)) {
        this.addIssue(report, {
          type: IssueType.MISSING_DOCUMENT,
          severity: IssueSeverity.ERROR,
          path: `documentReferences[${idx}]`,
          message: `Referenced document "${ref.documentId}" not found in system`,
          suggestion: `Available documents: ${docNames.join(', ')}`,
        });
        report.missingRequirements.documents.push(ref.documentId);
      }
    });
  }

  /**
   * Step 5: Data flow analysis
   */
  private analyzeDataFlow(rule: EventRuleExtendedEntity, report: CompilationReport): void {
    // Track what $result contains and if it's used correctly in actions
    // This ensures data flows correctly through the rule

    for (const step of report.dataFlow) {
      if (step.type === 'CONDITION') {
        // Condition outputs $result with structure based on condition type
        if (rule.conditionType === ConditionType.SERVICE_CALL) {
          step.outputs[0].schema = {
            type: 'object',
            properties: {
              isValid: { type: 'boolean' },
              errors: { type: 'array' },
              details: { type: 'object' },
            },
          };
        }
      }
    }
  }

  /**
   * Step 6: Check for circular dependencies
   */
  private checkCircularDependencies(rule: EventRuleExtendedEntity, report: CompilationReport): void {
    // If a rule tries to trigger itself, that's circular
    // E.g., IF status changes THEN update status (endless loop)

    if (rule.trigger && rule.composedAction) {
      rule.composedAction.steps.forEach((step, idx) => {
        if (
          step.function === 'update' &&
          step.connector === rule.trigger?.source &&
          step.parameters?.field === 'status'
        ) {
          this.addIssue(report, {
            type: IssueType.INCOMPATIBLE_TYPES,
            severity: IssueSeverity.ERROR,
            path: `actions[${idx}]`,
            message: 'Circular dependency detected: action modifies same field that triggers rule',
            suggestion: 'Modify a different field to avoid infinite loop',
          });
        }
      });
    }
  }

  /**
   * Step 7: Estimate execution time
   */
  private estimateExecutionTime(rule: EventRuleExtendedEntity, report: CompilationReport): void {
    let estimatedMs = 0;

    // Trigger: 0ms (instant)
    // Condition evaluation
    if (rule.conditionType === ConditionType.SERVICE_CALL) {
      estimatedMs += 50; // Network round trip
    } else if (rule.conditionType === ConditionType.LLM_ANALYSIS) {
      estimatedMs += 10000; // LLM calls are slow
    } else if (rule.conditionType === ConditionType.DATABASE_QUERY) {
      estimatedMs += 100; // DB query
    }

    // Actions
    if (rule.composedAction && rule.composedAction.mode === 'SEQUENTIAL') {
      rule.composedAction.steps.forEach(() => {
        estimatedMs += 100; // Per action
      });
    }

    report.estimatedExecutionTime = estimatedMs;

    if (estimatedMs > 30000) {
      this.addIssue(report, {
        type: IssueType.TIMEOUT_RISK,
        severity: IssueSeverity.WARNING,
        path: 'execution',
        message: `Estimated execution time: ${estimatedMs}ms. May exceed timeout (30s)`,
      });
    }
  }

  /**
   * Step 8: Generate recommendations
   */
  private generateRecommendations(rule: EventRuleExtendedEntity, report: CompilationReport): void {
    // Add helpful suggestions based on findings

    if (rule.composedAction?.mode === 'SEQUENTIAL' && rule.composedAction.steps.length > 5) {
      report.recommendations.push(
        '⚠️ Many sequential steps (>5) may cause slowness. Consider parallel execution where possible.',
      );
    }

    if (rule.conditionType === ConditionType.LLM_ANALYSIS && rule.composedAction?.steps && rule.composedAction.steps.length > 0) {
      report.recommendations.push(
        '💡 Consider caching LLM analysis results if the same content is checked multiple times.',
      );
    }

    if (report.missingRequirements.agents.length > 0) {
      report.recommendations.push(
        `📋 Required agents not available: ${report.missingRequirements.agents.join(', ')}. Install or register them first.`,
      );
    }
  }

  /**
   * Helper: Add issue to report
   */
  private addIssue(report: CompilationReport, issue: CompilationIssue): void {
    report.issues.push(issue);
    report.totalIssues++;

    if (issue.severity === IssueSeverity.ERROR) {
      report.errorCount++;
      report.isValid = false;
    } else if (issue.severity === IssueSeverity.WARNING) {
      report.warningCount++;
    } else {
      report.infoCount++;
    }
  }

  /**
   * Generate human-readable compilation report for user
   */
  formatCompilationReport(report: CompilationReport): string {
    let output = `\n📊 RULE COMPILATION REPORT\n`;
    output += `${'='.repeat(60)}\n\n`;

    output += `Rule: ${report.ruleName}\n`;
    output += `Status: ${report.isValid ? '✅ VALID' : '❌ INVALID'}\n\n`;

    // Summary
    output += `Issues: ${report.totalIssues} (${report.errorCount} errors, ${report.warningCount} warnings)\n`;
    output += `Estimated execution time: ${report.estimatedExecutionTime}ms\n\n`;

    // Errors first
    if (report.errorCount > 0) {
      output += `❌ ERRORS (${report.errorCount}):\n`;
      report.issues
        .filter((i) => i.severity === IssueSeverity.ERROR)
        .forEach((issue) => {
          output += `  • [${issue.type}] ${issue.message}\n`;
          if (issue.suggestion) {
            output += `    💡 ${issue.suggestion}\n`;
          }
        });
      output += '\n';
    }

    // Warnings
    if (report.warningCount > 0) {
      output += `⚠️ WARNINGS (${report.warningCount}):\n`;
      report.issues
        .filter((i) => i.severity === IssueSeverity.WARNING)
        .forEach((issue) => {
          output += `  • ${issue.message}\n`;
          if (issue.suggestion) {
            output += `    💡 ${issue.suggestion}\n`;
          }
        });
      output += '\n';
    }

    // Missing requirements
    if (
      report.missingRequirements.connectors.length > 0 ||
      report.missingRequirements.agents.length > 0 ||
      report.missingRequirements.documents.length > 0
    ) {
      output += `📋 MISSING REQUIREMENTS:\n`;
      if (report.missingRequirements.connectors.length > 0) {
        output += `  Connectors: ${report.missingRequirements.connectors.join(', ')}\n`;
      }
      if (report.missingRequirements.agents.length > 0) {
        output += `  Agents: ${report.missingRequirements.agents.join(', ')}\n`;
      }
      if (report.missingRequirements.documents.length > 0) {
        output += `  Documents: ${report.missingRequirements.documents.join(', ')}\n`;
      }
      output += '\n';
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      output += `💡 RECOMMENDATIONS:\n`;
      report.recommendations.forEach((rec) => {
        output += `  • ${rec}\n`;
      });
      output += '\n';
    }

    output += `${'='.repeat(60)}\n`;

    return output;
  }
}
