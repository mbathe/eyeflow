/**
 * Constraint Validator Service
 * Validates semantic tree against capability constraints
 * 
 * Responsibilities:
 * 1. Check resource constraints (CPU, memory, concurrent invocations)
 * 2. Detect circular dependencies
 * 3. Validate rate limits
 * 4. Check capability availability
 * 
 * @file src/compiler/frontend/services/constraint-validator.service.ts
 */

import { Injectable, Inject } from '@nestjs/common';
import { Logger } from 'winston';
import { 
  SemanticNode, 
  SemanticTree,
  ParseError,
  SemanticNodeGuards 
} from '../interfaces/semantic-node.interface';
import { ComponentRegistry, Constraint } from '../../../common/extensibility/index';

/**
 * Resource usage tracking
 */
interface ResourceUsage {
  totalCpu: number;
  totalMemory: number; // MB
  maxConcurrent: number;
  estimatedDuration: number; // ms
}

/**
 * Dependency graph for cycle detection
 */
interface DependencyGraph {
  nodes: Set<string>;
  edges: Map<string, Set<string>>;
}

@Injectable()
export class ConstraintValidatorService {
  private readonly logger: Logger;
  private readonly DEFAULT_TIMEOUT_MS = 300000; // 5 minutes

  constructor(
    @Inject('LOGGER') logger: Logger,
    private readonly componentRegistry: ComponentRegistry,
  ) {
    this.logger = logger.child({ context: 'ConstraintValidatorService' });
  }

  /**
   * Validate all constraints in semantic tree
   */
  async validate(tree: SemanticTree): Promise<ParseError[]> {
    const errors: ParseError[] = [];

    // Check 1: Circular dependencies
    errors.push(...this.checkCircularDependencies(tree));

    // Check 2: Resource constraints
    errors.push(...(await this.checkResourceConstraints(tree)));

    // Check 3: Rate limit constraints
    errors.push(...(await this.checkRateLimits(tree)));

    // Check 4: Capability availability
    errors.push(...(await this.checkCapabilityAvailability(tree)));

    // Check 5: Data flow compatibility
    errors.push(...this.checkDataFlow(tree));

    return errors;
  }

  /**
   * Check for circular dependencies in the execution graph
   */
  private checkCircularDependencies(tree: SemanticTree): ParseError[] {
    const errors: ParseError[] = [];

    // Build dependency graph
    const graph = this.buildDependencyGraph(tree);

    // Detect cycles using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    for (const node of graph.nodes) {
      if (!visited.has(node)) {
        const cycle = this.detectCycleDFS(node, graph, visited, recursionStack);
        if (cycle.length > 0) {
          errors.push({
            code: 'CIRCULAR_DEPENDENCY',
            message: `Circular dependency detected: ${cycle.join(' -> ')}`,
            lineNumber: 0,
            suggestions: ['Reorganize operations to break the cycle'],
          });
        }
      }
    }

