/**
 * LLM-IR (Large Language Model Intermediate Representation)
 * Layer 4 core interfaces - deterministic bytecode for SVM execution
 */

import { OptimizationPlan } from '../../optimizer/interfaces/optimizer.interface';
import { SemanticTree } from '../../frontend/interfaces/semantic-node.interface';

/**
 * Opcodes for atomic IR instructions
 */
export enum IROpcode {
  // Resource operations
  LOAD_RESOURCE = 'LOAD_RESOURCE',
  UNLOAD_RESOURCE = 'UNLOAD_RESOURCE',

  // Data operations
  READ = 'READ',
  WRITE = 'WRITE',
  TRANSFORM = 'TRANSFORM',

  // Control flow
  BRANCH = 'BRANCH',
  LOOP = 'LOOP',
  PARALLEL_SPAWN = 'PARALLEL_SPAWN',
  PARALLEL_WAIT = 'PARALLEL_WAIT',
  PARALLEL_BARRIER = 'PARALLEL_BARRIER',

  // Function/API calls
  CALL_FUNCTION = 'CALL_FUNCTION',
  CALL_API = 'CALL_API',
  CALL_ACTION = 'CALL_ACTION',

  // Validation
  VALIDATE = 'VALIDATE',
  COERCE = 'COERCE',

  // Control
  NOP = 'NOP',
  RETURN = 'RETURN',
  THROW = 'THROW',
}

/**
 * Register operand types
 */
export interface Register {
  id: string; // r0, r1, r2, ..., r255
  type: 'int' | 'float' | 'string' | 'buffer' | 'object' | 'any';
  value?: unknown;
}

/**
 * Operand in IR instruction (register, constant, or reference)
 */
export type Operand = Register | string | number | boolean | null;

/**
 * Single atomic IR instruction
 */
export interface IRInstruction {
  id: string; // instr_0, instr_1, ...
  opcode: IROpcode;
  operands: Operand[];
  resultRegisters?: Register[]; // Where to store results

  // Execution metadata
  dependencies: string[]; // Instruction IDs this depends on
  metadata?: {
    parallelizable: boolean;
    criticality: 'HIGH' | 'MEDIUM' | 'LOW';
    timeoutMs?: number;
    retryCount?: number;
    fallbackInstructionId?: string; // If fails, jump to this
  };

  // Documentation
  comment?: string;
  sourceLineNumber?: number;
}

/**
 * Resource handle (opened resource during pre-compilation)
 */
export interface ResourceHandle {
  id: string; // res_0, res_1, ...
  type: 'DATABASE' | 'API_CLIENT' | 'FILE_SYSTEM' | 'CACHE' | 'MESSAGE_QUEUE';
  resourceId: string; // From Capability Catalog
  initialized: boolean;
  metadata?: Record<string, unknown>;
  permissions: PermissionFlags;
}

/**
 * Memory segment (stack, heap, cache)
 */
export interface MemorySegment {
  name: string;
  baseAddress: number;
  sizeBytes: number;
  purpose: 'STACK' | 'HEAP' | 'RESOURCE_CACHE' | 'SCHEMA_CACHE';
}

/**
 * Parallelization group for parallel execution
 */
export interface ParallelGroup {
  id: string;
  name: string;
  instructions: string[]; // Instruction IDs that can run in parallel
  workerCount: number;
  synchronizationPoint: string; // Instruction ID for BARRIER
  amdahlEstimate: number; // Estimated speedup factor
}

/**
 * Dependency graph (DAG) for instruction ordering
 */
export interface DependencyGraph {
  nodes: Map<string, IRInstruction>; // Instruction ID → Instruction
  edges: Map<string, string[]>; // From → [To] dependencies
}

/**
 * Schema validator for input/output validation
 */
export interface SchemaValidator {
  id: string;
  name: string;
  schema: Record<string, unknown>; // JSON Schema
  validatorFunction?: string; // Serialized function
  errorHandling: 'THROW' | 'COERCE' | 'SKIP';
}

/**
 * Constraint check (runtime safety)
 */
export interface Constraint {
  id: string;
  type: 'MEMORY_LIMIT' | 'TIME_LIMIT' | 'LOOP_LIMIT' | 'PARALLELISM_LIMIT';
  value: number;
  description: string;
}

