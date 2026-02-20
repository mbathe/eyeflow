/**
 * Intermediate Representation (IR) Interfaces
 * Output from Layer 4 IR Generator (Stages 1-6)
 * Input to Stage 7 (ServiceResolution) and Stage 8 (ServicePreloader)
 */

import type {
  PowerfulServiceManifest,
  EnrichedDispatchMetadata,
} from './service-manifest.interface';

// Re-export for convenience
export type { PowerfulServiceManifest, EnrichedDispatchMetadata } from './service-manifest.interface';
export type { ServiceFormat, NodeTier, ExecutionDescriptor } from './service-manifest.interface';

// Re-export EventStateMachine types so consumers can import from a single path
export type {
  ConditionDescriptor,
  EventTransition,
  EventStateMachineDescriptor,
  PropagationConfig,
  PropagatedEvent,
  EventHandlerDescriptor,
  EventHandlerAction,
  RemoteCommandDescriptor,
  RemoteCommandHandlerDescriptor,
  ESMEntryAction,
  ActuatorControlParams,
  SamplingRateParams,
  FsmRuntimeState,
  // New unified types
  CompiledDynamicSlot,
  CompiledOutputSchema,
  LLMCallActionDescriptor,
  MLScoreCallDescriptor,
  CRMQueryDescriptor,
  ParallelFetchDescriptor,
  HumanApprovalGateDescriptor,
  PipelineStep,
  PipelineStepBase,
  LLMCallStep,
  LoopStep,
  MLScoreCallStep,
  CRMQueryStep,
  BranchStep,
  HumanApprovalStep,
  SendEmailStep,
  WriteCRMStep,
  AlertStep,
  CallHttpStep,
  LogStep,
  ConnectorActionStep,
  RetryPolicy,
  ApprovalResponseChannel,
} from './event-state-machine.interface';
export {
  ConditionType,
  ComparisonOperator,
  ESMEntryActionType,
  EventHandlerActionType,
  PipelineStepType,
  type TransitionGuard,
} from './event-state-machine.interface';

export enum IROpcode {
  // Memory operations
  LOAD_RESOURCE = 'LOAD_RESOURCE',
  STORE_MEMORY = 'STORE_MEMORY',

  // Validation
  VALIDATE = 'VALIDATE',

  // Control flow
  BRANCH = 'BRANCH',
  LOOP = 'LOOP',
  JUMP = 'JUMP',

  // Service calls (Stages 1-6 generate these without dispatch info)
  CALL_SERVICE = 'CALL_SERVICE',
  CALL_ACTION = 'CALL_ACTION',
  CALL_MCP = 'CALL_MCP',

  // Data operations
  TRANSFORM = 'TRANSFORM',
  AGGREGATE = 'AGGREGATE',
  FILTER = 'FILTER',

  // Parallelization
  PARALLEL_SPAWN = 'PARALLEL_SPAWN',
  PARALLEL_MERGE = 'PARALLEL_MERGE',

  /**
   * Bounded LLM call with pre-built context (spec §10).
   * The prompt + model parameters are baked into the IR at compile time;
   * the runtime never constructs prompts dynamically.
   */
  LLM_CALL = 'LLM_CALL',

  /**
   * Event trigger — spec §7.
   * The FIRST instruction of a compiled workflow that activates a listener.
   * Stage 9 assigns it to the node that has the required driver.
   * TriggerActivationService reads these from the deployed IR and activates
   * the appropriate ITriggerDriver on the right node.
   */
  TRIGGER = 'TRIGGER',

  // ── Distributed Event State Machine — spec §8 ─────────────────────────

  /**
   * EVENT_STATE_MACHINE — Deploys a compiled deterministic FSM on a single node.
   *
   * The FSM tracks multi-condition satisfaction within a time-bounded window.
   * It manages partial states actively (e.g. accelerate sensor sampling when
   * PARTIAL_1 is reached), executes local actuator commands without round-trips
   * to CENTRAL, and emits a PropagatedEvent only when FULL_MATCH is achieved.
   *
   * Stage 9 assigns this to the node whose sensor drivers satisfy all conditions.
   * operands: EventStateMachineDescriptor
   */
  EVENT_STATE_MACHINE = 'EVENT_STATE_MACHINE',

