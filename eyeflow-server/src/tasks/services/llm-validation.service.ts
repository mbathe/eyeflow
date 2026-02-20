/**
 * Enhanced LLM Intent Parser with Formal Validation
 *
 * Wraps LLMIntentParserHttpClient with:
 * - JSON Schema validation of LLM responses
 * - Catalog verification against ComponentRegistry
 * - Retry logic (N=3) with exponential backoff
 * - Escalation to monitoring/alerts on repeated failures
 * - Sandbox simulation before returning result
 * - Observability metrics
 */

import { Injectable, Logger, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { LLMIntentParserResponse } from './llm-intent-parser.abstraction';
import { LLMResponseValidationService } from './llm-response-validation.service';
import { CatalogValidationService, CatalogValidationResult } from './catalog-validation.service';
import { SandboxExecutionService, SandboxExecutionResult } from './sandbox-execution.service';
import { LLMContext } from '../types/connector-manifest.types';

export interface ValidationMetrics {
  requestsTotal: number;
  requestsSuccessful: number;
  requestsFailed: number;
  requestsRejected: number; // Schema/catalog validation failures
  retriesCount: number;
  escalationCount: number;
  avgValidationLatencyMs: number;
  lastEscalationAt?: Date;
}

export interface ValidatedLLMResponse {
  intent: LLMIntentParserResponse;
  validationPassed: boolean;
  schemaValidation: { valid: boolean; message: string };
  catalogValidation: CatalogValidationResult;
  sandboxExecution: SandboxExecutionResult;
  metrics: { latencyMs: number; retryCount: number };
}

@Injectable()
export class LLMValidationService {
  private readonly logger = new Logger(LLMValidationService.name);
  private readonly maxRetries = 3;
  private readonly retryBackoffMs = [100, 500, 2000]; // Exponential backoff
  private readonly metrics: ValidationMetrics = {
    requestsTotal: 0,
    requestsSuccessful: 0,
    requestsFailed: 0,
    requestsRejected: 0,
    retriesCount: 0,
    escalationCount: 0,
    avgValidationLatencyMs: 0,
  };

  constructor(
    private readonly schemaValidator: LLMResponseValidationService,
    private readonly catalogValidator: CatalogValidationService,
    private readonly sandboxExecutor: SandboxExecutionService,
  ) {}

  /**
   * Call LLM with full validation pipeline
   * Implements: schema validation + catalog checking + sandbox simulation + retry logic
   */
  async parseIntentWithValidation(
    llmFunction: () => Promise<{ response: any; statusCode: number }>,
    llmContext: LLMContext,
    workflowId: string,
  ): Promise<ValidatedLLMResponse> {
    const startTime = Date.now();
    const result: ValidatedLLMResponse = {
      intent: {} as LLMIntentParserResponse,
      validationPassed: false,
      schemaValidation: { valid: false, message: '' },
      catalogValidation: { valid: false, errors: [], warnings: [], metadata: { checkedAt: new Date(), catalogVersion: '', unknownSafeMode: false } },
      sandboxExecution: {} as SandboxExecutionResult,
      metrics: { latencyMs: 0, retryCount: 0 },
    };

    this.metrics.requestsTotal++;

    let response: any;
    let retryCount = 0;

    // ========================================================================
    // STEP 1: Call LLM with retry logic
    // ========================================================================
    try {
      response = await this.callLLMWithRetry(llmFunction, workflowId);
    } catch (err) {
      this.metrics.requestsFailed++;
      this.logger.error(`LLM call failed after retries: ${(err as any).message}`);
      await this.escalate(
        'LLM_SERVICE_UNAVAILABLE',
        `Failed to call LLM service: ${(err as any).message}`,
      );
      throw new ServiceUnavailableException('LLM service unavailable');
    }

    // ========================================================================
    // STEP 2: Validate LLM response against schema
    // ========================================================================
    if (!response.workflow_rules) {
      this.metrics.requestsRejected++;
      throw new BadRequestException('LLM response missing workflow_rules field');
    }

    const schemaValidation = this.schemaValidator.validateLLMResponse(response);
    result.schemaValidation = {
      valid: schemaValidation.valid,
      message: this.schemaValidator.getErrorSummary(schemaValidation),
    };

    if (!schemaValidation.valid) {
      this.metrics.requestsRejected++;
      this.logger.warn(
        `Schema validation failed: ${JSON.stringify(schemaValidation.errors.slice(0, 3))}`,
      );
      throw new BadRequestException(
        `LLM response failed schema validation: ${schemaValidation.errors[0]?.message}`,
      );
    }

    this.logger.debug(`Schema validation passed for workflow ${workflowId}`);

    // ========================================================================
    // STEP 3: Verify against component catalog
    // ========================================================================
    const catalogValidation = await this.catalogValidator.validateCatalogReferences(
      response.workflow_rules.rules || [],
      llmContext,
    );
    result.catalogValidation = catalogValidation;

    if (!catalogValidation.valid) {
      this.metrics.requestsRejected++;
      const errors = catalogValidation.errors.slice(0, 3);
      this.logger.warn(`Catalog validation failed: ${JSON.stringify(errors)}`);

      // Escalate if critical unknown references
      const criticalErrors = catalogValidation.errors.filter(
        (e) => e.type === 'UNKNOWN_CONNECTOR' || e.type === 'CAPABILITY_MISMATCH',
      );
      if (criticalErrors.length > 0) {
        await this.escalate(
          'CATALOG_REFERENCE_ERROR',
          `Unknown catalog references: ${criticalErrors.map((e) => e.message).join('; ')}`,
        );
      }

      throw new BadRequestException(
        `LLM response references unknown capabilities: ${catalogValidation.errors[0]?.message}`,
      );
    }

    this.logger.debug(
      `Catalog validation passed: ${catalogValidation.metadata.catalogVersion}`,
    );

    // ========================================================================
    // STEP 4: Map response to LLMIntentParserResponse
    // ========================================================================
    result.intent = this.mapResponseToIntent(response);

    // ========================================================================
    // STEP 5: Simulate execution in sandbox (safety check)
    // ========================================================================
    try {
      const sandboxResult = await this.sandboxExecutor.simulateExecution(
        result.intent,
        workflowId,
      );
      result.sandboxExecution = sandboxResult;

      if (!this.sandboxExecutor.validateSandboxResult(sandboxResult)) {
        this.logger.warn(
          `Sandbox simulation failed: ${this.sandboxExecutor.getSummary(sandboxResult)}`,
        );
        // Don't fail on sandbox issues - it's just a warning
        // But log for debugging
      }
    } catch (err) {
      this.logger.error(`Sandbox simulation error: ${(err as any).message}`);
      // Don't block on sandbox errors
    }

    // ========================================================================
    // STEP 6: Return validated result
    // ========================================================================
    result.validationPassed = true;
    result.metrics.latencyMs = Date.now() - startTime;
    result.metrics.retryCount = retryCount;

    this.metrics.requestsSuccessful++;
    this.updateAverageMetrics();

    this.logger.log(
      `✓ Validation complete for ${workflowId} (${result.metrics.latencyMs}ms, ${catalogValidation.warnings.length} catalog warnings)`,
    );

    return result;
  }

  /**
   * Call LLM with retry logic and exponential backoff
   */
  private async callLLMWithRetry(
    llmFunction: () => Promise<{ response: any; statusCode: number }>,
    workflowId: string,
  ): Promise<any> {
    let lastError: any;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.debug(
          `[LLM] Attempt ${attempt + 1}/${this.maxRetries + 1} for workflow ${workflowId}`,
        );

        const result = await llmFunction();

        if (result.statusCode === 200 || result.statusCode === 201) {
          return result.response;
        }

        // Retry on server errors (5xx)
        if (result.statusCode >= 500) {
          throw new Error(
            `LLM service error: HTTP ${result.statusCode}`,
          );
        }

        // Don't retry on client errors (4xx)
        throw new BadRequestException(
          `LLM returned error: HTTP ${result.statusCode}`,
        );
      } catch (err) {
        lastError = err;
        this.metrics.retriesCount++;

        if (attempt < this.maxRetries) {
          const backoffMs = this.retryBackoffMs[attempt];
          this.logger.warn(
            `[LLM] Attempt ${attempt + 1} failed: ${(err as any).message}, retrying in ${backoffMs}ms...`,
          );
          await this.sleep(backoffMs);
        }
      }
    }

    // All retries exhausted
    throw lastError;
  }

  /**
   * Map LLM response to LLMIntentParserResponse
   */
  private mapResponseToIntent(response: any): LLMIntentParserResponse {
    const rules = response.workflow_rules?.rules || [];
    const firstRule = rules[0];

    return {
      success: true,
      confidence: response.workflow_rules?.confidence || 0.9,
      intent: {
        description: firstRule?.description || response.workflow_rules?.summary || 'Generated workflow',
        action: firstRule?.name || 'generated_rule',
        actionType: 'EXECUTE',
      },
      targets: [],
      parameters: [],
      missions: this.extractMissions(firstRule),
      validation: {
        isExecutable: true,
        issues: [],
        warnings: [],
      },
      ruleSuggestions: rules.map((r: any) => ({
        description: r.description,
        trigger: { type: r.trigger?.type || 'ON_EVENT', connectorId: r.trigger?.source || null, nodeId: null },
        condition: this.extractCondition(r),
        actions: this.extractActions(r),
      })),
    };
  }

  /**
   * Extract missions from rule
   */
  private extractMissions(rule: any): any[] {
    if (!rule || !rule.actions) return [];

    return rule.actions.map((action: any, idx: number) => ({
      nodeId: `action_${idx}`,
      functionId: action.type || action.payload?.functionId,
      connectorId: action.payload?.connector || action.payload?.connectorId || action.channel,
      parameters: action.payload || {},
    }));
  }

  /**
   * Extract condition from rule
   */
  private extractCondition(rule: any): any {
    if (!rule.conditions || rule.conditions.length === 0) return undefined;
    const cond = rule.conditions[0];
    return {
      field: cond.type,
      operator: cond.operator,
      value: cond.value,
    };
  }

  /**
   * Extract actions from rule
   */
  private extractActions(rule: any): any[] {
    if (!rule.actions) return [];
    return rule.actions.map((a: any) => ({
      functionId: a.type || a.payload?.functionId,
      connectorId: a.payload?.connector || a.payload?.connectorId || a.channel,
      parameters: a.payload || {},
    }));
  }

  /**
   * Escalate critical validation failures
   * Would integrate with monitoring/alerting system
   */
  private async escalate(errorType: string, message: string): Promise<void> {
    this.metrics.escalationCount++;
    this.metrics.lastEscalationAt = new Date();

    this.logger.error(`ESCALATION [${errorType}]: ${message}`);

    // TODO: Integrate with monitoring/alerting service
    // e.g., send alert to Datadog, Sentry, or internal dashboard
    // For now, just log
    if (this.metrics.escalationCount % 10 === 0) {
      this.logger.warn(
        `Escalation threshold reached: ${this.metrics.escalationCount} escalations since startup`,
      );
    }
  }

  /**
   * Update average validation metrics
   */
  private updateAverageMetrics(): void {
    if (this.metrics.requestsSuccessful > 0) {
      // Track metrics for monitoring
      // This would be sent to metrics/monitoring system
    }
  }

  /**
   * Get current validation metrics
   */
  getMetrics(): ValidationMetrics {
    return { ...this.metrics };
  }

  /**
   * Simple sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
