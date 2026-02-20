/**
 * Node Placement & Capability Types
 * 
 * Defines what each execution node (Nest.js or Rust) can execute
 * Used during compilation to determine target node for each DAG edge
 */

// ============================================================================
// EXECUTION NODE TYPES
// ============================================================================

export enum ExecutionNodeType {
  NEST_JS_CENTRAL = 'nest_js_central', // Central orchestrator
  RUST_EDGE = 'rust_edge', // Edge devices (IoT, microcontroller, Raspberry Pi, etc.)
}

// ============================================================================
// CAPABILITY DEFINITIONS
// ============================================================================

/**
 * What a node CAN execute
 */
export interface NodeCapabilities {
  // Handler types this node can execute
  canExecute: ExecutorType[];

  // Connector sources this node can listen to
  connectorsSupported: string[]; // 'kafka', 'mqtt', 'fs_watcher', 'gpio', 'http_webhook'

  // Actions this node can perform
  actionsSupported: string[]; // 'send_local_notification', 'write_file', 'gpio_toggle', 'kafka_produce'

  // Network reachability (important for Rust nodes)
  canReach: string[]; // 'localhost:5432', 'kafka.internal:9092'

  // Performance constraints
  maxMemoryBytes?: number; // For embedded devices
  maxConcurrentExecutions?: number;
}

/**
 * What a node CANNOT execute (harder to list exhaustively, so we list negatives)
 */
export interface NodeLimitations {
  // Handler types this node CANNOT execute
  cannotExecute?: ExecutorType[];

  // Connectors this node cannot reach
  cannotReach?: string[]; // 'external-api.cloud.com'

  // Actions this node cannot perform
  actionsNotSupported?: string[]; // 'mcp_server_call', 'cloud_gpt_inference'
}

/**
 * Type of execution handler
 */
export enum ExecutorType {
  // Trigger handlers (incoming event)
  TRIGGER_HANDLER = 'trigger_handler',

  // Condition evaluation
  CONDITION_EVALUATOR = 'condition_evaluator',

  // Action execution
  ACTION_HANDLER = 'action_handler',

  // Fallback/error recovery
  FALLBACK_HANDLER = 'fallback_handler',

  // MCP server calls (complex external service)
  MCP_SERVER_CALL = 'mcp_server_call',

  // LLM inference
  LLM_INFERENCE = 'llm_inference',

  // Custom script execution
  SCRIPT_EXECUTOR = 'script_executor',

  // Data transformation
  DATA_TRANSFORMER = 'data_transformer',
}

// ============================================================================
// EXECUTION NODE REGISTRY
// ============================================================================

/**
 * Registered execution node in the cluster
 */
export interface ExecutionNodeRegistration {
  node_id: string;
  type: ExecutionNodeType;
  location?: string; // Descriptive location (e.g., 'Hospital_Floor_3', 'AWS_us_east_1')
  capabilities: NodeCapabilities;
  limitations?: NodeLimitations;
  registered_at: Date;
  last_heartbeat?: Date;
  status: 'online' | 'offline' | 'degraded';
  metadata?: Record<string, any>;
}

// ============================================================================
// NODE PLACEMENT DECISION
// ============================================================================

/**
 * Decision made during compilation about where a DAG node executes
 */
export interface NodePlacementDecision {
  dag_node_id: string;
  target_node_id: string; // Which Nest.js or Rust node executes this
  target_node_type: ExecutionNodeType;
  executor_type: ExecutorType;
  requires_preload?: string[]; // Resources to preload before execution
  fallback_target?: string; // Alternative node if primary unavailable
}

/**
 * Placement validation result
 */
export interface PlacementValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  placements: NodePlacementDecision[];
}

// ============================================================================
// DAG NODE EXECUTION METADATA
// ============================================================================

/**
 * Metadata attached to each DAG node about its execution
 */
export interface DAGNodeExecutionMetadata {
  node_id: string;
  executor_type: ExecutorType;
  target_node_type: ExecutionNodeType;
  target_node_id?: string; // Specific node, or null = any capable node
  requires_resources: string[]; // Pre-allocated resources
  estimated_latency_ms: number;
  timeout_ms: number;
  retry_policy?: {
    max_attempts: number;
    backoff_ms: number;
  };
}

// ============================================================================
// PRELOAD & CACHING
// ============================================================================

/**
 * Resource to preload on a node before DAG execution starts
 */
export interface PreloadResource {
  resource_id: string;
  type: 'connection' | 'data' | 'schema' | 'permission_set';
  connector_id?: string;
  expires_at?: Date;
  metadata?: Record<string, any>;
}

/**
 * Preload list for a DAG version
 * Tells Rust node: "Before running DAG v2, cache these things"
 */
export interface DAGPreloadList {
  dag_version_id: string;
  resources: PreloadResource[];
  generated_at: Date;
  valid_until: Date;
}
