/**
 * Layer 4: IR Generator - Public API
 */

export { IRGeneratorModule } from './ir-generator.module';
export { IRGeneratorService } from './services/ir-generator.service';
export { ConstantFoldingService } from './services/constant-folding.service';
export { ResourceReificationService } from './services/resource-reification.service';
export { ValidationInjectorService } from './services/validation-injector.service';
export { ParallelizationCodeGenService } from './services/parallelization-codegen.service';
export { SemanticContextBindingService } from './services/semantic-context-binding.service';
export { IROptimizerService } from './services/ir-optimizer.service';

export * from './interfaces/ir.interface';
