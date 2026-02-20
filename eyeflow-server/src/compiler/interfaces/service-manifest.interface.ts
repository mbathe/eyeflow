/**
 * POWERFUL SERVICE MANIFEST
 *
 * Describes every service that can be compiled and executed in the system.
 *
 * Core design principles
 * ──────────────────────
 *  1. A service declares MULTIPLE execution descriptors (one per supported format).
 *     The compiler (Stage 7) picks the best one compatible with the target node tier.
 *  2. Each descriptor fully describes HOW the executor (SVM layer) must invoke the service,
 *     including binary URLs, checksums, ABI protocols, auth, etc.
 *  3. NodeRequirements declares what the execution node MUST provide so the compiler
 *     can guarantee executability at compile time (not runtime surprise).
 *  4. The ServiceContract gives the SVM determinism, idempotency and retry guarantees.
 *  5. Users can publish their own services via the ServiceRegistry REST API.
 */

// ─────────────────────────────────────────────────────────────────────────────
// I/O Port definition
// ─────────────────────────────────────────────────────────────────────────────

export type PortDataType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'buffer'
  | 'stream'
  | 'any';

export interface IOPort {
  /** Machine-readable identifier (used as key in inputs/outputs records) */
  name: string;

  /** Human-readable label */
  label?: string;

  type: PortDataType;

  /** Required at runtime? If false and absent, executor uses defaultValue (default: true) */
  required?: boolean;

  description?: string;

  /** JSON Schema for structural validation */
  schema?: Record<string, any>;

  /** Used when required=false and the caller omits the value */
  defaultValue?: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution descriptors (one per supported format)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Node tiers that can run a given descriptor.
 * The compiler uses this list to find matching descriptors for a target node.
 */
/** 'ANY' means the descriptor runs on every tier (compile-time wildcard). */
export type NodeTier = 'CENTRAL' | 'LINUX' | 'MCU' | 'ANY';

/** ABI (wire protocol) between the caller and the binary */
export type BinaryAbi =
  | 'json_stdin'       // Caller writes JSON to stdin, reads JSON from stdout
  | 'json_args'        // JSON input serialized as shell argument
  | 'msgpack_stdin'    // MessagePack over stdin/stdout
  | 'protobuf_stdin'   // Protobuf over stdin/stdout
  | 'shared_memory'    // Shared memory region (Linux, highest perf)
  | 'ffi_c';           // C ABI via dlopen (fastest for NATIVE embedded calls)

// ── WASM ─────────────────────────────────────────────────────────────────────

export interface WasmExecutionDescriptor {
  format: 'WASM';

  /** Source of the compiled .wasm binary */
  binaryUrl: string;

  /** SHA-256 checksum (sha256:<hex>) — verified before execution */
  checksum: string;

  /** Maximum memory the WASM module may allocate (MB) */
  memorySizeMb: number;

  /**
   * Exported function the executor will call.
   * Must be exported by the WASM module and accept/return bytes per `abi`.
   * @example 'run' | 'process' | 'execute'
   */
  exportedFunction: string;

  /** Wire protocol between the JS host and the WASM module */
  abi: Exclude<BinaryAbi, 'ffi_c' | 'shared_memory'>;

  /**
   * Optional WASM Component Model interfaces declared by this module.
   * Enables capability-based security in wasmtime/wasmer.
   */
  wiComponentInterfaces?: string[];

  compatibleTiers: NodeTier[];
}

// ── NATIVE ────────────────────────────────────────────────────────────────────

export type NativePlatform =
  | 'linux-x64'
  | 'linux-arm64'
  | 'linux-armv7'
  | 'darwin-x64'
  | 'win32-x64'
  | 'bare-metal-arm-cm4'  // Cortex-M4 (STM32F4xx)
  | 'bare-metal-arm-cm33' // Cortex-M33 (STM32U5xx)
  | 'bare-metal-xtensa';  // ESP32

export interface NativeBinaryEntry {
  platform: NativePlatform;

  /** Download URL for the compiled binary */
  binaryUrl: string;

  /** SHA-256 checksum */
  checksum: string;

