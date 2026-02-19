/**
 * Type Inferencer Service
 * Infers and validates types throughout the Semantic Tree
 * 
 * Responsibilities:
 * 1. Extract output types from capabilities
 * 2. Propagate types through the tree
 * 3. Validate type compatibility at join points
 * 4. Report type errors
 * 
 * @file src/compiler/frontend/services/type-inferencer.service.ts
 */

import { Injectable, Inject } from '@nestjs/common';
import { Logger } from 'winston';
import { 
  SemanticNode, 
  SemanticTree, 
  VariableDeclaration, 
  ParseError,
  SemanticNodeGuards 
} from '../interfaces/semantic-node.interface';
import { ComponentRegistry, Capability } from '@/common/extensibility/index';

/**
 * Type information with JSON Schema
 */
export interface TypeInfo {
  typeName: string;
  schema?: Record<string, unknown>;
  nullable: boolean;
  array: boolean;
  primitive: boolean;
}

/**
 * Type constraints for validation
 */
export interface TypeConstraint {
  variableName: string;
  expectedType: TypeInfo;
  actualType?: TypeInfo;
  isCompatible: boolean;
  error?: string;
}

@Injectable()
export class TypeInferencerService {
  private readonly logger: Logger;
  private typeCache = new Map<string, TypeInfo>();

  constructor(
    @Inject('LOGGER') logger: Logger,
    private readonly componentRegistry: ComponentRegistry,
  ) {
    this.logger = logger.child({ context: 'TypeInferencerService' });
  }

