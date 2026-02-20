/**
 * EventStateMachine Interfaces — spec §8 "Topologie d'Événements Distribuée"
 *
 * UNIFIED EXECUTION PHILOSOPHY
 * ─────────────────────────────────────────────────────────────────────────────
 * Every trigger — whether a physical sensor threshold, an LLM output, an ML
 * score, a CRM query result, or a human approval — is a FIRST-CLASS CITIZEN of
 * the state machine.  The same deterministic FSM mechanics govern all of them:
 *
 *   Physical world   │  Digital world      │  Semantic world
 *   ─────────────────┼─────────────────────┼──────────────────────────────
 *   Sensor threshold │  API response       │  LLM output condition
 *   MQTT value       │  ML score           │  Human approval
 *   OPC-UA register  │  CRM query result   │  Composite all_of / any_of
 *
 * All fire the SAME transition mechanism.  All appear in SAME ConditionDescriptor.
 * All are enriched into the SAME PropagatedEvent.  Same tuyauterie. Same FSM.
 *
 * DESIGN PRINCIPLE: Zero runtime decisions.
 * Every state, every transition guard, every temporal window boundary, every LLM
 * call (prompt, model, output schema, retry strategy), and every pipeline step
 * is pre-compiled.  The runtime is a pure deterministic executor — no AI
 * inference about what to do next, only pre-compiled deterministic dispatch.
 *
 * Execution flow:
 *  1. Compiler decomposes condition → per-node EventStateMachineDescriptor
 *  2. Stage 9 assigns each descriptor to the node owning the required data source
 *  3. EventStateMachineService deploys and runs the FSM on CENTRAL
 *     (edge deployment uses REMOTE_COMMAND to push the descriptor to the SVM)
 *  4. On FULL_MATCH: FSM executes local actions + emits PropagatedEvent
 *  5. CENTRAL receives PropagatedEvent → HANDLE_PROPAGATED fires PipelineStep[]
 *     (LLM analysis → LLM offer loop → validation → human gate → send email)
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONDITION TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What kind of data source feeds a condition.
 *
 * Physical, digital, and semantic triggers are IDENTICAL in the FSM:
 * the same ConditionDescriptor struct represents all of them.
 */
export enum ConditionType {
  // ── Physical / IoT world ────────────────────────────────────────────────
  /** Physical sensor value (temperature, pressure, vibration) via any driver */
  SENSOR_THRESHOLD = 'SENSOR_THRESHOLD',
  /** MQTT message payload field */
  MQTT_VALUE = 'MQTT_VALUE',
  /** Kafka topic message payload field */
  KAFKA_EVENT = 'KAFKA_EVENT',
  /** OPC-UA / Modbus register value */
  FIELD_BUS_VALUE = 'FIELD_BUS_VALUE',
  /** Calculated KPI / derived metric (efficiency, OEE, MTBF, …) */
  KPI_VALUE = 'KPI_VALUE',

  // ── Digital / external world ────────────────────────────────────────────
  /** Result of an earlier LLM_CALL action stored in FSM context */
  LLM_OUTPUT = 'LLM_OUTPUT',
  /** Result of an earlier ML_SCORE_CALL action stored in FSM context */
  ML_SCORE = 'ML_SCORE',
  /** Result of an earlier CRM_QUERY action stored in FSM context */
  CRM_QUERY_RESULT = 'CRM_QUERY_RESULT',
  /** Result of an earlier external HTTP API call stored in FSM context */
  API_RESPONSE = 'API_RESPONSE',

  // ── Temporal ────────────────────────────────────────────────────────────
  /** Elapsed time since window opened — used for EXPIRED transitions */
  WINDOW_TIMER_ELAPSED = 'WINDOW_TIMER_ELAPSED',

  // ── Human / semantic world ──────────────────────────────────────────────
  /** Human approval decision (approve/reject) for a pending gate */
  HUMAN_APPROVAL = 'HUMAN_APPROVAL',
  /** Signal arrived from CENTRAL (response to an earlier REMOTE_COMMAND) */
  REMOTE_SIGNAL = 'REMOTE_SIGNAL',

  // ── Composite ───────────────────────────────────────────────────────────
  /** ALL sub-conditions satisfied within compositeWindowMs */
  COMPOSITE_ALL_OF = 'COMPOSITE_ALL_OF',
  /** ANY sub-condition satisfied within compositeWindowMs */
  COMPOSITE_ANY_OF = 'COMPOSITE_ANY_OF',
}

/**
 * Standard comparison operators compiled into FSM transition guards.
 */
export enum ComparisonOperator {
  GT = 'GT',   // >
  GTE = 'GTE', // >=
  LT = 'LT',   // <
  LTE = 'LTE', // <=
  EQ = 'EQ',   // ===
  NEQ = 'NEQ', // !==
  EXISTS = 'EXISTS', // field presence check (no value required)
  BETWEEN = 'BETWEEN', // value BETWEEN min AND max (use valueMin/valueMax)
}

/**
 * A fully compiled condition — the "trigger" that causes an FSM transition.
 *
 * This is the UNIFIED TRIGGER type for ALL worlds:
 *   – Physical: sensor threshold, MQTT value, OPC-UA register
 *   – Digital:  LLM output condition, ML score, CRM query result, API response
 *   – Temporal: window timer elapsing
 *   – Human:    approval or rejection at a HumanApprovalGate
 *   – Composite: all/any of the above within a time window
 *
 * The FSM evaluator handles all types identically:
 *   1. Receive event / context update
 *   2. Evaluate ConditionDescriptor against current value
 *   3. Check TransitionGuard (WITHIN_WINDOW / ALWAYS)
 *   4. Fire transition if both pass
 */
export interface ConditionDescriptor {
  type: ConditionType;

  /** Logical name of this condition result.
   * Key in PropagatedEvent.matchedValues for full traceability.
   * Examples: "M1_temperature", "sentiment_analysis", "churn_score" */
  metricName: string;

  // ── SENSOR_THRESHOLD / MQTT_VALUE / KAFKA_EVENT / FIELD_BUS_VALUE / KPI ──
  /** Driver-level topic or channel (MQTT topic, Kafka topic, OPC-UA node id) */
  topic?: string;
  /** JSON path / field name inside the event payload */
  field?: string;
  /** Comparison operator (numeric or exact match) */
  operator?: ComparisonOperator;
  /** Threshold value */
  value?: number | string;
  /** Lower bound for BETWEEN */
  valueMin?: number;
  /** Upper bound for BETWEEN */
  valueMax?: number;

  // ── LLM_OUTPUT / ML_SCORE / CRM_QUERY_RESULT / API_RESPONSE ─────────────
  /**
   * ID of the pipeline step whose output this condition evaluates.
   * Matches PipelineStep.id or ESMEntryAction.params.instructionId.
   * The FSM runtime resolves this against FsmRuntimeState.stepOutputs.
   *
   * Example: instructionId = "sentiment_analysis"
   *   → condition evaluates FsmRuntimeState.stepOutputs["sentiment_analysis"]
   */
  instructionId?: string;

