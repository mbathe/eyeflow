/**
 * IServiceExecutor
 *
 * Every execution format (WASM, NATIVE, MCP, DOCKER, HTTP, GRPC, EMBEDDED_JS, CONNECTOR)
 * must implement this interface. The ExecutorRegistry maps a format string → executor instance.
 *
 * Lifecycle
 * ─────────
 *   onInit()       – Called once when the executor is registered (download binaries, open connections…)
 *   canExecute()   – Quick pre-flight check (is binary downloaded? is connection alive?)
 *   execute()      – Run the service and return outputs
 *   onDestroy()    – Clean-up (close connections, clear caches)
 */

import { ExecutionDescriptor, ServiceFormat } from '../../compiler/interfaces/service-manifest.interface';

// ─────────────────────────────────────────────────────────────────────────────

export interface ExecutorContext {
  /** Resolved input port values (key = IOPort.name) */
  inputs: Record<string, any>;

  /** Connector configurations available on this node (key = connector id) */
  connectorConfigs?: Record<string, any>;

  /** Resolved secrets / vault values (key = secret name) */
  secrets?: Record<string, string>;

  /** Execution timeout override in ms (0 = use descriptor default) */
  timeoutMs?: number;

  /** Trace ID for distributed tracing */
  traceId?: string;
}

export interface ExecutorResult {
  /** Resolved output port values (key = IOPort.name) */
  outputs: Record<string, any>;

  /** Wall-clock execution time in milliseconds */
  durationMs: number;

  /** Raw response (for logging / debugging) */
  rawResponse?: any;

  /** Whether the result was served from an executor-level cache */
  fromCache?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface IServiceExecutor {
  /** Format this executor handles */
  readonly format: ServiceFormat;

  /**
   * Called once at startup / when the executor is first registered.
   * Good for downloading binaries, warming up WASM runtimes, etc.
   */
  onInit?(): Promise<void>;

  /**
   * Quick pre-flight check — does NOT execute the service.
   * Returns true if the descriptor can be executed right now on this node.
   * Used by the SVM to decide whether to fall back to CENTRAL.
   */
  canExecute(descriptor: ExecutionDescriptor): Promise<boolean>;

  /**
   * Execute the service with the given inputs and return outputs.
   *
   * @throws ExecutorError (with `code` field) so the SVM can apply the retry policy.
   */
  execute(descriptor: ExecutionDescriptor, ctx: ExecutorContext): Promise<ExecutorResult>;

  /**
   * Called when the NestJS module is destroyed.
   */
  onDestroy?(): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────

export class ExecutorError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'TIMEOUT'
      | 'BINARY_NOT_FOUND'
      | 'CHECKSUM_MISMATCH'
      | 'RUNTIME_ERROR'
      | 'NETWORK_ERROR'
      | 'AUTH_ERROR'
      | 'CONTRACT_VIOLATION'
      | 'UNSUPPORTED_PLATFORM'
      | 'CONNECTOR_ERROR'
      | 'UNKNOWN',
    public readonly retriable: boolean = true,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'ExecutorError';
  }
}
