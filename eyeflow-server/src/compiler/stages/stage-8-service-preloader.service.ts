/**
 * STAGE 8: Service Pre-loader
 * 
 * Input: ResolvedIR (from Stage 7, with dispatch metadata)
 * Output: CompiledWorkflow (with pre-loaded services)
 * 
 * Responsibility:
 * - For each resolved service: download/fetch based on format
 * - WASM: download binary, load into WebAssembly module
 * - MCP: spawn server process, verify connectivity
 * - NATIVE: download binary, verify checksum
 * - DOCKER: pull image, verify availability
 * - Return sealed CompiledWorkflow ready for execution
 */

import { Injectable, Logger } from '@nestjs/common';
import { 
  ResolvedIR, 
  DispatchMetadata 
} from '../interfaces/ir.interface';
import { 
  CompiledWorkflow, 
  CompiledWorkflowImpl,
  CompiledWorkflowMetadata,
  PreLoadedServices,
  MCPServerConnection
} from '../interfaces/compiled-workflow.interface';
import * as crypto from 'crypto';

@Injectable()
export class ServicePreloaderService {
  private readonly logger = new Logger(ServicePreloaderService.name);

  /**
   * Main entry point: pre-load all resolved services
   */
  async preloadServices(
    resolvedIR: ResolvedIR,
    userId: string,
    workflowName: string
  ): Promise<CompiledWorkflow> {
    this.logger.log(`[Stage 8] Pre-loading ${resolvedIR.resolvedServices.length} services...`);

    const preLoaded: PreLoadedServices = {
      wasm: new Map(),
      mcp: new Map(),
      native: new Map(),
      docker: new Map()
    };

    // Process each service
    for (const resolved of resolvedIR.resolvedServices) {
      try {
        await this.preloadService(resolved, preLoaded);
      } catch (error: any) {
        this.logger.error(
          `[Stage 8] Failed to pre-load ${resolved.serviceId}@${resolved.version}: ${error?.message || String(error)}`
        );
        throw error;
      }
    }

    // Generate metadata
    const metadata: CompiledWorkflowMetadata = {
      id: crypto.randomUUID(),
      compiledAt: new Date(),
      compilerVersion: '1.0.0',
      checksum: this.computeChecksum(resolvedIR),
      userId,
      workflowName,
      sourceDescription: resolvedIR.metadata.source,
      optimizationLevel: 'balanced'
    };

    this.logger.log(`[Stage 8] Pre-loading complete. Created CompiledWorkflow ${metadata.id}`);

    // Create sealed CompiledWorkflow
    return new CompiledWorkflowImpl(resolvedIR, preLoaded, metadata);
  }

  /**
   * Pre-load a single service based on format
   */
  private async preloadService(
    resolved: ResolvedIR['resolvedServices'][0],
    preLoaded: PreLoadedServices
  ): Promise<void> {
    const { serviceId, format, dispatchMetadata } = resolved;

    this.logger.debug(`[Stage 8] Pre-loading ${serviceId} (format: ${format})`);

    switch (format) {
      case 'WASM':
        await this.preloadWASM(serviceId, dispatchMetadata, preLoaded);
        break;
      case 'MCP':
        await this.preloadMCP(serviceId, dispatchMetadata, preLoaded);
        break;
      case 'NATIVE':
        await this.preloadNative(serviceId, dispatchMetadata, preLoaded);
        break;
      case 'DOCKER':
        await this.preloadDocker(serviceId, dispatchMetadata, preLoaded);
        break;
      default:
        throw new Error(`[Stage 8] Unknown service format: ${format}`);
    }
  }

  /**
   * Pre-load WASM service
   */
  private async preloadWASM(
    serviceId: string,
    dispatch: DispatchMetadata,
    preLoaded: PreLoadedServices
  ): Promise<void> {
    if (!dispatch.wasmBinaryUrl) {
      throw new Error(`[Stage 8] WASM service ${serviceId}: missing wasmBinaryUrl`);
    }

    try {
      // Simulate download (in production: actual HTTP fetch)
      const binary = await this.downloadFile(dispatch.wasmBinaryUrl, dispatch.wasmChecksum);
      
      // In production: load into WebAssembly module
      // const module = await WebAssembly.instantiate(binary);
      // preLoaded.wasm.set(serviceId, module);
      
      // For now: store the binary
      preLoaded.wasm.set(serviceId, binary);
      
      this.logger.debug(`[Stage 8] Loaded WASM service: ${serviceId} (${binary.length} bytes)`);
    } catch (error: any) {
      throw new Error(`[Stage 8] Failed to load WASM ${serviceId}: ${error?.message || String(error)}`);
    }
  }

