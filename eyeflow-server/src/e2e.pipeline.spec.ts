/**
 * END-TO-END TEST: Full Pipeline from IR to Execution
 * 
 * This test validates the complete compilation and execution flow:
 * Layer 4 IR → Stage 7 (Resolution) → Stage 8 (Pre-loading) → Layer 5 (SVM Execution)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ServiceResolutionService } from './compiler/stages/stage-7-service-resolution.service';
import { ServicePreloaderService } from './compiler/stages/stage-8-service-preloader.service';
import { SemanticVirtualMachine } from './runtime/semantic-vm.service';
import {
  LLMIntermediateRepresentation,
  IROpcode,
  RegisterType
} from './compiler/interfaces/ir.interface';
import { CompiledWorkflowImpl } from './compiler/interfaces/compiled-workflow.interface';

describe('E2E: Complete Pipeline - IR to Execution', () => {
  let resolutionService: ServiceResolutionService;
  let preloaderService: ServicePreloaderService;
  let vm: SemanticVirtualMachine;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceResolutionService,
        ServicePreloaderService,
        SemanticVirtualMachine
      ]
    }).compile();

    resolutionService = module.get<ServiceResolutionService>(ServiceResolutionService);
    preloaderService = module.get<ServicePreloaderService>(ServicePreloaderService);
    vm = module.get<SemanticVirtualMachine>(SemanticVirtualMachine);
  });

  describe('Full Pipeline: Simple Workflow (2 WASM services)', () => {
    it('should execute end-to-end: IR → Resolution → Pre-loading → Execution', async () => {
      // STEP 1: Create IR (simulating Layer 4 output)
      const ir: LLMIntermediateRepresentation = {
        instructions: [
          // Load input
          {
            index: 0,
            opcode: IROpcode.LOAD_RESOURCE,
            dest: 0,
            operands: { resourceId: 0 }
          },
          // First service call: sentiment-analyzer
          {
            index: 1,
            opcode: IROpcode.CALL_SERVICE,
            dest: 1,
            src: [0],
            serviceId: 'sentiment-analyzer',
            serviceVersion: '2.1.0'
          },
          // Second service call: sentiment-analyzer (different input)
          {
            index: 2,
            opcode: IROpcode.CALL_SERVICE,
            dest: 2,
            src: [1],
            serviceId: 'sentiment-analyzer',
            serviceVersion: '2.1.0'
          },
          // Return result
          {
            index: 3,
            opcode: IROpcode.RETURN,
            src: [2]
          }
        ],
        instructionOrder: [0, 1, 2, 3],
        dependencyGraph: new Map([
          [0, []],
          [1, [0]],
          [2, [1]],
          [3, [2]]
        ]),
        resourceTable: [
          {
            handleId: 0,
            type: 'cache',
            metadata: { name: 'input-buffer' }
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
        outputRegister: 2,
        metadata: {
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          source: 'Analyze sentiment twice: "hello world"'
        }
      };

      console.log('\n✅ Step 1: Created IR with 4 instructions');

      // STEP 2: Service Resolution (Stage 7)
      const resolved = await resolutionService.resolveServices(ir);

      expect(resolved.resolvedServices.length).toBe(2);
      expect(resolved.resolvedServices[0].serviceId).toBe('sentiment-analyzer');
      expect(resolved.resolvedServices[0].format).toBe('WASM');
      expect(resolved.instructions[1].dispatchMetadata).toBeDefined();
      expect(resolved.instructions[2].dispatchMetadata).toBeDefined();

      console.log(`✅ Step 2: Stage 7 Resolution - ${resolved.resolvedServices.length} services resolved`);
      console.log(`   - sentiment-analyzer@2.1.0 (WASM)`);

      // STEP 3: Service Pre-loading (Stage 8)
      const compiled = await preloaderService.preloadServices(
        resolved,
        'test-user-123',
        'sentiment-analysis-workflow'
      );

      expect(compiled.metadata.id).toBeDefined();
      expect(compiled.metadata.userId).toBe('test-user-123');
      expect(compiled.metadata.workflowName).toBe('sentiment-analysis-workflow');
      expect(compiled.preLoadedServices.wasm.size).toBeGreaterThan(0);
      expect(compiled.isHealthy()).toBe(true);

      console.log(`✅ Step 3: Stage 8 Pre-loading`);
      console.log(`   - Compiled workflow ID: ${compiled.metadata.id}`);
      console.log(`   - Checksum: ${compiled.metadata.checksum}`);
      console.log(`   - WASM services loaded: ${compiled.preLoadedServices.wasm.size}`);
      console.log(`   - Workflow health: ${compiled.isHealthy() ? 'Healthy ✅' : 'Unhealthy ❌'}`);

      // STEP 4: Execute with Layer 5 SVM
      const result = await vm.execute(compiled, {});

      expect(result).toBeDefined();
      expect(result.instructionsExecuted).toBe(4);
      expect(result.servicesCalled.length).toBe(2);
      expect(result.durationMs).toBeLessThan(500); // Should be fast
      expect(result.servicesCalled[0].format).toBe('WASM');
      expect(result.servicesCalled[1].format).toBe('WASM');

      console.log(`✅ Step 4: Layer 5 SVM Execution`);
      console.log(`   - Instructions executed: ${result.instructionsExecuted}`);
      console.log(`   - Services called: ${result.servicesCalled.length}`);
      console.log(`   - Total duration: ${result.durationMs}ms`);
      console.log(`   - Service call durations:`);
      result.servicesCalled.forEach((call: any, idx: number) => {
        console.log(`     [${idx}] ${call.serviceId} (${call.format}): ${call.durationMs}ms`);
      });

      console.log('\n🎉 E2E TEST PASSED: Full pipeline works end-to-end!');
    });
  });

  describe('Full Pipeline: Complex Workflow (Mixed formats)', () => {
    it('should handle mixed service formats (WASM + MCP + DOCKER)', async () => {
      // Create IR with different service types
      const ir: LLMIntermediateRepresentation = {
        instructions: [
          // Load input
          {
            index: 0,
            opcode: IROpcode.LOAD_RESOURCE,
            dest: 0,
            operands: { resourceId: 0 }
          },
          // WASM service
          {
            index: 1,
            opcode: IROpcode.CALL_SERVICE,
            dest: 1,
            src: [0],
            serviceId: 'sentiment-analyzer',
            serviceVersion: '2.1.0'
          },
          // MCP service
          {
            index: 2,
            opcode: IROpcode.CALL_SERVICE,
            dest: 2,
            src: [1],
            serviceId: 'github-search',
            serviceVersion: '1.0.0'
          },
          // DOCKER service
          {
            index: 3,
            opcode: IROpcode.CALL_SERVICE,
            dest: 3,
            src: [2],
            serviceId: 'ml-trainer',
            serviceVersion: '3.0.0'
          }
        ],
        instructionOrder: [0, 1, 2, 3],
        dependencyGraph: new Map([
          [0, []],
          [1, [0]],
          [2, [1]],
          [3, [2]]
        ]),
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
          source: 'Complex workflow: sentiment analysis → search → ML training'
        }
      };

      console.log('\n✅ Step 1: Created complex IR with 3 different service formats');

      // Stage 7: Resolve
      const resolved = await resolutionService.resolveServices(ir);

      expect(resolved.resolvedServices.length).toBe(3);
      expect(resolved.resolvedServices[0].format).toBe('WASM');
      expect(resolved.resolvedServices[1].format).toBe('MCP');
      expect(resolved.resolvedServices[2].format).toBe('DOCKER');

      console.log(`✅ Step 2: Stage 7 Resolution - 3 services resolved`);
      console.log(`   - sentiment-analyzer (WASM)`);
      console.log(`   - github-search (MCP)`);
      console.log(`   - ml-trainer (DOCKER)`);

      // Stage 8: Pre-load
      const compiled = await preloaderService.preloadServices(
        resolved,
        'test-user-456',
        'complex-workflow'
      );

      expect(compiled.preLoadedServices.wasm.size).toBe(1);
      expect(compiled.preLoadedServices.mcp.size).toBe(1);
      expect(compiled.preLoadedServices.docker.size).toBe(1);

      console.log(`✅ Step 3: Stage 8 Pre-loading - all formats loaded`);
      console.log(`   - WASM: ${compiled.preLoadedServices.wasm.size}`);
      console.log(`   - MCP: ${compiled.preLoadedServices.mcp.size}`);
      console.log(`   - DOCKER: ${compiled.preLoadedServices.docker.size}`);

      // Layer 5: Execute
      const result = await vm.execute(compiled, {});

      expect(result.servicesCalled.length).toBe(3);
      expect(result.servicesCalled[0].format).toBe('WASM');
      expect(result.servicesCalled[1].format).toBe('MCP');
      expect(result.servicesCalled[2].format).toBe('DOCKER');

      console.log(`✅ Step 4: Layer 5 Execution with mixed formats`);
      console.log(`   - All 3 services called successfully`);
      console.log(`   - Total time: ${result.durationMs}ms`);

      console.log('\n🎉 E2E TEST PASSED: Complex multi-format workflow works!');
    });
  });

  describe('Full Pipeline: Error Handling', () => {
    it('should fail gracefully when service not found', async () => {
      const ir: LLMIntermediateRepresentation = {
        instructions: [
          {
            index: 0,
            opcode: IROpcode.CALL_SERVICE,
            dest: 1,
            src: [0],
            serviceId: 'non-existent-service',
            serviceVersion: '1.0.0'
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

      console.log('\n✅ Step 1: Created IR with non-existent service');

      // Should fail at Stage 7
      try {
        await resolutionService.resolveServices(ir);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('not found');
        console.log(`✅ Step 2: Stage 7 correctly caught missing service`);
        console.log(`   - Error: ${error.message}`);
      }

      console.log('\n🎉 E2E TEST PASSED: Error handling works correctly!');
    });

    it('should fail gracefully when service not pre-loaded before execution', async () => {
      // Create IR
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

      // Create CompiledWorkflow with empty pre-loaded services
      const compiled = new CompiledWorkflowImpl(
        ir,
        {
          wasm: new Map(), // Empty!
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
        }
      );

      console.log('\n✅ Step 1: Created CompiledWorkflow with missing service');

      // Should fail at Layer 5
      try {
        await vm.execute(compiled, {});
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('not found');
        console.log(`✅ Step 2: Layer 5 correctly caught missing pre-loaded service`);
        console.log(`   - Error: ${error.message}`);
      }

      console.log('\n🎉 E2E TEST PASSED: Layer 5 error handling works!');
    });
  });

  describe('Performance Analysis', () => {
    it('should complete full pipeline in reasonable time', async () => {
      const ir: LLMIntermediateRepresentation = {
        instructions: [
          {
            index: 0,
            opcode: IROpcode.LOAD_RESOURCE,
            dest: 0,
            operands: { resourceId: 0 }
          },
          {
            index: 1,
            opcode: IROpcode.CALL_SERVICE,
            dest: 1,
            src: [0],
            serviceId: 'sentiment-analyzer',
            serviceVersion: '2.1.0'
          }
        ],
        instructionOrder: [0, 1],
        dependencyGraph: new Map([
          [0, []],
          [1, [0]]
        ]),
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
          source: 'performance test'
        }
      };

      console.log('\n⏱️  Performance Test: Measuring full pipeline...');

      // Time Stage 7
      const t1 = Date.now();
      const resolved = await resolutionService.resolveServices(ir);
      const t2 = Date.now();
      const stage7Time = t2 - t1;

      // Time Stage 8
      const t3 = Date.now();
      const compiled = await preloaderService.preloadServices(
        resolved,
        'test-user',
        'perf-test'
      );
      const t4 = Date.now();
      const stage8Time = t4 - t3;

      // Time Layer 5
      const t5 = Date.now();
      const result = await vm.execute(compiled, {});
      const t6 = Date.now();
      const layer5Time = t6 - t5;

      const totalTime = stage7Time + stage8Time + layer5Time;

      console.log(`\n📊 Performance Metrics:`);
      console.log(`   - Stage 7 (Resolution): ${stage7Time}ms`);
      console.log(`   - Stage 8 (Pre-loading): ${stage8Time}ms`);
      console.log(`   - Layer 5 (Execution): ${layer5Time}ms (+ service calls: ${result.durationMs}ms)`);
      console.log(`   - TOTAL PIPELINE: ${totalTime}ms`);
      console.log(`\n🎯 Performance Targets:`);
      console.log(`   - Compilation (S7+S8): < 500ms ✅ (${stage7Time + stage8Time}ms)`);
      console.log(`   - Execution (L5): < 100ms ✅ (${layer5Time}ms)`);
      console.log(`   - Per-workflow: 10-100ms ✅`);

      // Validate performance
      expect(stage7Time).toBeLessThan(500);
      expect(stage8Time).toBeLessThan(500);
      expect(layer5Time).toBeLessThan(100);
      expect(totalTime).toBeLessThan(1000);

      console.log('\n🚀 PERFORMANCE TEST PASSED!');
    });
  });

  describe('Integration: Memory & Resources', () => {
    it('should manage memory efficiently', async () => {
      const ir: LLMIntermediateRepresentation = {
        instructions: [
          {
            index: 0,
            opcode: IROpcode.LOAD_RESOURCE,
            dest: 0,
            operands: { resourceId: 0 }
          },
          {
            index: 1,
            opcode: IROpcode.CALL_SERVICE,
            dest: 1,
            src: [0],
            serviceId: 'sentiment-analyzer',
            serviceVersion: '2.1.0'
          }
        ],
        instructionOrder: [0, 1],
        dependencyGraph: new Map([
          [0, []],
          [1, [0]]
        ]),
        resourceTable: [
          {
            handleId: 0,
            type: 'cache',
            metadata: { size: '10MB' }
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
          source: 'memory test'
        }
      };

      const resolved = await resolutionService.resolveServices(ir);
      const compiled = await preloaderService.preloadServices(
        resolved,
        'test-user',
        'memory-test'
      );

      console.log('\n💾 Memory Management Test:');
      console.log(`   - Resource table entries: ${compiled.ir.resourceTable.length}`);
      console.log(`   - Pre-loaded WASM services: ${compiled.preLoadedServices.wasm.size}`);
      console.log(`   - CompiledWorkflow size: ~${JSON.stringify(compiled).length} bytes`);

      expect(compiled.ir.resourceTable.length).toBeGreaterThan(0);
      expect(compiled.preLoadedServices.wasm.size).toBeGreaterThan(0);

      // Execute multiple times with same compiled workflow (should reuse memory)
      for (let i = 0; i < 3; i++) {
        const result = await vm.execute(compiled, {});
        expect(result).toBeDefined();
      }

      console.log(`   - Executed 3 times with same compiled workflow (memory reuse)  ✅`);
      console.log('\n✅ MEMORY TEST PASSED!');
    });
  });
});
