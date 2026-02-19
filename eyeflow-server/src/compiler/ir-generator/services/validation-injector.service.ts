/**
 * Validation Injector Service
 * Injects schema validators and type coercers into IR
 */

import { Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { Inject } from '@nestjs/common';
import { OptimizationPlan } from '../../optimizer/interfaces/optimizer.interface';
import {
  LLMIntermediateRepresentation,
  ValidationInjectionResult,
  IRInstruction,
  IROpcode,
  SchemaValidator,
  Register,
} from '../interfaces/ir.interface';

@Injectable()
export class ValidationInjectorService {
  constructor(@Inject('LOGGER') private logger: Logger) {}

  /**
   * Inject validation into IR
   */
  async injectValidation(
    optimizationPlan: OptimizationPlan,
    ir: LLMIntermediateRepresentation,
  ): Promise<ValidationInjectionResult> {
    this.logger.debug('Starting validation injection', { context: 'ValidationInjector' });

    const validators: SchemaValidator[] = [];
    const validationInstructions: IRInstruction[] = [];
    const injectionPoints: string[] = [];
    const errors: string[] = [];

    try {
      // Convert schemas to validators
      if (optimizationPlan.schemas && optimizationPlan.schemas.length > 0) {
        let validatorIndex = 0;
        let regIndex = 200;

        for (const schema of optimizationPlan.schemas) {
          const validator: SchemaValidator = {
            id: `val_${validatorIndex}`,
            name: schema.operationId || `schema_${validatorIndex}`,
            schema: schema.inputSchema || {},
            errorHandling: 'THROW',
          };

          validators.push(validator);

          // Generate VALIDATE instruction
          const reg: Register = {
            id: `r${regIndex++}`,
            type: 'object',
          };

          const validateInstruction: IRInstruction = {
            id: `validate_${validator.id}`,
            opcode: IROpcode.VALIDATE,
            operands: [validator.id, reg],
            resultRegisters: [
              {
                id: `r${regIndex++}`,
                type: 'object',
              },
            ],
            dependencies: [],
            metadata: {
              parallelizable: false,
              criticality: 'HIGH',
            },
            comment: `Validate: ${validator.name}`,
          };

          validationInstructions.push(validateInstruction);
          injectionPoints.push(validateInstruction.id);
          validatorIndex++;
        }
      }

      this.logger.debug('Validation injection completed', {
        context: 'ValidationInjector',
        validatorCount: validators.length,
      });

      return {
        validators,
        validationInstructions,
        injectionPoints,
        errors,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(errorMsg);
      this.logger.error(`Validation injection failed: ${errorMsg}`, {
        context: 'ValidationInjector',
      });

      return {
        validators,
        validationInstructions,
        injectionPoints,
        errors,
      };
    }
  }
}
