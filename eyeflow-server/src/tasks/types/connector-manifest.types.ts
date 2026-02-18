/**
 * Connector Manifest Types
 * Describes all metadata a connector exposes to the system
 * This is the "contract" that tells the LLM:
 * - What this connector can do
 * - What data it exposes
 * - What functions it provides
 * - How to trigger it
 */

// ============================================================================
// DATA TYPE SYSTEM
// ============================================================================

/**
 * Supported data types in the system
 * Used to validate parameter types and schema compatibility
 */
export enum DataType {
  STRING = 'string',
  NUMBER = 'number',
  INTEGER = 'integer',
  BOOLEAN = 'boolean',
  DATE = 'date',
  DATETIME = 'datetime',
  OBJECT = 'object',
  ARRAY = 'array',
  UUID = 'uuid',
  EMAIL = 'email',
  URL = 'url',
  PHONE = 'phone',
  JSON = 'json',
  BINARY = 'binary',
  ENUM = 'enum',
  BUFFER = 'buffer',
  NULL = 'null',
}

/**
 * Schema for a single field/property
 */
export interface FieldSchema {
  name: string;
  type: DataType;
  description: string;
  required: boolean;
  default?: any;
  // For ENUM type
  enumValues?: string[];
  // For ARRAY type
  arrayItemType?: DataType;
  // For OBJECT type
  nestedFields?: FieldSchema[];
  // Additional metadata
  example?: any;
  pattern?: string; // Regex pattern for validation
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  format?: string; // e.g., 'email', 'uuid', 'date-time'
}

/**
 * Complete schema for a data structure
 * Can be for request/response bodies, events, etc.
 */
export interface DataSchema {
  name: string;
  description: string;
  fields: FieldSchema[];
  example?: Record<string, any>;
  documentation?: string;
}

// ============================================================================
// FUNCTION/ACTION SYSTEM
// ============================================================================

/**
 * Parameter for a function/action
 */
export interface FunctionParameter {
  name: string;
  type: DataType;
  description: string;
  required: boolean;
  default?: any;
  example?: any;
  enumValues?: string[];
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
  };
}

/**
 * Response from a function execution
 */
export interface FunctionResponse {
  success: boolean;
  dataType: DataType;
  description: string;
  schema?: DataSchema;
  example?: any;
  errorCases?: Array<{
    status: string;
    description: string;
    example?: any;
  }>;
}

/**
 * A callable function/action the connector provides
 */
export interface ConnectorFunction {
  id: string;
  name: string;
  description: string;
  category: 'READ' | 'WRITE' | 'DELETE' | 'EXECUTE' | 'QUERY' | 'TRANSFORM';
  parameters: FunctionParameter[];
  response: FunctionResponse;
  // Which nodes/resources this function operates on
  targetNodeTypes?: string[];
  // Authentication required
  requiresAuth: boolean;
  // Rate limiting
  rateLimitPerMinute?: number;
  // Performance metrics
  averageExecutionTimeMs?: number;
  // Usage examples
  examples?: Array<{
    description: string;
    input: Record<string, any>;
    output: any;
  }>;
  // Permissions required
  requiredPermissions?: string[];
}

// ============================================================================
// NODE SYSTEM
// ============================================================================

/**
 * A node/resource in the connector
 * Examples: Customer, Order, Product, Event, Topic, Queue
 */
export interface ConnectorNode {
  id: string;
  name: string;
  displayName: string;
  description: string;
  // The schema of this node's data
  dataSchema: DataSchema;
  // Functions available on this node
  availableFunctions: ConnectorFunction[];
  // Parent node type (for hierarchical structures)
  parentNodeType?: string;
  // Child node types
  childNodeTypes?: string[];
  // Can this node be subscribed to for events
  supportsSubscription: boolean;
  subscriptionTriggerTypes?: TriggerType[];
  // Identifiers for this node
  identifierFields: string[];
  // Permissions model
  permissions?: {
    read?: string[];
    write?: string[];
    delete?: string[];
  };
}

// ============================================================================
// TRIGGER/RULE SYSTEM
// ============================================================================

/**
 * Types of events that can trigger rules
 */
export enum TriggerType {
  // Event-based
  ON_CREATE = 'on_create',
  ON_UPDATE = 'on_update',
  ON_DELETE = 'on_delete',
  ON_STATE_CHANGE = 'on_state_change',
  ON_ERROR = 'on_error',
  // Time-based
  ON_SCHEDULE = 'on_schedule',
  ON_DELAY = 'on_delay',
  // Condition-based
  ON_CONDITION_MET = 'on_condition_met',
  // Manual
  ON_MANUAL_TRIGGER = 'on_manual_trigger',
  // Webhook
  ON_WEBHOOK = 'on_webhook',
}

/**
 * Operators for conditions/rules
 */
