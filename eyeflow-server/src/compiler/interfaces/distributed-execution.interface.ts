/**
 * Distributed Execution Interfaces
 *
 * Produced by Stage 9 (Distribution Planner) at compile-time.
 * Consumed by:
 *   – SemanticVirtualMachine (central slice execution + remote dispatch)
 *   – Edge SVM Rust (receives a NodeExecutionSlice payload)
 *
 * Key concepts
 * ────────────
 *  ExecutionSlice      : a contiguous group of IR instructions assigned to ONE node.
 *  SyncPoint           : a barrier in the DAG where the central node must collect
 *                         results from N remote slices before resuming.
 *  DistributedExecutionPlan : the full compile-time plan (all slices + sync points).
 */

import { IRInstruction } from './ir.interface';

// ─── Instruction-level node assignment ────────────────────────────────────

/**
 * Reason why a particular node was chosen for an instruction.
 * Stored in the plan for auditability and human-readable validation.
 */
export type AssignmentReason =
  | 'REQUIRES_DOCKER'          // Only CENTRAL can spawn Docker
  | 'REQUIRES_MCP'             // Only CENTRAL has MCP sidecar
  | 'REQUIRES_VAULT'           // Secret injection → CENTRAL or vault-aware node
  | 'REQUIRES_INTERNET'        // Outbound HTTP call → internet-capable node
  | 'PHYSICAL_PROTOCOL'        // I2C / SPI / UART / GPIO / MODBUS only on target hw
  | 'WASM_CAPABLE'             // Best available WASM executor
  | 'NATIVE_BINARY'            // Binary cross-compiled for target arch
  | 'CONNECTOR_AVAILABLE'      // Specific connector registered on node
  | 'DATA_LOCALITY'            // Minimise data transfer: keep close to its source
  | 'CAPABILITY_FALLBACK'      // No specialised node → fallback to CENTRAL
  | 'PARALLEL_AFFINITY';       // Keep parallel group on the same node (reduce sync cost)

export interface InstructionAssignment {
  instructionIndex: number;
  assignedNodeId: string;
  reason: AssignmentReason;
  /** Estimated execution time on this node (ms) — used for critical path */
  estimatedMs: number;
}

// ─── Data flow between slices ──────────────────────────────────────────────

/**
 * A data dependency that crosses node boundaries.
 * Produced by fromNode:fromRegister, consumed by toNode:toRegister.
 * The central SVM uses this to route results after each sync point.
 */
export interface CrossNodeDataFlow {
  flowId: string;
  fromNodeId: string;
  fromRegister: number;
  toNodeId: string;
  toRegister: number;
  /** Schema for the payload — so the receiving node can validate on arrival */
  payloadSchema?: Record<string, any>;
}

// ─── Synchronisation points ────────────────────────────────────────────────

/**
 * A sync point is a DAG vertex where execution on the CENTRAL node must PAUSE
 * until one or more remote slices have completed and sent back their results.
 *
 * After all awaited slices return, the central resumes from `resumeAtInstruction`.
 */
export interface SyncPoint {
  syncId: string;
  /** Zero-based instruction index in the central slice where we pause */
  pauseBeforeInstruction: number;
  /** Remote slices that must complete before resuming */
  awaitSliceIds: string[];
  /** Results carried back by each awaited slice */
  inboundFlows: CrossNodeDataFlow[];
  /** Instruction to jump to after all results are merged */
  resumeAtInstruction: number;
  /** Maximum wall-clock time before triggering FALLBACK */
  timeoutMs: number;
  /** What to do if a remote slice times out or errors */
  onTimeout: 'FAIL' | 'SKIP' | 'USE_DEFAULT';
  defaultValue?: any;
}

// ─── Execution slice ───────────────────────────────────────────────────────