  /**
   * For bare-metal targets: flash address in hex.
   * @example '0x08000000'
   */
  flashAddress?: string;
}

export interface NativeExecutionDescriptor {
  format: 'NATIVE';

  /** One binary per supported platform */
  binaries: NativeBinaryEntry[];

  /** How the executor calls the binary */
  invocationProtocol: BinaryAbi;

  /**
   * Shell argument template when invocationProtocol = 'json_args'.
   * Placeholder {<portName>} is replaced by the JSON-serialized input value.
   * @example ['--input', '{imageData}', '--quality', '{quality}']
   */
  argsTemplate?: string[];

  /**
   * Environment variables the binary needs.
   * Stage 7 will verify the target node exposes these.
   */
  requiredEnvVars?: string[];

  /**
   * Set to true for no_std Rust / C binaries that run without an OS.
   * Restricts execution to MCU tier.
   */
  worksWithoutOs?: boolean;

  compatibleTiers: NodeTier[];
}

// ── MCP ───────────────────────────────────────────────────────────────────────

export interface McpExecutionDescriptor {
  format: 'MCP';

  /** MCP server identifier (as defined in the MCP servers config) */
  serverName: string;

  /** Name of the tool to call */
  toolName: string;

  /**
   * Rename input ports to match MCP tool parameter names.
   * Key = manifest port name, Value = MCP param name.
   * If omitted, port names are used as-is.
   */
  inputMapping?: Record<string, string>;

  /**
   * Rename output fields from MCP tool response to manifest output port names.
   */
  outputMapping?: Record<string, string>;

  /** MCP always needs the central node (daemon manager + network access) */
  compatibleTiers: ['CENTRAL'];
}

// ── DOCKER ────────────────────────────────────────────────────────────────────

export type DockerInvocationProtocol =
  | 'stdin_json'   // Container reads JSON from stdin, writes JSON to stdout
  | 'http_json'    // Container exposes HTTP; executor posts to /invoke
  | 'exec_json';   // docker exec with JSON argument

export interface DockerExecutionDescriptor {
  format: 'DOCKER';

  image: string;          // e.g. 'eyeflow/ml-trainer'
  tag: string;            // e.g. '3.0.0' or 'latest'
  command?: string[];     // Override CMD
  entrypoint?: string[];  // Override ENTRYPOINT

  /** Static environment variables baked in at compile time */
  env?: Record<string, string>;

  /**
   * Dynamic env vars whose values come from the execution node's secrets.
   * Key = env var name, Value = secret name in vault.
   */
  secretEnvVars?: Record<string, string>;

  /** host_path:container_path */
  volumes?: Record<string, string>;

  invocationProtocol: DockerInvocationProtocol;

  /**
   * Container HTTP port (required when invocationProtocol = 'http_json').
   * The executor will docker run -p <httpPort>:<httpPort> and POST to /invoke.
   */
  httpPort?: number;

  /** Resource limits */
  cpuLimit?: number;    // CPU shares (e.g., 0.5 = half a core)
  memoryMb?: number;

  /** Docker always needs the central node */
  compatibleTiers: ['CENTRAL'];
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export type HttpAuth =
  | { type: 'bearer'; envVar: string }      // BEARER <token from env>
  | { type: 'basic'; userEnvVar: string; passEnvVar: string }
  | { type: 'api_key'; headerName: string; envVar: string }
  | { type: 'oauth2'; tokenUrl: string; clientIdEnvVar: string; clientSecretEnvVar: string }
  | { type: 'none' };

export interface HttpExecutionDescriptor {
  format: 'HTTP';

  /**
   * URL template. {portName} placeholders are replaced by input values.
   * @example 'https://api.example.com/v1/analyze?text={text}'
   */
  urlTemplate: string;

  method: HttpMethod;

  /** Authentication scheme */
  auth?: HttpAuth;

  /**
   * How the executor serializes inputs into the HTTP request.
   * - body_json   : POST/PUT body as JSON object { portName: value, … }
   * - query_params: GET query string ?portName=value&…
   * - form_data   : multipart/form-data (useful for file uploads)
   * - path_params : values already embedded in urlTemplate placeholders
   */
  requestMapping: 'body_json' | 'query_params' | 'form_data' | 'path_params';

