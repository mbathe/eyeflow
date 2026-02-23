/**
 * Integration Module
 * 
 * NestJS module exporting the bridge services connecting the three layers:
 * Planning → [PlanningToCompilationService] → Compilation → [CompilationToExecutionService] → Execution
 * 
 * @file src/compiler/integration/integration.module.ts
 */

import { Module, forwardRef } from '@nestjs/common';
import { PlanningToCompilationService } from './planning-to-compilation.service';
import { CompilationToExecutionService } from './compilation-to-execution.service';
import { WorkflowRuntimeDeploymentService } from './workflow-runtime-deployment.service';
import { logger } from '../../common/services/logger.service';
import { RuntimeModule } from '../../runtime/runtime.module';
import { TriggersModule } from '../../triggers/triggers.module';
import { EventsModule } from '../../events/events.module';
// forwardRef breaks the CompilerModule ↔ IntegrationModule circular dependency
import { CompilerModule } from '../compiler.module';

@Module({
  imports: [
    forwardRef(() => CompilerModule),
    RuntimeModule,
    TriggersModule,
    EventsModule,
  ],
  providers: [
    // Provide a simple LOGGER for services in this module (used in tests/runtime)
    { provide: 'LOGGER', useValue: logger },
    PlanningToCompilationService,
    CompilationToExecutionService,
    WorkflowRuntimeDeploymentService,
  ],
  exports: [
    PlanningToCompilationService,
    CompilationToExecutionService,
    WorkflowRuntimeDeploymentService,
  ],
})
export class IntegrationModule {}