  /**
   * JavaScript expression evaluated against the step's output object.
   * The output is bound as `output` in the expression scope.
   *
   * Examples:
   *   "output.is_negative === true && output.confidence > 0.85"
   *   "output.churn_score > 0.75"
   *   "output.incidents_count > 0"
   *
   * SECURITY: expression is compiled and validated at compile time.
   * At runtime it is evaluated with a whitelist-only sandbox (no IO, no eval).
   */
  semanticExpression?: string;

  // ── WINDOW_TIMER_ELAPSED ─────────────────────────────────────────────────
  /** Duration in ms (resolved from the parent FSM's windowMs) */
  timerMs?: number;

  // ── HUMAN_APPROVAL ───────────────────────────────────────────────────────
  /** Gate ID of the HumanApprovalGate this condition listens for */
  approvalGateId?: string;
  /** Expected decision: 'APPROVED' | 'REJECTED' */
  expectedDecision?: 'APPROVED' | 'REJECTED';

  // ── REMOTE_SIGNAL ────────────────────────────────────────────────────────
  /** Signal ID emitted by a REMOTE_COMMAND ack or a HANDLE_PROPAGATED action */
  signalId?: string;

  // ── COMPOSITE_ALL_OF / COMPOSITE_ANY_OF ──────────────────────────────────
  /** Sub-conditions (all or any must fire within compositeWindowMs) */
  compositeConditions?: ConditionDescriptor[];
  /**
   * Time window in ms for composite conditions.
   * All/any sub-conditions must fire within this window.
   * Compiled from natural language ("les deux résultats dans 10s" → 10_000).
   */
  compositeWindowMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ON-ENTRY ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Actions that the FSM executes immediately upon entering a new state.
 * These are compiled at compile time — no runtime decisions.
 *
 * UNIFIED ACTION TYPES: physical actuator commands, LLM calls, ML scoring,
 * CRM queries, human gates — all the same mechanism.
 */
export enum ESMEntryActionType {
  // ── FSM control ─────────────────────────────────────────────────────────
  /** Write a structured log entry with current matched values */
  LOG = 'LOG',
  /** Start the correlation window timer; transitions to EXPIRED after windowMs */
  START_WINDOW_TIMER = 'START_WINDOW_TIMER',
  /** Cancel the correlation window timer (on FULL_MATCH or explicit reset) */
  CANCEL_WINDOW_TIMER = 'CANCEL_WINDOW_TIMER',
  /** Reset the FSM to its initial state (IDLE), clearing all partial matches */
  RESET_FSM = 'RESET_FSM',

  // ── Physical world ───────────────────────────────────────────────────────
  /** Increase sensor polling frequency (reduce debounce) */
  INCREASE_SAMPLING_RATE = 'INCREASE_SAMPLING_RATE',
  /** Restore sensor polling to its nominal rate */
  RESET_SAMPLING_RATE = 'RESET_SAMPLING_RATE',
  /** Send actuator control commands to local hardware (no network round-trip) */
  CONTROL_ACTUATOR = 'CONTROL_ACTUATOR',

  // ── Propagation ──────────────────────────────────────────────────────────
  /** Send a PropagatedEvent to CENTRAL with satisfaction_level < 1.0 */
  PROPAGATE_PARTIAL = 'PROPAGATE_PARTIAL',
  /** Send a fully enriched PropagatedEvent to CENTRAL (satisfaction_level = 1.0) */
  PROPAGATE_ENRICHED = 'PROPAGATE_ENRICHED',

  // ── Semantic / digital world — same tuyauterie as physical ───────────────
  /**
   * Execute a pre-compiled LLM call.
   * Result stored in FsmRuntimeState.stepOutputs[instructionId].
   * A subsequent LLM_OUTPUT ConditionDescriptor evaluates it to drive transitions.
   * Output MUST conform to the compiled output_schema (validated before storing).
   */
  LLM_CALL = 'LLM_CALL',

  /**
   * Call a pre-compiled ML scoring model.
   * Result stored in stepOutputs[instructionId].
   * A subsequent ML_SCORE ConditionDescriptor evaluates it.
   */
  ML_SCORE_CALL = 'ML_SCORE_CALL',

  /**
   * Execute a pre-compiled CRM / database query.
   * Result stored in stepOutputs[instructionId].
   * A subsequent CRM_QUERY_RESULT ConditionDescriptor evaluates it.
   */
  CRM_QUERY = 'CRM_QUERY',

  /**
   * Execute multiple fetch/call actions in parallel.
   * Each sub-action stores its result in stepOutputs[sub-action.instructionId].
   * Used to fire CRM query + ML score simultaneously after sentiment confirmed.
   */
  PARALLEL_FETCH = 'PARALLEL_FETCH',

  /**
   * Pause the FSM and wait for a human decision.
   * Emits a HumanApprovalRequest event; transitions fire when the decision arrives
   * (via HumanApprovalService.resolve() called by the REST/dashboard endpoint).
   *
   * This is NOT a blocking call — the FSM instance suspends and the event loop
   * continues. The approval or rejection arrives as a HUMAN_APPROVAL
   * ConditionDescriptor trigger.
   */
  HUMAN_APPROVAL_GATE = 'HUMAN_APPROVAL_GATE',
}

/**
 * Parameters for CONTROL_ACTUATOR action.
 * e.g. { actuatorId: "M1_speed_controller", commandType: "SET_SPEED", value: 0.7 }
 */
export interface ActuatorControlParams {
  /** Logical ID of the actuator on the current node */
  actuatorId: string;
  /** Command type (SET_SPEED, OPEN_VALVE, ACTIVATE_COOLING, EMERGENCY_STOP, …) */
  commandType: string;
  /** Numeric or string value for the command */
  value?: number | string;
  /** If set: wait this many ms then verify the postcondition before confirming */
  verifyAfterMs?: number;
  /** Expected state after the command (for self-verification) */
  postcondition?: {
    sensor: string;
    operator: ComparisonOperator;
    value: number;
  };
  /**
   * If the command can be cancelled (e.g. "reduce speed" during an alert),
   * store the undo command here.  CENTRAL may send a REMOTE_COMMAND to undo it.
   */
  cancellationWindowMs?: number;
  undoCommandType?: string;
  undoValue?: number | string;
}

/**
 * Parameters for INCREASE_SAMPLING_RATE / RESET_SAMPLING_RATE actions.
 */
export interface SamplingRateParams {
  /** Driver id whose polling frequency to change */
  driverId: string;
  /** New debounce in ms (lower = more frequent) */
  newDebounceMs: number;
  /** Auto-reset after this duration if FSM doesn't reach FULL_MATCH */
  autoResetAfterMs?: number;
}

/**
 * A compiled dynamic slot: maps a named template slot to a data source path.
 *
 * Source path syntax (resolved at runtime against the active FSM context):
 *   "trigger.email.body"              → incoming trigger event payload
 *   "context.sender.client_id"        → enriched context from FSM state
 *   "stepOutputs.sentiment_analysis.key_phrases"  → output of previous step
 *   "event.crm.incidents_non_resolus" → PropagatedEvent field (in pipeline)
 *   "catalog.retention_budget_rules"  → pre-loaded catalog entry (compile-time)
 */
export interface CompiledDynamicSlot {
  /** Template slot name (e.g. "email_body", "client_id") */
  slot: string;
  /** Runtime source path (dot-separated JSON path into FSM context) */
  source: string;
}

/**
 * Compiled JSON schema for validating LLM / ML output.
 * Described as a JSON Schema subset (type + properties); validated at runtime
 * before the output is stored in stepOutputs and used in transition conditions.
 */
export type CompiledOutputSchema = Record<string, 'string' | 'float' | 'boolean' | 'object' | 'object|null' | string[] | { type: string; items?: string }>;

/**
 * Parameters for LLM_CALL on-entry action.
 * The entire LLM context is compiled at compile time.
 * At runtime: only dynamic slots are filled from current FSM state.
 */
export interface LLMCallActionDescriptor {
  /** Unique ID — referenced by LLM_OUTPUT ConditionDescriptor.instructionId */
  instructionId: string;

