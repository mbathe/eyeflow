/**
 * IConnectorDriver — plugin interface every connector driver MUST implement.
 *
 * Architecture rationale
 * ──────────────────────
 * Instead of a monolithic switch/case in ConnectorExecutor, each connector
 * type is encapsulated in its own driver class.  The ConnectorDriverRegistry
 * holds all registered drivers and picks the right one at runtime.
 *
 * Custom connectors (user-defined REST_API, GRAPHQL, WEBHOOK types that are
 * not part of the built-in enum) are handled by the GenericHttpDriver, which
 * reads the operation config and constructs an HTTP request on the fly.
 *
 * Adding a new connector type:
 *   1. Create a class that implements IConnectorDriver.
 *   2. Return `true` from `canHandle()` for the new type string(s).
 *   3. Register it in ConnectorDriverRegistry.register().
 *   No other files need to change.
 */

import { ExecutorContext } from '../executors/executor.interface';
import {
  ConnectorPayload,
  ConnectorQueryOptions,
  ConnectorActionDescriptor,
} from './connector-payload.interface';

// ─────────────────────────────────────────────────────────────────────────────

export interface IConnectorDriver {
  /**
   * Returns true if this driver can handle the given connectorType string.
   * Called by ConnectorDriverRegistry to find the right driver.
   * Allows drivers to handle multiple types (e.g. 'postgresql' AND 'mysql').
   */
  canHandle(connectorType: string): boolean;

  /**
   * Execute a READ (query) operation.
   *
   * @param options  Universal query descriptor
   * @param connCfg  Decrypted connector configuration (from VaultService / ctx.connectorConfigs)
   * @param ctx      SVM executor context (contains secrets, traceId, …)
   */
  query(
    options: ConnectorQueryOptions,
    connCfg: Record<string, unknown>,
    ctx: ExecutorContext,
  ): Promise<ConnectorPayload>;

  /**
   * Execute a WRITE / ACTION operation (insert, update, delete, send, publish, …).
   *
   * @param action   Action descriptor (functionId + params)
   * @param connCfg  Decrypted connector configuration
   * @param ctx      SVM executor context
   */
  executeAction(
    action: ConnectorActionDescriptor,
    connCfg: Record<string, unknown>,
    ctx: ExecutorContext,
  ): Promise<ConnectorPayload>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Base class helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Abstract base that every built-in driver extends.
 * Provides:
 *  • `_require()` — safe dynamic require with a helpful install hint
 *  • `_resolve()` — template interpolation ({placeholder} → value)
 *  • `_require()` — safe dynamic import
 */
export abstract class BaseConnectorDriver implements IConnectorDriver {
  abstract canHandle(connectorType: string): boolean;
  abstract query(options: ConnectorQueryOptions, connCfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload>;
  abstract executeAction(action: ConnectorActionDescriptor, connCfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload>;

  /**
   * Returns the connector id from ctx (looks up connectorConfigs for the matching type).
   * Falls back to connCfg.id or 'unknown' if neither is present.
   */
  protected _connectorId(connCfg: Record<string, unknown>, ctx: ExecutorContext): string {
    if (typeof connCfg['id'] === 'string') return connCfg['id'];
    return 'unknown';
  }

  /**
   * Safe dynamic require.  Throws a clear error with npm install hint if the
   * package is not installed (can happen on fresh deployments or edge nodes).
   */
  protected _require<T = any>(moduleName: string, npmHint?: string): T {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(moduleName) as T;
    } catch {
      const hint = npmHint ?? `npm install ${moduleName}`;
      throw new ConnectorDriverError(
        `Driver dependency '${moduleName}' is not installed. Run: ${hint}`,
        'DEPENDENCY_MISSING',
        false,
      );
    }
  }

  /** Recursively replace {key} tokens with values from context */
  protected _resolve(template: unknown, ctx: Record<string, unknown>): unknown {
    if (typeof template === 'string') {
      return template.replace(/\{(\w+)\}/g, (_, k) =>
        ctx[k] !== undefined ? String(ctx[k]) : `{${k}}`,
      );
    }
    if (Array.isArray(template)) return template.map((v) => this._resolve(v, ctx));
    if (template && typeof template === 'object') {
      return Object.fromEntries(
        Object.entries(template as Record<string, unknown>).map(([k, v]) => [k, this._resolve(v, ctx)]),
      );
    }
    return template;
  }

  /** Resolve password: prefer explicit credential, fall back to secrets env var */
  protected _password(connCfg: Record<string, unknown>, ctx: ExecutorContext): string {
    if (typeof connCfg['password'] === 'string' && connCfg['password']) return connCfg['password'];
    const envKey = connCfg['passwordEnvVar'] as string | undefined;
    if (envKey && ctx.secrets?.[envKey]) return ctx.secrets[envKey];
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export class ConnectorDriverError extends Error {
  constructor(
    message: string,
    public readonly code: 'DEPENDENCY_MISSING' | 'CONFIG_ERROR' | 'RUNTIME_ERROR' | 'UNSUPPORTED_OPERATION',
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ConnectorDriverError';
  }
}
