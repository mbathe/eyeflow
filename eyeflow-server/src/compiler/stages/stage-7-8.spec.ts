/**
 * Tests for Stage 7 (Service Resolution) and Stage 8 (Service Pre-loader)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ServiceResolutionService } from '../stages/stage-7-service-resolution.service';
import { ServicePreloaderService } from '../stages/stage-8-service-preloader.service';
import {
  LLMIntermediateRepresentation,
  IRInstruction,
  IROpcode,
  RegisterType
} from '../interfaces/ir.interface';

describe('Stage 7+8: Service Resolution & Pre-loading', () => {
  let resolutionService: ServiceResolutionService;
  let preloaderService: ServicePreloaderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceResolutionService,
        ServicePreloaderService
      ]
    }).compile();

    resolutionService = module.get<ServiceResolutionService>(ServiceResolutionService);
    preloaderService = module.get<ServicePreloaderService>(ServicePreloaderService);
  });

  describe('Stage 7: Service Resolution', () => {
    it('should resolve a single WASM service', async () => {
      // Create mock IR with CALL_SERVICE
      const ir: LLMIntermediateRepresentation = {
        instructions: [
          {
            index: 0,
            opcode: IROpcode.CALL_SERVICE,
            dest: 1,
            serviceId: 'sentiment-analyzer',
            serviceVersion: '2.1.0'
          }
        ],
        instructionOrder: [0],
        dependencyGraph: new Map(),
        resourceTable: [],
        parallelizationGroups: [],
        schemas: [],
        semanticContext: {
          embeddings: [],
          relationships: [],
          fallbackStrategies: []
        },
        inputRegister: 0,
        outputRegister: 1,
        metadata: {
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          source: 'test'
        }
      };

      // Resolve
      const resolved = await resolutionService.resolveServices(ir);

      // Validate
      expect(resolved.resolvedServices.length).toBe(1);
      expect(resolved.resolvedServices[0].serviceId).toBe('sentiment-analyzer');
      expect(resolved.resolvedServices[0].format).toBe('WASM');
      expect(resolved.instructions[0].dispatchMetadata).toBeDefined();
    });

    it('should resolve multiple services of different formats', async () => {
      const ir: LLMIntermediateRepresentation = {
        instructions: [
          {
            index: 0,
            opcode: IROpcode.CALL_SERVICE,
            dest: 1,
            serviceId: 'sentiment-analyzer',
            serviceVersion: '2.1.0'
          },
          {
            index: 1,
            opcode: IROpcode.CALL_SERVICE,
            dest: 2,
            serviceId: 'github-search',
            serviceVersion: '1.0.0'
          },
          {
            index: 2,
            opcode: IROpcode.CALL_SERVICE,
            dest: 3,
            serviceId: 'image-processor',
            serviceVersion: '1.5.0'
          }
        ],
        instructionOrder: [0, 1, 2],
        dependencyGraph: new Map(),
        resourceTable: [],
        parallelizationGroups: [],
        schemas: [],
        semanticContext: {
          embeddings: [],
          relationships: [],
          fallbackStrategies: []
        },
        inputRegister: 0,
        outputRegister: 3,
        metadata: {
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          source: 'test'
        }
      };

      const resolved = await resolutionService.resolveServices(ir);

      expect(resolved.resolvedServices.length).toBe(3);
      expect(resolved.resolvedServices[0].format).toBe('WASM');
      expect(resolved.resolvedServices[1].format).toBe('MCP');
      expect(resolved.resolvedServices[2].format).toBe('NATIVE');
    });

    it('should throw error for non-existent service', async () => {
      const ir: LLMIntermediateRepresentation = {
        instructions: [
          {
            index: 0,
            opcode: IROpcode.CALL_SERVICE,
            dest: 1,
            serviceId: 'non-existent-service',
            serviceVersion: '1.0.0'
          }
        ],
        instructionOrder: [0],
        dependencyGraph: new Map(),
        resourceTable: [],
        parallelizationGroups: [],
        schemas: [],
        semanticContext: {
          embeddings: [],
          relationships: [],
          fallbackStrategies: []
        },
        inputRegister: 0,
        outputRegister: 1,
        metadata: {
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          source: 'test'
        }
      };

      await expect(resolutionService.resolveServices(ir)).rejects.toThrow('not found');
    });

    it('should handle IR with no service calls', async () => {
      const ir: LLMIntermediateRepresentation = {
        instructions: [
          {
            index: 0,
            opcode: IROpcode.LOAD_RESOURCE,
            dest: 1,
            operands: { resourceId: 0 }
          }
        ],
        instructionOrder: [0],
        dependencyGraph: new Map(),
        resourceTable: [],
        parallelizationGroups: [],
        schemas: [],
        semanticContext: {
          embeddings: [],
          relationships: [],
          fallbackStrategies: []
        },
        inputRegister: 0,
        outputRegister: 1,
        metadata: {
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          source: 'test'
        }
      };

      const resolved = await resolutionService.resolveServices(ir);

      expect(resolved.resolvedServices.length).toBe(0);
      expect(resolved.instructions.length).toBe(1);
    });
  });

  describe('Stage 8: Service Pre-loading', () => {
    it('should pre-load WASM service', async () => {
      // First resolve
      const ir: LLMIntermediateRepresentation = {
        instructions: [
          {
            index: 0,
            opcode: IROpcode.CALL_SERVICE,
            dest: 1,
            serviceId: 'sentiment-analyzer',
            serviceVersion: '2.1.0'
          }
        ],
        instructionOrder: [0],
        dependencyGraph: new Map(),
        resourceTable: [],
        parallelizationGroups: [],
        schemas: [],
        semanticContext: {
          embeddings: [],
          relationships: [],
          fallbackStrategies: []
        },
        inputRegister: 0,
        outputRegister: 1,
        metadata: {
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          source: 'test'
        }
      };

      const resolved = await resolutionService.resolveServices(ir);

      // Then pre-load
      const compiled = await preloaderService.preloadServices(
        resolved,
        'test-user',
        'test-workflow'
      );

      expect(compiled.metadata.id).toBeDefined();
      expect(compiled.metadata.userId).toBe('test-user');
      expect(compiled.preLoadedServices.wasm.has('sentiment-analyzer')).toBe(true);
    });

    it('should pre-load multiple services with different formats', async () => {
      const ir = {
        instructions: [
          {
            index: 0,
            opcode: IROpcode.CALL_SERVICE,
            dest: 1,
            serviceId: 'sentiment-analyzer',
            serviceVersion: '2.1.0'
          },
          {
            index: 1,
            opcode: IROpcode.CALL_SERVICE,
            dest: 2,
            serviceId: 'github-search',
            serviceVersion: '1.0.0'
          },
          {
            index: 2,
            opcode: IROpcode.CALL_SERVICE,
            dest: 3,
            serviceId: 'ml-trainer',
            serviceVersion: '3.0.0'
          }
        ],
        instructionOrder: [0, 1, 2],
        dependencyGraph: new Map(),
        resourceTable: [],
        parallelizationGroups: [],
        schemas: [],
        semanticContext: {
          embeddings: [],
          relationships: [],
          fallbackStrategies: []
        },
        inputRegister: 0,
        outputRegister: 3,
        metadata: {
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          source: 'test'
        }
      } as any;

      const resolved = await resolutionService.resolveServices(ir);
      const compiled = await preloaderService.preloadServices(
        resolved,
        'test-user',
        'test-workflow'
      );

      expect(compiled.preLoadedServices.wasm.has('sentiment-analyzer')).toBe(true);
      expect(compiled.preLoadedServices.mcp.has('github-search')).toBe(true);
      expect(compiled.preLoadedServices.docker.has('ml-trainer')).toBe(true);
    });

    it('should create healthy CompiledWorkflow', async () => {
      const ir = {
        instructions: [
          {
            index: 0,
            opcode: IROpcode.CALL_SERVICE,
            dest: 1,
            serviceId: 'sentiment-analyzer',
            serviceVersion: '2.1.0'
          }
        ],
        instructionOrder: [0],
        dependencyGraph: new Map(),
        resourceTable: [],
        parallelizationGroups: [],
        schemas: [],
        semanticContext: {
          embeddings: [],
          relationships: [],
          fallbackStrategies: []
        },
        inputRegister: 0,
        outputRegister: 1,
        metadata: {
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          source: 'test'
        }
      } as any;

      const resolved = await resolutionService.resolveServices(ir);
      const compiled = await preloaderService.preloadServices(
        resolved,
        'test-user',
        'test-workflow'
      );

      expect(compiled.isHealthy()).toBe(true);
    });

    it('should compute checksum', async () => {
      const ir = {
        instructions: [
          {
            index: 0,
            opcode: IROpcode.CALL_SERVICE,
            dest: 1,
            serviceId: 'sentiment-analyzer',
            serviceVersion: '2.1.0'
          }
        ],
        instructionOrder: [0],
        dependencyGraph: new Map(),
        resourceTable: [],
        parallelizationGroups: [],
        schemas: [],
        semanticContext: {
          embeddings: [],
          relationships: [],
          fallbackStrategies: []
        },
        inputRegister: 0,
        outputRegister: 1,
        metadata: {
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          source: 'test'
        }
      } as any;

      const resolved = await resolutionService.resolveServices(ir);
      const compiled = await preloaderService.preloadServices(
        resolved,
        'test-user',
        'test-workflow'
      );

      expect(compiled.metadata.checksum).toBeDefined();
      expect(compiled.metadata.checksum.length).toBe(16); // sha256 truncated
    });
  });
});
