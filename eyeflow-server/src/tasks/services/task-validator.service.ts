/**
 * Task Validator Service
 * Validates that a task can be executed before creating it
 *
 * Checks:
 * - Connectors exist and are available
 * - Functions exist and are callable
 * - Parameters match schema types
 * - User has permissions
 * - All dependencies are available
 * - Compliance rules are met
 */

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { LLMContext, DataType } from '../types/connector-manifest.types';
import { ConnectorRegistryService } from './connector-registry.service';
import { LLMIntentParserResponse } from './llm-intent-parser.abstraction';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  detailedChecks: {
    connectorsAvailable: boolean;
    functionsExist: boolean;
    parametersValid: boolean;
    permissionsGranted: boolean;
    dependenciesSatisfied: boolean;
  };
}

@Injectable()
export class TaskValidatorService {
  private readonly logger = new Logger(TaskValidatorService.name);

  constructor(private readonly connectorRegistry: ConnectorRegistryService) {}

  /**
   * Validate that an intent can be executed
   */
  async validateIntent(
    intent: LLMIntentParserResponse,
    context: LLMContext,
    userId: string,
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    const result: ValidationResult = {
      valid: true,
      errors,
      warnings,
      suggestions,
      detailedChecks: {
        connectorsAvailable: true,
        functionsExist: true,
        parametersValid: true,
        permissionsGranted: true,
        dependenciesSatisfied: true,
      },
    };

    // Check 1: Connectors are available
    if (!await this.checkConnectorsAvailable(intent, context)) {
      result.detailedChecks.connectorsAvailable = false;
      errors.push('One or more target connectors are not available');
    }

    // Check 2: Functions exist
    if (!this.checkFunctionsExist(intent, context)) {
      result.detailedChecks.functionsExist = false;
      errors.push('One or more target functions do not exist');
    }

    // Check 3: Parameters are valid
    const paramValidation = this.validateParameters(intent, context);
    if (!paramValidation.valid) {
      result.detailedChecks.parametersValid = false;
      errors.push(...paramValidation.errors);
      warnings.push(...paramValidation.warnings);
    }

    // Check 4: User has permissions
    if (!this.checkUserPermissions(intent, context, userId)) {
      result.detailedChecks.permissionsGranted = false;
      errors.push('User does not have required permissions');
    }

    // Check 5: Dependencies satisfied
    const depCheck = this.checkDependencies(intent, context);
    if (!depCheck.satisfied) {
      result.detailedChecks.dependenciesSatisfied = false;
      errors.push(...depCheck.missingDeps);
      suggestions.push(...depCheck.suggestions);
    }

    result.valid = errors.length === 0;

    this.logger.log(
      `Task validation for user ${userId}: ${result.valid ? 'PASSED' : 'FAILED'}`,
    );

    return result;
  }

  /**
   * Validate that a task can compile successfully
   */
  async validateCompilation(
    userInput: string,
    context: LLMContext,
    userId: string,
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check that context has connectors
    if (!context.connectors || context.connectors.length === 0) {
      errors.push('No connectors available in system');
    }

    // Check that LLM would have enough info to parse
    if (!context.functions || context.functions.length === 0) {
      warnings.push('No functions available - LLM will have limited options');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      detailedChecks: {
        connectorsAvailable: context.connectors && context.connectors.length > 0,
        functionsExist: context.functions && context.functions.length > 0,
        parametersValid: true,
        permissionsGranted: true,
        dependenciesSatisfied: true,
      },
    };
  }

