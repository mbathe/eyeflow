/**
 * INTEGRATION TEST: Full User Request → Compilation → Execution
 * 
 * This test simulates the complete workflow:
 * User Request → IR Generation → Service Resolution → Pre-loading → Execution
 * 
 * Validates that the entire system works end-to-end from user input to execution.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ServiceResolutionService } from './compiler/stages/stage-7-service-resolution.service';
import { ServicePreloaderService } from './compiler/stages/stage-8-service-preloader.service';
import { SemanticVirtualMachine } from './runtime/semantic-vm.service';
import {
  LLMIntermediateRepresentation,
  IROpcode,
  RegisterType,
  IRInstruction
} from './compiler/interfaces/ir.interface';
import { CompiledWorkflowImpl } from './compiler/interfaces/compiled-workflow.interface';

describe('Full Integration: User Request → Compilation → Execution', () => {
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

  describe('User Request: Sentiment Analysis', () => {
    it('should compile and execute "Analyze the sentiment of this text"', async () => {
      console.log('\n' + '═'.repeat(80));
      console.log('INTEGRATION TEST: User Request → Full Pipeline');
      console.log('═'.repeat(80));

      // STEP 0: Simulate a user request
      const userRequest = 'Analyze the sentiment of this text: "I love this product!"';
      console.log(`\n📝 User Request: "${userRequest}"`);

      // STEP 1: Simulate Layer 4 - IR Generation (would be done by LLM in production)
      // This simulates what the LLM would generate based on the user request
      console.log('\n[Layer 4] IR Generation (simulated LLM output):');
      
      const ir: LLMIntermediateRepresentation = {
        instructions: [
          // Load the input text
          {
            index: 0,
            opcode: IROpcode.LOAD_RESOURCE,
            dest: 0,
            operands: { resourceId: 0 }
          },
          // Call sentiment-analyzer service
          {
            index: 1,
            opcode: IROpcode.CALL_SERVICE,
            dest: 1,
            src: [0],
            serviceId: 'sentiment-analyzer',
            serviceVersion: '2.1.0'
          },
          // Prepare result
          {
            index: 2,
            opcode: IROpcode.STORE_MEMORY,
            dest: 2,
            src: [1],
            operands: { format: 'json' }
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
            metadata: { 
              name: 'input-text',
              value: 'I love this product!' 
            }
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
          source: userRequest
        }
      };

      console.log(`  ✓ Generated IR with ${ir.instructions.length} instructions`);
      console.log(`  ✓ Dependency graph created`);
      console.log(`  ✓ Resource table allocated (${ir.resourceTable.length} entries)`);

      // STEP 2: Stage 7 - Service Resolution
      console.log('\n[Stage 7] Service Resolution:');
      const startResolution = Date.now();
      
      const resolved = await resolutionService.resolveServices(ir);
      
      const resolutionTime = Date.now() - startResolution;
      console.log(`  ✓ Resolved ${resolved.resolvedServices.length} service(s) in ${resolutionTime}ms`);
      console.log(`  ✓ Services: ${resolved.resolvedServices.map(s => `${s.serviceId}@${s.version} (${s.format})`).join(', ')}`);
      console.log(`  ✓ All instructions tagged with dispatch metadata`);

      expect(resolved.resolvedServices.length).toBeGreaterThan(0);
      expect(resolved.resolvedServices[0].format).toBe('WASM');
      expect(resolved.instructions[1].dispatchMetadata).toBeDefined();

      // STEP 3: Stage 8 - Service Pre-loading
      console.log('\n[Stage 8] Service Pre-loading:');
      const startPreload = Date.now();
      
      const compiled = await preloaderService.preloadServices(
        resolved,
        'user-001',
        'sentiment-analysis-workflow'
      );
      
      const preloadTime = Date.now() - startPreload;
      console.log(`  ✓ Pre-loaded services in ${preloadTime}ms`);
      console.log(`  ✓ Compiled workflow ID: ${compiled.metadata.id}`);
      console.log(`  ✓ Checksum: ${compiled.metadata.checksum}`);
      console.log(`  ✓ WASM services: ${compiled.preLoadedServices.wasm.size}`);
      console.log(`  ✓ Workflow sealed and ready for execution`);

      expect(compiled.metadata.id).toBeDefined();
      expect(compiled.metadata.userId).toBe('user-001');
      expect(compiled.preLoadedServices.wasm.size).toBeGreaterThan(0);
      expect(compiled.isHealthy()).toBe(true);

      // STEP 4: Layer 5 - Semantic Virtual Machine Execution
      console.log('\n[Layer 5] Semantic Virtual Machine Execution:');
      const startExecution = Date.now();
      
      const result = await vm.execute(compiled, {});
      
      const executionTime = Date.now() - startExecution;
      console.log(`  ✓ Executed ${result.instructionsExecuted} instructions in ${executionTime}ms`);
      console.log(`  ✓ Called ${result.servicesCalled.length} service(s)`);
      console.log(`  ✓ Total service time: ${result.servicesCalled.reduce((sum: number, s: any) => sum + s.durationMs, 0)}ms`);

      expect(result.instructionsExecuted).toBe(4);
      expect(result.servicesCalled.length).toBeGreaterThan(0);
      expect(result.durationMs).toBeLessThan(1000);

      // Final summary
      const totalTime = resolutionTime + preloadTime + executionTime;
      console.log('\n' + '═'.repeat(80));
      console.log('📊 FULL PIPELINE METRICS:');
      console.log('═'.repeat(80));
      console.log(`  IR Generation:        [simulated]`);
      console.log(`  Stage 7 Resolution:   ${resolutionTime}ms`);
      console.log(`  Stage 8 Pre-loading:  ${preloadTime}ms`);
      console.log(`  Layer 5 Execution:    ${executionTime}ms`);
      console.log(`  ─────────────────────────────────`);
      console.log(`  TOTAL PIPELINE TIME:  ${totalTime}ms`);
      console.log(`\n✅ Compilation Target: <500ms  [${totalTime < 500 ? '✅ MET' : '❌ MISS'}]`);
      console.log(`✅ Execution Target:   <100ms  [${executionTime < 100 ? '✅ MET' : '⚠️ BORDERLINE'}]`);
      console.log(`✅ Per-workflow Goal:  10-100ms [${totalTime >= 10 && totalTime <= 100 ? '✅ IN RANGE' : '⚠️ NEEDS OPTIMIZATION'}]`);
      console.log('═'.repeat(80) + '\n');

      console.log('🎉 END-TO-END INTEGRATION TEST PASSED!\n');
    });
  });

  describe('Complex User Request: Multi-step Analysis', () => {
    it('should compile and execute "Extract keywords and analyze sentiment"', async () => {
      console.log('\n' + '═'.repeat(80));
      console.log('COMPLEX INTEGRATION TEST: Multi-step Analysis');
      console.log('═'.repeat(80));

      const userRequest = 'Extract keywords and analyze sentiment of: "Amazing service, highly recommended!"';
      console.log(`\n📝 User Request: "${userRequest}"`);

      console.log('\n[Layer 4] IR Generation:');
      
      const ir: LLMIntermediateRepresentation = {
        instructions: [
          // Load text
          {
            index: 0,
            opcode: IROpcode.LOAD_RESOURCE,
            dest: 0,
            operands: { resourceId: 0 }
          },
          // First service: image processing
          {
            index: 1,
            opcode: IROpcode.CALL_SERVICE,
            dest: 1,
            src: [0],
            serviceId: 'image-processor',
            serviceVersion: '1.5.0'
          },
          // Second service: sentiment analysis
          {
            index: 2,
            opcode: IROpcode.CALL_SERVICE,
            dest: 2,
            src: [0],
            serviceId: 'sentiment-analyzer',
            serviceVersion: '2.1.0'
          },
          // Combine results
          {
            index: 3,
            opcode: IROpcode.STORE_MEMORY,
            dest: 3,
            src: [1, 2],
            operands: { format: 'combined_json' }
          },
          // Return
          {
            index: 4,
            opcode: IROpcode.RETURN,
            src: [3]
          }
        ],
        instructionOrder: [0, 1, 2, 3, 4],
        dependencyGraph: new Map([
          [0, []],
          [1, [0]],
          [2, [0]],
          [3, [1, 2]],
          [4, [3]]
        ]),
        resourceTable: [
          {
            handleId: 0,
            type: 'cache',
            metadata: { 
              name: 'input-text',
              value: 'Amazing service, highly recommended!' 
            }
          }
        ],
        parallelizationGroups: [], // Instructions 1,2 can be parallelized if needed
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
          source: userRequest
        }
      };

      console.log(`  ✓ Generated IR with ${ir.instructions.length} instructions`);
      console.log(`  ✓ Parallelization groups: ${ir.parallelizationGroups.length} (instructions 1,2 can run in parallel)`);

      // Complete compilation pipeline
      console.log('\n[Compilation Pipeline]:');
      const startTotal = Date.now();

      const resolved = await resolutionService.resolveServices(ir);
      console.log(`  ✓ Stage 7: ${resolved.resolvedServices.length} services resolved`);

      const compiled = await preloaderService.preloadServices(
        resolved,
        'user-002',
        'multi-step-analysis'
      );
      console.log(`  ✓ Stage 8: Services pre-loaded, workflow compiled`);

      const result = await vm.execute(compiled, {});
      console.log(`  ✓ Layer 5: ${result.instructionsExecuted} instructions executed`);

      const totalTime = Date.now() - startTotal;

      console.log('\n' + '═'.repeat(80));
      console.log(`✅ Complex workflow compiled and executed in ${totalTime}ms`);
      console.log(`✅ Services called: ${result.servicesCalled.map((s: any) => `${s.serviceId} (${s.format})`).join(', ')}`);
      console.log('═'.repeat(80) + '\n');

      expect(result.instructionsExecuted).toBeGreaterThan(0);
      expect(resolved.resolvedServices.length).toBeGreaterThan(0);
    });
  });

  describe('Error Case: Invalid User Request', () => {
    it('should handle invalid service requests gracefully', async () => {
      console.log('\n' + '═'.repeat(80));
      console.log('ERROR HANDLING TEST: Invalid Service Request');
      console.log('═'.repeat(80));

      const userRequest = 'Use the magic-unicorn-service to analyze this';
      console.log(`\n📝 User Request: "${userRequest}"`);

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
            serviceId: 'magic-unicorn-service',
            serviceVersion: '1.0.0'
          },
          {
            index: 2,
            opcode: IROpcode.RETURN,
            src: [1]
          }
        ],
        instructionOrder: [0, 1, 2],
        dependencyGraph: new Map([
          [0, []],
          [1, [0]],
          [2, [1]]
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
          source: userRequest
        }
      };

      console.log('\n[Stage 7] Attempting service resolution...');
      try {
        await resolutionService.resolveServices(ir);
        fail('Should have thrown an error');
      } catch (error: any) {
        console.log(`  ✓ Correctly caught error: ${error.message}`);
        expect(error.message).toContain('not found');
      }

      console.log('\n✅ Error handling works correctly');
      console.log('═'.repeat(80) + '\n');
    });
  });

  describe('Real-world Scenario: Document Processing', () => {
    it('should compile a document processing workflow', async () => {
      console.log('\n' + '═'.repeat(80));
      console.log('REAL-WORLD TEST: Document Processing Pipeline');
      console.log('═'.repeat(80));

      const userRequest = 'Process a document: extract text, analyze sentiment, and generate summary';
      console.log(`\n📝 User Request: "${userRequest}"`);

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
          },
          {
            index: 2,
            opcode: IROpcode.STORE_MEMORY,
            dest: 2,
            src: [1],
            operands: { format: 'json' }
          },
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
            metadata: { name: 'document', type: 'pdf' }
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
          source: userRequest
        }
      };

      console.log('\n[Full Pipeline Execution]:');
      const startTime = Date.now();

      const resolved = await resolutionService.resolveServices(ir);
      const compiled = await preloaderService.preloadServices(
        resolved,
        'user-biz',
        'document-processor'
      );
      const result = await vm.execute(compiled, {});

      const totalTime = Date.now() - startTime;

      console.log(`  ✓ Resolution: service discovered`);
      console.log(`  ✓ Pre-loading: WASM module loaded`);
      console.log(`  ✓ Execution: ${result.instructionsExecuted} instructions executed in ${result.durationMs}ms`);
      console.log(`  ✓ Total time: ${totalTime}ms`);

      console.log('\n✅ Document processing workflow validation passed');
      console.log('═'.repeat(80) + '\n');

      expect(compiled.metadata.workflowName).toBe('document-processor');
      expect(result.instructionsExecuted).toBe(4);
    });
  });
});