  /**
   * PROPAGATE_EVENT — Emitted by a FSM node when it reaches FULL_MATCH (or optionally
   * a configurable partial satisfaction level).
   *
   * The emitted payload is a PropagatedEvent — NOT a raw TriggerEvent.
   * It carries: matched sensor values, local actions already taken, precursor trends,
   * time window data, and a crypto signature for auditability.
   *
   * Stage 9 assigns this to CENTRAL (the event consumer).
   * operands: PropagationConfig
   */
  PROPAGATE_EVENT = 'PROPAGATE_EVENT',

  /**
   * HANDLE_PROPAGATED — CENTRAL-side event handler.
   * Triggered when CENTRAL receives a PropagatedEvent from an edge FSM node.
   * Executes parallel actions: alerts, external API calls (SAP ticket, PagerDuty),
   * or REMOTE_COMMAND dispatches to other edge nodes.
   *
   * Stage 9 always assigns this to CENTRAL.
   * operands: EventHandlerDescriptor
   */
  HANDLE_PROPAGATED = 'HANDLE_PROPAGATED',

  /**
   * REMOTE_COMMAND — CENTRAL sends an explicit actuator/control command
   * to a specific edge node without creating a full workflow execution.
   *
   * Examples: "reduce M1 speed to 70%", "activate cooling on Line-B",
   * "deploy event-state-machine FSM descriptor to Node-B".
   *
   * Stage 9 routes this to the descriptor's targetNodeId.
   * operands: RemoteCommandDescriptor
   */
  REMOTE_COMMAND = 'REMOTE_COMMAND',

  /**
   * HANDLE_REMOTE_CMD — Edge-node-side handler for REMOTE_COMMAND instructions.
   * When a node receives a remote command from CENTRAL, it executes this instruction.
   * This allows edge nodes to declare pre-compiled responses to known command patterns.
   *
   * Stage 9 assigns this to the same node as the targeted REMOTE_COMMAND handler.
   * operands: RemoteCommandHandlerDescriptor
   */
  HANDLE_REMOTE_CMD = 'HANDLE_REMOTE_CMD',

  // Return
  RETURN = 'RETURN',
}

export enum RegisterType {
  INT = 'INT',
  FLOAT = 'FLOAT',
  STRING = 'STRING',
  BUFFER = 'BUFFER',
  OBJECT = 'OBJECT',
  ANY = 'ANY',
}

export interface TypedValue {
  type: RegisterType;
  value: any;
}

/**
 * A single instruction in the IR bytecode
 */
export interface IRInstruction {
  index: number;
  opcode: IROpcode;
  
  // Register destinations
  dest?: number; // r0-r255
  src?: number[];
  
  // Operands
  operands?: Record<string, any>;
  
  // Service-specific (filled by Stage 7)
  serviceId?: string;
  serviceVersion?: string;
  /** Full enriched dispatch metadata injected by Stage 7 at compile time */
  dispatchMetadata?: EnrichedDispatchMetadata;
  
  // Control flow
  targetInstruction?: number;
  
  // Parallel info
  parallelGroupId?: number;

  // ── Distribution metadata (filled by Stage 9) ────────────────────────────
  /**
   * ID of the node that will execute this instruction.
   * Set by Stage 9 Distribution Planner at compile time.
   * 'central' = NestJS orchestrator node.
   */
  targetNodeId?: string;

  /**
   * Node tier required to execute this instruction.
   * Used during planning to filter candidate nodes.
   */
  requiredTier?: 'CENTRAL' | 'LINUX' | 'MCU' | 'ANY';

  /**
   * Minimum capabilities required for this instruction.
   * Used by Stage 9 to score and select the best node.
   */
  requiredCapabilities?: {
    formats?: string[];              // e.g. ['DOCKER'] → CENTRAL only
    protocols?: string[];            // e.g. ['I2C'] → MCU/embedded only
    connectorId?: string;            // specific connector required
    needsVault?: boolean;
    needsInternet?: boolean;
    minMemoryMb?: number;
    /** Node must have Node.js runtime (EMBEDDED_JS format) */
    hasEmbeddedJsRuntime?: boolean;
    /** Node must be able to call an LLM */
    hasLLMAccess?: boolean;
  };

  /**
   * Slice ID this instruction belongs to (set by Stage 9).
   * Instructions in the same slice run on the same node.
   */
  sliceId?: string;
}

/**
 * @deprecated Use EnrichedDispatchMetadata from service-manifest.interface.ts
 * Kept for backward compatibility with Stage 8 pre-loader until it migrates.
 */
export type DispatchMetadata = EnrichedDispatchMetadata;