  /** Additional static headers */
  headers?: Record<string, string>;

  /**
   * How the executor extracts outputs from the HTTP response.
   * - body_json   : parse response body as JSON, map fields to output ports
   * - body_text   : response body as string → first output port
   * - status_code : HTTP status code → first output port (number)
   */
  responseMapping: 'body_json' | 'body_text' | 'status_code';

  /**
   * When responseMapping=body_json, map response fields to output port names.
   * Key = response field path (dot notation), Value = output port name.
   * @example { 'result.label': 'sentiment', 'result.score': 'score' }
   */
  outputMapping?: Record<string, string>;

  compatibleTiers: Array<'CENTRAL' | 'LINUX'>;
}

// ── gRPC ─────────────────────────────────────────────────────────────────────

export interface GrpcExecutionDescriptor {
  format: 'GRPC';

  host: string;    // e.g. 'grpc.example.com'
  port: number;    // e.g. 50051

  /** Fully-qualified gRPC service name */
  serviceName: string;

  /** gRPC method name */
  methodName: string;

  /**
   * URL to the .proto definition file.
   * Used by the executor to build the gRPC client at service load time.
   */
  protoUrl: string;

  /**
   * TLS root cert URL (optional). If absent, insecure channel is used.
   */
  tlsCertUrl?: string;

  /**
   * Map input port names to proto message field names.
   */
  inputMapping?: Record<string, string>;
  outputMapping?: Record<string, string>;

  compatibleTiers: Array<'CENTRAL' | 'LINUX'>;
}

// ── EMBEDDED_JS ───────────────────────────────────────────────────────────────

export interface EmbeddedJsExecutionDescriptor {
  format: 'EMBEDDED_JS';

  /**
   * Sandboxed JavaScript code. Must export a function `main(inputs) → outputs`.
   * Runs inside Node.js `vm` module with a strict allowlist of globals.
   *
   * @example
   * ```js
   * function main({ text }) {
   *   return { upper: text.toUpperCase(), length: text.length };
   * }
   * ```
   */
  code: string;

  /** Modules this script is allowed to require (empty = no modules allowed) */
  allowedModules?: string[];

  /** Maximum execution time in ms before the VM kills the script */
  executionTimeoutMs?: number;

  compatibleTiers: Array<'CENTRAL' | 'LINUX'>;
}

// ── CONNECTOR ─────────────────────────────────────────────────────────────────

export type ConnectorOperation =
  | 'query'       // Read (SQL SELECT, HTTP GET, MQTT subscribe)
  | 'insert'      // Write (SQL INSERT, HTTP POST)
  | 'update'      // Modify (SQL UPDATE, HTTP PUT/PATCH)
  | 'delete'      // Remove (SQL DELETE, HTTP DELETE)
  | 'publish'     // Push message (Kafka, MQTT, Slack, SMTP)
  | 'subscribe'   // Listen for events (Kafka, MQTT, WebSocket)
  | 'call';       // Generic RPC (REST, GraphQL, Stripe API, etc.)

export interface ConnectorExecutionDescriptor {
  format: 'CONNECTOR';

  /**
   * Must match a value in the ConnectorType enum from connector.types.ts.
   * @example 'postgresql' | 'kafka' | 'mqtt' | 'slack' | 'smtp'
   */
  connectorType: string;

  /** The operation the executor will perform */
  operation: ConnectorOperation;

  /**
   * Operation-specific static configuration.
   * For SQL: { sql: 'SELECT * FROM {table} WHERE id = {id}' }
   * For Kafka: { topic: '{topic}', key: '{key}' }
   * For Slack: { channel: '{channel}' }
   * For SMTP: { to: '{email}', subject: '{subject}', body: '{body}' }
   */
  operationConfig: Record<string, any>;

  /**
   * Map input ports to operationConfig template placeholders.
   * Key = placeholder name, Value = input port name.
   * If omitted, placeholder names must match port names.
   */
  inputMapping?: Record<string, string>;

  /**
   * Map connector result fields to output port names.
   */
  outputMapping?: Record<string, string>;