    return errors;
  }

  /**
   * Build dependency graph from semantic tree
   */
  private buildDependencyGraph(tree: SemanticTree): DependencyGraph {
    const graph: DependencyGraph = {
      nodes: new Set(tree.operations.keys()),
      edges: new Map(),
    };

    // Initialize edge map
    for (const nodeId of graph.nodes) {
      graph.edges.set(nodeId, new Set());
    }

    // Add edges based on dependencies
    for (const [nodeId, node] of tree.operations) {
      if (node.metadata?.dependencies) {
        for (const depId of node.metadata.dependencies) {
          graph.edges.get(nodeId)?.add(depId);
        }
      }
    }

    return graph;
  }

  /**
   * Detect cycle using depth-first search
   */
  private detectCycleDFS(
    node: string,
    graph: DependencyGraph,
    visited: Set<string>,
    recursionStack: Set<string>,
  ): string[] {
    visited.add(node);
    recursionStack.add(node);

    const neighbors = graph.edges.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        const cycle = this.detectCycleDFS(neighbor, graph, visited, recursionStack);
        if (cycle.length > 0) {
          return [node, ...cycle];
        }
      } else if (recursionStack.has(neighbor)) {
        // Cycle detected
        return [node, neighbor];
      }
    }

    recursionStack.delete(node);
    return [];
  }

  /**
   * Check resource constraints (CPU, memory, concurrent)
   */
  private async checkResourceConstraints(tree: SemanticTree): Promise<ParseError[]> {
    const errors: ParseError[] = [];

    const totalResources = await this.calculateTotalResources(tree);

    // Check CPU budget (assuming 1.0 = full core)
    if (totalResources.totalCpu > 4.0) {
      errors.push({
        code: 'EXCESSIVE_CPU_USAGE',
        message: `Total CPU usage exceeds limit: ${totalResources.totalCpu.toFixed(2)} cores > 4.0`,
        lineNumber: 0,
        suggestions: ['Consider parallelizing operations to distribute load'],
      });
    }

    // Check memory budget (assuming 4GB limit)
    if (totalResources.totalMemory > 4096) {
      errors.push({
        code: 'EXCESSIVE_MEMORY_USAGE',
        message: `Total memory exceeds limit: ${totalResources.totalMemory}MB > 4096MB`,
        lineNumber: 0,
        suggestions: ['Use streaming or batch processing for large datasets'],
      });
    }

    // Check concurrent operations budget
    if (totalResources.maxConcurrent > 10) {
      errors.push({
        code: 'EXCESSIVE_CONCURRENCY',
        message: `Maximum concurrent operations exceeds limit: ${totalResources.maxConcurrent} > 10`,
        lineNumber: 0,
        suggestions: ['Limit parallel branches or add synchronization points'],
      });
    }

    // Check execution time budget
    if (totalResources.estimatedDuration > this.DEFAULT_TIMEOUT_MS) {
      errors.push({
        code: 'EXECUTION_TIMEOUT_RISK',
        message: `Estimated duration exceeds timeout: ${totalResources.estimatedDuration}ms > ${this.DEFAULT_TIMEOUT_MS}ms`,
        lineNumber: 0,
        suggestions: ['Parallelize independent operations', 'Add timeouts to long-running tasks'],
      });
    }

    return errors;
  }

  /**
   * Calculate total resource usage for the tree
   */
  private async calculateTotalResources(tree: SemanticTree): Promise<ResourceUsage> {
    const usage: ResourceUsage = {
      totalCpu: 0,
      totalMemory: 0,
      maxConcurrent: 0,
      estimatedDuration: 0,
    };

    for (const [id, node] of tree.operations) {
      if (!SemanticNodeGuards.isOperationNode(node)) continue;

      try {
        const capability = await this.componentRegistry.getCapability(node.operation.capabilityId);
        if (!capability) continue;

        // Accumulate resource estimates
        if (capability.estimatedCost?.cpu) {
          usage.totalCpu += capability.estimatedCost.cpu;
        }
        if (capability.estimatedCost?.memory) {
          usage.totalMemory += capability.estimatedCost.memory;
        }
        if (capability.estimatedCost?.concurrent) {
          usage.maxConcurrent = Math.max(usage.maxConcurrent, capability.estimatedCost.concurrent);
        }
        if (capability.estimatedDuration) {
          usage.estimatedDuration += capability.estimatedDuration;
        }
      } catch (error) {
        this.logger.warn('Failed to calculate resource usage', {
          operation: id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return usage;
  }

  /**
   * Check rate limit constraints
   */
  private async checkRateLimits(tree: SemanticTree): Promise<ParseError[]> {
    const errors: ParseError[] = [];
    const rateLimitMap = new Map<string, { count: number; limit: number }>();

    // Note: Constraints are defined at the CompilableComponent level,
    // not at individual Capability level. For now, we skip this check.
    // This will be implemented when constraints are accessible at Capability level.

    return errors;
  }

  /**
   * Check if all referenced capabilities exist
   */
  private async checkCapabilityAvailability(tree: SemanticTree): Promise<ParseError[]> {
    const errors: ParseError[] = [];

    for (const [id, node] of tree.operations) {
      if (!SemanticNodeGuards.isOperationNode(node)) continue;

      const { capabilityId } = node.operation;

      try {
        const capability = await this.componentRegistry.getCapability(capabilityId);
        if (!capability) {
          errors.push({
            code: 'CAPABILITY_NOT_AVAILABLE',
            message: `Capability not found: ${capabilityId}`,
            lineNumber: node.metadata?.sourceLineNumber ?? 0,
            suggestions: ['Verify capability is registered', 'Check capability ID spelling'],
          });
        }
      } catch (error) {
        errors.push({
          code: 'CAPABILITY_CHECK_FAILED',
          message: `Failed to check capability availability: ${capabilityId}`,
          lineNumber: node.metadata?.sourceLineNumber ?? 0,
        });
      }
    }

    return errors;
  }

  /**
   * Check data flow compatibility (types, references)
   */
  private checkDataFlow(tree: SemanticTree): ParseError[] {
    const errors: ParseError[] = [];

    for (const [id, node] of tree.operations) {
      if (!SemanticNodeGuards.isOperationNode(node)) continue;

      const { inputs } = node.operation;

      for (const [inputName, inputValue] of Object.entries(inputs)) {
        // Check references to other operations
        if (typeof inputValue === 'string' && inputValue.startsWith('action_')) {
          if (!tree.operations.has(inputValue)) {
            errors.push({
              code: 'INVALID_REFERENCE',
              message: `Reference to non-existent operation: ${inputValue}`,
              lineNumber: node.metadata?.sourceLineNumber ?? 0,
              context: `Input: ${inputName}`,
              suggestions: ['Check operation ID spelling'],
            });
          } else {
            // Check if referenced operation comes before current one (dependency order)
            const refOp = tree.operations.get(inputValue);
            if (refOp && !node.metadata?.dependencies?.includes(inputValue)) {
              // Should have dependency marked
              if (!node.metadata) {
                node.metadata = {
                  parallelizable: false,
                  dependencies: [inputValue],
                };
              } else if (!node.metadata.dependencies) {
                node.metadata.dependencies = [inputValue];
              } else {
                node.metadata.dependencies.push(inputValue);
              }
            }
          }
        }
      }
    }

    return errors;
  }

  /**
   * Estimate total execution duration
   */
  estimateExecutionDuration(tree: SemanticTree): number {
    let maxDuration = 0;

    for (const [id, node] of tree.operations) {
      const duration = node.metadata?.estimatedDuration || 0;
      maxDuration = Math.max(maxDuration, duration);
    }

    return maxDuration;
  }
}
