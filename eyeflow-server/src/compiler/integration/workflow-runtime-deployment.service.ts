/**
 * WorkflowRuntimeDeploymentService
 *
 * Bridge between the persistence layer (EventRuleEntity / ProjectVersionEntity)
 * and the runtime trio:
 *   – TriggerActivationService  → activates ITriggerDriver(s) for TRIGGER opcodes
 *   – EventStateMachineService  → deploys FSM descriptors
 *   – PropagatedEventService    → registers HANDLE_PROPAGATED action pipelines
 *
 * Two entry points:
 *   deployRule(rule)      — called after TaskCompilerService.createEventRule()
 *   deployVersion(version)— called after LLMProjectService.activateVersion()
 *
 * @file src/compiler/integration/workflow-runtime-deployment.service.ts
 */

import { Injectable, Logger, Optional } from '@nestjs/common';

// Runtime services
import { TriggerActivationService } from '../../triggers/trigger-activation.service';
import { EventStateMachineService }  from '../../events/event-state-machine.service';
import { PropagatedEventService }    from '../../events/propagated-event.service';
import { TriggerBusService, WorkflowDispatcher } from '../../triggers/trigger-bus.service';

// IR types
import {
  LLMIntermediateRepresentation,
  IROpcode,
  IRInstruction,
  TriggerDescriptor,
} from '../interfaces/ir.interface';

import {
  EventStateMachineDescriptor,
  EventHandlerDescriptor,
  EventHandlerActionType,
  ConditionType,
} from '../interfaces/event-state-machine.interface';

// Entity types (used as structural interfaces — no TypeORM coupling)
export interface DeployableRule {
  id: string;
  name: string;
  userId: string;
  sourceConnectorType: string;
  condition: {
    fieldName?: string;
    operator?: string;
    value?: any;
    durationMs?: number;
  } | null;
  actions: Array<{
    name: string;
    channel?: string;
    recipients?: string[];
    params?: Record<string, any>;
    parameters?: Record<string, any>;   // alias used by Python-compiler DTO
  }>;
  debounceConfig?: {
    enabled?: boolean;
    windowMs?: number;
    maxTriggersInWindow?: number;
  };
}

export interface DeployableVersion {
  id: string;
  projectId: string;
  version: number;
  irBinary: string;   // JSON-serialised LLMIntermediateRepresentation
  irChecksum: string;
}

@Injectable()
export class WorkflowRuntimeDeploymentService {
  private readonly logger = new Logger(WorkflowRuntimeDeploymentService.name);

