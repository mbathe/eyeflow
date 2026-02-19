/**
 * STAGE 7: Service Resolution
 * 
 * Input: LLMIntermediateRepresentation (from Layer 4 Stages 1-6)
 * Output: ResolvedIR (IR with dispatch metadata injected)
 * 
 * Responsibility:
 * - For each CALL_SERVICE in IR: lookup in services registry
 * - Verify service exists, version is available
 * - Validate signature (trusted?)
 * - Retrieve format and format_config
 * - Inject dispatch metadata into IR instructions
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import {
  LLMIntermediateRepresentation,
  ResolvedIR,
  IRInstruction,
  IROpcode,
  DispatchMetadata,
  ServiceManifest
} from '../interfaces/ir.interface';

/**
 * Service Registry Entity (TypeORM)
 * Represents services available for compilation
 */
export interface ServiceRegistryEntity {
  id: string;
  version: string;
  format: 'WASM' | 'NATIVE' | 'MCP' | 'DOCKER';
  manifest: ServiceManifest;
  formatConfig: Record<string, any>;
  publishedBy: string;
  trusted: boolean;
  createdAt: Date;
}

@Injectable()
export class ServiceResolutionService {
  private readonly logger = new Logger(ServiceResolutionService.name);

  // Simulated registry (in production, would be @InjectRepository)
  private serviceRegistry: Map<string, ServiceRegistryEntity> = new Map();

  constructor() {
    // Seed with test services
    this.initializeTestServices();
  }

  /**
   * Main entry point: resolve all service calls in the IR
   */
  async resolveServices(ir: LLMIntermediateRepresentation): Promise<ResolvedIR> {
    this.logger.log(`[Stage 7] Resolving services in IR (${ir.instructions.length} instructions)`);

    const resolvedServices: ResolvedIR['resolvedServices'] = [];
    const resolvedInstructions = ir.instructions.map(instr => ({ ...instr }));

    // Find all CALL_SERVICE instructions
    for (const instr of resolvedInstructions) {
      if (instr.opcode === IROpcode.CALL_SERVICE && instr.serviceId) {
        this.logger.debug(`Resolving service: ${instr.serviceId}@${instr.serviceVersion}`);

        // Lookup & validate
        const manifest = await this.resolveServiceCall(instr);

        // Inject dispatch metadata
        const dispatchMeta = this.buildDispatchMetadata(manifest);
        instr.dispatchMetadata = dispatchMeta;

        // Track resolution
        resolvedServices.push({
          serviceId: instr.serviceId!,
          version: instr.serviceVersion || 'latest',
          format: manifest.formatConfig.format || 'WASM',
          manifest,
          dispatchMetadata: dispatchMeta
        });
      }
    }

    if (resolvedServices.length === 0) {
      this.logger.warn(`[Stage 7] No services to resolve (OK if workflow is data-only)`);
    } else {
      this.logger.log(`[Stage 7] Resolved ${resolvedServices.length} services`);
    }

    // Return ResolvedIR with injected metadata
    return {
      ...ir,
      instructions: resolvedInstructions,
      resolvedServices
    } as ResolvedIR;
  }

  /**
   * Resolve a single CALL_SERVICE instruction
   */
  private async resolveServiceCall(instr: IRInstruction): Promise<ServiceManifest> {
    const { serviceId, serviceVersion } = instr;

    if (!serviceId) {
      throw new BadRequestException(`[Stage 7] Instruction ${instr.index}: CALL_SERVICE missing serviceId`);
    }

    // Lookup in registry
    const cacheKey = `${serviceId}@${serviceVersion || 'latest'}`;
    const registryEntry = this.serviceRegistry.get(cacheKey);

    if (!registryEntry) {
      throw new NotFoundException(
        `[Stage 7] Service not found: ${cacheKey}. Available services: ${Array.from(this.serviceRegistry.keys()).join(', ')}`
      );
    }

    // Validate
    if (!registryEntry.trusted) {
      this.logger.warn(`[Stage 7] Service ${cacheKey} is not trusted`);
    }

    this.logger.debug(`[Stage 7] Resolved ${cacheKey} (format: ${registryEntry.format}, trusted: ${registryEntry.trusted})`);

    return registryEntry.manifest;
  }

  /**
   * Build dispatch metadata from service manifest
   */
  private buildDispatchMetadata(manifest: ServiceManifest): DispatchMetadata {
    const config = manifest.formatConfig;

    return {
      format: config.format || 'WASM',
      
      wasmBinaryUrl: config.wasmBinaryUrl,
      wasmChecksum: config.wasmChecksum,
      wasmMemory: config.wasmMemory || 10,
      
      mcpServer: config.mcpServer,
      mcpMethod: config.mcpMethod,
      mcpVersion: config.mcpVersion,
      
      nativeBinaryUrl: config.nativeBinaryUrl,
      nativePlatform: config.nativePlatform,
      nativeChecksum: config.nativeChecksum,
      
      dockerImage: config.dockerImage,
      dockerVersion: config.dockerVersion,
      dockerEnv: config.dockerEnv,
      
      timeout: manifest.latencyMs * 3, // 3x latency estimate
      retryPolicy: {
        maxAttempts: 3,
        delayMs: 100
      }
    };
  }

