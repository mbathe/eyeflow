import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
@WebSocketGateway({
  namespace: '/compilation',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})
export class CompilationProgressGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(CompilationProgressGateway.name);
  private clients = new Map<string, Set<string>>(); // compilationId -> set of socket ids

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Clean up
    this.clients.forEach((socketIds) => {
      socketIds.delete(client.id);
    });
  }

  /**
   * Client subscribes to compilation updates for specific compilationId
   */
  @SubscribeMessage('compilation:subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { compilationId: string }
  ) {
    const { compilationId } = data;
    client.join(`compilation:${compilationId}`);

    if (!this.clients.has(compilationId)) {
      this.clients.set(compilationId, new Set());
    }
    const socketIds = this.clients.get(compilationId);
    if (socketIds) {
      socketIds.add(client.id);
    }

    this.logger.log(
      `Client ${client.id} subscribed to compilation: ${compilationId}`
    );

    return { status: 'subscribed', compilationId };
  }

  /**
   * Client unsubscribes from compilation updates
   */
  @SubscribeMessage('compilation:unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { compilationId: string }
  ) {
    const { compilationId } = data;
    client.leave(`compilation:${compilationId}`);

    const socketIds = this.clients.get(compilationId);
    if (socketIds) {
      socketIds.delete(client.id);
    }

    this.logger.log(
      `Client ${client.id} unsubscribed from compilation: ${compilationId}`
    );

    return { status: 'unsubscribed', compilationId };
  }

  /**
   * Emit compilation started event
   */
  emitStarted(compilationId: string, ruleName: string) {
    this.server.to(`compilation:${compilationId}`).emit('compilation:started', {
      compilationId,
      ruleName,
      timestamp: new Date(),
      status: 'STARTED',
    });

    this.logger.log(
      `Emitted compilation:started for ${compilationId} (${ruleName})`
    );
  }

  /**
   * Emit compilation step progress
   */
  emitStepProgress(
    compilationId: string,
    step: number,
    stepName: string,
    message: string,
    progress: number
  ) {
    this.server.to(`compilation:${compilationId}`).emit('compilation:step', {
      compilationId,
      step,
      stepName,
      message,
      progress, // 0-100
      timestamp: new Date(),
    });

    this.logger.debug(
      `Step ${step}/8 (${progress}%) for ${compilationId}: ${stepName}`
    );
  }

  /**
   * Emit compilation succeeded event
   */
  emitSucceeded(
    compilationId: string,
    report: any,
    dag: any,
    ruleName: string
  ) {
    this.server
      .to(`compilation:${compilationId}`)
      .emit('compilation:succeeded', {
        compilationId,
        status: 'SUCCEEDED',
        ruleName,
        compilationReport: report,
        dag, // The DAG structure for visualization
        timestamp: new Date(),
      });

    this.logger.log(`Emitted compilation:succeeded for ${compilationId}`);
  }

  /**
   * Emit compilation failed event with explanation
   */
  emitFailed(
    compilationId: string,
    error: string,
    userMessage: any,
    llmExplanation: string,
    compilationReport: any
  ) {
    this.server.to(`compilation:${compilationId}`).emit('compilation:failed', {
      compilationId,
      status: 'FAILED',
      error,
      userMessage,
      llmExplanation, // Pre-generated explanation from LLM
      compilationReport,
      timestamp: new Date(),
    });

    this.logger.log(`Emitted compilation:failed for ${compilationId}`);
  }
}
