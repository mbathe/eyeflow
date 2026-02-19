/**
 * Optimizer Module Exports
 * Layer 3: Optimization Pipeline
 */

export { OptimizerModule } from './optimizer.module';
export * from './interfaces/optimizer.interface';
export { DataClassifierService } from './services/data-classifier.service';
export { ResourceBinderService } from './services/resource-binder.service';
export { SchemaPrecomputerService } from './services/schema-precomputer.service';
export { ParallelizationDetectorService } from './services/parallelization-detector.service';
export { LLMContextOptimizerService } from './services/llm-context-optimizer.service';
export { OptimizerOrchestratorService } from './services/optimizer-orchestrator.service';
