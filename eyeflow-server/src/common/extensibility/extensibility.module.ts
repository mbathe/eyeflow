import { Module } from '@nestjs/common';
import { ComponentValidator } from './component-validator.service';
import { ComponentRegistry } from './component-registry.service';
import { CapabilityCatalogBuilder } from './capability-catalog-builder.service';
import { CatalogVerticalService } from './catalog-vertical.service';
import { RedisCacheService } from '../services/redis-cache.service';

/**
 * Semantic Compiler Extensibility Module
 *
 * Provides the foundation for the semantic compiler's Phase 1:
 * - CompilableComponent interface for plugin contracts
 * - Component validation system
 * - Component registry for capability discovery
 * - Capability catalog builder for system manifest
 *
 * Usage in other modules:
 *   imports: [ExtensibilityModule]
 */
@Module({
  providers: [ComponentValidator, ComponentRegistry, CatalogVerticalService, CapabilityCatalogBuilder, RedisCacheService],
  exports: [ComponentValidator, ComponentRegistry, CatalogVerticalService, CapabilityCatalogBuilder],
})
export class ExtensibilityModule {}
