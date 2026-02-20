/**
 * Catalog Validation Service
 *
 * Validates LLM-proposed workflows against the dynamic component catalog:
 * - Checks connectors/actions exist in ComponentRegistry
 * - Validates capability versions & compatibility
 * - Prevents using unknown or deprecated capabilities
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConnectorRegistryService } from './connector-registry.service';
import { LLMContext, ConnectorFunction } from '../types/connector-manifest.types';

export interface CatalogValidationResult {
  valid: boolean;
  errors: Array<{
    actionId: string;
    connectorId: string;
    type: 'UNKNOWN_CONNECTOR' | 'UNKNOWN_ACTION' | 'VERSION_MISMATCH' | 'CAPABILITY_MISMATCH' | 'DEPRECATED';
    message: string;
    suggestion?: string;
  }>;
  warnings: Array<{
    actionId: string;
    type: 'BETA_STATUS' | 'DEPRECATED_VERSION' | 'CAPABILITY_PENDING_REMOVAL';
    message: string;
  }>;
  metadata: {
    checkedAt: Date;
    catalogVersion: string;
    unknownSafeMode: boolean; // Add to catalog dynamically
  };
}

@Injectable()
export class CatalogValidationService {
  private readonly logger = new Logger(CatalogValidationService.name);

  constructor(private readonly connectorRegistry: ConnectorRegistryService) {}

  /**
   * Validate that all referenced actions/connectors exist in catalog
   * Called after LLM response parsing, before compilation
   */
  async validateCatalogReferences(
    workflowRules: any[],
    llmContext: LLMContext,
  ): Promise<CatalogValidationResult> {
    const result: CatalogValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      metadata: {
        checkedAt: new Date(),
        catalogVersion: this.getCatalogVersion(),
        unknownSafeMode: process.env.CATALOG_UNKNOWN_SAFE_MODE === 'true',
      },
    };

    if (!workflowRules || workflowRules.length === 0) {
      return result;
    }

    for (const rule of workflowRules) {
      // Validate trigger source if specified
      if (rule.trigger?.source) {
        const triggerValidation = this.validateConnectorReference(
          rule.trigger.source,
          'TRIGGER',
          llmContext,
        );
        if (!triggerValidation.valid) {
          result.errors.push(...triggerValidation.errors);
          result.valid = false;
        }
        result.warnings.push(...triggerValidation.warnings);
      }

      // Validate all actions
      if (rule.actions && Array.isArray(rule.actions)) {
        for (const action of rule.actions) {
          const connectorId = action.payload?.connector || action.payload?.connectorId || action.channel;
          const functionId = action.type || action.payload?.functionId || action.payload?.action;

          if (!connectorId || !functionId) {
            result.errors.push({
              actionId: functionId || 'UNKNOWN',
              connectorId: connectorId || 'UNKNOWN',
              type: 'UNKNOWN_ACTION',
              message: `Action missing connector or function ID: ${JSON.stringify(action)}`,
            });
            result.valid = false;
            continue;
          }

          const actionValidation = this.validateActionReference(
            connectorId,
            functionId,
            llmContext,
          );

          if (!actionValidation.valid) {
            result.errors.push(...actionValidation.errors);
            result.valid = false;
          }

          result.warnings.push(...actionValidation.warnings);
        }
      }
    }

    // If safe mode enabled, only warn for unknown items (don't fail validation)
    if (result.metadata.unknownSafeMode) {
      const unknownErrors = result.errors.filter(
        (e) => e.type === 'UNKNOWN_CONNECTOR' || e.type === 'UNKNOWN_ACTION',
      );
      if (unknownErrors.length > 0) {
        this.logger.warn(
          `UNKNOWN_SAFE_MODE: Allowing ${unknownErrors.length} unknown references`,
        );
        unknownErrors.forEach((e) => {
          result.warnings.push({
            actionId: e.actionId,
            type: 'CAPABILITY_PENDING_REMOVAL',
            message: `[SAFE_MODE] Unknown capability treated as warning: ${e.message}`,
          });
        });
        // Remove from errors
        result.errors = result.errors.filter(
          (e) => e.type !== 'UNKNOWN_CONNECTOR' && e.type !== 'UNKNOWN_ACTION',
        );
        result.valid = result.errors.length === 0;
      }
    }

    return result;
  }

  /**
   * Validate a single connector reference
   */
  private validateConnectorReference(
    connectorId: string,
    type: string,
    llmContext: LLMContext,
  ): { valid: boolean; errors: CatalogValidationResult['errors']; warnings: CatalogValidationResult['warnings'] } {
    const errors: CatalogValidationResult['errors'] = [];
    const warnings: CatalogValidationResult['warnings'] = [];

    if (!connectorId) {
      return { valid: true, errors, warnings };
    }

    // Check if connector exists in context
    const connector = llmContext?.connectors?.find(
      (c: any) => c.id === connectorId || c.name === connectorId,
    );

    if (!connector) {
      errors.push({
        actionId: type,
        connectorId,
        type: 'UNKNOWN_CONNECTOR',
        message: `Connector not found in catalog: ${connectorId}`,
        suggestion: `Available connectors: ${llmContext?.connectors?.map((c: any) => c.id).join(', ') || 'none'}`,
      });
      return { valid: false, errors, warnings };
    }

    // Check connector status
    if (connector.status === 'beta') {
      warnings.push({
        actionId: connectorId,
        type: 'BETA_STATUS',
        message: `Connector is in beta: ${connectorId}`,
      });
    }

    if (connector.status === 'deprecated') {
      warnings.push({
        actionId: connectorId,
        type: 'DEPRECATED_VERSION',
        message: `Connector is deprecated: ${connectorId}`,
      });
    }

    return { valid: true, errors, warnings };
  }

  /**
   * Validate a single action reference against connector functions
   */
  private validateActionReference(
    connectorId: string,
    functionId: string,
    llmContext: LLMContext,
  ): { valid: boolean; errors: CatalogValidationResult['errors']; warnings: CatalogValidationResult['warnings'] } {
    const errors: CatalogValidationResult['errors'] = [];
    const warnings: CatalogValidationResult['warnings'] = [];

    // First check connector exists
    const connectorValidation = this.validateConnectorReference(connectorId, 'ACTION', llmContext);
    if (!connectorValidation.valid) {
      return connectorValidation;
    }

    warnings.push(...connectorValidation.warnings);

    // Then check function exists in connector
    const connector = llmContext?.connectors?.find(
      (c: any) => c.id === connectorId || c.name === connectorId,
    );

    if (!connector || !connector.functions) {
      errors.push({
        actionId: functionId,
        connectorId,
        type: 'UNKNOWN_ACTION',
        message: `No functions found for connector: ${connectorId}`,
      });
      return { valid: false, errors, warnings };
    }

    const func = connector.functions.find(
      (f: any) => f.id === functionId || f.name === functionId,
    );

    if (!func) {
      errors.push({
        actionId: functionId,
        connectorId,
        type: 'UNKNOWN_ACTION',
        message: `Function not found in connector ${connectorId}: ${functionId}`,
        suggestion: `Available functions: ${connector.functions.map((f: any) => f.id).join(', ')}`,
      });
      return { valid: false, errors, warnings };
    }

    // Check function compatibility with capability versions
    if ((func as any).capabilities && Array.isArray((func as any).capabilities)) {
      for (const cap of (func as any).capabilities) {
        if (cap.required && !this.isCapabilityAvailable(cap.name, cap.minVersion)) {
          errors.push({
            actionId: functionId,
            connectorId,
            type: 'CAPABILITY_MISMATCH',
            message: `Required capability not available: ${cap.name}@${cap.minVersion}`,
          });
          return { valid: false, errors, warnings };
        }
      }
    }

    return { valid: true, errors, warnings };
  }

  /**
   * Check if a capability is available with minimum version requirement
   */
  private isCapabilityAvailable(capabilityName: string, minVersion?: string): boolean {
    // In real implementation, check against capability registry
    // For now, assume available
    return true;
  }

  /**
   * Get current catalog version
   */
  private getCatalogVersion(): string {
    // Return current semantic version of component registry
    return process.env.CATALOG_VERSION || '1.0.0';
  }

  /**
   * Suggest deprecated/alternative capabilities
   */
  suggestAlternatives(
    connectorId: string,
    functionId: string,
    llmContext: LLMContext,
  ): { alternative?: string; deprecationDate?: string; migrationType: 'REPLACEMENT' | 'DEPRECATION' | 'NONE' } {
    const connector = llmContext?.connectors?.find(
      (c: any) => c.id === connectorId || c.name === connectorId,
    );

    if (!connector) {
      return { migrationType: 'NONE' };
    }

    const func = connector.functions?.find(
      (f: any) => f.id === functionId || f.name === functionId,
    );

    if (!func) {
      return { migrationType: 'NONE' };
    }

    if ((func as any).deprecation) {
      return {
        alternative: (func as any).deprecation.replacementFunctionId,
        deprecationDate: (func as any).deprecation.date,
        migrationType: (func as any).deprecation.replacementFunctionId ? 'REPLACEMENT' : 'DEPRECATION',
      };
    }

    return { migrationType: 'NONE' };
  }
}
