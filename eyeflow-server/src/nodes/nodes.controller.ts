/**
 * Nodes Controller (REST API)
 *
 * REST endpoints for node management.
 * Used by:
 *  – edge nodes that don't maintain a persistent WebSocket (HTTP-only mode)
 *  – admin dashboard to inspect cluster state
 *  – health check endpoints
 *
 * Routes:
 *  POST   /nodes/register       — register a new node
 *  POST   /nodes/:nodeId/heartbeat — send heartbeat
 *  GET    /nodes                 — list all nodes
 *  GET    /nodes/:nodeId         — get single node details
 *  GET    /nodes/summary         — cluster summary
 *  POST   /nodes/:nodeId/execute-slice — HTTP fallback for slice execution
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { NodeRegistryService } from './node-registry.service';
import { NodeDispatcherService } from './node-dispatcher.service';
import {
  NodeRegistrationPayload,
  NodeHeartbeat,
} from './interfaces/node-capability.interface';
import { SliceDispatchPayload, SliceResultPayload } from '../compiler/interfaces/distributed-execution.interface';
import { TriggerDriverRegistryService } from '../triggers/trigger-driver-registry.service';

@ApiTags('nodes')
@Controller('nodes')
export class NodesController {
  private readonly logger = new Logger(NodesController.name);

  constructor(
    private readonly registry: NodeRegistryService,
    private readonly dispatcher: NodeDispatcherService,
    @Optional() private readonly triggerDriverRegistry?: TriggerDriverRegistryService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Registration & heartbeat
  // ──────────────────────────────────────────────────────────────────────────

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register an execution node' })
  register(@Body() payload: NodeRegistrationPayload) {
    const node = this.registry.register(payload);
    this.logger.log(`[NodesController] REST registration: ${payload.nodeId}`);

    // Forward custom driver manifests to TriggerDriverRegistryService
    if (payload.triggerDrivers?.length && this.triggerDriverRegistry) {
      for (const manifest of payload.triggerDrivers) {
        this.triggerDriverRegistry.registerRemoteDriver(manifest, payload.nodeId);
      }
      this.logger.log(
        `[NodesController] Node "${payload.nodeId}" declared ` +
        `${payload.triggerDrivers.length} custom trigger driver(s): ` +
        `[${payload.triggerDrivers.map(d => d.driverId).join(', ')}]`,
      );
    }

    return { nodeId: node.nodeId, tier: node.tier, status: node.status };
  }

  @Post(':nodeId/heartbeat')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Node heartbeat' })
  heartbeat(@Param('nodeId') nodeId: string, @Body() hb: NodeHeartbeat) {
    this.registry.heartbeat({ ...hb, nodeId });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Query
  // ──────────────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List all registered nodes' })
  listNodes() {
    return this.registry.getAllNodes();
  }

  @Get('summary')
  @ApiOperation({ summary: 'Cluster health summary' })
  summary() {
    const nodes = this.registry.getAllNodes();
    return {
      total: nodes.length,
      online: nodes.filter(n => n.status === 'ONLINE').length,
      offline: nodes.filter(n => n.status === 'OFFLINE').length,
      nodes: nodes.map(n => ({
        nodeId: n.nodeId,
        label: n.label,
        tier: n.tier,
        status: n.status,
        latencyMs: n.latencyToCentralMs,
        lastSeenAt: n.lastSeenAt,
      })),
    };
  }

  @Get(':nodeId')
  @ApiOperation({ summary: 'Get a specific node' })
  getNode(@Param('nodeId') nodeId: string) {
    const node = this.registry.getNode(nodeId);
    if (!node) throw new NotFoundException(`Node not found: ${nodeId}`);
    return node;
  }

  @Get(':nodeId/trigger-drivers')
  @ApiOperation({ summary: 'List trigger drivers declared by a specific node' })
  getNodeTriggerDrivers(@Param('nodeId') nodeId: string) {
    const node = this.registry.getNode(nodeId);
    if (!node) throw new NotFoundException(`Node not found: ${nodeId}`);
    const all = this.triggerDriverRegistry?.listAll() ?? [];
    return {
      nodeId,
      supportedTriggerDrivers: node.supportedTriggerDrivers,
      triggerDriverManifests: node.triggerDriverManifests ?? [],
      remoteDriversDiscovered: all.filter(d => d.isRemote && d.sourceNodeId === nodeId),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HTTP fallback for slice execution (used when no WebSocket)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * An edge node calls this endpoint to report the result of a slice it executed.
   * This is the HTTP equivalent of the WebSocket 'slice_result' event.
   *
   * Note: In the future, the edge node's own HTTP server will receive the
   * SliceDispatchPayload and return the SliceResultPayload synchronously.
   * This endpoint handles the async callback pattern for nodes that use polling.
   */
  @Post(':nodeId/slice-result')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive slice execution result from a node (HTTP callback)' })
  receiveSliceResult(
    @Param('nodeId') nodeId: string,
    @Body() result: SliceResultPayload
  ) {
    this.logger.log(
      `[NodesController] HTTP slice result from ${nodeId}: slice="${result.sliceId}" status=${result.status}`
    );
    this.dispatcher.onRemoteResult({ ...result, nodeId });
    return { received: true };
  }
}
