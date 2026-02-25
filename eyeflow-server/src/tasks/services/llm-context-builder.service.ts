/**
 * LLM Context Builder Service
 * Builds rich context from the connector registry + user's live connector instances from DB.
 * This context is sent to the LLM service so it knows:
 *   - What connector types / functions / schemas / triggers exist (catalogue)
 *   - Which instances THIS user has configured and activated (personalised)
 */

import { Injectable } from '@nestjs/common';
import { ConnectorRegistryService } from './connector-registry.service';
import { LLMContext } from '../types/connector-manifest.types';
import { ConnectorsService } from '../../connectors/connectors.service';

import { LlmConfigService } from '../../llm-config/llm-config.service';

@Injectable()
export class LLMContextBuilderService {
  constructor(
    private readonly connectorRegistry: ConnectorRegistryService,
    private readonly connectorsService: ConnectorsService,
    private readonly llmConfigService: LlmConfigService,
  ) {}

  /**
   * Build complete LLM context for a user.
   * Includes ALL available connector types (catalogue) + user's actual active instances.
   */
  async buildContext(userId: string): Promise<LLMContext> {
    const connectors = this.connectorRegistry.getAllConnectors();
    const nodes      = this.connectorRegistry.getAllNodes();
    const functions  = this.connectorRegistry.getAllFunctions();
    const schemas    = this.connectorRegistry.getAllSchemas();
    const triggers   = this.connectorRegistry.getAllTriggers();

    // Fetch user's actual connector instances from DB (all non-deleted)
    const userConnectorEntities = await this.connectorsService.findAll(userId, {});

    // Fetch user's LLM agent configurations
    const llmConfigs = await this.llmConfigService.findAll(userId).catch(() => []);
    const userLlmAgents = llmConfigs.map((c) => ({
      configId:       c.id,
      name:           c.name ?? `${c.provider}/${c.model}`,
      description:    c.description,
      provider:       c.provider,
      model:          c.model,
      isDefault:      c.isDefault,
      skills:         c.skills ?? [],
      taskAffinities: c.taskAffinities ?? [],
      systemPrompt:   c.systemPrompt,
      temperature:    c.temperature,
      maxTokens:      c.maxTokens,
      responseFormat: c.responseFormat,
      contextWindow:  c.contextWindow,
    }));

    return {
      userId,
      timestamp: new Date(),
      connectors,
      nodes: nodes.map((n) => ({ connectorId: n.connectorId, node: n.node })),
      functions: functions.map((f) => ({ connectorId: f.connectorId, function: f.function })),
      schemas,
      triggers: triggers.map((t) => ({ connectorId: t.connectorId, trigger: t.trigger })),
      operators: this.getAllSupportedOperators() as any,
      userConnectors: userConnectorEntities.map((c) => ({
        connectorId:  c.type,
        instanceId:   c.id,
        instanceName: c.name,
        status:       c.status,
        type:         c.type,
      })),
      userLlmAgents,
      systemCapabilities: {
        supportedLanguages: ['en', 'fr'],
        maxTaskComplexity: 10,
        maxMissionsPerTask: 50,
        supportedOutputFormats: ['json', 'string', 'boolean', 'array', 'object'] as any,
      },
    };
  }

  /**
   * Build context focused on rule/event engine.
   */
  async buildRuleContext(userId: string): Promise<LLMContext> {
    return this.buildContext(userId);
  }

  /**
   * Build minimal context (lighter payload for perf-sensitive calls).
   */
  async buildMinimalContext(userId: string): Promise<Partial<LLMContext>> {
    const connectors = this.connectorRegistry.getAllConnectors();
    const userConnectorEntities = await this.connectorsService.findAll(userId, {});

    return {
      userId,
      timestamp: new Date(),
      connectors: connectors as any,
      userConnectors: userConnectorEntities.map((c) => ({
        connectorId:  c.type,
        instanceId:   c.id,
        instanceName: c.name,
        status:       c.status,
        type:         c.type,
      })),
    };
  }

  /**
   * Export context as JSON for documentation or sending to external services.
   */
  exportContextAsJSON(context: LLMContext): string {
    const simplified = {
      userId:     context.userId,
      timestamp:  context.timestamp,
      connectors: context.connectors.map((c) => ({
        id: c.id, name: c.name, description: c.description, capabilities: c.capabilities,
      })),
      nodes: context.nodes.map((n) => ({
        connectorId: n.connectorId,
        name:        n.node.name,
        displayName: n.node.displayName,
        description: n.node.description,
        functions:   n.node.availableFunctions.map((f) => ({
          id: f.id, name: f.name, category: f.category,
        })),
      })),
      functions: context.functions.map((f) => ({
        id:          f.function.id,
        connectorId: f.connectorId,
        name:        f.function.name,
        category:    f.function.category,
      })),
      triggers: context.triggers.map((t) => ({
        connectorId: t.connectorId,
        type:        t.trigger.type,
        description: t.trigger.description,
      })),
      userConnectors: context.userConnectors,
    };

    return JSON.stringify(simplified, null, 2);
  }

  private getAllSupportedOperators() {
    return [
      'eq', 'ne', 'gt', 'gte', 'lt', 'lte',
      'in', 'not_in',
      'contains', 'not_contains',
      'starts_with', 'ends_with',
      'regex', 'between',
      'exists', 'not_exists',
      'truthy', 'falsy',
    ];
  }
}
