/**
 * Node Capability Interface
 *
 * Defines what a given execution node is capable of handling.
 * Used by the Stage-9 Distribution Planner to assign each IR instruction
 * to the correct node at compile-time.
 *
 * Hierarchy:
 *   CENTRAL  → NestJS server (orchestrator)  — all 8 formats, MCP, Docker, connectors, gRPC
 *   LINUX    → Raspberry Pi, Jetson, ...     — WASM, NATIVE, HTTP, GRPC, MQTT, Kafka
 *   MCU      → STM32, ESP32, ...             — NATIVE no_std, I2C, SPI, UART, MQTT
 */

import type { TriggerDriverManifest } from '../../triggers/interfaces/trigger-driver.interface';

// ─── Instruction formats each node can execute ────────────────────────────
// Canonical list. Aligned with ExecutionDescriptor.format in service-manifest.interface.ts.

export type ServiceFormat =
  | 'WASM'         // WebAssembly binary (wasmtime / V8 WA)
  | 'NATIVE'       // OS-native binary (Linux, Cortex-M, Xtensa)
  | 'MCP'          // Model Context Protocol JSON-RPC
  | 'DOCKER'       // Docker container (requires daemon)
  | 'HTTP'         // Plain HTTP REST call (any internet-capable node)
  | 'GRPC'         // gRPC (requires @grpc/grpc-js or Rust tonic)
  | 'EMBEDDED_JS'  // Sandboxed vm.runInNewContext (Node.js only)
  | 'CONNECTOR'    // Typed connector (PostgreSQL, Kafka, Slack …)
  | 'LLM_CALL';    // Bounded LLM call with pre-built context

// ─── Physical bus / protocol support ──────────────────────────────────────

export type PhysicalProtocol =
  | 'HTTP'
  | 'HTTPS'
  | 'KAFKA'
  | 'MQTT'
  | 'MODBUS'
  | 'OPC_UA'
  | 'I2C'
  | 'SPI'
  | 'UART'
  | 'GPIO';

// ─── Node tiers ────────────────────────────────────────────────────────────

export enum NodeTier {
  /** NestJS orchestrator — all capabilities */
  CENTRAL = 'CENTRAL',
  /** Linux-capable node (Raspberry Pi, Jetson, server VM) */
  LINUX = 'LINUX',
  /** Microcontroller — limited RAM, no_std Rust */
  MCU = 'MCU',
}

// ─── Hardware specs ────────────────────────────────────────────────────────

export interface NodeHardwareProfile {
  /** Available RAM in MB (MCU: 0.064–4 MB, Pi: 512+, server: unbounded) */
  memoryMb: number;
  /** Number of CPU cores / hardware threads */
  cpuCores: number;
  /** Has persistent local storage (SD card, eMMC, …) */
  hasStorage: boolean;
  /** Hardware RNG or TPM available */
  hasHardwareCrypto: boolean;
}

// ─── Main capability descriptor ───────────────────────────────────────────

export interface NodeCapabilities {
  /** Unique identifier registered at boot / provisioning time */
  nodeId: string;

  /** Human-readable label */
  label: string;

  /** Tier determines the default capability profile */
  tier: NodeTier;

  /** Which IR instruction formats this node can execute */
  supportedFormats: ServiceFormat[];

  /**
   * Specific connector IDs this node can resolve.
   * Empty array on MCUs (they don't run NestJS connectors).
   * For CENTRAL, this is the full catalogue.
   */
  supportedConnectors: string[];

  /** Physical bus / network protocols available on this hardware */
  supportedProtocols: PhysicalProtocol[];

  /** Hardware profile used for cost-scoring */
  hardware: NodeHardwareProfile;

  /** Whether this node can perform outbound internet calls */
  hasInternetAccess: boolean;

  /** Whether this node has a Vault / secret-store sidecar */
  hasVaultAccess: boolean;

  /** Whether this node can spawn sub-processes (DOCKER, child_process) */
  canSpawnProcesses: boolean;

  /**
   * Maximum number of instructions this node can execute in a single slice
   * (important for MCUs with very limited RAM)
   */
  maxInstructionsPerSlice: number;

  /** Current network latency to CENTRAL node in ms (updated at registration) */
  latencyToCentralMs: number;

