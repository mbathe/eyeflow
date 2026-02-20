/**
 * DAG Visualizer Service — spec §3.2 Phase 4 (Human Validation UI)
 *
 * "Avant déploiement, le DAG compilé est présenté à un human validator qui
 *  peut approuver ou rejeter chaque transition.  La visualisation montre les
 *  nœuds, les arêtes, les opcodes et les métadonnées de dispatch."
 *
 * This service converts a compiled LLM-IR object into two formats:
 *   • D3-compatible JSON (nodes + edges + meta)          → default
 *   • Mermaid.js flowchart markup                        → ?format=mermaid
 *
 * Node types produced (aligned with spec §3.4 IROpcode):
 *   TRIGGER, LOAD_RESOURCE, STORE_MEMORY, CALL_SERVICE, CALL_ACTION,
 *   CALL_MCP, LLM_CALL, TRANSFORM, VALIDATE, BRANCH, LOOP, PARALLEL,
 *   HUMAN_APPROVAL, RETURN, AGGREGATE, FILTER
 */

import { Injectable, Logger } from '@nestjs/common';
import { IROpcode, LLMIntermediateRepresentation, IRInstruction, LoopOperands } from '../interfaces/ir.interface';

// ── Public types ──────────────────────────────────────────────────────────────

export interface DagNode {
  id: string;
  label: string;
  type: string;           // IROpcode string or "TRIGGER"/"HUMAN_APPROVAL"
  index: number;          // instruction index in order array
  serviceId?: string;
  serviceVersion?: string;
  requiredTier?: string;  // "CENTRAL" | "LINUX" | "MCU" | "ANY"
  /** Optional position hints (frontend layout engine may override) */
  x?: number;
  y?: number;
  meta?: Record<string, unknown>;
}

export interface DagEdge {
  id: string;
  source: string;   // DagNode.id
  target: string;   // DagNode.id
  label?: string;   // "true" / "false" for branches, "body" / "exit" for loops
  conditional?: boolean;
}

