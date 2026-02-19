/**
 * Frontend Module Public Exports (Layer 2 removed)
 * @file src/compiler/frontend/index.ts
 *
 * NOTE: Layer 2 (Frontend) has been removed — natural language parsing
 * is now handled by the Planning layer (Python LLM service). The remaining
 * helper services and interfaces are still exported for internal usage.
 */

export * from './services/nl-parser.service';
export * from './services/type-inferencer.service';
export * from './services/constraint-validator.service';
export * from './interfaces/semantic-node.interface';
