/**
 * ConnectorDispatchService
 *
 * Bridges PipelineExecutor with ConnectorsService.
 * Given a connector ID + action string + resolved slots, it:
 *  1. Loads the ConnectorEntity from DB (via ConnectorsService)
 *  2. Decrypts its credentials
 *  3. Routes to the appropriate HTTP call based on ConnectorType + action
 *  4. Applies extractOutput mapping on the response
 *
 * Action naming convention: "<resource>.<verb>"
 *   message.send        Slack / Teams / SMTP
 *   email.send          SMTP
 *   record.create       REST_API (POST)
 *   record.fetch        REST_API (GET)
 *   record.update       REST_API (PUT/PATCH)
 *   record.delete       REST_API (DELETE)
 *   webhook.trigger     Webhook (POST payload)
 *   any custom string   REST_API with dynamic path
 */

import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { ConnectorsService } from '../connectors/connectors.service';
import { ConnectorEntity } from '../connectors/connector.entity';
import { ConnectorType } from '../connectors/connector.types';

// Matches the ConnectorActionStep.extractOutput descriptor
export interface ExtractOutput {
  [alias: string]: string; // alias → dot-path into the response body (e.g., "messageId": "ts")
}

export interface DispatchResult {
  success: boolean;
  rawResponse: unknown;
  extracted: Record<string, unknown>;
  durationMs: number;
}

@Injectable()
export class ConnectorDispatchService {
  private readonly logger = new Logger(ConnectorDispatchService.name);

  constructor(private readonly connectorsService: ConnectorsService) {}

