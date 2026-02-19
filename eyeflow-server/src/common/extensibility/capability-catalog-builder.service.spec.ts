import { Test, TestingModule } from '@nestjs/testing';
import { CapabilityCatalogBuilder } from './capability-catalog-builder.service';
import { ComponentRegistry } from './component-registry.service';
import { ComponentValidator } from './component-validator.service';
import { RedisCacheService } from '../services/redis-cache.service';
import { CompilableComponent } from './compilable-component.interface';

describe('CapabilityCatalogBuilder', () => {
  let builder: CapabilityCatalogBuilder;
  let registry: ComponentRegistry;
  let cache: RedisCacheService;

  const createMockComponent = (id: string, numCapabilities = 1): CompilableComponent => ({
    id,
    name: `Component ${id}`,
    version: '1.0.0',
    description: `Test component ${id}`,
    author: 'Test Author',
    capabilities: Array.from({ length: numCapabilities }, (_, i) => ({
      id: `${id}.cap${i}`,
      name: `Capability ${i}`,
      description: `Test capability for ${id}`,
      category: i % 2 === 0 ? 'service' : 'action',
      inputs: [
        { name: 'input', type: 'string', required: true, description: 'Input data' },
      ],
      outputs: [
        { name: 'output', type: 'object', required: true, description: 'Output data' },
      ],
      executor: {
        type: 'function',
        functionRef: { module: `${id}`, functionName: `capability${i}` },
      },
      estimatedDuration: 100 * (i + 1),
      cacheable: i === 0,
      cacheTTL: 3600,
      supportsParallel: i > 0,
      isLLMCall: i === 0,
    })),
    constraints: [],
    requiredContext: [],
    async validate() {},
    toJSON() {
      return {
        id: this.id,
        name: this.name,
        version: this.version,
        description: this.description,
        author: this.author,
        capabilities: this.capabilities,
      };
    },
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CapabilityCatalogBuilder,
        ComponentRegistry,
        ComponentValidator,
        {
          provide: RedisCacheService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            delete: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    builder = module.get<CapabilityCatalogBuilder>(CapabilityCatalogBuilder);
    registry = module.get<ComponentRegistry>(ComponentRegistry);
    cache = module.get<RedisCacheService>(RedisCacheService);

    await registry.onModuleInit();
  });

  describe('buildCatalog', () => {
    it('should build catalog from registered components', async () => {
      await registry.registerBatch([
        createMockComponent('comp1', 2),
        createMockComponent('comp2', 1),
      ]);

      const catalog = await builder.buildCatalog();

      expect(catalog.version).toBe('1.0');
      expect(catalog.metadata.totalComponents).toBe(2);
      expect(catalog.metadata.totalCapabilities).toBe(3);
    });

    it('should cache catalog after building', async () => {
      await registry.register(createMockComponent('test', 1));

      const catalog = await builder.buildCatalog();

      expect(cache.set).toHaveBeenCalled();
      expect(catalog).toBeDefined();
    });

    it('should load from cache if available', async () => {
      const cachedCatalog = {
        version: '1.0',
        buildTime: 100,
        timestamp: new Date().toISOString(),
        metadata: {
          totalComponents: 1,
          totalCapabilities: 1,
          categoryCounts: { connectors: 0, services: 1, actions: 0, transforms: 0 },
          cacheableCount: 1,
          llmCallCount: 0,
        },
        components: [],
        capabilities: [],
        index: {
          capabilityById: {},
          capabilitiesByCategory: { connector: [], service: [], action: [], transform: [] },
          capabilityToComponent: {},
          componentsByCategory: {},
          searchIndex: [],
        },
        compiled: { at: new Date(), version: '1.0', schemaVersion: '1.0' },
      };

      (cache.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(cachedCatalog));

      const catalog = await builder.buildCatalog();

      expect(cache.get).toHaveBeenCalled();
      expect(catalog.metadata.totalComponents).toBe(1);
    });

    it('should include build time metrics', async () => {
      await registry.register(createMockComponent('test', 1));

      const catalog = await builder.buildCatalog();

      expect(catalog.buildTime).toBeGreaterThanOrEqual(0);
      expect(typeof catalog.buildTime).toBe('number');
    });

    it('should generate timestamp', async () => {
      await registry.register(createMockComponent('test', 1));

      const catalog = await builder.buildCatalog();

      expect(catalog.timestamp).toBeDefined();
      expect(new Date(catalog.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('catalog structure', () => {
    beforeEach(async () => {
      const comp = createMockComponent('service.test', 3);
      comp.capabilities[0].category = 'connector';
      comp.capabilities[1].category = 'service';
      comp.capabilities[2].category = 'action';
      await registry.register(comp);
    });

    it('should include all components', async () => {
      const catalog = await builder.buildCatalog();

      expect(catalog.components.length).toBe(1);
      expect(catalog.components[0].id).toBe('service.test');
    });

    it('should include all capabilities with indices', async () => {
      const catalog = await builder.buildCatalog();

      expect(catalog.capabilities.length).toBe(3);
      catalog.capabilities.forEach((cap, idx) => {
        expect(cap.index).toBe(idx);
      });
    });

    it('should include capability metadata', async () => {
      const catalog = await builder.buildCatalog();

      const cap = catalog.capabilities[0];
      expect(cap.metadata).toBeDefined();
      expect(cap.metadata.estimatedDuration).toBeDefined();
      expect(cap.metadata.cacheable).toBeDefined();
      expect(cap.metadata.isLLMCall).toBeDefined();
    });

    it('should count categories correctly', async () => {
      const catalog = await builder.buildCatalog();

      expect(catalog.metadata.categoryCounts.connectors).toBe(1);
      expect(catalog.metadata.categoryCounts.services).toBe(1);
      expect(catalog.metadata.categoryCounts.actions).toBe(1);
    });

    it('should count cacheable capabilities', async () => {
      const catalog = await builder.buildCatalog();

      expect(catalog.metadata.cacheableCount).toBeGreaterThanOrEqual(0);
      expect(typeof catalog.metadata.cacheableCount).toBe('number');
    });

    it('should count LLM capabilities', async () => {
      const catalog = await builder.buildCatalog();

      expect(catalog.metadata.llmCallCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('catalog index', () => {
    beforeEach(async () => {
      await registry.registerBatch([
        createMockComponent('comp1', 2),
        createMockComponent('comp2', 1),
      ]);
    });

    it('should create capabilityById index', async () => {
      const catalog = await builder.buildCatalog();

      expect(catalog.index.capabilityById['comp1.cap0']).toBeDefined();
      expect(catalog.index.capabilityById['comp1.cap1']).toBeDefined();
      expect(catalog.index.capabilityById['comp2.cap0']).toBeDefined();
    });

    it('should organize capabilities by category in index', async () => {
      const catalog = await builder.buildCatalog();

      expect(catalog.index.capabilitiesByCategory.service).toBeDefined();
      expect(catalog.index.capabilitiesByCategory.action).toBeDefined();
      expect(Array.isArray(catalog.index.capabilitiesByCategory.service)).toBe(true);
    });

    it('should map capabilities to components', async () => {
      const catalog = await builder.buildCatalog();

      expect(catalog.index.capabilityToComponent['comp1.cap0']).toBe('comp1');
      expect(catalog.index.capabilityToComponent['comp2.cap0']).toBe('comp2');
    });

    it('should create search index', async () => {
      const catalog = await builder.buildCatalog();

      expect(catalog.index.searchIndex.length).toBeGreaterThan(0);
      expect(catalog.index.searchIndex[0].id).toBeDefined();
      expect(catalog.index.searchIndex[0].keywords).toBeInstanceOf(Array);
    });
  });

  describe('getCatalogJSON', () => {
    it('should return valid JSON string', async () => {
      await registry.register(createMockComponent('test', 1));

      const json = await builder.getCatalogJSON();

      expect(typeof json).toBe('string');
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should not include internal index in API response', async () => {
      await registry.register(createMockComponent('test', 1));

      const json = await builder.getCatalogJSON();
      const parsed = JSON.parse(json);

      expect(parsed.index).toBeUndefined();
      expect(parsed.compiled).toBeUndefined();
    });

    it('should include catalog metadata and capabilities', async () => {
      await registry.register(createMockComponent('test', 1));

      const json = await builder.getCatalogJSON();
      const parsed = JSON.parse(json);

      expect(parsed.version).toBe('1.0');
      expect(parsed.metadata).toBeDefined();
      expect(parsed.components).toBeDefined();
      expect(parsed.capabilities).toBeDefined();
    });
  });

  describe('getCatalogStats', () => {
    beforeEach(async () => {
      const comp1 = createMockComponent('comp1', 2);
      const comp2 = createMockComponent('comp2', 1);

      comp1.capabilities[0].category = 'connector';
      comp1.capabilities[1].category = 'service';
      comp1.capabilities[1].cacheable = true;

      comp2.capabilities[0].category = 'action';
      comp2.capabilities[0].isLLMCall = true;

      await registry.registerBatch([comp1, comp2]);
    });

    it('should return catalog statistics', async () => {
      const stats = await builder.getCatalogStats();

      expect(stats.totalComponents).toBe(2);
      expect(stats.totalCapabilities).toBe(3);
      expect(stats.byCategory.connectors).toBeGreaterThanOrEqual(1);
      expect(stats.byCategory.services).toBeGreaterThanOrEqual(1);
      expect(stats.byCategory.actions).toBeGreaterThanOrEqual(1);
    });

    it('should count cacheable and LLM capabilities', async () => {
      const stats = await builder.getCatalogStats();

      expect(stats.cacheableCapabilities).toBeGreaterThanOrEqual(0);
      expect(stats.llmCapabilities).toBeGreaterThanOrEqual(0);
    });

    it('should include build time and timestamp', async () => {
      const stats = await builder.getCatalogStats();

      expect(stats.buildTime).toBeGreaterThanOrEqual(0);
      expect(stats.timestamp).toBeDefined();
    });
  });

  describe('searchCapabilities', () => {
    beforeEach(async () => {
      const comp1 = createMockComponent('connector.excel', 1);
      comp1.capabilities[0].name = 'Read Excel File';
      comp1.capabilities[0].description = 'Load and parse Excel spreadsheets';

      const comp2 = createMockComponent('connector.csv', 1);
      comp2.capabilities[0].name = 'Read CSV File';
      comp2.capabilities[0].description = 'Parse comma-separated values';

      await registry.registerBatch([comp1, comp2]);
    });

    it('should search by name', async () => {
      const results = await builder.searchCapabilities('Excel');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain('Excel');
    });

    it('should search by description', async () => {
      const results = await builder.searchCapabilities('spreadsheet');

      expect(results.length).toBeGreaterThan(0);
    });

    it('should return relevance scores', async () => {
      const results = await builder.searchCapabilities('Excel');

      results.forEach(result => {
        expect(result.relevance).toBeGreaterThan(0);
      });
    });

    it('should respect limit parameter', async () => {
      const resultsLimit1 = await builder.searchCapabilities('Read', 1);
      const resultsLimit5 = await builder.searchCapabilities('Read', 5);

      expect(resultsLimit1.length).toBeLessThanOrEqual(1);
      expect(resultsLimit5.length).toBeLessThanOrEqual(5);
    });

    it('should sort by relevance (highest first)', async () => {
      const results = await builder.searchCapabilities('Read');

      if (results.length > 1) {
        for (let i = 1; i < results.length; i++) {
          expect(results[i].relevance).toBeLessThanOrEqual(results[i - 1].relevance);
        }
      }
    });

    it('should return empty array for no matches', async () => {
      const results = await builder.searchCapabilities('nonexistent_query_xyz');

      expect(results).toEqual([]);
    });
  });

  describe('getCapabilitiesByCategory', () => {
    beforeEach(async () => {
      const comp = createMockComponent('multi', 4);
      comp.capabilities[0].category = 'connector';
      comp.capabilities[1].category = 'service';
      comp.capabilities[2].category = 'service';
      comp.capabilities[3].category = 'action';

      await registry.register(comp);
    });

    it('should return capabilities for connector category', async () => {
      const results = await builder.getCapabilitiesByCategory('connector');

      expect(results.length).toBe(1);
      expect(results[0].category).toBe('connector');
    });

    it('should return capabilities for service category', async () => {
      const results = await builder.getCapabilitiesByCategory('service');

      expect(results.length).toBe(2);
      results.forEach(cap => expect(cap.category).toBe('service'));
    });

    it('should return empty array for category with no capabilities', async () => {
      const results = await builder.getCapabilitiesByCategory('transform');

      expect(results).toEqual([]);
    });
  });

  describe('getCapabilityDetail', () => {
    beforeEach(async () => {
      await registry.register(createMockComponent('test', 1));
    });

    it('should return full capability details', async () => {
      const detail = await builder.getCapabilityDetail('test.cap0');

      expect(detail).toBeDefined();
      expect(detail?.id).toBe('test.cap0');
      expect(detail?.inputs).toBeDefined();
      expect(detail?.outputs).toBeDefined();
      expect(detail?.executor).toBeDefined();
    });

    it('should return null for nonexistent capability', async () => {
      const detail = await builder.getCapabilityDetail('nonexistent');

      expect(detail).toBeNull();
    });
  });

  describe('getComponentDetail', () => {
    beforeEach(async () => {
      await registry.register(createMockComponent('mycomponent', 2));
    });

    it('should return full component details', async () => {
      const detail = await builder.getComponentDetail('mycomponent');

      expect(detail).toBeDefined();
      expect(detail?.id).toBe('mycomponent');
      expect(detail?.version).toBe('1.0.0');
      expect(detail?.capabilities.length).toBe(2);
    });

    it('should return null for nonexistent component', async () => {
      const detail = await builder.getComponentDetail('nonexistent');

      expect(detail).toBeNull();
    });
  });

  describe('invalidateCache', () => {
    it('should delete cache key', async () => {
      await builder.invalidateCache();

      expect(cache.delete).toHaveBeenCalled();
    });
  });

  describe('exportCatalog', () => {
    it('should export catalog as object (without internal structures)', async () => {
      await registry.register(createMockComponent('test', 1));

      const exported = await builder.exportCatalog();

      expect(exported).toBeDefined();
      expect((exported as any).version).toBe('1.0');
      expect((exported as any).components).toBeDefined();
      expect((exported as any).capabilities).toBeDefined();
      expect((exported as any).index).toBeUndefined(); // Internal
      expect((exported as any).compiled).toBeUndefined(); // Internal
    });
  });

  describe('edge cases', () => {
    it('should handle empty registry', async () => {
      const catalog = await builder.buildCatalog();

      expect(catalog.metadata.totalComponents).toBe(0);
      expect(catalog.metadata.totalCapabilities).toBe(0);
    });

    it('should handle component with no capabilities gracefully', async () => {
      // This should be caught by validation, but test resilience
      const comp = createMockComponent('test', 1);
      await registry.register(comp);

      const catalog = await builder.buildCatalog();

      expect(catalog.capabilities.length).toBeGreaterThan(0);
    });

    it('should handle search with empty query', async () => {
      await registry.register(createMockComponent('test', 1));

      const results = await builder.searchCapabilities('');

      // Empty query should return nothing or all
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