// ─────────────────────────────────────────────────────────────────────────────
// LOOP operands — spec §3.5 "Boucles de Raisonnement Contrôlées"
// Every LOOP opcode MUST carry LoopOperands.  Stage 5 rejects loops without
// explicit bounds.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Predicate evaluated by the SVM after each loop iteration to check early exit.
 */
export interface LoopConvergencePredicate {
  /** IR register index whose value is tested each iteration */
  registerIndex: number;
  operator: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'exists' | 'truthy';
  /** Literal value to compare against (ignored for 'exists' / 'truthy') */
  value?: any;
}

/**
 * Bounded loop operands.
 *
 * Spec §3.5:
 *   max_iterations: u8  — jamais > 5 par défaut
 *   timeout_ms: u32     — timeout absolu
 *   convergence_predicate: Predicate  — condition d'arrêt formelle
 *   fallback: FallbackInstruction     — si convergence non atteinte
 *
 * Stage 5 (FormalVerifier) REJECTS any LOOP instruction where
 * maxIterations is undefined or > MAX_LOOP_ITERATIONS (5).
 */
export interface LoopOperands {
  /** IR register used as the loop iterator / accumulator */
  iteratorRegister: number;

  /**
   * Hard upper bound on iterations.
   * Stage 5 rejects values > MAX_LOOP_ITERATIONS (spec default: 5).
   */
  maxIterations: number;

  /**
   * Hard wall-clock timeout (ms).
   * The SVM aborts the loop and jumps to fallbackInstruction after this delay.
   */
  timeoutMs: number;

  /** Index in `instructionOrder` of the first instruction of the loop body */
  bodyStartIndex: number;

  /** Index in `instructionOrder` of the first instruction AFTER the loop body */
  exitIndex: number;

  /**
   * Optional early-exit condition.  The SVM tests this after every iteration.
   * If it holds, the loop exits normally (convergence achieved).
   */
  convergencePredicate?: LoopConvergencePredicate;

  /**
   * Instruction to jump to when maxIterations is exhausted without convergence.
   * Spec: "fallback: FallbackInstruction — si convergence non atteinte".
   * If absent, the SVM raises a `LoopNonConvergenceError` (escalated to human).
   */
  fallbackInstruction?: number;
}

/** Maximum allowed loop iterations (spec §3.5 default) */
export const MAX_LOOP_ITERATIONS = 5;

// ─────────────────────────────────────────────────────────────────────────────
// TRIGGER operands — spec §7 "Sources d'Événements et Déclencheurs"
// Every TRIGGER opcode MUST carry TriggerDescriptor in instruction.operands.
// Stage 9 assigns TRIGGER instructions to nodes with the matching driverId
// in node.supportedTriggerDrivers[].
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FallbackStrategy for the 5 strategies from spec §6.4.
 * Used both in TRIGGER (what to do if driver fails to activate)
 * and in CALL_ACTION/CALL_SERVICE fallback policies.
 */
export type FallbackStrategy =
  | 'FAIL_SAFE'            // Stop immediately, alert operator, await human
  | 'DEGRADED_MODE'        // Execute pre-compiled alternative path
  | 'RETRY_WITH_BACKOFF'   // N retries with exponential delay
  | 'LLM_REASONING'        // Activate bounded LLM reasoner with pre-built context
  | 'SUPERVISED_RECOMPILE';// Trigger new compilation + notify user

/**
 * Compiled filter evaluated at the driver level BEFORE dispatching.
 * Avoids unnecessary workflow instantiations for high-frequency sources (MQTT IoT).
 *
 * Example: { expression: "payload.pressure > 8.5" }
 * The driver evaluates this on the raw event before emitting to the bus.
 */
export interface CompiledTriggerFilter {
  /** JS/WASM expression string evaluated with event payload in scope */
  expression?: string;
  /** JSON path the expression expects (for documentation) */
  sourceField?: string;
  /** Expected value (exact match — used when expression is absent) */
  expectedValue?: any;
}

/**
 * TriggerDescriptor — operands of a TRIGGER instruction in the LLM-IR.
 *
 * Contains everything the TriggerActivationService needs to:
 *  1. Identify the right ITriggerDriver (driverId)
 *  2. Activate it on the correct node (targetNodeId from instr.targetNodeId)
 *  3. Pass the driver-specific config (driverConfig — compiled at compile time)
 *  4. Pre-filter events at the driver level (compiledFilter)
 *  5. Connect fired events to the right workflow execution (workflowId + version)
 */
export interface TriggerDescriptor {
  /**
   * Unique driver identifier — must match ITriggerDriver.driverId.
   * Examples: 'mqtt', 'filesystem', 'http-webhook', 'cron', 'imap', 'kafka', 'modbus'
   */
  driverId: string;

