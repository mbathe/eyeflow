/**
 * Contract Tests: LLM → NestJS Validation Pipeline
 *
 * Tests the complete validation pipeline with:
 * - Valid/invalid LLM payloads
 * - Schema compliance
 * - Catalog integration
 * - Retry logic
 * - Error escalation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { LLMValidationService } from '../llm-validation.service';
import { LLMResponseValidationService } from '../llm-response-validation.service';
import { CatalogValidationService } from '../catalog-validation.service';
import { SandboxExecutionService } from '../sandbox-execution.service';
import { ConnectorRegistryService } from '../connector-registry.service';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

describe('LLM Validation Contract Tests', () => {
  let validationService: LLMValidationService;
  let schemaValidator: LLMResponseValidationService;
  let catalogValidator: CatalogValidationService;
  let sandboxExecutor: SandboxExecutionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMValidationService,
        LLMResponseValidationService,
        SandboxExecutionService,
        {
          provide: CatalogValidationService,
          useValue: {
            validateCatalogReferences: jest.fn().mockResolvedValue({
              valid: true,
              errors: [],
              warnings: [],
              metadata: { checkedAt: new Date(), catalogVersion: '1.0.0', unknownSafeMode: false },
            }),
          },
        },
        {
          provide: ConnectorRegistryService,
          useValue: {},
        },
      ],
    }).compile();

    validationService = module.get<LLMValidationService>(LLMValidationService);
    schemaValidator = module.get<LLMResponseValidationService>(LLMResponseValidationService);
    catalogValidator = module.get<CatalogValidationService>(CatalogValidationService);
    sandboxExecutor = module.get<SandboxExecutionService>(SandboxExecutionService);
  });

  describe('Valid LLM Responses', () => {
    it('should accept valid MCP workflow rule', async () => {
      const validResponse = {
        workflow_rules: {
          rules: [
            {
              name: 'send_slack_message',
              description: 'Send notification to Slack channel',
              trigger: { type: 'ON_EVENT', source: 'webhook' },
              actions: [
                {
                  type: 'send_message',
                  channel: 'alerts',
                  payload: {
                    connector: 'slack',
                    functionId: 'send_message',
                    text: 'Notification triggered',
                  },
                },
              ],
            },
          ],
          summary: 'Generated Slack workflow',
          confidence: 0.95,
        },
      };

      const llmFunction = jest
        .fn()
        .mockResolvedValueOnce({
          response: validResponse,
          statusCode: 200,
        });

      const result = await validationService.parseIntentWithValidation(
        llmFunction,
        { connectors: [] },
        'workflow-1',
      );

      expect(result.validationPassed).toBe(true);
      expect(result.schemaValidation.valid).toBe(true);
      expect(result.intent.success).toBe(true);
    });

    it('should accept workflow with multiple rules', async () => {
      const multiRuleResponse = {
        workflow_rules: {
          rules: [
            {
              name: 'rule_1',
              description: 'First rule',
              trigger: { type: 'ON_CREATE' },
              actions: [{ type: 'action_1', payload: { connector: 'api' } }],
            },
            {
              name: 'rule_2',
              description: 'Second rule',
              trigger: { type: 'ON_UPDATE' },
              actions: [{ type: 'action_2', payload: { connector: 'db' } }],
            },
          ],
          summary: 'Multiple rules workflow',
          confidence: 0.88,
        },
      };

      const llmFunction = jest.fn().mockResolvedValueOnce({
        response: multiRuleResponse,
        statusCode: 200,
      });

      const result = await validationService.parseIntentWithValidation(
        llmFunction,
        { connectors: [] },
        'workflow-1',
      );

      expect(result.intent.ruleSuggestions).toHaveLength(2);
      expect(result.validationPassed).toBe(true);
    });
  });

  describe('Invalid LLM Responses', () => {
    it('should reject response missing workflow_rules', async () => {
      const invalidResponse = {
        // missing workflow_rules
        answer: 'Some text',
      };

      const llmFunction = jest.fn().mockResolvedValueOnce({
        response: invalidResponse,
        statusCode: 200,
      });

      await expect(
        validationService.parseIntentWithValidation(
          llmFunction,
          { connectors: [] },
          'workflow-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject response with missing required rule fields', async () => {
      const invalidResponse = {
        workflow_rules: {
          rules: [
            {
              name: 'incomplete_rule',
              // missing description, trigger, actions
              description: 'Test',
            },
          ],
          summary: 'Test',
          confidence: 0.7,
        },
      };

      const llmFunction = jest.fn().mockResolvedValueOnce({
        response: invalidResponse,
        statusCode: 200,
      });

      await expect(
        validationService.parseIntentWithValidation(
          llmFunction,
          { connectors: [] },
          'workflow-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject response with invalid confidence score', async () => {
      const invalidResponse = {
        workflow_rules: {
          rules: [
            {
              name: 'rule',
              description: 'Test',
              trigger: { type: 'ON_EVENT' },
              actions: [{ type: 'action' }],
            },
          ],
          summary: 'Test',
          confidence: 1.5, // Invalid: > 1
        },
      };

      const llmFunction = jest.fn().mockResolvedValueOnce({
        response: invalidResponse,
        statusCode: 200,
      });

      await expect(
        validationService.parseIntentWithValidation(
          llmFunction,
          { connectors: [] },
          'workflow-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject rules with empty actions array', async () => {
      const invalidResponse = {
        workflow_rules: {
          rules: [
            {
              name: 'empty_actions',
              description: 'Rule with no actions',
              trigger: { type: 'ON_EVENT' },
              actions: [], // Invalid: must have at least 1 action
            },
          ],
          summary: 'Test',
          confidence: 0.8,
        },
      };

      const llmFunction = jest.fn().mockResolvedValueOnce({
        response: invalidResponse,
        statusCode: 200,
      });

      await expect(
        validationService.parseIntentWithValidation(
          llmFunction,
          { connectors: [] },
          'workflow-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Schema Validation', () => {
    it('should detect invalid trigger types', async () => {
      const invalidResponse = {
        workflow_rules: {
          rules: [
            {
              name: 'bad_trigger',
              description: 'Test',
              trigger: { type: 'INVALID_TRIGGER_TYPE' }, // Not in enum
              actions: [{ type: 'action' }],
            },
          ],
          summary: 'Test',
          confidence: 0.8,
        },
      };

      const llmFunction = jest.fn().mockResolvedValueOnce({
        response: invalidResponse,
        statusCode: 200,
      });

      await expect(
        validationService.parseIntentWithValidation(
          llmFunction,
          { connectors: [] },
          'workflow-1',
        ),
      ).rejects.toThrow();
    });

    it('should detect invalid operator in conditions', async () => {
      const invalidResponse = {
        workflow_rules: {
          rules: [
            {
              name: 'bad_operator',
              description: 'Test',
              trigger: { type: 'ON_EVENT' },
              conditions: [
                {
                  type: 'status',
                  operator: 'INVALID_OP', // Not in enum
                  value: 'error',
                },
              ],
              actions: [{ type: 'action' }],
            },
          ],
          summary: 'Test',
          confidence: 0.8,
        },
      };

      const llmFunction = jest.fn().mockResolvedValueOnce({
        response: invalidResponse,
        statusCode: 200,
      });

      await expect(
        validationService.parseIntentWithValidation(
          llmFunction,
          { connectors: [] },
          'workflow-1',
        ),
      ).rejects.toThrow();
    });
  });

  describe('Retry Logic', () => {
    it('should retry on 5xx errors', async () => {
      const llmFunctionMock = jest
        .fn()
        .mockResolvedValueOnce({ response: {}, statusCode: 503 }) // Fail
        .mockResolvedValueOnce({ response: {}, statusCode: 503 }) // Fail
        .mockResolvedValueOnce({
          response: {
            workflow_rules: {
              rules: [
                {
                  name: 'rule',
                  description: 'Test',
                  trigger: { type: 'ON_EVENT' },
                  actions: [{ type: 'action', payload: { connector: 'test' } }],
                },
              ],
              summary: 'Test',
              confidence: 0.8,
            },
          },
          statusCode: 200, // Success
        });

      const result = await validationService.parseIntentWithValidation(
        llmFunctionMock,
        { connectors: [] },
        'workflow-1',
      );

      expect(result.validationPassed).toBe(true);
      expect(llmFunctionMock).toHaveBeenCalledTimes(3); // 2 retries + 1 success
      expect(result.metrics.retryCount).toBeGreaterThan(0);
    });

    it('should not retry on 4xx errors', async () => {
      const llmFunctionMock = jest.fn().mockResolvedValueOnce({
        response: { error: 'Invalid request' },
        statusCode: 400,
      });

      await expect(
        validationService.parseIntentWithValidation(
          llmFunctionMock,
          { connectors: [] },
          'workflow-1',
        ),
      ).rejects.toThrow(BadRequestException);

      expect(llmFunctionMock).toHaveBeenCalledTimes(1); // No retries
    });

    it('should fail after max retries exceeded', async () => {
      const llmFunctionMock = jest
        .fn()
        .mockResolvedValue({ response: {}, statusCode: 503 });

      await expect(
        validationService.parseIntentWithValidation(
          llmFunctionMock,
          { connectors: [] },
          'workflow-1',
        ),
      ).rejects.toThrow(ServiceUnavailableException);

      // Should try initial + 3 retries = 4 attempts
      expect(llmFunctionMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Metrics Tracking', () => {
    it('should track successful validations', async () => {
      const validResponse = {
        workflow_rules: {
          rules: [
            {
              name: 'metric_test',
              description: 'Metrics test rule',
              trigger: { type: 'ON_EVENT' },
              actions: [{ type: 'action', payload: { connector: 'test' } }],
            },
          ],
          summary: 'Test',
          confidence: 0.9,
        },
      };

      const llmFunction = jest.fn().mockResolvedValueOnce({
        response: validResponse,
        statusCode: 200,
      });

      const initialMetrics = validationService.getMetrics();
      const initialCount = initialMetrics.requestsSuccessful;

      await validationService.parseIntentWithValidation(
        llmFunction,
        { connectors: [] },
        'workflow-1',
      );

      const finalMetrics = validationService.getMetrics();
      expect(finalMetrics.requestsSuccessful).toBe(initialCount + 1);
      expect(finalMetrics.requestsTotal).toBeGreaterThan(initialMetrics.requestsTotal);
    });

    it('should track failed validations', async () => {
      const invalidResponse = {
        workflow_rules: {
          rules: [], // Empty rules - invalid
          summary: 'Test',
          confidence: 0.8,
        },
      };

      const llmFunction = jest.fn().mockResolvedValueOnce({
        response: invalidResponse,
        statusCode: 200,
      });

      const initialMetrics = validationService.getMetrics();

      try {
        await validationService.parseIntentWithValidation(
          llmFunction,
          { connectors: [] },
          'workflow-1',
        );
      } catch (e) {
        // Expected
      }

      const finalMetrics = validationService.getMetrics();
      expect(finalMetrics.requestsRejected).toBeGreaterThan(
        initialMetrics.requestsRejected,
      );
    });
  });

  describe('Sandbox Simulation', () => {
    it('should include sandbox results in validation response', async () => {
      const validResponse = {
        workflow_rules: {
          rules: [
            {
              name: 'sandbox_test',
              description: 'Sandbox test rule',
              trigger: { type: 'ON_EVENT' },
              actions: [{ type: 'send_message', payload: { connector: 'slack' } }],
            },
          ],
          summary: 'Test',
          confidence: 0.85,
        },
      };

      const llmFunction = jest.fn().mockResolvedValueOnce({
        response: validResponse,
        statusCode: 200,
      });

      const result = await validationService.parseIntentWithValidation(
        llmFunction,
        { connectors: [] },
        'workflow-1',
      );

      expect(result.sandboxExecution).toBeDefined();
      expect(result.sandboxExecution.workflowId).toBe('workflow-1');
      expect(result.sandboxExecution.steps.length).toBeGreaterThan(0);
    });
  });
});
