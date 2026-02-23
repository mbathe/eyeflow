/**
 * Node Dispatcher Service
 *
 * Handles the actual sending of ExecutionSlices to remote nodes and collecting results.
 *
 * Transport:
 *  – WebSocket TLS (persistent connection, preferred for low-latency edge nodes)
 *  – HTTP REST fallback (for nodes that don't maintain a WebSocket connection)
 *
 * The dispatcher is used ONLY by the SemanticVirtualMachine during distributed execution.
 * It never calls the LLM — it only moves bytecode slices and results.
 *
 * Future: replace HTTP stub with actual WebSocket TLS connection management.
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import axios from 'axios';
import * as WebSocket from 'ws';
import { NodeRegistryService } from './node-registry.service';
import {
  SliceDispatchPayload,
  SliceResultPayload,
} from '../compiler/interfaces/distributed-execution.interface';

/** In-memory map of nodeId → WebSocket connection (Socket.io socket OR outbound ws.WebSocket) */
type WsConnection = any; // Socket.io Socket (inbound) | ws.WebSocket (outbound)

@Injectable()
export class NodeDispatcherService implements OnModuleDestroy {
  private readonly logger = new Logger(NodeDispatcherService.name);

  /** Active WebSocket connections keyed by nodeId */
  private readonly wsConnections = new Map<string, WsConnection>();

  /** Pending result callbacks keyed by `planId:sliceId` */
  private readonly pendingCallbacks = new Map<
    string,
    { resolve: (r: SliceResultPayload) => void; reject: (e: Error) => void; timeoutHandle: NodeJS.Timeout }
  >();

  /** Track which connections are outbound (owned by us — must be cleaned up on destroy) */
  private readonly outboundConnections = new Set<string>();

