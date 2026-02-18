import { WebSocketGateway, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { AgentsService } from './agents.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class AgentsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private readonly agentsService: AgentsService) {}

  handleConnection(client: Socket) {
    console.log(`WebSocket connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`WebSocket disconnected: ${client.id}`);
  }

  @SubscribeMessage('agent:register')
  handleAgentRegister(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    const agent = this.agentsService.registerAgent({
      agentName: data.agentName,
      version: data.version,
      capabilities: data.capabilities,
    });

    client.emit('agent:registered', { agent });
    return { success: true, agent };
  }

  @SubscribeMessage('agent:heartbeat')
  handleHeartbeat(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    if (data.agentId) {
      this.agentsService.updateAgentStatus(data.agentId, 'online');
      return { success: true };
    }
    return { success: false };
  }

  @SubscribeMessage('job:complete')
  handleJobComplete(@MessageBody() data: any) {
    console.log(`Job completed: ${data.jobId}`);
    return { success: true };
  }
}
