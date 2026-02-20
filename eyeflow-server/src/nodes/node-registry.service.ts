/**
 * Node Registry Service
 *
 * Central catalogue of all registered execution nodes.
 * Nodes register themselves at boot via WebSocket or REST,
 * then send periodic heartbeats to keep their status current.
 *
 * The Stage-9 Distribution Planner queries this service to
 * find the best node for each instruction.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  NodeCapabilities,
  NodeRegistrationPayload,
  NodeHeartbeat,
  NodeTier,
  ServiceFormat,
  PhysicalProtocol,
  CENTRAL_NODE_ID,
  centralNodeProfile,
} from './interfaces/node-capability.interface';

export interface NodeScore {
  nodeId: string;
  score: number;
  reasons: string[];
}

@Injectable()
export class NodeRegistryService implements OnModuleInit {
  private readonly logger = new Logger(NodeRegistryService.name);

  /** In-memory registry — in production back this with Redis or Postgres */
  private readonly nodes = new Map<string, NodeCapabilities>();

  /** Heartbeat timeout: mark node OFFLINE if silent for this many ms */
  private readonly HEARTBEAT_TIMEOUT_MS = 30_000;

  onModuleInit() {
    // Always register the central node itself at startup
    this.nodes.set(CENTRAL_NODE_ID, centralNodeProfile());
    this.logger.log(`[NodeRegistry] Initialized with central node "${CENTRAL_NODE_ID}"`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Registration / Heartbeat
  // ──────────────────────────────────────────────────────────────────────────

  register(payload: NodeRegistrationPayload): NodeCapabilities {
    const existing = this.nodes.get(payload.nodeId);

    const node: NodeCapabilities = {
      ...payload.capabilities,
      nodeId: payload.nodeId,
      label: payload.label,
      tier: payload.tier,
      status: 'ONLINE',
      lastSeenAt: new Date(),
      // Persist custom driver manifests from the registration payload
      triggerDriverManifests: payload.triggerDrivers ?? payload.capabilities.triggerDriverManifests,
    };

    this.nodes.set(payload.nodeId, node);

    if (existing) {
      this.logger.log(`[NodeRegistry] Node re-registered: ${payload.nodeId} (${payload.label})`);
    } else {
      this.logger.log(`[NodeRegistry] New node registered: ${payload.nodeId} [${payload.tier}] — ${payload.label}`);
    }

    return node;
  }

  heartbeat(hb: NodeHeartbeat): void {
    const node = this.nodes.get(hb.nodeId);
    if (!node) {
      this.logger.warn(`[NodeRegistry] Heartbeat from unknown node: ${hb.nodeId}`);
      return;
    }

    node.status = hb.status;
    node.latencyToCentralMs = hb.latencyMs;
    node.lastSeenAt = new Date();
    this.nodes.set(hb.nodeId, node);
  }

  markOffline(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.status = 'OFFLINE';
      this.nodes.set(nodeId, node);
      this.logger.warn(`[NodeRegistry] Node marked OFFLINE: ${nodeId}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Query
  // ──────────────────────────────────────────────────────────────────────────

  getNode(nodeId: string): NodeCapabilities | undefined {
    return this.nodes.get(nodeId);
  }

  getAllNodes(): NodeCapabilities[] {
    return Array.from(this.nodes.values());
  }

  getOnlineNodes(): NodeCapabilities[] {
    return this.getAllNodes().filter(n => n.status === 'ONLINE');
  }

  getNodesByTier(tier: NodeTier): NodeCapabilities[] {
    return this.getOnlineNodes().filter(n => n.tier === tier);
  }

  /** Check and expire stale heartbeats */
  pruneStaleNodes(): void {
    const now = Date.now();
    for (const [id, node] of this.nodes) {
      if (id === CENTRAL_NODE_ID) continue; // central is always considered alive
      const age = now - node.lastSeenAt.getTime();
      if (age > this.HEARTBEAT_TIMEOUT_MS && node.status !== 'OFFLINE') {
        node.status = 'OFFLINE';
        this.nodes.set(id, node);
        this.logger.warn(`[NodeRegistry] Node expired (no heartbeat): ${id}`);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Capability matching — used by Stage 9
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Find all ONLINE nodes that satisfy the given capability requirements.
   * Returns a scored list (highest score first).
   *
   * Scoring: prefer nodes that minimise latency and maximise
   * capability precision (avoid using CENTRAL for trivial tasks).
   */
  findCapableNodes(requirements: {
    formats?: ServiceFormat[];
    protocols?: PhysicalProtocol[];
    connectorId?: string;
    needsVault?: boolean;
    needsInternet?: boolean;
    minMemoryMb?: number;
    preferredTier?: NodeTier;
    /** EMBEDDED_JS: node must have a Node.js runtime */
    hasEmbeddedJsRuntime?: boolean;
    /** LLM_CALL: node must be able to call an LLM */
    hasLLMAccess?: boolean;
  }): NodeScore[] {
    const candidates: NodeScore[] = [];
    this.pruneStaleNodes();

    for (const node of this.getOnlineNodes()) {
      const reasons: string[] = [];
      let score = 100; // start at 100, deduct for overhead
      let eligible = true;

      // ── Hard requirements ────────────────────────────────────────────────

      // Format support
      if (requirements.formats?.length) {
        const supportsAll = requirements.formats.every(
          f => node.supportedFormats.includes(f)
        );
        if (!supportsAll) { eligible = false; }
        else { reasons.push(`formats:${requirements.formats.join(',')}`); }
      }

      // Protocol support
      if (requirements.protocols?.length) {
        const supportsAll = requirements.protocols.every(
          p => node.supportedProtocols.includes(p)
        );
        if (!supportsAll) { eligible = false; }
        else { reasons.push(`protocols:${requirements.protocols.join(',')}`); }
      }

      // Connector availability
      if (requirements.connectorId) {
        const wildcard = node.supportedConnectors.includes('*');
        const specific = node.supportedConnectors.includes(requirements.connectorId);
        if (!wildcard && !specific) { eligible = false; }
        else { reasons.push(`connector:${requirements.connectorId}`); }
      }

      // Vault access
      if (requirements.needsVault && !node.hasVaultAccess) {
        eligible = false;
      }

      // Internet access
      if (requirements.needsInternet && !node.hasInternetAccess) {
        eligible = false;
      }

      // Minimum memory
      if (requirements.minMemoryMb && node.hardware.memoryMb < requirements.minMemoryMb) {
        eligible = false;
      }

      // EmbeddedJS runtime (Node.js required)
      if (requirements.hasEmbeddedJsRuntime && !node.hasEmbeddedJsRuntime) {
        eligible = false;
      }

      // LLM access required
      if (requirements.hasLLMAccess && !node.hasLLMAccess) {
        eligible = false;
      }

      if (!eligible) continue;

      // ── Soft scoring (prefer edge nodes over CENTRAL when possible) ──────

      // Penalise using CENTRAL for work that could run on an edge node
      if (node.tier === NodeTier.CENTRAL && requirements.preferredTier !== NodeTier.CENTRAL) {
        score -= 30; // prefer edge when possible
        reasons.push('central-fallback');
      }

      // Prefer nodes closer to CENTRAL (lower network latency)
      score -= Math.min(node.latencyToCentralMs / 10, 20);

      // Prefer nodes with more free memory (proxy: maxInstructionsPerSlice)
      score += Math.min(node.maxInstructionsPerSlice / 100, 10);

      // Tier preference bonus
      if (requirements.preferredTier && node.tier === requirements.preferredTier) {
        score += 20;
        reasons.push('tier-preferred');
      }

      candidates.push({ nodeId: node.nodeId, score, reasons });
    }

    return candidates.sort((a, b) => b.score - a.score);
  }

  /**
   * Find the single best node for a given set of requirements.
   * Returns CENTRAL_NODE_ID if no specialised node is capable.
   */
  bestNodeFor(requirements: Parameters<NodeRegistryService['findCapableNodes']>[0]): string {
    const ranked = this.findCapableNodes(requirements);
    if (ranked.length === 0) {
      this.logger.warn(
        `[NodeRegistry] No capable node found for ${JSON.stringify(requirements)} — defaulting to CENTRAL`
      );
      return CENTRAL_NODE_ID;
    }
    return ranked[0].nodeId;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Debug
  // ──────────────────────────────────────────────────────────────────────────

  summary(): string {
    const all = this.getAllNodes();
    const online = all.filter(n => n.status === 'ONLINE').length;
    return `NodeRegistry: ${online}/${all.length} nodes online (${Array.from(this.nodes.keys()).join(', ')})`;
  }

  /**
   * Find the first ONLINE node that declared a specific trigger driverId
   * in its supportedTriggerDrivers list.
   *
   * Used by Stage 9 when a TRIGGER instruction specifies a custom/unknown
   * driverId that is not handled by the built-in routing logic.
   * Returns CENTRAL_NODE_ID as fallback if no specialised node is found.
   *
   * Priority:
   *  1. Edge nodes (LINUX / MCU) that explicitly list the driverId
   *  2. CENTRAL if it has wildcard '*' or explicit match
   *  3. CENTRAL as last-resort fallback
   */
  findNodeForTriggerDriver(driverId: string): string {
    const online = this.getOnlineNodes();

    // First pass: prefer edge nodes over CENTRAL
    for (const node of online) {
      if (node.nodeId === CENTRAL_NODE_ID) continue; // skip central in first pass
      if (
        node.supportedTriggerDrivers.includes(driverId) ||
        node.supportedTriggerDrivers.includes('*')
      ) {
        return node.nodeId;
      }
    }

    // Second pass: check CENTRAL
    const central = this.nodes.get(CENTRAL_NODE_ID);
    if (
      central &&
      (central.supportedTriggerDrivers.includes(driverId) ||
       central.supportedTriggerDrivers.includes('*'))
    ) {
      return CENTRAL_NODE_ID;
    }

    this.logger.warn(
      `[NodeRegistry] No node found for trigger driver '${driverId}' — defaulting to CENTRAL`,
    );
    return CENTRAL_NODE_ID;
  }
}
