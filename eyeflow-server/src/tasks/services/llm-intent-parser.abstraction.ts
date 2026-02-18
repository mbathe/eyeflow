/**
 * LLM Intent Parser Abstraction
 * This defines the contract for the external Python LLM service
 *
 * The Python service will:
 * 1. Receive rich context (all connectors, functions, schemas, nodes, triggers)
 * 2. Parse the user's natural language request
 * 3. Return structured intent with:
 *    - Identified action/function to execute
 *    - Resolved parameters with proper types
 *    - Target connectors/nodes
 *    - Validation that everything is executable
 *    - Confidence score
 *    - Suggested missions to execute
 */

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { LLMContext, ConnectorFunction } from '../types/connector-manifest.types';

/**
 * The response the LLM Parser returns
 */
export interface LLMIntentParserResponse {
  // Parsing success
  success: boolean;
  confidence: number; // 0-1: How confident is the parser in this parsing

  // What was understood
  intent: {
    description: string;
    action: string;
    actionType: 'READ' | 'WRITE' | 'DELETE' | 'EXECUTE' | 'QUERY' | 'TRANSFORM';
  };

  // Resolved targets
  targets: {
    connectorId: string;
    connectorName: string;
    nodeId?: string;
    nodeName?: string;
    functionId: string;
    functionName: string;
  }[];

  // Parsed parameters with types
  parameters: {
    name: string;
    value: any;
    type: string;
    resolved: boolean;
  }[];

  // Suggested execution missions
  missions: Array<{
    nodeId: string;
    functionId: string;
    connectorId: string;
    parameters: Record<string, any>;
    metadata?: Record<string, any>;
  }>;

  // Validation result
  validation: {
    isExecutable: boolean;
    issues: string[];
    warnings: string[];
  };

  // For Mode 3: Rule suggestions
  ruleSuggestions?: Array<{
    description: string;
    trigger: {
      type: string;
      connectorId: string;
      nodeId: string;
      filterFields?: string[];
    };
    condition?: {
      field: string;
      operator: string;
      value: any;
    };
    actions: Array<{
      functionId: string;
      connectorId: string;
      parameters: Record<string, any>;
    }>;
  }>;

  // Debug info
  debug?: {
    parsingSteps: string[];
    matchedFunctions: ConnectorFunction[];
    resolvedSchemas: string[];
  };
}

/**
 * Abstract base class for LLM Intent Parser
 * This is what the NestJS service implements
 * The actual parsing logic will be in the Python microservice
 */
@Injectable()
export abstract class LLMIntentParserService {
  /**
   * Parse user input to extract intent, targets, and parameters
   *
   * @param userInput The user's natural language request
   * @param llmContext Rich context with all available connectors, functions, schemas
   * @param userId User ID for permission checking
   * @param additionalContext Optional context (previous commands, user preferences, etc)
   * @returns Parsed intent with structured data
   */
  abstract parseIntent(
    userInput: string,
    llmContext: LLMContext,
    userId: string,
    additionalContext?: Record<string, any>,
  ): Promise<LLMIntentParserResponse>;

  /**
   * Generate Rule suggestions for Mode 3
   * When user describes a compliance rule or event pattern
   *
   * Example: "I want to check compliance every time a new client is created"
   * The LLM understands this is a rule, finds the trigger (ON_CREATE on Customer node)
   * and suggests actions to take
   */
  abstract buildRuleFromDescription(
    description: string,
    llmContext: LLMContext,
    userId: string,
  ): Promise<LLMIntentParserResponse>;

  /**
   * Validate if a proposed task/intent is executable
   * Checks:
   * - All referenced connectors exist
   * - All referenced functions exist
   * - All parameters match expected types
   * - User has permissions
   * - Data schemas are compatible
   *
   * @returns Validation result with issues
   */
  abstract validateTaskExecution(
    intent: LLMIntentParserResponse,
    llmContext: LLMContext,
    userId: string,
  ): Promise<{ valid: boolean; issues: string[]; warnings: string[] }>;
}

/**
 * HTTP Client implementation to call the Python LLM service
 * This is the concrete implementation in NestJS that calls the external Python service
 */
