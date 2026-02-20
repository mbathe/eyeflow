import { Module } from '@nestjs/common';
import { ServiceResolutionService } from './stages/stage-7-service-resolution.service';
import { ServicePreloaderService } from './stages/stage-8-service-preloader.service';
import { DistributionPlannerService } from './stages/stage-9-distribution-planner.service';
import { FormalVerifierService } from './stages/stage-5-formal-verifier.service';
import { IRSerializerService } from './services/ir-serializer.service';
import { ProtobufIRSerializerService } from './services/protobuf-ir-serializer.service';
import { DagVisualizerService } from './services/dag-visualizer.service';
import { TaskExecutionService } from './task-execution.service';
import { TaskController } from './task.controller';
import { ServiceRegistryService } from './service-registry.service';
import { ServiceRegistryController } from './service-registry.controller';
import { DagVisualizerController } from './controllers/dag-visualizer.controller';
import { RuntimeModule } from '../runtime/runtime.module';
import { IntegrationModule } from './integration/integration.module';
import { NodesModule } from '../nodes/nodes.module';

@Module({
  imports: [RuntimeModule, IntegrationModule, NodesModule],
  providers: [
    ServiceRegistryService,
    ServiceResolutionService,
    ServicePreloaderService,
    DistributionPlannerService,
    FormalVerifierService,
    IRSerializerService,
    ProtobufIRSerializerService,
    DagVisualizerService,
    TaskExecutionService,
  ],
  controllers: [TaskController, ServiceRegistryController, DagVisualizerController],
  exports: [
    ServiceRegistryService,
    ServiceResolutionService,
    ServicePreloaderService,
    DistributionPlannerService,
    FormalVerifierService,
    IRSerializerService,
    ProtobufIRSerializerService,
    DagVisualizerService,
    TaskExecutionService,
    IntegrationModule,
  ],
})
export class CompilerModule {}

