/**
 * Compiler Module (NestJS)
 * Exports: Stage 7, Stage 8, CompiledWorkflow, Task Execution
 */

import { Module } from '@nestjs/common';
import { ServiceResolutionService } from './stages/stage-7-service-resolution.service';
import { ServicePreloaderService } from './stages/stage-8-service-preloader.service';
import { TaskExecutionService } from './task-execution.service';
import { TaskController } from './task.controller';
import { RuntimeModule } from '../runtime/runtime.module';

@Module({
  imports: [RuntimeModule],
  providers: [
    ServiceResolutionService,
    ServicePreloaderService,
    TaskExecutionService
  ],
  controllers: [TaskController],
  exports: [
    ServiceResolutionService,
    ServicePreloaderService,
    TaskExecutionService
  ]
})
export class CompilerModule {}
