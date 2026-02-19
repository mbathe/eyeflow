/**
 * Intermediate Representation (IR) Interfaces
 * Output from Layer 4 IR Generator (Stages 1-6)
 * Input to Stage 7 (ServiceResolution) and Stage 8 (ServicePreloader)
 */

export enum IROpcode {
  // Memory operations
  LOAD_RESOURCE = 'LOAD_RESOURCE',
  STORE_MEMORY = 'STORE_MEMORY',

  // Validation
  VALIDATE = 'VALIDATE',

  // Control flow
  BRANCH = 'BRANCH',
  LOOP = 'LOOP',
  JUMP = 'JUMP',

  // Service calls (Stages 1-6 generate these without dispatch info)
  CALL_SERVICE = 'CALL_SERVICE',
  CALL_ACTION = 'CALL_ACTION',
  CALL_MCP = 'CALL_MCP',

  // Data operations
  TRANSFORM = 'TRANSFORM',
  AGGREGATE = 'AGGREGATE',
  FILTER = 'FILTER',

  // Parallelization
  PARALLEL_SPAWN = 'PARALLEL_SPAWN',
  PARALLEL_MERGE = 'PARALLEL_MERGE',

  // Return
  RETURN = 'RETURN',
}

export enum RegisterType {
  INT = 'INT',
  FLOAT = 'FLOAT',
  STRING = 'STRING',
  BUFFER = 'BUFFER',
  OBJECT = 'OBJECT',
  ANY = 'ANY',
}

export interface TypedValue {
  type: RegisterType;
  value: any;
}

/**
 * A single instruction in the IR bytecode
 */
export interface IRInstruction {
  index: number;
  opcode: IROpcode;
  
  // Register destinations
  dest?: number; // r0-r255
  src?: number[];
  
  // Operands
  operands?: Record<string, any>;
  
  // Service-specific (filled by Stage 7)
  serviceId?: string;
  serviceVersion?: string;
  dispatchMetadata?: DispatchMetadata;
  
  // Control flow
  targetInstruction?: number;
  
  // Parallel info
  parallelGroupId?: number;
}

/**
 * Dispatch metadata injected by Stage 7
 * Contains format-specific information for calling the service
 */
export interface DispatchMetadata {
  format: 'WASM' | 'NATIVE' | 'MCP' | 'DOCKER';
  
  // WASM
  wasmBinaryUrl?: string;
  wasmChecksum?: string;
  wasmMemory?: number; // MB
  
  // MCP
  mcpServer?: string;
  mcpMethod?: string;
  mcpVersion?: string;
  
  // NATIVE
  nativeBinaryUrl?: string;
  nativePlatform?: string;
  nativeChecksum?: string;
  
  // DOCKER
  dockerImage?: string;
  dockerVersion?: string;
  dockerEnv?: Record<string, string>;
  
  // Common
  timeout: number; // milliseconds
  retryPolicy?: {
    maxAttempts: number;
    delayMs: number;
  };
}

/**
 * Resource pre-allocated or cached
 */
export interface ResourceEntry {
  handleId: number;
  type: 'connection' | 'model' | 'cache' | 'schema';
  metadata?: Record<string, any>;
  value?: any; // Pre-loaded value (e.g., ONNX model)
}

/**
 * Schema for input/output validation
 */
export interface SchemaValidator {
  id: number;
  name: string;
  jsonSchema: Record<string, any>;
  validator: (value: any) => boolean;
}

/**
 * Information about parallel execution
 */
export interface ParallelGroup {
  id: number;
  instructionIndices: number[];
  workerCount: number;
  amdahlSpeedup: number;
  mergePointInstruction: number;
}

/**
 * Semantic context with embeddings and relationships
 */
export interface SemanticsData {
  embeddings: number[][];
  relationships: Array<{
    from: string;
    to: string;
    type: 'input' | 'output' | 'dependency';
  }>;
  fallbackStrategies: Array<{
    serviceId: string;
    priority: number;
    alternative: string;
  }>;
}

/**
 * Main IR output from Layer 4
 * Input to Stage 7 and Stage 8
 */
export interface LLMIntermediateRepresentation {
  // Core bytecode
  instructions: IRInstruction[];
  
  // Execution order (topologically sorted)
  instructionOrder: number[];
  
  // Dependency graph
  dependencyGraph: Map<number, number[]>;
  
  // Pre-allocated resources
  resourceTable: ResourceEntry[];
  
  // Parallel execution groups
  parallelizationGroups: ParallelGroup[];
  
  // Schemas for validation
  schemas: SchemaValidator[];
  
  // Semantic context (embeddings)
  semanticContext: SemanticsData;
  
  // I/O mapping
  inputRegister: number;
  outputRegister: number;
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
  
  // Metadata
  metadata: {
    compiledAt: Date;
    compilerVersion: string;
    source: string; // original intent
  };
}

/**
 * Resolved IR after Stage 7
 * All services have been looked up and dispatch metadata injected
 */
export interface ResolvedIR extends LLMIntermediateRepresentation {
  resolvedServices: Array<{
    serviceId: string;
    version: string;
    format: 'WASM' | 'NATIVE' | 'MCP' | 'DOCKER';
    manifest: ServiceManifest;
    dispatchMetadata: DispatchMetadata;
  }>;
}

/**
 * Service manifest (stored in DB, returned by Stage 7 lookup)
 */
export interface ServiceManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  
  // Interfaces
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  
  // Performance & cost
  latencyMs: number;
  costPerCall?: number;
  
  // Contract
  deterministic: boolean;
  sideEffects: string[];
  
  // Verification
  trusted: boolean;
  signature?: string;
  
  // Format-specific config
  formatConfig: Record<string, any>;
}
