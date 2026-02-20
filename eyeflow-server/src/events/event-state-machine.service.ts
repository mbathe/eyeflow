/**
 * EventStateMachineService
 *
 * Runtime executor for compiled EventStateMachine IR instructions.
 *
 * This service is the deterministic heart of the distributed event-state
 * architecture.  It:
 *   1. Receives compiled EventStateMachineDescriptors at workflow deployment time
 *   2. Subscribes to TriggerBusService.allEvents$ for raw sensor/driver events
 *   3. For each incoming event, evaluates all active FSM instances against their
 *      compiled transition guards (WITHIN_WINDOW, ALWAYS)
 *   4. When a transition fires: executes on-entry actions synchronously
 *   5. On FULL_MATCH: builds an enriched PropagatedEvent and routes it to
 *      PropagatedEventService (which runs the HANDLE_PROPAGATED handler actions)
 *   6. For FSMs assigned to edge nodes: pushes the descriptor via
 *      PropagatedEventService.dispatchRemoteCommand('deploy_fsm')
 *
 * INVARIANTS (maintained at all times):
 *  – Zero runtime LLM calls.  All decisions are deterministic transitions.
 *  – State changes are synchronous; event processing is serial per instance.
 *  – A window timer firing always transitions to the expiredState then RESET.
 *  – FULL_MATCH always cancels the window timer before emitting PropagatedEvent.
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Subscription } from 'rxjs';
import * as crypto from 'crypto';

import {
  EventStateMachineDescriptor,
  EventTransition,
  ESMEntryAction,
  ESMEntryActionType,
  ActuatorControlParams,
  SamplingRateParams,
  PropagationConfig,
  PropagatedEvent,
  FsmRuntimeState,
  ConditionDescriptor,
  ConditionType,
  ComparisonOperator,
  LLMCallActionDescriptor,
  MLScoreCallDescriptor,
  CRMQueryDescriptor,
  HumanApprovalGateDescriptor,
  ParallelFetchDescriptor,
} from '../compiler/interfaces/event-state-machine.interface';
import { TriggerBusService } from '../triggers/trigger-bus.service';
import { TriggerEvent } from '../triggers/interfaces/trigger-driver.interface';
import { EventCorrelationService } from './event-correlation.service';
import { PropagatedEventService } from './propagated-event.service';
import { HumanApprovalService } from './human-approval.service';
import { ExpressionSandboxService } from './expression-sandbox.service';
import { FsmStateRepository } from './fsm-state.repository';
import { CENTRAL_NODE_ID } from '../nodes/interfaces/node-capability.interface';

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

/** Registry entry: descriptor registered at workflow deployment */
interface DeployedFsm {
  workflowId: string;
  descriptor: EventStateMachineDescriptor;
  /** Active running instances (one per trigger event that starts a new evaluation) */
  instances: Map<string, FsmRuntimeState>;
}

@Injectable()
export class EventStateMachineService implements OnModuleDestroy {
  private readonly logger = new Logger(EventStateMachineService.name);

  /** All deployed FSM descriptors, keyed by machineId */
  private readonly deployed = new Map<string, DeployedFsm>();

  /** RxJS subscription to TriggerBusService.allEvents$ */
  private eventSubscription?: Subscription;

