import { Module } from '@nestjs/common';
import { ServiceResolutionService } from './stages/stage-7-service-resolution.service';
import { ServicePreloaderService } from './stages/stage-8-service-preloader.service';
import { TaskExecutionService } from './task-execution.service';
import { TaskController } from './task.controller';
import { RuntimeModule } from '../runtime/runtime.module';
import { IntegrationModule } from './integration/integration.module';

@Module({
  imports: [RuntimeModule, IntegrationModule],
  providers: [
    ServiceResolutionService,
    ServicePreloaderService,
    TaskExecutionService
  ],
  controllers: [TaskController],
  exports: [
    ServiceResolutionService,
    ServicePreloaderService,
    TaskExecutionService,
    IntegrationModule,
  ]
})
export class CompilerModule {}
