/**
 * System Signal Trigger Driver
 *
 * Listens to OS process signals (SIGTERM, SIGINT, SIGHUP, SIGUSR1, SIGUSR2, etc.)
 * and emits a TriggerEvent for each one received.
 *
 * Use-cases:
 *  – Graceful shutdown choreography (trigger cleanup pipeline on SIGTERM)
 *  – On-demand diagnostics (SIGUSR1 → dump stats pipeline)
 *  – Config reload (SIGHUP → reload connectors pipeline)
 *  – Container orchestration hooks (Kubernetes SIGTERM before pod killed)
 *
 * Supported tiers: CENTRAL, LINUX
 *
 * Config shape:
 * {
 *   signals   : string[]   — default ['SIGTERM', 'SIGINT']
 *                            Supported: SIGTERM, SIGINT, SIGHUP, SIGUSR1, SIGUSR2
 *   once?     : boolean    — emit once then deactivate? (default false)
 * }
 *
 * IMPORTANT:
 *  – Only one activation per signal at a time is safe.
 *  – On SIGTERM/SIGINT: the pipeline runs, THEN Node exits normally.
 *    Set `once: true` to deactivate after first signal.
 *  – Registering process.exit() inside the pipeline is the caller's responsibility.
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

const SUPPORTED_SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGUSR1', 'SIGUSR2'] as const;
type SupportedSignal = typeof SUPPORTED_SIGNALS[number];

interface SignalDriverConfig {
  signals?: SupportedSignal[];
  once?: boolean;
}

interface SignalActivation {
  stop$: Subject<void>;
  subject: Subject<TriggerEvent>;
  handlers: Array<{ signal: SupportedSignal; handler: () => void }>;
}

@Injectable()
export class SignalTriggerDriver implements ITriggerDriver {
  readonly driverId    = 'signal';
  readonly displayName = 'System Signal Trigger (SIGTERM / SIGINT / SIGHUP …)';
  readonly supportedTiers: NodeTier[] = [NodeTier.CENTRAL, NodeTier.LINUX];
  readonly configSchema = {
    signals: {
      type: 'array',
      required: false,
      items: { type: 'string', enum: [...SUPPORTED_SIGNALS] },
      default: ['SIGTERM', 'SIGINT'],
      description: 'OS signals to listen for',
    },
    once: {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Deactivate after first signal received',
    },
  };
  readonly requiredProtocols: string[] = [];

  private readonly logger = new Logger(SignalTriggerDriver.name);
  private readonly activations = new Map<string, SignalActivation>();

  /** Global: track which signals are already registered to avoid double-attach */
  private readonly signalOwners = new Map<SupportedSignal, string>(); // signal → activationId

  activate(
    activationId: string,
    config: Record<string, any>,
    workflowId: string,
    version: number,
  ): Observable<TriggerEvent> {
    const cfg = config as SignalDriverConfig;
    const requestedSignals = (cfg.signals ?? ['SIGTERM', 'SIGINT'])
      .filter((s): s is SupportedSignal => SUPPORTED_SIGNALS.includes(s as SupportedSignal));

    const stop$ = new Subject<void>();
    const subject = new Subject<TriggerEvent>();
    const handlers: SignalActivation['handlers'] = [];

    for (const signal of requestedSignals) {
      if (this.signalOwners.has(signal)) {
        this.logger.warn(
          `[Signal] Signal "${signal}" already owned by activation ` +
          `"${this.signalOwners.get(signal)}" — skipping to avoid double-bind`,
        );
        continue;
      }

      const handler = () => {
        this.logger.log(`[Signal] Received ${signal} → emitting TriggerEvent`);

        subject.next({
          eventId:         uuidv4(),
          occurredAt:      new Date().toISOString(),
          driverId:        this.driverId,
          workflowId,
          workflowVersion: version,
          payload:         { signal, pid: process.pid, hostname: process.env.HOSTNAME ?? 'unknown' },
          source:          { signal, actor: 'os' },
        });

        if (cfg.once) {
          this.logger.log(`[Signal] once=true → deactivating after ${signal}`);
          // Schedule deactivation after current call stack
          setImmediate(() => this.deactivate(activationId));
        }
      };

      process.on(signal, handler);
      this.signalOwners.set(signal, activationId);
      handlers.push({ signal, handler });

      this.logger.log(
        `[Signal] Listening for ${signal} (activation ${activationId.slice(0, 8)})`,
      );
    }

    const activation: SignalActivation = { stop$, subject, handlers };
    this.activations.set(activationId, activation);

    return subject.asObservable().pipe(takeUntil(stop$));
  }

  deactivate(activationId: string): void {
    const activation = this.activations.get(activationId);
    if (!activation) return;

    // Remove signal handlers
    for (const { signal, handler } of activation.handlers) {
      process.off(signal, handler);
      this.signalOwners.delete(signal);
      this.logger.log(`[Signal] Unregistered handler for ${signal}`);
    }

    activation.stop$.next();
    activation.stop$.complete();
    activation.subject.complete();
    this.activations.delete(activationId);
  }

  deactivateAll(): void {
    for (const id of [...this.activations.keys()]) this.deactivate(id);
  }

  isHealthy(): boolean {
    return true;
  }
}
