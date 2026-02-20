/**
 * OPC-UA Bridge Trigger Driver
 *
 * HTTP inbound bridge for the Rust OPC-UA agent.
 *
 * ARCHITECTURE:
 *   Rust agent (opcua-agent binary)
 *     ─── subscribes to OPC-UA server node changes (MonitoredItem) ───▶
 *     normalizes to EyeFlow envelope ───▶
 *     POST /_eyeflow/bridge/opcua   (localhost or internal network)
 *
 * WHY NOT OPC-UA DIRECTLY IN NODE.JS?
 *   The `node-opcua` package is heavy (~40MB) and has C++ native bindings
 *   that are fragile in containerized environments.  The Rust agent uses the
 *   `open62541` / `opcua` Rust crate for reliable, spec-compliant OPC-UA
 *   and translates subscription data changes to this HTTP bridge.
 *
 * Supported tiers: CENTRAL, LINUX
 *
 * Config shape:
 * {
 *   bridgePath?  : string    — HTTP path (default: "/_eyeflow/bridge/opcua")
 *   secret?      : string    — Bearer token the Rust agent must send
 *   nodeFilter?  : string[]  — accept only these OPC-UA NodeIds (e.g. "ns=2;i=1001")
 *   statusFilter?: string[]  — only emit when statusCode matches (default: ['Good'])
 * }
 *
 * Rust agent POST payload:
 * {
 *   nodeId          : string   — OPC-UA NodeId, e.g. "ns=2;i=1001"
 *   displayName?    : string   — human-readable name of the node
 *   value           : any      — data value (number, boolean, string, array)
 *   dataType?       : string   — OPC-UA DataType name
 *   statusCode      : string   — "Good" | "Bad" | "Uncertain" | "BadNoData" | ...
 *   sourceTimestamp : string   — ISO 8601 from the data source
 *   serverTimestamp : string   — ISO 8601 from the OPC-UA server
 *   serverUri?      : string   — OPC-UA server endpoint URI
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

const DEFAULT_PATH = '/_eyeflow/bridge/opcua';
const DEFAULT_STATUS_FILTER = ['Good'];

interface OpcUaDriverConfig {
  bridgePath?: string;
  secret?: string;
  nodeFilter?: string[];
  statusFilter?: string[];
}

interface BridgeActivation {
  subject: Subject<TriggerEvent>;
  stop$: Subject<void>;
  config: OpcUaDriverConfig;
  workflowId: string;
  version: number;
}

@Injectable()
export class OpcUaBridgeTriggerDriver implements ITriggerDriver {
  readonly driverId    = 'opcua-bridge';
  readonly displayName = 'OPC-UA Bridge Trigger (via Rust agent)';
  readonly supportedTiers: NodeTier[] = [NodeTier.CENTRAL, NodeTier.LINUX];
  readonly configSchema = {
    bridgePath:   { type: 'string', required: false, default: DEFAULT_PATH },
    secret:       { type: 'string', required: false, secret: true },
    nodeFilter:   { type: 'array',  required: false, items: { type: 'string' }, description: 'OPC-UA NodeIds to accept' },
    statusFilter: { type: 'array',  required: false, items: { type: 'string' }, default: ['Good'] },
  };
  readonly requiredProtocols = ['HTTP'];

  private readonly logger = new Logger(OpcUaBridgeTriggerDriver.name);
  private readonly activations = new Map<string, BridgeActivation>();
  private readonly pathSubscribers = new Map<string, Set<string>>();
  private readonly registeredPaths = new Set<string>();

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  activate(
    activationId: string,
    config: Record<string, any>,
    workflowId: string,
    version: number,
  ): Observable<TriggerEvent> {
    const cfg = config as OpcUaDriverConfig;
    const bridgePath = cfg.bridgePath ?? DEFAULT_PATH;

    const subject = new Subject<TriggerEvent>();
    const stop$ = new Subject<void>();

    const activation: BridgeActivation = { subject, stop$, config: cfg, workflowId, version };
    this.activations.set(activationId, activation);

    if (!this.pathSubscribers.has(bridgePath)) {
      this.pathSubscribers.set(bridgePath, new Set());
    }
    this.pathSubscribers.get(bridgePath)!.add(activationId);

    if (!this.registeredPaths.has(bridgePath)) {
      this.registerRoute(bridgePath);
    }

    this.logger.log(
      `[OpcUaBridge] Activation ${activationId.slice(0, 8)} listening on POST ${bridgePath}`,
    );

    return subject.asObservable().pipe(takeUntil(stop$));
  }

  private registerRoute(bridgePath: string): void {
    const adapter = this.httpAdapterHost?.httpAdapter;
    if (!adapter) {
      this.logger.warn('[OpcUaBridge] HttpAdapter not available — bridge not registered');
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
            this.logger.warn(`[OpcUaBridge] Auth failed for ${activationId.slice(0, 8)}`);
            continue;
          }
        }

        // NodeId filter
        if (activation.config.nodeFilter?.length) {
          if (!activation.config.nodeFilter.includes(body.nodeId)) continue;
        }

        // Status code filter (default: only "Good" values)
        const allowedStatus = activation.config.statusFilter ?? DEFAULT_STATUS_FILTER;
        if (!allowedStatus.some(s => (body.statusCode ?? 'Good').startsWith(s))) continue;

        const event: TriggerEvent = {
          eventId:         uuidv4(),
          occurredAt:      body.sourceTimestamp ?? body.serverTimestamp ?? new Date().toISOString(),
          driverId:        this.driverId,
          workflowId:      activation.workflowId,
          workflowVersion: activation.version,
          payload:         body,
          source: {
            nodeId:          body.nodeId,
            displayName:     body.displayName,
            statusCode:      body.statusCode,
            serverUri:       body.serverUri,
            serverTimestamp: body.serverTimestamp,
            bridge:          'opcua-rust-agent',
          },
        };

        activation.subject.next(event);
      }

      res.status(200).send({ ok: true, received: true });
    });

    this.registeredPaths.add(bridgePath);
    this.logger.log(`[OpcUaBridge] POST ${bridgePath} registered`);
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
    this.logger.log(`[OpcUaBridge] Deactivated: ${activationId.slice(0, 8)}`);
  }

  deactivateAll(): void {
    for (const id of [...this.activations.keys()]) this.deactivate(id);
  }

  isHealthy(): boolean {
    return !!this.httpAdapterHost?.httpAdapter;
  }
}