@Injectable()
export class LLMIntentParserHttpClient extends LLMIntentParserService {
  private readonly logger = new Logger(LLMIntentParserHttpClient.name);
  private readonly llmServiceUrl = process.env.LLM_SERVICE_URL || 'http://localhost:8000';
  private readonly timeout = 30000; // 30s timeout

  async parseIntent(
    userInput: string,
    llmContext: LLMContext,
    userId: string,
    additionalContext?: Record<string, any>,
  ): Promise<LLMIntentParserResponse> {
    // Call Python LLM service to generate rules and convert result into ParsedIntent shape
    try {
      const payload = {
        user_intent: userInput,
        aggregated_context: llmContext,
      };

      this.logger.log(`Calling Python LLM service: ${this.llmServiceUrl}/api/rules/generate`);
      const resp = await axios.post(`${this.llmServiceUrl}/api/rules/generate`, payload, {
        timeout: this.timeout,
        headers: { 'Content-Type': 'application/json' },
      });

      const body = resp.data || {};
      const rules = body.workflow_rules || { rules: [], summary: '', confidence: 0 };

      // Build a best-effort LLMIntentParserResponse from generated rules
      const firstRule = (rules.rules && rules.rules.length > 0) ? rules.rules[0] : null;

      const intentDesc = firstRule?.description || rules.summary || userInput;
      const confidence = rules.confidence ?? 0.9;

      // Heuristic: derive targets/missions from actions payloads (if connector/channel present)
      const targets: any[] = [];
      const missions: any[] = [];
      if (firstRule && firstRule.actions) {
        for (const action of firstRule.actions) {
          const connectorId = action.payload?.connector || action.channel || action.payload?.connectorId || null;
          const functionId = action.type || action.payload?.functionId || action.payload?.action;
          const parameters = action.payload || {};

          if (connectorId) {
            targets.push({ connectorId: String(connectorId), connectorName: String(connectorId), functionId, functionName: functionId });
          }

          missions.push({ connectorId: connectorId || 'unknown', functionId: functionId || 'unknown', parameters });
        }
      }

      const parsed: LLMIntentParserResponse = {
        success: true,
        confidence,
        intent: {
          description: intentDesc,
          action: firstRule?.name || 'generated_rule',
          actionType: 'EXECUTE',
        },
        targets,
        parameters: [],
        missions,
        validation: {
          isExecutable: targets.length > 0,
          issues: targets.length > 0 ? [] : ['No connector targets could be inferred from generated rule actions'],
          warnings: [],
        },
        ruleSuggestions: rules.rules.map((r: any) => ({
          description: r.description,
          trigger: { type: r.trigger || 'ON_EVENT', connectorId: r.trigger?.source || null, nodeId: null },
          condition: r.conditions && r.conditions.length > 0 ? { field: r.conditions[0].type, operator: r.conditions[0].operator, value: r.conditions[0].value } : undefined,
          actions: (r.actions || []).map((a: any) => ({ functionId: a.type, connectorId: a.payload?.connector || a.channel || null, parameters: a.payload || {} })),
        })),
      };

      return parsed;
    } catch (err) {
      this.logger.error(`LLM HTTP parseIntent failed: ${(err as any)?.message || err}`);
      return {
        success: false,
        confidence: 0,
        intent: { description: 'LLM parse failed', action: 'NONE', actionType: 'READ' },
        targets: [],
        parameters: [],
        missions: [],
        validation: { isExecutable: false, issues: ['LLM parse HTTP error'], warnings: [] },
      };
    }
  }

