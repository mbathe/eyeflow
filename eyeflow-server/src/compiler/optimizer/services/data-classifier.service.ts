/**
 * Data Classifier Service
 * Classifies variables as CONSTANT, COMPILE_TIME_COMPUTED, or RUNTIME_DYNAMIC
 */

import { Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { Inject } from '@nestjs/common';
import { SemanticTree, SemanticNode } from '../../frontend/interfaces/semantic-node.interface';
import { ClassifiedVariable, DataClassifierResult, DataClassification } from '../interfaces/optimizer.interface';

@Injectable()
export class DataClassifierService {
  constructor(@Inject('LOGGER') private logger: Logger) {}

  /**
   * Classify all variables in a semantic tree
   */
  async classifyVariables(tree: SemanticTree): Promise<DataClassifierResult> {
    const variables = new Map<string, ClassifiedVariable>();
    const errors: string[] = [];
    
    try {
      // Classify declared variables
      for (const [name, varDecl] of tree.variables) {
        const classification = this.determineClassification(varDecl, tree);
        variables.set(name, {
          name,
          type: varDecl.type,
          classification,
          sourceOperation: varDecl.value as string,
          dependsOn: [],
          isCacheable: classification !== 'RUNTIME_DYNAMIC',
          ttlSeconds: classification === 'CONSTANT' ? 3600 : 300,
        });
      }

      // Analyze dependencies between variables
      this.analyzeDependencies(variables, tree);

      // Log classification results
      this.logger.info(`Classified ${variables.size} variables`, {
        context: 'DataClassifier',
        constantCount: Array.from(variables.values()).filter(v => v.classification === 'CONSTANT').length,
        compileTimeCount: Array.from(variables.values()).filter(v => v.classification === 'COMPILE_TIME_COMPUTED').length,
        runtimeDynamicCount: Array.from(variables.values()).filter(v => v.classification === 'RUNTIME_DYNAMIC').length,
      });

      return {
        variables,
        classificationStats: {
          constantCount: Array.from(variables.values()).filter(v => v.classification === 'CONSTANT').length,
          compileTimeCount: Array.from(variables.values()).filter(v => v.classification === 'COMPILE_TIME_COMPUTED').length,
          runtimeDynamicCount: Array.from(variables.values()).filter(v => v.classification === 'RUNTIME_DYNAMIC').length,
        },
        errors,
      };
    } catch (error) {
      this.logger.error('Error classifying variables', {
        context: 'DataClassifier',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      errors.push(
        `Failed to classify variables: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      return {
        variables,
        classificationStats: {
          constantCount: 0,
          compileTimeCount: 0,
          runtimeDynamicCount: 0,
        },
        errors,
      };
    }
  }

  /**
   * Determine the classification of a variable
   */
  private determineClassification(varDecl: any, tree: SemanticTree): DataClassification {
    // Check if variable is literal value
    if (typeof varDecl.value === 'string' || typeof varDecl.value === 'number' || typeof varDecl.value === 'boolean') {
      return 'CONSTANT';
    }

    // Check if value is a reference to another variable
    if (typeof varDecl.value === 'string' && varDecl.value.startsWith('$')) {
      const referencedVar = tree.variables.get(varDecl.value.substring(1));
      if (referencedVar) {
        const refClassification = this.determineClassification(referencedVar, tree);
        // If referenced variable is constant, this one might be too
        if (refClassification === 'CONSTANT') {
          return 'COMPILE_TIME_COMPUTED';
        }
      }
      return 'RUNTIME_DYNAMIC';
    }

    // Check if variable is derived from operation output
    if (varDecl.source === 'operation_output') {
      return 'COMPILE_TIME_COMPUTED';
    }

    // Check if variable comes from external input
    if (varDecl.source === 'input_param') {
      return 'RUNTIME_DYNAMIC';
    }

    // Default classification
    return 'RUNTIME_DYNAMIC';
  }

  /**
   * Analyze dependencies between variables
   */
  private analyzeDependencies(variables: Map<string, ClassifiedVariable>, tree: SemanticTree): void {
    for (const [name, classifiedVar] of variables) {
      const varDecl = tree.variables.get(name);
      if (!varDecl) continue;

      const dependencies: string[] = [];

      // Find variables referenced in this variable's value
      if (typeof varDecl.value === 'string') {
        const matches = varDecl.value.match(/\$\w+/g);
        if (matches) {
          for (const match of matches) {
            const refName = match.substring(1);
            if (variables.has(refName) && refName !== name) {
              dependencies.push(refName);
            }
          }
        }
      }

      classifiedVar.dependsOn = dependencies;
    }
  }
}
