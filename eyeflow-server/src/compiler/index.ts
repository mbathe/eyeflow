/**
 * Semantic Compiler Public Exports
 * Includes all layers: Frontend, Middle-end, Backend
 * 
 * @file src/compiler/index.ts
 */

// Layer 2: Frontend
export * from './frontend';

// Layer 3: Middle-end (Optimizer)
export * from './optimizer';

// Layer 4: Backend (IR Generator)
export * from './ir-generator';
