/**
 * HTTP Webhook Trigger Driver  — example driver (spec §7)
 *
 * Registers a dynamic NestJS route and emits a TriggerEvent for every
 * incoming HTTP POST.  No external dependency — uses NestJS internals only.
 *
 * Supported tiers : CENTRAL
 * Required protocol: HTTP
 *
 * Config shape:
 * {
 *   path    : string          — e.g. "/webhooks/github"
 *   method? : 'POST' | 'GET' | 'PUT'  — default 'POST'
 *   secret? : string          — HMAC-SHA256 secret for X-Hub-Signature-256
 *   authMode?: 'none' | 'hmac' | 'bearer'   — default 'none'
 * }
 *
 * NOTE: Dynamic routes are registered on the NestJS HTTP adapter.
 *       They are appended at runtime and survive across activations.
 *       Deactivation marks the route as disabled (returns 404) without
 *       restarting the HTTP listener.
 */

import { Injectable, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import {
  ITriggerDriver,
  TriggerEvent,
} from '../interfaces/trigger-driver.interface';
import { NodeTier } from '../../nodes/interfaces/node-capability.interface';

// ── Config ────────────────────────────────────────────────────────────────

interface WebhookDriverConfig {
  path:     string;
  method?:  'POST' | 'GET' | 'PUT';
  secret?:  string;
  authMode?: 'none' | 'hmac' | 'bearer';
}

// ── Driver ────────────────────────────────────────────────────────────────

@Injectable()
export class HttpWebhookTriggerDriver implements ITriggerDriver {
  readonly driverId    = 'http-webhook';
  readonly displayName = 'HTTP Webhook Trigger';
  readonly supportedTiers: NodeTier[] = [NodeTier.CENTRAL];
  readonly configSchema = {
    path:     { type: 'string',  required: true,  example: '/webhooks/my-hook' },
    method:   { type: 'string',  required: false, enum: ['POST','GET','PUT'], default: 'POST' },
    secret:   { type: 'string',  required: false, secret: true },
    authMode: { type: 'string',  required: false, enum: ['none','hmac','bearer'], default: 'none' },
  };
  readonly requiredProtocols = ['HTTP'];

  private readonly logger = new Logger(HttpWebhookTriggerDriver.name);

  /**
   * Active hooks: path → { subject, activationId, config }
   * Multiple activations on the same path are allowed (fan-out).
   */
  private readonly hooks = new Map<string, {
    subject: Subject<TriggerEvent>;
    stop$:   Subject<void>;
    activationId: string;
    config:  WebhookDriverConfig;
    workflowId: string;
    version: number;
  }>();

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  // ── Core interface ────────────────────────────────────────────────────

  activate(
    activationId: string,
    config: Record<string, any>,
    workflowId: string,
    version: number,
  ): Observable<TriggerEvent> {
    const cfg = config as WebhookDriverConfig;
    const method  = (cfg.method ?? 'POST').toLowerCase() as 'post' | 'get' | 'put';
    const subject = new Subject<TriggerEvent>();
    const stop$   = new Subject<void>();

    this.hooks.set(activationId, { subject, stop$, activationId, config: cfg, workflowId, version });

    // Register dynamic route on NestJS HTTP adapter (Express or Fastify)
    const adapter = this.httpAdapterHost?.httpAdapter;
    if (adapter) {
      (adapter as any)[method]?.(cfg.path, (req: any, res: any) => {
        const entry = this.hooks.get(activationId);
        if (!entry) {
          res.status(404).send({ ok: false, reason: 'no_active_hook' });
          return;
        }

        // Auth validation
        if (!this._validateAuth(req, entry.config)) {
          res.status(401).send({ ok: false, reason: 'unauthorized' });
          return;
        }

        const event: TriggerEvent = {
          eventId:         uuidv4(),
          occurredAt:      new Date().toISOString(),
          driverId:        this.driverId,
          workflowId:      entry.workflowId,
          workflowVersion: entry.version,
          payload:         req.body ?? req.query,
          source:          {
            path:    cfg.path,
            method:  method.toUpperCase(),
            headers: req.headers,
            ip:      req.ip,
          },
        };

        entry.subject.next(event);
        res.status(200).send({ ok: true, eventId: event.eventId });
      });

      this.logger.log(
        `[WebhookDriver] ${method.toUpperCase()} ${cfg.path} → activation ${activationId.slice(0, 8)}`,
      );
    } else {
      this.logger.warn('[WebhookDriver] HttpAdapter not available — webhook not registered');
    }

    return subject.asObservable().pipe(takeUntil(stop$));
  }

  deactivate(activationId: string): void {
    const entry = this.hooks.get(activationId);
    if (!entry) return;
    entry.stop$.next();
    entry.stop$.complete();
    entry.subject.complete();
    this.hooks.delete(activationId);
    this.logger.log(`[WebhookDriver] Deactivated: ${activationId.slice(0, 8)} (${entry.config.path})`);
  }

  deactivateAll(): void {
    for (const id of this.hooks.keys()) this.deactivate(id);
  }

  isHealthy(): boolean {
    return !!this.httpAdapterHost?.httpAdapter;
  }

  // ── Auth helpers ─────────────────────────────────────────────────────

  private _validateAuth(req: any, cfg: WebhookDriverConfig): boolean {
    const mode = cfg.authMode ?? 'none';
    if (mode === 'none') return true;

    if (mode === 'hmac') {
      if (!cfg.secret) return true; // no secret configured → pass
      const sig = req.headers['x-hub-signature-256'] as string | undefined;
      if (!sig) return false;
      const body = JSON.stringify(req.body ?? {});
      const expected = 'sha256=' + crypto
        .createHmac('sha256', cfg.secret)
        .update(body)
        .digest('hex');
      return crypto.timingSafeEqual(
        Buffer.from(sig),
        Buffer.from(expected),
      );
    }

    if (mode === 'bearer') {
      const auth = req.headers['authorization'] as string | undefined;
      if (!auth?.startsWith('Bearer ')) return false;
      const token = auth.slice(7);
      return !!cfg.secret && token === cfg.secret;
    }

    return true;
  }
}
