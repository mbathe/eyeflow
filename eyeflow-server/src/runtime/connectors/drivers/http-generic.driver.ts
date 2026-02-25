/**
 * HttpGenericDriver
 *
 * A "catch-all" driver that handles:
 *   • Built-in HTTP-based types: rest_api, webhook, graphql, shopify, hubspot,
 *     teams, whatsapp, influxdb, google_drive, dropbox, dynamodb, firestore
 *   • ANY custom connector type — including user-defined connectors whose type
 *     value is not in the built-in enum but whose operationConfig contains
 *     { httpMethod, url } (or the connector config contains { baseUrl }).
 *
 * HOW CUSTOM CONNECTORS WORK
 * ──────────────────────────
 * A custom connector is defined the same way as any other connector in the DB.
 * Its configuration must contain:
 *   {
 *     baseUrl:    "https://my-erp.example.com/api",
 *     authType:   "bearer" | "api_key" | "basic" | "none",
 *     token:      "...",          // for bearer
 *     apiKey:     "...",          // for api_key
 *     apiKeyHeader: "X-API-Key",  // optional header name
 *     username:   "...",          // for basic
 *     password:   "...",          // for basic
 *
 *     // Optional default headers
 *     headers:    { "X-Tenant-ID": "acme" },
 *   }
 *
 * Each operation (function) called from the SVM comes with an operationConfig:
 *   {
 *     method:   "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
 *     path:     "/v1/orders",        // appended to baseUrl
 *     body:     { ... },             // request body (POST/PUT/PATCH)
 *     query:    { status: "open" },  // query string params
 *   }
 *
 * The normalizer then always returns data[] from the response, regardless of
 * whether the API returns { orders: [...] }, { data: [...] }, or a bare array.
 *
 * BUILT-IN TYPE SHORTCUTS
 * ────────────────────────
 * For known types (shopify, hubspot, whatsapp, …) a pre-built "profile"
 * is loaded that sets the correct baseUrl, auth header, and Content-Type.
 * The operation config is still the source of truth; the profile just fills
 * missing defaults so users don't have to repeat themselves.
 */

import { ExecutorContext } from '../../executors/executor.interface';
import { BaseConnectorDriver, ConnectorDriverError } from '../connector-driver.interface';
import { ConnectorPayload, ConnectorQueryOptions, ConnectorActionDescriptor } from '../connector-payload.interface';
import { ConnectorDataNormalizer } from '../connector-data-normalizer';

// ─────────────────────────────────────────────────────────────────────────────
// Known-type profiles
// ─────────────────────────────────────────────────────────────────────────────

interface ConnectorProfile {
  baseUrl?: (cfg: Record<string, unknown>) => string;
  authHeader?: (cfg: Record<string, unknown>, secrets?: Record<string, string>) => Record<string, string>;
  defaultContentType?: string;
  queryMethod?: string;    // default HTTP method for queries
  queryPath?: (resource: string) => string;
}

const PROFILES: Record<string, ConnectorProfile> = {
  shopify: {
    baseUrl: (cfg) => `https://${cfg['shopDomain']}/admin/api/2024-01`,
    authHeader: (cfg) => ({ 'X-Shopify-Access-Token': cfg['accessToken'] as string }),
    queryMethod: 'GET',
    queryPath: (r) => `/${r}.json`,
  },
  hubspot: {
    baseUrl: () => 'https://api.hubapi.com',
    authHeader: (cfg, s) => ({ Authorization: `Bearer ${(cfg['accessToken'] as string) ?? s?.['HUBSPOT_TOKEN']}` }),
    queryPath: (r) => `/crm/v3/objects/${r}`,
  },
  teams: {
    baseUrl: (cfg) => cfg['webhookUrl'] as string,
    authHeader: () => ({}),
    defaultContentType: 'application/json',
    queryMethod: 'POST',
    queryPath: () => '',
  },
  whatsapp: {
    baseUrl: (cfg) => `${(cfg['apiUrl'] as string) ?? 'https://graph.facebook.com/v18.0'}/${cfg['phoneNumberId']}/messages`,
    authHeader: (cfg, s) => ({ Authorization: `Bearer ${(cfg['accessToken'] as string) ?? s?.['WHATSAPP_TOKEN']}` }),
    queryMethod: 'POST',
    queryPath: () => '',
  },
  influxdb: {
    baseUrl: (cfg) => `${cfg['url']}/api/v2`,
    authHeader: (cfg, s) => ({ Authorization: `Token ${(cfg['token'] as string) ?? s?.['INFLUXDB_TOKEN']}` }),
  },
  google_drive: {
    baseUrl: () => 'https://www.googleapis.com/drive/v3',
    authHeader: (cfg, s) => ({ Authorization: `Bearer ${(cfg['accessToken'] as string) ?? s?.['GOOGLE_ACCESS_TOKEN']}` }),
    queryPath: (r) => `/${r}`,
  },
  dropbox: {
    baseUrl: () => 'https://api.dropboxapi.com/2',
    authHeader: (cfg, s) => ({ Authorization: `Bearer ${(cfg['accessToken'] as string) ?? s?.['DROPBOX_TOKEN']}` }),
    queryMethod: 'POST',
  },
  rest_api: {},  // No defaults — fully driven by operationConfig
  webhook: {},
  graphql: {},
  dynamodb: {
    // DynamoDB is REST-like but uses AWS Signature v4; handled via operationConfig + AWS SDK
    baseUrl: (cfg) => cfg['endpoint'] as string ?? `https://dynamodb.${cfg['region'] ?? 'us-east-1'}.amazonaws.com`,
    authHeader: () => ({}),
  },
  firestore: {
    baseUrl: (cfg) => `https://firestore.googleapis.com/v1/projects/${cfg['projectId']}/databases/(default)/documents`,
    authHeader: (cfg, s) => ({ Authorization: `Bearer ${(cfg['accessToken'] as string) ?? s?.['GOOGLE_ACCESS_TOKEN']}` }),
  },
};

