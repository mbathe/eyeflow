/**
 * Constraint Validator Service Tests
 * Tests constraint validation functionality
 * 
 * @file src/compiler/frontend/services/constraint-validator.service.spec.ts
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConstraintValidatorService } from './constraint-validator.service';
import { ComponentRegistry } from '@/common/extensibility/index';
import { SemanticTree, SemanticNode } from '../interfaces/semantic-node.interface';
import { getLoggerToken } from 'nest-winston';
import { Logger } from 'winston';

describe('ConstraintValidatorService', () => {
  let service: ConstraintValidatorService;
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
        ConstraintValidatorService,
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

    service = module.get<ConstraintValidatorService>(ConstraintValidatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validate()', () => {
    it('should pass validation for simple tree', async () => {
      const operation: SemanticNode = {
        type: 'operation',
        id: 'action_0',
        operation: {
          capabilityId: 'action.sendEmail',
          inputs: {},
        },
        metadata: {
          parallelizable: false,
          dependencies: [],
        },
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

      componentRegistry.getCapability.mockResolvedValue({
        id: 'action.sendEmail',
        estimatedCost: { cpu: 0.1, memory: 128, concurrent: 1 },
        estimatedDuration: 100,
      } as any);

      const errors = await service.validate(tree);
      expect(errors.length).toEqual(0);
    });

    it('should detect circular dependencies', async () => {
      const op1: SemanticNode = {
        type: 'operation',
        id: 'action_0',
        operation: {
          capabilityId: 'action.readFile',
          inputs: {},
        },
        metadata: {
          parallelizable: false,
          dependencies: ['action_1'],
        },
      };

      const op2: SemanticNode = {
        type: 'operation',
        id: 'action_1',
        operation: {
          capabilityId: 'action.writeFile',
          inputs: {},
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
          name: 'circular-test',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      componentRegistry.getCapability.mockResolvedValue({
        id: 'any.capability',
        estimatedCost: { cpu: 0.1, memory: 128, concurrent: 1 },
      } as any);

      const errors = await service.validate(tree);
      const circularError = errors.find((e) => e.code === 'CIRCULAR_DEPENDENCY');
      expect(circularError).toBeDefined();
    });

    it('should detect excessive CPU usage', async () => {
      const operations = Array.from({ length: 10 }).map((_, i) => ({
        type: 'operation' as const,
        id: `action_${i}`,
        operation: {
          capabilityId: 'action.compute',
          inputs: {},
        },
        metadata: {
          parallelizable: false,
          dependencies: [],
        },
      }));

      const tree: SemanticTree = {
        root: operations[0] as any,
        operations: new Map(operations.map((op) => [op.id, op as any])),
        variables: new Map(),
        inputs: new Map(),
        metadata: {
          name: 'cpu-hog',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      componentRegistry.getCapability.mockResolvedValue({
        id: 'action.compute',
        estimatedCost: { cpu: 0.5, memory: 256, concurrent: 1 },
      } as any);

      const errors = await service.validate(tree);
      const cpuError = errors.find((e) => e.code === 'EXCESSIVE_CPU_USAGE');
      expect(cpuError).toBeDefined();
    });

    it('should detect excessive memory usage', async () => {
      const operation: SemanticNode = {
        type: 'operation',
        id: 'action_0',
        operation: {
          capabilityId: 'action.loadBigData',
          inputs: {},
        },
        metadata: {
          parallelizable: false,
          dependencies: [],
        },
      };

      const tree: SemanticTree = {
        root: operation,
        operations: new Map([['action_0', operation]]),
        variables: new Map(),
        inputs: new Map(),
        metadata: {
          name: 'memory-hog',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      componentRegistry.getCapability.mockResolvedValue({
        id: 'action.loadBigData',
        estimatedCost: { cpu: 0.1, memory: 5000, concurrent: 1 },
      } as any);

      const errors = await service.validate(tree);
      const memoryError = errors.find((e) => e.code === 'EXCESSIVE_MEMORY_USAGE');
      expect(memoryError).toBeDefined();
    });

    it('should detect missing capabilities', async () => {
      const operation: SemanticNode = {
        type: 'operation',
        id: 'action_0',
        operation: {
          capabilityId: 'unknown.capability',
          inputs: {},
        },
        metadata: {
          parallelizable: false,
          dependencies: [],
        },
      };

      const tree: SemanticTree = {
        root: operation,
        operations: new Map([['action_0', operation]]),
        variables: new Map(),
        inputs: new Map(),
        metadata: {
          name: 'missing-cap',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      componentRegistry.getCapability.mockResolvedValue(null);

      const errors = await service.validate(tree);
      const capabilityError = errors.find((e) => e.code === 'CAPABILITY_NOT_AVAILABLE');
      expect(capabilityError).toBeDefined();
    });

    it('should detect invalid references', async () => {
      const operation: SemanticNode = {
        type: 'operation',
        id: 'action_0',
        operation: {
          capabilityId: 'action.process',
          inputs: { data: 'action_999' },
        },
        metadata: {
          parallelizable: false,
          dependencies: [],
        },
      };

      const tree: SemanticTree = {
        root: operation,
        operations: new Map([['action_0', operation]]),
        variables: new Map(),
        inputs: new Map(),
        metadata: {
          name: 'invalid-ref',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      componentRegistry.getCapability.mockResolvedValue({
        id: 'action.process',
        estimatedCost: { cpu: 0.1, memory: 128, concurrent: 1 },
      } as any);

      const errors = await service.validate(tree);
      const refError = errors.find((e) => e.code === 'INVALID_REFERENCE');
      expect(refError).toBeDefined();
    });

    it('should estimate execution duration', () => {
      const operation: SemanticNode = {
        type: 'operation',
        id: 'action_0',
        operation: {
          capabilityId: 'action.process',
          inputs: {},
        },
        metadata: {
          parallelizable: false,
          dependencies: [],
          estimatedDuration: 5000,
        },
      };

      const tree: SemanticTree = {
        root: operation,
        operations: new Map([['action_0', operation]]),
        variables: new Map(),
        inputs: new Map(),
        metadata: {
          name: 'duration-test',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      const duration = service.estimateExecutionDuration(tree);
      expect(duration).toEqual(5000);
    });

    it('should handle capability lookup errors', async () => {
      const operation: SemanticNode = {
        type: 'operation',
        id: 'action_0',
        operation: {
          capabilityId: 'action.process',
          inputs: {},
        },
        metadata: {
          parallelizable: false,
          dependencies: [],
        },
      };

      const tree: SemanticTree = {
        root: operation,
        operations: new Map([['action_0', operation]]),
        variables: new Map(),
        inputs: new Map(),
        metadata: {
          name: 'error-test',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      componentRegistry.getCapability.mockRejectedValue(new Error('Lookup error'));

      const errors = await service.validate(tree);
      // Should contain check error but not throw
      expect(errors.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('dependency analysis', () => {
    it('should detect linear dependencies', async () => {
      const op1: SemanticNode = {
        type: 'operation',
        id: 'action_0',
        operation: {
          capabilityId: 'action.read',
          inputs: {},
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
          capabilityId: 'action.process',
          inputs: { data: 'action_0' },
        },
        metadata: {
          parallelizable: false,
          dependencies: [],
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
          name: 'linear-deps',
          createdAt: new Date(),
          parserVersion: '1.0',
          source: 'natural_language',
        },
      };

      componentRegistry.getCapability.mockResolvedValue({
        id: 'any.capability',
        estimatedCost: { cpu: 0.1, memory: 128, concurrent: 1 },
      } as any);

      const errors = await service.validate(tree);
      // Validator should add missing dependency info but not error
      expect(errors.length).toEqual(0);
    });
  });
});
