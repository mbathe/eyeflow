/**
 * DAG Compilation Service
 * 
 * Responsible for:
 * 1. Converting semantic DAG JSON → LLM-IR binary
 * 2. Node placement decisions (which node executes each part)
 * 3. Preload resource calculation
 * 4. Optimization (parallelization, caching, etc.)
 */

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  ExecutionNodeType,
  ExecutorType,
  NodePlacementDecision,
  PlacementValidation,
  DAGNodeExecutionMetadata,
  DAGPreloadList,
  PreloadResource,
} from '../types/node-placement.types';

@Injectable()
export class DAGCompilationService {
  private readonly logger = new Logger(DAGCompilationService.name);

  constructor() {}

  // ==========================================
  // MAIN COMPILATION PIPELINE
  // ==========================================

  /**
   * Compile a semantic DAG to LLM-IR binary with node placements
   * 
   * Process:
   * 1. Parse DAG JSON
   * 2. Validate structure
   * 3. Determine executor types for each node
   * 4. Perform node placement (which Rust/Nest node executes)
   * 5. Calculate preload resources
   * 6. Generate LLM-IR binary
   * 7. Sign binary cryptographically
   */
  async compileDAG(
    dagJson: Record<string, any>,
    availableNodes: Array<{ node_id: string; type: ExecutionNodeType; capabilities: any }>,
  ): Promise<{
    irBinary: string;
    irChecksum: string;
    irSignature: string;
    signatureKeyId: string;
    nodePlacements: Record<string, NodePlacementDecision>;
    preloadResources: DAGPreloadList;
    validationReport: Record<string, any>;
  }> {
    try {
      this.logger.log(`Compiling DAG: ${dagJson.dag_id}`);

      // Step 1: Validate DAG structure
      const validation = this.validateDAG(dagJson);
      if (!validation.valid) {
        throw new BadRequestException(`DAG validation failed: ${validation.errors.join(', ')}`);
      }

      // Step 2: Determine executor types for each node
      const executorTypes = this.determineExecutorTypes(dagJson);

      // Step 3: Perform node placement
      const placementValidation = this.performNodePlacement(
        dagJson,
        executorTypes,
        availableNodes,
      );

      if (!placementValidation.valid) {
        throw new BadRequestException(`Node placement failed: ${placementValidation.errors.join(', ')}`);
      }

      const placements = placementValidation.placements;

      // Step 4: Calculate preload resources
      const preloadList = this.calculatePreloadResources(dagJson, placements);

      // Step 5: Generate LLM-IR binary
      const irBinary = this.generateIRBinary(dagJson, placements, preloadList);

      // Step 6: Calculate checksums
      const irChecksum = this.computeChecksum(irBinary);
      const dagChecksum = this.computeChecksum(JSON.stringify(dagJson));

      // Step 7: Sign binary
      const { signature, keyId } = this.signBinary(irBinary);

      this.logger.log(`DAG compiled successfully: dag_id=${dagJson.dag_id}, ir_checksum=${irChecksum}`);

      return {
        irBinary: Buffer.from(irBinary).toString('base64'),
        irChecksum,
        irSignature: signature,
        signatureKeyId: keyId,
        nodePlacements: Object.fromEntries(placements.map((p) => [p.dag_node_id, p])),
        preloadResources: preloadList,
        validationReport: {
          ...validation,
          placements: placementValidation,
          executorTypes,
          preloadCount: preloadList.resources.length,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`DAG compilation failed: ${msg}`);
      throw error;
    }
  }

  // ==========================================
  // STEP 1: DAG VALIDATION
  // ==========================================

  private validateDAG(dagJson: Record<string, any>): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!dagJson.dag_id) errors.push('Missing dag_id');
    if (!dagJson.nodes || !Array.isArray(dagJson.nodes)) errors.push('Missing nodes array');
    if (!dagJson.edges || !Array.isArray(dagJson.edges)) errors.push('Missing edges array');

    if (errors.length > 0) {
      return { valid: false, errors, warnings };
    }

    // Check node IDs are unique
    const nodeIds = new Set(dagJson.nodes.map((n: any) => n.id));
    if (nodeIds.size !== dagJson.nodes.length) {
      errors.push('Duplicate node IDs');
    }

    // Check edges reference valid nodes
    for (const edge of dagJson.edges) {
      if (!nodeIds.has(edge.from)) {
        errors.push(`Edge references unknown source node: ${edge.from}`);
      }
      if (!nodeIds.has(edge.to)) {
        errors.push(`Edge references unknown target node: ${edge.to}`);
      }
    }

    // Check for cycles (DAG must be acyclic)
    if (this.hasCycles(dagJson.nodes, dagJson.edges)) {
      errors.push('DAG contains cycles (not a valid DAG)');
    }

