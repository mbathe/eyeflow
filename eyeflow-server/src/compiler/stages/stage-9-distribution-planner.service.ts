/**
 * STAGE 9: Distribution Planner
 *
 * Input  : ResolvedIR (from Stage 7 — all services resolved with dispatch metadata)
 * Output : ResolvedIR with every instruction annotated with targetNodeId/sliceId
 *          + a DistributedExecutionPlan attached to ir.distributionPlan
 *
 * Responsibilities
 * ────────────────
 *  1. For each instruction, infer the minimum capability requirements
 *     (does it need Docker? MCP? I2C? Vault? Internet?)
 *  2. Query NodeRegistryService to find the best node
 *  3. Assign the instruction → node (respects parallel groups: keep them together
 *     on the same node to avoid unnecessary sync overhead)
 *  4. Group consecutive same-node instructions into ExecutionSlices
 *  5. Detect cross-node data flows (register values that move between slices)
 *  6. Generate SyncPoints (barriers at slice boundaries)
 *  7. Annotate each instruction with targetNodeId + sliceId
 *  8. Compute critical path and estimated total latency
 *
 * Design guarantee: if NO edge node is available for an instruction,
 * it always falls back to CENTRAL. The plan is always executable even
 * if all edge nodes are OFFLINE (degraded-mode, monolithic fallback).
 */

import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

import { ResolvedIR, IRInstruction, IROpcode, TriggerDescriptor } from '../interfaces/ir.interface';
import type {
  EventStateMachineDescriptor,
  RemoteCommandDescriptor,
  RemoteCommandHandlerDescriptor,
} from '../interfaces/event-state-machine.interface';
import {
  DistributedExecutionPlan,
  ExecutionSlice,
  CrossNodeDataFlow,
  SyncPoint,
  InstructionAssignment,
  AssignmentReason,
} from '../interfaces/distributed-execution.interface';
import { NodeRegistryService } from '../../nodes/node-registry.service';
import {
  NodeTier,
  ServiceFormat,
  PhysicalProtocol,
  CENTRAL_NODE_ID,
} from '../../nodes/interfaces/node-capability.interface';

// ─── Opcodes that ALWAYS require the CENTRAL node ─────────────────────────

const CENTRAL_ONLY_OPCODES = new Set<IROpcode>([
  // Currently none at the opcode level; we check dispatch metadata instead
]);

// ─── Protocol operand keywords → physical protocol mapping ────────────────

const PROTOCOL_KEYWORDS: Record<string, PhysicalProtocol> = {
  i2c: 'I2C',
  spi: 'SPI',
  uart: 'UART',
  gpio: 'GPIO',
  modbus: 'MODBUS',
  'opc-ua': 'OPC_UA',
  opcua: 'OPC_UA',
  mqtt: 'MQTT',
};

@Injectable()
export class DistributionPlannerService {
  private readonly logger = new Logger(DistributionPlannerService.name);