  /** LLM model to use (compiled from catalog / capability spec) */
  model: string;

  /** Sampling temperature 0.0–1.0 (0.0 = fully deterministic) */
  temperature: number;

  /** Maximum output tokens (compiled from intent) */
  maxTokens: number;

  /**
   * System prompt compiled at compile time.
   * Static text only — dynamic data comes via dynamic_slots.
   * Principles: minimal, no chain-of-thought, output format enforced by output_schema.
   */
  systemPrompt: string;

  /**
   * Few-shot examples from the service catalog (compiled at compile time).
   * Avoids drift if catalog changes after deployment (frozen at compile time).
   */
  fewShots?: Array<{ role: 'user' | 'assistant'; content: string }>;

  /**
   * Dynamic slots: runtime values injected into the prompt template.
   * All other prompt content is static (compiled).
   */
  dynamicSlots: CompiledDynamicSlot[];

  /**
   * Output schema: the LLM must return a JSON object conforming to this schema.
   * Validated before storing in stepOutputs.
   */
  outputSchema: CompiledOutputSchema;

  /** Timeout in ms; on timeout: apply onTimeout strategy */
  timeoutMs: number;

  /** What to do if the LLM call times out or the output fails schema validation */
  onTimeout?: import('./ir.interface').FallbackStrategy;

  /** Retry config for schema validation failure */
  retryOnInvalidOutput?: {
    maxAttempts: number;
    /** What to do after maxAttempts (defaults to FAIL_SAFE) */
    exhaustedStrategy?: import('./ir.interface').FallbackStrategy;
  };
}

/**
 * Parameters for ML_SCORE_CALL on-entry action.
 */
export interface MLScoreCallDescriptor {
  /** Unique ID — referenced by ML_SCORE ConditionDescriptor.instructionId */
  instructionId: string;
  /** ML model identifier (e.g. "churn_predictor_v3") */
  model: string;
  /** Pre-compiled feature list (feature names resolved at compile time) */
  featureNames: string[];
  /** Dynamic slots: map feature values from the current FSM context */
  dynamicSlots: CompiledDynamicSlot[];
  timeoutMs: number;
  onTimeout?: import('./ir.interface').FallbackStrategy;
  /**
   * Optional connector ID for remote ML serving (Triton, TorchServe, custom REST).
   * When set, ConnectorDispatchService routes the scoring call to this connector.
   * When absent, falls back to a neutral score stub.
   */
  connectorId?: string;
}

/**
 * Parameters for CRM_QUERY on-entry action.
 */
export interface CRMQueryDescriptor {
  /** Unique ID — referenced by CRM_QUERY_RESULT ConditionDescriptor.instructionId */
  instructionId: string;
  /** Connector ID (must match a registered ConnectorService) */
  connectorId: string;
  /** Pre-compiled query template (e.g. SQL or CRM-specific query language) */
  queryTemplate: string;
  /** Dynamic slots: parameters injected into the query template */
  dynamicSlots: CompiledDynamicSlot[];
  timeoutMs: number;
  onTimeout?: import('./ir.interface').FallbackStrategy;
}

/**
 * Parameters for PARALLEL_FETCH on-entry action.
 * Executes multiple LLM_CALL / ML_SCORE_CALL / CRM_QUERY actions concurrently.
 * Each sub-action stores its result in stepOutputs[sub-action.instructionId].
 * Used e.g. to launch CRM query + ML scoring simultaneously after sentiment fires.
 */
export interface ParallelFetchDescriptor {
  actions: Array<LLMCallActionDescriptor | MLScoreCallDescriptor | CRMQueryDescriptor>;
}

/**
 * Parameters for HUMAN_APPROVAL_GATE on-entry action.
 *
 * When the FSM executes this action:
 *  1. FSM instance suspends in current state (no further transitions until decided)
 *  2. HumanApprovalService registers a pending gate
 *  3. Dashboard / notification sent to `assigneeRule`-resolved user
 *  4. When manager approves/rejects, HumanApprovalService emits a
 *     HUMAN_APPROVAL TriggerEvent → FSM evaluates the awaiting transition
 *
 * This is the correct way to model HiL: NOT a blocking await, but a
 * suspended FSM state waiting for an external HUMAN_APPROVAL event.
 */
/**
 * Backoff/retry policy for any pipeline step.
 * On transient failure: wait `backoffMs * (backoffMultiplier ^ attempt)` before retrying.
 */
export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  /** Default 1.0 (linear). Use 2.0 for exponential backoff. */
  backoffMultiplier?: number;
  /** Which errors trigger a retry. Default: ALL_ERRORS */
  retryOn?: 'ALL_ERRORS' | 'NETWORK_ERRORS' | 'TIMEOUT_ONLY';
}

/**
 * How the human decision comes back to the system after the gate is opened.
 *
 * The system registers the appropriate listener/callback at gate activation time
 * based on this descriptor. The key insight: the approval can come from ANY channel —
 * a Slack button click, an email reply parsed by IMAP, a webhook, a connector callback,
 * or even another automated service acting as "approver".
 *
 *   HTTP_CALLBACK         → standard REST: POST /approvals/:gateId { decision, comment }
 *   CONNECTOR_CALLBACK    → any connector triggers resolve() (Slack interactive,
 *                           Notion status change, Jira workflow, Salesforce approval, etc.)
 *   POLLING               → the system polls a connector on an interval until it sees
 *                           a decision signal (e.g. Google Form submission, Airtable field)
 *   IMPLICIT              → any registered channel (dashboard default; dev/test only)
 */
export type ApprovalResponseChannel =
  | {
      type: 'HTTP_CALLBACK';
      /** Path suffix appended to the server base URL. Default: /approvals/:gateId */
      callbackPath?: string;
    }
  | {
      type: 'CONNECTOR_CALLBACK';
      /** Registered connector ID (Slack workspace, Teams tenant, Notion workspace…) */
      connectorId: string;
      /** Connector-specific parameters (channel ID, message template, button labels…) */
      params: Record<string, unknown>;
    }
  | {
      type: 'POLLING';
      connectorId: string;
      /** How often to check for a decision */
      pollIntervalMs: number;
      /** Dot-path in the connector response that holds the decision string */
      resultPath: string;
    }
  | { type: 'IMPLICIT' };

