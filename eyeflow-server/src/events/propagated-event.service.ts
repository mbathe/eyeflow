/**
 * PropagatedEventService
 *
 * Receives PropagatedEvents from edge FSM nodes (via WebSocket) or from the
 * local EventStateMachineService (when the FSM runs on CENTRAL), then dispatches
 * the appropriate HANDLE_PROPAGATED actions defined in the IR.
 *
 * The compiled EventHandlerDescriptors are registered with this service at
 * workflow deployment time (by TriggerActivationService or the main compiler
 * pipeline).  At runtime, this service acts as a pure dispatcher:
 *   1. Incoming PropagatedEvent (machineId, satisfactionLevel)
 *   2. Find matching EventHandlerDescriptors
 *   3. Execute all parallelActions concurrently
 *
 * Dependencies:
 *  – NodeDispatcherService: to send REMOTE_COMMANDs to edge nodes
 *  – ConnectorsService (optional): for CREATE_TICKET, CALL_HTTP, ALERT actions
 *    (injected lazily via ModuleRef to break circular imports)
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  PropagatedEvent,
  EventHandlerDescriptor,
  EventHandlerAction,
  EventHandlerActionType,
  RemoteCommandDescriptor,
  ConditionDescriptor,
  ComparisonOperator,
} from '../compiler/interfaces/event-state-machine.interface';
import { NodeDispatcherService } from '../nodes/node-dispatcher.service';
import { PipelineExecutorService } from './pipeline-executor.service';

/** Registration entry: handler + workflowId for lifecycle management */
interface HandlerRegistration {
  workflowId: string;
  descriptor: EventHandlerDescriptor;
}

@Injectable()
export class PropagatedEventService {
  private readonly logger = new Logger(PropagatedEventService.name);

  /**
   * Registry of compiled EventHandlerDescriptors.
   * Key: machineId (matches EventStateMachineDescriptor.machineId)
   * Value: array of handlers registered for that machine ID
   */
  private readonly handlers = new Map<string, HandlerRegistration[]>();

  /**
   * History of received PropagatedEvents (capped ring-buffer for audit/dashboard).
   * Production: replace with a TimescaleDB / InfluxDB write.
   */
  private readonly eventHistory: Array<{ receivedAt: Date; event: PropagatedEvent }> = [];
  private readonly MAX_HISTORY = 500;

