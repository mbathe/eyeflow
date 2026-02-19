/**
 * LLM Context Optimizer Service
 * Prepares vector embeddings and context for LLM processing
 */

import { Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { Inject } from '@nestjs/common';
import { SemanticTree } from '../../frontend/interfaces/semantic-node.interface';
import {
  LLMContext,
  LLMContextOptimizationResult,
} from '../interfaces/optimizer.interface';

@Injectable()
export class LLMContextOptimizerService {
  private readonly EMBEDDING_DIMENSION = 768; // Standard encoder dimension
  private readonly CONTEXT_WINDOW_SIZE = 2048; // Token budget for LLM

  constructor(@Inject('LOGGER') private logger: Logger) {}

  /**
   * Optimize LLM context for workflow
   */
  async optimizeLLMContext(tree: SemanticTree): Promise<LLMContextOptimizationResult> {
    const contexts: LLMContext[] = [];
    const errors: string[] = [];

    try {
      // Generate context for root operation
      if (tree.root) {
        const rootContext = await this.generateContextForNode(tree.root, tree, 'root');
        if (rootContext) {
          contexts.push(rootContext);
        }
      }

      // Generate context for each operation
      for (const [opId, operation] of tree.operations) {
        const context = await this.generateContextForNode(operation, tree, opId);
        if (context) {
          contexts.push(context);
        }
      }

      // Calculate total embedding size
      const totalEmbeddings = contexts.reduce((sum, ctx) => {
        return sum + (ctx.keywordEmbeddings?.length || 0) + (ctx.semanticEmbeddings?.length || 0);
      }, 0);

      const vectorStoreSize = totalEmbeddings * this.EMBEDDING_DIMENSION * 4; // 4 bytes per float32

      // Calculate context quality (0-1 score)
      const contextQuality = this.calculateContextQuality(contexts);

      this.logger.info(`Optimized LLM context for ${contexts.length} operations`, {
        context: 'LLMContextOptimizer',
        totalEmbeddings,
        embeddingDimensions: this.EMBEDDING_DIMENSION,
        vectorStoreSize,
        contextQuality,
      });

      return {
        contexts,
        totalEmbeddings,
        embeddingDimensions: this.EMBEDDING_DIMENSION,
        vectorStoreSize,
        contextQuality,
        errors,
      };
    } catch (error) {
      this.logger.error('Error optimizing LLM context', {
        context: 'LLMContextOptimizer',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      errors.push(
        `Failed to optimize LLM context: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      return {
        contexts,
        totalEmbeddings: 0,
        embeddingDimensions: this.EMBEDDING_DIMENSION,
        vectorStoreSize: 0,
        contextQuality: 0,
        errors,
      };
    }
  }

  /**
   * Generate LLM context for a single node
   */
  private async generateContextForNode(
    node: any,
    tree: SemanticTree,
    nodeId: string,
  ): Promise<LLMContext | null> {
    try {
      // Extract description
      const description = this.extractNodeDescription(node);
      if (!description) return null;

      // Generate keyword embeddings
      const keywords = this.extractKeywords(description);
      const keywordEmbeddings = this.generateEmbeddings(keywords);

      // Generate semantic embeddings
      const semanticTerms = this.extractSemanticTerms(node);
      const semanticEmbeddings = this.generateEmbeddings(semanticTerms);

      // Calculate relevance scores
      const relevanceScores = this.calculateRelevanceScores(keywords, semanticTerms);

      return {
        contextId: `llm_ctx_${nodeId}`,
        workflowName: tree.metadata.name,
        operationDescription: description,
        keywordEmbeddings,
        semanticEmbeddings,
        relevanceScores,
        metadata: {
          nodeType: node.type,
          operationId: nodeId,
          inputCount: node.operation?.inputs ? Object.keys(node.operation.inputs).length : 0,
          outputTypes: node.operation?.outputs ? node.operation.outputs.length : 0,
        },
      };
    } catch (error) {
      this.logger.warn('Failed to generate context for node', {
        context: 'LLMContextOptimizer',
        nodeId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Extract human-readable description from node
   */
  private extractNodeDescription(node: any): string {
    if (!node.operation) return '';

    const capabilityId = node.operation.capabilityId || 'unknown';
    const inputs = node.operation.inputs || {};
    const inputStr = Object.entries(inputs)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');

    if (inputStr) {
      return `${capabilityId} with ${inputStr}`;
    }
    return capabilityId;
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    // Split and filter common words
    const commonWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
    ]);

    return text
      .toLowerCase()
      .split(/[\s.,=]+/)
      .filter(word => word.length > 2 && !commonWords.has(word))
      .slice(0, 10); // Limit to 10 keywords
  }

  /**
   * Extract semantic terms from node
   */
  private extractSemanticTerms(node: any): string[] {
    const terms: string[] = [];

    // Add operation type
    if (node.type) {
      terms.push(node.type);
    }

    // Add capability terms
    if (node.operation?.capabilityId) {
      const parts = node.operation.capabilityId.split('.');
      terms.push(...parts);
    }

    // Add input key terms
    if (node.operation?.inputs) {
      terms.push(...Object.keys(node.operation.inputs).slice(0, 5));
    }

    // Add metadata terms
    if (node.metadata?.parallelizable) {
      terms.push('parallelizable');
    }

    return terms.slice(0, 15); // Limit to 15 terms
  }

  /**
   * Generate mock embeddings for terms
   * In production, this would use a real embedding model
   */
  private generateEmbeddings(terms: string[]): number[][] {
    return terms.map(term => {
      // Generate deterministic embedding based on term
      const seed = term.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const embedding: number[] = [];

      for (let i = 0; i < this.EMBEDDING_DIMENSION; i++) {
        // Use seeded random for deterministic embeddings
        const seededRandom = Math.sin(seed + i * 12.9898) * 43758.5453 - Math.floor(Math.sin(seed + i * 12.9898) * 43758.5453);
        embedding.push(seededRandom * 2 - 1); // Range [-1, 1]
      }

      return embedding;
    });
  }

  /**
   * Calculate relevance scores for terms
   */
  private calculateRelevanceScores(keywords: string[], semanticTerms: string[]): number[] {
    const allTerms = [...keywords, ...semanticTerms];
    const scores: number[] = [];

    for (let i = 0; i < allTerms.length; i++) {
      // Higher score for more specific terms
      let score = 0.5; // Base relevance

      // Keywords get slightly lower score than semantic terms
      if (i < keywords.length) {
        score *= 0.8;
      } else {
        score *= 1.2;
      }

      // Prefer terms that appear earlier
      score *= 1 - (i / allTerms.length) * 0.3;

      scores.push(Math.min(score, 1.0)); // Cap at 1.0
    }

    return scores;
  }

  /**
   * Calculate overall context quality score
   */
  private calculateContextQuality(contexts: LLMContext[]): number {
    if (contexts.length === 0) return 0;

    let totalQuality = 0;

    for (const context of contexts) {
      let quality = 0.5; // Base quality

      // More embeddings = better quality (up to a point)
      const totalEmbeddings = (context.keywordEmbeddings?.length || 0) + (context.semanticEmbeddings?.length || 0);
      quality += Math.min(totalEmbeddings / 20, 0.3);

      // Higher average relevance score = better quality
      if (context.relevanceScores && context.relevanceScores.length > 0) {
        const avgRelevance = context.relevanceScores.reduce((a, b) => a + b, 0) / context.relevanceScores.length;
        quality += avgRelevance * 0.2;
      }

      totalQuality += quality;
    }

    return Math.min(totalQuality / contexts.length, 1.0);
  }
}