export interface HumanApprovalGateDescriptor {
  /** Unique gate ID — referenced by HUMAN_APPROVAL ConditionDescriptor.approvalGateId */
  gateId: string;
  /**
   * Compiled rule to resolve the assignee at runtime.
   * Examples: "manager_commercial_du_client", "senior_manager", "team_lead_crm",
   * "user:paul@company.io", "group:finance_controllers"
   * Resolved by the role-resolver in HumanApprovalService.
   */
  assigneeRule: string;
  /** Timeout in ms; on timeout: apply onTimeout strategy */
  timeoutMs: number;
  /** What to do if no decision arrives before timeout */
  onTimeout: import('./ir.interface').FallbackStrategy;
  /**
   * Fields from PropagatedEvent and pipeline stepOutputs to show the approver.
   * Source paths (same syntax as CompiledDynamicSlot.source).
   * Available as "approval.contextSnapshot.{path}" inside notifyVia slot resolution.
   */
  contextToShow: string[];
  /** Human-readable description of what is being approved */
  description?: string;
  /**
   * Steps executed to notify the assignee BEFORE the gate enters waiting state.
   *
   * Can be ANY PipelineStep:
   *   CONNECTOR_ACTION  → Slack message, Teams card, Notion task, Jira issue, Twilio SMS
   *   SEND_EMAIL        → Gmail / SMTP via connector
   *   CALL_HTTP         → custom webhook, WhatsApp Business API
   *   LOG               → dev/test mode — just log the intent
   *
   * Example: send a Slack message with approve/reject buttons, then a fallback email
   * if the Slack step fails (combine with continueOnFailure=true on the Slack step).
   *
   * The approval context snapshot is available in every slot as:
   *   "approval.gateId", "approval.assigneeRule", "approval.contextSnapshot.*"
   */
  notifyVia?: PipelineStep[];
  /**
   * How the decision signal returns to the system.
   * The system registers the listener at gate activation time.
   * Default: IMPLICIT (manual via dashboard / direct API call).
   */
  responseChannel?: ApprovalResponseChannel;
}

/**
 * A single compiled on-entry action attached to a transition's destination state.
 *
 * The `params` field carries the action-type-specific descriptor:
 *   - LLM_CALL         → LLMCallActionDescriptor
 *   - ML_SCORE_CALL    → MLScoreCallDescriptor
 *   - CRM_QUERY        → CRMQueryDescriptor
 *   - PARALLEL_FETCH   → ParallelFetchDescriptor
 *   - CONTROL_ACTUATOR → ActuatorControlParams
 *   - INCREASE/RESET_SAMPLING_RATE → SamplingRateParams
 *   - HUMAN_APPROVAL_GATE → HumanApprovalGateDescriptor
 */
export interface ESMEntryAction {
  type: ESMEntryActionType;
  /** Action-type-specific parameters (type-narrowed by ESMEntryActionType) */
  params?: (
    | LLMCallActionDescriptor
    | MLScoreCallDescriptor
    | CRMQueryDescriptor
    | ParallelFetchDescriptor
    | ActuatorControlParams
    | SamplingRateParams
    | HumanApprovalGateDescriptor
    | Record<string, any>
  );
  /** Human-readable description (used in audit logs) */
  description?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// FSM TRANSITIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Temporal guard evaluated on every potential transition.
 * WITHIN_WINDOW: transition only if the correlation window is still open.
 * WINDOW_ELAPSED: transition only when the window timer fires (EXPIRED path).
 */
export type TransitionGuard = 'WITHIN_WINDOW' | 'WINDOW_ELAPSED' | 'ALWAYS';

/**
 * A compiled state transition in the FSM.
 * When the FSM is in any of `fromStates` and `condition` is satisfied,
 * the `guard` determines if the transition fires.
 * If it fires, `onEntry` actions are executed synchronously before the state changes.
 */
export interface EventTransition {
  /** States from which this transition can fire */
  fromStates: string[];
  /** Destination state */
  toState: string;
  /** Event condition that triggers the transition */
  condition: ConditionDescriptor;
  /**
   * Temporal constraint on the transition:
   * - WITHIN_WINDOW: condition must fire before the window timer expires
   * - WINDOW_ELAPSED: used for EXPIRED transitions (condition is the timer fire event)
   * - ALWAYS: no temporal constraint (init → PARTIAL_1 typically)
   */
  guard: TransitionGuard;
  /** Actions executed synchronously when entering `toState` */
  onEntry: ESMEntryAction[];
  /** Priority (lower = higher priority) if multiple transitions could fire at once */
  priority?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPAGATION CONFIG
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compiled configuration for what data to include in a PropagatedEvent.
 * All fields are resolved at compile time; the FSM runtime just fills the values.
 */
export interface PropagationConfig {
  /** Include the actual sensor/KPI values that matched each sub-condition */
  includeMatchedValues: boolean;
  /** Compute and include rolling trends for specified metrics */
  computeTrends?: Array<{
    /** Metric name (must match a ConditionDescriptor.metricName in this FSM) */
    metricName: string;
    /** How far back to look for the trend (ms) */
    windowMs: number;
    /** Trend unit (e.g. "°C/min", "%/hr") */
    unit?: string;
  }>;
  /** Include the list of local actuator actions already taken on this node */
  includeLocalActionsTaken: boolean;
  /** Partial satisfaction level to include (1.0 for FULL_MATCH, < 1.0 for partial) */
  satisfactionLevel?: number;
  /**
   * Crypto hash algorithm for the signature field in PropagatedEvent.
   * Allows CENTRAL to verify authenticity of edge-node data.
   * Set to undefined to skip signing (lower-security deployments).
   */
  signatureAlgorithm?: 'SHA256' | 'SHA512' | 'HMAC_SHA256';
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE EVENT STATE MACHINE DESCRIPTOR (IR operand for EVENT_STATE_MACHINE opcode)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The complete compiled FSM descriptor — the operand of an EVENT_STATE_MACHINE
 * IR instruction.
 *
 * The FSM executor (EventStateMachineService) reads this at deployment time
 * and creates a runtime instance (FsmRuntimeState) per active workflow execution.
 */
export interface EventStateMachineDescriptor {
  /**
   * Unique ID for this state machine within the workflow.
   * Used to correlate PropagatedEvents back to the originating FSM.
   * Format: "<workflowId>_fsm_<n>" recommended.
   */
  machineId: string;

  /** Human-readable description (used in audit logs + dashboard) */
  description?: string;

  /**
   * Ordered list of state names.
   * Convention: first = initial state, last two = fullMatch + expired states.
   * Example: ['IDLE', 'PARTIAL_TEMP', 'PARTIAL_VIB', 'FULL_MATCH', 'EXPIRED']
   */
  states: string[];

  /** The initial state name (FSM starts here and resets here) */
  initialState: string;

  /**
   * The state name that represents complete condition satisfaction.
   * On entering this state, PROPAGATE_ENRICHED action fires automatically.
   */
  fullMatchState: string;

  /**
   * The state name that represents temporal window expiry without full match.
   * On entering this state, RESET_FSM action fires automatically.
   */
  expiredState: string;

