/**
 * Modbus Bridge Trigger Driver
 *
 * HTTP inbound bridge for the Rust Modbus agent.
 *
 * ARCHITECTURE:
 *   Rust agent (modbus-agent binary)
 *     ─── reads registers via Modbus TCP/RTU ───▶
 *     normalizes to EyeFlow envelope ───▶
 *     POST /_eyeflow/bridge/modbus   (localhost or internal network)
 *
 * This driver registers a dynamic POST route and emits a TriggerEvent
 * for each event pushed by the Rust agent.
 *
 * WHY NOT MODBUS DIRECTLY IN NODE.JS?
 *   Modbus TCP/RTU with sub-ms polling & deterministic timing requires
 *   a native Rust/C runtime. The Rust agent handles the protocol natively
 *   and translates to this HTTP bridge.
 *
 * Supported tiers: CENTRAL, LINUX
 *
 * Config shape:
 * {
 *   bridgePath?  : string   — HTTP path (default: "/_eyeflow/bridge/modbus")
 *   secret?      : string   — Bearer token the Rust agent must send
 *   deviceFilter?: string[] — only accept events from these Modbus device IDs
 *   registerTypes?: string[] — filter: ['coil','discrete_input','holding','input']
 * }
 *
 * Rust agent POST payload:
 * {
 *   deviceId     : string   — e.g. "slave_01"
 *   registerType : "coil" | "discrete_input" | "holding" | "input"
 *   address      : number   — register address
 *   value        : number | boolean | number[]
 *   quality      : "good" | "bad" | "uncertain"
 *   timestamp    : string   — ISO 8601
 *   meta?        : object   — extra context from the Rust agent
 * }
 */

import { Injectable, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import {
  ITriggerDriver,
  TriggerEvent,
} from '../interfaces/trigger-driver.interface';
import { NodeTier } from '../../nodes/interfaces/node-capability.interface';

const DEFAULT_PATH = '/_eyeflow/bridge/modbus';

interface ModbusDriverConfig {
  bridgePath?: string;
  secret?: string;
  deviceFilter?: string[];
  registerTypes?: string[];
}

interface BridgeActivation {
  subject: Subject<TriggerEvent>;
  stop$: Subject<void>;
  config: ModbusDriverConfig;
  workflowId: string;
  version: number;
}

@Injectable()
export class ModbusBridgeTriggerDriver implements ITriggerDriver {
  readonly driverId    = 'modbus-bridge';
  readonly displayName = 'Modbus Bridge Trigger (via Rust agent)';
  readonly supportedTiers: NodeTier[] = [NodeTier.CENTRAL, NodeTier.LINUX];
  readonly configSchema = {
    bridgePath:    { type: 'string',  required: false, default: DEFAULT_PATH },
    secret:        { type: 'string',  required: false, secret: true, description: 'Bearer token' },
    deviceFilter:  { type: 'array',   required: false, items: { type: 'string' } },
    registerTypes: { type: 'array',   required: false, items: { type: 'string' } },
  };
  readonly requiredProtocols = ['HTTP'];

  private readonly logger = new Logger(ModbusBridgeTriggerDriver.name);
  /** activationId → activation */
  private readonly activations = new Map<string, BridgeActivation>();
  /** bridgePath → set of activationIds listening on that path */
  private readonly pathSubscribers = new Map<string, Set<string>>();
  /** Tracks if the HTTP route is already registered for a given path */
  private readonly registeredPaths = new Set<string>();

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  activate(
    activationId: string,
    config: Record<string, any>,
    workflowId: string,
    version: number,
  ): Observable<TriggerEvent> {
    const cfg = config as ModbusDriverConfig;
    const bridgePath = cfg.bridgePath ?? DEFAULT_PATH;

    const subject = new Subject<TriggerEvent>();
    const stop$ = new Subject<void>();

    const activation: BridgeActivation = { subject, stop$, config: cfg, workflowId, version };
    this.activations.set(activationId, activation);

    // Add to path subscribers
    if (!this.pathSubscribers.has(bridgePath)) {
      this.pathSubscribers.set(bridgePath, new Set());
    }
    this.pathSubscribers.get(bridgePath)!.add(activationId);

    // Register HTTP route only once per path
    if (!this.registeredPaths.has(bridgePath)) {
      this.registerRoute(bridgePath);
    }

    this.logger.log(
      `[ModbusBridge] Activation ${activationId.slice(0, 8)} listening on POST ${bridgePath}`,
    );

    return subject.asObservable().pipe(takeUntil(stop$));
  }

  private registerRoute(bridgePath: string): void {
    const adapter = this.httpAdapterHost?.httpAdapter;
    if (!adapter) {
      this.logger.warn('[ModbusBridge] HttpAdapter not available — bridge not registered');
      return;
    }

    (adapter as any).post?.(bridgePath, (req: any, res: any) => {
      const subscribers = this.pathSubscribers.get(bridgePath);
      if (!subscribers?.size) {
        res.status(503).send({ ok: false, reason: 'no_active_subscriptions' });
        return;
      }

      const body = req.body ?? {};

      for (const activationId of subscribers) {
        const activation = this.activations.get(activationId);
        if (!activation) continue;

        // Auth check
        if (activation.config.secret) {
          const auth = req.headers['authorization'] as string | undefined;
          const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
          if (token !== activation.config.secret) {
            this.logger.warn(`[ModbusBridge] Auth failed for ${activationId.slice(0, 8)}`);
            continue;
          }
        }

        // Device filter
        if (activation.config.deviceFilter?.length) {
          if (!activation.config.deviceFilter.includes(body.deviceId)) continue;
        }

        // Register type filter
        if (activation.config.registerTypes?.length) {
          if (!activation.config.registerTypes.includes(body.registerType)) continue;
        }

        const event: TriggerEvent = {
          eventId:         uuidv4(),
          occurredAt:      body.timestamp ?? new Date().toISOString(),
          driverId:        this.driverId,
          workflowId:      activation.workflowId,
          workflowVersion: activation.version,
          payload:         body,
          source: {
            deviceId:     body.deviceId,
            registerType: body.registerType,
            address:      body.address,
            quality:      body.quality ?? 'good',
            bridge:       'modbus-rust-agent',
          },
        };

        activation.subject.next(event);
      }

      res.status(200).send({ ok: true, received: true });
    });

    this.registeredPaths.add(bridgePath);
    this.logger.log(`[ModbusBridge] POST ${bridgePath} registered`);
  }

  deactivate(activationId: string): void {
    const activation = this.activations.get(activationId);
    if (!activation) return;

    const bridgePath = activation.config.bridgePath ?? DEFAULT_PATH;
    this.pathSubscribers.get(bridgePath)?.delete(activationId);

    activation.stop$.next();
    activation.stop$.complete();
    activation.subject.complete();
    this.activations.delete(activationId);
    this.logger.log(`[ModbusBridge] Deactivated: ${activationId.slice(0, 8)}`);
  }

  deactivateAll(): void {
    for (const id of [...this.activations.keys()]) this.deactivate(id);
  }

  isHealthy(): boolean {
    return !!this.httpAdapterHost?.httpAdapter;
  }
}