  /** Connectors can run on CENTRAL or LINUX (depending on the connector type) */
  compatibleTiers: Array<'CENTRAL' | 'LINUX'>;
}

// ── LLM_CALL descriptor ───────────────────────────────────────────────────────
// Bounded LLM call with all parameters baked in at compile time (spec §10).
// The runtime NEVER constructs prompts dynamically.

export interface LlmCallExecutionDescriptor {
  format: 'LLM_CALL';

  /**
   * Provider identifier. Corresponds to a registered LLM provider.
   * @example 'openai' | 'azure-openai' | 'anthropic' | 'local-llama3'
   */
  provider: string;

  /**
   * Target model name as known by the provider.
   * @example 'gpt-4o' | 'claude-3-5-sonnet' | 'llama3-8b'
   */
  model: string;

  /**
   * System prompt — static, frozen at compile time.
   * Must not contain any user-controlled dynamic content.
   */
  systemPrompt: string;

  /**
   * User-turn prompt template. Placeholders use {portName} syntax.
   * Substitution is done with statically verified register values.
   * @example 'Classify the following event: {eventDescription}'
   */
  promptTemplate: string;

  /** Maximum tokens to generate in the response */
  maxTokens?: number;

  /** Sampling temperature (0 = deterministic, 1 = creative) */
  temperature?: number;

  /** Map input port names to promptTemplate placeholder names */
  inputMapping?: Record<string, string>;

  /** Map JSON keys in the LLM response to output port names */
  outputMapping?: Record<string, string>;

  /** Vault path to the API key / credentials for this provider */
  credentialsVaultPath: string;

  /** Request timeout override in ms (default: 30_000) */
  timeoutMs?: number;

  /** Only runs on CENTRAL (needs vault + internet) */
  compatibleTiers: Array<'CENTRAL'>;
}

// ── Union ─────────────────────────────────────────────────────────────────────

export type ExecutionDescriptor =
  | WasmExecutionDescriptor
  | NativeExecutionDescriptor
  | McpExecutionDescriptor
  | DockerExecutionDescriptor
  | HttpExecutionDescriptor
  | GrpcExecutionDescriptor
  | EmbeddedJsExecutionDescriptor
  | ConnectorExecutionDescriptor
  | LlmCallExecutionDescriptor;

export type ServiceFormat = ExecutionDescriptor['format'];

// ─────────────────────────────────────────────────────────────────────────────
// Formal predicates — spec §4.2
// Used by Stage 5 (FormalVerifier) to prove pre/postconditions statically
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Comparison / existence operators for formal predicates.
 * Evaluated by Stage 5 at compile time and by the SVM at runtime for assertions.
 */
export type PredicateOperator =
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'exists'        // subject register / port is not null/undefined
  | 'not_exists'    // subject register / port is null/undefined
  | 'in'            // value is contained in an array
  | 'matches'       // value matches a regex pattern
  | 'truthy';       // value is boolean-truthy

/**
 * A formal predicate — a statement about a register, port, or context variable.
 *
 * Stage 5 evaluates these statically (using the IR type lattice) to prove or
 * disprove them before emitting bytecode. If `strictAtCompileTime` is true and
 * the predicate cannot be proved, compilation fails.
 *
 * At runtime the SVM evaluates non-proved predicates dynamically and aborts
 * the instruction if a violating precondition is detected.
 */
export interface Predicate {
  /** Human-readable description shown in the compilation report */
  description: string;

  /**
   * What to evaluate:
   *  - Port name: 'portName' — looks up the service input/output register
   *  - Register ref: '$r42' — directly references IR register index 42
   *  - Context var: '@contextKey' — reads from execution context metadata
   */
  subject: string;

  operator: PredicateOperator;

  /**
   * Right-hand side value.
   * May be a literal or another subject reference (prefixed with '$' or '@').
   * Not required for 'exists', 'not_exists', 'truthy'.
   */
  value?: any;

