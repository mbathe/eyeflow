import { Test, TestingModule } from '@nestjs/testing';
import { ComponentValidator } from './component-validator.service';
import {
  CompilableComponent,
  Capability,
  ComponentValidationError,
  Compilable,
} from './compilable-component.interface';

describe('ComponentValidator', () => {
  let validator: ComponentValidator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ComponentValidator],
    }).compile();

    validator = module.get<ComponentValidator>(ComponentValidator);
  });

  describe('validateComponent', () => {
    it('should pass validation for a valid component', async () => {
      const validComponent: CompilableComponent = {
        id: 'test.service',
        name: 'Test Service',
        version: '1.0.0',
        description: 'A test service',
        capabilities: [
          {
            id: 'test.service.read',
            name: 'Read',
            description: 'Read data',
            category: 'service',
            inputs: [
              { name: 'id', type: 'string', required: true, description: 'Item ID' },
            ],
            outputs: [{ name: 'data', type: 'object', required: true }],
            executor: {
              type: 'function',
              functionRef: { module: 'test', functionName: 'read' },
            },
          },
        ],
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
      };

      await expect(validator.validateComponent(validComponent)).resolves.toBeUndefined();
    });

    it('should fail if id is missing', async () => {
      const component: any = {
        name: 'Test',
        version: '1.0.0',
        description: 'Test',
        capabilities: [],
        validate: async () => {},
        toJSON: () => ({}),
      };

      await expect(validator.validateComponent(component)).rejects.toThrow(
        ComponentValidationError,
      );
    });

    it('should fail if version is missing', async () => {
      const component: any = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        capabilities: [],
        validate: async () => {},
        toJSON: () => ({}),
      };

      await expect(validator.validateComponent(component)).rejects.toThrow(
        ComponentValidationError,
      );
    });

    it('should fail if capabilities is empty', async () => {
      const component: any = {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        description: 'Test',
        capabilities: [],
        validate: async () => {},
        toJSON: () => ({}),
      };

      await expect(validator.validateComponent(component)).rejects.toThrow(
        ComponentValidationError,
      );
    });

    it('should fail if validate method throws', async () => {
      const component: any = {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        description: 'Test',
        capabilities: [
          {
            id: 'test.cap',
            name: 'Cap',
            description: 'Capability',
            category: 'service',
            inputs: [],
            outputs: [],
            executor: { type: 'function', functionRef: { module: 'test', functionName: 'test' } },
          },
        ],
        validate: async () => {
          throw new Error('Validation failed');
        },
        toJSON: () => ({}),
      };

      await expect(validator.validateComponent(component)).rejects.toThrow();
    });

    it('should validate capability parameters', async () => {
      const component: any = {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        description: 'Test',
        capabilities: [
          {
            id: 'test.cap',
            name: 'Cap',
            description: 'Cap',
            category: 'service',
            inputs: [
              { name: 'input1', type: 'invalid', required: true }, // invalid type
            ],
            outputs: [],
            executor: { type: 'function', functionRef: { module: 'test', functionName: 'test' } },
          },
        ],
        validate: async () => {},
        toJSON: () => ({}),
      };

      await expect(validator.validateComponent(component)).rejects.toThrow(
        ComponentValidationError,
      );
    });

    it('should validate executor configuration', async () => {
      const component: any = {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        description: 'Test',
        capabilities: [
          {
            id: 'test.cap',
            name: 'Cap',
            description: 'Cap',
            category: 'service',
            inputs: [],
            outputs: [],
            executor: { type: 'http' }, // missing httpRef
          },
        ],
        validate: async () => {},
        toJSON: () => ({}),
      };

      await expect(validator.validateComponent(component)).rejects.toThrow(
        ComponentValidationError,
      );
    });

    it('should validate JSON schema in parameters', async () => {
      const component: any = {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        description: 'Test',
        capabilities: [
          {
            id: 'test.cap',
            name: 'Cap',
            description: 'Cap',
            category: 'service',
            inputs: [
              {
                name: 'data',
                type: 'object',
                required: true,
                schema: { type: 'object', properties: {} },
              },
            ],
            outputs: [],
            executor: { type: 'function', functionRef: { module: 'test', functionName: 'test' } },
          },
        ],
        validate: async () => {},
        toJSON: () => ({
          id: component.id,
          name: component.name,
          version: component.version,
          description: component.description,
          capabilities: component.capabilities,
        }),
      };

      await expect(validator.validateComponent(component)).resolves.toBeUndefined();
    });

    it('should validate constraints format', async () => {
      const component: any = {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        description: 'Test',
        capabilities: [
          {
            id: 'test.cap',
            name: 'Cap',
            description: 'Cap',
            category: 'service',
            inputs: [],
            outputs: [],
            executor: { type: 'function', functionRef: { module: 'test', functionName: 'test' } },
          },
        ],
        constraints: [{ type: 'invalid', value: {} }], // invalid constraint type
        validate: async () => {},
        toJSON: () => ({}),
      };

      await expect(validator.validateComponent(component)).rejects.toThrow(
        ComponentValidationError,
      );
    });
  });

  describe('parameter validation', () => {
    it('should accept all valid parameter types', async () => {
      const types = ['string', 'number', 'boolean', 'array', 'object', 'any'];

      for (const type of types) {
        const component: any = {
          id: 'test',
          name: 'Test',
          version: '1.0.0',
          description: 'Test',
          capabilities: [
            {
              id: 'test.cap',
              name: 'Cap',
              description: 'Cap',
              category: 'service',
              inputs: [{ name: 'param', type, required: true }],
              outputs: [],
              executor: { type: 'function', functionRef: { module: 'test', functionName: 'test' } },
            },
          ],
          validate: async () => {},
          toJSON() {
            return {
              id: this.id,
              name: this.name,
              version: this.version,
              description: this.description,
              capabilities: this.capabilities,
            };
          },
        };

        await expect(validator.validateComponent(component)).resolves.toBeUndefined();
      }
    });

    it('should validate required field', async () => {
      const component: any = {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        description: 'Test',
        capabilities: [
          {
            id: 'test.cap',
            name: 'Cap',
            description: 'Cap',
            category: 'service',
            inputs: [{ name: 'param', type: 'string', required: 'yes' }], // should be boolean
            outputs: [],
            executor: { type: 'function', functionRef: { module: 'test', functionName: 'test' } },
          },
        ],
        validate: async () => {},
        toJSON: () => ({}),
      };

      await expect(validator.validateComponent(component)).rejects.toThrow(
        ComponentValidationError,
      );
    });
  });

  describe('executor validation', () => {
    it('should validate function executor', async () => {
      const component: any = {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        description: 'Test',
        capabilities: [
          {
            id: 'test.cap',
            name: 'Cap',
            description: 'Cap',
            category: 'service',
            inputs: [],
            outputs: [],
            executor: {
              type: 'function',
              functionRef: { module: 'test-module', functionName: 'myFunction' },
            },
          },
        ],
        validate: async () => {},
        toJSON() {
          return {
            id: this.id,
            name: this.name,
            version: this.version,
            description: this.description,
            capabilities: this.capabilities,
          };
        },
      };

      await expect(validator.validateComponent(component)).resolves.toBeUndefined();
    });

    it('should validate http executor', async () => {
      const component: any = {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        description: 'Test',
        capabilities: [
          {
            id: 'test.cap',
            name: 'Cap',
            description: 'Cap',
            category: 'service',
            inputs: [],
            outputs: [],
            executor: {
              type: 'http',
              httpRef: { method: 'POST', url: 'https://api.example.com/endpoint' },
            },
          },
        ],
        validate: async () => {},
        toJSON() {
          return {
            id: this.id,
            name: this.name,
            version: this.version,
            description: this.description,
            capabilities: this.capabilities,
          };
        },
      };

      await expect(validator.validateComponent(component)).resolves.toBeUndefined();
    });

    it('should fail for invalid HTTP method', async () => {
      const component: any = {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        description: 'Test',
        capabilities: [
          {
            id: 'test.cap',
            name: 'Cap',
            description: 'Cap',
            category: 'service',
            inputs: [],
            outputs: [],
            executor: {
              type: 'http',
              httpRef: { method: 'INVALID', url: 'https://api.example.com' },
            },
          },
        ],
        validate: async () => {},
        toJSON: () => ({}),
      };

      await expect(validator.validateComponent(component)).rejects.toThrow(
        ComponentValidationError,
      );
    });
  });

  describe('error reporting', () => {
    it('should report all errors at once', async () => {
      const component: any = {
        // missing id
        // missing name
        version: '1.0.0',
        description: 'Test',
        capabilities: [], // empty
        constraints: [{ type: 'invalid', value: {} }], // invalid
        validate: async () => {},
        toJSON: () => ({}),
      };

      try {
        await validator.validateComponent(component);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ComponentValidationError);
        if (error instanceof ComponentValidationError) {
          expect(error.errors.length).toBeGreaterThan(3);
        }
      }
    });
  });
});