  /**
   * Register a service in the in-memory registry (for testing)
   */
  registerService(entity: ServiceRegistryEntity): void {
    const key = `${entity.id}@${entity.version}`;
    this.serviceRegistry.set(key, entity);
    this.logger.log(`[Stage 7] Registered service: ${key} (format: ${entity.format})`);
  }

  /**
   * Initialize with test services
   */
  private initializeTestServices(): void {
    // WASM: Sentiment analyzer
    this.registerService({
      id: 'sentiment-analyzer',
      version: '2.1.0',
      format: 'WASM',
      trusted: true,
      publishedBy: 'eyeflow-team',
      createdAt: new Date(),
      manifest: {
        id: 'sentiment-analyzer',
        version: '2.1.0',
        name: 'Sentiment Analyzer',
        description: 'WASM-based sentiment analysis',
        inputs: { text: 'string' },
        outputs: { score: 'number', label: 'string' },
        latencyMs: 10,
        deterministic: true,
        sideEffects: [],
        trusted: true,
        formatConfig: {
          format: 'WASM',
          wasmBinaryUrl: 'https://cdn.example.com/sentiment-analyzer-2.1.0.wasm',
          wasmChecksum: 'sha256:abc123...',
          wasmMemory: 5
        }
      },
      formatConfig: {
        format: 'WASM',
        wasmBinaryUrl: 'https://cdn.example.com/sentiment-analyzer-2.1.0.wasm',
        wasmChecksum: 'sha256:abc123...',
        wasmMemory: 5
      }
    });

    // MCP: GitHub search
    this.registerService({
      id: 'github-search',
      version: '1.0.0',
      format: 'MCP',
      trusted: true,
      publishedBy: 'eyeflow-team',
      createdAt: new Date(),
      manifest: {
        id: 'github-search',
        version: '1.0.0',
        name: 'GitHub Search',
        description: 'Search GitHub repos via MCP',
        inputs: { query: 'string' },
        outputs: { results: 'array' },
        latencyMs: 500,
        deterministic: false,
        sideEffects: [],
        trusted: true,
        formatConfig: {
          format: 'MCP',
          mcpServer: 'ghcli',
          mcpMethod: 'search_repos'
        }
      },
      formatConfig: {
        format: 'MCP',
        mcpServer: 'ghcli',
        mcpMethod: 'search_repos'
      }
    });

    // NATIVE: Image processing
    this.registerService({
      id: 'image-processor',
      version: '1.5.0',
      format: 'NATIVE',
      trusted: true,
      publishedBy: 'eyeflow-team',
      createdAt: new Date(),
      manifest: {
        id: 'image-processor',
        version: '1.5.0',
        name: 'Image Processor',
        description: 'Native image processing (ffmpeg)',
        inputs: { image: 'buffer' },
        outputs: { output: 'buffer' },
        latencyMs: 50,
        deterministic: true,
        sideEffects: [],
        trusted: true,
        formatConfig: {
          format: 'NATIVE',
          nativeBinaryUrl: 'https://cdn.example.com/image-processor-1.5.0',
          nativePlatform: 'linux-x64',
          nativeChecksum: 'sha256:def456...'
        }
      },
      formatConfig: {
        format: 'NATIVE',
        nativeBinaryUrl: 'https://cdn.example.com/image-processor-1.5.0',
        nativePlatform: 'linux-x64',
        nativeChecksum: 'sha256:def456...'
      }
    });

    // DOCKER: Python ML
    this.registerService({
      id: 'ml-trainer',
      version: '3.0.0',
      format: 'DOCKER',
      trusted: true,
      publishedBy: 'data-team',
      createdAt: new Date(),
      manifest: {
        id: 'ml-trainer',
        version: '3.0.0',
        name: 'ML Trainer',
        description: 'Python ML training via Docker',
        inputs: { dataset: 'array', config: 'object' },
        outputs: { model: 'buffer', metrics: 'object' },
        latencyMs: 5000,
        deterministic: false,
        sideEffects: ['writes to /models'],
        trusted: true,
        formatConfig: {
          format: 'DOCKER',
          dockerImage: 'eyeflow/ml-trainer',
          dockerVersion: '3.0.0'
        }
      },
      formatConfig: {
        format: 'DOCKER',
        dockerImage: 'eyeflow/ml-trainer',
        dockerVersion: '3.0.0'
      }
    });

    this.logger.log(`[Stage 7] Initialized with ${this.serviceRegistry.size} test services`);
  }
}
