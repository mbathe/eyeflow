/**
 * Layer 3: Optimizer Interfaces
 * Defines all types and data structures for optimization pipeline
 */

import { SemanticTree } from '../../frontend/interfaces/semantic-node.interface';

/**
 * Error information for optimizer results
 */
export interface OptimizationError {
  message: string;
  code: string;
  context?: string;
}

/**
 * Data Classification enum
 * Categorizes variables by their computation timing
 */
export type DataClassification = 'CONSTANT' | 'COMPILE_TIME_COMPUTED' | 'RUNTIME_DYNAMIC';

/**
 * Classified Variable with optimization metadata
 */
export interface ClassifiedVariable {
  name: string;
  type: string;
  classification: DataClassification;
  sourceOperation?: string;
  dependsOn?: string[];
  estimatedSize?: number;
  isCacheable: boolean;
  ttlSeconds?: number;
}

/**
 * Resource binding information
 */
export interface ResourceBinding {
  resourceId: string;
  resourceType: 'EXCEL' | 'DATABASE' | 'API' | 'FILE' | 'CACHE' | 'VECTOR_STORE';
  resourcePath: string;
  preloadRequired: boolean;
  vectorized: boolean;
  vectorDimensions?: number;
  estimatedSize: number;
  cacheTTL?: number;
  metadata?: Record<string, any>;
}

/**
 * JSON Schema for type validation
 */
export interface SchemaDefinition {
  operationId: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  validator?: (value: any) => boolean;
  transformers?: ((value: any) => any)[];
}

/**
 * Parallelization opportunity
 */
export interface ParallelizationOpportunity {
  operationIds: string[];
  type: 'INDEPENDENT_OPERATIONS' | 'CONDITIONAL_BRANCHES' | 'LOOP_ITERATIONS';
  parallelizationFactor: number;
  estimatedSpeedup: number;
  resourceRequirements: {
    cpuCores: number;
    memoryMb: number;
    concurrentCount: number;
  };
}

/**
 * LLM Context for vector search
 */
export interface LLMContext {
  contextId: string;
  workflowName: string;
  operationDescription: string;
  keywordEmbeddings: number[][];
  semanticEmbeddings: number[][];
  relevanceScores: number[];
  metadata: Record<string, any>;
}

/**
 * Optimization Plan Result
 */
export interface OptimizationPlan {
  success: boolean;
  workflowId: string;
  classificationsMap: Map<string, ClassifiedVariable>;
  resourceBindings: ResourceBinding[];
  schemas: SchemaDefinition[];
  parallelizationOpportunities: ParallelizationOpportunity[];
  llmContexts: LLMContext[];
  optimizations: {
    estimatedSpeedup: number;
    estimatedMemorySavings: number;
    estimatedCachingBenefit: number;
    parallelizationFactor: number;
  };
  errors: string[];
  metrics: {
    classificationTime: number;
    bindingTime: number;
    schemaTime: number;
    parallelizationTime: number;
    llmContextTime: number;
    totalTime: number;
    variablesClassified: number;
    resourcesBound: number;
    schemasGenerated: number;
  };
}

/**
 * Optimizer Service Interface
 */
export interface IOptimizerService {
  optimize(tree: SemanticTree, workflowId: string): Promise<OptimizationPlan>;
  classifyVariables(tree: SemanticTree): Promise<Map<string, ClassifiedVariable>>;
  bindResources(tree: SemanticTree): Promise<ResourceBinding[]>;
  precomputeSchemas(tree: SemanticTree): Promise<SchemaDefinition[]>;
  detectParallelization(tree: SemanticTree): Promise<ParallelizationOpportunity[]>;
  optimizeLLMContext(tree: SemanticTree): Promise<LLMContext[]>;
}

/**
 * Data Classifier Result
 */
export interface DataClassifierResult {
  variables: Map<string, ClassifiedVariable>;
  classificationStats: {
    constantCount: number;
    compileTimeCount: number;
    runtimeDynamicCount: number;
  };
  errors: string[];
}

/**
 * Resource Binding Result
 */
export interface ResourceBindingResult {
  bindings: ResourceBinding[];
  preloadPlan: {
    sequentialResources: string[];
    parallelResources: string[][];
  };
  estimatedPreloadTime: number;
  errors: string[];
}

/**
 * Schema Pre-computation Result
 */
export interface SchemaPrecomputationResult {
  schemas: SchemaDefinition[];
  validatorCount: number;
  transformerCount: number;
  estimatedValidationOverhead: number;
  errors: string[];
}

/**
 * Parallelization Detection Result
 */
export interface ParallelizationDetectionResult {
  opportunities: ParallelizationOpportunity[];
  totalParallelizablePairs: number;
  estimatedSpeedup: number;
  bottlenecks: string[];
  criticalPath: string[];
  errors: string[];
}

/**
 * LLM Context Optimization Result
 */
export interface LLMContextOptimizationResult {
  contexts: LLMContext[];
  totalEmbeddings: number;
  embeddingDimensions: number;
  vectorStoreSize: number;
  contextQuality: number;
  errors: string[];
}
