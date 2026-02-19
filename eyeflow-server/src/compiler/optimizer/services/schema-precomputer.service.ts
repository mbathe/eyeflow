/**
 * Schema Precomputer Service
 * Generates JSON Schema validators for all I/O types
 */

import { Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { Inject } from '@nestjs/common';
import { SemanticTree } from '../../frontend/interfaces/semantic-node.interface';
import { SchemaDefinition, SchemaPrecomputationResult } from '../interfaces/optimizer.interface';

@Injectable()
export class SchemaPrecomputerService {
  constructor(@Inject('LOGGER') private logger: Logger) {}

  /**
   * Precompute JSON schemas for all operations
   */
  async precomputeSchemas(tree: SemanticTree): Promise<SchemaPrecomputationResult> {
    const schemas: SchemaDefinition[] = [];
    const errors: string[] = [];
    let validatorCount = 0;
    let transformerCount = 0;

    try {
      // Generate schemas for each operation
      for (const [opId, operation] of tree.operations) {
        if (!operation.operation) continue;

        const inputSchema = this.generateInputSchema(operation.operation);
        const outputSchema = this.generateOutputSchema(operation.operation);

        const schema: SchemaDefinition = {
          operationId: opId,
          inputSchema,
          outputSchema,
          validator: this.createValidator(inputSchema),
          transformers: this.createTransformers(outputSchema),
        };

        schemas.push(schema);
        validatorCount++;
        if (schema.transformers) {
          transformerCount += schema.transformers.length;
        }
      }

      const estimatedValidationOverhead = schemas.length * 5; // 5ms per schema validation

      this.logger.info(`Precomputed ${schemas.length} schemas`, {
        context: 'SchemaPrecomputer',
        validatorCount,
        transformerCount,
        estimatedOverhead: estimatedValidationOverhead,
      });

      return {
        schemas,
        validatorCount,
        transformerCount,
        estimatedValidationOverhead,
        errors,
      };
    } catch (error) {
      this.logger.error('Error precomputing schemas', {
        context: 'SchemaPrecomputer',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      errors.push(
        `Failed to precompute schemas: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      return {
        schemas,
        validatorCount: 0,
        transformerCount: 0,
        estimatedValidationOverhead: 0,
        errors,
      };
    }
  }

  /**
   * Generate JSON Schema for operation inputs
   */
  private generateInputSchema(operation: any): Record<string, any> {
    const inputs = operation.inputs || {};
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(inputs)) {
      const type = this.inferType(value);
      properties[key] = {
        type,
        description: `Input parameter: ${key}`,
      };

      // All inputs are required by default
      required.push(key);
    }

    return {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    };
  }

  /**
   * Generate JSON Schema for operation outputs
   */
  private generateOutputSchema(operation: any): Record<string, any> {
    // Default output schema for operations
    return {
      type: 'object',
      properties: {
        result: {
          type: 'any',
          description: 'Operation result',
        },
        status: {
          type: 'string',
          enum: ['success', 'error', 'pending'],
          description: 'Operation status',
        },
        metadata: {
          type: 'object',
          description: 'Operation metadata',
        },
      },
      required: ['result', 'status'],
    };
  }

  /**
   * Infer JSON Schema type from value
   */
  private inferType(value: any): string {
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object' && value !== null) return 'object';
    return 'any';
  }

  /**
   * Create a validator function for schema
   */
  private createValidator(schema: Record<string, any>): (value: any) => boolean {
    return (value: any) => {
      // Basic validation: check required properties
      if (schema.required) {
        for (const prop of schema.required) {
          if (!(prop in value)) {
            return false;
          }
        }
      }

      // Check property types
      if (schema.properties) {
        for (const [prop, propSchema] of Object.entries(schema.properties)) {
          if (prop in value && propSchema && typeof propSchema === 'object') {
            const propType = (propSchema as any).type;
            if (propType && typeof value[prop] !== propType) {
              return false;
            }
          }
        }
      }

      return true;
    };
  }

  /**
   * Create transformer functions for output schema
   */
  private createTransformers(schema: Record<string, any>): ((value: any) => any)[] {
    const transformers: ((value: any) => any)[] = [];

    // Transformer to ensure output has required structure
    transformers.push((value: any) => {
      if (typeof value !== 'object' || value === null) {
        return {
          result: value,
          status: 'success',
          metadata: {},
        };
      }
      return value;
    });

    // Transformer to add status if missing
    transformers.push((value: any) => {
      if (!('status' in value)) {
        return { ...value, status: 'success' };
      }
      return value;
    });

    return transformers;
  }
}
