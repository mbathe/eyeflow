/**
 * Semantic Compiler Public Exports
 * Includes all layers: Frontend, Middle-end, Backend, Stage 7+8, Layer 5
 * 
 * @file src/compiler/index.ts
 */

// Layer 2: Frontend
export * from './frontend';

// Layer 3: Middle-end (Optimizer)
export * from './optimizer';

// Layer 4: Backend (IR Generator)
export * from './ir-generator';

// Stage 7+8 (Service Resolution & Pre-loading)
export { CompilerModule } from './compiler.module';
export { ServiceResolutionService } from './stages/stage-7-service-resolution.service';
export { ServicePreloaderService } from './stages/stage-8-service-preloader.service';

// Interfaces
export * from './interfaces/ir.interface';
export * from './interfaces/compiled-workflow.interface';
