/**
 * Trigger Bus Service — spec §7
 *
 * The central nervous system of the event dispatch pipeline.
 *
 * ROLE:
 *   Receives TriggerEvents from all active ITriggerDrivers (local + remote),
 *   routes them to the correct workflow execution via RxJS pipelines,
 *   and provides a unified Observable interface.
 *
 * DESIGN (RxJS):
 *   Each active driver activation contributes a stream.
 *   The bus merges all streams via RxJS merge().
 *   Consumers subscribe to bus.events$(workflowId) to receive only
 *   events relevant to their workflow.
 *
 *   stream_1 (mqtt — workflow A) ──┐
 *   stream_2 (cron — workflow B) ──┼── merge() ──► bus.allEvents$
 *   stream_3 (fs   — workflow A) ──┘                    │
 *                                               routeToWorkflow()
 *                                                        │
 *                                            ┌───────────┴────────────┐
 *                                         workflow A               workflow B
 *                                         SVM.execute()            SVM.execute()
 */

import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  Subject,
  Observable,
  merge,
  EMPTY,
  Subscription,
} from 'rxjs';
import {
  filter,
  share,
  debounceTime,
  takeUntil,
  tap,
} from 'rxjs/operators';
import { TriggerEvent } from './interfaces/trigger-driver.interface';

// ── Types ──────────────────────────────────────────────────────────────────

export type WorkflowDispatcher = (event: TriggerEvent) => Promise<void>;

// ── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class TriggerBusService implements OnModuleDestroy {
  private readonly logger = new Logger(TriggerBusService.name);

  /** Shutdown signal — all streams complete when this emits */
  private readonly shutdown$ = new Subject<void>();

  /**
   * Subject that aggregates events from all active driver streams.
   * Drivers push events here via the addStream() method.
   */
  private readonly eventSubject$ = new Subject<TriggerEvent>();

  /**
   * Shared hot observable — all consumers share one subscription.
   * Using share() so multiple consumers don't cause duplicate subscriptions.
   */
  readonly allEvents$: Observable<TriggerEvent> = this.eventSubject$.pipe(
    takeUntil(this.shutdown$),
    share(),
  );

  /**
   * Map workflowId → registered dispatcher function.
   * Dispatchers are registered by LLMProjectExecutionService.
   */
  private dispatchers = new Map<string, WorkflowDispatcher>();

  /**
   * Active stream subscriptions indexed by activationId.
   * Stored so we can cancel a specific activation without stopping others.
   */
  private activeStreams = new Map<string, Subscription>();

  /** Master subscription — routes allEvents$ to dispatchers */
  private masterSub?: Subscription;

  constructor() {
    this.masterSub = this.allEvents$.subscribe(event => {
      this._dispatch(event);
    });
  }

  // ── Stream management ──────────────────────────────────────────────────

  /**
   * Register a driver-emitted Observable into the bus.
   * Called by TriggerActivationService when a driver is activated.
   *
   * @param activationId  Unique activation ID — used to remove the stream later
   * @param stream$       Observable from ITriggerDriver.activate()
   * @param debounceMs    Optional debounce — prevents duplicate dispatches
   */
  addStream(
    activationId: string,
    stream$: Observable<TriggerEvent>,
    debounceMs = 0,
  ): void {
    if (this.activeStreams.has(activationId)) {
      this.logger.warn(`[TriggerBus] Stream ${activationId} already registered — replacing`);
      this.removeStream(activationId);
    }

    const pipedStream$ = debounceMs > 0
      ? stream$.pipe(
          debounceTime(debounceMs),
          takeUntil(this.shutdown$),
          tap(e => this.logger.debug(`[TriggerBus] Event from ${e.driverId} → workflow ${e.workflowId}`)),
        )
      : stream$.pipe(
          takeUntil(this.shutdown$),
          tap(e => this.logger.debug(`[TriggerBus] Event from ${e.driverId} → workflow ${e.workflowId}`)),
        );

    const sub = pipedStream$.subscribe({
      next:     ev => this.eventSubject$.next(ev),
      error:    err => this.logger.error(`[TriggerBus] Stream ${activationId} error: ${err?.message}`),
      complete: ()  => this.logger.log(`[TriggerBus] Stream ${activationId} completed`),
    });

    this.activeStreams.set(activationId, sub);
    this.logger.log(`[TriggerBus] Stream added: ${activationId} (total active: ${this.activeStreams.size})`);
  }

  /**
   * Remove a specific driver stream from the bus.
   * Called by TriggerActivationService.deactivate().
   */
  removeStream(activationId: string): void {
    const sub = this.activeStreams.get(activationId);
    if (sub) {
      sub.unsubscribe();
      this.activeStreams.delete(activationId);
      this.logger.log(`[TriggerBus] Stream removed: ${activationId} (remaining: ${this.activeStreams.size})`);
    }
  }

  // ── Dispatcher registration ────────────────────────────────────────────

  /**
   * Register a workflow dispatcher.
   * When an event arrives for workflowId, this function is called.
   *
   * Called by LLMProjectExecutionService or TasksService when a workflow
   * with compiled TRIGGER instructions is activated.
   */
  registerDispatcher(workflowId: string, dispatcher: WorkflowDispatcher): void {
    this.dispatchers.set(workflowId, dispatcher);
    this.logger.log(`[TriggerBus] Dispatcher registered for workflow: ${workflowId}`);
  }

  /**
   * Unregister a workflow dispatcher (on workflow deactivation / archival).
   */
  unregisterDispatcher(workflowId: string): void {
    this.dispatchers.delete(workflowId);
    this.logger.log(`[TriggerBus] Dispatcher unregistered for workflow: ${workflowId}`);
  }

  // ── Scoped observable ──────────────────────────────────────────────────

  /**
   * Returns an Observable scoped to a specific workflowId.
   * Consumers that prefer subscribing themselves (e.g. tests, dashboards).
   */
  events$(workflowId: string): Observable<TriggerEvent> {
    return this.allEvents$.pipe(
      filter(ev => ev.workflowId === workflowId),
    );
  }

  // ── Status ─────────────────────────────────────────────────────────────

  /** Number of currently active driver streams */
  get activeStreamCount(): number {
    return this.activeStreams.size;
  }

  /** List of currently active activation IDs */
  getActiveActivationIds(): string[] {
    return Array.from(this.activeStreams.keys());
  }

  /** List of registered workflow IDs */
  getRegisteredWorkflowIds(): string[] {
    return Array.from(this.dispatchers.keys());
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  onModuleDestroy(): void {
    this.logger.log('[TriggerBus] Shutting down — unsubscribing all streams');
    this.shutdown$.next();
    this.shutdown$.complete();
    this.masterSub?.unsubscribe();
    this.activeStreams.forEach(s => s.unsubscribe());
    this.activeStreams.clear();
  }

  // ── Private dispatch ───────────────────────────────────────────────────

  private _dispatch(event: TriggerEvent): void {
    const dispatcher = this.dispatchers.get(event.workflowId);
    if (!dispatcher) {
      this.logger.warn(
        `[TriggerBus] No dispatcher for workflow ${event.workflowId} ` +
        `(driver: ${event.driverId}) — event dropped`,
      );
      return;
    }

    dispatcher(event).catch(err => {
      this.logger.error(
        `[TriggerBus] Dispatcher error for workflow ${event.workflowId}: ${err?.message}`,
      );
    });
  }
}
