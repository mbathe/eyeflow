/**
 * CONNECTOR Executor  (refactored)
 *
 * Delegating executor: translates SVM IR instructions into driver calls via
 * ConnectorDriverRegistry and wraps all results in a universal ConnectorPayload.
 *
 * WHAT CHANGED vs the old switch/case version
 * ────────────────────────────────────────────
 * OLD: a monolithic switch(connectorType) → hard crash on unknown types
 * NEW: ConnectorDriverRegistry.resolve(connectorType) → returns the right driver
 *      or falls through to HttpGenericDriver for any custom / unknown type.
 *
 * OUTPUT SHAPE (backward-compatible)
 * ────────────────────────────────────
 * The executor output is:
 *   {
 *     data:     Record<string,unknown>[],   ← always an array (new canonical field)
 *     rowCount: number,
 *     fields:   string[],
 *     raw:      <original response>,
 *     ...rawSpread,                         ← spread of raw keys for BC (rows, messageId, etc.)
 *   }
 *
 * Custom connectors
 * ─────────────────
 * Any connector type not matched by a specific driver falls through to
 * HttpGenericDriver. The connector config only needs { baseUrl, authType, token/apiKey/… }
 * and the IR operationConfig provides { method, path, body }.
 * No code changes needed for new connector types.
 */

import { Injectable, Logger } from '@nestjs/common';
import { IServiceExecutor, ExecutorContext, ExecutorResult, ExecutorError } from './executor.interface';
import {
  ExecutionDescriptor,
  ConnectorExecutionDescriptor,
} from '../../compiler/interfaces/service-manifest.interface';
import { ConnectorDriverRegistry } from '../connectors/connector-driver-registry.service';
import { ConnectorPayload, ConnectorQueryOptions, ConnectorActionDescriptor } from '../connectors/connector-payload.interface';