/**
 * Permission flags for security
 */
export interface PermissionFlags {
  READ: boolean;
  WRITE: boolean;
  EXECUTE: boolean;
  DELETE: boolean;
  ADMIN: boolean;
}

/**
 * Fallback strategy for edge cases
 */
export interface FallbackPlan {
  id: string;
  triggerCondition: string; // When to use this fallback
  instructions: IRInstruction[]; // Alternative instructions
  priority: number; // Higher = try first
}

/**
 * Metadata for RAG/context retrieval
 */
export interface SemanticsData {
  embeddings: {
    [nodeId: string]: number[]; // 768-dim vectors
  };
  contexts: {
    [nodeId: string]: string; // Semantic description
  };
  relationships: {
    [fromId: string]: string[]; // Related node IDs
  };
}

/**
 * Performance estimates
 */
export interface PerformanceEstimates {
  estimatedLatencyMs: number;
  estimatedMemoryBytes: number;
  estimatedCpuCycles: number;
  parallelizationFactor: number;
  confidenceLevel: number; // 0-100
}

/**
 * Main LLM-IR: Intermediate Representation
 */
export interface LLMIntermediateRepresentation {
  // Metadata
  id: string;
  workflowId: string;
  version: string;
  compiledAt: Date;
  checksum: string; // SHA256 for integrity
  compilationTimeMs: number;

  // Core program
  instructions: IRInstruction[];
  resourceTable: ResourceHandle[];
  memoryLayout: MemorySegment[];

  // Execution planning
  parallelizationGroups: ParallelGroup[];
  dependencyGraph: DependencyGraph;
  instructionOrder: string[]; // Topologically sorted instruction IDs

  // Validation & Safety
  schemas: SchemaValidator[];
  constraintChecks: Constraint[];
  permissionMask: PermissionFlags;

  // Performance
  performance: PerformanceEstimates;

  // Context for RAG
  semanticContext: SemanticsData;
  fallbackStrategies: FallbackPlan[];

  // Audit trail
  sourceSemanticTree: Partial<SemanticTree>; // For debugging
  optimizationPlan: Partial<OptimizationPlan>; // For debugging
}

/**
 * IR Generation result
 */
export interface IRGenerationResult {
  success: boolean;
  ir: LLMIntermediateRepresentation;
  errors: string[];
  warnings: string[];
  metrics: {
    instructionCount: number;
    resourceCount: number;
    parallelGroups: number;
    estimatedParallelism: number;
  };
}

/**
 * Interface for IR services
 */
export interface IIRService {
  name: string;
  transform(ir: LLMIntermediateRepresentation): Promise<LLMIntermediateRepresentation>;
}

/**
 * Constant folding result
 */
export interface ConstantFoldingResult {
  instructions: IRInstruction[];
  foldedCount: number;
  savedInstructions: number;
  errors: string[];
}

/**
 * Resource reification result
 */
export interface ResourceReificationResult {
  resourceTable: ResourceHandle[];
  resourceInstructions: IRInstruction[];
  loadOrder: string[];
  errors: string[];
}

/**
 * Validation injection result
 */
export interface ValidationInjectionResult {
  validators: SchemaValidator[];
  validationInstructions: IRInstruction[];
  injectionPoints: string[]; // Where validations are injected
  errors: string[];
}

/**
 * Parallelization codegen result
 */
export interface ParallelizationCodeGenResult {
  parallelGroups: ParallelGroup[];
  parallelInstructions: IRInstruction[];
  barrierInstructions: IRInstruction[];
  estimatedSpeedup: number;
  errors: string[];
}

/**
 * Semantic context binding result
 */
export interface SemanticContextBindingResult {
  semanticContext: SemanticsData;
  contextInstructions: IRInstruction[];
  errors: string[];
}

/**
 * IR optimization result
 */
export interface IROptimizationResult {
  optimizedInstructions: IRInstruction[];
  dependencyGraph: DependencyGraph;
  instructionOrder: string[];
  optimizationsApplied: {
    deadCodeElimination: number;
    commonSubexpressionElimination: number;
    loopInvariantCodeMotion: number;
  };
  errors: string[];
}