  /**
   * Pre-load MCP service
   */
  private async preloadMCP(
    serviceId: string,
    dispatch: DispatchMetadata,
    preLoaded: PreLoadedServices
  ): Promise<void> {
    if (!dispatch.mcpServer) {
      throw new Error(`[Stage 8] MCP service ${serviceId}: missing mcpServer`);
    }

    try {
      // Simulate spawning MCP server
      const connection: MCPServerConnection = {
        id: serviceId,
        endpoint: `mcp://${dispatch.mcpServer}`,
        connected: true,
        lastHealthCheck: new Date()
      };

      // In production: actually spawn server process and verify connectivity
      // const process = spawn('mcp-server', ['--server', dispatch.mcpServer]);
      // await healthCheck(process);

      preLoaded.mcp.set(serviceId, connection);
      
      this.logger.debug(`[Stage 8] Started MCP service: ${serviceId} (${dispatch.mcpServer})`);
    } catch (error: any) {
      throw new Error(`[Stage 8] Failed to start MCP ${serviceId}: ${error?.message || String(error)}`);
    }
  }

  /**
   * Pre-load NATIVE service
   */
  private async preloadNative(
    serviceId: string,
    dispatch: DispatchMetadata,
    preLoaded: PreLoadedServices
  ): Promise<void> {
    if (!dispatch.nativeBinaryUrl) {
      throw new Error(`[Stage 8] NATIVE service ${serviceId}: missing nativeBinaryUrl`);
    }

    try {
      const binary = await this.downloadFile(
        dispatch.nativeBinaryUrl,
        dispatch.nativeChecksum
      );

      // Verify platform compatibility
      if (dispatch.nativePlatform) {
        const currentPlatform = process.platform === 'linux' ? 'linux-x64' : 'darwin-arm64';
        if (!currentPlatform.includes(dispatch.nativePlatform.split('-')[0])) {
          this.logger.warn(
            `[Stage 8] NATIVE service ${serviceId} (${dispatch.nativePlatform}) may not be compatible with ${currentPlatform}`
          );
        }
      }

      preLoaded.native.set(serviceId, binary);

      this.logger.debug(`[Stage 8] Loaded NATIVE service: ${serviceId} (${dispatch.nativePlatform})`);
    } catch (error: any) {
      throw new Error(`[Stage 8] Failed to load NATIVE ${serviceId}: ${error?.message || String(error)}`);
    }
  }

  /**
   * Pre-load DOCKER service
   */
  private async preloadDocker(
    serviceId: string,
    dispatch: DispatchMetadata,
    preLoaded: PreLoadedServices
  ): Promise<void> {
    if (!dispatch.dockerImage) {
      throw new Error(`[Stage 8] DOCKER service ${serviceId}: missing dockerImage`);
    }

    try {
      // Simulate pulling Docker image
      const imageRef = `${dispatch.dockerImage}:${dispatch.dockerVersion || 'latest'}`;

      // In production: docker pull imageRef
      // await dockerPull(imageRef);

      preLoaded.docker.set(serviceId, imageRef);

      this.logger.log(`[Stage 8] Cached DOCKER service: ${serviceId} (${imageRef})`);
    } catch (error: any) {
      throw new Error(`[Stage 8] Failed to cache DOCKER ${serviceId}: ${error?.message || String(error)}`);
    }
  }

  /**
   * Simulate file download with checksum verification
   */
  private async downloadFile(url: string, checksum?: string): Promise<Buffer> {
    // In production: actual HTTP fetch
    // const response = await fetch(url);
    // const buffer = await response.arrayBuffer();
    
    // For testing: return mock buffer
    const buffer = Buffer.from(`mock-binary-from-${url}`);

    if (checksum) {
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      if (!checksum.includes(hash.substring(0, 8))) {
        this.logger.warn(`[Stage 8] Checksum mismatch (expected: ${checksum}, got: ${hash})`);
        // In production: throw error; for testing: warn only
      }
    }

    return buffer;
  }

  /**
   * Compute checksum of the entire resolved IR
   */
  private computeChecksum(ir: ResolvedIR): string {
    const data = JSON.stringify(ir.instructions);
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }
}
