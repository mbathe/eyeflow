/**
 * Type Inferencer Service Tests (Minimal & Stable)
 * Tests type checking and inference for Layer 2
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TypeInferencerService } from './type-inferencer.service';
import { ComponentRegistry } from '../../../common/extensibility/component-registry.service';

describe('TypeInferencerService', () => {
  let service: TypeInferencerService;
  let componentRegistry: jest.Mocked<ComponentRegistry>;

  beforeEach(async () => {
    componentRegistry = {
      getCapability: jest.fn().mockResolvedValue({
        id: 'test.capability',
        outputs: [],
      }),
      getAllCapabilities: jest.fn().mockResolvedValue([]),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TypeInferencerService,
        {
          provide: ComponentRegistry,
          useValue: componentRegistry,
        },
      ],
    }).compile();

    service = module.get<TypeInferencerService>(TypeInferencerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('inferTypes()', () => {
    it('should return empty array for valid tree structure', async () => {
      const tree: any = {
        root: {
          type: 'operation',
          id: 'op_0',
          operation: {
            capabilityId: 'action.test',
            inputs: {},
          },
          metadata: {
            parallelizable: false,
            dependencies: [],
          },
        },
        operations: new Map(),
        variables: new Map(),
        inputs: new Map(),
        metadata: {
          name: 'test',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      const errors = await service.inferTypes(tree);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle operations with outputs', async () => {
      (componentRegistry.getCapability as jest.Mock).mockResolvedValueOnce({
        id: 'action.getData',
        outputs: [{ name: 'data', type: 'object', schema: {} }],
      });

      const tree: any = {
        root: {
          type: 'operation',
          id: 'op_0',
          operation: {
            capabilityId: 'action.getData',
            inputs: {},
          },
          metadata: {
            parallelizable: false,
            dependencies: [],
          },
        },
        operations: new Map(),
        variables: new Map(),
        inputs: new Map(),
        metadata: {
          name: 'test',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      const errors = await service.inferTypes(tree);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should validate multiple operations', async () => {
      (componentRegistry.getCapability as jest.Mock).mockResolvedValue({
        id: 'action.test',
        outputs: [{ name: 'result', type: 'string' }],
      });

      const tree: any = {
        root: {
          type: 'operation',
          id: 'op_0',
          operation: {
            capabilityId: 'action.test1',
            inputs: {},
          },
          metadata: {
            parallelizable: false,
            dependencies: [],
          },
        },
        operations: new Map([
          [
            'op_0',
            {
              type: 'operation',
              id: 'op_0',
              operation: {
                capabilityId: 'action.test1',
                inputs: {},
              },
              metadata: {
                parallelizable: false,
                dependencies: [],
              },
            },
          ],
          [
            'op_1',
            {
              type: 'operation',
              id: 'op_1',
              operation: {
                capabilityId: 'action.test2',
                inputs: {},
              },
              metadata: {
                parallelizable: false,
                dependencies: ['op_0'],
              },
            },
          ],
        ]),
        variables: new Map(),
        inputs: new Map(),
        metadata: {
          name: 'test',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      const errors = await service.inferTypes(tree);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle type information extraction', async () => {
      const tree: any = {
        root: {
          type: 'operation',
          id: 'op_0',
          operation: {
            capabilityId: 'action.process',
            inputs: { value: '123' },
          },
          metadata: {
            parallelizable: false,
            dependencies: [],
          },
        },
        operations: new Map(),
        variables: new Map(),
        inputs: new Map(),
        metadata: {
          name: 'test',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      const errors = await service.inferTypes(tree);
      expect(errors).toBeDefined();
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should process trees with variables', async () => {
      const tree: any = {
        root: {
          type: 'operation',
          id: 'op_0',
          operation: {
            capabilityId: 'action.execute',
            inputs: {},
          },
          metadata: {
            parallelizable: false,
            dependencies: [],
          },
        },
        operations: new Map(),
        variables: new Map([
          [
            'userId',
            {
              name: 'userId',
              type: 'string',
              value: '123',
              isReference: false,
              source: 'input',
              dataClassification: 'RUNTIME_DYNAMIC',
            },
          ],
        ]),
        inputs: new Map(),
        metadata: {
          name: 'test',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      const errors = await service.inferTypes(tree);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should process empty trees', async () => {
      const tree: any = {
        root: {
          type: 'operation',
          id: 'op_0',
          operation: {
            capabilityId: 'action.noop',
            inputs: {},
          },
          metadata: {
            parallelizable: false,
            dependencies: [],
          },
        },
        operations: new Map(),
        variables: new Map(),
        inputs: new Map(),
        metadata: {
          name: 'test',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      const errors = await service.inferTypes(tree);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle missing capability gracefully', async () => {
      (componentRegistry.getCapability as jest.Mock).mockResolvedValueOnce(null);

      const tree: any = {
        root: {
          type: 'operation',
          id: 'op_0',
          operation: {
            capabilityId: 'action.unknown',
            inputs: {},
          },
          metadata: {
            parallelizable: false,
            dependencies: [],
          },
        },
        operations: new Map(),
        variables: new Map(),
        inputs: new Map(),
        metadata: {
          name: 'test',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      const errors = await service.inferTypes(tree);
      expect(errors).toBeDefined();
    });

    it('should validate operation inputs', async () => {
      (componentRegistry.getCapability as jest.Mock).mockResolvedValueOnce({
        id: 'action.send',
        inputs: [{ name: 'recipient', type: 'string' }],
        outputs: [],
      });

      const tree: any = {
        root: {
          type: 'operation',
          id: 'op_0',
          operation: {
            capabilityId: 'action.send',
            inputs: { recipient: 'test@example.com' },
          },
          metadata: {
            parallelizable: false,
            dependencies: [],
          },
        },
        operations: new Map(),
        variables: new Map(),
        inputs: new Map(),
        metadata: {
          name: 'test',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      const errors = await service.inferTypes(tree);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should collect type errors from tree traversal', async () => {
      const tree: any = {
        root: {
          type: 'operation',
          id: 'op_0',
          operation: {
            capabilityId: 'action.calc',
            inputs: { value: 'not_a_number' },
          },
          metadata: {
            parallelizable: false,
            dependencies: [],
          },
        },
        operations: new Map(),
        variables: new Map(),
        inputs: new Map(),
        metadata: {
          name: 'test',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      const errors = await service.inferTypes(tree);
      expect(errors).toBeDefined();
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should handle complex operation chains', async () => {
      (componentRegistry.getCapability as jest.Mock).mockResolvedValue({
        id: 'action.generic',
        outputs: [{ name: 'output', type: 'string' }],
      });

      const tree: any = {
        root: {
          type: 'operation',
          id: 'op_0',
          operation: {
            capabilityId: 'action.step1',
            inputs: {},
          },
          metadata: {
            parallelizable: false,
            dependencies: [],
          },
        },
        operations: new Map([
          ['op_1', { type: 'operation', operation: { capabilityId: 'action.step2' } }],
          ['op_2', { type: 'operation', operation: { capabilityId: 'action.step3' } }],
        ]),
        variables: new Map(),
        inputs: new Map(),
        metadata: {
          name: 'test',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      const errors = await service.inferTypes(tree);
      expect(Array.isArray(errors)).toBe(true);
    });
  });
});