  constructor(
    @Optional() private readonly triggerActivation: TriggerActivationService,
    @Optional() private readonly eventStateMachine: EventStateMachineService,
    @Optional() private readonly propagatedEvents: PropagatedEventService,
    @Optional() private readonly triggerBus: TriggerBusService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // W2 — Deploy an event rule to the runtime immediately after creation
  // ──────────────────────────────────────────────────────────────────────────

  async deployRule(rule: DeployableRule): Promise<void> {
    if (!this.triggerActivation || !this.eventStateMachine || !this.propagatedEvents) {
      this.logger.warn(
        `[RuntimeDeployment] Runtime services not available — rule "${rule.id}" not deployed yet. ` +
        'Will be activated on next server restart.',
      );
      return;
    }

    this.logger.log(`[RuntimeDeployment] Deploying rule "${rule.name}" (${rule.id})`);

    const machineId  = `${rule.id}_fsm_0`;
    const windowMs   = rule.debounceConfig?.windowMs ?? 5_000;
    const driverId   = this._normaliseDriverId(rule.sourceConnectorType);

    // ── 1. Build EventStateMachineDescriptor (2-state FSM: IDLE → MATCHED) ──
    const fsmDescriptor: EventStateMachineDescriptor = {
      machineId,
      description: rule.name,
      states:       ['IDLE', 'MATCHED', 'EXPIRED'],
      initialState: 'IDLE',
      fullMatchState: 'MATCHED',
      expiredState:   'EXPIRED',
      windowMs,
      transitions: [
        {
          fromStates: ['IDLE'],
          toState:    'MATCHED',
          guard:      'ALWAYS',
          condition: {
            type:       ConditionType.SENSOR_THRESHOLD,
            metricName: rule.condition?.fieldName ?? 'event',
            field:      rule.condition?.fieldName,
            operator:   this._mapOperator(rule.condition?.operator),
            value:      rule.condition?.value,
            topic:      driverId,
          },
          onEntry: [],
        },
        {
          fromStates: ['IDLE', 'MATCHED'],
          toState:    'EXPIRED',
          guard:      'WINDOW_ELAPSED',
          condition: {
            type:       ConditionType.WINDOW_TIMER_ELAPSED,
            metricName: 'timer',
            timerMs:    windowMs,
          },
          onEntry: [],
        },
      ],
      enrichedEventConfig: {
        includeMatchedValues:    true,
        includeLocalActionsTaken: false,
        satisfactionLevel:       1.0,
      },
      subscribedDriverIds: [driverId],
    };

    // ── 2. Build EventHandlerDescriptor (parallel actions from rule) ────────
    const handlerDescriptor: EventHandlerDescriptor = {
      triggeredByMachineId: machineId,
      minSatisfactionLevel: 1.0,
      description:          rule.name,
      parallelActions: (rule.actions ?? []).map(action => {
        // action.parameters (from Python compiler DTO) OR action.params (DeployableRule interface)
        const params: Record<string, any> =
          (action as any).parameters ?? action.params ?? {};
        // Map severity to values expected by EventHandlerAction
        const rawSeverity = (params['severity'] ?? 'INFO') as string;
        const severityMap: Record<string, 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY'> = {
          INFO: 'INFO', WARNING: 'WARNING', WARN: 'WARNING',
          CRITICAL: 'CRITICAL', EMERGENCY: 'EMERGENCY', ERROR: 'CRITICAL',
        };
        const severity = severityMap[rawSeverity.toUpperCase()] ?? 'INFO';
        return {
          type: this._mapActionType(action.name),
          alertConfig: {
            channel:    params['channel'] ?? action.channel ?? 'slack',
            recipients: params['recipients'] ?? action.recipients ?? [],
            template:   params['message']
              ?? params['text']
              ?? `Rule "${rule.name}" triggered — event matched.`,
            severity,
          },
          connectorConfig: Object.keys(params).length > 0 ? {
            connectorId:   params['connector'] ?? params['connectorId'],
            functionName:  params['function']  ?? params['functionName'],
            parameters:    params,
          } : undefined,
        };
      }),
    };

    // Ensure at least one action (audit log) so the handler is always valid
    if (handlerDescriptor.parallelActions!.length === 0) {
      handlerDescriptor.parallelActions = [{ type: EventHandlerActionType.AUDIT_LOG }];
    }

    // ── 3. Build minimal LLM-IR for TriggerActivationService ────────────────
    const ir = this._buildMinimalIR(rule.id, driverId, machineId, windowMs);

    // ── 4. Build dispatcher — routes TriggerEvent to TriggerBus ─────────────
    const dispatcher: WorkflowDispatcher = async (event) => {
      this.logger.debug(
        `[RuntimeDeployment] Rule "${rule.id}" received trigger event: ${event.driverId}`,
      );
    };

    // ── 5. Wire everything into the runtime ──────────────────────────────────
    await this.triggerActivation.activateWorkflow(ir, dispatcher);
    await this.eventStateMachine.deployFsm(rule.id, fsmDescriptor);
    this.propagatedEvents.registerHandler(rule.id, handlerDescriptor);

    this.logger.log(
      `[RuntimeDeployment] Rule "${rule.name}" (${rule.id}) is now LIVE: ` +
      `driver=${driverId}, fsm=${machineId}`,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // W3 — Re-deploy a compiled project version when it becomes ACTIVE
  // ──────────────────────────────────────────────────────────────────────────

  async deployVersion(version: DeployableVersion): Promise<void> {
    if (!this.triggerActivation || !this.eventStateMachine || !this.propagatedEvents) {
      this.logger.warn(
        `[RuntimeDeployment] Runtime services not available — ` +
        `version "${version.id}" will not be deployed until next restart.`,
      );
      return;
    }

    if (!version.irBinary) {
      this.logger.warn(`[RuntimeDeployment] Version ${version.id} has no IR binary — skipping deployment.`);
      return;
    }

    let ir: LLMIntermediateRepresentation;
    try {
      ir = JSON.parse(version.irBinary) as LLMIntermediateRepresentation;
    } catch (err) {
      this.logger.error(
        `[RuntimeDeployment] Failed to parse IR for version ${version.id}: ${(err as Error).message}`,
      );
      return;
    }

    // Ensure mandatory metadata fields for activation
    ir.metadata ??= {} as any;
    ir.metadata.workflowId      ??= version.projectId;
    ir.metadata.workflowVersion ??= version.version;

    const workflowId = ir.metadata.workflowId!;

    this.logger.log(
      `[RuntimeDeployment] Activating version ${version.version} for project ${version.projectId}`,
    );

    // Deactivate previous version before deploying new one
    try { this.triggerActivation.deactivateWorkflow(workflowId); } catch { /* noop */ }
    try { this.eventStateMachine.undeployWorkflow(workflowId); } catch { /* noop */ }
    try { this.propagatedEvents.unregisterWorkflow(workflowId); } catch { /* noop */ }

    // Build a passthrough dispatcher (events already handled by ESM)
    const dispatcher: WorkflowDispatcher = async (_event) => { /* routed by TriggerBus */ };

    // ── Activate TRIGGER opcodes ─────────────────────────────────────────
    await this.triggerActivation.activateWorkflow(ir, dispatcher);

    // ── Deploy EVENT_STATE_MACHINE opcodes ───────────────────────────────
    for (const instr of (ir.instructions ?? [])) {
      if (instr.opcode === IROpcode.EVENT_STATE_MACHINE && instr.operands) {
        const fsmDesc = instr.operands as EventStateMachineDescriptor;
        await this.eventStateMachine.deployFsm(workflowId, fsmDesc);
        this.logger.log(`[RuntimeDeployment] Deployed FSM "${fsmDesc.machineId}" for workflow ${workflowId}`);
      }
    }

    // ── Register HANDLE_PROPAGATED opcodes ───────────────────────────────
    for (const instr of (ir.instructions ?? [])) {
      if (instr.opcode === IROpcode.HANDLE_PROPAGATED && instr.operands) {
        const handlerDesc = instr.operands as EventHandlerDescriptor;
        this.propagatedEvents.registerHandler(workflowId, handlerDesc);
        this.logger.log(
          `[RuntimeDeployment] Registered handler for machine "${handlerDesc.triggeredByMachineId}" ` +
          `(workflow ${workflowId})`,
        );
      }
    }

    this.logger.log(
      `[RuntimeDeployment] Version ${version.version} for project ${version.projectId} is now LIVE.`,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  /** Build a minimal LLM-IR containing one TRIGGER instruction. */
  private _buildMinimalIR(
    workflowId: string,
    driverId: string,
    machineId: string,
    debounceMs: number,
  ): LLMIntermediateRepresentation {
    const triggerDesc: TriggerDescriptor = {
      driverId,
      driverConfig:     {},
      outputRegister:   0,
      debounceMs,
      onDriverFailure:  'DEGRADED_MODE',
    };

    const triggerInstr: IRInstruction = {
      index:    0,
      opcode:   IROpcode.TRIGGER,
      operands: triggerDesc,
    };

    return {
      instructions:          [triggerInstr],
      instructionOrder:      [0],
      dependencyGraph:       new Map(),
      resourceTable:         [],
      parallelizationGroups: [],
      schemas:               [],
      semanticContext:       { embeddings: [] } as any,
      inputRegister:         0,
      outputRegister:        0,
      metadata: {
        compiledAt:       new Date(),
        compilerVersion:  '1.0.0',
        source:           `rule:${workflowId}`,
        workflowId,
        workflowVersion:  1,
      },
    };
  }

  /** Convert connector type like 'ON_SCHEDULE' → actual registered driver id 'cron'. */
  private _normaliseDriverId(connectorType: string): string {
    const KNOWN: Record<string, string> = {
      ON_SCHEDULE:    'cron',
      CRON:           'cron',
      HTTP_WEBHOOK:   'http-webhook',
      WEBHOOK:        'http-webhook',
      FILESYSTEM:     'filesystem',
      FILE:           'filesystem',
      IMAP:           'imap',
      EMAIL:          'imap',
      MQTT:           'mqtt',
      MODBUS:         'modbus-bridge',
      OPCUA:          'opcua-bridge',
      SIGNAL:         'signal',
      WEBSOCKET:      'websocket',
    };
    const upper = (connectorType ?? 'generic').toUpperCase();
    return KNOWN[upper] ?? (connectorType ?? 'generic').toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }

  /** Map rule operator string → ComparisonOperator enum value. */
  private _mapOperator(op?: string): any {
    const MAP: Record<string, string> = {
      '>':   'GT',
      '>=':  'GTE',
      '<':   'LT',
      '<=':  'LTE',
      '===': 'EQ',
      '==':  'EQ',
      '!==': 'NEQ',
      '!=':  'NEQ',
    };
    return op ? (MAP[op] ?? 'EXISTS') : 'EXISTS';
  }

  /** Map a rule action name to the nearest EventHandlerActionType. */
  private _mapActionType(actionName: string): EventHandlerActionType {
    const name = (actionName ?? '').toLowerCase();
    if (name.includes('alert') || name.includes('notify') || name.includes('slack') || name.includes('email')) {
      return EventHandlerActionType.ALERT;
    }
    if (name.includes('ticket') || name.includes('jira') || name.includes('servicenow')) {
      return EventHandlerActionType.CREATE_TICKET;
    }
    if (name.includes('http') || name.includes('webhook') || name.includes('call')) {
      return EventHandlerActionType.CALL_HTTP;
    }
    if (name.includes('persist') || name.includes('store') || name.includes('save')) {
      return EventHandlerActionType.PERSIST_EVENT;
    }
    return EventHandlerActionType.AUDIT_LOG;
  }
}
