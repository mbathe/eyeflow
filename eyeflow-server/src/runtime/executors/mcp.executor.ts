/**
 * MCP Executor
 *
 * Calls tools on MCP (Model Context Protocol) servers.
 * Compatible node tiers: CENTRAL only (MCP daemon runs on central node).
 *
 * The executor maintains a pool of MCP server connections.
 * When `execute()` is called, it locates the server by name,
 * sends a `call_tool` request, and maps the response to output ports.
 */

import { Injectable, Logger } from '@nestjs/common';
import { IServiceExecutor, ExecutorContext, ExecutorResult, ExecutorError } from './executor.interface';
import {
  ExecutionDescriptor,
  McpExecutionDescriptor,
} from '../../compiler/interfaces/service-manifest.interface';

// ── Minimal MCP wire types ────────────────────────────────────────────────────

interface McpCallRequest {
  jsonrpc: '2.0';
  method: 'tools/call';
  id: string;
  params: {
    name: string;
    arguments: Record<string, any>;
  };
}

interface McpCallResponse {
  jsonrpc: '2.0';
  id: string;
  result?: {
    content: Array<{ type: string; text?: string; data?: any }>;
    isError?: boolean;
  };
  error?: { code: number; message: string };
}

@Injectable()
export class McpExecutor implements IServiceExecutor {
  readonly format = 'MCP' as const;
  private readonly logger = new Logger(McpExecutor.name);

  /** Map serverName → base URL */
  private serverUrls = new Map<string, string>([
    // Built-in server URL patterns (can be overridden via env vars)
    ['ghcli',       process.env['MCP_GHCLI_URL']       || 'http://localhost:9000'],
    ['filesystem',  process.env['MCP_FILESYSTEM_URL']  || 'http://localhost:9001'],
    ['brave-search', process.env['MCP_BRAVE_URL']      || 'http://localhost:9002'],
    ['postgres',    process.env['MCP_POSTGRES_URL']    || 'http://localhost:9003'],
  ]);

  async canExecute(descriptor: ExecutionDescriptor): Promise<boolean> {
    const d = descriptor as McpExecutionDescriptor;
    const url = this._resolveServerUrl(d.serverName);
    if (!url) return false;
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async execute(descriptor: ExecutionDescriptor, ctx: ExecutorContext): Promise<ExecutorResult> {
    const d = descriptor as McpExecutionDescriptor;
    const t0 = Date.now();

    const baseUrl = this._resolveServerUrl(d.serverName);
    if (!baseUrl) {
      throw new ExecutorError(
        `MCP server '${d.serverName}' not configured. Set MCP_${d.serverName.toUpperCase().replace(/-/g, '_')}_URL`,
        'RUNTIME_ERROR',
        false,
      );
    }

    // Map inputs to MCP arguments
    const mcpArgs: Record<string, any> = {};
    if (d.inputMapping) {
      for (const [portName, mcpParam] of Object.entries(d.inputMapping)) {
        if (ctx.inputs[portName] !== undefined) {
          mcpArgs[mcpParam] = ctx.inputs[portName];
        }
      }
    } else {
      Object.assign(mcpArgs, ctx.inputs);
    }

    const request: McpCallRequest = {
      jsonrpc: '2.0',
      method: 'tools/call',
      id: ctx.traceId || String(Date.now()),
      params: { name: d.toolName, arguments: mcpArgs },
    };

    this.logger.debug(`[MCP] ${d.serverName}.${d.toolName}(${JSON.stringify(mcpArgs).slice(0, 100)})`);

    let responseData: McpCallResponse;
    try {
      const res = await fetch(`${baseUrl}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(ctx.timeoutMs || 30_000),
      });

      if (!res.ok) {
        throw new ExecutorError(`MCP server returned HTTP ${res.status}`, 'NETWORK_ERROR', true);
      }

      responseData = await res.json() as McpCallResponse;
    } catch (err: any) {
      if (err instanceof ExecutorError) throw err;
      throw new ExecutorError(`MCP request failed: ${err.message}`, 'NETWORK_ERROR', true, err);
    }

    if (responseData.error) {
      throw new ExecutorError(
        `MCP tool error (${responseData.error.code}): ${responseData.error.message}`,
        'RUNTIME_ERROR',
        false,
      );
    }

    if (responseData.result?.isError) {
      const msg = responseData.result.content.map(c => c.text || '').join('\n');
      throw new ExecutorError(`MCP tool reported error: ${msg}`, 'RUNTIME_ERROR', false);
    }

    // Parse content blocks → outputs
    const rawOutputs = this._parseContent(responseData.result?.content ?? []);

    // Apply output mapping if provided
    const outputs: Record<string, any> = {};
    if (d.outputMapping) {
      for (const [from, to] of Object.entries(d.outputMapping)) {
        outputs[to] = rawOutputs[from];
      }
    } else {
      Object.assign(outputs, rawOutputs);
    }

    return { outputs, durationMs: Date.now() - t0, rawResponse: responseData };
  }

  // ─────────────────────────────────────────────────────────────────────────

  private _resolveServerUrl(serverName: string): string | undefined {
    if (this.serverUrls.has(serverName)) return this.serverUrls.get(serverName);
    const envKey = `MCP_${serverName.toUpperCase().replace(/-/g, '_')}_URL`;
    const fromEnv = process.env[envKey];
    if (fromEnv) {
      this.serverUrls.set(serverName, fromEnv);
      return fromEnv;
    }
    return undefined;
  }

  private _parseContent(content: Array<{ type: string; text?: string; data?: any }>): Record<string, any> {
    if (content.length === 0) return {};
    if (content.length === 1) {
      const item = content[0];
      if (item.type === 'text' && item.text) {
        try { return JSON.parse(item.text); } catch { return { result: item.text }; }
      }
      return { result: item.data ?? item.text };
    }
    // Multiple content blocks → { block_0: …, block_1: … }
    const result: Record<string, any> = {};
    content.forEach((item, i) => {
      result[`block_${i}`] = item.data ?? item.text;
    });
    return result;
  }

  /** Register a new MCP server at runtime */
  registerServer(name: string, url: string): void {
    this.serverUrls.set(name, url);
    this.logger.log(`[MCP] Registered server '${name}' → ${url}`);
  }
}