  /**
   * Driver-specific configuration (compiled at compile time, vault slots for secrets).
   * Shape depends on the driver:
   *   mqtt:         { brokerUrl, topic, qos }
   *   filesystem:   { watchPath, events, glob }
   *   http-webhook: { path, method, authMode }
   *   cron:         { expression, timezone }
   *   imap:         { fromContains, subjectContains }
   *   kafka:        { topic, consumerGroup }
   */
  driverConfig: Record<string, any>;

  /**
   * Pre-filter compiled at compile time.
   * Evaluated by the driver before emitting to the event bus.
   * Prevents unnecessary workflow instantiations.
   */
  compiledFilter?: CompiledTriggerFilter;

  /**
   * IR register index where the trigger payload is stored.
   * The driver writes the event payload here so the next instruction can read it.
   */
  outputRegister: number;

  /**
   * What to do if the driver fails to activate or the event source is unreachable.
   */
  onDriverFailure?: FallbackStrategy;

  /**
   * Debounce in ms — prevent rapid-fire events from spawning too many executions.
   * Compiled at compile time from user input ("not more than once per minute").
   */
  debounceMs?: number;

  /**
   * Max concurrent workflow instances this trigger can spawn.
   * Compiled from catalogue rate_limits.
   */
  maxConcurrentInstances?: number;

  /**
   * Vault slot for driver credentials (e.g. MQTT password, webhook secret).
   * The TriggerActivationService fetches this from VaultService before activating.
   */
  credentialsVaultPath?: string;
}




/**
 * Resource pre-allocated or cached
 */
export interface ResourceEntry {
  handleId: number;
  type: 'connection' | 'model' | 'cache' | 'schema';
  metadata?: Record<string, any>;
  value?: any; // Pre-loaded value (e.g., ONNX model)
}

/**
 * Schema for input/output validation
 */
export interface SchemaValidator {
  id: number;
  name: string;
  jsonSchema: Record<string, any>;
  validator: (value: any) => boolean;
}

/**
 * Information about parallel execution
 */
export interface ParallelGroup {
  id: number;
  instructionIndices: number[];
  workerCount: number;
  amdahlSpeedup: number;
  mergePointInstruction: number;
}

/**
 * Semantic context with embeddings and relationships
 */
export interface SemanticsData {
  embeddings: number[][];
  relationships: Array<{
    from: string;
    to: string;
    type: 'input' | 'output' | 'dependency';
  }>;
  fallbackStrategies: Array<{
    serviceId: string;
    priority: number;
    alternative: string;
  }>;
}

/**
 * Main IR output from Layer 4
 * Input to Stage 7 and Stage 8
 */
export interface LLMIntermediateRepresentation {
  // Core bytecode
  instructions: IRInstruction[];
  
  // Execution order (topologically sorted)
  instructionOrder: number[];
  
  // Dependency graph
  dependencyGraph: Map<number, number[]>;
  
  // Pre-allocated resources
  resourceTable: ResourceEntry[];
  
  // Parallel execution groups
  parallelizationGroups: ParallelGroup[];
  
  // Schemas for validation
  schemas: SchemaValidator[];
  
  // Semantic context (embeddings)
  semanticContext: SemanticsData;
  
  // I/O mapping
  inputRegister: number;
  outputRegister: number;
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
  
  // Metadata
  metadata: {
    compiledAt: Date;
    compilerVersion: string;
    source: string; // original intent
    workflowId?: string;
    workflowVersion?: number;
  };

  // ── Distribution plan (filled by Stage 9) ─────────────────────────────
  /**
   * Set after Stage 9 runs. Contains the full distribute-and-aggregate plan.
   * If undefined, all instructions run on CENTRAL node (monolithic mode).
   */
  distributionPlan?: import('./distributed-execution.interface').DistributedExecutionPlan;
}

/**
 * Resolved IR after Stage 7
 * All services have been looked up and dispatch metadata injected
 */
export interface ResolvedIR extends LLMIntermediateRepresentation {
  resolvedServices: Array<{
    serviceId: string;
    version: string;
    format: string;
    manifest: PowerfulServiceManifest;
    dispatchMetadata: EnrichedDispatchMetadata;
  }>;
}

/**
 * @deprecated Use PowerfulServiceManifest from service-manifest.interface.ts
 * Kept as alias so legacy code compiles without breaking changes.
 */
export type ServiceManifest = PowerfulServiceManifest;
