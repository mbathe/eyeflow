/**
 * CompiledWorkflow: Output of Stage 8 (ServicePreloader)
 * This is the sealed, ready-to-execute artifact
 * 
 * Can be serialized, stored, distributed, executed offline
 */

import { LLMIntermediateRepresentation } from './ir.interface';

export type WASMInstance = any; // WebAssembly.Instance or buffer

export interface PreLoadedServices {
  wasm: Map<string, WASMInstance>;
  mcp: Map<string, MCPServerConnection>;
  native: Map<string, Buffer>;
  docker: Map<string, string>; // image refs
}

export interface MCPServerConnection {
  id: string;
  processId?: number;
  endpoint?: string;
  connected: boolean;
  lastHealthCheck?: Date;
}

export interface CompiledWorkflowMetadata {
  id: string;
  compiledAt: Date;
  compilerVersion: string;
  checksum: string;
  userId: string;
  workflowName: string;
  
  // For versioning & caching
  cacheKey?: string;
  ttl?: number; // seconds
  
  // Audit
  sourceDescription?: string;
  optimizationLevel?: 'fast' | 'balanced' | 'aggressive';
}

export interface CompiledWorkflow {
  // The bytecode from Layer 4
  ir: LLMIntermediateRepresentation;
  
  // Pre-loaded services (from Stage 8)
  preLoadedServices: PreLoadedServices;
  
  // Metadata
  metadata: CompiledWorkflowMetadata;
  
  // Health check
  isHealthy(): boolean;
}

/**
 * In-memory implementation of CompiledWorkflow
 */
export class CompiledWorkflowImpl implements CompiledWorkflow {
  constructor(
    public ir: LLMIntermediateRepresentation,
    public preLoadedServices: PreLoadedServices,
    public metadata: CompiledWorkflowMetadata
  ) {}

  isHealthy(): boolean {
    // Check that all pre-loaded services are accessible
    // - WASM: binaries loaded
    // - MCP: servers responding
    // - NATIVE: binaries present
    // - DOCKER: images available locally
    
    if (this.preLoadedServices.wasm.size === 0 &&
        this.preLoadedServices.mcp.size === 0 &&
        this.preLoadedServices.native.size === 0 &&
        this.preLoadedServices.docker.size === 0) {
      return true; // No services = still healthy
    }
    
    // TODO: Check health of each service type
    return true;
  }

  serialize(): Buffer {
    // Serialize IR, metadata, and references to pre-loaded services
    // WASM/NATIVE: store binary references
    // MCP: store server endpoints
    // DOCKER: store image names
    const data = {
      ir: this.ir,
      metadata: this.metadata,
      services: {
        wasm: Array.from(this.preLoadedServices.wasm.keys()),
        mcp: Array.from(this.preLoadedServices.mcp.keys()),
        native: Array.from(this.preLoadedServices.native.keys()),
        docker: Array.from(this.preLoadedServices.docker.entries()),
      }
    };
    return Buffer.from(JSON.stringify(data));
  }
}
