/**
 * Constant Folding Service
 * Inlines constants and pre-computes compile-time expressions
 */

import { Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { Inject } from '@nestjs/common';
import { OptimizationPlan } from '../../optimizer/interfaces/optimizer.interface';
import {
  LLMIntermediateRepresentation,
  ConstantFoldingResult,
  IRInstruction,
  IROpcode,
  Register,
} from '../interfaces/ir.interface';

@Injectable()
export class ConstantFoldingService {
  constructor(@Inject('LOGGER') private logger: Logger) {}

  /**
   * Fold constants into IR
   */
  async foldConstants(
    optimizationPlan: OptimizationPlan,
    ir: LLMIntermediateRepresentation,
  ): Promise<ConstantFoldingResult> {
    this.logger.debug('Starting constant folding', { context: 'ConstantFolding' });

    const instructions: IRInstruction[] = [];
    let foldedCount = 0;
    let savedInstructions = 0;
    const errors: string[] = [];

    try {
      // Extract constants from classification map
      const constantInstructions = this.generateConstantInstructions(optimizationPlan);
      instructions.push(...constantInstructions);
      foldedCount = constantInstructions.length;

      // Pre-compute compile-time expressions
      const computedInstructions = this.precomputeExpressions(optimizationPlan);
      instructions.push(...computedInstructions);

      // Estimate saved instructions
      savedInstructions = foldedCount * 2; // Rough estimate

      this.logger.debug('Constant folding completed', {
        context: 'ConstantFolding',
        foldedCount,
        savedInstructions,
      });

      return {
        instructions,
        foldedCount,
        savedInstructions,
        errors,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(errorMsg);
      this.logger.error(`Constant folding failed: ${errorMsg}`, {
        context: 'ConstantFolding',
      });

      return {
        instructions,
        foldedCount,
        savedInstructions,
        errors,
      };
    }
  }

  /**
   * Generate IR instructions for constants
   */
  private generateConstantInstructions(optimizationPlan: OptimizationPlan): IRInstruction[] {
    const instructions: IRInstruction[] = [];
    let regIndex = 0;

    // Load each constant from classification map
    if (optimizationPlan.classificationsMap) {
      for (const [varName, classified] of optimizationPlan.classificationsMap.entries()) {
        if (classified.classification === 'CONSTANT') {
          const validType = (classified.type as any).includes('string') || classified.type === 'string'
            ? 'string'
            : classified.type === 'object'
              ? 'object'
              : classified.type === 'float'
                ? 'float'
                : classified.type === 'int'
                  ? 'int'
                  : classified.type === 'buffer'
                    ? 'buffer'
                    : 'any';
          const reg: Register = {
            id: `r${regIndex++}`,
            type: validType,
            value: varName,
          };

          instructions.push({
            id: `const_${varName}`,
            opcode: IROpcode.READ,
            operands: [],
            resultRegisters: [reg],
            dependencies: [],
            metadata: {
              parallelizable: true,
              criticality: 'LOW',
            },
            comment: `Load constant: ${varName}`,
          });
        }
      }
    }

    return instructions;
  }

  /**
   * Pre-compute compile-time expressions
   */
  private precomputeExpressions(optimizationPlan: OptimizationPlan): IRInstruction[] {
    const instructions: IRInstruction[] = [];
    let regIndex = 100;

    // Pre-compute compile-time computed values
    if (optimizationPlan.classificationsMap) {
      for (const [varName, classified] of optimizationPlan.classificationsMap.entries()) {
        if (classified.classification === 'COMPILE_TIME_COMPUTED') {
          const validType = classified.type === 'object'
            ? 'object'
            : classified.type === 'float'
              ? 'float'
              : classified.type === 'int'
                ? 'int'
                : classified.type === 'buffer'
                  ? 'buffer'
                  : classified.type === 'string'
                    ? 'string'
                    : 'any';
          const reg: Register = {
            id: `r${regIndex++}`,
            type: validType,
            value: classified.sourceOperation || varName,
          };

          instructions.push({
            id: `computed_${varName}`,
            opcode: IROpcode.TRANSFORM,
            operands: [],
            resultRegisters: [reg],
            dependencies: classified.dependsOn || [],
            metadata: {
              parallelizable: true,
              criticality: 'MEDIUM',
            },
            comment: `Pre-computed: ${varName}`,
          });
        }
      }
    }

    return instructions;
  }

  /**
   * Infer type from value
   */
  private inferType(
    value: unknown,
  ): 'int' | 'float' | 'string' | 'buffer' | 'object' | 'any' {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'int' : 'float';
    }
    if (typeof value === 'string') return 'string';
    if (Buffer.isBuffer(value)) return 'buffer';
    if (typeof value === 'object') return 'object';
    return 'any';
  }
}
