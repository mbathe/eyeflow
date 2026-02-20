/**
 * Trigger Driver Registry Service
 *
 * Provides a lookup interface over all registered ITriggerDriver instances.
 * Drivers are injected via the TRIGGER_DRIVER_TOKEN multi-provider.
 *
 * Consumer code should use TriggerDriverRegistryService for read-only discovery
 * and TriggerActivationService for actual activation.
 */

import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { NodeTier } from '../nodes/interfaces/node-capability.interface';
import {
  ITriggerDriver,
  TRIGGER_DRIVER_TOKEN,
  TriggerDriverManifest,
  TriggerEvent,
} from './interfaces/trigger-driver.interface';

@Injectable()
export class TriggerDriverRegistryService {
  private readonly logger = new Logger(TriggerDriverRegistryService.name);
  private readonly driverMap = new Map<string, ITriggerDriver>();

  constructor(
    @Optional()
    @Inject(TRIGGER_DRIVER_TOKEN)
    drivers: ITriggerDriver[] | null,
  ) {
    for (const driver of (drivers ?? [])) {
      if (this.driverMap.has(driver.driverId)) {
        this.logger.warn(
          `[DriverRegistry] Duplicate driverId '${driver.driverId}' — last one wins`,
        );
      }
      this.driverMap.set(driver.driverId, driver);
    }
    this.logger.log(
      `[DriverRegistry] ${this.driverMap.size} driver(s) registered: ` +
      `[${Array.from(this.driverMap.keys()).join(', ')}]`,
    );
  }

  /** Get a driver by its driverId */
  get(driverId: string): ITriggerDriver | undefined {
    return this.driverMap.get(driverId);
  }

  /** Get all registered drivers */
  getAll(): ITriggerDriver[] {
    return Array.from(this.driverMap.values());
  }

  /** Get all drivers that support a given NodeTier */
  getForTier(tier: NodeTier): ITriggerDriver[] {
    return this.getAll().filter(d => d.supportedTiers.includes(tier));
  }

  /** Get all driverIds that a node can use based on its declared support list  */
  getForNode(supportedIds: string[]): ITriggerDriver[] {
    if (supportedIds.includes('*')) return this.getAll();
    return supportedIds
      .map(id => this.driverMap.get(id))
      .filter(Boolean) as ITriggerDriver[];
  }

  /** Check if a driver is registered and healthy */
  isAvailable(driverId: string): boolean {
    const driver = this.driverMap.get(driverId);
    return !!driver && driver.isHealthy();
  }

  /** Return the config schema for a driver (for compiler UI or validation) */
  getConfigSchema(driverId: string): Record<string, any> | null {
    return this.driverMap.get(driverId)?.configSchema ?? null;
  }

  /**
   * Find all drivers that declared a given protocol as required.
   * Used by Stage 9 to find candidate nodes for a TRIGGER instruction.
   */
  getByProtocol(protocol: string): ITriggerDriver[] {
    return this.getAll().filter(
      d => d.requiredProtocols?.includes(protocol),
    );
  }

