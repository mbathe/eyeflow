/**
 * Compiler Module (NestJS)
 * Exports: Stage 7, Stage 8, CompiledWorkflow
 */

import { Module } from '@nestjs/common';
import { ServiceResolutionService } from './stages/stage-7-service-resolution.service';
import { ServicePreloaderService } from './stages/stage-8-service-preloader.service';

@Module({
  providers: [
    ServiceResolutionService,
    ServicePreloaderService
  ],
  exports: [
    ServiceResolutionService,
    ServicePreloaderService
  ]
})
export class CompilerModule {}