  /**
   * Correlation time window in milliseconds.
   * The compiler resolves "within 10 minutes" → 600_000.
   * The window starts when the FSM leaves its initial state (first PARTIAL).
   * All remaining conditions must fire before this window expires.
   */
  windowMs: number;

  /** All compiled transitions */
  transitions: EventTransition[];

  /**
   * Additional local actuator commands to execute on FULL_MATCH,
   * BEFORE emitting the PropagatedEvent.
   * These override/supplement actions already in the fullMatchState onEntry.
   */
  localActionsOnFullMatch?: Array<{
    action: ESMEntryAction;
    /** If true, emit PropagatedEvent even if this action fails (best-effort) */
    continueOnFailure?: boolean;
  }>;

  /** Configuration for the PropagatedEvent emitted on FULL_MATCH */
  enrichedEventConfig: PropagationConfig;

  /**
   * Node where this FSM will be deployed (set by Stage 9).
   * When targeting CENTRAL, EventStateMachineService runs it in-process.
   * When targeting an edge node, the descriptor is serialized and pushed
   * via REMOTE_COMMAND 'deploy_fsm'.
   */
  targetNodeId?: string;

  /**
   * IDs of trigger drivers this FSM subscribes to for raw event input.
   * Set by the compiler; the FSM runtime subscribes to these via TriggerBusService.
   */
  subscribedDriverIds?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT HANDLER DESCRIPTOR (IR operand for HANDLE_PROPAGATED opcode)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Types of server-side actions that HANDLE_PROPAGATED can execute.
 */
export enum EventHandlerActionType {
  /** Send an alert (email, Slack, PagerDuty, SMS) */
  ALERT = 'ALERT',
  /** Create an external ticket (SAP, ServiceNow, Jira) */
  CREATE_TICKET = 'CREATE_TICKET',
  /** Dispatch a REMOTE_COMMAND to another edge node */
  DISPATCH_REMOTE_COMMAND = 'DISPATCH_REMOTE_COMMAND',
  /** Call an external HTTP service */
  CALL_HTTP = 'CALL_HTTP',
  /** Evaluate precursor signals and conditionally act */
  EVALUATE_AND_FORWARD = 'EVALUATE_AND_FORWARD',
  /** Store the PropagatedEvent in a DB for historical analysis */
  PERSIST_EVENT = 'PERSIST_EVENT',
  /** Log structured audit entry */
  AUDIT_LOG = 'AUDIT_LOG',
}

/**
 * A single compiled action within an HANDLE_PROPAGATED instruction.
 * Multiple actions execute in parallel (no ordering dependency assumed).
 */
export interface EventHandlerAction {
  type: EventHandlerActionType;

  // ── For ALERT ────────────────────────────────────────────────────────────
  alertConfig?: {
    channel: 'email' | 'slack' | 'pagerduty' | 'sms' | 'teams';
    recipients: string[];
    /** Compiled template (uses {{ propEvent.matchedValues.M1_temp }} syntax) */
    template: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';
  };

  // ── For CREATE_TICKET ─────────────────────────────────────────────────────
  ticketConfig?: {
    system: 'SAP' | 'ServiceNow' | 'Jira' | 'generic';
    connectorId: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    /** Compiled template for the ticket title/description */
    titleTemplate: string;
    descriptionTemplate: string;
    /** Fields to map from PropagatedEvent into the ticket payload */
    fieldMappings?: Record<string, string>;
  };

  // ── For DISPATCH_REMOTE_COMMAND ──────────────────────────────────────────
  remoteCommandRef?: {
    /** The RemoteCommandDescriptor (inlined or referenced by commandId) */
    commandDescriptor: RemoteCommandDescriptor;
  };

  // ── For EVALUATE_AND_FORWARD ─────────────────────────────────────────────
  evaluateAndForward?: {
    /** Field from PropagatedEvent.precursorSignals to evaluate */
    signalMetric: string;
    /**
     * If this condition is true, dispatch remoteCommandRef to a target node.
     * Allows: "if M3 shows precursor trends → reduce M3 preventively"
     */
    condition: ConditionDescriptor;
    commandOnTrue: RemoteCommandDescriptor;
    commandOnFalse?: RemoteCommandDescriptor;
  };

  // ── For CALL_HTTP ────────────────────────────────────────────────────────
  httpConfig?: {
    url: string;
    method: 'POST' | 'PUT' | 'PATCH';
    /** Compiled body template */
    bodyTemplate: string;
    headers?: Record<string, string>;
    vaultPathForAuth?: string;
  };
}

/**
 * The complete compiled handler descriptor — the operand of a HANDLE_PROPAGATED
 * IR instruction.
 *
 * Two execution models (choose one per handler):
 *
 * A) parallelActions  — Simple: all actions fire concurrently.
 *    Use for: alerts, tickets, CRM writes, concurrent RemoteCommands.
 *
 * B) pipeline         — Ordered: steps execute sequentially with full
 *    LLM/loop/branch/human-gate capabilities.
 *    Use for: complex retention flows, multi-step LLM analysis,
 *    iterative offer generation, human-in-the-loop approval.
 *
 *    The pipeline is the same philosophy as the FSM:
 *    every step (LLM call, human gate, branch) is pre-compiled;
 *    the executor is a deterministic sequential dispatch engine.
 */
export interface EventHandlerDescriptor {
  /**
   * Which FSM machine ID's PropagatedEvent triggers this handler.
   * Must match an EventStateMachineDescriptor.machineId in the same IR.
   */
  triggeredByMachineId: string;

  /**
   * Minimum satisfaction level required to trigger this handler.
   * 1.0 = only on FULL_MATCH, 0.5 = also on partial satisfied at 50%+
   */
  minSatisfactionLevel: number;

  /**
   * Mode A: Simple parallel actions.
   * Executed concurrently when a PropagatedEvent arrives.
   * Optional when `pipeline` is provided.
   */
  parallelActions?: EventHandlerAction[];

  /**
   * Mode B: Sequential pipeline with LLM calls, loops, branches, human gates.
   * Executed by PipelineExecutorService step by step.
   * Each step's output is accumulated in a `pipelineContext` object and
   * accessible to subsequent steps via source path "pipeline.{stepId}.output".
   *
   * If both parallelActions and pipeline are defined:
   * parallelActions fire concurrently BEFORE the pipeline starts.
   */
  pipeline?: PipelineStep[];

  /** Human-readable description for audit logs */
  description?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// REMOTE COMMAND DESCRIPTOR (IR operand for REMOTE_COMMAND opcode)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The compiled descriptor for a REMOTE_COMMAND instruction.
 * CENTRAL sends this to a specific edge node via WebSocket.
 */
export interface RemoteCommandDescriptor {
  /**
   * Unique command ID — matches against RemoteCommandHandlerDescriptor.listensFor
   * on the receiving node.
   */
  commandId: string;

  /** Target edge node ID (set by Stage 9 from the IR targetNodeId field) */
  targetNodeId: string;

  /** Semantic command type (used by the edge SVM dispatcher) */
  command: string;

  /** Compiled command parameters (actuator IDs, values, config) */
  params?: Record<string, any>;

  /**
   * If set, the edge node must acknowledge within this window (ms).
   * On timeout: CENTRAL escalates via HANDLE_PROPAGATED → ALERT fallback.
   */
  ackTimeoutMs?: number;

