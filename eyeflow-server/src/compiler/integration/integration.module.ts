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
import { logger } from '../../common/services/logger.service';

@Module({
  providers: [
    // Provide a simple LOGGER for services in this module (used in tests/runtime)
    { provide: 'LOGGER', useValue: logger },
    PlanningToCompilationService,
    CompilationToExecutionService,
  ],
  exports: [
    PlanningToCompilationService,
    CompilationToExecutionService,
  ],
})
export class IntegrationModule {}
