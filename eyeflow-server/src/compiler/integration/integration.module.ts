/**
 * Integration Module
 * 
 * NestJS module exporting the bridge services connecting the three layers:
 * Planning → [PlanningToCompilationService] → Compilation → [CompilationToExecutionService] → Execution
 * 
 * @file src/compiler/integration/integration.module.ts
 */

import { Module } from '@nestjs/common';
import { PlanningToCompilationService } from './planning-to-compilation.service';
import { CompilationToExecutionService } from './compilation-to-execution.service';

@Module({
  providers: [
    PlanningToCompilationService,
    CompilationToExecutionService,
  ],
  exports: [
    PlanningToCompilationService,
    CompilationToExecutionService,
  ],
})
export class IntegrationModule {}
