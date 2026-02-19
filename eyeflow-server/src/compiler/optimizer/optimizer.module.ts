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