  /** Status as reported during last heartbeat */
  status: 'ONLINE' | 'OFFLINE' | 'BUSY' | 'DEGRADED';

  /** ISO timestamp of last heartbeat */
  lastSeenAt: Date;

  /**
   * HTTP/HTTPS base URL of this node's SVM REST API.
   * Used by NodeDispatcherService when there is no persistent WebSocket.
   * Example: "http://192.168.1.42:4001"
   */
  baseUrl?: string;

  /**
   * Whether this node has a Node.js runtime capable of running EMBEDDED_JS.
   * True for CENTRAL and LINUX nodes running Node.js.
   * False for Rust-only LINUX nodes and all MCUs.
   */
  hasEmbeddedJsRuntime: boolean;

  /**
   * Whether this node can call an LLM (local or remote).
   * CENTRAL: always true. LINUX with internet: true. MCU: false.
   */
  hasLLMAccess: boolean;

  /**
   * For nodes with local LLM inference capability, the model identifiers
   * available (e.g. ['llama3-8b', 'mistral-7b']).
   */
  availableLocalModels?: string[];

  /**
   * Trigger driver IDs this node can activate locally.
   * Populated at node registration time from the node's runtime environment.
   *
   * Examples:
   *   CENTRAL NestJS  : ['mqtt', 'filesystem', 'http-webhook', 'cron', 'imap', 'kafka']
   *   Linux RPi       : ['mqtt', 'filesystem', 'kafka']  (no http-webhook, no imap)
   *   MCU ESP32       : ['mqtt']  (only MQTT, no FS, no HTTP)
   *   Windows node    : ['filesystem', 'http-webhook', 'cron']  (no MQTT driver installed)
   *
   * Stage 9 uses this to assign TRIGGER instructions to the right node.
   * '*' means all drivers available (CENTRAL wildcard).
   */
  supportedTriggerDrivers: string[];

  /**
   * Full metadata for custom drivers implemented on this node.
   * Provided at registration time and forwarded to TriggerDriverRegistryService.
   *
   * Only needed for drivers NOT already registered as NestJS providers on CENTRAL.
   * Example: a Modbus RTU driver specific to an industrial RPi — not in TriggersModule.
   *
   * Format: one TriggerDriverManifest per custom driver.
   * CENTRAL nodes leave this empty (their drivers are NestJS class providers).
   */
  triggerDriverManifests?: TriggerDriverManifest[];
}

// ─── Registration / heartbeat payload ─────────────────────────────────────

export interface NodeRegistrationPayload {
  nodeId: string;
  label: string;
  tier: NodeTier;
  capabilities: Omit<NodeCapabilities, 'nodeId' | 'label' | 'tier' | 'status' | 'lastSeenAt'>;

  /**
   * Custom trigger drivers implemented on this node.
   *
   * Include one entry per driver that is NOT already a NestJS provider on CENTRAL.
   * CENTRAL will register these in TriggerDriverRegistryService so the compiler
   * can discover them, Stage 9 can assign them, and the UI can show their schemas.
   *
   * Additionally, the driver IDs must appear in capabilities.supportedTriggerDrivers[]
   * so Stage 9's capability matcher includes this node as a candidate.
   *
   * Example payload from an industrial Raspberry Pi:
   * {
   *   nodeId: 'rpi-factory-1',
   *   label:  'Factory Floor RPi',
   *   tier:   NodeTier.LINUX,
   *   capabilities: {
   *     supportedTriggerDrivers: ['mqtt', 'filesystem', 'modbus-rtu'],
   *     ...
   *   },
   *   triggerDrivers: [
   *     {
   *       driverId:    'modbus-rtu',
   *       displayName: 'Modbus RTU Trigger',
   *       supportedTiers: ['LINUX'],
   *       requiredProtocols: ['MODBUS'],
   *       configSchema: {
   *         port:     { type: 'string',  required: true  },
   *         baudRate: { type: 'number',  required: false, default: 9600 },
   *         slaveId:  { type: 'number',  required: true  },
   *         register: { type: 'number',  required: true  },
   *       },
   *     },
   *   ],
   * }
   */
  triggerDrivers?: TriggerDriverManifest[];
}

