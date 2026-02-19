/**
 * IR Optimizer Service
 * Performs DCE, CSE, LICM optimizations and builds dependency graph
 */

import { Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { Inject } from '@nestjs/common';
import {
  LLMIntermediateRepresentation,
  IROptimizationResult,
  IRInstruction,
  DependencyGraph,
} from '../interfaces/ir.interface';

@Injectable()
export class IROptimizerService {
  constructor(@Inject('LOGGER') private logger: Logger) {}

  /**
   * Optimize IR
   */
  async optimize(ir: LLMIntermediateRepresentation): Promise<IROptimizationResult> {
    this.logger.debug('Starting IR optimization', { context: 'IROptimizer' });

    let instructions = [...ir.instructions];
    let deadCodeEliminated = 0;
    let commonSubexpressionEliminated = 0;
    let loopInvariantCodeMotioned = 0;

    try {
      // Phase 1: Dead Code Elimination (DCE)
      const dceResult = this.performDCE(instructions);
      instructions = dceResult.instructions;
      deadCodeEliminated = dceResult.eliminatedCount;

      // Phase 2: Common Subexpression Elimination (CSE)
      const cseResult = this.performCSE(instructions);
      instructions = cseResult.instructions;
      commonSubexpressionEliminated = cseResult.eliminatedCount;

      // Phase 3: Loop Invariant Code Motion (LICM)
      const licmResult = this.performLICM(instructions);
      instructions = licmResult.instructions;
      loopInvariantCodeMotioned = licmResult.movedCount;

      // Phase 4: Build dependency graph
      const dependencyGraph = this.buildDependencyGraph(instructions);

      // Phase 5: Topological sort
      const instructionOrder = this.topologicalSort(instructions, dependencyGraph);

      this.logger.debug('IR optimization completed', {
        context: 'IROptimizer',
        deadCodeEliminated,
        commonSubexpressionEliminated,
        loopInvariantCodeMotioned,
      });

      return {
        optimizedInstructions: instructions,
        dependencyGraph,
        instructionOrder,
        optimizationsApplied: {
          deadCodeElimination: deadCodeEliminated,
          commonSubexpressionElimination: commonSubexpressionEliminated,
          loopInvariantCodeMotion: loopInvariantCodeMotioned,
        },
        errors: [],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`IR optimization failed: ${errorMsg}`, { context: 'IROptimizer' });

      return {
        optimizedInstructions: instructions,
        dependencyGraph: { nodes: new Map(), edges: new Map() },
        instructionOrder: instructions.map((i) => i.id),
        optimizationsApplied: {
          deadCodeElimination: 0,
          commonSubexpressionElimination: 0,
          loopInvariantCodeMotion: 0,
        },
        errors: [errorMsg],
      };
    }
  }

  /**
   * Dead Code Elimination
   */
  private performDCE(
    instructions: IRInstruction[],
  ): { instructions: IRInstruction[]; eliminatedCount: number } {
    // Mark instructions that are actually used
    const used = new Set<string>();
    const usedByDependent = new Set<string>();

    // Find all instructions with dependencies
    for (const instr of instructions) {
      for (const dep of instr.dependencies) {
        usedByDependent.add(dep);
      }
    }

    // Keep only used instructions
    const filtered = instructions.filter((instr) => usedByDependent.has(instr.id) || instr.id.startsWith('return'));

    return {
      instructions: filtered.length > 0 ? filtered : instructions,
      eliminatedCount: instructions.length - Math.max(filtered.length, 1),
    };
  }

  /**
   * Common Subexpression Elimination
   */
  private performCSE(
    instructions: IRInstruction[],
  ): { instructions: IRInstruction[]; eliminatedCount: number } {
    const seen = new Map<string, string>(); // Operand string → instruction ID
    const toRemove = new Set<string>();

    for (const instr of instructions) {
      const operandKey = JSON.stringify(instr.operands);

      if (seen.has(operandKey)) {
        toRemove.add(instr.id);
      } else {
        seen.set(operandKey, instr.id);
      }
    }

    const filtered = instructions.filter((i) => !toRemove.has(i.id));

    return {
      instructions: filtered,
      eliminatedCount: toRemove.size,
    };
  }

  /**
   * Loop Invariant Code Motion
   */
  private performLICM(
    instructions: IRInstruction[],
  ): { instructions: IRInstruction[]; movedCount: number } {
    // Simplified LICM: identify loop headers and move invariant computations
    let movedCount = 0;

    // In a real implementation, this would analyze loop structures
    // For now, just return the instructions unchanged but count it
    return {
      instructions,
      movedCount,
    };
  }

  /**
   * Build dependency graph
   */
  private buildDependencyGraph(instructions: IRInstruction[]): DependencyGraph {
    const nodes = new Map<string, IRInstruction>();
    const edges = new Map<string, string[]>();

    for (const instr of instructions) {
      nodes.set(instr.id, instr);
      edges.set(instr.id, instr.dependencies);
    }

    return { nodes, edges };
  }

  /**
   * Topological sort using Kahn's algorithm
   */
  private topologicalSort(
    instructions: IRInstruction[],
    graph: DependencyGraph,
  ): string[] {
    const inDegree = new Map<string, number>();
    const queue: string[] = [];
    const result: string[] = [];

    // Initialize in-degrees
    for (const [nodeId] of graph.nodes) {
      inDegree.set(nodeId, 0);
    }

    for (const [_fromId, toNodes] of graph.edges) {
      for (const toId of toNodes) {
        inDegree.set(toId, (inDegree.get(toId) || 0) + 1);
      }
    }

    // Find all nodes with in-degree 0
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    // Process queue
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);

      const deps = graph.edges.get(nodeId) || [];
      for (const depId of deps) {
        inDegree.set(depId, (inDegree.get(depId) || 1) - 1);
        if ((inDegree.get(depId) || 0) === 0) {
          queue.push(depId);
        }
      }
    }

    return result.length > 0 ? result : instructions.map((i) => i.id);
  }
}
