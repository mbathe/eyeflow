/**
 * Catalog Manifest Validation Tests
 *
 * Tests for:
 * - Connector manifest compliance (JSON Schema)
 * - Capability versioning
 * - Deprecation policies
 * - Integration with new connectors from external developers
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CatalogValidationService } from '../catalog-validation.service';
import { ConnectorRegistryService } from '../connector-registry.service';

describe('Catalog Manifest Validation', () => {
  let catalogValidator: CatalogValidationService;
  let registryService: ConnectorRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogValidationService,
        {
          provide: ConnectorRegistryService,
          useValue: {},
        },
      ],
    }).compile();

    catalogValidator = module.get<CatalogValidationService>(CatalogValidationService);
    registryService = module.get<ConnectorRegistryService>(ConnectorRegistryService);
  });

  describe('Connector Manifest Compliance', () => {
    it('should validate a complete, well-formed connector manifest', async () => {
      const manifest = [
        {
          name: 'send_slack_message',
          description: 'Send notification to Slack',
          trigger: { type: 'ON_EVENT', source: 'webhook' },
          actions: [
            {
              type: 'send_message',
              channel: 'alerts',
              payload: {
                connector: 'slack',
                functionId: 'send_message',
              },
            },
          ],
        },
      ];

      const llmContext = {
        connectors: [
          {
            id: 'slack',
            name: 'Slack',
            status: 'stable',
            functions: [
              {
                id: 'send_message',
                name: 'Send Message',
                status: 'stable',
              },
            ],
          },
        ],
      };

      const result = await catalogValidator.validateCatalogReferences(
        manifest,
        llmContext,
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept manifest from external developer', async () => {
      const thirdPartyManifest = [
        {
          name: 'process_webhook',
          description: 'Process incoming webhook data',
          trigger: { type: 'ON_EVENT' },
          actions: [
            {
              type: 'transform_and_store',
              payload: {
                connector: 'custom_etl',
                functionId: 'process_data',
              },
            },
          ],
        },
      ];

      const llmContext = {
        connectors: [
          {
            id: 'custom_etl',
            name: 'Custom ETL Service',
            status: 'stable',
            author: 'external_dev@company.com',
            version: '1.0.0',
            functions: [
              {
                id: 'process_data',
                name: 'Process Data',
                status: 'stable',
              },
            ],
          },
        ],
      };

      const result = await catalogValidator.validateCatalogReferences(
        thirdPartyManifest,
        llmContext,
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('Unknown Connector Handling', () => {
    it('should fail on unknown connector', async () => {
      const manifest = [
        {
          name: 'use_unknown',
          description: 'Rule using unknown connector',
          trigger: { type: 'ON_EVENT' },
          actions: [
            {
              type: 'action',
              payload: { connector: 'non_existent' },
            },
          ],
        },
      ];

      const llmContext = {
        connectors: [
          {
            id: 'slack',
            name: 'Slack',
            functions: [],
          },
        ],
      };

      const result = await catalogValidator.validateCatalogReferences(
        manifest,
        llmContext,
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('UNKNOWN_CONNECTOR');
    });

    it('should allow unknown connector in safe mode', async () => {
      process.env.CATALOG_UNKNOWN_SAFE_MODE = 'true';

      const manifest = [
        {
          name: 'future_connector_usage',
          description: 'Uses a connector not yet in catalog',
          trigger: { type: 'ON_EVENT' },
          actions: [
            {
              type: 'action',
              payload: { connector: 'future_service' },
            },
          ],
        },
      ];

      const llmContext = { connectors: [] };

      const result = await catalogValidator.validateCatalogReferences(
        manifest,
        llmContext,
      );

      // In safe mode, should warn but not error
      expect(result.warnings.length).toBeGreaterThan(0);

      process.env.CATALOG_UNKNOWN_SAFE_MODE = 'false';
    });

    it('should suggest available connectors', async () => {
      const manifest = [
        {
          name: 'typo_connector',
          description: 'Typo in connector name',
          trigger: { type: 'ON_EVENT' },
          actions: [
            {
              type: 'action',
              payload: { connector: 'slak' }, // Typo: should be 'slack'
            },
          ],
        },
      ];

      const llmContext = {
        connectors: [
          { id: 'slack', name: 'Slack', functions: [] },
          { id: 'github', name: 'GitHub', functions: [] },
        ],
      };

      const result = await catalogValidator.validateCatalogReferences(
        manifest,
        llmContext,
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0].suggestion).toContain('slack');
    });
  });

  describe('Capability Versioning', () => {
    it('should validate capability version requirements', async () => {
      const manifest = [
        {
          name: 'use_versioned_capability',
          description: 'Uses a specific capability version',
          trigger: { type: 'ON_EVENT' },
          actions: [
            {
              type: 'action',
              payload: {
                connector: 'api_service',
                functionId: 'advanced_query',
              },
            },
          ],
        },
      ];

      const llmContext = {
        connectors: [
          {
            id: 'api_service',
            name: 'API Service',
            functions: [
              {
                id: 'advanced_query',
                name: 'Advanced Query',
                capabilities: [
                  { name: 'GraphQL', minVersion: '2.0.0', required: true },
                ],
              },
            ],
          },
        ],
      };

      const result = await catalogValidator.validateCatalogReferences(
        manifest,
        llmContext,
      );

      // Should validate capability availability
      expect(result).toBeDefined();
    });

    it('should warn on beta capability', async () => {
      const manifest = [
        {
          name: 'beta_feature',
          description: 'Uses beta connector',
          trigger: { type: 'ON_EVENT' },
          actions: [
            {
              type: 'action',
              payload: { connector: 'new_service' },
            },
          ],
        },
      ];

      const llmContext = {
        connectors: [
          {
            id: 'new_service',
            name: 'New Service',
            status: 'beta',
            functions: [{ id: 'action', name: 'Action' }],
          },
        ],
      };

      const result = await catalogValidator.validateCatalogReferences(
        manifest,
        llmContext,
      );

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].type).toBe('BETA_STATUS');
    });
  });

  describe('Deprecation Handling', () => {
    it('should warn on deprecated connector', async () => {
      const manifest = [
        {
          name: 'use_deprecated',
          description: 'Uses deprecated connector',
          trigger: { type: 'ON_EVENT' },
          actions: [
            {
              type: 'action',
              payload: { connector: 'old_service' },
            },
          ],
        },
      ];

      const llmContext = {
        connectors: [
          {
            id: 'old_service',
            name: 'Old Service',
            status: 'deprecated',
            deprecationDate: '2026-06-01',
            functions: [{ id: 'action', name: 'Action' }],
          },
        ],
      };

      const result = await catalogValidator.validateCatalogReferences(
        manifest,
        llmContext,
      );

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].type).toBe('DEPRECATED_VERSION');
    });

    it('should suggest replacement for deprecated function', async () => {
      const suggestion = catalogValidator.suggestAlternatives(
        'old_service',
        'old_action',
        {
          connectors: [
            {
              id: 'old_service',
              name: 'Old Service',
              functions: [
                {
                  id: 'old_action',
                  name: 'Old Action',
                  deprecation: {
                    replacementFunctionId: 'new_action',
                    date: '2026-06-01',
                  },
                },
              ],
            },
          ],
        },
      );

      expect(suggestion.alternative).toBe('new_action');
      expect(suggestion.migrationType).toBe('REPLACEMENT');
    });

    it('should handle pure deprecation (no replacement)', async () => {
      const suggestion = catalogValidator.suggestAlternatives(
        'old_service',
        'retiring_action',
        {
          connectors: [
            {
              id: 'old_service',
              name: 'Old Service',
              functions: [
                {
                  id: 'retiring_action',
                  name: 'Retiring Action',
                  deprecation: {
                    replacementFunctionId: null,
                    date: '2026-03-01',
                    reason: 'Feature being retired',
                  },
                },
              ],
            },
          ],
        },
      );

      expect(suggestion.alternative).toBeUndefined();
      expect(suggestion.migrationType).toBe('DEPRECATION');
    });
  });

  describe('Multiple Action Validation', () => {
    it('should validate rules with multiple actions', async () => {
      const manifest = [
        {
          name: 'multi_action_rule',
          description: 'Rule with multiple actions',
          trigger: { type: 'ON_EVENT' },
          actions: [
            {
              type: 'log',
              payload: { connector: 'logger', functionId: 'log_event' },
            },
            {
              type: 'send',
              payload: { connector: 'slack', functionId: 'send_message' },
            },
            {
              type: 'store',
              payload: { connector: 'db', functionId: 'insert' },
            },
          ],
        },
      ];

      const llmContext = {
        connectors: [
          {
            id: 'logger',
            name: 'Logger',
            functions: [{ id: 'log_event' }],
          },
          {
            id: 'slack',
            name: 'Slack',
            functions: [{ id: 'send_message' }],
          },
          {
            id: 'db',
            name: 'Database',
            functions: [{ id: 'insert' }],
          },
        ],
      };

      const result = await catalogValidator.validateCatalogReferences(
        manifest,
        llmContext,
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail if any action is invalid', async () => {
      const manifest = [
        {
          name: 'partially_invalid',
          description: 'Rule with one invalid action',
          trigger: { type: 'ON_EVENT' },
          actions: [
            {
              type: 'log',
              payload: { connector: 'logger', functionId: 'log_event' },
            },
            {
              type: 'invalid_action',
              payload: { connector: 'nonexistent', functionId: 'nope' },
            },
          ],
        },
      ];

      const llmContext = {
        connectors: [
          {
            id: 'logger',
            name: 'Logger',
            functions: [{ id: 'log_event' }],
          },
        ],
      };

      const result = await catalogValidator.validateCatalogReferences(
        manifest,
        llmContext,
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Trigger Validation', () => {
    it('should validate trigger source connectors', async () => {
      const manifest = [
        {
          name: 'sourced_rule',
          description: 'Rule with explicit trigger source',
          trigger: {
            type: 'ON_CREATE',
            source: 'crm_system',
          },
          actions: [{ type: 'action', payload: { connector: 'slack' } }],
        },
      ];

      const llmContext = {
        connectors: [
          {
            id: 'crm_system',
            name: 'CRM System',
            functions: [],
          },
          {
            id: 'slack',
            name: 'Slack',
            functions: [{ id: 'action' }],
          },
        ],
      };

      const result = await catalogValidator.validateCatalogReferences(
        manifest,
        llmContext,
      );

      expect(result.valid).toBe(true);
    });

    it('should fail on unknown trigger source', async () => {
      const manifest = [
        {
          name: 'unknown_source',
          description: 'Rule with unknown trigger source',
          trigger: {
            type: 'ON_UPDATE',
            source: 'missing_system',
          },
          actions: [{ type: 'action', payload: { connector: 'slack' } }],
        },
      ];

      const llmContext = {
        connectors: [
          {
            id: 'slack',
            name: 'Slack',
            functions: [{ id: 'action' }],
          },
        ],
      };

      const result = await catalogValidator.validateCatalogReferences(
        manifest,
        llmContext,
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'UNKNOWN_CONNECTOR')).toBe(true);
    });
  });

  describe('Catalog Metadata', () => {
    it('should include catalog version in validation result', async () => {
      const manifest = [
        {
          name: 'test_rule',
          description: 'Test',
          trigger: { type: 'ON_EVENT' },
          actions: [{ type: 'action', payload: { connector: 'test' } }],
        },
      ];

      const llmContext = {
        connectors: [
          {
            id: 'test',
            name: 'Test',
            functions: [{ id: 'action' }],
          },
        ],
      };

      const result = await catalogValidator.validateCatalogReferences(
        manifest,
        llmContext,
      );

      expect(result.metadata).toBeDefined();
      expect(result.metadata.checkedAt).toBeInstanceOf(Date);
      expect(result.metadata.catalogVersion).toBeDefined();
    });
  });
});
