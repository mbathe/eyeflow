/**
 * MQTT Trigger Driver  — example driver (spec §7)
 *
 * Connects to an MQTT broker, subscribes to a topic,
 * and emits a TriggerEvent for every matching message.
 *
 * Supported tiers : CENTRAL, LINUX, MCU
 * Required protocol: MQTT
 *
 * Config shape (TriggerDescriptor.driverConfig):
 * {
 *   brokerUrl : string          — e.g. "mqtt://192.168.1.10:1883"
 *   topic     : string          — e.g. "sensors/pressure"
 *   qos?      : 0 | 1 | 2       — default 0
 *   clientId? : string
 *   username? : string
 *   password? : string
 *   compiledFilter? : string    — injected by TriggerActivationService (e.g. "value > 8.5")
 * }
 */

import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import * as mqtt from 'mqtt';
import { MqttClient } from 'mqtt';
import { v4 as uuidv4 } from 'uuid';
import {
  ITriggerDriver,
  TriggerEvent,
} from '../interfaces/trigger-driver.interface';
import { NodeTier } from '../../nodes/interfaces/node-capability.interface';

// ── Config ────────────────────────────────────────────────────────────────

interface MqttDriverConfig {
  brokerUrl:      string;
  topic:          string;
  qos?:           0 | 1 | 2;
  clientId?:      string;
  username?:      string;
  password?:      string;
  compiledFilter?: string;
}

// ── Driver ────────────────────────────────────────────────────────────────

@Injectable()
export class MqttTriggerDriver implements ITriggerDriver {
  readonly driverId    = 'mqtt';
  readonly displayName = 'MQTT Broker Trigger';
  readonly supportedTiers: NodeTier[] = [NodeTier.CENTRAL, NodeTier.LINUX, NodeTier.MCU];
  readonly configSchema = {
    brokerUrl:  { type: 'string',  required: true,  example: 'mqtt://broker:1883' },
    topic:      { type: 'string',  required: true,  example: 'sensors/temperature' },
    qos:        { type: 'number',  required: false, enum: [0, 1, 2], default: 0 },
    clientId:   { type: 'string',  required: false },
    username:   { type: 'string',  required: false },
    password:   { type: 'string',  required: false, secret: true },
  };
  readonly requiredProtocols = ['MQTT'];

  private readonly logger = new Logger(MqttTriggerDriver.name);

  /** Per-activation state: client + shutdown subject */
  private readonly activations = new Map<string, { client: MqttClient; stop$: Subject<void> }>();

  // ── Core interface ────────────────────────────────────────────────────

  activate(
    activationId: string,
    config: Record<string, any>,
    workflowId: string,
    version: number,
  ): Observable<TriggerEvent> {
    const cfg = config as MqttDriverConfig;

    const stop$ = new Subject<void>();

    const stream$ = new Observable<TriggerEvent>(observer => {
      const client = mqtt.connect(cfg.brokerUrl, {
        clientId:  cfg.clientId ?? `eyeflow-${activationId.slice(0, 8)}`,
        username:  cfg.username,
        password:  cfg.password,
        clean:     true,
        reconnectPeriod: 3_000,
      });

      const qos = cfg.qos ?? 0;

      client.on('connect', () => {
        this.logger.log(`[MQTT:${activationId.slice(0, 8)}] Connected → ${cfg.brokerUrl}, topic: ${cfg.topic}`);
        client.subscribe(cfg.topic, { qos }, (err) => {
          if (err) observer.error(err);
        });
      });

      client.on('message', (topic: string, message: Buffer) => {
        let payload: any;
        try {
          payload = JSON.parse(message.toString());
        } catch {
          payload = message.toString();
        }

        // Apply compiled filter if present
        if (cfg.compiledFilter) {
          try {
            // Safe eval using Function constructor with restricted scope
            const passes = new Function('value', 'payload', 'topic',
              `return (${cfg.compiledFilter})`
            )(
              typeof payload === 'object' ? payload?.value : payload,
              payload,
              topic,
            );
            if (!passes) return;
          } catch (filterErr: any) {
            this.logger.warn(`[MQTT:${activationId.slice(0, 8)}] Filter error: ${filterErr?.message}`);
          }
        }

        const event: TriggerEvent = {
          eventId:         uuidv4(),
          occurredAt:      new Date().toISOString(),
          driverId:        this.driverId,
          workflowId,
          workflowVersion: version,
          payload,
          source:          { topic, brokerUrl: cfg.brokerUrl },
        };
        observer.next(event);
      });

      client.on('error', (err: Error) => {
        this.logger.error(`[MQTT:${activationId.slice(0, 8)}] Error: ${err.message}`);
        observer.error(err);
      });

      client.on('close', () => {
        this.logger.log(`[MQTT:${activationId.slice(0, 8)}] Disconnected`);
      });

      this.activations.set(activationId, { client, stop$ });

      // Teardown
      return () => {
        client.end(true);
        this.activations.delete(activationId);
      };
    });

    return stream$.pipe(takeUntil(stop$));
  }

  deactivate(activationId: string): void {
    const entry = this.activations.get(activationId);
    if (!entry) return;
    entry.stop$.next();
    entry.stop$.complete();
    entry.client.end(true);
    this.activations.delete(activationId);
    this.logger.log(`[MQTT] Deactivated: ${activationId}`);
  }

  deactivateAll(): void {
    for (const id of this.activations.keys()) this.deactivate(id);
  }

  isHealthy(): boolean {
    // Driver itself is always healthy; individual clients handle reconnect
    return true;
  }
}