  constructor(
    private readonly dispatcher: NodeDispatcherService,
    private readonly pipelineExecutor: PipelineExecutorService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Handler Registration (called at workflow deployment time)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Register an EventHandlerDescriptor for a given workflow.
   * Called by TriggerActivationService when processing HANDLE_PROPAGATED opcodes.
   */
  registerHandler(workflowId: string, descriptor: EventHandlerDescriptor): void {
    const key = descriptor.triggeredByMachineId;
    const existing = this.handlers.get(key) ?? [];
    existing.push({ workflowId, descriptor });
    this.handlers.set(key, existing);
    this.logger.log(
      `[PropagatedEvent] Registered handler for machine "${key}" (workflow: ${workflowId}) — ` +
      `${descriptor.parallelActions?.length ?? 0} parallel action(s), ` +
      `${descriptor.pipeline?.length ?? 0} pipeline step(s)`,
    );
  }

  /**
   * Unregister all handlers for a given workflow (on workflow deactivation).
   */
  unregisterWorkflow(workflowId: string): void {
    let removed = 0;
    for (const [key, entries] of this.handlers) {
      const filtered = entries.filter(e => e.workflowId !== workflowId);
      if (filtered.length === 0) {
        this.handlers.delete(key);
      } else {
        this.handlers.set(key, filtered);
      }
      removed += entries.length - filtered.length;
    }
    this.logger.log(`[PropagatedEvent] Unregistered ${removed} handler(s) for workflow "${workflowId}"`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Event Dispatch (main public API)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Process an incoming PropagatedEvent.
   * Called by:
   *  – NodesGateway.handlePropagatedEvent() (from edge WebSocket message)
   *  – EventStateMachineService (when FSM runs on CENTRAL and reaches FULL_MATCH)
   */
  async handlePropagatedEvent(event: PropagatedEvent): Promise<void> {
    // ── Store in history ──────────────────────────────────────────────────
    this.eventHistory.push({ receivedAt: new Date(), event });
    if (this.eventHistory.length > this.MAX_HISTORY) {
      this.eventHistory.shift();
    }

    this.logger.log(
      `[PropagatedEvent] Received from node="${event.sourceNodeId}" ` +
      `machine="${event.machineId}" satisfaction=${event.satisfactionLevel.toFixed(2)} ` +
      `eventId="${event.eventId}"`,
    );

    // ── Find matching handlers ─────────────────────────────────────────────
    const registrations = this.handlers.get(event.machineId) ?? [];
    const eligible = registrations.filter(
      r => event.satisfactionLevel >= r.descriptor.minSatisfactionLevel,
    );

    if (eligible.length === 0) {
      this.logger.warn(
        `[PropagatedEvent] No handler registered for machine "${event.machineId}" ` +
        `at satisfaction level ${event.satisfactionLevel.toFixed(2)}`,
      );
      return;
    }

    this.logger.log(
      `[PropagatedEvent] Dispatching to ${eligible.length} handler(s) for machine "${event.machineId}"`,
    );

    // ── Execute all handlers concurrently ─────────────────────────────────
    await Promise.allSettled(
      eligible.map(r => this.executeHandler(event, r.descriptor)),
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Handler Execution
  // ──────────────────────────────────────────────────────────────────────────

  private async executeHandler(
    event: PropagatedEvent,
    descriptor: EventHandlerDescriptor,
  ): Promise<void> {
    this.logger.log(
      `[PropagatedEvent] Executing handler "${descriptor.description ?? descriptor.triggeredByMachineId}" ` +
      `parallelActions=${descriptor.parallelActions?.length ?? 0} ` +
      `pipelineSteps=${descriptor.pipeline?.length ?? 0}`,
    );

    // ── Phase 1: parallel legacy actions (if any) ─────────────────────────
    if (descriptor.parallelActions?.length) {
      const results = await Promise.allSettled(
        descriptor.parallelActions.map(action => this.executeAction(event, action)),
      );
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        this.logger.error(
          `[PropagatedEvent] ${failures.length}/${results.length} parallel action(s) failed for ` +
          `handler on machine "${descriptor.triggeredByMachineId}"`,
        );
        failures.forEach(f => {
          if (f.status === 'rejected') {
            this.logger.error(`[PropagatedEvent] Action failure: ${f.reason}`);
          }
        });
      }
    }

    // ── Phase 2: sequential pipeline (if compiled) ───────────────────────
    if (descriptor.pipeline?.length) {
      const pipelineId = `${descriptor.triggeredByMachineId}_${event.eventId}`;
      this.logger.log(
        `[PropagatedEvent] Delegating to PipelineExecutorService ` +
        `"${pipelineId}" (${descriptor.pipeline.length} steps)`,
      );
      const ctx = await this.pipelineExecutor.execute(
        descriptor.pipeline,
        event,
        pipelineId,
      );
      this.logger.log(
        `[PropagatedEvent] Pipeline "${pipelineId}" completed: result=${ctx.result}`,
      );
    }
  }

  private async executeAction(event: PropagatedEvent, action: EventHandlerAction): Promise<void> {
    switch (action.type) {
      case EventHandlerActionType.ALERT:
        return this.executeAlert(event, action);

      case EventHandlerActionType.CREATE_TICKET:
        return this.executeCreateTicket(event, action);

      case EventHandlerActionType.DISPATCH_REMOTE_COMMAND:
        return this.executeRemoteCommand(event, action);

      case EventHandlerActionType.EVALUATE_AND_FORWARD:
        return this.executeEvaluateAndForward(event, action);

      case EventHandlerActionType.CALL_HTTP:
        return this.executeCallHttp(event, action);

      case EventHandlerActionType.PERSIST_EVENT:
        this.logger.log(
          `[PropagatedEvent] PERSIST_EVENT: eventId="${event.eventId}" machine="${event.machineId}" ` +
          `(stub — connect TimescaleDB/InfluxDB writer here)`,
        );
        return;

      case EventHandlerActionType.AUDIT_LOG:
        this.logger.log(
          `[PropagatedEvent] AUDIT_LOG: ` +
          `eventId="${event.eventId}" machine="${event.machineId}" ` +
          `node="${event.sourceNodeId}" satisfaction=${event.satisfactionLevel} ` +
          `window=${JSON.stringify(event.timeWindow)} ` +
          `matched=${JSON.stringify(event.matchedValues)}`,
        );
        return;

      default:
        this.logger.warn(`[PropagatedEvent] Unknown action type: ${(action as any).type}`);
    }
  }

  // ── Individual action executors ──────────────────────────────────────────

  private async executeAlert(event: PropagatedEvent, action: EventHandlerAction): Promise<void> {
    const cfg = action.alertConfig;
    if (!cfg) {
      this.logger.warn('[PropagatedEvent] ALERT action missing alertConfig — skipped');
      return;
    }

    // Render compiled template with event values
    const message = this.renderTemplate(cfg.template, event);

    this.logger.log(
      `[PropagatedEvent] ALERT [${cfg.severity}] → ${cfg.channel} → [${cfg.recipients.join(', ')}]: ${message}`,
    );

    // TODO: wire to actual notification services (Slack webhook, SendGrid, PagerDuty API)
    // The connector ID / vault path comes from cfg.recipients[0] or a sub-config.
    // For now: structured log serves as the proof-of-concept output.
  }

  private async executeCreateTicket(event: PropagatedEvent, action: EventHandlerAction): Promise<void> {
    const cfg = action.ticketConfig;
    if (!cfg) {
      this.logger.warn('[PropagatedEvent] CREATE_TICKET action missing ticketConfig — skipped');
      return;
    }

    const title = this.renderTemplate(cfg.titleTemplate, event);
    const description = this.renderTemplate(cfg.descriptionTemplate, event);

    this.logger.log(
      `[PropagatedEvent] CREATE_TICKET [${cfg.system}] priority=${cfg.priority} ` +
      `title="${title}" connector="${cfg.connectorId}"`,
    );

    // TODO: wire to ConnectorsService (SAP via RFC, ServiceNow via REST, Jira via REST)
    // Stub: log the ticket payload
    this.logger.debug(`[PropagatedEvent] Ticket description: ${description}`);
  }

  private async executeRemoteCommand(event: PropagatedEvent, action: EventHandlerAction): Promise<void> {
    const cmd = action.remoteCommandRef?.commandDescriptor;
    if (!cmd) {
      this.logger.warn('[PropagatedEvent] DISPATCH_REMOTE_COMMAND action missing commandDescriptor — skipped');
      return;
    }
    return this.dispatchRemoteCommand(cmd, event);
  }

  private async executeEvaluateAndForward(event: PropagatedEvent, action: EventHandlerAction): Promise<void> {
    const cfg = action.evaluateAndForward;
    if (!cfg) {
      this.logger.warn('[PropagatedEvent] EVALUATE_AND_FORWARD action missing config — skipped');
      return;
    }

    const signal = event.precursorSignals[cfg.signalMetric];
    if (!signal) {
      this.logger.log(
        `[PropagatedEvent] EVALUATE_AND_FORWARD: signal "${cfg.signalMetric}" not present ` +
        `in precursorSignals — skipping evaluation`,
      );
      return;
    }

    const conditionMet = this.evaluateCondition(
      cfg.condition,
      typeof signal.value === 'number' ? signal.value : parseFloat(signal.value as string),
    );

    this.logger.log(
      `[PropagatedEvent] EVALUATE_AND_FORWARD: signal "${cfg.signalMetric}"=${signal.value} ` +
      `condition=${conditionMet ? 'TRUE → dispatching commandOnTrue' : 'FALSE → commandOnFalse'}`,
    );

    const cmd = conditionMet ? cfg.commandOnTrue : cfg.commandOnFalse;
    if (cmd) {
      await this.dispatchRemoteCommand(cmd, event);
    }
  }

  private async executeCallHttp(event: PropagatedEvent, action: EventHandlerAction): Promise<void> {
    const cfg = action.httpConfig;
    if (!cfg) {
      this.logger.warn('[PropagatedEvent] CALL_HTTP action missing httpConfig — skipped');
      return;
    }

    const body = this.renderTemplate(cfg.bodyTemplate, event);
    this.logger.log(
      `[PropagatedEvent] CALL_HTTP ${cfg.method} ${cfg.url} (stub — wire axios here)`,
    );
    this.logger.debug(`[PropagatedEvent] HTTP body: ${body}`);

    // TODO: axios.request({ method: cfg.method, url: cfg.url, data: JSON.parse(body), headers: cfg.headers })
    // Vault fetch for auth: vaultService.get(cfg.vaultPathForAuth)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Remote Command Dispatch
  // ──────────────────────────────────────────────────────────────────────────

  async dispatchRemoteCommand(cmd: RemoteCommandDescriptor, context?: PropagatedEvent): Promise<void> {
    const payload = {
      commandId: cmd.commandId,
      command: cmd.command,
      params: cmd.params,
      // Include source event context for traceability on the edge node
      sourceEventId: context?.eventId,
      sourceMachineId: context?.machineId,
    };

    // Special case: deploy an FSM descriptor to the edge node
    if (cmd.deployFsm) {
      Object.assign(payload, { deployFsm: cmd.deployFsm });
    }

    const sent = this.dispatcher.emitToNode(cmd.targetNodeId, 'remote_command', payload);

    if (sent) {
      this.logger.log(
        `[PropagatedEvent] REMOTE_COMMAND "${cmd.command}" sent to node "${cmd.targetNodeId}" ` +
        `(commandId: ${cmd.commandId})`,
      );
    } else {
      this.logger.error(
        `[PropagatedEvent] REMOTE_COMMAND "${cmd.command}" FAILED — ` +
        `node "${cmd.targetNodeId}" has no active WebSocket`,
      );
      // TODO: store in retry queue if ackTimeoutMs is set
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Utility: Template rendering & condition evaluation
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Render a compiled template string using PropagatedEvent fields.
   * Template syntax: {{ matchedValues.M1_temperature.value }}
   */
  private renderTemplate(template: string, event: PropagatedEvent): string {
    return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, path: string) => {
      const parts = path.trim().split('.');
      let current: any = event;
      for (const part of parts) {
        if (current == null) return `<${path}>`;
        current = current[part];
      }
      return current != null ? String(current) : `<${path}>`;
    });
  }

  /**
   * Evaluate a simple ConditionDescriptor against a numeric value.
   * Used by EVALUATE_AND_FORWARD to check precursor signals.
   */
  private evaluateCondition(cond: ConditionDescriptor, actualValue: number): boolean {
    const threshold = typeof cond.value === 'number' ? cond.value : parseFloat(cond.value as string);
    switch (cond.operator) {
      case ComparisonOperator.GT:  return actualValue > threshold;
      case ComparisonOperator.GTE: return actualValue >= threshold;
      case ComparisonOperator.LT:  return actualValue < threshold;
      case ComparisonOperator.LTE: return actualValue <= threshold;
      case ComparisonOperator.EQ:  return actualValue === threshold;
      case ComparisonOperator.NEQ: return actualValue !== threshold;
      case ComparisonOperator.BETWEEN:
        return cond.valueMin != null && cond.valueMax != null &&
          actualValue >= cond.valueMin && actualValue <= cond.valueMax;
      default: return false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Introspection
  // ──────────────────────────────────────────────────────────────────────────

  getRecentEvents(limit = 50): Array<{ receivedAt: string; event: PropagatedEvent }> {
    return this.eventHistory
      .slice(-limit)
      .reverse()
      .map(e => ({ receivedAt: e.receivedAt.toISOString(), event: e.event }));
  }

  summary(): { registeredHandlers: number; recentEvents: number } {
    let total = 0;
    for (const handlers of this.handlers.values()) total += handlers.length;
    return { registeredHandlers: total, recentEvents: this.eventHistory.length };
  }
}
