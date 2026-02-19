/**
 * Resource Reification Service
 * Binds resources and generates LOAD_RESOURCE instructions
 */

import { Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { Inject } from '@nestjs/common';
import { OptimizationPlan } from '../../optimizer/interfaces/optimizer.interface';
import {
  LLMIntermediateRepresentation,
  ResourceReificationResult,
  IRInstruction,
  IROpcode,
  ResourceHandle,
  Register,
  PermissionFlags,
} from '../interfaces/ir.interface';

@Injectable()
export class ResourceReificationService {
  constructor(@Inject('LOGGER') private logger: Logger) {}

  /**
   * Reify resources into handles and LOAD instructions
   */
  async reifyResources(
    optimizationPlan: OptimizationPlan,
    ir: LLMIntermediateRepresentation,
  ): Promise<ResourceReificationResult> {
    this.logger.debug('Starting resource reification', { context: 'ResourceReification' });

    const resourceTable: ResourceHandle[] = [];
    const resourceInstructions: IRInstruction[] = [];
    const loadOrder: string[] = [];
    const errors: string[] = [];

    try {
      // Create resource handles from bindings
      if (optimizationPlan.resourceBindings && optimizationPlan.resourceBindings.length > 0) {
        let handleIndex = 0;

        for (const binding of optimizationPlan.resourceBindings) {
          const handle: ResourceHandle = {
            id: `res_${handleIndex++}`,
            type: this.inferResourceType(binding.resourceType),
            resourceId: binding.resourceId,
            initialized: false,
            permissions: this.getDefaultPermissions(binding.resourceType),
          };

          resourceTable.push(handle);

          // Generate LOAD_RESOURCE instruction
          const reg: Register = {
            id: `r${handleIndex}`,
            type: 'object',
          };

          const loadInstruction: IRInstruction = {
            id: `load_${handle.id}`,
            opcode: IROpcode.LOAD_RESOURCE,
            operands: [handle.resourceId],
            resultRegisters: [reg],
            dependencies: [],
            metadata: {
              parallelizable: true,
              criticality: 'HIGH',
              timeoutMs: 5000,
            },
            comment: `Load resource: ${binding.resourceId}`,
          };

          resourceInstructions.push(loadInstruction);
          loadOrder.push(loadInstruction.id);
        }
      }

      this.logger.debug('Resource reification completed', {
        context: 'ResourceReification',
        resourceCount: resourceTable.length,
      });

      return {
        resourceTable,
        resourceInstructions,
        loadOrder,
        errors,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(errorMsg);
      this.logger.error(`Resource reification failed: ${errorMsg}`, {
        context: 'ResourceReification',
      });

      return {
        resourceTable,
        resourceInstructions,
        loadOrder,
        errors,
      };
    }
  }

  /**
   * Infer resource type
   */
  private inferResourceType(
    type: string | undefined,
  ): 'DATABASE' | 'API_CLIENT' | 'FILE_SYSTEM' | 'CACHE' | 'MESSAGE_QUEUE' {
    if (!type) return 'FILE_SYSTEM';

    const lower = type.toLowerCase();
    if (lower.includes('db') || lower.includes('database')) return 'DATABASE';
    if (lower.includes('api')) return 'API_CLIENT';
    if (lower.includes('file') || lower.includes('fs')) return 'FILE_SYSTEM';
    if (lower.includes('cache')) return 'CACHE';
    if (lower.includes('queue') || lower.includes('kafka')) return 'MESSAGE_QUEUE';

    return 'FILE_SYSTEM';
  }

  /**
   * Get default permissions for resource type
   */
  private getDefaultPermissions(type: string | undefined): PermissionFlags {
    return {
      READ: true,
      WRITE: true,
      EXECUTE: false,
      DELETE: false,
      ADMIN: false,
    };
  }
}
