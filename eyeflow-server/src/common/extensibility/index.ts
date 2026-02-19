/**
 * Semantic Compiler Extensibility Layer (Phase 1: Foundation)
 *
 * This module provides the foundation for the semantic compiler's extensibility system:
 * - CompilableComponent interface: Contract that all plugins must follow
 * - ComponentValidator: Validates components implement the contract correctly
 * - ComponentRegistry: Manages all registered capabilities
 * - CapabilityCatalogBuilder: Builds the system manifest (Layer 1)
 * - ExtensibilityModule: NestJS module that registers all services
 */

export { CompilableComponent, Capability, CapabilityParameter, CapabilityExecutor, Constraint, ContextRequirement, CapabilityJSON, Compilable, ComponentValidationError } from './compilable-component.interface';
export { JsonSchema } from './json-schema.interface';
export { ComponentValidator } from './component-validator.service';
export { ComponentRegistry, CapabilityCatalog, CapabilityIndex, CapabilityMetadata, RegistryStats } from './component-registry.service';
export { CapabilityCatalogBuilder, CapabilityCatalogDocument, CatalogMetadata, ComponentInfo, CapabilityInfo, CatalogIndex, CatalogStats } from './capability-catalog-builder.service';
export { ExtensibilityModule } from './extensibility.module';