  /**
   * If true, Stage 5 will FAIL compilation when this predicate cannot be
   * formally proved.  If false (default), Stage 5 emits a runtime assertion.
   */
  strictAtCompileTime?: boolean;
}

/**
 * Safety constraint — a named, leveled predicate used to enforce safety rules.
 * WARN:  Emits a compilation warning, bytecode is still produced.
 * ERROR: Emits a compilation error, but all other stages run to report all issues.
 * BLOCK: Immediately aborts compilation.
 */
export interface SafetyConstraint {
  id: string;
  level: 'WARN' | 'ERROR' | 'BLOCK';
  description: string;
  predicate: Predicate;
}

// ─────────────────────────────────────────────────────────────────────────────
// Node requirements
// ─────────────────────────────────────────────────────────────────────────────

export interface NodeRequirements {
  /**
   * Node tiers that CAN execute this service.
   * The compiler checks that the assigned node belongs to at least one of these.
   */
  supportedTiers: NodeTier[];

  /** Minimum available RAM */
  minMemoryMb?: number;

  /** Minimum CPU cores */
  minCpuCores?: number;

  /** Service makes outbound network calls */
  needsInternet?: boolean;

  /** Service reads secrets from Vault */
  needsVaultAccess?: boolean;

  /** Service requires GPU compute */
  needsGpu?: boolean;

  /**
   * Physical bus protocols required (I2C, SPI, UART, GPIO, CAN).
   * Only MCU nodes expose these; compiler will force MCU tier assignment.
   */
  requiredPhysicalProtocols?: string[];

  /**
   * Environment variables the execution node must export.
   * Stage 7 will cross-check against node.capabilities.availableEnvVars.
   */
  requiredEnvVars?: string[];

  /**
   * Connector IDs that must be configured on the target node.
   * Stage 7 will verify existence before assigning.
   */
  requiredConnectorIds?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Service contract
// ─────────────────────────────────────────────────────────────────────────────

export interface RetryPolicy {
  maxAttempts: number;
  delayMs: number;
  /** Exponential backoff multiplier (1 = no backoff) */
  backoffFactor: number;
  /** Retry only on these HTTP status codes or error types */
  retryOn?: string[];
}

export interface ServiceContract {
  /**
   * True if the same inputs ALWAYS produce the same outputs.
   * Enables compile-time result caching.
   */
  deterministic: boolean;

  /**
   * True if calling the service multiple times with the same input is safe
   * (no duplicate charges, no duplicate DB rows, etc.).
   */
  idempotent: boolean;

  /**
   * True if the service modifies external state (DB writes, sends emails, etc.).
   * Non-idempotent external side effects get a confirmation checkpoint in the plan.
   */
  hasExternalSideEffects: boolean;

  /** Nominal latency in milliseconds (used by Stage 9 for critical-path analysis) */
  nominalLatencyMs: number;

  /** Hard execution timeout after which the SVM kills the call */
  timeoutMs: number;

  /** Retry strategy */
  retryPolicy: RetryPolicy;
}

// ─────────────────────────────────────────────────────────────────────────────
// The Powerful Service Manifest
// ─────────────────────────────────────────────────────────────────────────────

export type ServiceCategory =
  | 'data'           // ETL, transformations, aggregations
  | 'ml'             // Models, inference, training
  | 'communication'  // Email, SMS, Slack, Teams
  | 'iot'            // Sensors, actuators, physical protocols
  | 'storage'        // Files, S3, databases
  | 'connector'      // Bridges to external systems (DB, Kafka, MQTT…)
  | 'utility'        // Hashing, encoding, date/time, math
  | 'custom';        // User-defined

export interface ServiceExample {
  description: string;
  input: Record<string, any>;
  expectedOutput: Record<string, any>;
}

export interface PowerfulServiceManifest {
  // ── Identity ────────────────────────────────────────────────────────────

  /** Globally unique, kebab-case identifier */
  id: string;

  name: string;
  version: string;            // semver e.g. '2.1.0'
  description: string;
  author: string;
  publishedBy: string;
  publishedAt: Date;
  tags: string[];
  category: ServiceCategory;

  /** Namespace for grouping related services (e.g. 'eyeflow.core' | 'acme.corp') */
  namespace?: string;

  // ── I/O Schema ───────────────────────────────────────────────────────────

  inputs: IOPort[];
  outputs: IOPort[];

  // ── Execution ────────────────────────────────────────────────────────────

