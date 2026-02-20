/**
 * Trigger Activation Service — spec §7
 *
 * Bridges the compiled LLM-IR and the runtime trigger system.
 *
 * ROLE:
 *   Reads every TRIGGER instruction from a deployed LLM-IR.
 *   For CENTRAL-assigned TRIGGER → activates the local ITriggerDriver.
 *   For REMOTE-assigned TRIGGER  → pushes RemoteTriggerActivationPayload
 *                                   via NodesGateway WebSocket to the edge node.
 *
 * This service is the key connection between:
 *   [Compilation] Stage 9 assigns TRIGGER opcodes to nodes
 *                             ↓
 *   [Deployment]  TriggerActivationService.activateWorkflow(ir)
 *                             ↓
 *   [Runtime]     ITriggerDriver.activate() → TriggerBusService → SVM.execute()
 */

import {
  Injectable,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  ITriggerDriver,
  TRIGGER_DRIVER_TOKEN,
  TriggerActivationRecord,
  RemoteTriggerActivationPayload,
} from './interfaces/trigger-driver.interface';
import { TriggerBusService, WorkflowDispatcher } from './trigger-bus.service';
import { IROpcode, TriggerDescriptor, LLMIntermediateRepresentation } from '../compiler/interfaces/ir.interface';
import { CENTRAL_NODE_ID } from '../nodes/interfaces/node-capability.interface';
import { VaultService } from '../runtime/vault.service';

// ── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class TriggerActivationService {
  private readonly logger = new Logger(TriggerActivationService.name);

  /**
   * Active activation records indexed by activationId.
   * Key: activationId  Value: activation record
   */
  private activations = new Map<string, TriggerActivationRecord>();

  /**
   * Map workflowId → Set of activationIds owned by that workflow.
   * Used for fast deactivation of all triggers on undeploy.
   */
  private workflowActivations = new Map<string, Set<string>>();

  /**
   * Discovered ITriggerDriver implementations (multi-provider injection).
   */
  private readonly driverMap = new Map<string, ITriggerDriver>();

  constructor(
    @Inject(TRIGGER_DRIVER_TOKEN)
    private readonly drivers: ITriggerDriver[],
    private readonly bus: TriggerBusService,
    @Optional() private readonly vault?: VaultService,
  ) {
    // Index all drivers by their driverId
    for (const driver of (Array.isArray(drivers) ? drivers : [])) {
      this.driverMap.set(driver.driverId, driver);
      this.logger.log(`[TriggerActivation] Driver registered: ${driver.driverId} (${driver.displayName})`);
    }
  }

  // ── Workflow activation ────────────────────────────────────────────────

  /**
   * Scan the compiled LLM-IR for TRIGGER instructions and activate each one.
   * Registers the provided dispatcher for the workflowId so the bus routes
   * events to it.
   *
   * @param ir          The compiled LLM-IR (after Stage 9)
   * @param dispatcher  Called whenever a trigger fires for this workflow
   */
  async activateWorkflow(
    ir: LLMIntermediateRepresentation,
    dispatcher: WorkflowDispatcher,
  ): Promise<string[]> {
    const workflowId  = ir.metadata.workflowId ?? 'unknown';
    const version     = ir.metadata.workflowVersion ?? 0;
    const activationIds: string[] = [];

    // Register dispatcher FIRST so bus can route immediately
    this.bus.registerDispatcher(workflowId, dispatcher);

    for (const instr of ir.instructions) {
      if (instr.opcode !== IROpcode.TRIGGER) continue;

      const desc = instr.operands as TriggerDescriptor | undefined;
      if (!desc?.driverId) {
        this.logger.warn(`[TriggerActivation] TRIGGER instruction missing driverId — skipping`);
        continue;
      }

      const nodeId = instr.targetNodeId ?? CENTRAL_NODE_ID;

      if (nodeId === CENTRAL_NODE_ID || nodeId === 'central') {
        // ── LOCAL activation ────────────────────────────────────────────
        const activationId = await this._activateLocal(desc, workflowId, version, nodeId);
        if (activationId) {
          activationIds.push(activationId);
          this._trackWorkflowActivation(workflowId, activationId);
        }
      } else {
        // ── REMOTE activation ───────────────────────────────────────────
        const activationId = await this._activateRemote(desc, workflowId, version, nodeId);
        if (activationId) {
          activationIds.push(activationId);
          this._trackWorkflowActivation(workflowId, activationId);
        }
      }
    }

    this.logger.log(
      `[TriggerActivation] Workflow ${workflowId} v${version}: ` +
      `${activationIds.length} trigger(s) activated`,
    );

    return activationIds;
  }

  /**
   * Deactivate ALL triggers for a given workflow.
   * Call when a workflow is archived, replaced by a new version, or stopped.
   */
  deactivateWorkflow(workflowId: string): void {
    const ids = this.workflowActivations.get(workflowId);
    if (!ids) return;

    for (const activationId of ids) {
      this._deactivateOne(activationId);
    }

    this.workflowActivations.delete(workflowId);
    this.bus.unregisterDispatcher(workflowId);

    this.logger.log(
      `[TriggerActivation] Workflow ${workflowId}: all triggers deactivated`,
    );
  }

  /**
   * Deactivate a single trigger activation by ID.
   */
  deactivateOne(activationId: string): void {
    this._deactivateOne(activationId);
  }

  // ── Status & discovery ─────────────────────────────────────────────────

  /** List all registered driver IDs */
  getRegisteredDriverIds(): string[] {
    return Array.from(this.driverMap.keys());
  }

  /** Get a driver by ID */
  getDriver(driverId: string): ITriggerDriver | undefined {
    return this.driverMap.get(driverId);
  }

  /** List all active activations */
  listActivations(): TriggerActivationRecord[] {
    return Array.from(this.activations.values());
  }

  /** List activations for a specific workflow */
  listWorkflowActivations(workflowId: string): TriggerActivationRecord[] {
    const ids = this.workflowActivations.get(workflowId) ?? new Set();
    return Array.from(ids)
      .map(id => this.activations.get(id))
      .filter(Boolean) as TriggerActivationRecord[];
  }

  /** Health check: which drivers are currently healthy */
  getDriversHealth(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const [id, driver] of this.driverMap) {
      result[id] = driver.isHealthy();
    }
    return result;
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private async _activateLocal(
    desc: TriggerDescriptor,
    workflowId: string,
    version: number,
    nodeId: string,
  ): Promise<string | null> {
    const driver = this.driverMap.get(desc.driverId);
    if (!driver) {
      this.logger.error(
        `[TriggerActivation] LOCAL driver '${desc.driverId}' not registered. ` +
        `Available: [${Array.from(this.driverMap.keys()).join(', ')}]`,
      );
      return null;
    }

    const activationId = uuidv4();

    // Resolve vault credentials if needed
    let config = { ...desc.driverConfig };
    if (desc.credentialsVaultPath && this.vault) {
      try {
        const secret = await this.vault.fetchSecret(desc.credentialsVaultPath);
        config = { ...config, _credentials: secret };
      } catch (err: any) {
        this.logger.warn(
          `[TriggerActivation] Vault fetch failed for ${desc.credentialsVaultPath}: ${err?.message}`,
        );
      }
    }

    // Inject compiled filter
    if (desc.compiledFilter?.expression) {
      config.compiledFilter = desc.compiledFilter.expression;
    }

    // Inject debounce
    if (desc.debounceMs) {
      config.debounceMs = desc.debounceMs;
    }

    const stream$ = driver.activate(activationId, config, workflowId, version);
    this.bus.addStream(activationId, stream$, desc.debounceMs ?? 0);

    const record: TriggerActivationRecord = {
      activationId,
      driverId:        desc.driverId,
      workflowId,
      workflowVersion: version,
      nodeId,
      config,
      activatedAt:     new Date(),
      fireCount:       0,
    };
    this.activations.set(activationId, record);

    this.logger.log(
      `[TriggerActivation] LOCAL: ${desc.driverId} → workflow ${workflowId} ` +
      `(activation: ${activationId})`,
    );

    return activationId;
  }

  private async _activateRemote(
    desc: TriggerDescriptor,
    workflowId: string,
    version: number,
    nodeId: string,
  ): Promise<string | null> {
    // Remote activation: send payload via NodesGateway WebSocket
    // The remote Rust SVM activates its native driver and pushes events back
    const activationId = uuidv4();

    const payload: RemoteTriggerActivationPayload = {
      activationId,
      driverId:        desc.driverId,
      driverConfig:    desc.driverConfig,
      workflowId,
      workflowVersion: version,
      compiledFilter:  desc.compiledFilter?.expression,
      callbackWsChannel: `trigger_events:${workflowId}`,
    };

    // NodesGateway is injected lazily to avoid circular dep
    // In production: this.nodesGateway.sendToNode(nodeId, 'trigger:activate', payload)
    this.logger.log(
      `[TriggerActivation] REMOTE: ${desc.driverId} → node ${nodeId} ` +
      `workflow ${workflowId} (activation: ${activationId}) ` +
      `— payload ready, NodesGateway dispatch pending`,
    );

    const record: TriggerActivationRecord = {
      activationId,
      driverId:        desc.driverId,
      workflowId,
      workflowVersion: version,
      nodeId,
      config:          desc.driverConfig,
      activatedAt:     new Date(),
      fireCount:       0,
    };
    this.activations.set(activationId, record);

    return activationId;
  }

  private _deactivateOne(activationId: string): void {
    const record = this.activations.get(activationId);
    if (!record) return;

    // Stop bus stream
    this.bus.removeStream(activationId);

    // Tell driver to release its connection
    const driver = this.driverMap.get(record.driverId);
    driver?.deactivate(activationId);

    this.activations.delete(activationId);
    this.logger.log(
      `[TriggerActivation] Deactivated: ${activationId} ` +
      `(${record.driverId} → ${record.workflowId})`,
    );
  }

  private _trackWorkflowActivation(workflowId: string, activationId: string): void {
    if (!this.workflowActivations.has(workflowId)) {
      this.workflowActivations.set(workflowId, new Set());
    }
    this.workflowActivations.get(workflowId)!.add(activationId);
  }
}