  /**
   * If this command can be cancelled (undone), CENTRAL sends the undo command
   * via another REMOTE_COMMAND after this window expires.
   */
  cancellationWindowMs?: number;

  /** Special command: deploy a full EventStateMachineDescriptor to the edge node */
  deployFsm?: EventStateMachineDescriptor;
}

/**
 * The compiled handler for a REMOTE_COMMAND on the edge node side.
 * operand of a HANDLE_REMOTE_CMD instruction.
 */
export interface RemoteCommandHandlerDescriptor {
  /** Command IDs this handler responds to (can use '*' as wildcard) */
  listensFor: string[];

  /** Actions to execute when a matching command arrives */
  actions: ESMEntryAction[];

  /** If true, send an ack back to CENTRAL after completing all actions */
  sendAck: boolean;

  /** Ack payload template (can include sensor readings for confirmation) */
  ackPayloadTemplate?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPAGATED EVENT (runtime type — NOT an IR descriptor)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An enriched, typed event emitted by an edge FSM node when it reaches
 * FULL_MATCH (or a configured partial threshold).
 *
 * This is NOT a TriggerEvent. It carries full causal context:
 * - The actual sensor values that caused each sub-condition to fire
 * - Rolling trends for precursor analysis
 * - Local actuator commands already executed (with cancellation windows)
 * - Time window data for temporal correlation audit
 * - Optional crypto signature for tamper detection
 *
 * Transport: WebSocket message 'propagated_event' from edge node to CENTRAL.
 * Consumer: PropagatedEventService → EventHandlerDescriptor dispatch.
 */
export interface PropagatedEvent {
  /** Globally unique event ID (UUID v4, generated by the FSM node) */
  eventId: string;

  /** FSM machine ID that generated this event (matches EventStateMachineDescriptor.machineId) */
  machineId: string;

  /** ID of the node that ran the FSM */
  sourceNodeId: string;

  /** Workflow that owns the FSM */
  workflowId: string;

  /** ISO 8601 timestamp of the event emission */
  timestamp: string;

  /**
   * Fraction of conditions satisfied: 1.0 = all conditions met (FULL_MATCH),
   * < 1.0 = partial match emitted by PROPAGATE_PARTIAL action.
   */
  satisfactionLevel: number;

  /**
   * The actual sensor/KPI values that caused each sub-condition to fire.
   * Key = ConditionDescriptor.metricName, Value = measured value + timestamp.
   * Example: { "M1_temperature": { value: 84.3, unit: "°C", timestamp: "..." } }
   */
  matchedValues: Record<
    string,
    { value: number | string; unit?: string; timestamp: string }
  >;

  /**
   * Time window data for temporal correlation audit.
   * startedAt: when the FSM left IDLE (first PARTIAL entered).
   * completedAt: when FULL_MATCH (or partial) state was reached.
   */
  timeWindow: {
    startedAt: string;
    completedAt: string;
    windowMs: number;
    remainingMs: number; // how much window was unused — measures reactivity
  };

  /**
   * Actuator control commands already executed locally on the source node
   * BEFORE this event was emitted.  CENTRAL must not re-issue these commands
   * unless it sends an explicit override.
   */
  localActionsTaken: Array<{
    actionType: string;
    actuatorId?: string;
    value?: number | string;
    executedAt: string;
    status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS';
    /**
     * If the action can be undone, CENTRAL can send a REMOTE_COMMAND to cancel it
     * before this timestamp.
     */
    cancellableUntil?: string;
  }>;

  /**
   * Precursor signals useful for EVALUATE_AND_FORWARD decisions.
   * e.g. temperature trend, vibration amplitude growth, efficiency velocity.
   * Key = metric name, Value = trend value (computed by PropagationConfig.computeTrends).
   */
  precursorSignals: Record<
    string,
    { value: number | string; unit?: string; direction?: 'RISING' | 'FALLING' | 'STABLE' }
  >;

