/**
 * EXECUTOR REGISTRY
 *
 * Central hub that maps service formats to their executor instances.
 * The SVM calls `getExecutor(format)` to retrieve the right executor
 * for a CALL_SERVICE instruction.
 *
 * On startup, each executor's `onInit()` hook is called so binaries can
 * be downloaded, connections established, etc.
 *
 * New executors can be registered at runtime via `register()`.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { IServiceExecutor, ExecutorError } from './executors/executor.interface';
import { WasmExecutor } from './executors/wasm.executor';
import { NativeExecutor } from './executors/native.executor';
import { HttpExecutor } from './executors/http.executor';
import { DockerExecutor } from './executors/docker.executor';
import { McpExecutor } from './executors/mcp.executor';
import { EmbeddedJsExecutor } from './executors/embedded-js.executor';
import { GrpcExecutor } from './executors/grpc.executor';
import { ConnectorExecutor } from './executors/connector.executor';
import { LlmCallExecutor } from './executors/llm-call.executor';
import { ServiceFormat } from '../compiler/interfaces/service-manifest.interface';
import { ExecutionDescriptor } from '../compiler/interfaces/service-manifest.interface';
import { ExecutorContext, ExecutorResult } from './executors/executor.interface';

@Injectable()
export class ExecutorRegistryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExecutorRegistryService.name);
  private readonly executors = new Map<ServiceFormat, IServiceExecutor>();

  constructor(
    private readonly wasmExecutor: WasmExecutor,
    private readonly nativeExecutor: NativeExecutor,
    private readonly httpExecutor: HttpExecutor,
    private readonly dockerExecutor: DockerExecutor,
    private readonly mcpExecutor: McpExecutor,
    private readonly embeddedJsExecutor: EmbeddedJsExecutor,
    private readonly grpcExecutor: GrpcExecutor,
    private readonly connectorExecutor: ConnectorExecutor,
    private readonly llmCallExecutor: LlmCallExecutor,
  ) {}

  async onModuleInit(): Promise<void> {
    const all: IServiceExecutor[] = [
      this.wasmExecutor,
      this.nativeExecutor,
      this.httpExecutor,
      this.dockerExecutor,
      this.mcpExecutor,
      this.embeddedJsExecutor,
      this.grpcExecutor,
      this.connectorExecutor,
      this.llmCallExecutor,
    ];

    for (const executor of all) {
      await this._initExecutor(executor);
    }

    this.logger.log(
      `[ExecutorRegistry] Registered executors: ${Array.from(this.executors.keys()).join(', ')}`
    );
  }

  async onModuleDestroy(): Promise<void> {
    for (const executor of this.executors.values()) {
      try {
        await executor.onDestroy?.();
      } catch (err: any) {
        this.logger.warn(`[ExecutorRegistry] Error destroying executor '${executor.format}': ${err.message}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get the executor for a given service format.
   * @throws ExecutorError if no executor is registered for the format.
   */
  getExecutor(format: ServiceFormat): IServiceExecutor {
    const executor = this.executors.get(format);
    if (!executor) {
      throw new ExecutorError(
        `No executor registered for format '${format}'. Available: ${Array.from(this.executors.keys()).join(', ')}`,
        'RUNTIME_ERROR',
        false,
      );
    }
    return executor;
  }

  /**
   * Check whether the executor for `format` can currently handle `descriptor`.
   * Used by the SVM before deciding to fall back to CENTRAL.
   */
  async canExecute(format: ServiceFormat, descriptor: ExecutionDescriptor): Promise<boolean> {
    try {
      const executor = this.getExecutor(format);
      return executor.canExecute(descriptor);
    } catch {
      return false;
    }
  }

  /**
   * Execute a service directly.
   * Wraps executor.execute() with retry logic from the descriptor context.
   */
  async execute(
    format: ServiceFormat,
    descriptor: ExecutionDescriptor,
    ctx: ExecutorContext,
    retryPolicy?: { maxAttempts: number; delayMs: number; backoffFactor: number },
  ): Promise<ExecutorResult> {
    const executor = this.getExecutor(format);
    const maxAttempts = retryPolicy?.maxAttempts ?? 1;
    let lastError: Error = new Error('Unknown');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await executor.execute(descriptor, ctx);
      } catch (err: any) {
        lastError = err;
        const isRetriable = err instanceof ExecutorError ? err.retriable : true;

        if (!isRetriable || attempt >= maxAttempts) break;

        const delay = (retryPolicy?.delayMs ?? 100) * Math.pow(retryPolicy?.backoffFactor ?? 1, attempt - 1);
        this.logger.warn(
          `[ExecutorRegistry] Attempt ${attempt}/${maxAttempts} failed for '${format}': ${err.message}. Retrying in ${delay}ms`
        );
        await new Promise(r => setTimeout(r, delay));
      }
    }

    throw lastError;
  }

  /**
   * Register a custom executor at runtime.
   * Calls onInit() before making it available.
   */
  async register(executor: IServiceExecutor): Promise<void> {
    await this._initExecutor(executor);
    this.logger.log(`[ExecutorRegistry] Custom executor registered: ${executor.format}`);
  }

  /** List all registered formats */
  listFormats(): ServiceFormat[] {
    return Array.from(this.executors.keys());
  }

  // ─────────────────────────────────────────────────────────────────────────

  private async _initExecutor(executor: IServiceExecutor): Promise<void> {
    try {
      await executor.onInit?.();
      this.executors.set(executor.format, executor);
    } catch (err: any) {
      this.logger.warn(
        `[ExecutorRegistry] Failed to init executor '${executor.format}': ${err.message}. It will not be available.`
      );
    }
  }
}