  /** Health summary */
  healthSummary(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const [id, driver] of this.driverMap) {
      result[id] = driver.isHealthy();
    }
    return result;
  }

  // ── Remote driver registration ──────────────────────────────────────────

  /**
   * Register a custom driver that lives on a remote node (not a NestJS provider).
   *
   * Called by NodesGateway / NodesController when a node registers and includes
   * TriggerDriverManifest entries in its payload.
   *
   * A lightweight proxy is created so:
   *  – TriggerDriverRegistryService.get(driverId) returns it
   *  – TriggerDriverRegistryService.getConfigSchema(driverId) returns its schema
   *  – Stage 9 can find the driver and the node that owns it
   *  – The compiler UI can present the driver and its config form
   *
   * The proxy's activate() is intentionally a no-op: actual activation is
   * handled by TriggerActivationService which pushes a
   * RemoteTriggerActivationPayload via NodesGateway WebSocket to the node.
   *
   * @param manifest  Driver metadata from the registration payload
   * @param nodeId    The node that owns this driver (set as sourceNodeId)
   */
  registerRemoteDriver(manifest: TriggerDriverManifest, nodeId: string): void {
    const fullManifest: TriggerDriverManifest = { ...manifest, sourceNodeId: nodeId };

    if (this.driverMap.has(manifest.driverId)) {
      this.logger.log(
        `[DriverRegistry] Remote driver '${manifest.driverId}' from node '${nodeId}' ` +
        `overwrites existing entry`,
      );
    }

    const proxy = this._buildRemoteProxy(fullManifest);
    this.driverMap.set(manifest.driverId, proxy);

    this.logger.log(
      `[DriverRegistry] Remote driver registered: '${manifest.driverId}' ` +
      `(${manifest.displayName}) from node '${nodeId}'`,
    );
  }

  /**
   * Remove all remote drivers that were registered from a given node.
   * Call when a node goes OFFLINE to avoid stale driver entries.
   */
  unregisterRemoteDriversForNode(nodeId: string): void {
    const toRemove: string[] = [];
    for (const [driverId, driver] of this.driverMap) {
      if ((driver as RemoteDriverProxy)._sourceNodeId === nodeId) {
        toRemove.push(driverId);
      }
    }
    for (const id of toRemove) {
      this.driverMap.delete(id);
      this.logger.log(
        `[DriverRegistry] Removed remote driver '${id}' (node '${nodeId}' went offline)`,
      );
    }
  }

  /**
   * Return the manifest for a remote driver, or null if it's a local provider.
   * Useful for the compiler UI to distinguish local vs remote drivers.
   */
  getRemoteManifest(driverId: string): TriggerDriverManifest | null {
    const driver = this.driverMap.get(driverId);
    return (driver as RemoteDriverProxy)?._manifest ?? null;
  }

  /** List all drivers, annotated with whether they are local (NestJS) or remote (node manifest) */
  listAll(): Array<{ driverId: string; displayName: string; isRemote: boolean; sourceNodeId?: string }> {
    return Array.from(this.driverMap.values()).map(d => ({
      driverId:     d.driverId,
      displayName:  d.displayName,
      isRemote:     !!(d as RemoteDriverProxy)._sourceNodeId,
      sourceNodeId: (d as RemoteDriverProxy)._sourceNodeId,
    }));
  }

  // ── Remote proxy factory ─────────────────────────────────────────────────

  private _buildRemoteProxy(manifest: TriggerDriverManifest): RemoteDriverProxy {
    return new RemoteDriverProxy(manifest);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Remote Driver Proxy
//
// Represents a driver that lives on a remote node.
// It participates in all discovery queries (getForTier, getConfigSchema, etc.)
// but its activate() is intentionally inert:
//   TriggerActivationService detects _sourceNodeId !== null and routes
//   activation via RemoteTriggerActivationPayload through NodesGateway.
// ──────────────────────────────────────────────────────────────────────────

class RemoteDriverProxy implements ITriggerDriver {
  readonly driverId:          string;
  readonly displayName:       string;
  readonly supportedTiers:    NodeTier[];
  readonly configSchema:      Record<string, any>;
  readonly requiredProtocols: string[];

  /** Non-null on remote proxies — the nodeId that owns this driver */
  readonly _sourceNodeId: string;
  /** Full manifest for compiler/UI consumption */
  readonly _manifest: TriggerDriverManifest;

  constructor(manifest: TriggerDriverManifest) {
    this._manifest      = manifest;
    this._sourceNodeId  = manifest.sourceNodeId!;
    this.driverId       = manifest.driverId;
    this.displayName    = manifest.displayName;
    this.configSchema   = manifest.configSchema;
    this.requiredProtocols = manifest.requiredProtocols ?? [];

    // Map string tier names back to NodeTier enum values
    this.supportedTiers = (manifest.supportedTiers as string[]).map(t => {
      const tier = NodeTier[t as keyof typeof NodeTier];
      return tier ?? NodeTier.LINUX; // default to LINUX if unknown
    });
  }

  // Remote drivers are activated via NodesGateway — activate() is a no-op here.
  // TriggerActivationService checks _sourceNodeId before calling activate().
  activate(
    _activationId: string,
    _config: Record<string, any>,
    _workflowId: string,
    _version: number,
  ): Observable<TriggerEvent> {
    // This should never be called directly — TriggerActivationService
    // routes remote drivers through NodesGateway.
    return new Observable(observer =>
      observer.error(
        new Error(
          `Remote driver '${this.driverId}' on node '${this._sourceNodeId}' ` +
          `cannot be activated directly on CENTRAL. ` +
          `Use TriggerActivationService which routes via NodesGateway.`,
        ),
      ),
    );
  }

  deactivate(_activationId: string): void { /* no-op: node handles this */ }
  deactivateAll(): void { /* no-op */ }

  isHealthy(): boolean {
    // Health delegates to the node's status — considered healthy until node goes OFFLINE
    return true;
  }
}