export interface NodeHeartbeat {
  nodeId: string;
  status: NodeCapabilities['status'];
  latencyMs: number;
  freeMemoryMb: number;
  cpuLoadPercent: number;
}

// ─── Predefined capability profiles ────────────────────────────────────────
// Convenience factory used by tests and the default seeding

export const CENTRAL_NODE_ID = 'central-nestjs';

export function centralNodeProfile(): NodeCapabilities {
  return {
    nodeId: CENTRAL_NODE_ID,
    label: 'Central NestJS Orchestrator',
    tier: NodeTier.CENTRAL,
    // CENTRAL can execute ALL 8 formats + LLM_CALL
    supportedFormats: ['WASM', 'NATIVE', 'MCP', 'DOCKER', 'HTTP', 'GRPC', 'EMBEDDED_JS', 'CONNECTOR', 'LLM_CALL'],
    supportedConnectors: ['*'], // wildcard: all connectors registered in ServiceRegistry
    supportedProtocols: ['HTTP', 'HTTPS', 'KAFKA', 'MQTT', 'MODBUS', 'OPC_UA'],
    hardware: { memoryMb: 8192, cpuCores: 8, hasStorage: true, hasHardwareCrypto: false },
    hasInternetAccess: true,
    hasVaultAccess: true,
    canSpawnProcesses: true,
    maxInstructionsPerSlice: 10_000,
    latencyToCentralMs: 0,
    hasEmbeddedJsRuntime: true,  // Node.js is available
    hasLLMAccess: true,          // can call cloud LLMs and local models
    // CENTRAL runs all NestJS-based drivers; '*' = wildcard (any driver registered)
    supportedTriggerDrivers: ['*'],
    status: 'ONLINE',
    lastSeenAt: new Date(),
  };
}

export function linuxNodeProfile(nodeId: string, label: string, baseUrl?: string): NodeCapabilities {
  return {
    nodeId,
    label,
    tier: NodeTier.LINUX,
    // LINUX Rust SVM: WASM (wasmtime), NATIVE ARM, HTTP (reqwest), GRPC (tonic)
    // No DOCKER (no daemon), No MCP (no sidecar), No EMBEDDED_JS (no Node.js), No CONNECTOR
    supportedFormats: ['WASM', 'NATIVE', 'HTTP', 'GRPC'],
    supportedConnectors: [],  // connectors run through CENTRAL
    supportedProtocols: ['HTTP', 'HTTPS', 'MQTT', 'KAFKA'],
    hardware: { memoryMb: 512, cpuCores: 4, hasStorage: true, hasHardwareCrypto: false },
    hasInternetAccess: true,
    hasVaultAccess: false,
    canSpawnProcesses: false,
    maxInstructionsPerSlice: 500,
    latencyToCentralMs: 30,
    hasEmbeddedJsRuntime: false, // pure Rust node
    hasLLMAccess: true,          // can call cloud LLMs if internet; local Llama possible
    // Linux nodes support MQTT natively (mosquitto client) and filesystem watch (inotify)
    supportedTriggerDrivers: ['mqtt', 'filesystem', 'kafka'],
    baseUrl,
    status: 'ONLINE',
    lastSeenAt: new Date(),
  };
}

export function mcuNodeProfile(nodeId: string, label: string, baseUrl?: string): NodeCapabilities {
  return {
    nodeId,
    label,
    tier: NodeTier.MCU,
    // MCU Rust no_std: only NATIVE Cortex-M/Xtensa binaries
    supportedFormats: ['NATIVE'],
    supportedConnectors: [],
    supportedProtocols: ['MQTT', 'I2C', 'SPI', 'UART', 'GPIO'],
    hardware: { memoryMb: 0.256, cpuCores: 1, hasStorage: false, hasHardwareCrypto: true },
    hasInternetAccess: false,
    hasVaultAccess: false,
    canSpawnProcesses: false,
    maxInstructionsPerSlice: 64,
    latencyToCentralMs: 80,
    hasEmbeddedJsRuntime: false, // no_std
    hasLLMAccess: false,         // no LLM on MCU
    // MCU supports MQTT at firmware level (ESP-MQTT, Paho embedded)
    supportedTriggerDrivers: ['mqtt'],
    baseUrl,
    status: 'ONLINE',
    lastSeenAt: new Date(),
  };
}