  /**
   * Infer types throughout the semantic tree
   * Returns errors if type mismatches are found
   */
  async inferTypes(tree: SemanticTree): Promise<ParseError[]> {
    const errors: ParseError[] = [];

    // Phase 1: Infer output types for all operations
    await this.inferOperationTypes(tree);

    // Phase 2: Validate type flow through operations
    for (const [id, node] of tree.operations) {
      if (!SemanticNodeGuards.isOperationNode(node)) continue;

      const { capabilityId, inputs } = node.operation;

      try {
        const capability = await this.componentRegistry.getCapability(capabilityId);
        if (!capability) continue;

        // Validate input types
        for (const param of capability.inputs) {
          if (param.name in inputs) {
            const inputValue = inputs[param.name];
            const expectedType = this.schemaToTypeInfo(param.schema);

            // Check if input is reference to another operation
            if (typeof inputValue === 'string' && inputValue.startsWith('action_')) {
              const referencedOp = tree.operations.get(inputValue);
              if (referencedOp && SemanticNodeGuards.isOperationNode(referencedOp)) {
                const refCapability = await this.componentRegistry.getCapability(referencedOp.operation.capabilityId);
                if (refCapability && refCapability.outputs.length > 0) {
                  const outputType = this.schemaToTypeInfo(refCapability.outputs[0].schema);
                  if (!this.isTypeCompatible(outputType, expectedType)) {
                    errors.push({
                      code: 'TYPE_MISMATCH',
                      message: `Type mismatch for input '${param.name}': expected ${expectedType.typeName}, got ${outputType.typeName}`,
                      lineNumber: node.metadata?.sourceLineNumber ?? 0,
                      context: `${capabilityId}`,
                      suggestions: [`Check output type of ${inputValue}`],
                    });
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        this.logger.error('Type inference error', {
          operation: id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Phase 3: Validate merge types in parallel branches
    errors.push(...await this.validateParallelMerges(tree));

    // Phase 4: Validate conditional branches
    errors.push(...await this.validateConditionalBranches(tree));

    return errors;
  }

  /**
   * Infer output types for all operations
   */
  private async inferOperationTypes(tree: SemanticTree): Promise<void> {
    for (const [id, node] of tree.operations) {
      if (!SemanticNodeGuards.isOperationNode(node)) continue;

      const { capabilityId, outputVariable } = node.operation;

      try {
        const capability = await this.componentRegistry.getCapability(capabilityId);
        if (!capability || capability.outputs.length === 0) continue;

        const outputType = this.schemaToTypeInfo(capability.outputs[0].schema);

        // Store in type cache
        if (outputVariable) {
          this.typeCache.set(outputVariable, outputType);

          // Update variable declaration
          if (tree.variables.has(outputVariable)) {
            const varDecl = tree.variables.get(outputVariable)!;
            varDecl.schema = capability.outputs[0].schema;
          }
        }
      } catch (error) {
        this.logger.warn('Failed to infer output type', {
          operation: id,
          capability: capabilityId,
        });
      }
    }
  }

  /**
   * Validate type compatibility between parallel branches
   */
  private async validateParallelMerges(tree: SemanticTree): Promise<ParseError[]> {
    const errors: ParseError[] = [];

    for (const [id, node] of tree.operations) {
      if (!SemanticNodeGuards.isParallelNode(node)) continue;

      const { branches, mergeStrategy } = node.parallel;

      // Extract output types from each branch
      const branchTypes = branches.map((branch) => {
        if (SemanticNodeGuards.isOperationNode(branch)) {
          const { capabilityId, outputVariable } = branch.operation;
          if (outputVariable && this.typeCache.has(outputVariable)) {
            return this.typeCache.get(outputVariable)!;
          }
        }
        return null;
      });

      // Validate merge strategy compatibility
      if (mergeStrategy === 'all') {
        // All branches must have compatible types for merging into array
        const nonNullTypes = branchTypes.filter((t) => t !== null);
        if (nonNullTypes.length > 1) {
          for (let i = 1; i < nonNullTypes.length; i++) {
            if (!this.isTypeCompatible(nonNullTypes[0], nonNullTypes[i])) {
              errors.push({
                code: 'INCOMPATIBLE_PARALLEL_BRANCHES',
                message: `Parallel branches have incompatible types: ${nonNullTypes[0].typeName} vs ${nonNullTypes[i].typeName}`,
                lineNumber: node.metadata?.sourceLineNumber ?? 0,
                suggestions: ['Ensure all branches return compatible types'],
              });
            }
          }
        }
      } else if (mergeStrategy === 'first' || mergeStrategy === 'race') {
        // Only first/winning branch type matters
        // No validation needed
      }
    }

    return errors;
  }

  /**
   * Validate type compatibility in conditional branches
   */
  private async validateConditionalBranches(tree: SemanticTree): Promise<ParseError[]> {
    const errors: ParseError[] = [];

    for (const [id, node] of tree.operations) {
      if (!SemanticNodeGuards.isConditionalNode(node)) continue;

      const { thenBranch, elseBranch } = node.conditional;

      // Extract output types
      let thenType: TypeInfo | null = null;
      let elseType: TypeInfo | null = null;

      if (SemanticNodeGuards.isOperationNode(thenBranch)) {
        const { outputVariable } = thenBranch.operation;
        if (outputVariable && this.typeCache.has(outputVariable)) {
          thenType = this.typeCache.get(outputVariable)!;
        }
      }

      if (elseBranch && SemanticNodeGuards.isOperationNode(elseBranch)) {
        const { outputVariable } = elseBranch.operation;
        if (outputVariable && this.typeCache.has(outputVariable)) {
          elseType = this.typeCache.get(outputVariable)!;
        }
      }

      // Validate compatibility
      if (thenType && elseType && !this.isTypeCompatible(thenType, elseType)) {
        errors.push({
          code: 'INCOMPATIBLE_CONDITIONAL_BRANCHES',
          message: `Conditional branches have incompatible types: then=${thenType.typeName}, else=${elseType.typeName}`,
          lineNumber: node.metadata?.sourceLineNumber ?? 0,
          suggestions: ['Ensure both branches return the same type'],
        });
      }
    }

    return errors;
  }

  /**
   * Convert JSON Schema to TypeInfo
   */
  private schemaToTypeInfo(schema?: Record<string, unknown>): TypeInfo {
    if (!schema) {
      return {
        typeName: 'any',
        nullable: true,
        array: false,
        primitive: false,
      };
    }

    const type = schema.type as string | string[] | undefined;
    const isArray = Array.isArray(type) ? type.includes('array') : type === 'array';
    const isNullable = Array.isArray(type) ? type.includes('null') : schema.type === 'null' || schema.nullable === true;

    let typeName = 'object';
    if (typeof type === 'string') {
      typeName = type;
    } else if (Array.isArray(type)) {
      typeName = type.filter((t) => t !== 'null')[0] || 'any';
    }

    return {
      typeName: isArray ? `${typeName}[]` : typeName,
      schema,
      nullable: isNullable,
      array: isArray,
      primitive: ['string', 'number', 'boolean', 'integer'].includes(typeName),
    };
  }

  /**
   * Check type compatibility
   * More permissive than exact equality (e.g., number ~= integer)
   */
  private isTypeCompatible(actual: TypeInfo, expected: TypeInfo): boolean {
    // If expected allows any, always compatible
    if (expected.typeName === 'any') return true;

    // If actual is any, generally safe
    if (actual.typeName === 'any') return true;

    // Exact match
    if (actual.typeName === expected.typeName) return true;

    // Number/Integer compatibility
    if (['number', 'integer'].includes(actual.typeName) && ['number', 'integer'].includes(expected.typeName)) {
      return true;
    }

    // Object/Any compatibility
    if (actual.typeName === 'object' && expected.typeName === 'object') return true;

    return false;
  }

  /**
   * Get type of variable
   */
  getVariableType(variableName: string): TypeInfo | null {
    return this.typeCache.get(variableName) || null;
  }

  /**
   * Clear type cache (useful for testing)
   */
  clearCache(): void {
    this.typeCache.clear();
  }
}