  async buildRuleFromDescription(
    description: string,
    llmContext: LLMContext,
    userId: string,
  ): Promise<LLMIntentParserResponse> {
    try {
      const payload = { user_intent: description, aggregated_context: llmContext };
      const resp = await axios.post(`${this.llmServiceUrl}/api/rules/generate`, payload, { timeout: this.timeout });
      const body = resp.data || {};
      this.logger.log(`LLM HTTP response body keys: ${Object.keys(body).join(', ')}`);
      const workflowRules = body.workflow_rules || { rules: [], summary: '', confidence: 0 };

      // Map GeneratedRules -> LLMIntentParserResponse with ruleSuggestions
      const response: LLMIntentParserResponse = {
        success: true,
        confidence: workflowRules.confidence ?? 0.9,
        intent: { description: workflowRules.summary || description, action: 'generate_rule', actionType: 'EXECUTE' },
        targets: [],
        parameters: [],
        missions: [],
        validation: { isExecutable: true, issues: [], warnings: [] },
        ruleSuggestions: workflowRules.rules.map((r: any) => ({
          description: r.description,
          trigger: { type: r.trigger || 'ON_EVENT', connectorId: null, nodeId: null },
          condition: r.conditions && r.conditions.length > 0 ? { field: r.conditions[0].type, operator: r.conditions[0].operator, value: r.conditions[0].value } : undefined,
          actions: (r.actions || []).map((a: any) => ({ functionId: a.type, connectorId: a.payload?.connector || a.channel || null, parameters: a.payload || {} })),
        })),
      };

      return response;
    } catch (err) {
      this.logger.error(`buildRuleFromDescription failed: ${(err as any)?.message || err}`);
      return {
        success: false,
        confidence: 0,
        intent: { description: 'Failed to build rule', action: 'NONE', actionType: 'READ' },
        targets: [],
        parameters: [],
        missions: [],
        validation: { isExecutable: false, issues: ['LLM buildRuleFromDescription error'], warnings: [] },
      };
    }
  }

  async validateTaskExecution(
    intent: LLMIntentParserResponse,
    llmContext: LLMContext,
    userId: string,
  ): Promise<{ valid: boolean; issues: string[]; warnings: string[] }> {
    // TODO: Validate intent against context
    throw new Error('Not implemented');
  }
}

/**
 * Mock implementation for testing/development
 */
@Injectable()
export class LLMIntentParserMock extends LLMIntentParserService {
  async parseIntent(
    userInput: string,
    llmContext: LLMContext,
    userId: string,
    additionalContext?: Record<string, any>,
  ): Promise<LLMIntentParserResponse> {
    // Simple mock: look for keywords
    if (userInput.toLowerCase().includes('slack')) {
      const slackConnector = llmContext.connectors.find((c) => c.id === 'slack');
      if (slackConnector) {
        return {
          success: true,
          confidence: 0.85,
          intent: {
            description: 'Send message to Slack',
            action: 'send_message',
            actionType: 'WRITE',
          },
          targets: [
            {
              connectorId: 'slack',
              connectorName: 'Slack',
              functionId: 'slack_send_message',
              functionName: 'Send Message',
            },
          ],
          parameters: [
            {
              name: 'text',
              value: userInput,
              type: 'string',
              resolved: true,
            },
          ],
          missions: [
            {
              connectorId: 'slack',
              nodeId: 'slack_channel',
              functionId: 'slack_send_message',
              parameters: { text: userInput },
            },
          ],
          validation: {
            isExecutable: true,
            issues: [],
            warnings: [],
          },
        };
      }
    }

    return {
      success: false,
      confidence: 0,
      intent: {
        description: 'Could not parse input',
        action: 'UNKNOWN',
        actionType: 'READ',
      },
      targets: [],
      parameters: [],
      missions: [],
      validation: {
        isExecutable: false,
        issues: ['Could not understand the request'],
        warnings: [],
      },
    };
  }

  async buildRuleFromDescription(
    description: string,
    llmContext: LLMContext,
    userId: string,
  ): Promise<LLMIntentParserResponse> {
    // TODO: Mock rule building
    throw new Error('Not implemented');
  }

  async validateTaskExecution(
    intent: LLMIntentParserResponse,
    llmContext: LLMContext,
    userId: string,
  ): Promise<{ valid: boolean; issues: string[]; warnings: string[] }> {
    // Simple validation
    if (!intent.success) {
      return {
        valid: false,
        issues: ['Intent parsing failed'],
        warnings: [],
      };
    }

    if (intent.targets.length === 0) {
      return {
        valid: false,
        issues: ['No targets found'],
        warnings: [],
      };
    }

    return {
      valid: true,
      issues: [],
      warnings: [],
    };
  }
}
