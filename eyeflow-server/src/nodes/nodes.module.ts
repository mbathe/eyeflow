/**
 * Nodes Module
 *
 * Provides:
 *  – NodeRegistryService   : catalogue of all execution nodes + capability matching
 *  – NodeDispatcherService : dispatch IR slices to remote nodes (WS + HTTP)
 *  – NodesGateway          : WebSocket gateway for persistent node connections
 *  – NodesController       : REST API for node management
 *
 * Exported services are consumed by:
 *  – Stage 9 Distribution Planner (NodeRegistryService)
 *  – SemanticVirtualMachine (NodeDispatcherService + NodeRegistryService)
 */

import { Module, forwardRef } from '@nestjs/common';
import { NodeRegistryService } from './node-registry.service';
import { NodeDispatcherService } from './node-dispatcher.service';
import { NodesGateway } from './nodes.gateway';
import { NodesController } from './nodes.controller';
import { TriggersModule } from '../triggers/triggers.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    // TriggersModule provides TriggerDriverRegistryService so nodes can
    // register their custom drivers during the registration handshake.
    // One-way dependency: TriggersModule does NOT import NodesModule
    // so there is no circular reference.
    TriggersModule,
    // EventsModule provides PropagatedEventService (for NodesGateway to route
    // incoming 'propagated_event' WebSocket messages from edge FSM nodes).
    // forwardRef() is required because EventsModule also imports NodesModule
    // (for NodeDispatcherService used by PropagatedEventService).
    forwardRef(() => EventsModule),
  ],
  controllers: [NodesController],
  providers: [
    NodeRegistryService,
    NodeDispatcherService,
    NodesGateway,
  ],
  exports: [
    NodeRegistryService,
    NodeDispatcherService,
  ],
})
export class NodesModule {}