export enum ConditionOperator {
  EQ = 'eq', // Equal
  NE = 'ne', // Not equal
  GT = 'gt', // Greater than
  GTE = 'gte', // Greater than or equal
  LT = 'lt', // Less than
  LTE = 'lte', // Less than or equal
  IN = 'in', // Value in array
  NOT_IN = 'not_in', // Value not in array
  CONTAINS = 'contains', // String contains
  NOT_CONTAINS = 'not_contains', // String does not contain
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
  REGEX = 'regex', // Regex match
  BETWEEN = 'between', // Between two values
  EXISTS = 'exists', // Field exists
  NOT_EXISTS = 'not_exists', // Field does not exist
  TRUTHY = 'truthy',
  FALSY = 'falsy',
}

/**
 * Trigger configuration allowed on a node
 */
export interface TriggerConfiguration {
  type: TriggerType;
  description: string;
  // Fields that can be filtered on in the condition
  filterableFields: string[];
  // Cron expression if ON_SCHEDULE
  cronPattern?: string;
  // Debounce options
  debounceMs?: number;
  throttleMs?: number;
  // Extra metadata
  metadata?: Record<string, any>;
}

// ============================================================================
// CONNECTOR MANIFEST
// ============================================================================

/**
 * Complete manifest describing what a connector provides
 * This is sent to the LLM so it knows what's available
 */
export interface ConnectorManifest {
  // Identification
  id: string;
  name: string;
  displayName: string;
  version: string;
  vendor?: string;

  // Documentation
  description: string;
  documentation?: string;
  logoUrl?: string;
  categories?: string[]; // e.g., 'CRM', 'Database', 'Cloud', 'Messaging'

  // Capabilities
  capabilities: {
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
    canSubscribe: boolean; // Can listen to events
    canExecuteQueries: boolean;
    supportsRules: boolean; // Can have rules attached
    supportsDirectQuery: DataType[];
  };

  // Authentication/Connection
  authentication: {
    type: 'none' | 'api_key' | 'oauth' | 'basic' | 'bearer' | 'custom';
    fields: Array<{
      key: string;
      name: string;
      type: string;
      required: boolean;
      sensitive: boolean;
    }>;
  };

  // Available data
  dataSchemas: DataSchema[];

  // Available nodes (resources/entities)
  nodes: ConnectorNode[];

  // Available functions
  functions: ConnectorFunction[];

  // Trigger configuration
  triggers: TriggerConfiguration[];

  // Rate limiting & quotas
  rateLimit?: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
  };

  // Supported operators for filtering/querying
  supportedOperators: ConditionOperator[];

  // Output formats
  outputFormats: DataType[];

  // Permissions
  permissions?: {
    scopes: string[];
    requiredForRead?: string[];
    requiredForWrite?: string[];
    requiredForDelete?: string[];
  };

  // Connection pool/instance info
  maxConcurrentConnections?: number;
  timeoutMs?: number;
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
    backoffMultiplier: number;
  };

  // Tags for discovery
  tags: string[];

  // Status
  status: 'active' | 'beta' | 'deprecated';
  deprecationMessage?: string;
}

// ============================================================================
// CONNECTOR REGISTRY (Global)
// ============================================================================

/**
 * Registry entry for a connector
 */
export interface ConnectorRegistryEntry {
  connectorId: string;
  manifest: ConnectorManifest;
  // Whether this connector is available in the current environment
  available: boolean;
  // Connection instances (per user/tenant)
  instances?: Array<{
    instanceId: string;
    userId: string;
    createdAt: Date;
    lastUsedAt?: Date;
  }>;
}

/**
 * Global connector registry
 */
export interface ConnectorRegistry {
  connectors: ConnectorRegistryEntry[];
  lastUpdated: Date;
  version: string;
}

// ============================================================================
// LLM CONTEXT
// ============================================================================

/**
 * Rich context sent to LLM for task parsing
 * Contains everything the LLM needs to understand what's possible
 */
export interface LLMContext {
  userId: string;
  timestamp: Date;

  // All available connectors
  connectors: ConnectorManifest[];

  // All available nodes across connectors
  nodes: Array<{
    connectorId: string;
    node: ConnectorNode;
  }>;

  // All available functions
  functions: Array<{
    connectorId: string;
    function: ConnectorFunction;
  }>;

  // All available data schemas
  schemas: DataSchema[];

  // Available triggers
  triggers: Array<{
    connectorId: string;
    trigger: TriggerConfiguration;
  }>;

  // Available operators
  operators: ConditionOperator[];

  // User's available connectors (instances they own)
  userConnectors: Array<{
    connectorId: string;
    instanceId: string;
  }>;

  // System capabilities
  systemCapabilities: {
    supportedLanguages: string[];
    maxTaskComplexity: number;
    maxMissionsPerTask: number;
    supportedOutputFormats: DataType[];
  };
}
