/**
 * LLM Response Validation Service
 *
 * Validates LLM responses against the strict JSON Schema for workflow_rules.
 * Implements validation with detailed error reporting.
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Ajv = require('ajv');
import * as fs from 'fs';
import * as path from 'path';

export interface LLMResponseValidationResult {
  valid: boolean;
  schemaCompliant: boolean;
  errors: Array<{
    path: string;
    message: string;
    keyword: string;
    params?: Record<string, any>;
  }>;
  warnings: string[];
}

@Injectable()
export class LLMResponseValidationService {
  private readonly logger = new Logger(LLMResponseValidationService.name);
  private ajv: any;
  private schema: any;
  private validate: any = null;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strictSchema: false,
    }) as any;

    this.loadSchema();
  }

  /**
   * Load the LLM workflow rules schema from file
   */
  private loadSchema(): void {
    try {
      const schemaPath = path.join(
        __dirname,
        '../../..',
        'schemas',
        'llm-workflow-rules.schema.json',
      );

      if (!fs.existsSync(schemaPath)) {
        this.logger.warn(`Schema file not found at ${schemaPath}, using inline schema`);
        this.schema = this.getInlineSchema();
      } else {
        this.schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
        this.logger.log(`Loaded LLM workflow schema from ${schemaPath}`);
      }

      this.validate = this.ajv.compile(this.schema);
    } catch (err) {
      this.logger.error(`Failed to load schema: ${(err as any).message}`);
      this.schema = this.getInlineSchema();
      this.validate = this.ajv.compile(this.schema);
    }
  }

  /**
   * Validate LLM response against schema
   */
  validateLLMResponse(response: any): LLMResponseValidationResult {
    if (!this.validate) {
      return {
        valid: false,
        schemaCompliant: false,
        errors: [{ path: '', message: 'Schema validator not initialized', keyword: 'init' }],
        warnings: [],
      };
    }

    const result: LLMResponseValidationResult = {
      valid: false,
      schemaCompliant: false,
      errors: [],
      warnings: [],
    };

    // First pass: schema validation
    const isValid = this.validate(response);

    if (!isValid && this.validate.errors) {
      result.schemaCompliant = false;
      result.errors = this.validate.errors.map((err: any) => ({
        path: err.dataPath || err.instancePath || 'root',
        message: err.message || 'Unknown validation error',
        keyword: err.keyword || 'unknown',
        params: err.params,
      }));
    } else {
      result.schemaCompliant = true;
    }

    // Second pass: semantic validation
    const semanticIssues = this.validateSemantics(response);
    result.errors.push(...semanticIssues.errors);
    result.warnings.push(...semanticIssues.warnings);

    // Overall validation: pass if schema compliant AND no critical semantic errors
    result.valid = result.schemaCompliant && semanticIssues.errors.length === 0;

    return result;
  }

  /**
   * Semantic validation beyond schema
   * - Confidence scores sanity
   * - No duplicate rule names
   * - Action parameters consistency
   */
  private validateSemantics(response: any): { errors: Array<{ path: string; message: string; keyword: string }>, warnings: string[] } {
    const errors: Array<{ path: string; message: string; keyword: string }> = [];
    const warnings: string[] = [];

    if (!response.workflow_rules) {
      return { errors, warnings };
    }

    const rules = response.workflow_rules.rules || [];

    // Check for duplicate rule names
    const ruleNames = new Set<string>();
    for (const rule of rules) {
      if (ruleNames.has(rule.name)) {
        errors.push({
          path: `workflow_rules.rules.${rules.indexOf(rule)}.name`,
          message: `Duplicate rule name: ${rule.name}`,
          keyword: 'duplicate',
        });
      }
      ruleNames.add(rule.name);
    }

    // Validate confidence score
    if (
      response.workflow_rules.confidence !== undefined &&
      (response.workflow_rules.confidence < 0 || response.workflow_rules.confidence > 1)
    ) {
      errors.push({
        path: 'workflow_rules.confidence',
        message: 'Confidence must be between 0 and 1',
        keyword: 'range',
      });
    }

    // Validate each rule for semantic issues
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];

      // Validate trigger-action pairing
      if (!rule.trigger || !rule.trigger.type) {
        errors.push({
          path: `workflow_rules.rules.${i}.trigger`,
          message: 'Rule must have a trigger with type',
          keyword: 'required',
        });
      }

      if (!rule.actions || rule.actions.length === 0) {
        errors.push({
          path: `workflow_rules.rules.${i}.actions`,
          message: 'Rule must have at least one action',
          keyword: 'minItems',
        });
      }

      // Validate action consistency
      if (rule.actions && Array.isArray(rule.actions)) {
        for (let j = 0; j < rule.actions.length; j++) {
          const action = rule.actions[j];

          // Check if action has minimal required fields
          if (!action.type && !action.payload?.functionId) {
            warnings.push(
              `Rule "${rule.name}" action[${j}] missing type or payload.functionId`,
            );
          }

          // Check for null payloads
          if (action.payload && typeof action.payload !== 'object') {
            errors.push({
              path: `workflow_rules.rules.${i}.actions.${j}.payload`,
              message: 'Action payload must be an object',
              keyword: 'type',
            });
          }
        }
      }

      // Validate condition operators/fields if present
      if (rule.conditions && Array.isArray(rule.conditions)) {
        for (let j = 0; j < rule.conditions.length; j++) {
          const cond = rule.conditions[j];
          if (!cond.type || !cond.operator || cond.value === undefined) {
            warnings.push(
              `Rule "${rule.name}" condition[${j}] may be incomplete`,
            );
          }
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * Inline schema for fallback
   */
  private getInlineSchema(): any {
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'LLM Workflow Rules Schema',
      type: 'object',
      required: ['workflow_rules'],
      properties: {
        workflow_rules: {
          type: 'object',
          required: ['rules', 'summary', 'confidence'],
          properties: {
            rules: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['name', 'description', 'trigger', 'actions'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  trigger: {
                    type: 'object',
                    required: ['type'],
                    properties: {
                      type: { type: 'string' },
                      source: { type: 'string' },
                    },
                  },
                  conditions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['type', 'operator', 'value'],
                      properties: {
                        type: { type: 'string' },
                        operator: { type: 'string' },
                        value: {},
                      },
                    },
                  },
                  actions: {
                    type: 'array',
                    minItems: 1,
                    items: {
                      type: 'object',
                      required: ['type'],
                      properties: {
                        type: { type: 'string' },
                        channel: { type: ['string', 'null'] },
                        payload: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
            summary: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
    };
  }

  /**
   * Get human-friendly error messages
   */
  getErrorSummary(result: LLMResponseValidationResult): string {
    if (result.valid) {
      return result.warnings.length > 0
        ? `Valid with ${result.warnings.length} warnings`
        : 'Valid response';
    }

    const errorCount = result.errors.length;
    return `Invalid response: ${errorCount} error(s)`;
  }
}