    // Check for unreachable nodes
    const reachable = this.getReachableNodes(dagJson.nodes, dagJson.edges);
    const unreachable = dagJson.nodes.filter((n: any) => !reachable.has(n.id));
    if (unreachable.length > 0) {
      warnings.push(`Unreachable nodes: ${unreachable.map((n: any) => n.id).join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ==========================================
  // STEP 2: DETERMINE EXECUTOR TYPES
  // ==========================================

  /**
   * For each DAG node, determine what type of executor it needs
   */
  private determineExecutorTypes(dagJson: Record<string, any>): Record<string, ExecutorType> {
    const types: Record<string, ExecutorType> = {};

    for (const node of dagJson.nodes) {
      if (node.type === 'TRIGGER' || node.type === 'trigger') {
        types[node.id] = ExecutorType.TRIGGER_HANDLER;
      } else if (node.type === 'CONDITION' || node.type === 'condition') {
        types[node.id] = ExecutorType.CONDITION_EVALUATOR;
      } else if (node.type === 'MCP' || node.type === 'mcp_call') {
        types[node.id] = ExecutorType.MCP_SERVER_CALL;
      } else if (node.type === 'LLM' || node.type === 'llm_inference') {
        types[node.id] = ExecutorType.LLM_INFERENCE;
      } else if (node.type === 'ACTION' || node.type === 'action') {
        types[node.id] = ExecutorType.ACTION_HANDLER;
      } else if (node.type === 'FALLBACK' || node.type === 'fallback') {
        types[node.id] = ExecutorType.FALLBACK_HANDLER;
      } else if (node.type === 'TRANSFORM' || node.type === 'transform') {
        types[node.id] = ExecutorType.DATA_TRANSFORMER;
      } else if (node.type === 'SCRIPT' || node.type === 'script') {
        types[node.id] = ExecutorType.SCRIPT_EXECUTOR;
      } else {
        types[node.id] = ExecutorType.ACTION_HANDLER; // Default
      }
    }

    return types;
  }

  // ==========================================
  // STEP 3: NODE PLACEMENT
  // ==========================================

  /**
   * Decide where each DAG node executes (Nest.js or Rust edge device)
   * 
   * Rules:
   * - MCP_SERVER_CALL, LLM_INFERENCE → must go to Nest.js (central)
   * - Rust nodes handle: TRIGGER, CONDITION, ACTION, FALLBACK, TRANSFORM
   * - Place based on node capabilities and latency optimization
   */
  private performNodePlacement(
    dagJson: Record<string, any>,
    executorTypes: Record<string, ExecutorType>,
    availableNodes: Array<{ node_id: string; type: ExecutionNodeType; capabilities: any }>,
  ): PlacementValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    const placements: NodePlacementDecision[] = [];

    // Separate Nest.js and Rust nodes
    const nestNodes = availableNodes.filter((n) => n.type === ExecutionNodeType.NEST_JS_CENTRAL);
    const rustNodes = availableNodes.filter((n) => n.type === ExecutionNodeType.RUST_EDGE);

    if (nestNodes.length === 0) {
      errors.push('No Nest.js (central) node available');
    }

    // For each DAG node, determine placement
    for (const dagNode of dagJson.nodes) {
      const executorType = executorTypes[dagNode.id];

      // Nodes that MUST go to Nest.js
      if (
        executorType === ExecutorType.MCP_SERVER_CALL ||
        executorType === ExecutorType.LLM_INFERENCE
      ) {
        if (nestNodes.length === 0) {
          errors.push(
            `No Nest.js node available for ${executorType} (required for node ${dagNode.id})`,
          );
        } else {
          placements.push({
            dag_node_id: dagNode.id,
            target_node_id: nestNodes[0].node_id,
            target_node_type: ExecutionNodeType.NEST_JS_CENTRAL,
            executor_type: executorType,
          });
        }
      } else {
        // Try to place on Rust edge
        const capableRustNode = rustNodes.find((rn) =>
          this.canExecute(rn.capabilities, executorType, dagNode),
        );

        if (capableRustNode) {
          placements.push({
            dag_node_id: dagNode.id,
            target_node_id: capableRustNode.node_id,
            target_node_type: ExecutionNodeType.RUST_EDGE,
            executor_type: executorType,
            fallback_target: nestNodes[0]?.node_id,
          });
        } else {
          // Fallback to Nest.js if no Rust node capable
          if (nestNodes.length > 0) {
            warnings.push(
              `No capable Rust node for ${dagNode.id}, falling back to Nest.js (central)`,
            );
            placements.push({
              dag_node_id: dagNode.id,
              target_node_id: nestNodes[0].node_id,
              target_node_type: ExecutionNodeType.NEST_JS_CENTRAL,
              executor_type: executorType,
            });
          } else {
            errors.push(`No node available for ${dagNode.id} (executor: ${executorType})`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      placements,
    };
  }

  /**
   * Check if a Rust node can execute a given executor type
   */
  private canExecute(
    capabilities: any,
    executorType: ExecutorType,
    dagNode: any,
  ): boolean {
    if (!capabilities.canExecute || !Array.isArray(capabilities.canExecute)) {
      return false;
    }

    // Check if node supports this executor type
    if (!capabilities.canExecute.includes(executorType)) {
      return false;
    }

    // Check connector support if relevant
    if (dagNode.connector) {
      const connectorType = dagNode.connector.split('://')[0];
      if (
        capabilities.connectorsSupported &&
        !capabilities.connectorsSupported.includes(connectorType)
      ) {
        return false;
      }
    }

    // Check action support if relevant
    if (dagNode.action && capabilities.actionsNotSupported) {
      if (capabilities.actionsNotSupported.includes(dagNode.action)) {
        return false;
      }
    }

    return true;
  }

  // ==========================================
  // STEP 4: PRELOAD RESOURCE CALCULATION
  // ==========================================

  /**
   * Calculate what resources should be preloaded on each node
   */
  private calculatePreloadResources(
    dagJson: Record<string, any>,
    placements: NodePlacementDecision[],
  ): DAGPreloadList {
    const resources: PreloadResource[] = [];
    const uniqueConnectors = new Set<string>();

    // Collect all used connectors
    for (const node of dagJson.nodes) {
      if (node.connector) {
        uniqueConnectors.add(node.connector);
      }
    }

    // For each unique connector, add preload resource
    for (const connector of uniqueConnectors) {
      resources.push({
        resource_id: `preload_${connector}`,
        type: 'connection',
        connector_id: connector,
        expires_at: new Date(Date.now() + 24 * 3600 * 1000), // 24 hours
      });
    }

    // Add schema preloads for data sources
    for (const node of dagJson.nodes) {
      if (node.config && node.config.schema) {
        resources.push({
          resource_id: `schema_${node.id}`,
          type: 'schema',
          metadata: node.config.schema,
        });
      }
    }

    return {
      dag_version_id: dagJson.dag_id,
      resources,
      generated_at: new Date(),
      valid_until: new Date(Date.now() + 24 * 3600 * 1000),
    };
  }

  // ==========================================
  // STEP 5: LLM-IR BINARY GENERATION
  // ==========================================

  /**
   * Generate binary IR from DAG + placements
   * This is a simplified version—full compiler would be much more complex
   */
  private generateIRBinary(
    dagJson: Record<string, any>,
    placements: NodePlacementDecision[],
    preloadList: DAGPreloadList,
  ): Buffer {
    // Create a structured IR format
    const ir = {
      dag_id: dagJson.dag_id,
      version: 1.0,
      generated_at: new Date().toISOString(),
      nodes: dagJson.nodes.map((node: any) => {
        const placement = placements.find((p) => p.dag_node_id === node.id);
        return {
          id: node.id,
          type: node.type,
          placement: placement,
          config: node.config,
        };
      }),
      edges: dagJson.edges,
      preload: preloadList.resources.map((r) => r.resource_id),
    };

    return Buffer.from(JSON.stringify(ir), 'utf-8');
  }

  // ==========================================
  // STEP 6-7: SIGNING & CHECKSUMS
  // ==========================================

  private computeChecksum(data: string | Buffer): string {
    const input = typeof data === 'string' ? data : data.toString('utf-8');
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  private signBinary(binary: Buffer): { signature: string; keyId: string } {
    // In production, use proper key management (KMS, HSM)
    // This is simplified for demo
    const keyId = 'demo_key_1';
    const signature = crypto
      .createHmac('sha256', Buffer.from(keyId))
      .update(binary)
      .digest('hex');

    return { signature, keyId };
  }

  // ==========================================
  // GRAPH ALGORITHMS
  // ==========================================

  private hasCycles(
    nodes: any[],
    edges: any[],
  ): boolean {
    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      stack.add(nodeId);

      for (const edge of edges) {
        if (edge.from === nodeId) {
          if (!visited.has(edge.to)) {
            if (dfs(edge.to)) return true;
          } else if (stack.has(edge.to)) {
            return true;
          }
        }
      }

      stack.delete(nodeId);
      return false;
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) return true;
      }
    }

    return false;
  }

  private getReachableNodes(nodes: any[], edges: any[]): Set<string> {
    // BFS from root nodes
    const reachable = new Set<string>();
    const roots = nodes.filter(
      (n) => !edges.some((e) => e.to === n.id),
    );

    const queue = [...roots.map((r) => r.id)];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (!reachable.has(current)) {
        reachable.add(current);

        for (const edge of edges) {
          if (edge.from === current && !reachable.has(edge.to)) {
            queue.push(edge.to);
          }
        }
      }
    }

    return reachable;
  }
}
