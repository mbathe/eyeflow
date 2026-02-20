/**
 * IR Generator Module
 * NestJS module for Layer 4 - Intermediate Representation Generation
 */

import { Module } from '@nestjs/common';
import { IRGeneratorService } from './services/ir-generator.service';
import { ConstantFoldingService } from './services/constant-folding.service';
import { ResourceReificationService } from './services/resource-reification.service';
import { ValidationInjectorService } from './services/validation-injector.service';
import { ParallelizationCodeGenService } from './services/parallelization-codegen.service';
import { SemanticContextBindingService } from './services/semantic-context-binding.service';
import { PriorityPolicyInjectorService } from './services/priority-policy-injector.service';
import { IROptimizerService } from './services/ir-optimizer.service';

@Module({
  providers: [
    {
      provide: 'LOGGER',
      useValue: {
        debug: (msg: string, meta?: Record<string, unknown>) => console.debug(msg, meta),
        info: (msg: string, meta?: Record<string, unknown>) => console.info(msg, meta),
        warn: (msg: string, meta?: Record<string, unknown>) => console.warn(msg, meta),
        error: (msg: string, meta?: Record<string, unknown>) => console.error(msg, meta),
      },
    },
    ConstantFoldingService,
    ResourceReificationService,
    ValidationInjectorService,
    ParallelizationCodeGenService,
    SemanticContextBindingService,
    PriorityPolicyInjectorService,
    IROptimizerService,
    IRGeneratorService,
  ],
  exports: [IRGeneratorService],
})
export class IRGeneratorModule {}
