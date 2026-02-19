import { Test, TestingModule } from '@nestjs/testing';
import { ComponentRegistry } from './component-registry.service';
import { ComponentValidator } from './component-validator.service';
import { CompilableComponent } from './compilable-component.interface';

describe('ComponentRegistry', () => {
  let registry: ComponentRegistry;
  let validator: ComponentValidator;

  const createMockComponent = (id: string, numCapabilities = 1): CompilableComponent => ({
    id,
    name: `Component ${id}`,
    version: '1.0.0',
    description: `Test component ${id}`,
    capabilities: Array.from({ length: numCapabilities }, (_, i) => ({
      id: `${id}.cap${i}`,
      name: `Capability ${i}`,
      description: `Test capability ${i}`,
      category: i % 2 === 0 ? 'service' : 'action',
      inputs: [{ name: 'input', type: 'string', required: true }],
      outputs: [{ name: 'output', type: 'object', required: true }],
      executor: {
        type: 'function',
        functionRef: { module: `${id}`, functionName: `capability${i}` },
      },
      cacheable: true,
      cacheTTL: 3600,
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
        capabilities: this.capabilities,
      };
    },
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ComponentRegistry, ComponentValidator],
    }).compile();

    registry = module.get<ComponentRegistry>(ComponentRegistry);
    validator = module.get<ComponentValidator>(ComponentValidator);

    await registry.onModuleInit();
  });

  describe('register', () => {
    it('should register a valid component', async () => {
      const component = createMockComponent('test.service', 2);

      await expect(registry.register(component)).resolves.toBeUndefined();

      expect(registry.getComponent('test.service')).toEqual(component);
    });

    it('should index all capabilities after registration', async () => {
      const component = createMockComponent('test.service', 3);

      await registry.register(component);

      expect(registry.getCapability('test.service.cap0')).toBeDefined();
      expect(registry.getCapability('test.service.cap1')).toBeDefined();
      expect(registry.getCapability('test.service.cap2')).toBeDefined();
    });

    it('should reject invalid component', async () => {
      const invalidComponent: any = {
        id: 'test',
        name: 'Test',
        // missing version
        description: 'Test',
        capabilities: [],
        validate: async () => {},
        toJSON: () => ({}),
      };

      await expect(registry.register(invalidComponent)).rejects.toThrow();
    });

    it('should invalidate catalog cache after registration', async () => {
      const component1 = createMockComponent('comp1', 1);
      const component2 = createMockComponent('comp2', 1);

      await registry.register(component1);
      const catalog1 = await registry.buildCatalog();

      await registry.register(component2);
      const catalog2 = await registry.buildCatalog();

      expect(catalog2.totalCapabilities).toBeGreaterThan(catalog1.totalCapabilities);
    });
  });

  describe('registerBatch', () => {
    it('should register multiple components', async () => {
      const components = [
        createMockComponent('comp1', 1),
        createMockComponent('comp2', 1),
        createMockComponent('comp3', 1),
      ];

      await registry.registerBatch(components);

      expect(registry.getAllComponents().length).toBe(3);
      expect(registry.getAllCapabilities().length).toBe(3);
    });

    it('should handle batch with invalid component', async () => {
      const validComponent = createMockComponent('valid', 1);
      const invalidComponent: any = {
        id: 'invalid',
        // missing required fields
      };

      const components = [validComponent, invalidComponent];

      await registry.registerBatch(components);

      expect(registry.getComponent('valid')).toBeDefined();
      // Invalid component should have been skipped
      expect(registry.getComponent('invalid')).toBeUndefined();
    });
  });

  describe('getters', () => {
    beforeEach(async () => {
      await registry.registerBatch([
        createMockComponent('service.excel', 2),
        createMockComponent('service.api', 1),
        createMockComponent('action.email', 1),
      ]);
    });

    it('should get component by ID', async () => {
      const component = registry.getComponent('service.excel');
      expect(component).toBeDefined();
      expect(component?.id).toBe('service.excel');
    });

    it('should get capability by ID', async () => {
      const capability = registry.getCapability('service.excel.cap0');
      expect(capability).toBeDefined();
      expect(capability?.id).toBe('service.excel.cap0');
    });

    it('should get all components', async () => {
      const components = registry.getAllComponents();
      expect(components.length).toBe(3);
    });

    it('should get all capabilities', async () => {
      const capabilities = registry.getAllCapabilities();
      expect(capabilities.length).toBe(4); // 2+1+1
    });

    it('should get capabilities by category', async () => {
      const services = registry.getCapabilitiesByCategory('service');
      expect(services.length).toBe(3); // 2 from excel, 1 from api

      const actions = registry.getCapabilitiesByCategory('action');
      expect(actions.length).toBe(1);
    });

    it('should get capabilities by component', async () => {
      const caps = registry.getCapabilitiesByComponent('service.excel');
      expect(caps.length).toBe(2);
      expect(caps[0].id).toBe('service.excel.cap0');
      expect(caps[1].id).toBe('service.excel.cap1');
    });

    it('should check capability existence', async () => {
      expect(registry.hasCapability('service.excel.cap0')).toBe(true);
      expect(registry.hasCapability('nonexistent')).toBe(false);
    });
  });

  describe('buildCatalog', () => {
    it('should build catalog from registered components', async () => {
      await registry.registerBatch([
        createMockComponent('comp1', 2),
        createMockComponent('comp2', 1),
      ]);

      const catalog = await registry.buildCatalog();

      expect(catalog.totalComponents).toBe(2);
      expect(catalog.totalCapabilities).toBe(3);
    });

    it('should cache catalog (second call should return same object)', async () => {
      await registry.register(createMockComponent('test', 1));

      const catalog1 = await registry.buildCatalog();
      const catalog2 = await registry.buildCatalog();

      expect(catalog1).toBe(catalog2); // Same reference
    });

    it('should include capability index', async () => {
      await registry.register(createMockComponent('test', 2));

      const catalog = await registry.buildCatalog();

      expect(catalog.index).toBeDefined();
      expect(catalog.index.byId['test.cap0']).toBeDefined();
      expect(catalog.index.byId['test.cap1']).toBeDefined();
    });

    it('should organize capabilities by category in index', async () => {
      const comp = createMockComponent('test', 4);
      // Override categories for testing
      comp.capabilities[0].category = 'connector';
      comp.capabilities[1].category = 'service';
      comp.capabilities[2].category = 'service';
      comp.capabilities[3].category = 'action';

      await registry.register(comp);
      const catalog = await registry.buildCatalog();

      expect(catalog.index.byCategory.connector.length).toBe(1);
      expect(catalog.index.byCategory.service.length).toBe(2);
      expect(catalog.index.byCategory.action.length).toBe(1);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      const comp = createMockComponent('service.excel', 2);
      comp.capabilities[0].name = 'Read Excel File';
      comp.capabilities[1].name = 'Write Excel File';
      await registry.register(comp);

      const comp2 = createMockComponent('connector.csv', 1);
      comp2.capabilities[0].name = 'Read CSV';
      await registry.register(comp2);
    });

    it('should find capabilities by name', async () => {
      const results = registry.searchCapabilities('Read');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.name.includes('Read'))).toBe(true);
    });

    it('should find capabilities by description', async () => {
      const results = registry.searchCapabilities('Excel');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should find capabilities by ID', async () => {
      const results = registry.searchCapabilities('service.excel');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('capability metadata', () => {
    beforeEach(async () => {
      const comp = createMockComponent('test', 1);
      comp.capabilities[0].estimatedDuration = 500;
      comp.capabilities[0].cacheable = true;
      comp.capabilities[0].cacheTTL = 7200;
      comp.capabilities[0].supportsParallel = true;
      comp.capabilities[0].estimatedCost = {
        cpu: 0.5,
        memory: 512,
        concurrent: 2,
      };

      await registry.register(comp);
    });

    it('should get capability metadata', async () => {
      const metadata = registry.getCapabilityMetadata('test.cap0');

      expect(metadata?.estimatedDuration).toBe(500);
      expect(metadata?.cacheable).toBe(true);
      expect(metadata?.cacheTTL).toBe(7200);
      expect(metadata?.supportsParallel).toBe(true);
      expect(metadata?.estimatedCost?.cpu).toBe(0.5);
    });

    it('should return null for nonexistent capability', async () => {
      expect(registry.getCapabilityMetadata('nonexistent')).toBeNull();
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      const comp1 = createMockComponent('comp1', 2);
      const comp2 = createMockComponent('comp2', 3);

      // Clear all cacheable/isLLMCall flags first
      comp1.capabilities.forEach(c => {
        c.cacheable = false;
        c.isLLMCall = false;
      });
      comp2.capabilities.forEach(c => {
        c.cacheable = false;
        c.isLLMCall = false;
      });

      comp1.capabilities[0].category = 'connector';
      comp1.capabilities[1].category = 'service';
      comp1.capabilities[1].cacheable = true;

      comp2.capabilities[0].category = 'action';
      comp2.capabilities[1].category = 'service';
      comp2.capabilities[1].isLLMCall = true;
      comp2.capabilities[2].category = 'service';
      comp2.capabilities[2].cacheable = true;

      await registry.registerBatch([comp1, comp2]);
    });

    it('should report accurate statistics', async () => {
      const stats = registry.getStats();

      expect(stats.totalComponents).toBe(2);
      expect(stats.totalCapabilities).toBe(5);
      expect(stats.componentsByCategory.connectors).toBeGreaterThanOrEqual(1);
      expect(stats.componentsByCategory.services).toBeGreaterThanOrEqual(3);
      expect(stats.cacheableCapabilities).toBe(2);
      expect(stats.llmCapabilities).toBe(1);
    });
  });

  describe('getCatalogJSON', () => {
    it('should return valid catalog object', async () => {
      await registry.register(createMockComponent('test', 1));

      const json = await registry.getCatalogJSON();

      expect(typeof json).toBe('object');
      expect((json as any).version).toBe('1.0');
      expect((json as any).components).toBeDefined();
      expect((json as any).systemStats).toBeDefined();
    });
  });
});
