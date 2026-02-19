/**
 * Optimizer Orchestrator Service
 * Coordinates all optimization services (Layer 3)
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { Logger } from 'winston';
import { Inject } from '@nestjs/common';
import { SemanticTree } from '../../frontend/interfaces/semantic-node.interface';
import { OptimizationPlan, IOptimizerService } from '../interfaces/optimizer.interface';
import { RedisCacheService } from '../../../common/services/redis-cache.service';
import { DataClassifierService } from './data-classifier.service';
import { ResourceBinderService } from './resource-binder.service';
import { SchemaPrecomputerService } from './schema-precomputer.service';
import { ParallelizationDetectorService } from './parallelization-detector.service';
import { LLMContextOptimizerService } from './llm-context-optimizer.service';

@Injectable()
export class OptimizerOrchestratorService implements IOptimizerService, OnModuleInit {
  private readonly CACHE_PREFIX = 'optimizer:optimized:';

  constructor(
    @Inject('LOGGER') private logger: Logger,
    @Inject(RedisCacheService) private cache: RedisCacheService,
    @Inject(DataClassifierService) private dataClassifier: DataClassifierService,
    @Inject(ResourceBinderService) private resourceBinder: ResourceBinderService,
    @Inject(SchemaPrecomputerService) private schemaPrecomputer: SchemaPrecomputerService,
    @Inject(ParallelizationDetectorService) private parallelizationDetector: ParallelizationDetectorService,
    @Inject(LLMContextOptimizerService) private llmContextOptimizer: LLMContextOptimizerService,
  ) {}

  onModuleInit(): void {
    this.logger.info('OptimizerOrchestratorService initialized', {
      context: 'OptimizerOrchestrator',
    });
  }

  /**
   * Execute full optimization pipeline
   */
  async optimize(tree: SemanticTree, workflowId: string): Promise<OptimizationPlan> {
    const startTime = Date.now();
    const plan: OptimizationPlan = {
      success: true,
      workflowId,
      classificationsMap: new Map(),
      resourceBindings: [],
      schemas: [],
      parallelizationOpportunities: [],
      llmContexts: [],
      optimizations: {
        estimatedSpeedup: 1,
        estimatedMemorySavings: 0,
        estimatedCachingBenefit: 0,
        parallelizationFactor: 1,
      },
      errors: [],
      metrics: {
        classificationTime: 0,
        bindingTime: 0,
        schemaTime: 0,
        parallelizationTime: 0,
        llmContextTime: 0,
        totalTime: 0,
        variablesClassified: 0,
        resourcesBound: 0,
        schemasGenerated: 0,
      },
    };

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(tree, workflowId);
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        this.logger.info('Using cached optimization plan', {
          context: 'OptimizerOrchestrator',
          workflowId,
        });
        return JSON.parse(cached as string);
      }

      // Stage 1: Data Classification
      const classificationStart = Date.now();
      const classificationResult = await this.dataClassifier.classifyVariables(tree);
      plan.classificationsMap = classificationResult.variables;
      plan.errors.push(...classificationResult.errors);
      plan.metrics.classificationTime = Date.now() - classificationStart;
      plan.metrics.variablesClassified = classificationResult.variables.size;

      // Stage 2: Resource Binding
      const bindingStart = Date.now();
      const bindingResult = await this.resourceBinder.bindResources(tree);
      plan.resourceBindings = bindingResult.bindings;
      plan.errors.push(...bindingResult.errors);
      plan.metrics.bindingTime = Date.now() - bindingStart;
      plan.metrics.resourcesBound = bindingResult.bindings.length;

      // Stage 3: Schema Precomputation
      const schemaStart = Date.now();
      const schemaResult = await this.schemaPrecomputer.precomputeSchemas(tree);
      plan.schemas = schemaResult.schemas;
      plan.errors.push(...schemaResult.errors);
      plan.metrics.schemaTime = Date.now() - schemaStart;
      plan.metrics.schemasGenerated = schemaResult.schemas.length;

      // Stage 4: Parallelization Detection
      const parallelStart = Date.now();
      const parallelResult = await this.parallelizationDetector.detectParallelization(tree);
      plan.parallelizationOpportunities = parallelResult.opportunities;
      plan.errors.push(...parallelResult.errors);
      plan.metrics.parallelizationTime = Date.now() - parallelStart;
      plan.optimizations.estimatedSpeedup = parallelResult.estimatedSpeedup;
      plan.optimizations.parallelizationFactor = parallelResult.totalParallelizablePairs;

      // Stage 5: LLM Context Optimization
      const llmStart = Date.now();
      const llmResult = await this.llmContextOptimizer.optimizeLLMContext(tree);
      plan.llmContexts = llmResult.contexts;
      plan.errors.push(...llmResult.errors);
      plan.metrics.llmContextTime = Date.now() - llmStart;

      // Calculate optimization benefits
      plan.optimizations.estimatedMemorySavings = this.calculateMemorySavings(classificationResult.variables);
      plan.optimizations.estimatedCachingBenefit = this.calculateCachingBenefit(classificationResult.variables);

      plan.metrics.totalTime = Date.now() - startTime;
      plan.success = plan.errors.length === 0;

      // Cache the result
      await this.cache.set(cacheKey, JSON.stringify(plan), 3600); // 1 hour TTL

      this.logger.info('Optimization pipeline completed successfully', {
        context: 'OptimizerOrchestrator',
        workflowId,
        totalTime: plan.metrics.totalTime,
        errorCount: plan.errors.length,
        opportunities: plan.parallelizationOpportunities.length,
      });

      return plan;
    } catch (error) {
      plan.success = false;
      plan.errors.push(
        `Optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      this.logger.error('Optimization pipeline failed', {
        context: 'OptimizerOrchestrator',
        workflowId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return plan;
    }
  }

  /**
   * Classify variables
   */
  async classifyVariables(tree: SemanticTree): Promise<Map<string, any>> {
    const result = await this.dataClassifier.classifyVariables(tree);
    return result.variables;
  }

  /**
   * Bind resources
   */
  async bindResources(tree: SemanticTree): Promise<any[]> {
    const result = await this.resourceBinder.bindResources(tree);
    return result.bindings;
  }

  /**
   * Precompute schemas
   */
  async precomputeSchemas(tree: SemanticTree): Promise<any[]> {
    const result = await this.schemaPrecomputer.precomputeSchemas(tree);
    return result.schemas;
  }

  /**
   * Detect parallelization
   */
  async detectParallelization(tree: SemanticTree): Promise<any[]> {
    const result = await this.parallelizationDetector.detectParallelization(tree);
    return result.opportunities;
  }

  /**
   * Optimize LLM context
   */
  async optimizeLLMContext(tree: SemanticTree): Promise<any[]> {
    const result = await this.llmContextOptimizer.optimizeLLMContext(tree);
    return result.contexts;
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(tree: SemanticTree, workflowId: string): string {
    const treeHash = this.simpleHash(JSON.stringify(tree));
    const idHash = this.simpleHash(workflowId);
    return `${this.CACHE_PREFIX}${idHash}_${treeHash}`;
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Calculate memory savings from optimization
   */
  private calculateMemorySavings(variables: Map<string, any>): number {
    let savings = 0;

    for (const classifiedVar of variables.values()) {
      if (classifiedVar.classification === 'CONSTANT') {
        // Constants can be cached, saving memory during execution
        savings += classifiedVar.estimatedSize || 1;
      }
    }

    return Math.min(savings * 1.5, 2048); // Cap at 2GB
  }

  /**
   * Calculate caching benefit
   */
  private calculateCachingBenefit(variables: Map<string, any>): number {
    let benefit = 0;

    for (const classifiedVar of variables.values()) {
      if (classifiedVar.isCacheable) {
        // Cacheable variables speed up repeated operations
        benefit += 10; // Arbitrary benefit unit per cacheable variable
      }
    }

    return benefit;
  }
}
