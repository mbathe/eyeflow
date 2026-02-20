/**
 * IR Generator Orchestrator Service
 * Coordinates all IR generation stages (Layer 4)
 */

import { Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { Inject } from '@nestjs/common';
import { OptimizationPlan } from '../../optimizer/interfaces/optimizer.interface';
import { SemanticTree } from '../../frontend/interfaces/semantic-node.interface';
import {
  LLMIntermediateRepresentation,
  IRGenerationResult,
  IRInstruction,
  MemorySegment,
} from '../interfaces/ir.interface';
import { ConstantFoldingService } from './constant-folding.service';
import { ResourceReificationService } from './resource-reification.service';
import { ValidationInjectorService } from './validation-injector.service';
import { ParallelizationCodeGenService } from './parallelization-codegen.service';
import { SemanticContextBindingService } from './semantic-context-binding.service';
import { PriorityPolicyInjectorService } from './priority-policy-injector.service';
import { IROptimizerService } from './ir-optimizer.service';

@Injectable()
export class IRGeneratorService {
  private readonly STAGE_PREFIX = 'ir:generation:';

  constructor(
    @Inject('LOGGER') private logger: Logger,
    @Inject(ConstantFoldingService) private constantFolding: ConstantFoldingService,
    @Inject(ResourceReificationService) private resourceReification: ResourceReificationService,
    @Inject(ValidationInjectorService) private validationInjector: ValidationInjectorService,
    @Inject(ParallelizationCodeGenService) private parallelizationCodeGen: ParallelizationCodeGenService,
    @Inject(SemanticContextBindingService) private semanticContextBinding: SemanticContextBindingService,
    @Inject(PriorityPolicyInjectorService) private priorityPolicyInjector: PriorityPolicyInjectorService,
    @Inject(IROptimizerService) private irOptimizer: IROptimizerService,
  ) {}

  /**
   * Generate complete LLM-IR from optimization plan
   */
  async generateIR(
    semanticTree: SemanticTree,
    optimizationPlan: OptimizationPlan,
    workflowId: string,
  ): Promise<IRGenerationResult> {
    const startTime = Date.now();
    this.logger.debug(`Starting IR generation for workflow: ${workflowId}`, {
      context: 'IRGenerator',
    });

    try {
      // Initialize IR
      let ir: LLMIntermediateRepresentation = this.initializeIR(workflowId);

      // Stage 1: Constant Folding
      this.logger.debug('Stage 1: Constant Folding', { context: 'IRGenerator' });
      const constantResult = await this.constantFolding.foldConstants(
        optimizationPlan,
        ir,
      );
      ir.instructions.push(...constantResult.instructions);

      // Stage 2: Resource Reification
      this.logger.debug('Stage 2: Resource Reification', { context: 'IRGenerator' });
      const resourceResult = await this.resourceReification.reifyResources(
        optimizationPlan,
        ir,
      );
      ir.resourceTable = resourceResult.resourceTable;
      ir.instructions.push(...resourceResult.resourceInstructions);
      ir.memoryLayout.push(this.createResourceCacheSegment(resourceResult.resourceTable.length));

      // Stage 3: Validation Injection
      this.logger.debug('Stage 3: Validation Injection', { context: 'IRGenerator' });
      const validationResult = await this.validationInjector.injectValidation(
        optimizationPlan,
        ir,
      );
      ir.schemas = validationResult.validators;
      ir.instructions.push(...validationResult.validationInstructions);

      // Stage 4: Parallelization Codegen
      this.logger.debug('Stage 4: Parallelization Codegen', { context: 'IRGenerator' });
      const parallelResult = await this.parallelizationCodeGen.generateParallelCode(
        optimizationPlan,
        ir,
      );
      ir.parallelizationGroups = parallelResult.parallelGroups;
      ir.instructions.push(...parallelResult.parallelInstructions);

      // Stage 5: Semantic Context Binding
      this.logger.debug('Stage 5: Semantic Context Binding', { context: 'IRGenerator' });
      const semanticResult = await this.semanticContextBinding.bindSemanticContext(
        semanticTree,
        optimizationPlan,
        ir,
      );
      ir.semanticContext = semanticResult.semanticContext;

      // Stage 5b: Priority Policy Injection (spec §6.5)
      this.logger.debug('Stage 5b: Priority Policy Injection', { context: 'IRGenerator' });
      const priorityResult = this.priorityPolicyInjector.injectPriorityPolicies(ir);
      ir.instructions = priorityResult.annotatedInstructions;

      // Stage 6: IR Optimization
      this.logger.debug('Stage 6: IR Optimization', { context: 'IRGenerator' });
      const optimResult = await this.irOptimizer.optimize(ir);
      ir.instructions = optimResult.optimizedInstructions;
      ir.dependencyGraph = optimResult.dependencyGraph;
      ir.instructionOrder = optimResult.instructionOrder;

      // Finalization
      ir.compilationTimeMs = Date.now() - startTime;
      ir.checksum = this.calculateChecksum(ir);

      this.logger.info('IR generation completed successfully', {
        context: 'IRGenerator',
        workflowId,
        instructionCount: ir.instructions.length,
        compilationTimeMs: ir.compilationTimeMs,
      });

      return {
        success: true,
        ir,
        errors: [],
        warnings: [],
        metrics: {
          instructionCount: ir.instructions.length,
          resourceCount: ir.resourceTable.length,
          parallelGroups: ir.parallelizationGroups.length,
          estimatedParallelism: this.calculateParallelism(ir),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`IR generation failed: ${errorMessage}`, {
        context: 'IRGenerator',
        workflowId,
        error,
      });

      return {
        success: false,
        ir: this.initializeIR(workflowId),
        errors: [errorMessage],
        warnings: [],
        metrics: {
          instructionCount: 0,
          resourceCount: 0,
          parallelGroups: 0,
          estimatedParallelism: 1,
        },
      };
    }
  }

  /**
   * Initialize empty IR
   */
  private initializeIR(workflowId: string): LLMIntermediateRepresentation {
    return {
      id: `ir_${workflowId}`,
      workflowId,
      version: '1.0.0',
      compiledAt: new Date(),
      checksum: '',
      compilationTimeMs: 0,
      instructions: [],
      resourceTable: [],
      memoryLayout: [
        this.createMemorySegment('STACK', 65536),
        this.createMemorySegment('HEAP', 1048576),
      ],
      parallelizationGroups: [],
      dependencyGraph: {
        nodes: new Map(),
        edges: new Map(),
      },
      instructionOrder: [],
      schemas: [],
      constraintChecks: [],
      permissionMask: {
        READ: true,
        WRITE: true,
        EXECUTE: true,
        DELETE: false,
        ADMIN: false,
      },
      performance: {
        estimatedLatencyMs: 0,
        estimatedMemoryBytes: 0,
        estimatedCpuCycles: 0,
        parallelizationFactor: 1,
        confidenceLevel: 100,
      },
      semanticContext: {
        embeddings: {},
        contexts: {},
        relationships: {},
      },
      fallbackStrategies: [],
      sourceSemanticTree: {},
      optimizationPlan: {},
    };
  }

  /**
   * Create memory segment
   */
  private createMemorySegment(purpose: string, sizeBytes: number): MemorySegment {
    return {
      name: `${purpose}_SEGMENT`,
      baseAddress: 0,
      sizeBytes,
      purpose: purpose as 'STACK' | 'HEAP' | 'RESOURCE_CACHE' | 'SCHEMA_CACHE',
    };
  }

  /**
   * Create resource cache segment
   */
  private createResourceCacheSegment(resourceCount: number): MemorySegment {
    return {
      name: 'RESOURCE_CACHE_SEGMENT',
      baseAddress: 0,
      sizeBytes: Math.max(8192, resourceCount * 1024),
      purpose: 'RESOURCE_CACHE',
    };
  }

  /**
   * Calculate IR checksum
   */
  private calculateChecksum(ir: LLMIntermediateRepresentation): string {
    const data = JSON.stringify({
      instructions: ir.instructions.map((i) => i.id),
      resources: ir.resourceTable.map((r) => r.id),
    });
    return Buffer.from(data).toString('base64').substring(0, 32);
  }

  /**
   * Calculate parallelization factor
   */
  private calculateParallelism(ir: LLMIntermediateRepresentation): number {
    if (ir.parallelizationGroups.length === 0) return 1;
    return Math.max(...ir.parallelizationGroups.map((g) => g.amdahlEstimate || 1));
  }
}