/**
 * A slice of the LLM-IR assigned to ONE node.
 *
 * The central node holds the "root" slice (sliceId === 'central').
 * Remote nodes receive their slice via WebSocket TLS or REST.
 *
 * A node executes its slice with a local SVM instance and sends back
 * the output register values listed in `outputBindings`.
 */
export interface ExecutionSlice {
  sliceId: string;
  nodeId: string;
  /**
   * The actual IR instructions for this slice (subset of the full IR).
   * Each instruction keeps its original `index` from the full IR
   * so register references stay consistent.
   */
  instructions: IRInstruction[];
  /** Topological order within this slice */
  instructionOrder: number[];
  /**
   * Values the slice needs FROM other slices / the trigger event.
   * key = register number in this slice's register file
   * value = { fromSliceId, fromRegister } or { fromTrigger: true }
   */
  inputBindings: Record<number, { fromSliceId: string; fromRegister: number } | { fromTrigger: true }>;
  /**
   * Registers whose values must be sent back to CENTRAL (or another slice)
   * after this slice completes.
   */
  outputBindings: Array<{ register: number; targetSliceId: string; targetRegister: number }>;
  /** Whether this slice can start without waiting for another slice */
  isRoot: boolean;
  /** Slice IDs that must complete before this slice can start */
  dependsOnSlices: string[];
  /** Estimated total execution time (ms) — for scheduling */
  estimatedDurationMs: number;
  /**
   * Serialised checksum of the instructions array.
   * The receiving node verifies this before executing to detect tampering.
   */
  checksum: string;
}

// ─── Full distributed plan ─────────────────────────────────────────────────

/**
 * The complete compile-time distribution plan.
 * Attached to the CompiledWorkflow and stored in the project version.
 */
export interface DistributedExecutionPlan {
  planId: string;
  workflowId: string;
  workflowVersion: number;
  /** All slices, including the CENTRAL slice (sliceId='central') */
  slices: ExecutionSlice[];
  /** Registration of all cross-node data flows */
  dataFlows: CrossNodeDataFlow[];
  /** Synchronisation barriers */
  syncPoints: SyncPoint[];
  /**
   * Instruction indices (in the full IR) that form the critical path.
   * Useful for visualisation and performance monitoring.
   */
  criticalPath: number[];
  /** Estimated end-to-end latency (ms) assuming all nodes are ONLINE */
  estimatedTotalLatencyMs: number;
  /** Number of nodes involved */
  nodeCount: number;
  /** Are any instructions dispatched to a remote node? */
  isDistributed: boolean;
  /** Compile-time timestamp */
  compiledAt: Date;
  /** Assignment metadata (one entry per instruction, for audit) */
  assignments: InstructionAssignment[];
}

// ─── Remote slice dispatch / result protocol ──────────────────────────────

/**
 * Payload sent from CENTRAL → remote node to trigger slice execution.
 */
export interface SliceDispatchPayload {
  planId: string;
  sliceId: string;
  /** Instructions to execute */
  instructions: IRInstruction[];
  instructionOrder: number[];
  /** Pre-resolved register values from upstream slices */
  registerValues: Record<number, any>;
  /** Maximum execution time before the node should self-abort */
  timeoutMs: number;
  /** Checksum to verify before executing */
  checksum: string;
}

/**
 * Payload sent back from remote node → CENTRAL after slice execution.
 */
export interface SliceResultPayload {
  planId: string;
  sliceId: string;
  nodeId: string;
  status: 'SUCCESS' | 'FAILED' | 'TIMEOUT';
  /** Output register values (only those listed in slice.outputBindings) */
  outputRegisters: Record<number, any>;
  durationMs: number;
  error?: string;
  /** Compact audit trail emitted by the remote SVM */
  auditEvents?: RemoteAuditEvent[];
}

export interface RemoteAuditEvent {
  timestamp: string; // ISO-8601
  instructionIndex: number;
  opcode: string;
  durationMs: number;
  result: 'SUCCESS' | 'FAILED' | 'SKIPPED';
}
