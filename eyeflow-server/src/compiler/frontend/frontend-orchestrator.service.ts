/**
 * Frontend Parser Orchestrator
 * Coordinates all Layer 2 services (Parser, Type Inference, Constraint Validation)
 * Entry point for NL → AST compilation
 * 
 * Responsibilities:
 * 1. Orchestrate parser → type inference → validation pipeline
 * 2. Integrate with Layer 1 (Catalog) and Layer 3 (Optimizer)
 * 3. Collect and report all errors/warnings
 * 4. Cache parsed trees for reuse
 * 
 * @file src/compiler/frontend/frontend-orchestrator.service.ts
 */

import { Injectable, Inject } from '@nestjs/common';
import { Logger } from 'winston';
import { RedisCacheService } from '../../common/services/redis-cache.service';
import { NLParserService } from './services/nl-parser.service';
import { TypeInferencerService } from './services/type-inferencer.service';
import { ConstraintValidatorService } from './services/constraint-validator.service';
import { 
  SemanticTree, 
  ParseResult, 
  ParseError 
} from './interfaces/semantic-node.interface';

/**
 * Compilation result from Layer 2
 */
export interface CompilationResult {
  success: boolean;
  tree?: SemanticTree;
  errors: ParseError[];
  warnings: any[];
  metrics: {
    parseTime: number;
    typeCheckTime: number;
    validationTime: number;
    totalTime: number;
    operationCount: number;
    variableCount: number;
  };
}

