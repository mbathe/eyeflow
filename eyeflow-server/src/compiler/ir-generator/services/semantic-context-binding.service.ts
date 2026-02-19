/**
 * Semantic Context Binding Service
 * Binds semantic embeddings and contexts to IR
 */

import { Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { Inject } from '@nestjs/common';
import { SemanticTree } from '../../frontend/interfaces/semantic-node.interface';
import { OptimizationPlan } from '../../optimizer/interfaces/optimizer.interface';
import {
  LLMIntermediateRepresentation,
  SemanticContextBindingResult,
  SemanticsData,
  IRInstruction,
} from '../interfaces/ir.interface';

@Injectable()
export class SemanticContextBindingService {
  constructor(@Inject('LOGGER') private logger: Logger) {}

  /**
   * Bind semantic context to IR
   */
  async bindSemanticContext(
    semanticTree: SemanticTree,
    optimizationPlan: OptimizationPlan,
    ir: LLMIntermediateRepresentation,
  ): Promise<SemanticContextBindingResult> {
    this.logger.debug('Starting semantic context binding', {
      context: 'SemanticContextBinding',
    });

    const contextInstructions: IRInstruction[] = [];
    const errors: string[] = [];

    try {
      // Build semantic context from LLM optimization results
      const semanticContext: SemanticsData = {
        embeddings: {},
        contexts: {},
        relationships: {},
      };

      // Extract embeddings from optimization plan
      if (optimizationPlan.llmContexts && optimizationPlan.llmContexts.length > 0) {
        for (const context of optimizationPlan.llmContexts) {
          if (context.contextId && context.semanticEmbeddings) {
            semanticContext.embeddings[context.contextId] = context.semanticEmbeddings[0] || [];
            semanticContext.contexts[context.contextId] = context.operationDescription || '';
          }
        }
      }

      // Build relationship graph
      this.buildRelationships(semanticTree, semanticContext);

      this.logger.debug('Semantic context binding completed', {
        context: 'SemanticContextBinding',
        embeddingCount: Object.keys(semanticContext.embeddings).length,
      });

      return {
        semanticContext,
        contextInstructions,
        errors,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(errorMsg);
      this.logger.error(`Semantic context binding failed: ${errorMsg}`, {
        context: 'SemanticContextBinding',
      });

      return {
        semanticContext: {
          embeddings: {},
          contexts: {},
          relationships: {},
        },
        contextInstructions,
        errors,
      };
    }
  }

  /**
   * Build relationship graph from semantic tree
   */
  private buildRelationships(tree: SemanticTree, context: SemanticsData): void {
    if (!tree || !tree.variables) return;

    // Build dependency relationships between variables
    for (const [varName, variable] of tree.variables.entries()) {
      if (variable && variable.name) {
        // Use producedBy to track which operation produced this variable
        context.relationships[variable.name] = variable.producedBy ? [variable.producedBy] : [];
      }
    }
  }
}