  constructor(
    private readonly bus: TriggerBusService,
    private readonly correlation: EventCorrelationService,
    private readonly propagatedEventService: PropagatedEventService,
    private readonly approvalService: HumanApprovalService,
    private readonly sandbox: ExpressionSandboxService,
    private readonly fsmStateRepo: FsmStateRepository,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Call this after all workflow FSMs are registered to start the event loop.
   * (Called automatically by EventsModule on application bootstrap, or manually
   * in tests)
   */
  startListening(): void {
    if (this.eventSubscription) return; // already listening
    this.eventSubscription = this.bus.allEvents$.subscribe(event => {
      this.handleIncomingEvent(event).catch(err =>
        this.logger.error(`[ESM] Unhandled error in event processing: ${err.message}`, err.stack),
      );
    });
    this.logger.log('[ESM] Subscribed to TriggerBusService.allEvents$');

    // Also consume human approval decision events (fired by HumanApprovalService.resolve())
    // These arrive as synthetic TriggerEvents with driverId='human_approval' and are
    // evaluated by the same HUMAN_APPROVAL ConditionDescriptors as any other event.
    this.approvalService.approvalEvents$.subscribe(approvalEvent => {
      this.handleIncomingEvent(approvalEvent).catch(err =>
        this.logger.error(
          `[ESM] Error processing human approval event: ${err.message}`,
          err.stack,
        ),
      );
    });
    this.logger.log('[ESM] Subscribed to HumanApprovalService.approvalEvents$');
  }

  onModuleDestroy(): void {
    this.eventSubscription?.unsubscribe();
    this.correlation.cancelAll();
    this.logger.log('[ESM] Stopped — all active FSM windows cancelled');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Deployment (called at workflow compile/activation time)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Register and deploy a compiled EventStateMachineDescriptor.
   * If the FSM targets an edge node (targetNodeId !== CENTRAL), the descriptor
   * is pushed to that node via a 'deploy_fsm' REMOTE_COMMAND.
   * If it targets CENTRAL, it runs in this service.
   */
  async deployFsm(workflowId: string, descriptor: EventStateMachineDescriptor): Promise<void> {
    const { machineId, targetNodeId } = descriptor;

    // ── Edge node deployment ──────────────────────────────────────────────
    if (targetNodeId && targetNodeId !== CENTRAL_NODE_ID) {
      this.logger.log(
        `[ESM] Pushing FSM "${machineId}" to edge node "${targetNodeId}" via remote_command`,
      );
      await this.propagatedEventService.dispatchRemoteCommand({
        commandId: `deploy_fsm_${machineId}`,
        targetNodeId,
        command: 'deploy_fsm',
        params: {},
        deployFsm: descriptor,
      });
      // We still register a stub locally so we can track that the FSM is deployed
      this.deployed.set(machineId, { workflowId, descriptor, instances: new Map() });
      return;
    }

    // ── CENTRAL-local deployment ──────────────────────────────────────────
    this.deployed.set(machineId, { workflowId, descriptor, instances: new Map() });
    this.logger.log(
      `[ESM] Deployed FSM "${machineId}" on CENTRAL (${descriptor.states.length} states, ` +
      `${descriptor.transitions.length} transitions, window=${descriptor.windowMs}ms)`,
    );

    // Ensure we're listening for events
    this.startListening();
  }

  /**
   * Undeploy all FSMs for a workflow (on workflow deactivation).
   */
  undeployWorkflow(workflowId: string): void {
    let removed = 0;
    for (const [machineId, entry] of this.deployed) {
      if (entry.workflowId === workflowId) {
        // Cancel all active correlation windows for running instances
        for (const instanceId of entry.instances.keys()) {
          this.correlation.cancelWindow(instanceId);
        }
        this.deployed.delete(machineId);
        removed++;
      }
    }
    this.logger.log(`[ESM] Undeployed ${removed} FSM(s) for workflow "${workflowId}"`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Core event processing
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Process a single TriggerEvent from the bus.
   * Evaluates all active FSM instances that subscribe to this driver.
   */
  private async handleIncomingEvent(event: TriggerEvent): Promise<void> {
    for (const [machineId, entry] of this.deployed) {
      const { descriptor } = entry;

      // Skip FSMs deployed on edge nodes (they process events locally)
      if (descriptor.targetNodeId && descriptor.targetNodeId !== CENTRAL_NODE_ID) continue;

      // Skip FSMs not interested in this driverId
      if (
        descriptor.subscribedDriverIds?.length &&
        !descriptor.subscribedDriverIds.includes(event.driverId)
      ) {
        continue;
      }

      // Process all running instances of this FSM
      for (const [instanceId, instance] of entry.instances) {
        await this.evaluateInstance(instance, descriptor, event, entry.instances);
      }

      // Also check if this event should START a new FSM instance
      // (event matches a transition FROM the initial state)
      await this.maybeStartNewInstance(machineId, entry, event);
    }
  }

  /**
   * Check if the incoming event can start a new FSM instance
   * (i.e. it matches a transition from the FSM's initial state).
   */
  private async maybeStartNewInstance(
    machineId: string,
    entry: DeployedFsm,
    event: TriggerEvent,
  ): Promise<void> {
    const { descriptor } = entry;
    const initTransitions = descriptor.transitions.filter(
      t =>
        t.fromStates.includes(descriptor.initialState) &&
        t.guard !== 'WINDOW_ELAPSED' &&
        this.conditionMatches(t.condition, event, {}),
    );

    if (initTransitions.length === 0) return;

    // Create a new FSM instance
    const instanceId = crypto.randomUUID();
    const now = new Date();
    const instance: FsmRuntimeState = {
      machineId,
      instanceId,
      workflowId: entry.workflowId,
      nodeId: CENTRAL_NODE_ID,
      currentState: descriptor.initialState,
      matchedValues: {},
      stepOutputs: {},
      pendingApprovalGates: {},
      localActionsTaken: [],
      activeSamplingRateChanges: [],
      createdAt: now.toISOString(),
      lastTransitionAt: now.toISOString(),
    };

    entry.instances.set(instanceId, instance);
    // Persist new instance to Redis (graceful no-op if Redis unavailable)
    this.fsmStateRepo.save(instance).catch(err =>
      this.logger.warn(`[ESM] Failed to persist new instance ${instanceId}: ${err.message}`),
    );
    this.logger.log(
      `[ESM] New instance "${instanceId}" started for FSM "${machineId}" ` +
      `(total active: ${entry.instances.size})`,
    );

    // Execute the first matching transition
    const transition = initTransitions[0];
    await this.executeTransition(instance, descriptor, transition, event, entry.instances);
  }

  /**
   * Evaluate a running FSM instance against an incoming event.
   */
  private async evaluateInstance(
    instance: FsmRuntimeState,
    descriptor: EventStateMachineDescriptor,
    event: TriggerEvent,
    instances: Map<string, FsmRuntimeState>,
  ): Promise<void> {
    // Find eligible transitions from current state
    const candidates = descriptor.transitions.filter(
      t =>
        t.fromStates.includes(instance.currentState) &&
        t.guard !== 'WINDOW_ELAPSED', // WINDOW_ELAPSED is timer-driven, not event-driven
    );

    for (const transition of candidates.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))) {
      if (!this.conditionMatches(transition.condition, event, instance.stepOutputs ?? {})) continue;

      // Check temporal guard
      if (transition.guard === 'WITHIN_WINDOW') {
        if (!this.correlation.isWindowActive(instance.instanceId)) {
          this.logger.debug(
            `[ESM] Transition to "${transition.toState}" SKIPPED — window expired ` +
            `(instance: ${instance.instanceId})`,
          );
          continue;
        }
      }

      // Transition found — execute it
      await this.executeTransition(instance, descriptor, transition, event, instances);
      break; // One transition per event per instance
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Transition execution
  // ──────────────────────────────────────────────────────────────────────────

  private async executeTransition(
    instance: FsmRuntimeState,
    descriptor: EventStateMachineDescriptor,
    transition: EventTransition,
    event: TriggerEvent,
    instances: Map<string, FsmRuntimeState>,
  ): Promise<void> {
    const prevState = instance.currentState;
    instance.currentState = transition.toState;
    instance.lastTransitionAt = new Date().toISOString();

    // Persist state change to Redis (write-through, fire-and-forget)
    this.fsmStateRepo.save(instance).catch(err =>
      this.logger.warn(`[ESM] Failed to persist state for ${instance.instanceId}: ${err.message}`),
    );

    // Record the matched value for this condition
    const metricKey = transition.condition.metricName;
    const measuredValue = this.extractValue(transition.condition, event);
    if (measuredValue !== undefined) {
      instance.matchedValues[metricKey] = {
        value: measuredValue,
        timestamp: new Date().toISOString(),
      };
    }

    this.logger.log(
      `[ESM] "${instance.machineId}" instance="${instance.instanceId}" ` +
      `${prevState} → ${transition.toState} ` +
      `(metric: ${metricKey}=${measuredValue})`,
    );

    // Execute on-entry actions for the new state
    for (const action of transition.onEntry) {
      await this.executeAction(instance, descriptor, action, event, instances);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // On-entry action execution
  // ──────────────────────────────────────────────────────────────────────────

  private async executeAction(
    instance: FsmRuntimeState,
    descriptor: EventStateMachineDescriptor,
    action: ESMEntryAction,
    event: TriggerEvent,
    instances: Map<string, FsmRuntimeState>,
  ): Promise<void> {
    switch (action.type) {
      case ESMEntryActionType.START_WINDOW_TIMER:
        this.startWindowTimer(instance, descriptor);
        break;

      case ESMEntryActionType.CANCEL_WINDOW_TIMER:
        this.correlation.cancelWindow(instance.instanceId);
        break;

      case ESMEntryActionType.INCREASE_SAMPLING_RATE: {
        const params = action.params as SamplingRateParams | undefined;
        if (params) {
          this.logger.log(
            `[ESM] INCREASE_SAMPLING_RATE: driver="${params.driverId}" ` +
            `newDebounce=${params.newDebounceMs}ms (instance: ${instance.instanceId})`,
          );
          instance.activeSamplingRateChanges.push({
            driverId: params.driverId,
            previousDebounceMs: 0, // TODO: query TriggerBusService for current debounce
            newDebounceMs: params.newDebounceMs,
          });
          // TODO: this.bus.setDebounce(params.driverId, params.newDebounceMs);
        }
        break;
      }

      case ESMEntryActionType.RESET_SAMPLING_RATE: {
        for (const change of instance.activeSamplingRateChanges) {
          this.logger.log(
            `[ESM] RESET_SAMPLING_RATE: driver="${change.driverId}" ` +
            `restoring to ${change.previousDebounceMs}ms`,
          );
          // TODO: this.bus.setDebounce(change.driverId, change.previousDebounceMs);
        }
        instance.activeSamplingRateChanges = [];
        break;
      }

      case ESMEntryActionType.CONTROL_ACTUATOR: {
        const params = action.params as ActuatorControlParams | undefined;
        if (params) {
          this.logger.log(
            `[ESM] CONTROL_ACTUATOR: actuator="${params.actuatorId}" ` +
            `command="${params.commandType}" value=${params.value} (instance: ${instance.instanceId})`,
          );
          const executedAt = new Date();
          instance.localActionsTaken.push({
            actionType: params.commandType,
            actuatorId: params.actuatorId,
            value: params.value,
            executedAt,
            status: 'SUCCESS', // optimistic — real actuator feedback TODO
            cancellableUntil: params.cancellationWindowMs
              ? new Date(executedAt.getTime() + params.cancellationWindowMs)
              : undefined,
          });
        }
        break;
      }

      case ESMEntryActionType.LOG:
        this.logger.log(
          `[ESM] LOG: ${action.description ?? 'state entry'} ` +
          `state="${instance.currentState}" machine="${instance.machineId}" ` +
          `matched=${JSON.stringify(instance.matchedValues)}`,
        );
        break;

      case ESMEntryActionType.PROPAGATE_PARTIAL: {
        const partialEvent = this.buildPropagatedEvent(instance, descriptor, 'partial');
        this.logger.log(
          `[ESM] PROPAGATE_PARTIAL: satisfaction=${partialEvent.satisfactionLevel.toFixed(2)} ` +
          `machine="${instance.machineId}"`,
        );
        await this.propagatedEventService.handlePropagatedEvent(partialEvent);
        break;
      }

      case ESMEntryActionType.PROPAGATE_ENRICHED: {
        // Cancel window timer — we reached FULL_MATCH within the window
        this.correlation.cancelWindow(instance.instanceId);

        const enrichedEvent = this.buildPropagatedEvent(instance, descriptor, 'full');
        this.logger.log(
          `[ESM] PROPAGATE_ENRICHED: FULL_MATCH for machine="${instance.machineId}" ` +
          `instance="${instance.instanceId}" — emitting PropagatedEvent`,
        );
        await this.propagatedEventService.handlePropagatedEvent(enrichedEvent);

        // Reset FSM instance to initial state after full match
        this.resetInstance(instance, descriptor, instances);
        break;
      }

      case ESMEntryActionType.RESET_FSM:
        this.resetInstance(instance, descriptor, instances);
        break;

      // ── LLM / ML / CRM / HiL actions ─────────────────────────────────────

      case ESMEntryActionType.LLM_CALL: {
        const desc = action.params as LLMCallActionDescriptor | undefined;
        if (!desc) break;
        this.logger.log(
          `[ESM] LLM_CALL: instruction="${desc.instructionId}" model="${desc.model}" ` +
          `(instance: ${instance.instanceId}) — stub, wire LLM provider`,
        );
        // Stub: store an empty-shell output in stepOutputs
        // TODO: await LlmCallService.call(desc, event) and store real output
        instance.stepOutputs ??= {};
        instance.stepOutputs[desc.instructionId] = { _stub: true, instructionId: desc.instructionId };
        break;
      }

      case ESMEntryActionType.ML_SCORE_CALL: {
        const desc = action.params as MLScoreCallDescriptor | undefined;
        if (!desc) break;
        this.logger.log(
          `[ESM] ML_SCORE_CALL: instruction="${desc.instructionId}" model="${desc.model}" ` +
          `(instance: ${instance.instanceId}) — stub`,
        );
        instance.stepOutputs ??= {};
        instance.stepOutputs[desc.instructionId] = { score: 0.0, _stub: true };
        break;
      }

      case ESMEntryActionType.CRM_QUERY: {
        const desc = action.params as CRMQueryDescriptor | undefined;
        if (!desc) break;
        this.logger.log(
          `[ESM] CRM_QUERY: instruction="${desc.instructionId}" connector="${desc.connectorId}" ` +
          `(instance: ${instance.instanceId}) — stub`,
        );
        instance.stepOutputs ??= {};
        instance.stepOutputs[desc.instructionId] = { rows: [], count: 0, _stub: true };
        break;
      }

      case ESMEntryActionType.PARALLEL_FETCH: {
        const desc = action.params as ParallelFetchDescriptor | undefined;
        if (!desc) break;
        this.logger.log(
          `[ESM] PARALLEL_FETCH: ${desc.actions.length} sub-action(s) ` +
          `(instance: ${instance.instanceId}) — dispatching concurrently (stubs)`,
        );
        // Execute sub-actions concurrently — each stores stub output into stepOutputs
        await Promise.allSettled(
          desc.actions.map(async sub => {
            instance.stepOutputs ??= {};
            if ('featureNames' in sub) {
              // MLScoreCallDescriptor
              instance.stepOutputs[sub.instructionId] = { score: 0.0, _stub: true };
            } else if ('queryTemplate' in sub) {
              // CRMQueryDescriptor
              instance.stepOutputs[sub.instructionId] = { rows: [], count: 0, _stub: true };
            } else {
              // LLMCallActionDescriptor
              const llmDesc = sub as LLMCallActionDescriptor;
              instance.stepOutputs[llmDesc.instructionId] = { _stub: true };
            }
          }),
        );
        break;
      }

      case ESMEntryActionType.HUMAN_APPROVAL_GATE: {
        const desc = action.params as HumanApprovalGateDescriptor | undefined;
        if (!desc) break;
        this.logger.log(
          `[ESM] HUMAN_APPROVAL_GATE: gateId="${desc.gateId}" ` +
          `assignee="${desc.assigneeRule}" timeout=${desc.timeoutMs}ms ` +
          `(instance: ${instance.instanceId})`,
        );
        // Build context snapshot for the approval request
        const contextSnapshot: Record<string, unknown> = {};
        for (const path of desc.contextToShow) {
          contextSnapshot[path] = instance.stepOutputs?.[path] ?? instance.matchedValues?.[path];
        }
        this.approvalService.registerGate(
          desc,
          instance.instanceId,
          instance.machineId,
          descriptor.machineId, // workflowId proxy
          contextSnapshot,
        );
        // Mark the instance as suspended until the approval event arrives
        instance.pendingApprovalGates ??= {};
        instance.pendingApprovalGates[desc.gateId] = {
          gateId: desc.gateId,
          registeredAt: new Date(),
          // timeoutHandle is owned by HumanApprovalService; we track the gate here
          // for cancelAllForInstance() on FSM reset
          timeoutHandle: undefined as unknown as ReturnType<typeof setTimeout>,
        };
        break;
      }

      default:
        this.logger.warn(
          `[ESM] Unknown on-entry action type: ${(action as any).type} — skipped`,
        );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Window management
  // ──────────────────────────────────────────────────────────────────────────

  private startWindowTimer(instance: FsmRuntimeState, descriptor: EventStateMachineDescriptor): void {
    const entry = this.correlation.startWindow(
      instance.instanceId,
      instance.machineId,
      descriptor.windowMs,
      (instanceId) => this.handleWindowExpiry(instanceId, descriptor.machineId),
    );

    instance.windowStartedAt = entry.startedAt;
    instance.windowExpiresAt = entry.expiresAt;

    this.logger.log(
      `[ESM] Window started for instance "${instance.instanceId}" ` +
      `expires at ${entry.expiresAt.toISOString()}`,
    );
  }

  /**
   * Called by EventCorrelationService when the window timer fires.
   * Transitions the FSM instance to the expiredState.
   */
  private async handleWindowExpiry(instanceId: string, machineId: string): Promise<void> {
    const entry = this.deployed.get(machineId);
    if (!entry) return;

    const instance = entry.instances.get(instanceId);
    if (!instance) return;

    const { descriptor } = entry;

    this.logger.warn(
      `[ESM] Window EXPIRED for machine="${machineId}" instance="${instanceId}" ` +
      `(was in state "${instance.currentState}") — transitioning to "${descriptor.expiredState}"`,
    );

    const prevState = instance.currentState;
    instance.currentState = descriptor.expiredState;
    instance.lastTransitionAt = new Date().toISOString();

    this.logger.log(
      `[ESM] "${machineId}" instance="${instanceId}" ${prevState} → ${descriptor.expiredState} (EXPIRED)`,
    );

    // Execute on-entry actions for EXPIRED transitions
    const expiredTransitions = descriptor.transitions.filter(
      t => t.fromStates.includes(prevState) && t.guard === 'WINDOW_ELAPSED',
    );
    for (const t of expiredTransitions) {
      for (const action of t.onEntry) {
        await this.executeAction(instance, descriptor, action, {} as TriggerEvent, entry.instances);
      }
    }

    // Always reset the FSM after expiry
    this.resetInstance(instance, descriptor, entry.instances);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PropagatedEvent builder
  // ──────────────────────────────────────────────────────────────────────────

  private buildPropagatedEvent(
    instance: FsmRuntimeState,
    descriptor: EventStateMachineDescriptor,
    type: 'full' | 'partial',
  ): PropagatedEvent {
    const cfg: PropagationConfig = descriptor.enrichedEventConfig;
    const totalConditions = descriptor.transitions.filter(
      t => !t.fromStates.includes(descriptor.initialState) || t.fromStates.length > 0,
    ).length;

    // satisfaction = matched conditions / total sub-conditions
    const matchedCount = Object.keys(instance.matchedValues).length;
    const satisfactionLevel = type === 'full' ? 1.0 : matchedCount / Math.max(totalConditions, 1);

    const now = new Date();
    const windowEntry = this.correlation.getWindow(instance.instanceId);

    const event: PropagatedEvent = {
      eventId: crypto.randomUUID(),
      machineId: instance.machineId,
      sourceNodeId: instance.nodeId,
      workflowId: instance.workflowId,
      timestamp: now.toISOString(),
      satisfactionLevel,
      matchedValues: cfg.includeMatchedValues ? { ...instance.matchedValues } : {},
      timeWindow: {
        startedAt: instance.windowStartedAt?.toISOString() ?? now.toISOString(),
        completedAt: now.toISOString(),
        windowMs: descriptor.windowMs,
        remainingMs: windowEntry ? this.correlation.remainingMs(instance.instanceId) : 0,
      },
      localActionsTaken: cfg.includeLocalActionsTaken
        ? instance.localActionsTaken.map(a => ({
            actionType: a.actionType,
            actuatorId: a.actuatorId,
            value: a.value,
            executedAt: a.executedAt.toISOString(),
            status: a.status,
            cancellableUntil: a.cancellableUntil?.toISOString(),
          }))
        : [],
      precursorSignals: {},
    };

    // Compute trends if requested
    if (cfg.computeTrends?.length) {
      for (const trendCfg of cfg.computeTrends) {
        const matched = instance.matchedValues[trendCfg.metricName];
        if (matched) {
          // Stub: real implementation would query historical buffer
          event.precursorSignals[trendCfg.metricName] = {
            value: matched.value,
            unit: trendCfg.unit,
            direction: 'RISING', // TODO: compute from historical ring buffer
          };
        }
      }
    }

    // Sign the payload if configured
    if (cfg.signatureAlgorithm) {
      const payload = JSON.stringify({
        machineId: event.machineId,
        sourceNodeId: event.sourceNodeId,
        timestamp: event.timestamp,
        satisfactionLevel: event.satisfactionLevel,
        matchedValues: event.matchedValues,
      });
      const hash = crypto.createHash(
        cfg.signatureAlgorithm.replace('HMAC_', '').toLowerCase(),
      ).update(payload).digest('hex');
      event.signature = `${cfg.signatureAlgorithm}:${hash}`;
    }

    return event;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Instance reset
  // ──────────────────────────────────────────────────────────────────────────

  private resetInstance(
    instance: FsmRuntimeState,
    descriptor: EventStateMachineDescriptor,
    instances: Map<string, FsmRuntimeState>,
  ): void {
    // Reset sampling rates
    for (const change of instance.activeSamplingRateChanges) {
      // TODO: this.bus.setDebounce(change.driverId, change.previousDebounceMs);
    }
    // Cancel any remaining window
    this.correlation.cancelWindow(instance.instanceId);
    // Remove from Redis
    this.fsmStateRepo.remove(instance.instanceId, instance.machineId).catch(err =>
      this.logger.warn(`[ESM] Failed to remove Redis state for ${instance.instanceId}: ${err.message}`),
    );
    // Remove instance
    instances.delete(instance.instanceId);
    this.logger.log(
      `[ESM] Instance "${instance.instanceId}" of FSM "${instance.machineId}" RESET → removed`,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Condition matching
  // ──────────────────────────────────────────────────────────────────────────

  private conditionMatches(
    condition: ConditionDescriptor,
    event: TriggerEvent,
    stepOutputs: Record<string, unknown> = {},
  ): boolean {
    switch (condition.type) {
      case ConditionType.SENSOR_THRESHOLD:
      case ConditionType.MQTT_VALUE:
      case ConditionType.FIELD_BUS_VALUE:
      case ConditionType.KPI_VALUE: {
        const value = this.extractValue(condition, event);
        if (value === undefined) return false;
        if (typeof value !== 'number') return false;
        return this.compare(value, condition.operator ?? ComparisonOperator.GT, condition);
      }

      case ConditionType.KAFKA_EVENT: {
        // Must come from a Kafka driver targeting the right topic
        if (event.driverId !== 'kafka') return false;
        if (condition.topic && event.payload?.topic !== condition.topic) return false;
        const value = this.extractValue(condition, event);
        if (value === undefined) return false;
        if (typeof value !== 'number') return false;
        return this.compare(value, condition.operator ?? ComparisonOperator.GT, condition);
      }

      case ConditionType.REMOTE_SIGNAL: {
        // Remote signal: arrives as a special TriggerEvent with driverId 'remote_signal'
        return (
          event.driverId === 'remote_signal' &&
          event.payload?.signalId === condition.signalId
        );
      }

      case ConditionType.WINDOW_TIMER_ELAPSED:
        // Timer-based — evaluated by the correlation service, not here
        return false;

      // ── LLM / ML / CRM / HiL conditions ──────────────────────────────────

      case ConditionType.LLM_OUTPUT:
      case ConditionType.ML_SCORE:
      case ConditionType.CRM_QUERY_RESULT:
      case ConditionType.API_RESPONSE: {
        // Evaluate a compiled JS expression against the step output stored
        // by the matching LLM_CALL / ML_SCORE_CALL / CRM_QUERY action.
        if (!condition.instructionId || !condition.semanticExpression) return false;
        const output = stepOutputs[condition.instructionId];
        if (output === undefined) return false;
        return this.evaluateSemanticExpression(condition.semanticExpression, output);
      }

      case ConditionType.HUMAN_APPROVAL: {
        // Synthetic event from HumanApprovalService: driverId='human_approval'
        if (event.driverId !== 'human_approval') return false;
        if (condition.approvalGateId && event.payload?.gateId !== condition.approvalGateId)
          return false;
        if (condition.expectedDecision && event.payload?.decision !== condition.expectedDecision)
          return false;
        return true;
      }

      case ConditionType.COMPOSITE_ALL_OF: {
        const children = condition.compositeConditions;
        if (!children?.length) return false;
        return children.every(c => this.conditionMatches(c, event, stepOutputs));
      }

      case ConditionType.COMPOSITE_ANY_OF: {
        const children = condition.compositeConditions;
        if (!children?.length) return false;
        return children.some(c => this.conditionMatches(c, event, stepOutputs));
      }

      default:
        return false;
    }
  }

  /**
   * Evaluate a compiled semantic expression against a step output value.
   * Expression receives `output` bound in scope.
   * SECURITY: Use a proper sandbox (vm2/isolated-vm) in production.
   */
  private evaluateSemanticExpression(expression: string, output: unknown): boolean {
    return this.sandbox.evaluate(expression, { output });
  }

  /**
   * Extract the relevant numeric value from the TriggerEvent payload
   * based on the ConditionDescriptor's field specification.
   */
  private extractValue(
    condition: ConditionDescriptor,
    event: TriggerEvent,
  ): number | string | undefined {
    const payload = event.payload;
    if (payload == null) return undefined;
    if (condition.field) {
      const parts = condition.field.split('.');
      let current: any = payload;
      for (const part of parts) {
        if (current == null) return undefined;
        current = current[part];
      }
      return current;
    }
    // No field specified: use payload directly (for simple scalar payloads)
    if (typeof payload === 'number' || typeof payload === 'string') return payload;
    if (typeof payload.value === 'number' || typeof payload.value === 'string') return payload.value;
    return undefined;
  }

  private compare(
    actual: number,
    op: ComparisonOperator,
    condition: ConditionDescriptor,
  ): boolean {
    const threshold = typeof condition.value === 'number'
      ? condition.value
      : parseFloat(condition.value as string);

    switch (op) {
      case ComparisonOperator.GT:  return actual > threshold;
      case ComparisonOperator.GTE: return actual >= threshold;
      case ComparisonOperator.LT:  return actual < threshold;
      case ComparisonOperator.LTE: return actual <= threshold;
      case ComparisonOperator.EQ:  return actual === threshold;
      case ComparisonOperator.NEQ: return actual !== threshold;
      case ComparisonOperator.EXISTS: return actual != null;
      case ComparisonOperator.BETWEEN:
        return condition.valueMin != null && condition.valueMax != null &&
          actual >= condition.valueMin && actual <= condition.valueMax;
      default: return false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Introspection
  // ──────────────────────────────────────────────────────────────────────────

  summary(): {
    deployedFsms: number;
    activeInstances: number;
    correlationWindows: ReturnType<EventCorrelationService['summary']>;
  } {
    let activeInstances = 0;
    for (const entry of this.deployed.values()) {
      activeInstances += entry.instances.size;
    }
    return {
      deployedFsms: this.deployed.size,
      activeInstances,
      correlationWindows: this.correlation.summary(),
    };
  }
}