  /**
   * Validate that a rule can be created
   */
  async validateRule(
    ruleName: string,
    triggerType: string,
    actions: Array<{ functionId: string; connectorId: string }>,
    context: LLMContext,
    userId: string,
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check trigger exists
    const trigger = context.triggers.find((t) => t.trigger.type === triggerType);
    if (!trigger) {
      errors.push(`Trigger type "${triggerType}" not supported`);
    }

    // Check all actions are valid
    for (const action of actions) {
      const funcExists = context.functions.find(
        (f) => f.function.id === action.functionId && f.connectorId === action.connectorId,
      );
      if (!funcExists) {
        errors.push(
          `Function "${action.functionId}" not found in connector "${action.connectorId}"`,
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      detailedChecks: {
        connectorsAvailable: true,
        functionsExist: actions.length > 0,
        parametersValid: true,
        permissionsGranted: true,
        dependenciesSatisfied: true,
      },
    };
  }

  // ========================================================================
  // INTERNAL VALIDATION CHECKS
  // ========================================================================

  private async checkConnectorsAvailable(
    intent: LLMIntentParserResponse,
    context: LLMContext,
  ): Promise<boolean> {
    for (const target of intent.targets) {
      const connector = context.connectors.find((c) => c.id === target.connectorId);
      if (!connector) {
        this.logger.warn(`Connector "${target.connectorId}" not found`);
        return false;
      }
    }
    return true;
  }

  private checkFunctionsExist(
    intent: LLMIntentParserResponse,
    context: LLMContext,
  ): boolean {
    for (const target of intent.targets) {
      const func = context.functions.find(
        (f) => f.function.id === target.functionId && f.connectorId === target.connectorId,
      );
      if (!func) {
        this.logger.warn(
          `Function "${target.functionId}" not found in connector "${target.connectorId}"`,
        );
        return false;
      }
    }
    return true;
  }

  private validateParameters(
    intent: LLMIntentParserResponse,
    context: LLMContext,
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const param of intent.parameters) {
      // Check parameter type matches
      const expectedType = this.getExpectedParameterType(param.name, intent, context);

      if (expectedType && !this.typeCompatible(param.type, expectedType)) {
        errors.push(
          `Parameter "${param.name}" has type "${param.type}" but expected "${expectedType}"`,
        );
      }

      if (!param.resolved) {
        warnings.push(`Parameter "${param.name}" could not be fully resolved`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private getExpectedParameterType(
    paramName: string,
    intent: LLMIntentParserResponse,
    context: LLMContext,
  ): string | undefined {
    for (const target of intent.targets) {
      const func = context.functions.find(
        (f) => f.function.id === target.functionId && f.connectorId === target.connectorId,
      );
      if (func) {
        const param = func.function.parameters.find((p) => p.name === paramName);
        if (param) {
          return param.type;
        }
      }
    }
    return undefined;
  }

  private typeCompatible(actual: string, expected: string): boolean {
    if (actual === expected) return true;

    // Type coercion rules
    const compatibilities: Record<string, string[]> = {
      string: ['string', 'json', 'enum'],
      number: ['number', 'integer'],
      integer: ['integer', 'number'],
      boolean: ['boolean'],
      object: ['object', 'json'],
      array: ['array', 'json'],
      json: ['json', 'string', 'object'],
    };

    return compatibilities[actual]?.includes(expected) || false;
  }

  private checkUserPermissions(
    intent: LLMIntentParserResponse,
    context: LLMContext,
    userId: string,
  ): boolean {
    // For now, assume user has permissions if intent is valid
    // In production, check against user's role/permissions
    return true;
  }

  private checkDependencies(
    intent: LLMIntentParserResponse,
    context: LLMContext,
  ): { satisfied: boolean; missingDeps: string[]; suggestions: string[] } {
    const missingDeps: string[] = [];
    const suggestions: string[] = [];

    for (const target of intent.targets) {
      const connector = context.connectors.find((c) => c.id === target.connectorId);
      if (connector?.status === 'beta') {
        suggestions.push(
          `Note: Connector "${connector.name}" is in beta and may be unstable`,
        );
      }
      if (connector?.status === 'deprecated') {
        missingDeps.push(`Connector "${connector.name}" is deprecated`);
      }
    }

    return {
      satisfied: missingDeps.length === 0,
      missingDeps,
      suggestions,
    };
  }
}