  /**
   * All possible execution methods, ordered by PREFERENCE.
   *
   * The compiler (Stage 7) iterates this list and picks the FIRST descriptor
   * whose `compatibleTiers` includes the target node's tier.
   * This lets you declare: "prefer WASM on edge, fall back to HTTP on central".
   *
   * Every format the service supports must have an entry here.
   * If no descriptor matches the target node, compilation fails with a
   * clear error: "service X has no executor compatible with tier Y on node Z".
   */
  executionDescriptors: ExecutionDescriptor[];

  // ── Node requirements ────────────────────────────────────────────────────

  nodeRequirements: NodeRequirements;

  // ── Behavioral contract ──────────────────────────────────────────────────

  contract: ServiceContract;

  // ── Formal guarantees (spec §4.2) ────────────────────────────────────────

  /**
   * Formal preconditions — must hold BEFORE the service is invoked.
   * Stage 5 (FormalVerifierService) checks these statically against the IR
   * type-lattice.  At runtime the SVM evaluates any non-proved predicates as
   * dynamic assertions.
   *
   * Example: input 'pressure' must be > 0
   * { description: 'pressure > 0', subject: 'pressure', operator: '>', value: 0 }
   */
  preconditions?: Predicate[];

  /**
   * Formal postconditions — guaranteed to hold AFTER successful execution.
   * Stage 5 uses these to propagate type / range facts for downstream
   * instructions (e.g. "after this transform, output.value is always a number").
   */
  postconditions?: Predicate[];

  /**
   * Safety constraints checked by Stage 5 before emitting bytecode.
   * BLOCK-level constraints immediately abort compilation.
   */
  safetyConstraints?: SafetyConstraint[];

  /**
   * If true, the SVM inserts a HUMAN_CONFIRM checkpoint immediately before
   * executing this service.  The caller must acknowledge via the WebSocket
   * control plane before execution proceeds.
   */
  requiresHumanConfirmation?: boolean;

  /**
   * True if the side effect of this service can be reversed
   * (e.g. a DB INSERT followed by possible DELETE on rollback).
   * Stage 5 verifies that every non-reversible service in a branch has a
   * matching fallback or human confirmation.
   */
  isReversible?: boolean;

  // ── Trust & verification ─────────────────────────────────────────────────

  /** Has been reviewed and approved by the platform team */
  trusted: boolean;

  /**
   * Optional ed25519 signature over (id + version + checksum of descriptors).
   * Verified by the compiler before accepting the service.
   */
  signature?: string;

  // ── Billing ──────────────────────────────────────────────────────────────

  /** Credits charged per call (0 = free) */
  costPerCall?: number;

  // ── Documentation ────────────────────────────────────────────────────────

  /** Usage examples (also used in auto-generated documentation) */
  examples?: ServiceExample[];

  /** Link to full documentation */
  documentationUrl?: string;

  /** Changelog entries */
  changelog?: Array<{ version: string; description: string; date: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extended DispatchMetadata (what Stage 7 injects into each IR instruction)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compile-time dispatch metadata injected by Stage 7 into every CALL_SERVICE instruction.
 * Contains everything the SVM needs to execute the service at runtime,
 * without any additional lookups or network calls.
 */
export interface EnrichedDispatchMetadata {
  /** Format of the selected descriptor */
  format: ServiceFormat;

  /**
   * The full descriptor chosen by Stage 7 for the target node tier.
   * The SVM passes this verbatim to the matching executor.
   */
  selectedDescriptor: ExecutionDescriptor;

  /** From the manifest contract */
  timeoutMs: number;
  retryPolicy: RetryPolicy;

  /** Node tier this was compiled for */
  targetTier: NodeTier;

  /** Service identity for logging / billing */
  serviceId: string;
  serviceVersion: string;

  // ── Backward-compatible fields (kept for Stage 8 pre-loader) ─────────────
  wasmBinaryUrl?: string;
  wasmChecksum?: string;
  wasmMemory?: number;
  mcpServer?: string;
  mcpMethod?: string;
  mcpVersion?: string;
  nativeBinaryUrl?: string;
  nativePlatform?: string;
  nativeChecksum?: string;
  dockerImage?: string;
  dockerVersion?: string;
  dockerEnv?: Record<string, string>;
  /** @deprecated use timeoutMs */
  timeout?: number;
}
