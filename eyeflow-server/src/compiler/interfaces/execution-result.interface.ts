/**
 * Execution Result Interface
 * 
 * Represents the output from Semantic Virtual Machine execution
 * with full metadata and provenance information.
 * 
 * @file src/compiler/interfaces/execution-result.interface.ts
 */

/**
 * Service usage information
 */
export interface ServiceUsageInfo {
  name: string;
  format: 'WASM' | 'MCP' | 'Docker' | 'Native' | 'HTTP';
  version: string;
  executionTime?: number;
  inputSize?: number;
  outputSize?: number;
}

/**
 * Execution output data
 */
export interface ExecutionOutput {
  status: 'success' | 'error' | 'partial' | 'timeout';
  data?: any;
  error?: {
    code: string;
    message: string;
    context?: any;
  };
  timestamp: Date;
}

/**
 * Execution metadata
 */
export interface ExecutionMetadataInfo {
  executionTime: number; // milliseconds
  servicesUsed: ServiceUsageInfo[];
  bytecodeSize: number;
  tasksExecuted?: number;
  parallelizationLevel?: number;
  resourcesAllocated?: {
    cpuCores?: number;
    memoryMb?: number;
  };
}

/**
 * Complete execution result from VM
 */
export interface ExecutionResult {
  id: string; // Unique execution ID
  workflowId: string; // Compiled workflow ID
  missionId?: string; // Original mission ID for traceability
  output: ExecutionOutput;
  metadata: ExecutionMetadataInfo;
  proof?: {
    // Optional detailed proof/provenance
    serviceCallOrder?: string[];
    inputOutput?: Array<{ service: string; input: any; output: any }>;
    gasUsed?: number; // For resource tracking
  };
}
