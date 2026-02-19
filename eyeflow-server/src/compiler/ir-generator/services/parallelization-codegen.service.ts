/**
 * Parallelization Code Generator Service
 * Generates PARALLEL_SPAWN and BARRIER instructions
 */

import { Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { Inject } from '@nestjs/common';
import { OptimizationPlan } from '../../optimizer/interfaces/optimizer.interface';
import {
  LLMIntermediateRepresentation,
  ParallelizationCodeGenResult,
  IRInstruction,
  IROpcode,
  ParallelGroup,
  Register,
} from '../interfaces/ir.interface';

@Injectable()
export class ParallelizationCodeGenService {
  constructor(@Inject('LOGGER') private logger: Logger) {}

  /**
   * Generate parallel code from optimizations
   */
  async generateParallelCode(
    optimizationPlan: OptimizationPlan,
    ir: LLMIntermediateRepresentation,
  ): Promise<ParallelizationCodeGenResult> {
    this.logger.debug('Starting parallelization codegen', {
      context: 'ParallelizationCodeGen',
    });

    const parallelGroups: ParallelGroup[] = [];
    const parallelInstructions: IRInstruction[] = [];
    const barrierInstructions: IRInstruction[] = [];
    let estimatedSpeedup = 1;
    const errors: string[] = [];

    try {
      // Generate parallel groups from opportunities
      if (
        optimizationPlan.parallelizationOpportunities &&
        optimizationPlan.parallelizationOpportunities.length > 0
      ) {
        let groupIndex = 0;
        let barrierId = 0;

        for (const opportunity of optimizationPlan.parallelizationOpportunities) {
          const workerCount = this.calculateWorkerCount({
            parallelFraction: opportunity.parallelizationFactor,
            estimatedSpeedup: opportunity.estimatedSpeedup,
          });
          const speedup = opportunity.estimatedSpeedup || 1;

          // Create parallel group
          const group: ParallelGroup = {
            id: `pgroup_${groupIndex}`,
            name: opportunity.operationIds[0] || `parallel_${groupIndex}`,
            instructions: [], // Will be filled during IR optimization
            workerCount,
            synchronizationPoint: `barrier_${barrierId}`,
            amdahlEstimate: speedup,
          };

          parallelGroups.push(group);

          // Generate PARALLEL_SPAWN instruction
          const spawnInstr: IRInstruction = {
            id: `spawn_${groupIndex}`,
            opcode: IROpcode.PARALLEL_SPAWN,
            operands: [workerCount],
            dependencies: [],
            metadata: {
              parallelizable: false, // The spawn itself must execute sequentially
              criticality: 'HIGH',
            },
            comment: `Spawn ${workerCount} workers for ${group.name}`,
          };

          parallelInstructions.push(spawnInstr);

          // Generate BARRIER instruction
          const barrierInstr: IRInstruction = {
            id: `barrier_${barrierId++}`,
            opcode: IROpcode.PARALLEL_BARRIER,
            operands: [workerCount],
            dependencies: [spawnInstr.id],
            metadata: {
              parallelizable: false,
              criticality: 'HIGH',
            },
            comment: `Wait for ${workerCount} workers to complete`,
          };

          barrierInstructions.push(barrierInstr);
          parallelInstructions.push(barrierInstr);

          estimatedSpeedup = Math.max(estimatedSpeedup, speedup);
          groupIndex++;
        }
      }

      this.logger.debug('Parallelization codegen completed', {
        context: 'ParallelizationCodeGen',
        parallelGroupCount: parallelGroups.length,
        estimatedSpeedup,
      });

      return {
        parallelGroups,
        parallelInstructions,
        barrierInstructions,
        estimatedSpeedup,
        errors,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(errorMsg);
      this.logger.error(`Parallelization codegen failed: ${errorMsg}`, {
        context: 'ParallelizationCodeGen',
      });

      return {
        parallelGroups,
        parallelInstructions,
        barrierInstructions,
        estimatedSpeedup,
        errors,
      };
    }
  }

  /**
   * Calculate worker count based on Amdahl's law
   */
  private calculateWorkerCount(
    amdahl: { parallelFraction: number; estimatedSpeedup: number } | undefined,
  ): number {
    if (!amdahl) return 1;

    // Heuristic: use speedup * CPU count, capped at 8
    const speedupWorkers = Math.ceil(amdahl.estimatedSpeedup * 2);
    return Math.min(speedupWorkers, 8);
  }
}
