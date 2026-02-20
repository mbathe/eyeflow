/**
 * Nodes Gateway (WebSocket)
 *
 * Handles persistent WebSocket connections from edge nodes (Raspberry Pi, MCUs via proxy).
 * Each connecting node:
 *  1. Identifies itself with a registration payload
 *  2. Sends periodic heartbeats
 *  3. Receives SliceDispatchPayload messages from the CENTRAL
 *  4. Returns SliceResultPayload after execution
 *
 * WebSocket path: ws://server:PORT/nodes
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, Optional } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { NodeRegistryService } from './node-registry.service';
import { NodeDispatcherService } from './node-dispatcher.service';
import {
  NodeRegistrationPayload,
  NodeHeartbeat,
} from './interfaces/node-capability.interface';
import { SliceResultPayload } from '../compiler/interfaces/distributed-execution.interface';
import { TriggerDriverRegistryService } from '../triggers/trigger-driver-registry.service';
import type { PropagatedEventService } from '../events/propagated-event.service';
import type { PropagatedEvent } from '../compiler/interfaces/event-state-machine.interface';

@WebSocketGateway({ namespace: '/nodes' })
export class NodesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NodesGateway.name);

  /** Map socket.id → nodeId */
  private readonly socketToNode = new Map<string, string>();

  constructor(
    private readonly registry: NodeRegistryService,
    private readonly dispatcher: NodeDispatcherService,
    @Optional() private readonly triggerDriverRegistry?: TriggerDriverRegistryService,
    @Optional() private readonly propagatedEventService?: PropagatedEventService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  handleConnection(client: Socket) {
    this.logger.log(`[NodesGateway] Client connected: ${client.id} from ${client.handshake.address}`);
  }

  handleDisconnect(client: Socket) {
    const nodeId = this.socketToNode.get(client.id);
    if (nodeId) {
      this.dispatcher.removeConnection(nodeId);
      this.socketToNode.delete(client.id);
      // Remove any custom drivers that were registered by this node
      this.triggerDriverRegistry?.unregisterRemoteDriversForNode(nodeId);
      this.logger.warn(`[NodesGateway] Node disconnected: ${nodeId}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Messages from edge nodes
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * REGISTER — first message a node sends after connecting.
   * Returns the registered capabilities back to the node as confirmation.
   */
  @SubscribeMessage('register')
  handleRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: NodeRegistrationPayload
  ) {
    const node = this.registry.register(payload);
    this.socketToNode.set(client.id, payload.nodeId);
    this.dispatcher.registerConnection(payload.nodeId, client);

    // Forward custom driver manifests to TriggerDriverRegistryService
    if (payload.triggerDrivers?.length && this.triggerDriverRegistry) {
      for (const manifest of payload.triggerDrivers) {
        this.triggerDriverRegistry.registerRemoteDriver(manifest, payload.nodeId);
      }
      this.logger.log(
        `[NodesGateway] Node "${payload.nodeId}" declared ` +
        `${payload.triggerDrivers.length} custom trigger driver(s): ` +
        `[${payload.triggerDrivers.map(d => d.driverId).join(', ')}]`,
      );
    }

    this.logger.log(`[NodesGateway] Node "${payload.nodeId}" registered via WebSocket`);

    return { event: 'registered', data: { nodeId: node.nodeId, status: node.status } };
  }

  /**
   * HEARTBEAT — periodic status update from edge node.
   */
  @SubscribeMessage('heartbeat')
  handleHeartbeat(
    @ConnectedSocket() _client: Socket,
    @MessageBody() hb: NodeHeartbeat
  ) {
    this.registry.heartbeat(hb);
  }

  /**
   * SLICE_RESULT — edge node finished executing a slice and sends back results.
   * The NodeDispatcherService resolves the pending promise.
   */
  @SubscribeMessage('slice_result')
  handleSliceResult(
    @ConnectedSocket() _client: Socket,
    @MessageBody() result: SliceResultPayload
  ) {
    this.logger.log(
      `[NodesGateway] Slice result from ${result.nodeId}: slice="${result.sliceId}" status=${result.status} in ${result.durationMs}ms`
    );
    this.dispatcher.onRemoteResult(result);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Distributed Event State Machine messages
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * PROPAGATED_EVENT — edge node's FSM reached FULL_MATCH (or a partial threshold)
   * and emits an enriched PropagatedEvent toward CENTRAL.
   *
   * The event is routed to PropagatedEventService.handlePropagatedEvent() which
   * will execute the matching HANDLE_PROPAGATED handler actions (alerts, tickets,
   * cross-node REMOTE_COMMANDs, etc.)
   */
  @SubscribeMessage('propagated_event')
  async handlePropagatedEvent(
    @ConnectedSocket() client: Socket,
    @MessageBody() event: PropagatedEvent,
  ) {
    const nodeId = this.socketToNode.get(client.id) ?? 'unknown';
    this.logger.log(
      `[NodesGateway] propagated_event from node="${nodeId}" ` +
      `machine="${event.machineId}" eventId="${event.eventId}" ` +
      `satisfaction=${event.satisfactionLevel.toFixed(2)}`,
    );

    if (!this.propagatedEventService) {
      this.logger.warn(
        '[NodesGateway] PropagatedEventService not injected — ' +
        'EventsModule may not be imported in NodesModule. Event dropped.',
      );
      return { event: 'propagated_event_ack', data: { status: 'NOT_HANDLED' } };
    }

    try {
      await this.propagatedEventService.handlePropagatedEvent(event);
      return { event: 'propagated_event_ack', data: { status: 'OK', eventId: event.eventId } };
    } catch (err: any) {
      this.logger.error(
        `[NodesGateway] Error handling propagated_event "${event.eventId}": ${err.message}`,
      );
      return {
        event: 'propagated_event_ack',
        data: { status: 'ERROR', eventId: event.eventId, error: err.message },
      };
    }
  }

  /**
   * REMOTE_COMMAND_ACK — edge node acknowledges a REMOTE_COMMAND sent by CENTRAL.
   * Logged for audit; future: resolve pending ack promise per commandId.
   */
  @SubscribeMessage('remote_command_ack')
  handleRemoteCommandAck(
    @ConnectedSocket() client: Socket,
    @MessageBody() ack: { commandId: string; status: 'OK' | 'FAILED'; error?: string },
  ) {
    const nodeId = this.socketToNode.get(client.id) ?? 'unknown';
    if (ack.status === 'OK') {
      this.logger.log(
        `[NodesGateway] REMOTE_COMMAND_ACK from node="${nodeId}" commandId="${ack.commandId}" → OK`,
      );
    } else {
      this.logger.error(
        `[NodesGateway] REMOTE_COMMAND_ACK from node="${nodeId}" commandId="${ack.commandId}" ` +
        `→ FAILED: ${ack.error}`,
      );
    }
    // TODO: add ack resolution here when ack-timeout tracking is implemented
  }
}
