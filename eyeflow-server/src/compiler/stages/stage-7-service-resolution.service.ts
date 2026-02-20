/**
 * STAGE 7: Service Resolution (v2)
 *
 * Input:  LLMIntermediateRepresentation (from Stages 1-6)
 * Output: ResolvedIR (IR with full EnrichedDispatchMetadata injected per CALL_SERVICE)
 *
 * What this stage does
 * --------------------
 *  1. For every CALL_SERVICE / CALL_MCP instruction:
 *     a. Look up the service in the ServiceRegistry (user-defined + built-ins)
 *     b. Determine the target node tier (from reqiuredTier or default CENTRAL)
 *     c. Select the FIRST ExecutionDescriptor compatible with the target tier
 *     d. Inject a fully-populated EnrichedDispatchMetadata into the instruction
 *
 *  2. Validate: fail fast at compile time if any service cannot be resolved.
 *
 * Guarantees
 * ----------
 *  - Zero LLM calls (pure deterministic lookup)
 *  - Compile-time failure if a service has no compatible descriptor for the target tier
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  LLMIntermediateRepresentation,
  ResolvedIR,
  IRInstruction,
  IROpcode,
  EnrichedDispatchMetadata,
  PowerfulServiceManifest,
} from '../interfaces/ir.interface';
import {
  ExecutionDescriptor,
  NativeExecutionDescriptor,
  WasmExecutionDescriptor,
  NodeTier,
} from '../interfaces/service-manifest.interface';
import { ServiceRegistryService } from '../service-registry.service';

@Injectable()
export class ServiceResolutionService {
  private readonly logger = new Logger(ServiceResolutionService.name);

  constructor(private readonly registry: ServiceRegistryService) {}

  // ---------------------------------------------------------------------------
  // Entry point
  // ---------------------------------------------------------------------------

  async resolveServices(ir: LLMIntermediateRepresentation): Promise<ResolvedIR> {
    this.logger.log(`[Stage 7] Resolving services (${ir.instructions.length} instructions)`);

    const resolvedServices: ResolvedIR['resolvedServices'] = [];
    const resolvedInstructions = ir.instructions.map(instr => ({ ...instr }));
    const errors: string[] = [];

    for (const instr of resolvedInstructions) {
      if (
        instr.opcode === IROpcode.CALL_SERVICE ||
        instr.opcode === IROpcode.CALL_MCP
      ) {
        try {
          const meta = this._resolveInstruction(instr);
          instr.dispatchMetadata = meta;

          resolvedServices.push({
            serviceId: instr.serviceId!,
            version: instr.serviceVersion || 'latest',
            format: meta.format,
            manifest: this.registry.findByIdAndVersion(instr.serviceId!, instr.serviceVersion),
            dispatchMetadata: meta,
          });

          this.logger.debug(
            `[Stage 7] OK ${instr.serviceId}@${instr.serviceVersion || 'latest'} -> format=${meta.format}, tier=${meta.targetTier}`,
          );
        } catch (err: any) {
          errors.push(`Instruction #${instr.index} (${instr.serviceId}): ${err.message}`);
          this.logger.error(`[Stage 7] FAIL ${err.message}`);
        }
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(
        `[Stage 7] Compilation failed - ${errors.length} service(s) could not be resolved:\n` +
        errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n'),
      );
    }

    if (resolvedServices.length === 0) {
      this.logger.warn('[Stage 7] No services to resolve (data-only workflow)');
    } else {
      this.logger.log(`[Stage 7] Resolved ${resolvedServices.length} service call(s)`);
    }

    return { ...ir, instructions: resolvedInstructions, resolvedServices } as ResolvedIR;
  }

  // ---------------------------------------------------------------------------
  // Core resolution logic
  // ---------------------------------------------------------------------------

  private _resolveInstruction(instr: IRInstruction): EnrichedDispatchMetadata {
    if (!instr.serviceId) {
      throw new BadRequestException(`CALL_SERVICE instruction #${instr.index} is missing serviceId`);
    }

    const targetTier: NodeTier = instr.requiredTier || 'CENTRAL';

    const { manifest, selectedDescriptor, targetTier: resolvedTier } = this.registry.resolveForNode(
      instr.serviceId,
      instr.serviceVersion || 'latest',
      targetTier,
    );

    this._annotateRequirements(manifest, instr);

    return this._buildDispatchMetadata(manifest, selectedDescriptor, resolvedTier);
  }

  private _buildDispatchMetadata(
    manifest: PowerfulServiceManifest,
    descriptor: ExecutionDescriptor,
    targetTier: NodeTier,
  ): EnrichedDispatchMetadata {
    const base: EnrichedDispatchMetadata = {
      format: descriptor.format,
      selectedDescriptor: descriptor,
      timeoutMs: manifest.contract.timeoutMs,
      retryPolicy: manifest.contract.retryPolicy,
      targetTier,
      serviceId: manifest.id,
      serviceVersion: manifest.version,
      timeout: manifest.contract.timeoutMs,
    };

    switch (descriptor.format) {
      case 'WASM': {
        const d = descriptor as WasmExecutionDescriptor;
        base.wasmBinaryUrl = d.binaryUrl;
        base.wasmChecksum = d.checksum;
        base.wasmMemory = d.memorySizeMb;
        break;
      }
      case 'NATIVE': {
        const d = descriptor as NativeExecutionDescriptor;
        const hostBin = d.binaries.find(b => b.platform === 'linux-x64') || d.binaries[0];
        if (hostBin) {
          base.nativeBinaryUrl = hostBin.binaryUrl;
          base.nativeChecksum = hostBin.checksum;
          base.nativePlatform = hostBin.platform;
        }
        break;
      }
      case 'MCP': {
        const d = descriptor as any;
        base.mcpServer = d.serverName;
        base.mcpMethod = d.toolName;
        break;
      }
      case 'DOCKER': {
        const d = descriptor as any;
        base.dockerImage = d.image;
        base.dockerVersion = d.tag;
        base.dockerEnv = d.env;
        break;
      }
    }

    return base;
  }

  private _annotateRequirements(manifest: PowerfulServiceManifest, instr: IRInstruction): void {
    const req = manifest.nodeRequirements;
    instr.requiredCapabilities = instr.requiredCapabilities || {};

    if (req.needsInternet) instr.requiredCapabilities.needsInternet = true;
    if (req.needsVaultAccess) instr.requiredCapabilities.needsVault = true;
    if (req.minMemoryMb) instr.requiredCapabilities.minMemoryMb = req.minMemoryMb;
    if (req.requiredPhysicalProtocols?.length) {
      instr.requiredCapabilities.protocols = req.requiredPhysicalProtocols;
    }
  }

  /** Preview descriptor selection - useful for diagnostics endpoints */
  preview(serviceId: string, version = 'latest', tier: NodeTier = 'CENTRAL') {
    return this.registry.resolveForNode(serviceId, version, tier);
  }
}