// Read operations: route to driver.query()
const QUERY_OPERATIONS = new Set([
  'query', 'select', 'find', 'findOne', 'get', 'list', 'read',
  'consume', 'scan', 'search', 'fetch',
]);

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ConnectorExecutor implements IServiceExecutor {
  readonly format = 'CONNECTOR' as const;
  private readonly logger = new Logger(ConnectorExecutor.name);

  constructor(private readonly driverRegistry: ConnectorDriverRegistry) {}

  async canExecute(descriptor: ExecutionDescriptor): Promise<boolean> {
    const d = descriptor as ConnectorExecutionDescriptor;
    return !!(d.connectorType && d.operation);
  }

  async execute(descriptor: ExecutionDescriptor, ctx: ExecutorContext): Promise<ExecutorResult> {
    const d = descriptor as ConnectorExecutionDescriptor;
    const t0 = Date.now();

    const resolvedInputs = this._applyInputMapping(ctx.inputs, d.inputMapping);
    const resolvedConfig = this._resolveTemplate(d.operationConfig, resolvedInputs);
    const connCfg = this._getConnectorConfig(d, ctx);

    this.logger.debug(
      `[CONNECTOR] ${d.connectorType}.${d.operation}(${JSON.stringify(resolvedConfig).slice(0, 120)})`,
    );

    let payload: ConnectorPayload;

    try {
      if (QUERY_OPERATIONS.has(d.operation)) {
        const opts = this._buildQueryOptions(d, resolvedConfig, resolvedInputs);
        payload = await this.driverRegistry.query(d.connectorType, opts, connCfg, ctx);
      } else {
        const action = this._buildActionDescriptor(d, resolvedConfig);
        payload = await this.driverRegistry.executeAction(d.connectorType, action, connCfg, ctx);
      }
    } catch (err: any) {
      throw new ExecutorError(
        err.message ?? String(err),
        err.code ?? 'RUNTIME_ERROR',
        err.retryable ?? false,
      );
    }

    const outputs = this._buildOutputs(payload, d.outputMapping);
    return { outputs, durationMs: Date.now() - t0, rawResponse: payload.raw };
  }

  // ─────────────────────────────────────────────────────────────────────────

  private _buildQueryOptions(
    d: ConnectorExecutionDescriptor,
    config: Record<string, any>,
    inputs: Record<string, any>,
  ): ConnectorQueryOptions {
    return {
      resource:
        config['table'] ?? config['collection'] ?? config['topic'] ??
        config['resource'] ?? config['path'] ?? config['bucket'] ??
        d.operationConfig?.['resource'] ?? '',
      rawQuery: config['sql'] ?? config['query'] ?? config['rawQuery'],
      filters: config['filters'] ?? config['where'],
      select: config['select'] ?? config['columns'] ?? config['fields'],
      orderBy: config['orderBy'] ?? config['sort'],
      limit: config['limit'] ?? inputs['limit'],
      offset: config['offset'] ?? inputs['offset'],
      extra: config,
    };
  }

  private _buildActionDescriptor(
    d: ConnectorExecutionDescriptor,
    config: Record<string, any>,
  ): ConnectorActionDescriptor {
    const functionId = config['functionId'] ?? `${d.connectorType}_${d.operation}`;
    return { functionId, params: config };
  }

  private _buildOutputs(payload: ConnectorPayload, outputMapping?: Record<string, string>): Record<string, any> {
    const rawSpread: Record<string, unknown> = {};
    if (payload.raw && typeof payload.raw === 'object' && !Array.isArray(payload.raw)) {
      Object.assign(rawSpread, payload.raw as Record<string, unknown>);
    }
    const base: Record<string, unknown> = {
      ...rawSpread,
      data:     payload.data,
      rowCount: payload.metadata.rowCount,
      fields:   payload.metadata.fields ?? [],
      source:   payload.metadata.source,
      raw:      payload.raw,
      hasMore:  payload.metadata.hasMore,
      ...(payload.data.length === 1 ? payload.data[0] : {}),
    };
    return this._applyOutputMapping(base, outputMapping);
  }

  private _getConnectorConfig(d: ConnectorExecutionDescriptor, ctx: ExecutorContext): Record<string, unknown> {
    const configs = (ctx.connectorConfigs ?? {}) as Record<string, Record<string, unknown>>;
    if ((d as any).connectorInstanceId && configs[(d as any).connectorInstanceId]) {
      return configs[(d as any).connectorInstanceId];
    }
    const found = Object.values(configs).find(
      (c) => c?.['type'] === d.connectorType || c?.['connectorType'] === d.connectorType,
    );
    if (found) return found;
    this.logger.warn(`[CONNECTOR] No config found for '${d.connectorType}'. Proceeding with empty config.`);
    return { type: d.connectorType };
  }

  private _resolveTemplate(config: Record<string, any>, inputs: Record<string, any>): Record<string, any> {
    const resolve = (val: any): any => {
      if (typeof val === 'string') return val.replace(/\{(\w+)\}/g, (_, k) => inputs[k] !== undefined ? String(inputs[k]) : `{${k}}`);
      if (Array.isArray(val)) return val.map(resolve);
      if (val && typeof val === 'object') return Object.fromEntries(Object.entries(val).map(([k, v]) => [k, resolve(v)]));
      return val;
    };
    return resolve(config) as Record<string, any>;
  }

  private _applyInputMapping(inputs: Record<string, any>, mapping?: Record<string, string>): Record<string, any> {
    if (!mapping) return inputs;
    const result: Record<string, any> = { ...inputs };
    for (const [from, to] of Object.entries(mapping)) {
      if (inputs[from] !== undefined) result[to] = inputs[from];
    }
    return result;
  }

  private _applyOutputMapping(result: Record<string, any>, mapping?: Record<string, string>): Record<string, any> {
    if (!mapping) return result;
    const outputs: Record<string, any> = { ...result };
    for (const [from, to] of Object.entries(mapping)) {
      if (result[from] !== undefined) outputs[to] = result[from];
    }
    return outputs;
  }
}