  /**
   * HMAC/SHA signature of the core payload fields.
   * Allows CENTRAL to verify the event wasn't tampered en route.
   * Format: "<algorithm>:<hex_digest>"
   */
  signature?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// RUNTIME FSM STATE (in-memory, not IR)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE STEPS (EventHandlerDescriptor.pipeline)
// These define a compiled sequential execution plan for HANDLE_PROPAGATED.
// Each step is identified by a unique id; subsequent steps can reference
// earlier outputs via source paths like "pipeline.sentiment_analysis.output".
// ─────────────────────────────────────────────────────────────────────────────

/** Pipeline action types that can appear as PipelineStep entries */
export enum PipelineStepType {
  LLM_CALL           = 'LLM_CALL',
  LOOP               = 'LOOP',
  ML_SCORE_CALL      = 'ML_SCORE_CALL',
  CRM_QUERY          = 'CRM_QUERY',
  BRANCH             = 'BRANCH',
  HUMAN_APPROVAL_GATE = 'HUMAN_APPROVAL_GATE',
  SEND_EMAIL         = 'SEND_EMAIL',
  WRITE_CRM          = 'WRITE_CRM',
  ALERT              = 'ALERT',
  CALL_HTTP          = 'CALL_HTTP',
  LOG                = 'LOG',
  /**
   * Generic connector action — covers ALL external integrations:
   * Slack, Gmail, Notion, Jira, Salesforce, Twilio (SMS/call),
   * Teams, WhatsApp, Linear, HubSpot, Airtable, GitHub, etc.
   * The connector must be registered in ConnectorsService.
   */
  CONNECTOR_ACTION   = 'CONNECTOR_ACTION',
  /**
   * Multi-LLM pipeline — spec §10.2
   *
   * Chains multiple LLM models in sequence where each stage's output is
   * passed to the next as validated input.  Enables patterns like:
   *   Claude Opus  (high-reasoning, initial analysis)
   *   → GPT-4o Vision (multi-modal interpretation)
   *   → Specialized domain model (classification / scoring)
   *
   * Each stage has its own static context (compiled at compile time),
   * output_schema (strictly typed), and dynamic_slots.
   * Type validation is enforced between stages before proceeding.
   */
  MULTI_LLM_PIPELINE = 'MULTI_LLM_PIPELINE',
}

/** Base for all pipeline step types */
export interface PipelineStepBase {
  /** Unique step ID — referenced by subsequent steps and by ConditionDescriptors */
  id: string;
  stepType: PipelineStepType;
  description?: string;
  /**
   * If true: step failure does NOT abort the pipeline.
   * Next step receives an error object instead of the step's output.
   */
  continueOnFailure?: boolean;
  /**
   * If true: the step is simulated — intent is logged but side effects are skipped.
   * Useful for: testing new workflows, staging pipelines, "preview before send" patterns.
   * The step always returns { dryRun: true, intendedAction: <description> }.
   */
  dryRun?: boolean;
  /**
   * Retry policy on transient failures (network errors, connector timeouts, etc.)
   * If not set: no retry — the step fails immediately on first error.
   */
  retryPolicy?: RetryPolicy;
  /**
   * Safety circuit breaker: this step only executes if the named approval gate
   * was explicitly APPROVED in the same pipeline execution.
   * If the gate was rejected, timed out, or not reached: step is SKIPPED.
   *
   * Example: requiresApprovalGateId = "manager_approval"
   *   → send_offer_email only runs if the manager clicked Approve in Slack.
   *   → write_crm_deal_won only runs if the manager clicked Approve.
   */
  requiresApprovalGateId?: string;
}

/** Pipeline step: LLM call (same descriptor as FSM on-entry LLM_CALL) */
export interface LLMCallStep extends PipelineStepBase {
  stepType: PipelineStepType.LLM_CALL;
  llm: LLMCallActionDescriptor;
}

/**
 * Pipeline step: bounded loop around a sub-step (typically a LLM call for
 * iterative refinement e.g. "generate offer until quality > 0.8").
 *
 * convergencePredicate: JS expression evaluated against the last iteration's
 * output (bound as `output`).  Loop exits early when it returns true.
 * After max_iterations: use FallbackStrategy (default: USE_BEST_ATTEMPT).
 */
export interface LoopStep extends PipelineStepBase {
  stepType: PipelineStepType.LOOP;
  maxIterations: number;
  timeoutMs: number;
  /**
   * Exit condition evaluated against latest iteration output.
   * Example: "output.offer_quality_score > 0.8 && output.offer_within_budget"
   */
  convergencePredicate: string;
  /** The step executed on each iteration */
  iterationBody: LLMCallStep | MLScoreCallStep | CRMQueryStep;
  /**
   * How previous iteration output is fed into the next iteration's dynamic slots.
   * APPEND_PREVIOUS: previous output bound as `previous_iteration` slot.
   * REPLACE:         previous output entirely replaces the dynamic input.
   */
  contextEnrichment: 'APPEND_PREVIOUS' | 'REPLACE';
  onMaxIterations?: import('./ir.interface').FallbackStrategy;
  /** The step output key that holds the BEST result across all iterations */
  bestOutputField?: string;
}

/** Pipeline step: ML scoring call */
export interface MLScoreCallStep extends PipelineStepBase {
  stepType: PipelineStepType.ML_SCORE_CALL;
  ml: MLScoreCallDescriptor;
}

/** Pipeline step: CRM / database query */
export interface CRMQueryStep extends PipelineStepBase {
  stepType: PipelineStepType.CRM_QUERY;
  crm: CRMQueryDescriptor;
}

/**
 * Pipeline step: compiled branch.
 * `condition` is a JS expression evaluated against the accumulated pipeline
 * context (all previous step outputs available in scope as `pipeline`).
 * Example: "pipeline.offer_validation.output.is_valid === true"
 */
export interface BranchStep extends PipelineStepBase {
  stepType: PipelineStepType.BRANCH;
  /** JS expression evaluated against pipeline context */
  condition: string;
  /** Steps executed if condition is true */
  ifTrue: PipelineStep[];
  /** Steps executed if condition is false (optional) */
  ifFalse?: PipelineStep[];
}

/** Pipeline step: human approval gate (same descriptor as FSM on-entry) */
export interface HumanApprovalStep extends PipelineStepBase {
  stepType: PipelineStepType.HUMAN_APPROVAL_GATE;
  gate: HumanApprovalGateDescriptor;
  /** Steps to execute on APPROVED */
  onApproved: PipelineStep[];
  /** Steps to execute on REJECTED */
  onRejected?: PipelineStep[];
}

/** Pipeline step: send email via compiled template */
export interface SendEmailStep extends PipelineStepBase {
  stepType: PipelineStepType.SEND_EMAIL;
  /** Connector ID for the email service */
  connectorId: string;
  /** Dynamic slots for subject/body personalization */
  dynamicSlots: CompiledDynamicSlot[];
  /** Compiled subject template */
  subjectTemplate: string;
  /** Compiled body template */
  bodyTemplate: string;
  /** Postcondition: verify delivery before marking step SUCCESS */
  verifyDelivery?: boolean;
  onDeliveryFailure?: import('./ir.interface').FallbackStrategy;
}

/** Pipeline step: write CRM record.
 * mandatory=true: executes even if earlier pipeline steps failed. */
export interface WriteCRMStep extends PipelineStepBase {
  stepType: PipelineStepType.WRITE_CRM;
  connectorId: string;
  /**
   * Field mapping: CRM field → source path in pipeline context.
   * Evaluated at runtime against the accumulated pipeline outputs.
   */
  fieldMappings: Record<string, string>;
  /**
   * If true: this step always runs regardless of upstream failures.
   * Ensures audit trail is never skipped ("CRM update: always, quoi qu'il arrive").
   */
  mandatory: boolean;
}

/** Pipeline step: send alert (inline — same as EventHandlerAction.ALERT) */
export interface AlertStep extends PipelineStepBase {
  stepType: PipelineStepType.ALERT;
  channel: 'email' | 'slack' | 'pagerduty' | 'sms' | 'teams';
  recipients: string[];
  template: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';
}

/** Pipeline step: HTTP call */
export interface CallHttpStep extends PipelineStepBase {
  stepType: PipelineStepType.CALL_HTTP;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  dynamicSlots: CompiledDynamicSlot[];
  bodyTemplate?: string;
  headers?: Record<string, string>;
  vaultPathForAuth?: string;
}

/** Pipeline step: structured log entry */
export interface LogStep extends PipelineStepBase {
  stepType: PipelineStepType.LOG;
  template: string;
  level?: 'INFO' | 'WARN' | 'ERROR';
}

/**
 * Pipeline step: generic connector action.
 *
 * This is the UNIVERSAL integration step — one interface to rule all connectors.
 * A connector is any pre-registered integration: Slack workspace, Gmail account,
 * Notion workspace, Jira project, HubSpot portal, Salesforce org, Twilio account,
 * Teams tenant, WhatsApp Business, Linear workspace, Airtable base, GitHub org, etc.
 *
 * Action naming convention: "<resource>.<verb>" or just "<verb>"
 *   Slack:    "message.send", "channel.create", "user.dm"
 *   Notion:   "page.create", "database.query", "page.update"
 *   Jira:     "issue.create", "issue.update", "comment.add"
 *   Twilio:   "sms.send", "call.initiate", "whatsapp.send"
 *   Gmail:    "email.send", "thread.reply", "label.add"
 *   HubSpot:  "contact.update", "deal.create", "note.create"
 *
 * Dynamic slots resolve from pipeline context (same path syntax as everywhere).
 * Output is mapped via extractOutput for downstream steps to reference.
 */
export interface ConnectorActionStep extends PipelineStepBase {
  stepType: PipelineStepType.CONNECTOR_ACTION;
  /** Registered connector ID (e.g. "slack_prod", "gmail_support", "jira_main") */
  connectorId: string;
  /**
   * Connector-specific action to invoke.
   * Examples: "message.send", "page.create", "issue.update", "sms.send"
   */
  action: string;
  /** Dynamic parameters resolved from pipeline context at execution time */
  dynamicSlots: CompiledDynamicSlot[];
  /**
   * Maps connector response fields to named output keys.
   * Example: { "messageId": "data.ts", "permalink": "data.message.permalink" }
   * All keys available as "pipeline.{stepId}.output.{key}" for downstream steps.
   */
  extractOutput?: Record<string, string>;
}

/**
 * A single stage in a Multi-LLM pipeline (spec §10.2).
 *
 * Stages are compiled at compile time — the full context (system_prompt,
 * few_shots, output_schema) is frozen into the LLM-IR.  Only dynamic_slots
 * are resolved at runtime (event payload or Vault secrets).
 *
 * The output of stage N is validated against `outputSchema` before being
 * passed to stage N+1 as the `previousStageOutput` dynamic slot.
 */
export interface MultiLLMStage {
  /** Unique within the pipeline step (e.g. "reasoning", "vision", "classification") */
  stageId: string;
  /** Human-readable label (for audit trail) */
  label?: string;

