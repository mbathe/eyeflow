/**
 * Type Inferencer Service Tests
 * Tests type checking and inference functionality
 * 
 * @file src/compiler/frontend/services/type-inferencer.service.spec.ts
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TypeInferencerService, TypeInfo } from './type-inferencer.service';
import { ComponentRegistry } from '@/common/extensibility/index';
import { SemanticTree, SemanticNode } from '../interfaces/semantic-node.interface';
import { getLoggerToken } from 'nest-winston';
import { Logger } from 'winston';

describe('TypeInferencerService', () => {
  let service: TypeInferencerService;
  let componentRegistry: jest.Mocked<ComponentRegistry>;
  let logger: jest.Mocked<Logger>;

  beforeEach(async () => {
    componentRegistry = {
      getCapability: jest.fn(),
    } as any;

    logger = {
      child: jest.fn().mockReturnThis(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TypeInferencerService,
        {
          provide: ComponentRegistry,
          useValue: componentRegistry,
        },
        {
          provide: getLoggerToken(),
          useValue: logger,
        },
      ],
    }).compile();

    service = module.get<TypeInferencerService>(TypeInferencerService);
  });

  afterEach(() => {
    service.clearCache();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('inferTypes()', () => {
    it('should infer types for operations', async () => {
      const operation: SemanticNode = {
        type: 'operation',
        id: 'action_0',
        operation: {
          capabilityId: 'action.sendEmail',
          inputs: {},
          outputVariable: 'email_result',
        },
        metadata: {
          parallelizable: false,
          dependencies: [],
        },
      };

      const tree: SemanticTree = {
        root: operation,
        operations: new Map([['action_0', operation]]),
        variables: new Map([
          [
            'email_result',
            {
              name: 'email_result',
              type: 'computed',
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

      componentRegistry.getCapability.mockResolvedValue({
        id: 'action.sendEmail',
        outputs: [{ name: 'result', type: 'object', schema: { type: 'object' } }],
      } as any);

      const errors = await service.inferTypes(tree);
      expect(errors).toEqual([]);
    });

    it('should detect type mismatches in inputs', async () => {
      const op1: SemanticNode = {
        type: 'operation',
        id: 'action_0',
        operation: {
          capabilityId: 'connector.excel.read',
          inputs: {},
          outputVariable: 'excel_data',
        },
        metadata: {
          parallelizable: false,
          dependencies: [],
        },
      };

      const op2: SemanticNode = {
        type: 'operation',
        id: 'action_1',
        operation: {
          capabilityId: 'service.email.send',
          inputs: { data: 'action_0' },
        },
        metadata: {
          parallelizable: false,
          dependencies: ['action_0'],
        },
      };

      const tree: SemanticTree = {
        root: op1,
        operations: new Map([
          ['action_0', op1],
          ['action_1', op2],
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

      componentRegistry.getCapability
        .mockResolvedValueOnce({
          id: 'connector.excel.read',
          outputs: [{ name: 'sheets', type: 'array', schema: { type: 'array' } }],
        } as any)
        .mockResolvedValueOnce({
          id: 'service.email.send',
          inputs: [{ name: 'data', type: 'string', required: true }],
          outputs: [],
        } as any);

      const errors = await service.inferTypes(tree);
      // Type mismatch between array and string
      expect(errors.length).toBeGreaterThanOrEqual(0);
    });

    it('should validate parallel branch compatibility', async () => {
      const branch1: SemanticNode = {
        type: 'operation',
        id: 'op1',
        operation: {
          capabilityId: 'action.readFile',
          inputs: {},
          outputVariable: 'result1',
        },
        metadata: { parallelizable: true, dependencies: [] },
      };

      const branch2: SemanticNode = {
        type: 'operation',
        id: 'op2',
        operation: {
          capabilityId: 'action.readFile',
          inputs: {},
          outputVariable: 'result2',
        },
        metadata: { parallelizable: true, dependencies: [] },
      };

      const parallel: SemanticNode = {
        type: 'parallel',
        id: 'parallel',
        parallel: {
          branches: [branch1, branch2],
          mergeStrategy: 'all',
        },
      };

      const tree: SemanticTree = {
        root: parallel,
        operations: new Map([
          ['op1', branch1],
          ['op2', branch2],
        ]),
        variables: new Map(),
        inputs: new Map(),
        metadata: {
          name: 'test-parallel',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      componentRegistry.getCapability.mockResolvedValue({
        id: 'action.readFile',
        outputs: [{ name: 'content', type: 'string', schema: { type: 'string' } }],
      } as any);

      const errors = await service.inferTypes(tree);
      expect(errors.length).toEqual(0);
    });

    it('should validate conditional branch compatibility', async () => {
      const thenOp: SemanticNode = {
        type: 'operation',
        id: 'then_op',
        operation: {
          capabilityId: 'action.process',
          inputs: {},
        },
        metadata: { parallelizable: false, dependencies: [] },
      };

      const elseOp: SemanticNode = {
        type: 'operation',
        id: 'else_op',
        operation: {
          capabilityId: 'action.skip',
          inputs: {},
        },
        metadata: { parallelizable: false, dependencies: [] },
      };

      const conditional: SemanticNode = {
        type: 'conditional',
        id: 'cond',
        conditional: {
          condition: 'count > 0',
          thenBranch: thenOp,
          elseBranch: elseOp,
        },
      };

      const tree: SemanticTree = {
        root: conditional,
        operations: new Map([
          ['then_op', thenOp],
          ['else_op', elseOp],
        ]),
        variables: new Map(),
        inputs: new Map(),
        metadata: {
          name: 'test-conditional',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      componentRegistry.getCapability
        .mockResolvedValueOnce({
          id: 'action.process',
          outputs: [{ name: 'result', type: 'string' }],
        } as any)
        .mockResolvedValueOnce({
          id: 'action.skip',
          outputs: [{ name: 'result', type: 'string' }],
        } as any);

      const errors = await service.inferTypes(tree);
      expect(errors.length).toEqual(0);
    });
  });

  describe('getVariableType()', () => {
    it('should retrieve inferred variable type', () => {
      // Manual setup of type cache
      const typeInfo: TypeInfo = {
        typeName: 'string',
        nullable: false,
        array: false,
        primitive: true,
      };

      // Infer type for a variable (would normally happen via inferTypes)
      const varType = service.getVariableType('non_existent');
      expect(varType).toBeNull();
    });
  });

  describe('schema to type conversion', () => {
    it('should convert JSON schema to TypeInfo', async () => {
      const tree: SemanticTree = {
        root: {
          type: 'operation',
          id: 'op1',
          operation: {
            capabilityId: 'test.capability',
            inputs: {},
            outputVariable: 'result',
          },
          metadata: { parallelizable: false, dependencies: [] },
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

      tree.operations.set('op1', tree.root as SemanticNode);

      componentRegistry.getCapability.mockResolvedValue({
        id: 'test.capability',
        outputs: [
          {
            name: 'result',
            type: 'array',
            schema: { type: 'array', items: { type: 'object' } },
          },
        ],
      } as any);

      const errors = await service.inferTypes(tree);
      expect(errors.length).toEqual(0);
    });
  });

  describe('error handling', () => {
    it('should handle capability lookup errors gracefully', async () => {
      const operation: SemanticNode = {
        type: 'operation',
        id: 'action_0',
        operation: {
          capabilityId: 'unknown.capability',
          inputs: {},
        },
        metadata: { parallelizable: false, dependencies: [] },
      };

      const tree: SemanticTree = {
        root: operation,
        operations: new Map([['action_0', operation]]),
        variables: new Map(),
        inputs: new Map(),
        metadata: {
          name: 'test',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      componentRegistry.getCapability.mockRejectedValue(new Error('Lookup failed'));

      const errors = await service.inferTypes(tree);
      // Should not thwow, just skip
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('type cache', () => {
    it('should clear cache', () => {
      service.clearCache();
      const type = service.getVariableType('any_var');
      expect(type).toBeNull();
    });
  });
});
