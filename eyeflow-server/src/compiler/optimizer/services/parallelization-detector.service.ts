/**
 * Parallelization Detector Service
 * Identifies operations that can run in parallel
 */

import { Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { Inject } from '@nestjs/common';
import { SemanticTree } from '../../frontend/interfaces/semantic-node.interface';
import {
  ParallelizationOpportunity,
  ParallelizationDetectionResult,

} from '../interfaces/optimizer.interface';

@Injectable()
export class ParallelizationDetectorService {
  constructor(@Inject('LOGGER') private logger: Logger) {}

  /**
   * Detect parallelization opportunities in workflow
   */
  async detectParallelization(tree: SemanticTree): Promise<ParallelizationDetectionResult> {
    const opportunities: ParallelizationOpportunity[] = [];
    const errors: string[] = [];
    const bottlenecks: string[] = [];
    const criticalPath: string[] = [];

    try {
      // Build dependency graph
      const dependencyGraph = this.buildDependencyGraph(tree);

      // Find independent operation sets
      const independentSets = this.findIndependentOperationSets(dependencyGraph);
      for (const set of independentSets) {
        if (set.length > 1) {
          opportunities.push({
            operationIds: set,
            type: 'INDEPENDENT_OPERATIONS',
            parallelizationFactor: set.length,
            estimatedSpeedup: this.estimateSpeedup(set.length),
            resourceRequirements: {
              cpuCores: Math.min(set.length * 0.5, 4),
              memoryMb: set.length * 128,
              concurrentCount: set.length,
            },
          });
        }
      }

      // Find conditional branches that can be parallelized
      const conditionalBranches = this.findConditionalBranches(tree);
      for (const branches of conditionalBranches) {
        opportunities.push({
          operationIds: branches,
          type: 'CONDITIONAL_BRANCHES',
          parallelizationFactor: branches.length,
          estimatedSpeedup: this.estimateSpeedup(branches.length),
          resourceRequirements: {
            cpuCores: Math.min(branches.length * 0.5, 4),
            memoryMb: branches.length * 128,
            concurrentCount: branches.length,
          },
        });
      }

      // Find loop iterations that can be parallelized
      const loopIterations = this.findParallelizableLoops(tree);
      for (const loop of loopIterations) {
        opportunities.push({
          operationIds: loop,
          type: 'LOOP_ITERATIONS',
          parallelizationFactor: loop.length,
          estimatedSpeedup: this.estimateSpeedup(loop.length),
          resourceRequirements: {
            cpuCores: Math.min(loop.length * 0.25, 4),
            memoryMb: loop.length * 64,
            concurrentCount: loop.length,
          },
        });
      }

      // Calculate critical path
      const criticalPathOps = this.calculateCriticalPath(dependencyGraph);
      criticalPath.push(...criticalPathOps);

      // Identify bottlenecks (nodes with high fan-in)
      for (const [opId, deps] of dependencyGraph) {
        if (deps.length > 2) {
          bottlenecks.push(opId);
        }
      }

      const totalParallelizablePairs = this.countParallelizablePairs(dependencyGraph);
      const overallSpeedup = opportunities.length > 0
        ? Math.max(...opportunities.map(o => o.estimatedSpeedup))
        : 1;

      this.logger.info(`Detected ${opportunities.length} parallelization opportunities`, {
        context: 'ParallelizationDetector',
        independentSetCount: independentSets.filter(s => s.length > 1).length,
        totalParallelizablePairs,
        estimatedSpeedup: overallSpeedup,
        bottleneckCount: bottlenecks.length,
      });

      return {
        opportunities,
        totalParallelizablePairs,
        estimatedSpeedup: overallSpeedup,
        bottlenecks,
        criticalPath,
        errors,
      };
    } catch (error) {
      this.logger.error('Error detecting parallelization', {
        context: 'ParallelizationDetector',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      errors.push(
        `Failed to detect parallelization: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      return {
        opportunities,
        totalParallelizablePairs: 0,
        estimatedSpeedup: 1,
        bottlenecks,
        criticalPath,
        errors,
      };
    }
  }

  /**
   * Build dependency graph from tree
   */
  private buildDependencyGraph(tree: SemanticTree): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    for (const [opId, operation] of tree.operations) {
      const deps = operation.metadata?.dependencies || [];
      graph.set(opId, deps);
    }

    return graph;
  }

  /**
   * Find sets of independent operations
   */
  private findIndependentOperationSets(graph: Map<string, string[]>): string[][] {
    const sets: string[][] = [];
    const processed = new Set<string>();

    for (const [opId] of graph) {
      if (processed.has(opId)) continue;

      const independent: string[] = [opId];
      processed.add(opId);

      // Find other operations independent of this one
      for (const [otherId] of graph) {
        if (processed.has(otherId)) continue;

        const opDeps = graph.get(opId) || [];
        const otherDeps = graph.get(otherId) || [];

        // Check if operations are independent
        if (!opDeps.includes(otherId) && !otherDeps.includes(opId)) {
          independent.push(otherId);
          processed.add(otherId);
        }
      }

      if (independent.length > 1) {
        sets.push(independent);
      }
    }

    return sets;
  }

  /**
   * Find conditional branches
   */
  private findConditionalBranches(tree: SemanticTree): string[][] {
    const branches: string[][] = [];

    for (const [opId, operation] of tree.operations) {
      if (operation.type === 'conditional' && operation.conditional) {
        const thenOps = this.collectOperationsFromNode(operation.conditional.thenBranch);
        const elseOps = operation.conditional.elseBranch ? this.collectOperationsFromNode(operation.conditional.elseBranch) : [];

        if (thenOps.length > 0 && elseOps.length > 0) {
          branches.push([...thenOps, ...elseOps]);
        }
      }
    }

    return branches;
  }

  /**
   * Find parallelizable loops
   */
  private findParallelizableLoops(tree: SemanticTree): string[][] {
    const loops: string[][] = [];

    for (const [opId, operation] of tree.operations) {
      if (operation.type === 'loop' && operation.loop && operation.metadata?.parallelizable) {
        const loopOps = this.collectOperationsFromNode(operation.loop.body);
        if (loopOps.length > 0) {
          loops.push(loopOps);
        }
      }
    }

    return loops;
  }

  /**
   * Collect operation IDs from a node
   */
  private collectOperationsFromNode(node: any): string[] {
    const ops: string[] = [];

    if (!node) return ops;

    if (node.id) {
      ops.push(node.id);
    }

    if (node.branches && Array.isArray(node.branches)) {
      for (const branch of node.branches) {
        ops.push(...this.collectOperationsFromNode(branch));
      }
    }

    if (node.body) {
      ops.push(...this.collectOperationsFromNode(node.body));
    }

    if (node.thenBranch) {
      ops.push(...this.collectOperationsFromNode(node.thenBranch));
    }

    if (node.elseBranch) {
      ops.push(...this.collectOperationsFromNode(node.elseBranch));
    }

    return ops;
  }

  /**
   * Calculate critical path through graph
   */
  private calculateCriticalPath(graph: Map<string, string[]>): string[] {
    const path: string[] = [];
    const visited = new Set<string>();

    // Find starting nodes (no dependencies)
    const startNodes: string[] = [];
    for (const [opId, deps] of graph) {
      if (deps.length === 0) {
        startNodes.push(opId);
      }
    }

    // DFS from start nodes
    if (startNodes.length > 0) {
      const current = startNodes[0];
      this.dfsPath(current, graph, visited, path);
    }

    return path;
  }

  /**
   * DFS to find longest path
   */
  private dfsPath(node: string, graph: Map<string, string[]>, visited: Set<string>, path: string[]): void {
    if (visited.has(node)) return;

    visited.add(node);
    path.push(node);

    // This is a simplified version - real critical path would track longest path
    for (const [opId, deps] of graph) {
      if (deps.includes(node) && !visited.has(opId)) {
        this.dfsPath(opId, graph, visited, path);
      }
    }
  }

  /**
   * Estimate speedup from parallelization factor
   */
  private estimateSpeedup(parallelizationFactor: number): number {
    // Amdahl's law with 20% sequential overhead
    const sequentialFraction = 0.2;
    return 1 / (sequentialFraction + (1 - sequentialFraction) / parallelizationFactor);
  }

  /**
   * Count total parallelizable operation pairs
   */
  private countParallelizablePairs(graph: Map<string, string[]>): number {
    let count = 0;
    const operations = Array.from(graph.keys());

    for (let i = 0; i < operations.length; i++) {
      for (let j = i + 1; j < operations.length; j++) {
        const opA = operations[i];
        const opB = operations[j];
        const depsA = graph.get(opA) || [];
        const depsB = graph.get(opB) || [];

        // Check if operations are independent
        if (!depsA.includes(opB) && !depsB.includes(opA)) {
          count++;
        }
      }
    }

    return count;
  }
}