export interface DagGraph {
  workflowId: string;
  workflowName: string;
  compiledAt?: string;
  version?: number;
  nodes: DagNode[];
  edges: DagEdge[];
  meta: {
    totalInstructions: number;
    hasBranch: boolean;
    hasLoop: boolean;
    hasHumanApproval: boolean;
    hasLlmCall: boolean;
    hasParallel: boolean;
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class DagVisualizerService {
  private readonly logger = new Logger(DagVisualizerService.name);

  /** Map opcode → short human-readable label */
  private static readonly OPCODE_LABELS: Record<string, string> = {
    [IROpcode.LOAD_RESOURCE]:   'Load',
    [IROpcode.STORE_MEMORY]:    'Store',
    [IROpcode.CALL_SERVICE]:    'Service',
    [IROpcode.CALL_ACTION]:     'Action',
    [IROpcode.CALL_MCP]:        'MCP',
    [IROpcode.LLM_CALL]:        'LLM',
    [IROpcode.TRANSFORM]:       'Transform',
    [IROpcode.VALIDATE]:        'Validate',
    [IROpcode.BRANCH]:          'Branch',
    [IROpcode.LOOP]:            'Loop',
    [IROpcode.JUMP]:            'Jump',
    [IROpcode.PARALLEL_SPAWN]:  'Parallel↑',
    [IROpcode.PARALLEL_MERGE]:  'Parallel↓',
    [IROpcode.AGGREGATE]:       'Aggregate',
    [IROpcode.FILTER]:          'Filter',
    [IROpcode.RETURN]:          'Return',
  };

  /**
   * Build a DagGraph from a compiled LLM-IR object.
   * This is the primary entry point called by the controller.
   */
  visualize(
    ir: LLMIntermediateRepresentation,
    workflowId: string,
  ): DagGraph {
    const meta = ir.metadata;
    const nodes: DagNode[] = [];
    const edges: DagEdge[] = [];

    const order: number[] = ir.instructionOrder ?? [];

    // Build a lookup map from instruction index → IRInstruction
    const instrByIndex = new Map<number, IRInstruction>();
    for (const instr of ir.instructions ?? []) {
      instrByIndex.set(instr.index, instr);
    }

    let hasHumanApproval = false;

    // ── Build nodes ───────────────────────────────────────────────────────────
    for (let pos = 0; pos < order.length; pos++) {
      const idx = order[pos];
      const instr = instrByIndex.get(idx);
      if (!instr) continue;

      const opcode: string = instr.opcode ?? 'UNKNOWN';
      const label = DagVisualizerService.OPCODE_LABELS[opcode] ?? opcode;

      // Human approval detection — spec §3.2 + §12.2
      const isHumanApproval =
        opcode === IROpcode.VALIDATE &&
        instr.serviceId?.toLowerCase().includes('approval');
      if (isHumanApproval) hasHumanApproval = true;

      const node: DagNode = {
        id: `n_${idx}`,
        label: instr.serviceId ? `${label}: ${instr.serviceId}` : label,
        type: isHumanApproval ? 'HUMAN_APPROVAL' : opcode,
        index: idx,
        serviceId: instr.serviceId,
        serviceVersion: instr.serviceVersion,
        requiredTier: instr.requiredTier,
        x: pos * 200,   // naive linear layout; frontend overrides
        y: 100,
        meta: this.buildNodeMeta(instr),
      };

      nodes.push(node);
    }

    // ── Build edges ───────────────────────────────────────────────────────────
    for (let pos = 0; pos < order.length; pos++) {
      const idx = order[pos];
      const instr = instrByIndex.get(idx);
      if (!instr) continue;

      const opcode: string = instr.opcode ?? 'UNKNOWN';

      if (opcode === IROpcode.RETURN || opcode === IROpcode.JUMP) {
        if (opcode === IROpcode.JUMP && instr.targetInstruction != null) {
          edges.push({
            id: `e_${idx}_jump`,
            source: `n_${idx}`,
            target: `n_${instr.targetInstruction}`,
            label: 'jump',
          });
        }
        continue;
      }

      if (opcode === IROpcode.BRANCH) {
        // True branch → targetInstruction
        if (instr.targetInstruction != null) {
          edges.push({
            id: `e_${idx}_true`,
            source: `n_${idx}`,
            target: `n_${instr.targetInstruction}`,
            label: 'true',
            conditional: true,
          });
        }
        // False branch → next sequential instruction
        if (pos + 1 < order.length) {
          edges.push({
            id: `e_${idx}_false`,
            source: `n_${idx}`,
            target: `n_${order[pos + 1]}`,
            label: 'false',
            conditional: true,
          });
        }
        continue;
      }

      if (opcode === IROpcode.LOOP && instr.operands) {
        const lo = instr.operands as LoopOperands;
        // Body start edge
        if (lo.bodyStartIndex != null) {
          edges.push({
            id: `e_${idx}_body`,
            source: `n_${idx}`,
            target: `n_${lo.bodyStartIndex}`,
            label: 'body',
          });
        }
        // Exit edge
        if (lo.exitIndex != null) {
          edges.push({
            id: `e_${idx}_exit`,
            source: `n_${idx}`,
            target: `n_${lo.exitIndex}`,
            label: 'exit',
            conditional: true,
          });
        }
        continue;
      }

      // Default: sequential edge to next instruction
      if (pos + 1 < order.length) {
        edges.push({
          id: `e_${idx}_next`,
          source: `n_${idx}`,
          target: `n_${order[pos + 1]}`,
        });
      }
    }

    // ── DAG metadata flags ────────────────────────────────────────────────────
    const opcodes = order.map(i => instrByIndex.get(i)?.opcode as string);

    const dagMeta: DagGraph['meta'] = {
      totalInstructions: order.length,
      hasBranch:         opcodes.includes(IROpcode.BRANCH),
      hasLoop:           opcodes.includes(IROpcode.LOOP),
      hasHumanApproval,
      hasLlmCall:        opcodes.includes(IROpcode.LLM_CALL),
      hasParallel:       opcodes.includes(IROpcode.PARALLEL_SPAWN),
    };

    this.logger.debug(
      `[DagVisualizer] workflow=${workflowId} → ${nodes.length} nodes, ${edges.length} edges`
    );

    return {
      workflowId,
      workflowName: meta?.workflowId ?? meta?.source ?? workflowId,
      compiledAt:   meta?.compiledAt instanceof Date
        ? meta.compiledAt.toISOString()
        : (meta?.compiledAt as any),
      version:      meta?.workflowVersion,
      nodes,
      edges,
      meta: dagMeta,
    };
  }

  /**
   * Convert a DagGraph to Mermaid.js flowchart markup.
   * Used by the ?format=mermaid query parameter.
   */
  toMermaid(graph: DagGraph): string {
    const lines: string[] = [
      `%%{init: {'theme': 'default'}}%%`,
      `flowchart TD`,
    ];

    // Node definitions
    for (const node of graph.nodes) {
      const safeLabel = node.label.replace(/"/g, "'");
      const shape = this.mermaidShape(node.type);
      lines.push(`  ${node.id}${shape.open}"${safeLabel}"${shape.close}`);
    }

    // Edge definitions
    for (const edge of graph.edges) {
      const arrow = edge.conditional ? '-->' : '-->';
      const lbl   = edge.label ? `|${edge.label}|` : '';
      lines.push(`  ${edge.source} ${arrow}${lbl} ${edge.target}`);
    }

    // Colour-code node types
    lines.push('');
    lines.push('  classDef llmNode fill:#6366f1,color:#fff,stroke:#4338ca');
    lines.push('  classDef approvalNode fill:#f59e0b,color:#fff,stroke:#d97706');
    lines.push('  classDef branchNode fill:#10b981,color:#fff,stroke:#059669');
    lines.push('  classDef loopNode fill:#3b82f6,color:#fff,stroke:#1d4ed8');
    lines.push('  classDef returnNode fill:#6b7280,color:#fff,stroke:#374151');

    const llmNodes      = graph.nodes.filter(n => n.type === IROpcode.LLM_CALL).map(n => n.id);
    const approvalNodes = graph.nodes.filter(n => n.type === 'HUMAN_APPROVAL').map(n => n.id);
    const branchNodes   = graph.nodes.filter(n => n.type === IROpcode.BRANCH).map(n => n.id);
    const loopNodes     = graph.nodes.filter(n => n.type === IROpcode.LOOP).map(n => n.id);
    const returnNodes   = graph.nodes.filter(n => n.type === IROpcode.RETURN).map(n => n.id);

    if (llmNodes.length)      lines.push(`  class ${llmNodes.join(',')} llmNode`);
    if (approvalNodes.length) lines.push(`  class ${approvalNodes.join(',')} approvalNode`);
    if (branchNodes.length)   lines.push(`  class ${branchNodes.join(',')} branchNode`);
    if (loopNodes.length)     lines.push(`  class ${loopNodes.join(',')} loopNode`);
    if (returnNodes.length)   lines.push(`  class ${returnNodes.join(',')} returnNode`);

    return lines.join('\n');
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private buildNodeMeta(instr: IRInstruction): Record<string, unknown> {
    const meta: Record<string, unknown> = {};
    if (instr.operands) {
      meta.operands = instr.operands;
    }
    if (instr.dispatchMetadata) {
      const dm = instr.dispatchMetadata;
      if ((dm as any).endpointUrl)  meta.endpoint  = (dm as any).endpointUrl;
      if ((dm as any).provider)     meta.provider  = (dm as any).provider;
      if ((dm as any).model)        meta.model     = (dm as any).model;
      if ((dm as any).format)       meta.format    = (dm as any).format;
    }
    if (instr.parallelGroupId != null) {
      meta.parallelGroupId = instr.parallelGroupId;
    }
    if (instr.targetNodeId) {
      meta.targetNodeId = instr.targetNodeId;
    }
    return meta;
  }

  private mermaidShape(type: string): { open: string; close: string } {
    switch (type) {
      case IROpcode.BRANCH:       return { open: '{',  close: '}' };
      case IROpcode.LOOP:         return { open: '((', close: '))' };
      case IROpcode.LLM_CALL:     return { open: '[/', close: '/]' };
      case 'HUMAN_APPROVAL':      return { open: '[\\', close: '\\]' };
      case IROpcode.PARALLEL_SPAWN:
      case IROpcode.PARALLEL_MERGE:
        return { open: '[|', close: '|]' };
      default:
        return { open: '[', close: ']' };
    }
  }
}
