/**
 * FsmStateRepository
 *
 * Redis-backed persistence for FsmRuntimeState instances.
 *
 * Key schema:
 *   fsm:instance:{instanceId}          → JSON(FsmRuntimeState)   TTL: 86400s (1 day)
 *   fsm:machine:{machineId}:instances  → Redis SET of instanceIds (no TTL)
 *
 * Design principles:
 *  - Timer handles (windowTimerHandle, timeoutHandle, autoResetHandle) are
 *    non-serializable JS objects; they are stripped on save and restored as
 *    `undefined` on load (EventStateMachineService re-arms timers on restart).
 *  - Graceful degradation: if Redis is unavailable, all operations are no-ops
 *    and EventStateMachineService continues with its in-memory Map as sole source.
 *  - Each save() does a full replace (simple, correct for FSM state).
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { FsmRuntimeState } from '../compiler/interfaces/event-state-machine.interface';

/** FsmRuntimeState as written to Redis: timer handles removed, all Dates as ISO strings */
type PersistedFsmState = Omit<
  FsmRuntimeState,
  'windowTimerHandle' | 'pendingApprovalGates' | 'activeSamplingRateChanges'
> & {
  pendingApprovalGates: Record<
    string,
    { gateId: string; registeredAt: string }
  >;
  activeSamplingRateChanges: Array<{
    driverId: string;
    previousDebounceMs: number;
    newDebounceMs: number;
  }>;
};

const INSTANCE_TTL_SECONDS = 86_400; // 24 hours

@Injectable()
export class FsmStateRepository implements OnModuleInit {
  private readonly logger = new Logger(FsmStateRepository.name);
  private client: RedisClientType | null = null;
  private isConnected = false;

  async onModuleInit(): Promise<void> {
    try {
      const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
      this.client = createClient({ url: redisUrl }) as RedisClientType;

      this.client.on('error', (err: Error) => {
        this.logger.warn(`[FsmStateRepo] Redis error: ${err.message}`);
        this.isConnected = false;
      });
      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log('[FsmStateRepo] Redis connected');
      });
      this.client.on('end', () => {
        this.isConnected = false;
      });

      await this.client.connect();
    } catch (err: any) {
      this.logger.warn(
        `[FsmStateRepo] Redis unavailable — FSM state will NOT be persisted. (${err.message})`,
      );
      this.isConnected = false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Write
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Persist an FSM instance state (full replace).
   * Automatically strips non-serializable timer handles.
   */
  async save(state: FsmRuntimeState): Promise<void> {
    if (!this.isConnected || !this.client) return;

    try {
      const persisted = this.serialize(state);
      const json = JSON.stringify(persisted);
      const instanceKey = this.instanceKey(state.instanceId);
      const machineKey = this.machineKey(state.machineId);

      // Pipeline: set instance JSON + add to machine index
      await this.client
        .multi()
        .set(instanceKey, json, { EX: INSTANCE_TTL_SECONDS })
        .sAdd(machineKey, state.instanceId)
        .exec();
    } catch (err: any) {
      this.logger.warn(`[FsmStateRepo] save failed: ${err.message}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Read
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Load a single FSM instance by ID.
   * Returns undefined if not found or Redis is unavailable.
   * Timer handles are restored as undefined (re-armed by EventStateMachineService).
   */
  async load(instanceId: string): Promise<FsmRuntimeState | undefined> {
    if (!this.isConnected || !this.client) return undefined;

    try {
      const json = await this.client.get(this.instanceKey(instanceId));
      if (!json) return undefined;
      return this.deserialize(JSON.parse(json) as PersistedFsmState);
    } catch (err: any) {
      this.logger.warn(`[FsmStateRepo] load(${instanceId}) failed: ${err.message}`);
      return undefined;
    }
  }

  /**
   * Load all persisted instances for a given machineId.
   * Used on FSM redeploy to restore in-flight instances.
   */
  async loadAllForMachine(machineId: string): Promise<FsmRuntimeState[]> {
    if (!this.isConnected || !this.client) return [];

    try {
      const instanceIds = await this.client.sMembers(this.machineKey(machineId));
      if (!instanceIds.length) return [];

      const keys = instanceIds.map(id => this.instanceKey(id));
      const values = await this.client.mGet(keys);

      const result: FsmRuntimeState[] = [];
      for (const json of values) {
        if (!json) continue;
        try {
          result.push(this.deserialize(JSON.parse(json) as PersistedFsmState));
        } catch {
          // Skip corrupt entries
        }
      }
      return result;
    } catch (err: any) {
      this.logger.warn(`[FsmStateRepo] loadAllForMachine(${machineId}) failed: ${err.message}`);
      return [];
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Delete
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Remove an FSM instance (called on FULL_MATCH or reset).
   */
  async remove(instanceId: string, machineId: string): Promise<void> {
    if (!this.isConnected || !this.client) return;

    try {
      await this.client
        .multi()
        .del(this.instanceKey(instanceId))
        .sRem(this.machineKey(machineId), instanceId)
        .exec();
    } catch (err: any) {
      this.logger.warn(`[FsmStateRepo] remove(${instanceId}) failed: ${err.message}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  private instanceKey(instanceId: string): string {
    return `fsm:instance:${instanceId}`;
  }

  private machineKey(machineId: string): string {
    return `fsm:machine:${machineId}:instances`;
  }

  /** Strip timer handles before JSON serialisation */
  private serialize(state: FsmRuntimeState): PersistedFsmState {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { windowTimerHandle, pendingApprovalGates, activeSamplingRateChanges, ...rest } = state;

    const persistedGates: PersistedFsmState['pendingApprovalGates'] = {};
    for (const [gateId, gate] of Object.entries(pendingApprovalGates)) {
      persistedGates[gateId] = {
        gateId: gate.gateId,
        registeredAt:
          gate.registeredAt instanceof Date
            ? gate.registeredAt.toISOString()
            : String(gate.registeredAt),
      };
    }

    const persistedSamplingChanges = activeSamplingRateChanges.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ autoResetHandle, ...changeRest }) => changeRest,
    );

    return {
      ...rest,
      pendingApprovalGates: persistedGates,
      activeSamplingRateChanges: persistedSamplingChanges,
    };
  }

  /** Restore after JSON parse: timer handles default to undefined */
  private deserialize(raw: PersistedFsmState): FsmRuntimeState {
    const gates: FsmRuntimeState['pendingApprovalGates'] = {};
    for (const [gateId, gate] of Object.entries(raw.pendingApprovalGates)) {
      gates[gateId] = {
        gateId: gate.gateId,
        registeredAt: new Date(gate.registeredAt),
        timeoutHandle: undefined as any, // will be re-armed by EventStateMachineService
      };
    }

    const samplingChanges: FsmRuntimeState['activeSamplingRateChanges'] = (
      raw.activeSamplingRateChanges ?? []
    ).map(c => ({
      ...c,
      autoResetHandle: undefined as any,
    }));

    return {
      ...(raw as unknown as FsmRuntimeState),
      windowTimerHandle: undefined,
      pendingApprovalGates: gates,
      activeSamplingRateChanges: samplingChanges,
    };
  }
}