  constructor(private readonly nodeRegistry: NodeRegistryService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Main entry point.
   * Returns the same IR but with:
   *  – each instruction annotated with targetNodeId, sliceId, requiredCapabilities
   *  – ir.distributionPlan populated
   */
  async plan(ir: ResolvedIR): Promise<ResolvedIR> {
    this.logger.log(
      `[Stage 9] Planning distribution for ${ir.instructions.length} instructions across available nodes`
    );
    this.logger.log(`[Stage 9] ${this.nodeRegistry.summary()}`);

    // ── Step 1: Assign each instruction to a node ─────────────────────────
    const assignments = this.assignInstructions(ir);

    // ── Step 2: Group into slices ─────────────────────────────────────────
    const slices = this.buildSlices(ir, assignments);

    // ── Step 3: Detect cross-node data flows ──────────────────────────────
    const dataFlows = this.detectDataFlows(ir, assignments);

    // ── Step 4: Build sync points ─────────────────────────────────────────
    const syncPoints = this.buildSyncPoints(ir, slices, dataFlows);

    // ── Step 5: Critical path + latency estimate ──────────────────────────
    const { criticalPath, estimatedTotalLatencyMs } = this.computeCriticalPath(
      ir,
      assignments,
      slices
    );

    // ── Step 6: Annotate IR instructions ─────────────────────────────────
    const annotatedInstructions = ir.instructions.map(instr => {
      const a = assignments.find(x => x.instructionIndex === instr.index)!;
      const s = slices.find(sl => sl.instructions.some(si => si.index === instr.index));
      return {
        ...instr,
        targetNodeId: a.assignedNodeId,
        sliceId: s?.sliceId,
      } as IRInstruction;
    });

    // ── Step 7: Build the plan ────────────────────────────────────────────
    const plan: DistributedExecutionPlan = {
      planId: crypto.randomUUID(),
      workflowId: ir.metadata.workflowId ?? 'unknown',
      workflowVersion: ir.metadata.workflowVersion ?? 1,
      slices,
      dataFlows,
      syncPoints,
      criticalPath,
      estimatedTotalLatencyMs,
      nodeCount: new Set(assignments.map(a => a.assignedNodeId)).size,
      isDistributed: assignments.some(a => a.assignedNodeId !== CENTRAL_NODE_ID),
      compiledAt: new Date(),
      assignments,
    };

    if (plan.isDistributed) {
      this.logger.log(
        `[Stage 9] Distributed plan: ${plan.slices.length} slices across ${plan.nodeCount} nodes`
      );
      const nodeCounts: Record<string, number> = {};
      for (const a of assignments) {
        nodeCounts[a.assignedNodeId] = (nodeCounts[a.assignedNodeId] ?? 0) + 1;
      }
      for (const [nodeId, count] of Object.entries(nodeCounts)) {
        this.logger.log(`[Stage 9]   ${nodeId}: ${count} instructions`);
      }
    } else {
      this.logger.log(`[Stage 9] Monolithic plan: all instructions on CENTRAL`);
    }

    return {
      ...ir,
      instructions: annotatedInstructions,
      distributionPlan: plan,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 1: Assign each instruction to a node
  // ──────────────────────────────────────────────────────────────────────────

  private assignInstructions(ir: ResolvedIR): InstructionAssignment[] {
    const assignments: InstructionAssignment[] = [];
    // Track parallel group → assigned node (keep group together)
    const parallelGroupNode = new Map<number, string>();

    for (const idx of ir.instructionOrder) {
      const instr = ir.instructions[idx];
      const requirements = this.inferRequirements(instr, ir);
      instr.requiredCapabilities = requirements.capabilities;

      // If part of a parallel group already assigned, keep it together
      if (
        instr.parallelGroupId !== undefined &&
        parallelGroupNode.has(instr.parallelGroupId)
      ) {
        const nodeId = parallelGroupNode.get(instr.parallelGroupId)!;
        assignments.push({
          instructionIndex: instr.index,
          assignedNodeId: nodeId,
          reason: 'PARALLEL_AFFINITY',
          estimatedMs: requirements.estimatedMs,
        });
        continue;
      }

      const nodeId = requirements.forcedNodeId
        ?? this.nodeRegistry.bestNodeFor({
          formats: requirements.capabilities.formats as ServiceFormat[],
          protocols: requirements.capabilities.protocols as PhysicalProtocol[],
          connectorId: requirements.capabilities.connectorId,
          needsVault: requirements.capabilities.needsVault,
          needsInternet: requirements.capabilities.needsInternet,
          minMemoryMb: requirements.capabilities.minMemoryMb,
          preferredTier: requirements.preferredTier,
          hasEmbeddedJsRuntime: (requirements.capabilities as any).hasEmbeddedJsRuntime,
          hasLLMAccess: (requirements.capabilities as any).hasLLMAccess,
        });

      // Register group assignment
      if (instr.parallelGroupId !== undefined) {
        parallelGroupNode.set(instr.parallelGroupId, nodeId);
      }

      assignments.push({
        instructionIndex: instr.index,
        assignedNodeId: nodeId,
        reason: requirements.reason,
        estimatedMs: requirements.estimatedMs,
      });
    }

    return assignments;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Requirement inference: opcode + dispatch metadata → capability constraints
  // ──────────────────────────────────────────────────────────────────────────

  private inferRequirements(
    instr: IRInstruction,
    ir: ResolvedIR
  ): {
    capabilities: NonNullable<IRInstruction['requiredCapabilities']>;
    reason: AssignmentReason;
    estimatedMs: number;
    preferredTier?: NodeTier;
    /**
     * When set, bypasses bestNodeFor() and pins the instruction directly
     * to this nodeId. Used for custom TRIGGER drivers whose owning node is
     * discovered via NodeRegistry.findNodeForTriggerDriver().
     */
    forcedNodeId?: string;
  } {
    const caps: NonNullable<IRInstruction['requiredCapabilities']> = {};

    // ── Check dispatch metadata (set by Stage 7) ──────────────────────────
    const dispatch = instr.dispatchMetadata;
    if (dispatch) {
      switch (dispatch.format) {
        case 'DOCKER':
          caps.formats = ['DOCKER'];
          return {
            capabilities: caps,
            reason: 'REQUIRES_DOCKER',
            estimatedMs: dispatch.timeout ?? 5000,
          };

        case 'MCP':
          caps.formats = ['MCP'];
          return {
            capabilities: caps,
            reason: 'REQUIRES_MCP',
            estimatedMs: dispatch.timeout ?? 2000,
          };

        case 'WASM':
          caps.formats = ['WASM'];
          caps.minMemoryMb = dispatch.wasmMemory ?? 32;
          return {
            capabilities: caps,
            reason: 'WASM_CAPABLE',
            estimatedMs: dispatch.timeout ?? 200,
            preferredTier: NodeTier.LINUX, // prefer edge for WASM
          };

        case 'NATIVE':
          caps.formats = ['NATIVE'];
          return {
            capabilities: caps,
            reason: 'NATIVE_BINARY',
            estimatedMs: dispatch.timeout ?? 100,
            preferredTier: NodeTier.LINUX,
          };

        case 'HTTP':
          caps.needsInternet = true;
          return {
            capabilities: caps,
            reason: 'REQUIRES_INTERNET',
            estimatedMs: dispatch.timeout ?? 500,
          };

        case 'GRPC':
          caps.formats = ['GRPC'];
          caps.needsInternet = true;
          return {
            capabilities: caps,
            reason: 'REQUIRES_INTERNET',
            estimatedMs: dispatch.timeout ?? 300,
            preferredTier: NodeTier.LINUX,
          };

        case 'EMBEDDED_JS':
          // Requires a Node.js runtime — CENTRAL always satisfies this;
          // a LINUX node may if it ships Node.js alongside the Rust SVM.
          (caps as any).hasEmbeddedJsRuntime = true;
          return {
            capabilities: caps,
            reason: 'CAPABILITY_FALLBACK',
            estimatedMs: dispatch.timeout ?? 100,
            preferredTier: NodeTier.CENTRAL,
          };

        case 'CONNECTOR': {
          // Route by the underlying protocol of the connector:
          //   Database / Kafka / Slack / HTTP webhook → CENTRAL (vault, full ecosystem)
          //   MQTT broker                              → any tier with internet
          //   GPIO / I2C / SPI sensor                  → MCU
          const connectorType: string =
            (dispatch as any).connectorType ?? '';
          if (['gpio', 'i2c', 'spi', 'uart'].includes(connectorType.toLowerCase())) {
            caps.protocols = ['GPIO'];
            return {
              capabilities: caps,
              reason: 'PHYSICAL_PROTOCOL',
              estimatedMs: 20,
              preferredTier: NodeTier.MCU,
            };
          }
          if (connectorType.toLowerCase() === 'mqtt') {
            caps.needsInternet = true;
            return {
              capabilities: caps,
              reason: 'REQUIRES_INTERNET',
              estimatedMs: 150,
            };
          }
          // Default: DB, Kafka, REST hooks → CENTRAL (vault + connection pools)
          caps.formats = ['CONNECTOR'];
          caps.needsVault = true;
          return {
            capabilities: caps,
            reason: 'REQUIRES_VAULT',
            estimatedMs: dispatch.timeout ?? 200,
            preferredTier: NodeTier.CENTRAL,
          };
        }

        case 'LLM_CALL':
          caps.needsInternet = true;
          caps.needsVault = true;    // API key in vault
          (caps as any).hasLLMAccess = true;
          return {
            capabilities: caps,
            reason: 'REQUIRES_VAULT',
            estimatedMs: dispatch.timeout ?? 2000,
            preferredTier: NodeTier.CENTRAL, // ensure vault access
          };
      }
    }

    // ── Infer from opcode + operands ──────────────────────────────────────
    const ops = instr.operands ?? {};

    // Physical protocol in operands (e.g. { protocol: 'i2c', address: '0x48' })
    if (ops.protocol) {
      const proto = PROTOCOL_KEYWORDS[ops.protocol?.toLowerCase()];
      if (proto) {
        caps.protocols = [proto];
        const tier =
          ['I2C', 'SPI', 'UART', 'GPIO'].includes(proto)
            ? NodeTier.MCU
            : NodeTier.LINUX;
        return {
          capabilities: caps,
          reason: 'PHYSICAL_PROTOCOL',
          estimatedMs: 50,
          preferredTier: tier,
        };
      }
    }

    // Connector ID in operands
    if (ops.connectorId) {
      caps.connectorId = ops.connectorId;
    }

    // Vault / secret reference in operands
    if (ops.secretRef || ops.vaultPath) {
      caps.needsVault = true;
      return {
        capabilities: caps,
        reason: 'REQUIRES_VAULT',
        estimatedMs: 200,
      };
    }

    // ── TRIGGER opcode: assign to node that has the right driver capability ─
    if (instr.opcode === IROpcode.TRIGGER) {
      const triggerDesc = ops as TriggerDescriptor | undefined;
      const driverId = triggerDesc?.driverId ?? '';

      // Drivers that require physical proximity → edge / MCU
      if (['mqtt'].includes(driverId)) {
        // MQTT: any tier — prefer LINUX edge if available, MCU if protocol is specified
        const hasMcuProtocol = !!triggerDesc?.driverConfig?.protocol;
        if (hasMcuProtocol) {
          caps.protocols = ['MQTT'];
          return {
            capabilities: caps,
            reason: 'PHYSICAL_PROTOCOL',
            estimatedMs: 5,
            preferredTier: NodeTier.MCU,
          };
        }
        return {
          capabilities: caps,
          reason: 'CAPABILITY_FALLBACK',
          estimatedMs: 5,
          preferredTier: NodeTier.LINUX,
        };
      }

      if (driverId === 'filesystem') {
        // Filesystem watcher: must be on a node with disk access (LINUX / CENTRAL)
        return {
          capabilities: caps,
          reason: 'DATA_LOCALITY',
          estimatedMs: 2,
          preferredTier: NodeTier.LINUX,
        };
      }

      if (driverId === 'http-webhook') {
        // Webhooks: needs internet-facing port — always CENTRAL
        caps.needsInternet = true;
        return {
          capabilities: caps,
          reason: 'REQUIRES_INTERNET',
          estimatedMs: 1,
          preferredTier: NodeTier.CENTRAL,
        };
      }

      if (driverId === 'imap') {
        // IMAP: needs internet + vault for credentials
        caps.needsInternet = true;
        caps.needsVault = true;
        return {
          capabilities: caps,
          reason: 'REQUIRES_VAULT',
          estimatedMs: 5,
          preferredTier: NodeTier.CENTRAL,
        };
      }

      if (driverId === 'cron' || driverId === 'kafka') {
        // Scheduler / Kafka: prefer CENTRAL (reliable clock / Kafka access)
        return {
          capabilities: caps,
          reason: 'CAPABILITY_FALLBACK',
          estimatedMs: 1,
          preferredTier: NodeTier.CENTRAL,
        };
      }

      // Unknown/custom driver: ask NodeRegistry which node declared it
      // (set by the node in its registration manifest)
      const ownerNodeId = this.nodeRegistry.findNodeForTriggerDriver(driverId);
      if (ownerNodeId !== CENTRAL_NODE_ID) {
        this.logger.log(
          `[Stage 9] Custom TRIGGER driver '${driverId}' → node '${ownerNodeId}' ` +
          `(declared in node manifest)`,
        );
      } else {
        this.logger.warn(
          `[Stage 9] Unknown TRIGGER driverId '${driverId}' — no node declared it, ` +
          `assigning to CENTRAL as fallback`,
        );
      }
      return {
        capabilities: caps,
        reason: 'CAPABILITY_FALLBACK',
        estimatedMs: 1,
        preferredTier: NodeTier.CENTRAL,
        // Pin to the exact node that declared this driver, bypassing bestNodeFor().
        // Without this, CENTRAL's '*' wildcard would always win.
        forcedNodeId: ownerNodeId,
      };
    }

    // ── EVENT_STATE_MACHINE: assign to the node carrying the required sensors ──
    // The compiler should set descriptor.targetNodeId during the decomposition phase.
    // If not set, default to CENTRAL (in-process FSM execution).
    if (instr.opcode === IROpcode.EVENT_STATE_MACHINE) {
      const fsmDesc = ops as EventStateMachineDescriptor | undefined;
      const targetNodeId = fsmDesc?.targetNodeId ?? CENTRAL_NODE_ID;

      if (targetNodeId !== CENTRAL_NODE_ID) {
        this.logger.log(
          `[Stage 9] EVENT_STATE_MACHINE "${fsmDesc?.machineId ?? '?'}" → ` +
          `edge node "${targetNodeId}" (compiled targetNodeId)`,
        );
      } else {
        this.logger.log(
          `[Stage 9] EVENT_STATE_MACHINE "${fsmDesc?.machineId ?? '?'}" → CENTRAL (in-process)`,
        );
      }

      return {
        capabilities: caps,
        reason: 'CAPABILITY_FALLBACK',
        estimatedMs: 5,
        preferredTier: NodeTier.CENTRAL,
        forcedNodeId: targetNodeId,
      };
    }

    // ── HANDLE_PROPAGATED: always CENTRAL (event aggregation, ticket systems, etc.) ──
    if (instr.opcode === IROpcode.HANDLE_PROPAGATED) {
      return {
        capabilities: caps,
        reason: 'CAPABILITY_FALLBACK',
        estimatedMs: 50,
        preferredTier: NodeTier.CENTRAL,
        forcedNodeId: CENTRAL_NODE_ID,
      };
    }

    // ── REMOTE_COMMAND: always dispatched FROM CENTRAL, but targets an edge node. ──
    // The instruction itself runs on CENTRAL (it sends the command).
    // The targetNodeId in the descriptor indicates the RECIPIENT, not the runner.
    if (instr.opcode === IROpcode.REMOTE_COMMAND) {
      const cmdDesc = ops as RemoteCommandDescriptor | undefined;
      this.logger.log(
        `[Stage 9] REMOTE_COMMAND "${cmdDesc?.command ?? '?'}" → ` +
        `dispatched from CENTRAL to node "${cmdDesc?.targetNodeId ?? '?'}"`,
      );
      return {
        capabilities: caps,
        reason: 'CAPABILITY_FALLBACK',
        estimatedMs: 10,
        preferredTier: NodeTier.CENTRAL,
        forcedNodeId: CENTRAL_NODE_ID,
      };
    }

    // ── HANDLE_REMOTE_CMD: runs on the edge node that receives remote commands. ──
    // The node ID should be provided via instr.targetNodeId (set by the compiler).
    if (instr.opcode === IROpcode.HANDLE_REMOTE_CMD) {
      const handlerDesc = ops as RemoteCommandHandlerDescriptor | undefined;
      const targetNodeId = instr.targetNodeId ?? CENTRAL_NODE_ID;
      this.logger.log(
        `[Stage 9] HANDLE_REMOTE_CMD (listensFor: ${handlerDesc?.listensFor?.join(', ')}) → ` +
        `edge node "${targetNodeId}"`,
      );
      return {
        capabilities: caps,
        reason: 'CAPABILITY_FALLBACK',
        estimatedMs: 10,
        preferredTier: NodeTier.LINUX,
        forcedNodeId: targetNodeId,
      };
    }

    // Internet-required opcodes
    if (
      instr.opcode === IROpcode.CALL_SERVICE ||
      instr.opcode === IROpcode.CALL_ACTION ||
      ops.url?.startsWith('http')
    ) {
      caps.needsInternet = ops.url?.startsWith('https') || ops.url?.startsWith('http');
      if (caps.needsInternet) {
        return {
          capabilities: caps,
          reason: 'REQUIRES_INTERNET',
          estimatedMs: 500,
        };
      }
    }

    // Pure data operations — can run anywhere
    if (
      instr.opcode === IROpcode.TRANSFORM ||
      instr.opcode === IROpcode.FILTER ||
      instr.opcode === IROpcode.AGGREGATE ||
      instr.opcode === IROpcode.VALIDATE ||
      instr.opcode === IROpcode.LOAD_RESOURCE ||
      instr.opcode === IROpcode.STORE_MEMORY
    ) {
      return {
        capabilities: caps,
        reason: 'DATA_LOCALITY',
        estimatedMs: 10,
        preferredTier: NodeTier.LINUX, // lightweight, run on edge to save central bandwidth
      };
    }

    // Fallback: CENTRAL handles everything not explicitly classified
    return {
      capabilities: caps,
      reason: 'CAPABILITY_FALLBACK',
      estimatedMs: 100,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 2: Group instructions into execution slices
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * A new slice starts whenever:
   *  – the assigned node changes, OR
   *  – a PARALLEL_SPAWN opcode is encountered (forks a new slice per parallel branch)
   */
  private buildSlices(
    ir: ResolvedIR,
    assignments: InstructionAssignment[]
  ): ExecutionSlice[] {
    const slices: ExecutionSlice[] = [];
    const assignMap = new Map(assignments.map(a => [a.instructionIndex, a]));

    let currentSlice: ExecutionSlice | null = null;

    for (const idx of ir.instructionOrder) {
      const instr = ir.instructions[idx];
      const assignment = assignMap.get(idx)!;
      const nodeId = assignment.assignedNodeId;

      // Do we need to start a new slice?
      const needNewSlice =
        !currentSlice ||
        currentSlice.nodeId !== nodeId ||
        instr.opcode === IROpcode.PARALLEL_SPAWN;

      if (needNewSlice) {
        if (currentSlice) slices.push(currentSlice);

        const isRoot = slices.length === 0 || instr.opcode === IROpcode.PARALLEL_SPAWN;
        currentSlice = {
          sliceId: `slice-${slices.length}-${nodeId}`,
          nodeId,
          instructions: [],
          instructionOrder: [],
          inputBindings: {},
          outputBindings: [],
          isRoot,
          dependsOnSlices: currentSlice ? [currentSlice.sliceId] : [],
          estimatedDurationMs: 0,
          checksum: '',
        };
      }

      currentSlice!.instructions.push(instr);
      currentSlice!.instructionOrder.push(idx);
      currentSlice!.estimatedDurationMs += assignment.estimatedMs;
    }

    if (currentSlice) slices.push(currentSlice);

    // Ensure there is always a 'central' root slice
    if (slices.length > 0 && slices[0].nodeId === CENTRAL_NODE_ID) {
      slices[0].sliceId = 'central';
      slices[0].isRoot = true;
    }

    // Compute checksums
    for (const slice of slices) {
      slice.checksum = crypto
        .createHash('sha256')
        .update(JSON.stringify(slice.instructions))
        .digest('hex');
    }

    return slices;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 3: Detect cross-node data flows (register values crossing boundaries)
  // ──────────────────────────────────────────────────────────────────────────

  private detectDataFlows(
    ir: ResolvedIR,
    assignments: InstructionAssignment[]
  ): CrossNodeDataFlow[] {
    const flows: CrossNodeDataFlow[] = [];
    const nodeByIdx = new Map(assignments.map(a => [a.instructionIndex, a.assignedNodeId]));

    for (const instr of ir.instructions) {
      if (!instr.src) continue;
      const destNode = nodeByIdx.get(instr.index);

      for (const srcReg of instr.src) {
        // Find which instruction writes this register
        const producerInstr = ir.instructions.find(
          i => i.dest === srcReg && i.index < instr.index
        );
        if (!producerInstr) continue;

        const srcNode = nodeByIdx.get(producerInstr.index);
        if (srcNode && destNode && srcNode !== destNode) {
          flows.push({
            flowId: `flow-${producerInstr.index}->${instr.index}`,
            fromNodeId: srcNode,
            fromRegister: srcReg,
            toNodeId: destNode,
            toRegister: srcReg, // same register number, different node's register file
          });
        }
      }
    }

    // Deduplicate
    const seen = new Set<string>();
    return flows.filter(f => {
      const key = `${f.fromNodeId}:${f.fromRegister}->${f.toNodeId}:${f.toRegister}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 4: Build sync points (barriers at slice boundaries)
  // ──────────────────────────────────────────────────────────────────────────

  private buildSyncPoints(
    ir: ResolvedIR,
    slices: ExecutionSlice[],
    dataFlows: CrossNodeDataFlow[]
  ): SyncPoint[] {
    const syncPoints: SyncPoint[] = [];
    const centralSlice = slices.find(s => s.nodeId === CENTRAL_NODE_ID);
    if (!centralSlice) return syncPoints;

    // For each remote slice, build a sync point in the central slice
    const remoteSlices = slices.filter(s => s.nodeId !== CENTRAL_NODE_ID);

    for (const remote of remoteSlices) {
      // Find the first central instruction that consumes a result from this remote slice
      const inboundFlows = dataFlows.filter(
        f => f.fromNodeId === remote.nodeId && f.toNodeId === CENTRAL_NODE_ID
      );

      if (inboundFlows.length === 0) continue; // no data comes back → fire-and-forget

      // Resume after the last instruction of the current central batch
      const lastCentralIdx = centralSlice.instructionOrder.at(-1) ?? 0;

      syncPoints.push({
        syncId: `sync-${remote.sliceId}`,
        pauseBeforeInstruction: lastCentralIdx + 1,
        awaitSliceIds: [remote.sliceId],
        inboundFlows,
        resumeAtInstruction: lastCentralIdx + 1,
        timeoutMs: remote.estimatedDurationMs * 3 + 2000, // 3x estimated + 2s buffer
        onTimeout: 'FAIL',
      });
    }

    return syncPoints;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 5: Critical path + latency estimate
  // ──────────────────────────────────────────────────────────────────────────

  private computeCriticalPath(
    ir: ResolvedIR,
    assignments: InstructionAssignment[],
    slices: ExecutionSlice[]
  ): { criticalPath: number[]; estimatedTotalLatencyMs: number } {
    // Simple longest-path in the dependency graph
    const estimateByIdx = new Map(assignments.map(a => [a.instructionIndex, a.estimatedMs]));
    const earliestFinish = new Map<number, number>();

    for (const idx of ir.instructionOrder) {
      const instr = ir.instructions[idx];
      const selfMs = estimateByIdx.get(idx) ?? 10;
      const deps = ir.dependencyGraph.get(idx) ?? [];
      const maxPredecessorFinish = deps.length > 0
        ? Math.max(...deps.map(d => earliestFinish.get(d) ?? 0))
        : 0;
      earliestFinish.set(idx, maxPredecessorFinish + selfMs);
    }

    // Find the instruction with the largest earliest finish time
    let maxTime = 0;
    let lastOnCritical = 0;
    for (const [idx, t] of earliestFinish) {
      if (t > maxTime) { maxTime = t; lastOnCritical = idx; }
    }

    // Trace critical path backwards
    const criticalPath: number[] = [];
    let cur = lastOnCritical;
    while (cur !== undefined) {
      criticalPath.unshift(cur);
      const deps = ir.dependencyGraph.get(cur) ?? [];
      if (deps.length === 0) break;
      cur = deps.reduce(
        (best, d) =>
          (earliestFinish.get(d) ?? 0) > (earliestFinish.get(best) ?? 0) ? d : best,
        deps[0]
      );
    }

    // Add communication overhead for each remote slice
    const remoteSlicesCount = new Set(
      assignments.filter(a => a.assignedNodeId !== CENTRAL_NODE_ID).map(a => a.assignedNodeId)
    ).size;

    const communicationOverheadMs = remoteSlicesCount * 50; // ~50ms per round-trip

    return {
      criticalPath,
      estimatedTotalLatencyMs: maxTime + communicationOverheadMs,
    };
  }
}
