/**
 * WebSocket Trigger Driver
 *
 * Connects as a WebSocket CLIENT to an external WS server and emits a
 * TriggerEvent for every incoming message. Supports both plain WebSocket
 * (RFC 6455) and Socket.IO servers.
 *
 * Typical use-cases:
 *  – ESP32 / Raspberry Pi exposing a WS telemetry feed
 *  – SCADA system broadcasting sensor data over WS
 *  – Third-party SaaS with WS streaming API
 *
 * Supported tiers: CENTRAL, LINUX
 *
 * Config shape:
 * {
 *   url           : string          — e.g. "ws://192.168.1.42:8080/data"
 *   protocol?     : 'ws' | 'socketio'  — default 'ws'
 *   namespace?    : string          — Socket.IO namespace (protocol=socketio only)
 *   eventName?    : string          — Socket.IO event name to listen for (default 'message')
 *   reconnectMs?  : number          — reconnect delay after disconnect (default 3000)
 *   authToken?    : string          — Bearer token sent via headers (ws only)
 *   compiledFilter? : string        — JS expression: (payload) => bool
 * }
 */

import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import {
  ITriggerDriver,
  TriggerEvent,
} from '../interfaces/trigger-driver.interface';
import { NodeTier } from '../../nodes/interfaces/node-capability.interface';

// Dynamic imports — ws is a transitive dep of socket.io, always present
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WebSocketLib: typeof import('ws') = require('ws');

interface WsDriverConfig {
  url: string;
  protocol?: 'ws' | 'socketio';
  namespace?: string;
  eventName?: string;
  reconnectMs?: number;
  authToken?: string;
  compiledFilter?: string;
}

interface WsActivation {
  stop$: Subject<void>;
  subject: Subject<TriggerEvent>;
  reconnectHandle?: ReturnType<typeof setTimeout>;
}

@Injectable()
export class WebSocketTriggerDriver implements ITriggerDriver {
  readonly driverId    = 'websocket';
  readonly displayName = 'WebSocket Client Trigger';
  readonly supportedTiers: NodeTier[] = [NodeTier.CENTRAL, NodeTier.LINUX];
  readonly configSchema = {
    url:          { type: 'string',  required: true,  example: 'ws://broker:8080/feed' },
    protocol:     { type: 'string',  required: false, enum: ['ws', 'socketio'], default: 'ws' },
    namespace:    { type: 'string',  required: false, example: '/sensors' },
    eventName:    { type: 'string',  required: false, default: 'message' },
    reconnectMs:  { type: 'number',  required: false, default: 3000 },
    authToken:    { type: 'string',  required: false, secret: true },
  };
  readonly requiredProtocols = ['WS'];

  private readonly logger = new Logger(WebSocketTriggerDriver.name);
  private readonly activations = new Map<string, WsActivation>();

  activate(
    activationId: string,
    config: Record<string, any>,
    workflowId: string,
    version: number,
  ): Observable<TriggerEvent> {
    const cfg = config as WsDriverConfig;
    const subject = new Subject<TriggerEvent>();
    const stop$ = new Subject<void>();

    const activation: WsActivation = { stop$, subject };
    this.activations.set(activationId, activation);

    const protocol = cfg.protocol ?? 'ws';

    if (protocol === 'socketio') {
      this.connectSocketIO(activationId, cfg, workflowId, version, activation);
    } else {
      this.connectRawWs(activationId, cfg, workflowId, version, activation);
    }

    return subject.asObservable().pipe(takeUntil(stop$));
  }

  // ── Raw WebSocket (RFC 6455) ───────────────────────────────────────────