  constructor(private readonly nodeRegistry: NodeRegistryService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Main dispatch API
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Dispatch a slice to a remote node and return a Promise that resolves
   * when the node sends back the SliceResultPayload.
   *
   * Strategy:
   *  1. If an active WebSocket connection exists → send via WebSocket
   *  2. Otherwise → HTTP POST to node's REST endpoint
   *  3. If node is OFFLINE → throw immediately (caller handles fallback)
   */
  async dispatch(
    nodeId: string,
    payload: SliceDispatchPayload
  ): Promise<SliceResultPayload> {
    const node = this.nodeRegistry.getNode(nodeId);

    if (!node) {
      throw new Error(`[Dispatcher] Unknown node: ${nodeId}`);
    }

    if (node.status === 'OFFLINE') {
      throw new Error(`[Dispatcher] Node ${nodeId} is OFFLINE`);
    }

    this.logger.log(
      `[Dispatcher] Dispatching slice "${payload.sliceId}" to ${nodeId} (${payload.instructions.length} instructions)`
    );

    // Try WebSocket first (inbound Socket.io or outbound ws.WebSocket)
    let ws = this.wsConnections.get(nodeId);
    if (!ws && node.wsUrl) {
      // No inbound connection — try to establish outbound TLS WebSocket
      ws = await this.ensureOutboundConnection(nodeId, node.wsUrl);
    }

    if (ws) {
      return this.dispatchViaWebSocket(nodeId, payload, ws);
    }

    return this.dispatchViaHTTP(nodeId, payload);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Outbound WebSocket TLS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Open an outbound WebSocket TLS connection to a node that exposes its own
   * WS endpoint (e.g. edge nodes that cannot initiate an inbound connection).
   *
   * The opened socket is stored in wsConnections and flagged as outbound so
   * it can be closed when the module is destroyed or the node goes offline.
   *
   * Returns the live WebSocket on success, null on failure (fall through to HTTP).
   */
  private async ensureOutboundConnection(
    nodeId: string,
    wsUrl: string,
  ): Promise<WebSocket.WebSocket | null> {
    return new Promise((resolve) => {
      this.logger.log(
        `[Dispatcher] Opening outbound WebSocket TLS to ${nodeId} at ${wsUrl}`,
      );

      const socket = new WebSocket.WebSocket(wsUrl, {
        handshakeTimeout: 5000,
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      });

      const connectTimeout = setTimeout(() => {
        socket.terminate();
        this.logger.warn(
          `[Dispatcher] Outbound WebSocket timeout connecting to ${nodeId} — falling back to HTTP`,
        );
        resolve(null);
      }, 5000);

      socket.once('open', () => {
        clearTimeout(connectTimeout);
        this.wsConnections.set(nodeId, socket);
        this.outboundConnections.add(nodeId);
        this.logger.log(`[Dispatcher] Outbound WebSocket open to ${nodeId}`);

        // Forward incoming slice results to the standard dispatch callback handler
        socket.on('message', (data: WebSocket.RawData) => {
          try {
            const msg = JSON.parse(
              typeof data === 'string' ? data : data.toString(),
            ) as { type?: string; payload?: SliceResultPayload };
            if (msg.type === 'SLICE_RESULT' && msg.payload) {
              this.onRemoteResult(msg.payload);
            }
          } catch {
            // Ignore unparseable frames
          }
        });

        socket.on('close', () => {
          this.removeConnection(nodeId);
          this.logger.warn(`[Dispatcher] Outbound WebSocket closed for ${nodeId}`);
        });

        socket.on('error', (err) => {
          this.logger.error(
            `[Dispatcher] Outbound WebSocket error for ${nodeId}: ${err.message}`,
          );
        });

        resolve(socket);
      });

      socket.once('error', (err) => {
        clearTimeout(connectTimeout);
        this.logger.warn(
          `[Dispatcher] Cannot open outbound WebSocket to ${nodeId} (${err.message}) — falling back to HTTP`,
        );
        resolve(null);
      });
    });
  }

  /**
   * Clean up all outbound WebSocket connections on module shutdown.
   */
  onModuleDestroy(): void {
    for (const nodeId of this.outboundConnections) {
      const ws = this.wsConnections.get(nodeId);
      if (ws && typeof ws.terminate === 'function') {
        ws.terminate();
      }
    }
    this.outboundConnections.clear();
    this.wsConnections.clear();
    this.logger.log('[Dispatcher] All outbound WebSocket connections closed');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // WebSocket dispatch
  // ──────────────────────────────────────────────────────────────────────────

  private dispatchViaWebSocket(
    nodeId: string,
    payload: SliceDispatchPayload,
    ws: WsConnection
  ): Promise<SliceResultPayload> {
    return new Promise((resolve, reject) => {
      const callbackKey = `${payload.planId}:${payload.sliceId}`;

      const timeoutHandle = setTimeout(() => {
        this.pendingCallbacks.delete(callbackKey);
        reject(new Error(`[Dispatcher] Slice "${payload.sliceId}" on ${nodeId} timed out`));
      }, payload.timeoutMs);

      this.pendingCallbacks.set(callbackKey, { resolve, reject, timeoutHandle });

      try {
        ws.send(JSON.stringify({ type: 'EXECUTE_SLICE', payload }));
        this.logger.debug(`[Dispatcher] Sent slice "${payload.sliceId}" via WebSocket to ${nodeId}`);
      } catch (err: any) {
        clearTimeout(timeoutHandle);
        this.pendingCallbacks.delete(callbackKey);
        reject(new Error(`[Dispatcher] WebSocket send failed for ${nodeId}: ${err.message}`));
      }
    });
  }

  /**
   * Called when a WebSocket message arrives from a remote node.
   * The gateway (NodeGateway) calls this method on incoming results.
   */
  onRemoteResult(result: SliceResultPayload): void {
    const key = `${result.planId}:${result.sliceId}`;
    const pending = this.pendingCallbacks.get(key);

    if (!pending) {
      this.logger.warn(`[Dispatcher] Received result for unknown key: ${key}`);
      return;
    }

    clearTimeout(pending.timeoutHandle);
    this.pendingCallbacks.delete(key);

    if (result.status === 'SUCCESS') {
      pending.resolve(result);
    } else {
      pending.reject(
        new Error(`[Dispatcher] Remote slice failed on ${result.nodeId}: ${result.error}`)
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HTTP REST dispatch (fallback when no persistent WS)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * HTTP fallback: POST the slice payload to the node's /execute-slice endpoint.
   * The node executes the slice synchronously and returns the result directly.
   *
   * This is less efficient than WebSocket (blocking the HTTP connection)
   * but works for nodes that only expose an HTTP API (e.g., Docker containers,
   * Linux nodes without a persistent connection).
   */
  private async dispatchViaHTTP(
    nodeId: string,
    payload: SliceDispatchPayload
  ): Promise<SliceResultPayload> {
    const node = this.nodeRegistry.getNode(nodeId)!;
    // Node URL convention: stored in registry under node.label as "http://host:port"
    // In production, store this in the NodeCapabilities registration payload.
    const nodeUrl = this.resolveNodeUrl(nodeId);

    if (!nodeUrl) {
      throw new Error(`[Dispatcher] No URL known for node ${nodeId} — cannot dispatch via HTTP`);
    }

    try {
      const response = await axios.post<SliceResultPayload>(
        `${nodeUrl}/execute-slice`,
        payload,
        {
          timeout: payload.timeoutMs,
          headers: {
            'Content-Type': 'application/json',
            'X-Plan-Id': payload.planId,
            'X-Slice-Id': payload.sliceId,
          },
        }
      );

      this.logger.log(
        `[Dispatcher] HTTP slice "${payload.sliceId}" on ${nodeId} returned status=${response.data.status} in ${response.data.durationMs}ms`
      );

      return response.data;
    } catch (err: any) {
      const msg = err.response?.data?.message ?? err.message;
      throw new Error(`[Dispatcher] HTTP dispatch to ${nodeId} failed: ${msg}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // WebSocket connection management
  // ──────────────────────────────────────────────────────────────────────────

  registerConnection(nodeId: string, ws: WsConnection): void {
    this.wsConnections.set(nodeId, ws);
    this.logger.log(`[Dispatcher] WebSocket connection registered for node ${nodeId}`);
  }

  removeConnection(nodeId: string): void {
    this.wsConnections.delete(nodeId);
    this.nodeRegistry.markOffline(nodeId);
    this.logger.warn(`[Dispatcher] WebSocket connection lost for node ${nodeId}`);
  }

  isConnected(nodeId: string): boolean {
    return this.wsConnections.has(nodeId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Raw event emission (used by REMOTE_COMMAND, deploy_fsm, propagated_event ack)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Emit a named Socket.io event to a specific node.
   * Fire-and-forget — does NOT wait for a response.
   * Returns false if the node has no active WebSocket connection.
   */
  emitToNode(nodeId: string, event: string, payload: unknown): boolean {
    const ws = this.wsConnections.get(nodeId);
    if (!ws) {
      this.logger.warn(`[Dispatcher] Cannot emit "${event}" to ${nodeId} — no active WebSocket`);
      return false;
    }
    try {
      // Socket.io Socket: use ws.emit(event, data)
      if (typeof ws.emit === 'function') {
        ws.emit(event, payload);
      } else {
        ws.send(JSON.stringify({ event, payload }));
      }
      this.logger.debug(`[Dispatcher] Emitted "${event}" to node "${nodeId}"`);
      return true;
    } catch (err: any) {
      this.logger.error(`[Dispatcher] Failed to emit "${event}" to ${nodeId}: ${err.message}`);
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Resolve the HTTP base URL for a node.
   * Uses the node's registered baseUrl field (preferred).
   * Legacy fallback: label starting with 'http' (preserved for compatibility).
   * Environment variable override: NODE_URL_<nodeId>.
   */
  private resolveNodeUrl(nodeId: string): string | null {
    const node = this.nodeRegistry.getNode(nodeId);
    if (!node) return null;

    // Primary: dedicated baseUrl field on NodeCapabilities
    if (node.baseUrl) return node.baseUrl;

    // Legacy: label used as URL (backward compat with nodes registered before baseUrl existed)
    if (node.label.startsWith('http://') || node.label.startsWith('https://')) {
      return node.label;
    }

    // Env override: NODE_URL_NODEID_WITH_DASHES_AS_UNDERSCORES
    const envKey = `NODE_URL_${nodeId.toUpperCase().replace(/-/g, '_')}`;
    return process.env[envKey] ?? null;
  }
}