  /**
   * Execute a connector action and return the mapped output.
   *
   * @param connectorId  UUID of the ConnectorEntity
   * @param userId       Owner of the connector (for permission check)
   * @param action       Action string, e.g. "message.send"
   * @param slots        Resolved template inputs
   * @param extractOutput Optional alias→dotPath mapping for response extraction
   */
  async execute(
    connectorId: string,
    userId: string,
    action: string,
    slots: Record<string, unknown>,
    extractOutput?: ExtractOutput,
  ): Promise<DispatchResult> {
    const start = Date.now();

    const connector = await this.connectorsService.findOne(userId, connectorId);
    const credentials = this.connectorsService.getDecryptedCredentials(connector);

    this.logger.log(
      `[Dispatch] connector="${connector.name}" type=${connector.type} action="${action}"`,
    );

    let rawResponse: unknown;

    switch (connector.type) {
      case ConnectorType.SLACK:
        rawResponse = await this.executeSlack(connector, credentials, action, slots);
        break;

      case ConnectorType.TEAMS:
        rawResponse = await this.executeTeams(connector, credentials, action, slots);
        break;

      case ConnectorType.SMTP:
        rawResponse = await this.executeSmtp(connector, credentials, action, slots);
        break;

      case ConnectorType.WEBHOOK:
      case ConnectorType.REST_API:
        rawResponse = await this.executeRestApi(connector, credentials, action, slots);
        break;

      case ConnectorType.GRAPHQL:
        rawResponse = await this.executeGraphQL(connector, credentials, action, slots);
        break;

      case ConnectorType.SHOPIFY:
      case ConnectorType.STRIPE:
      case ConnectorType.HUBSPOT:
        rawResponse = await this.executeGenericRestWithAuth(connector, credentials, action, slots);
        break;

      default:
        throw new Error(
          `[Dispatch] ConnectorType "${connector.type}" is not supported for pipeline dispatch`,
        );
    }

    const extracted = this.applyExtractOutput(rawResponse, extractOutput);
    const durationMs = Date.now() - start;

    this.logger.log(
      `[Dispatch] "${connector.name}".${action} completed in ${durationMs}ms`,
    );

    return { success: true, rawResponse, extracted, durationMs };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Slack
  // ──────────────────────────────────────────────────────────────────────────

  private async executeSlack(
    connector: ConnectorEntity,
    credentials: any,
    action: string,
    slots: Record<string, unknown>,
  ): Promise<unknown> {
    const { botToken, webhookUrl } = credentials;

    if (action === 'message.send' || action === 'message.post') {
      const channel = (slots['channel'] as string) || (connector.config as any)?.defaultChannel;
      const text = slots['text'] as string;
      const blocks = slots['blocks'];

      if (webhookUrl) {
        // Incoming Webhook path (simpler, channel fixed in Slack UI)
        const body: Record<string, unknown> = { text };
        if (blocks) body.blocks = blocks;
        const res = await axios.post(webhookUrl, body, { timeout: 10000 });
        return { ok: res.data === 'ok', status: res.status };
      }

      if (!botToken) throw new Error('[Dispatch/Slack] Missing botToken or webhookUrl');
      if (!channel) throw new Error('[Dispatch/Slack] Missing "channel" slot');
      if (!text && !blocks) throw new Error('[Dispatch/Slack] Missing "text" slot');

      const body: Record<string, unknown> = { channel, text };
      if (blocks) body.blocks = blocks;

      const res = await axios.post('https://slack.com/api/chat.postMessage', body, {
        headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
        timeout: 10000,
      });

      if (!res.data.ok) throw new Error(`[Dispatch/Slack] API error: ${res.data.error}`);
      return res.data;
    }

    throw new Error(`[Dispatch/Slack] Unknown action "${action}"`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Microsoft Teams
  // ──────────────────────────────────────────────────────────────────────────

  private async executeTeams(
    connector: ConnectorEntity,
    credentials: any,
    action: string,
    slots: Record<string, unknown>,
  ): Promise<unknown> {
    if (action === 'message.send' || action === 'message.post') {
      const { webhookUrl } = credentials;
      if (!webhookUrl) throw new Error('[Dispatch/Teams] Missing webhookUrl');

      const text = slots['text'] as string;
      const title = slots['title'] as string | undefined;
      const themeColor = (slots['themeColor'] as string) || '0076D7';

      const body: Record<string, unknown> = {
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        themeColor,
        summary: title || text,
        sections: [{ activityText: text }],
      };
      if (title) body.title = title;

      const res = await axios.post(webhookUrl, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });

      return { ok: true, status: res.status };
    }

    throw new Error(`[Dispatch/Teams] Unknown action "${action}"`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SMTP (placeholder — requires a mail transport)
  // ──────────────────────────────────────────────────────────────────────────

  private async executeSmtp(
    connector: ConnectorEntity,
    credentials: any,
    action: string,
    slots: Record<string, unknown>,
  ): Promise<unknown> {
    if (action === 'email.send' || action === 'message.send') {
      this.logger.warn(
        '[Dispatch/SMTP] Direct SMTP not implemented; install nodemailer and extend this method.',
      );
      // Minimal implementation: log and return dry-run object
      return {
        queued: true,
        to: slots['to'],
        subject: slots['subject'],
        note: 'SMTP dispatch: install nodemailer to enable real email delivery',
      };
    }
    throw new Error(`[Dispatch/SMTP] Unknown action "${action}"`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // REST API / Webhook
  // ──────────────────────────────────────────────────────────────────────────

  private async executeRestApi(
    connector: ConnectorEntity,
    credentials: any,
    action: string,
    slots: Record<string, unknown>,
  ): Promise<unknown> {
    const cfg = connector.config as {
      baseUrl?: string;
      endpoint?: string;
      defaultHeaders?: Record<string, string>;
    };
    const baseUrl = cfg?.baseUrl ?? cfg?.endpoint ?? '';

    // Derive HTTP method from action: "record.create" → POST, "record.fetch" → GET, etc.
    const method = this.actionToMethod(action);

    // Merge auth header
    const headers: Record<string, string> = { ...(cfg?.defaultHeaders ?? {}) };
    const { apiKey, bearerToken, username, password } = credentials ?? {};
    if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
    else if (apiKey) headers['X-Api-Key'] = apiKey;
    else if (username && password) {
      const basic = Buffer.from(`${username}:${password}`).toString('base64');
      headers['Authorization'] = `Basic ${basic}`;
    }

    // Path override from slot
    const path = (slots['path'] as string) || (slots['endpoint'] as string) || '';
    const url = `${baseUrl}${path}`;

    const body = slots['body'] ?? slots;
    const params = slots['params'] as Record<string, unknown> | undefined;

    const reqCfg: AxiosRequestConfig = {
      method,
      url,
      headers,
      timeout: connector.timeout ?? 30000,
    };
    if (method === 'GET' || method === 'DELETE') reqCfg.params = params ?? body;
    else reqCfg.data = body;

    const res = await axios.request(reqCfg);
    return res.data;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GraphQL
  // ──────────────────────────────────────────────────────────────────────────

  private async executeGraphQL(
    connector: ConnectorEntity,
    credentials: any,
    action: string,
    slots: Record<string, unknown>,
  ): Promise<unknown> {
    const cfg = connector.config as { endpoint: string };
    const { bearerToken, apiKey } = credentials ?? {};
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
    else if (apiKey) headers['X-Api-Key'] = apiKey;

    const res = await axios.post(
      cfg.endpoint,
      { query: slots['query'], variables: slots['variables'] },
      { headers, timeout: connector.timeout ?? 30000 },
    );

    if (res.data.errors?.length) {
      throw new Error(`[Dispatch/GraphQL] ${JSON.stringify(res.data.errors)}`);
    }
    return res.data.data ?? res.data;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Generic REST with auth (Shopify, Stripe, HubSpot…)
  // ──────────────────────────────────────────────────────────────────────────

  private async executeGenericRestWithAuth(
    connector: ConnectorEntity,
    credentials: any,
    action: string,
    slots: Record<string, unknown>,
  ): Promise<unknown> {
    return this.executeRestApi(connector, credentials, action, slots);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  private actionToMethod(action: string): 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' {
    const verb = action.split('.')[1]?.toLowerCase() ?? 'send';
    if (verb === 'fetch' || verb === 'get' || verb === 'list' || verb === 'read') return 'GET';
    if (verb === 'update' || verb === 'patch') return 'PATCH';
    if (verb === 'replace') return 'PUT';
    if (verb === 'delete' || verb === 'remove') return 'DELETE';
    return 'POST'; // default: create, send, trigger, post
  }

  /**
   * Apply alias→dotPath mapping to extract specific fields from the raw response.
   *
   * Example: extractOutput = { "messageTimestamp": "ts", "channelId": "channel" }
   * If rawResponse = { ok: true, ts: "12345", channel: "C0123" }
   * Returns: { messageTimestamp: "12345", channelId: "C0123" }
   */
  private applyExtractOutput(
    raw: unknown,
    extractOutput?: ExtractOutput,
  ): Record<string, unknown> {
    if (!extractOutput || typeof raw !== 'object' || raw === null) {
      return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    }

    const result: Record<string, unknown> = {};
    const obj = raw as Record<string, unknown>;

    for (const [alias, dotPath] of Object.entries(extractOutput)) {
      const parts = dotPath.split('.');
      let val: unknown = obj;
      for (const part of parts) {
        if (val && typeof val === 'object') {
          val = (val as Record<string, unknown>)[part];
        } else {
          val = undefined;
          break;
        }
      }
      result[alias] = val;
    }

    return result;
  }
}
