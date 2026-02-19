/**
 * Integration Layer Exports
 * 
 * Export bridge services connecting Planning→Compilation→Execution
 * 
 * @file src/compiler/integration/index.ts
 */

export { PlanningToCompilationService, CompilationMetadata } from './planning-to-compilation.service';
export { CompilationToExecutionService, ExecutionMetadata, ExecutionParameters } from './compilation-to-execution.service';
export { IntegrationModule } from './integration.module';