// ─────────────────────────────────────────────────────────────────────────────

export class HttpGenericDriver extends BaseConnectorDriver {
  /**
   * This driver can handle:
   * – All explicitly listed HTTP-based types
   * – ANY unknown type (custom connectors) → true as fallback
   *
   * Register this driver LAST in the registry so more specific drivers get priority.
   */
  canHandle(_t: string): boolean {
    return true; // final fallback
  }

  // ──────────────────────────────────────────────────────────────────────────
  // QUERY
  // ──────────────────────────────────────────────────────────────────────────

  async query(opts: ConnectorQueryOptions, cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload> {
    const type = cfg['type'] as string ?? 'rest_api';
    const profile = PROFILES[type] ?? {};

    // Build URL
    const baseUrl = (profile.baseUrl?.(cfg) ?? (cfg['baseUrl'] as string) ?? '').replace(/\/$/, '');
    const pathSuffix = profile.queryPath ? profile.queryPath(opts.resource) : `/${opts.resource}`;
    const queryParams = this._buildQueryParams(opts);

    const url = baseUrl + pathSuffix + (queryParams ? `?${queryParams}` : '');
    const method = profile.queryMethod ?? 'GET';

    if (type === 'graphql') {
      return this._graphqlQuery(opts, cfg, ctx);
    }

    const body = method === 'POST' || method === 'PUT' ? JSON.stringify(opts.extra ?? {}) : undefined;

    const raw = await this._fetch(url, { method, body, contentType: profile.defaultContentType }, cfg, ctx);
    return ConnectorDataNormalizer.wrap(raw, {
      connectorId: this._connectorId(cfg, ctx),
      connectorType: type,
      operation: 'query',
      source: `${type}:${opts.resource}`,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ACTION
  // ──────────────────────────────────────────────────────────────────────────

  async executeAction(action: ConnectorActionDescriptor, cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload> {
    const type = cfg['type'] as string ?? 'rest_api';
    const p = action.params as Record<string, unknown>;

    // GraphQL mutation
    if (type === 'graphql' && action.functionId === 'graphql_mutation') {
      return this._graphqlMutation(action, cfg, ctx);
    }

    // operationConfig-driven (LLM-compiled, or user-authored)
    // The IR can pass an explicit { method, path, body, query } in p['_httpConfig']
    const httpCfg = (p['_httpConfig'] as Record<string, unknown>) ?? {};

    const profile = PROFILES[type] ?? {};
    const baseUrl = (profile.baseUrl?.(cfg) ?? (cfg['baseUrl'] as string) ?? '').replace(/\/$/, '');
    const pathSuffix = (httpCfg['path'] as string) ?? (p['path'] as string) ?? `/${action.functionId}`;
    const method = ((httpCfg['method'] as string) ?? (p['_method'] as string) ?? 'POST').toUpperCase();
    const url = baseUrl + pathSuffix;

    // Build body: remove internal meta keys
    const bodyPayload = { ...p };
    delete bodyPayload['_httpConfig']; delete bodyPayload['_method']; delete bodyPayload['path'];

    const raw = await this._fetch(
      url,
      { method, body: JSON.stringify(bodyPayload), contentType: 'application/json' },
      cfg, ctx,
    );

    return ConnectorDataNormalizer.wrap(raw, {
      connectorId: this._connectorId(cfg, ctx),
      connectorType: type,
      operation: action.functionId,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GraphQL helpers
  // ──────────────────────────────────────────────────────────────────────────

  private async _graphqlQuery(opts: ConnectorQueryOptions, cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload> {
    const gql = opts.rawQuery ?? `query { ${opts.resource} { ${(opts.select ?? ['id']).join(' ')} } }`;
    const variables = opts.extra?.['variables'] as Record<string, unknown> || {};
    const raw = await this._fetch(
      (cfg['endpoint'] as string) ?? (cfg['baseUrl'] as string) ?? '',
      { method: 'POST', body: JSON.stringify({ query: gql, variables }), contentType: 'application/json' },
      cfg, ctx,
    );
    return ConnectorDataNormalizer.wrap(raw, {
      connectorId: this._connectorId(cfg, ctx),
      connectorType: 'graphql',
      operation: 'query',
    });
  }

  private async _graphqlMutation(action: ConnectorActionDescriptor, cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload> {
    const p = action.params as Record<string, unknown>;
    const raw = await this._fetch(
      (cfg['endpoint'] as string) ?? (cfg['baseUrl'] as string) ?? '',
      { method: 'POST', body: JSON.stringify({ query: p['mutation'], variables: p['variables'] ?? {} }), contentType: 'application/json' },
      cfg, ctx,
    );
    return ConnectorDataNormalizer.wrap(raw, {
      connectorId: this._connectorId(cfg, ctx),
      connectorType: 'graphql',
      operation: 'mutation',
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Fetch helper
  // ──────────────────────────────────────────────────────────────────────────

  private async _fetch(
    url: string,
    opts: { method: string; body?: string; contentType?: string },
    cfg: Record<string, unknown>,
    ctx: ExecutorContext,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      ...(opts.contentType ? { 'Content-Type': opts.contentType } : {}),
      ...this._authHeaders(cfg, ctx),
      ...((cfg['headers'] as Record<string, string>) ?? {}),
    };

    const res = await fetch(url, { method: opts.method, headers, body: opts.body });

    if (!res.ok) {
      const body = await res.text();
      throw new ConnectorDriverError(
        `HTTP ${opts.method} ${url} → ${res.status} ${res.statusText}: ${body.slice(0, 200)}`,
        'RUNTIME_ERROR',
        res.status >= 500,
      );
    }

    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) return res.json();
    if (ct.includes('text/')) return { content: await res.text(), contentType: ct };
    const buffer = await res.arrayBuffer();
    return { content: Buffer.from(buffer), contentType: ct };
  }

  private _authHeaders(cfg: Record<string, unknown>, ctx: ExecutorContext): Record<string, string> {
    const type = cfg['type'] as string ?? '';
    const profile = PROFILES[type];
    if (profile?.authHeader) return profile.authHeader(cfg, ctx.secrets);

    // Generic auth resolution from connector config
    const authType = (cfg['authType'] as string ?? 'none').toLowerCase();
    const token = (cfg['token'] ?? cfg['bearerToken'] ?? cfg['accessToken'] ?? ctx.secrets?.['ACCESS_TOKEN']) as string;
    const apiKey = (cfg['apiKey'] ?? ctx.secrets?.['API_KEY']) as string;
    const apiKeyHeader = (cfg['apiKeyHeader'] as string) ?? 'X-API-Key';
    const username = cfg['username'] as string;
    const password = this._password(cfg, ctx);

    switch (authType) {
      case 'bearer':
      case 'bearer_token':
        return token ? { Authorization: `Bearer ${token}` } : {};
      case 'api_key':
        return apiKey ? { [apiKeyHeader]: apiKey } : {};
      case 'basic':
      case 'basic_auth':
        if (username) return { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` };
        return {};
      default:
        // Fallback: if there's a token, use it as bearer
        if (token) return { Authorization: `Bearer ${token}` };
        return {};
    }
  }

  private _buildQueryParams(opts: ConnectorQueryOptions): string {
    const params = new URLSearchParams();
    for (const f of opts.filters ?? []) {
      if (f.op === 'eq') params.set(f.field, String(f.value));
    }
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.offset) params.set('offset', String(opts.offset));
    return params.toString();
  }
}
