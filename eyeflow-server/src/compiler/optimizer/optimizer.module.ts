/**
 * Optimizer Module
 * Layer 3: Optimization services
 */

import { Module } from '@nestjs/common';
import { ExtensibilityModule } from '../../common/extensibility/extensibility.module';
import { CacheModule } from '../../common/cache/cache.module';
import { DataClassifierService } from './services/data-classifier.service';
import { ResourceBinderService } from './services/resource-binder.service';
import { SchemaPrecomputerService } from './services/schema-precomputer.service';
import { ParallelizationDetectorService } from './services/parallelization-detector.service';
import { LLMContextOptimizerService } from './services/llm-context-optimizer.service';
import { OptimizerOrchestratorService } from './services/optimizer-orchestrator.service';

@Module({
  imports: [ExtensibilityModule, CacheModule],
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
    DataClassifierService,
    ResourceBinderService,
    SchemaPrecomputerService,
    ParallelizationDetectorService,
    LLMContextOptimizerService,
    OptimizerOrchestratorService,
  ],
  exports: [OptimizerOrchestratorService],
})
export class OptimizerModule {}
