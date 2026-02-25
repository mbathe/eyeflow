import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RealtimeEventsService } from './realtime-events.service';

/**
 * RealtimeGateway — namespace /realtime
 *
 * Server → client events:
 *   rt:suggestions_count   { count: number }
 *   rt:suggestion_new      SuggestionEntity
 *   rt:suggestion_decided  { id: string; status: string }
 *   rt:event_new           { id, severity, message, connectorId, timestamp }
 *   rt:health              { status: 'ok'|'degraded'|'critical'; services: [] }
 *   rt:engine_started      { ts: string }
 *   rt:engine_completed    { ts: string; suggestionsCreated: number; durationMs: number; llmUsed: boolean }
 *   rt:engine_error        { error: string; ts: string }
 *   rt:engine_config       SuggestionEngineConfigEntity (on update)
 *   rt:ping                { ts: number }   (every 30 s)
 *
 * Client → server events:
 *   rt:request_snapshot    {}
 *   rt:subscribe           { rooms: string[] }
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: '*', credentials: false },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private heartbeatInterval?: ReturnType<typeof setInterval>;

  constructor(private readonly bus: RealtimeEventsService) {}

  afterInit() {
    this.logger.log('RealtimeGateway on /realtime');

    this.bus.on('suggestion.created', (s) => {
      this.server.emit('rt:suggestion_new', s);
    });
    this.bus.on('suggestion.decided', (payload) => {
      this.server.emit('rt:suggestion_decided', payload);
    });
    this.bus.on('suggestions.count', (payload) => {
      this.server.emit('rt:suggestions_count', payload);
    });
    this.bus.on('suggestions.snapshot', ({ clientId, data }: { clientId: string; data: unknown }) => {
      const socket = this.server.sockets.sockets.get(clientId);
      if (socket) {
        socket.emit('rt:suggestions_count', { count: (data as { count: number }).count ?? 0 });
        socket.emit('rt:suggestions_stats', data);
      }
    });
    this.bus.on('event.new', (event) => {
      this.server.emit('rt:event_new', event);
    });
    this.bus.on('health.update', (payload) => {
      this.server.emit('rt:health', payload);
    });
    this.bus.on('engine.started', (payload) => {
      this.server.emit('rt:engine_started', payload);
    });
    this.bus.on('engine.completed', (payload) => {
      this.server.emit('rt:engine_completed', payload);
    });
    this.bus.on('engine.error', (payload) => {
      this.server.emit('rt:engine_error', payload);
    });
    this.bus.on('engine.config_updated', (payload) => {
      this.server.emit('rt:engine_config', payload);
    });

    this.heartbeatInterval = setInterval(() => {
      this.server.emit('rt:ping', { ts: Date.now() });
    }, 30_000);
  }

  handleConnection(client: Socket) {
    this.logger.verbose(`WS connect: ${client.id}`);
    this.bus.emit('request.snapshot', { clientId: client.id });
  }

  handleDisconnect(client: Socket) {
    this.logger.verbose(`WS disconnect: ${client.id}`);
  }

  @SubscribeMessage('rt:request_snapshot')
  handleRequestSnapshot(@ConnectedSocket() client: Socket) {
    this.bus.emit('request.snapshot', { clientId: client.id });
    return { ok: true };
  }

  @SubscribeMessage('rt:subscribe')
  handleSubscribe(
    @MessageBody() data: { rooms: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    if (Array.isArray(data?.rooms)) {
      data.rooms.forEach((r) => void client.join(r));
    }
    return { ok: true };
  }
}