@Injectable()
export class FrontendOrchestratorService {
  private readonly logger: Logger;
  private readonly CACHE_PREFIX = 'frontend:parsed:';
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    @Inject('LOGGER') logger: Logger,
    private readonly parser: NLParserService,
    private readonly typeInferencer: TypeInferencerService,
    private readonly constraintValidator: ConstraintValidatorService,
    private readonly cache: RedisCacheService,
  ) {
    this.logger = logger.child({ context: 'FrontendOrchestratorService' });
  }

  /**
   * Full compilation pipeline: NL → AST with all validations
   */
  async compile(input: string, workflowName = 'Untitled'): Promise<CompilationResult> {
    const startTime = performance.now();
    const metrics = {
      parseTime: 0,
      typeCheckTime: 0,
      validationTime: 0,
      totalTime: 0,
      operationCount: 0,
      variableCount: 0,
    };

    // Step 1: Check cache
    const cacheKey = this.generateCacheKey(input, workflowName);
    const cached = await this.cache.get<CompilationResult>(cacheKey);
    if (cached) {
      this.logger.info('Frontend compilation cache hit', {
        workflow: workflowName,
        cache_key: cacheKey,
      });
      return cached;
    }

    // Step 2: Parse NL → AST
    const parseStart = performance.now();
    const parseResult = await this.parser.parse(input, workflowName);
    metrics.parseTime = performance.now() - parseStart;

    if (!parseResult.success) {
      // Return early with parse errors
      const result: CompilationResult = {
        success: false,
        errors: parseResult.errors,
        warnings: parseResult.warnings,
        metrics: { ...metrics, totalTime: performance.now() - startTime },
      };

      await this.cache.set(cacheKey, result, this.CACHE_TTL);
      return result;
    }

    const tree = parseResult.tree!;
    metrics.operationCount = tree.operations.size;
    metrics.variableCount = tree.variables.size;

    const allErrors: ParseError[] = [];
    const allWarnings: any[] = parseResult.warnings;

    // Step 3: Type inference
    const typeStart = performance.now();
    try {
      const typeErrors = await this.typeInferencer.inferTypes(tree);
      allErrors.push(...typeErrors);
      metrics.typeCheckTime = performance.now() - typeStart;
    } catch (error) {
      this.logger.error('Type inference failed', {
        error: error instanceof Error ? error.message : String(error),
        workflow: workflowName,
      });

      allErrors.push({
        code: 'TYPE_INFERENCE_ERROR',
        message: `Type inference failed: ${error instanceof Error ? error.message : String(error)}`,
        lineNumber: 0,
      });
    }

    // Step 4: Constraint validation
    const validationStart = performance.now();
    try {
      const validationErrors = await this.constraintValidator.validate(tree);
      allErrors.push(...validationErrors);
      metrics.validationTime = performance.now() - validationStart;
    } catch (error) {
      this.logger.error('Constraint validation failed', {
        error: error instanceof Error ? error.message : String(error),
        workflow: workflowName,
      });

      allErrors.push({
        code: 'CONSTRAINT_VALIDATION_ERROR',
        message: `Constraint validation failed: ${error instanceof Error ? error.message : String(error)}`,
        lineNumber: 0,
      });
    }

    metrics.totalTime = performance.now() - startTime;

    // Step 5: Compile result
    const success = allErrors.length === 0;

    if (success) {
      this.logger.info('Frontend compilation successful', {
        workflow: workflowName,
        operations: metrics.operationCount,
        variables: metrics.variableCount,
        total_time: metrics.totalTime,
      });
    } else {
      this.logger.warn('Frontend compilation completed with errors', {
        workflow: workflowName,
        error_count: allErrors.length,
        total_time: metrics.totalTime,
      });
    }

    const result: CompilationResult = {
      success,
      tree: success ? tree : undefined,
      errors: allErrors,
      warnings: allWarnings,
      metrics,
    };

    // Cache result
    await this.cache.set(cacheKey, result, this.CACHE_TTL);

    return result;
  }

  /**
   * Parse NL without caching (useful for interactive compilation)
   */
  async parseInteractive(input: string, workflowName: string): Promise<CompilationResult> {
    const startTime = performance.now();
    const parseResult = await this.parser.parse(input, workflowName);

    if (!parseResult.success) {
      return {
        success: false,
        errors: parseResult.errors,
        warnings: parseResult.warnings,
        metrics: {
          parseTime: performance.now() - startTime,
          typeCheckTime: 0,
          validationTime: 0,
          totalTime: performance.now() - startTime,
          operationCount: 0,
          variableCount: 0,
        },
      };
    }

    return {
      success: true,
      tree: parseResult.tree,
      errors: [],
      warnings: parseResult.warnings,
      metrics: {
        parseTime: performance.now() - startTime,
        typeCheckTime: 0,
        validationTime: 0,
        totalTime: performance.now() - startTime,
        operationCount: parseResult.tree!.operations.size,
        variableCount: parseResult.tree!.variables.size,
      },
    };
  }

  /**
   * Clear compilation cache for a workflow
   */
  async clearCache(input?: string, workflowName?: string): Promise<void> {
    if (input && workflowName) {
      const cacheKey = this.generateCacheKey(input, workflowName);
      await this.cache.delete(cacheKey);
      this.logger.info('Cleared compilation cache', { cache_key: cacheKey });
    } else {
      // Clear all frontend cache entries
      await this.cache.deletePattern(`${this.CACHE_PREFIX}*`);
      this.logger.info('Cleared all frontend compilation cache');
    }
  }

  /**
   * Generate cache key from input and workflow name
   */
  private generateCacheKey(input: string, workflowName: string): string {
    const inputHash = this.simpleHash(input);
    const nameHash = this.simpleHash(workflowName);
    return `${this.CACHE_PREFIX}${nameHash}_${inputHash}`;
  }

  /**
   * Simple hash function for cache keys
   * Not cryptographic, just for distribution
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Get compilation statistics
   */
  async getStatistics(): Promise<{
    parserVersion: string;
    supportedVerbs: string[];
    maxWorkflowDuration: number;
  }> {
    return {
      parserVersion: '1.0.0',
      supportedVerbs: [
        'read', 'send', 'generate', 'analyze', 'extract', 
        'transform', 'fetch', 'create', 'delete', 'update', 'process'
      ],
      maxWorkflowDuration: 300000, // 5 minutes
    };
  }
}
