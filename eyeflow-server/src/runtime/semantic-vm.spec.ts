/**
 * Tests for Layer 5 (Semantic Virtual Machine)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SemanticVirtualMachine, ExecutionResult } from './semantic-vm.service';
import {
  LLMIntermediateRepresentation,
  IROpcode
} from '../compiler/interfaces/ir.interface';
import {
  CompiledWorkflowImpl,
  CompiledWorkflowMetadata
} from '../compiler/interfaces/compiled-workflow.interface';

describe('Layer 5: Semantic Virtual Machine', () => {
  let vm: SemanticVirtualMachine;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SemanticVirtualMachine]
    }).compile();

    vm = module.get<SemanticVirtualMachine>(SemanticVirtualMachine);
  });

  describe('Basic Execution', () => {
    it('should initialize with empty registers', async () => {
      const ir: LLMIntermediateRepresentation = {
        instructions: [],
        instructionOrder: [],
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
        outputRegister: 0,
        metadata: {
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          source: 'test'
        }
      };

      const workflow = new CompiledWorkflowImpl(
        ir,
        {
          wasm: new Map(),
          mcp: new Map(),
          native: new Map(),
          docker: new Map()
        },
        {
          id: 'test',
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          checksum: 'test',
          userId: 'test',
          workflowName: 'test'
        } as CompiledWorkflowMetadata
      );

      const result = await vm.execute(workflow, {});

      expect(result).toBeDefined();
      expect(result.instructionsExecuted).toBe(0);
    });

    it('should execute LOAD_RESOURCE instruction', async () => {
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
        dependencyGraph: new Map([[0, []]]),
        resourceTable: [
          {
            handleId: 0,
            type: 'cache',
            metadata: { name: 'test-resource' }
          }
        ],
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

      const workflow = new CompiledWorkflowImpl(
        ir,
        {
          wasm: new Map(),
          mcp: new Map(),
          native: new Map(),
          docker: new Map()
        },
        {
          id: 'test',
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          checksum: 'test',
          userId: 'test',
          workflowName: 'test'
        } as CompiledWorkflowMetadata
      );

      const result = await vm.execute(workflow, {});

      expect(result.instructionsExecuted).toBe(1);
    });

    it('should execute VALIDATE instruction', async () => {
      const ir: LLMIntermediateRepresentation = {
        instructions: [
          {
            index: 0,
            opcode: IROpcode.VALIDATE,
            src: [0],
            operands: { schemaId: 0 }
          }
        ],
        instructionOrder: [0],
        dependencyGraph: new Map([[0, []]]),
        resourceTable: [],
        parallelizationGroups: [],
        schemas: [
          {
            id: 0,
            name: 'test-schema',
            jsonSchema: { type: 'object' },
            validator: (v) => typeof v === 'object'
          }
        ],
        semanticContext: {
          embeddings: [],
          relationships: [],
          fallbackStrategies: []
        },
        inputRegister: 0,
        outputRegister: 0,
        metadata: {
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          source: 'test'
        }
      };

      const workflow = new CompiledWorkflowImpl(
        ir,
        {
          wasm: new Map(),
          mcp: new Map(),
          native: new Map(),
          docker: new Map()
        },
        {
          id: 'test',
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          checksum: 'test',
          userId: 'test',
          workflowName: 'test'
        } as CompiledWorkflowMetadata
      );

      const result = await vm.execute(workflow, {});

      expect(result.instructionsExecuted).toBe(1);
    });
  });

  describe('Service Calls', () => {
    it('should call WASM service', async () => {
      const ir: LLMIntermediateRepresentation = {
        instructions: [
          {
            index: 0,
            opcode: IROpcode.CALL_SERVICE,
            dest: 1,
            src: [0],
            serviceId: 'sentiment-analyzer',
            dispatchMetadata: {
              format: 'WASM',
              wasmBinaryUrl: 'test',
              timeout: 5000
            }
          }
        ],
        instructionOrder: [0],
        dependencyGraph: new Map([[0, []]]),
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

      const preLoaded = {
        wasm: new Map([['sentiment-analyzer', Buffer.from('mock-wasm')]]),
        mcp: new Map(),
        native: new Map(),
        docker: new Map()
      };

      const workflow = new CompiledWorkflowImpl(
        ir,
        preLoaded,
        {
          id: 'test',
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          checksum: 'test',
          userId: 'test',
          workflowName: 'test'
        } as CompiledWorkflowMetadata
      );

      const result = await vm.execute(workflow, {});

      expect(result.instructionsExecuted).toBe(1);
      expect(result.servicesOalled.length).toBe(1);
      expect(result.servicesOalled[0].serviceId).toBe('sentiment-analyzer');
      expect(result.servicesOalled[0].format).toBe('WASM');
    });

    it('should call MCP service', async () => {
      const ir: LLMIntermediateRepresentation = {
        instructions: [
          {
            index: 0,
            opcode: IROpcode.CALL_SERVICE,
            dest: 1,
            src: [0],
            serviceId: 'github-search',
            dispatchMetadata: {
              format: 'MCP',
              mcpServer: 'ghcli',
              mcpMethod: 'search_repos',
              timeout: 5000
            }
          }
        ],
        instructionOrder: [0],
        dependencyGraph: new Map([[0, []]]),
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

      const preLoaded = {
        wasm: new Map(),
        mcp: new Map([
          [
            'github-search',
            {
              id: 'github-search',
              endpoint: 'mcp://ghcli',
              connected: true
            }
          ]
        ]),
        native: new Map(),
        docker: new Map()
      };

      const workflow = new CompiledWorkflowImpl(
        ir,
        preLoaded,
        {
          id: 'test',
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          checksum: 'test',
          userId: 'test',
          workflowName: 'test'
        } as CompiledWorkflowMetadata
      );

      const result = await vm.execute(workflow, {});

      expect(result.servicesOalled.length).toBe(1);
      expect(result.servicesOalled[0].format).toBe('MCP');
    });

    it('should call DOCKER service', async () => {
      const ir: LLMIntermediateRepresentation = {
        instructions: [
          {
            index: 0,
            opcode: IROpcode.CALL_SERVICE,
            dest: 1,
            src: [0],
            serviceId: 'ml-trainer',
            dispatchMetadata: {
              format: 'DOCKER',
              dockerImage: 'eyeflow/ml-trainer',
              dockerVersion: '3.0.0',
              timeout: 30000
            }
          }
        ],
        instructionOrder: [0],
        dependencyGraph: new Map([[0, []]]),
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

      const preLoaded = {
        wasm: new Map(),
        mcp: new Map(),
        native: new Map(),
        docker: new Map([['ml-trainer', 'eyeflow/ml-trainer:3.0.0']])
      };

      const workflow = new CompiledWorkflowImpl(
        ir,
        preLoaded,
        {
          id: 'test',
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          checksum: 'test',
          userId: 'test',
          workflowName: 'test'
        } as CompiledWorkflowMetadata
      );

      const result = await vm.execute(workflow, {});

      expect(result.servicesOalled.length).toBe(1);
      expect(result.servicesOalled[0].format).toBe('DOCKER');
    });

    it('should fail if service not pre-loaded', async () => {
      const ir: LLMIntermediateRepresentation = {
        instructions: [
          {
            index: 0,
            opcode: IROpcode.CALL_SERVICE,
            dest: 1,
            src: [0],
            serviceId: 'missing-service',
            dispatchMetadata: {
              format: 'WASM',
              timeout: 5000
            }
          }
        ],
        instructionOrder: [0],
        dependencyGraph: new Map([[0, []]]),
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

      const preLoaded = {
        wasm: new Map(),
        mcp: new Map(),
        native: new Map(),
        docker: new Map()
      };

      const workflow = new CompiledWorkflowImpl(
        ir,
        preLoaded,
        {
          id: 'test',
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          checksum: 'test',
          userId: 'test',
          workflowName: 'test'
        } as CompiledWorkflowMetadata
      );

      await expect(vm.execute(workflow, {})).rejects.toThrow('not found');
    });
  });

  describe('Performance', () => {
    it('should track execution duration', async () => {
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
        dependencyGraph: new Map([[0, []]]),
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

      const workflow = new CompiledWorkflowImpl(
        ir,
        {
          wasm: new Map(),
          mcp: new Map(),
          native: new Map(),
          docker: new Map()
        },
        {
          id: 'test',
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          checksum: 'test',
          userId: 'test',
          workflowName: 'test'
        } as CompiledWorkflowMetadata
      );

      const result = await vm.execute(workflow, {});

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeLessThan(1000); // Should be fast
    });

    it('should track service call durations', async () => {
      const ir: LLMIntermediateRepresentation = {
        instructions: [
          {
            index: 0,
            opcode: IROpcode.CALL_SERVICE,
            dest: 1,
            src: [0],
            serviceId: 'sentiment-analyzer',
            dispatchMetadata: {
              format: 'WASM',
              timeout: 5000
            }
          }
        ],
        instructionOrder: [0],
        dependencyGraph: new Map([[0, []]]),
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

      const preLoaded = {
        wasm: new Map([['sentiment-analyzer', Buffer.from('mock')]]),
        mcp: new Map(),
        native: new Map(),
        docker: new Map()
      };

      const workflow = new CompiledWorkflowImpl(
        ir,
        preLoaded,
        {
          id: 'test',
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          checksum: 'test',
          userId: 'test',
          workflowName: 'test'
        } as CompiledWorkflowMetadata
      );

      const result = await vm.execute(workflow, {});

      expect(result.servicesOalled[0].durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