  private connectRawWs(
    activationId: string,
    cfg: WsDriverConfig,
    workflowId: string,
    version: number,
    activation: WsActivation,
  ): void {
    const short = activationId.slice(0, 8);
    const headers: Record<string, string> = {};
    if (cfg.authToken) headers['Authorization'] = `Bearer ${cfg.authToken}`;

    let ws: import('ws');
    try {
      ws = new (WebSocketLib as any)(cfg.url, { headers });
    } catch (err: any) {
      this.logger.error(`[WS:${short}] Failed to connect to ${cfg.url}: ${err.message}`);
      return;
    }

    ws.on('open', () => {
      this.logger.log(`[WS:${short}] Connected → ${cfg.url}`);
    });

    ws.on('message', (raw: Buffer | string) => {
      let payload: unknown;
      try {
        payload = JSON.parse(raw.toString());
      } catch {
        payload = raw.toString();
      }

      if (cfg.compiledFilter) {
        try {
          // eslint-disable-next-line no-new-func
          const passes = new Function('payload', `return (${cfg.compiledFilter})`)(payload);
          if (!passes) return;
        } catch (e: any) {
          this.logger.warn(`[WS:${short}] Filter error: ${e.message}`);
        }
      }

      activation.subject.next({
        eventId:         uuidv4(),
        occurredAt:      new Date().toISOString(),
        driverId:        this.driverId,
        workflowId,
        workflowVersion: version,
        payload:         payload as Record<string, any>,
        source:          { url: cfg.url, protocol: 'ws' },
      });
    });

    ws.on('error', (err: Error) => {
      this.logger.warn(`[WS:${short}] Error: ${err.message}`);
    });

    ws.on('close', () => {
      this.logger.log(`[WS:${short}] Disconnected — reconnecting in ${cfg.reconnectMs ?? 3000}ms`);
      if (!activation.stop$.isStopped) {
        activation.reconnectHandle = setTimeout(() => {
          this.connectRawWs(activationId, cfg, workflowId, version, activation);
        }, cfg.reconnectMs ?? 3000);
      }
    });

    // Store ws reference for teardown
    (activation as any)._ws = ws;
  }

  // ── Socket.IO client ──────────────────────────────────────────────────

  private connectSocketIO(
    activationId: string,
    cfg: WsDriverConfig,
    workflowId: string,
    version: number,
    activation: WsActivation,
  ): void {
    const short = activationId.slice(0, 8);
    // Dynamic import of socket.io-client (available in package.json)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { io } = require('socket.io-client');
    const url = cfg.namespace ? `${cfg.url}${cfg.namespace}` : cfg.url;

    const socket = io(url, {
      reconnection: true,
      reconnectionDelay: cfg.reconnectMs ?? 3000,
      auth: cfg.authToken ? { token: cfg.authToken } : undefined,
    });

    const eventName = cfg.eventName ?? 'message';

    socket.on('connect', () => {
      this.logger.log(`[WS/sio:${short}] Connected → ${url} (event: "${eventName}")`);
    });

    socket.on(eventName, (payload: unknown) => {
      if (cfg.compiledFilter) {
        try {
          // eslint-disable-next-line no-new-func
          const passes = new Function('payload', `return (${cfg.compiledFilter})`)(payload);
          if (!passes) return;
        } catch (e: any) {
          this.logger.warn(`[WS/sio:${short}] Filter error: ${e.message}`);
        }
      }

      activation.subject.next({
        eventId:         uuidv4(),
        occurredAt:      new Date().toISOString(),
        driverId:        this.driverId,
        workflowId,
        workflowVersion: version,
        payload:         payload as Record<string, any>,
        source:          { url, protocol: 'socketio', eventName },
      });
    });

    socket.on('disconnect', (reason: string) => {
      this.logger.log(`[WS/sio:${short}] Disconnected: ${reason}`);
    });

    socket.on('connect_error', (err: Error) => {
      this.logger.warn(`[WS/sio:${short}] Connection error: ${err.message}`);
    });

    (activation as any)._socket = socket;
  }

  deactivate(activationId: string): void {
    const activation = this.activations.get(activationId);
    if (!activation) return;

    clearTimeout(activation.reconnectHandle);
    activation.stop$.next();
    activation.stop$.complete();
    activation.subject.complete();

    (activation as any)._ws?.terminate?.();
    (activation as any)._socket?.disconnect?.();

    this.activations.delete(activationId);
    this.logger.log(`[WS] Deactivated: ${activationId.slice(0, 8)}`);
  }

  deactivateAll(): void {
    for (const id of this.activations.keys()) this.deactivate(id);
  }

  isHealthy(): boolean {
    return true;
  }
}
