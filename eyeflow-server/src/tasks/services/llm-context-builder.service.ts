/**
 * LLM Context Builder Service
 * Builds rich context from the connector registry
 * This context is sent to the LLM for task parsing
 */

import { Injectable } from '@nestjs/common';
import { ConnectorRegistryService } from './connector-registry.service';
import { LLMContext } from '../types/connector-manifest.types';

@Injectable()
export class LLMContextBuilderService {
  constructor(private readonly connectorRegistry: ConnectorRegistryService) {}

  /**
   * Build complete LLM context for a user
   * This includes ALL available connectors, their functions, schemas, triggers, etc.
   *
   * The LLM will use this to understand:
   * - What connectors are available
   * - What functions can be called
   * - What data schemas exist
   * - What triggers can be set up
   * - What conditions can be used
   */
  buildContext(userId: string): LLMContext {
    const connectors = this.connectorRegistry.getAllConnectors();
    const nodes = this.connectorRegistry.getAllNodes();
    const functions = this.connectorRegistry.getAllFunctions();
    const schemas = this.connectorRegistry.getAllSchemas();
    const triggers = this.connectorRegistry.getAllTriggers();

    return {
      userId,
      timestamp: new Date(),
      connectors,
      nodes: nodes.map((n) => ({
        connectorId: n.connectorId,
        node: n.node,
      })),
      functions: functions.map((f) => ({
        connectorId: f.connectorId,
        function: f.function,
      })),
      schemas,
      triggers: triggers.map((t) => ({
        connectorId: t.connectorId,
        trigger: t.trigger,
      })),
      operators: this.getAllSupportedOperators() as any,
      userConnectors: [], // TODO: Get user's specific connector instances
      systemCapabilities: {
        supportedLanguages: ['en', 'fr'],
        maxTaskComplexity: 10,
        maxMissionsPerTask: 50,
        supportedOutputFormats: ['json', 'string', 'boolean', 'array', 'object'] as any,
      },
    };
  }

  /**
   * Build context for compliance/rule engine
   * Focused on event patterns and conditions
   */
  buildRuleContext(userId: string): LLMContext {
    const context = this.buildContext(userId);

    // For rules, we only need:
    // - Triggers (what can be monitored)
    // - Conditions (what can be checked)
    // - Actions (what can be executed)
    return context;
  }

  /**
   * Build minimal context (for performance)
   * Only includes connectors and their basic info
   */
  buildMinimalContext(userId: string): Partial<LLMContext> {
    const connectors = this.connectorRegistry.getAllConnectors();

    return {
      userId,
      timestamp: new Date(),
      connectors: connectors as any, // Keep full manifests for minimal context too
    };
  }

  /**
   * Export context as JSON for documentation or sending to external services
   */
  exportContextAsJSON(context: LLMContext): string {
    const simplified = {
      userId: context.userId,
      timestamp: context.timestamp,
      connectors: context.connectors.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        capabilities: c.capabilities,
      })),
      nodes: context.nodes.map((n) => ({
        connectorId: n.connectorId,
        name: n.node.name,
        displayName: n.node.displayName,
        description: n.node.description,
        functions: n.node.availableFunctions.map((f) => ({
          id: f.id,
          name: f.name,
          category: f.category,
        })),
      })),
      functions: context.functions.map((f) => ({
        id: f.function.id,
        connectorId: f.connectorId,
        name: f.function.name,
        category: f.function.category,
      })),
      triggers: context.triggers.map((t) => ({
        connectorId: t.connectorId,
        type: t.trigger.type,
        description: t.trigger.description,
      })),
    };

    return JSON.stringify(simplified, null, 2);
  }

  /**
   * Get all supported operators
   */
  private getAllSupportedOperators() {
    return [
      'eq',
      'ne',
      'gt',
      'gte',
      'lt',
      'lte',
      'in',
      'not_in',
      'contains',
      'not_contains',
      'starts_with',
      'ends_with',
      'regex',
      'between',
      'exists',
      'not_exists',
      'truthy',
      'falsy',
    ];
  }
}
