/**
 * HTTP Executor
 *
 * Calls external REST/HTTP APIs.
 * Handles authentication (Bearer, API key, Basic, OAuth2 client credentials),
 * request serialization (body_json, query_params, form_data, path_params)
 * and response deserialization (body_json, body_text, status_code).
 *
 * Compatible tiers: CENTRAL, LINUX (needs internet access).
 */

import { Injectable, Logger } from '@nestjs/common';
import { IServiceExecutor, ExecutorContext, ExecutorResult, ExecutorError } from './executor.interface';
import {
  ExecutionDescriptor,
  HttpExecutionDescriptor,
  HttpAuth,
} from '../../compiler/interfaces/service-manifest.interface';

@Injectable()
export class HttpExecutor implements IServiceExecutor {
  readonly format = 'HTTP' as const;
  private readonly logger = new Logger(HttpExecutor.name);

  /** Cache for OAuth2 access tokens: tokenUrl → { token, expiresAt } */
  private tokenCache = new Map<string, { token: string; expiresAt: number }>();

  async canExecute(descriptor: ExecutionDescriptor): Promise<boolean> {
    const d = descriptor as HttpExecutionDescriptor;
    return !!(d.urlTemplate && d.method);
  }

  async execute(descriptor: ExecutionDescriptor, ctx: ExecutorContext): Promise<ExecutorResult> {
    const d = descriptor as HttpExecutionDescriptor;
    const t0 = Date.now();

    // 1. Build URL
    const url = this._buildUrl(d.urlTemplate, ctx.inputs, d.requestMapping);

    // 2. Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(d.headers || {}),
    };

    if (d.auth) {
      await this._injectAuth(d.auth, headers, ctx.secrets || {});
    }

    // 3. Build body / params
    let body: string | undefined;
    let queryString = '';

    if (['POST', 'PUT', 'PATCH'].includes(d.method)) {
      if (d.requestMapping === 'body_json') {
        body = JSON.stringify(ctx.inputs);
      } else if (d.requestMapping === 'form_data') {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = new URLSearchParams(
          Object.entries(ctx.inputs).map(([k, v]) => [k, String(v)] as [string, string])
        ).toString();
      }
    } else if (d.requestMapping === 'query_params') {
      queryString = '?' + new URLSearchParams(
        Object.entries(ctx.inputs).map(([k, v]) => [k, String(v)] as [string, string])
      ).toString();
    }

    // 4. Make the request
    const fullUrl = url + queryString;
    this.logger.debug(`[HTTP] ${d.method} ${fullUrl}`);

    let rawResponse: any;
    let statusCode: number;

    try {
      const response = await fetch(fullUrl, {
        method: d.method,
        headers,
        body,
        signal: AbortSignal.timeout(ctx.timeoutMs || 30_000),
      });

      statusCode = response.status;

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new ExecutorError(
          `HTTP ${statusCode}: ${errBody.slice(0, 200)}`,
          statusCode === 401 || statusCode === 403 ? 'AUTH_ERROR' : 'NETWORK_ERROR',
          statusCode >= 500, // only server errors are retriable
        );
      }

      if (d.responseMapping === 'body_json') {
        rawResponse = await response.json();
      } else if (d.responseMapping === 'body_text') {
        rawResponse = await response.text();
      } else {
        rawResponse = { statusCode };
      }
    } catch (err: any) {
      if (err instanceof ExecutorError) throw err;
      throw new ExecutorError(`HTTP request failed: ${err.message}`, 'NETWORK_ERROR', true, err);
    }

    // 5. Map response → outputs
    const outputs = this._mapOutputs(rawResponse, d.responseMapping, d.outputMapping);

    return { outputs, durationMs: Date.now() - t0, rawResponse };
  }

  // ─────────────────────────────────────────────────────────────────────────

  private _buildUrl(template: string, inputs: Record<string, any>, requestMapping: string): string {
    if (requestMapping === 'path_params') {
      return template.replace(/\{(\w+)\}/g, (_, key) =>
        encodeURIComponent(inputs[key] !== undefined ? String(inputs[key]) : '')
      );
    }
    return template;
  }

  private async _injectAuth(
    auth: HttpAuth,
    headers: Record<string, string>,
    secrets: Record<string, string>,
  ): Promise<void> {
    switch (auth.type) {
      case 'bearer': {
        const token = secrets[auth.envVar] || process.env[auth.envVar];
        if (!token) throw new ExecutorError(`Bearer token env var '${auth.envVar}' not found`, 'AUTH_ERROR', false);
        headers['Authorization'] = `Bearer ${token}`;
        break;
      }
      case 'api_key': {
        const key = secrets[auth.envVar] || process.env[auth.envVar];
        if (!key) throw new ExecutorError(`API key env var '${auth.envVar}' not found`, 'AUTH_ERROR', false);
        headers[auth.headerName] = key;
        break;
      }
      case 'basic': {
        const user = secrets[auth.userEnvVar] || process.env[auth.userEnvVar] || '';
        const pass = secrets[auth.passEnvVar] || process.env[auth.passEnvVar] || '';
        headers['Authorization'] = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
        break;
      }
      case 'oauth2': {
        const token = await this._getOAuth2Token(auth.tokenUrl, auth.clientIdEnvVar, auth.clientSecretEnvVar, secrets);
        headers['Authorization'] = `Bearer ${token}`;
        break;
      }
      case 'none':
      default:
        break;
    }
  }

  private async _getOAuth2Token(
    tokenUrl: string,
    clientIdEnvVar: string,
    clientSecretEnvVar: string,
    secrets: Record<string, string>,
  ): Promise<string> {
    const cached = this.tokenCache.get(tokenUrl);
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      return cached.token;
    }

    const clientId = secrets[clientIdEnvVar] || process.env[clientIdEnvVar] || '';
    const clientSecret = secrets[clientSecretEnvVar] || process.env[clientSecretEnvVar] || '';

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
    });

    if (!res.ok) throw new ExecutorError('OAuth2 token request failed', 'AUTH_ERROR', false);

    const data: any = await res.json();
    const token: string = data.access_token;
    const expiresIn: number = data.expires_in ?? 3600;
    this.tokenCache.set(tokenUrl, { token, expiresAt: Date.now() + expiresIn * 1000 });
    return token;
  }

  private _mapOutputs(
    rawResponse: any,
    responseMapping: string,
    outputMapping?: Record<string, string>,
  ): Record<string, any> {
    if (responseMapping === 'body_text') return { result: rawResponse };
    if (responseMapping === 'status_code') return { statusCode: rawResponse.statusCode };

    if (!outputMapping) return rawResponse as Record<string, any>;

    const outputs: Record<string, any> = {};
    for (const [path, portName] of Object.entries(outputMapping)) {
      outputs[portName] = this._get(rawResponse, path);
    }
    return outputs;
  }

  private _get(obj: any, dotPath: string): any {
    return dotPath.split('.').reduce((acc, key) => acc?.[key], obj);
  }
}