  /** LLM model for this stage (e.g. "claude-3-opus-20240229", "gpt-4o", "mistral-7b") */
  model: string;
  /** LLM provider: "openai" | "anthropic" | "vertex" | "ollama" */
  provider: string;

  /** Sampling temperature 0.0–1.0 (compiled, frozen) */
  temperature: number;
  /** Maximum output tokens (compiled, frozen) */
  maxTokens: number;

  /**
   * Static system prompt — compiled at compile time, NEVER modified at runtime.
   * Dynamic values come from `dynamicSlots`.
   */
  systemPrompt: string;

  /**
   * Few-shot examples baked into compiled context (spec §3.4).
   * Frozen at compile time from the catalogue entry.
   */
  fewShots?: Array<{ role: 'user' | 'assistant'; content: string }>;

  /**
   * Dynamic slots resolved at runtime from: event payload, Vault secrets,
   * or previous stage outputs (`pipeline.<stage_id>.output`).
   */
  dynamicSlots: CompiledDynamicSlot[];

  /**
   * JSON Schema the output must conform to before passing to the next stage.
   * If validation fails: apply `onValidationFailure` (default: FAIL_SAFE).
   */
  outputSchema: CompiledOutputSchema;

  /**
   * Timeout in ms for this stage's LLM call (default: 30 000).
   * On timeout: apply `onTimeout` strategy.
   */
  timeoutMs?: number;

  /** Strategy on output schema validation failure */
  onValidationFailure?: import('./ir.interface').FallbackStrategy;

  /** Strategy on LLM call timeout */
  onTimeout?: import('./ir.interface').FallbackStrategy;

  /**
   * If true: this stage's output is included in a multi-modal payload.
   * The next stage receives both text and image/audio inputs.
   */
  isMultiModal?: boolean;
}

/**
 * Pipeline step: multi-LLM sequential pipeline (spec §10.2).
 *
 * Each stage's validated output is automatically forwarded to the next stage
 * via its `previousStageOutput` dynamic slot.  The final stage's output is
 * the step's output (accessible as `pipeline.<stepId>.output`).
 *
 * Example pattern (medical report):
 *   Stage 1: Claude Opus  → extract clinical entities from free text
 *   Stage 2: GPT-4o       → cross-reference with patient history image
 *   Stage 3: MedBERT      → SIL classification + risk score
 */
export interface MultiLLMPipelineStep extends PipelineStepBase {
  stepType: PipelineStepType.MULTI_LLM_PIPELINE;
  /** Ordered sequence of LLM stages (min 2, max 10) */
  stages: MultiLLMStage[];
  /**
   * If true: stages are executed in parallel (fan-out/fan-in).
   * The final output is a merged object keyed by stageId.
   * Default: false (sequential chaining).
   */
  parallel?: boolean;
}

/**
 * Discriminated union of all pipeline step types.
 * The compiler produces arrays of PipelineStep.
 * The PipelineExecutorService exhaustively switches on stepType.
 */
export type PipelineStep =
  | LLMCallStep
  | LoopStep
  | MLScoreCallStep
  | CRMQueryStep
  | BranchStep
  | HumanApprovalStep
  | SendEmailStep
  | WriteCRMStep
  | AlertStep
  | CallHttpStep
  | LogStep
  | ConnectorActionStep
  | MultiLLMPipelineStep;

// ─────────────────────────────────────────────────────────────────────────────
// RUNTIME FSM STATE (in-memory, not IR)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runtime state of a deployed EventStateMachineDescriptor instance.
 * One per (machineId + workflowExecutionId) pair.
 * Managed exclusively by EventStateMachineService.
 */
export interface FsmRuntimeState {
  /** Machine ID (matches EventStateMachineDescriptor.machineId) */
  machineId: string;
  /** Unique execution instance ID */
  instanceId: string;
  /** Workflow ID this instance belongs to */
  workflowId: string;
  /** Node running this FSM */
  nodeId: string;

  /** Current FSM state name */
  currentState: string;

  /** Timestamp when the correlation window started (FSM left initial state) */
  windowStartedAt?: Date;
  /** Timestamp when the window will expire */
  windowExpiresAt?: Date;
  /** Active timer handle (used to cancel on FULL_MATCH) */
  windowTimerHandle?: ReturnType<typeof setTimeout>;

  /**
   * Accumulated matched values (built up as conditions fire one by one).
   * Key = ConditionDescriptor.metricName, Value = { value, unit, timestamp }.
   * Serialized into PropagatedEvent.matchedValues.
   */
  matchedValues: Record<
    string,
    { value: number | string; unit?: string; timestamp: string }
  >;

  /**
   * Outputs of on-entry LLM_CALL / ML_SCORE_CALL / CRM_QUERY / PARALLEL_FETCH
   * steps, keyed by instructionId.
   *
   * These are the "digital sensor readings" of the FSM:
   *   stepOutputs["sentiment_analysis"] = { is_negative: true, confidence: 0.91, ... }
   *   stepOutputs["churn_predictor"]    = { churn_score: 0.82 }
   *   stepOutputs["crm_incidents"]      = { incidents_count: 2, latest_date: "..." }
   *
   * LLM_OUTPUT / ML_SCORE / CRM_QUERY_RESULT ConditionDescriptors evaluate
   * these values to drive state transitions — identically to sensor thresholds.
   */
  stepOutputs: Record<string, unknown>;

  /**
   * Pending human approval gates for this FSM instance.
   * Key = HumanApprovalGateDescriptor.gateId
   * Value = gate registration info (for timeout management + resolution)
   */
  pendingApprovalGates: Record<string, { gateId: string; registeredAt: Date; timeoutHandle: ReturnType<typeof setTimeout> }>;

  /**
   * Local actions already taken during this FSM instance's lifecycle.
   * Serialized into PropagatedEvent.localActionsTaken.
   */
  localActionsTaken: Array<{
    actionType: string;
    actuatorId?: string;
    value?: number | string;
    executedAt: Date;
    status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS';
    cancellableUntil?: Date;
  }>;

  /** Sampling rate changes made during this instance (for cleanup on reset) */
  activeSamplingRateChanges: Array<{
    driverId: string;
    previousDebounceMs: number;
    newDebounceMs: number;
    autoResetHandle?: ReturnType<typeof setTimeout>;
  }>;

  /** ISO timestamp of FSM creation */
  createdAt: string;
  /** ISO timestamp of last state change */
  lastTransitionAt: string;
}
