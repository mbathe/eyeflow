import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import {
  CompilableComponent,
  Capability,
  CapabilityJSON,
  ComponentValidationError,
} from './compilable-component.interface';
import { ComponentValidator } from './component-validator.service';

/**
 * Manages all registered components and their capabilities
 */
@Injectable()
export class ComponentRegistry implements OnModuleInit {
  private components: Map<string, CompilableComponent> = new Map();
  private capabilities: Map<string, Capability> = new Map();
  private catalog: CapabilityCatalog | null = null;
  private logger = new Logger(ComponentRegistry.name);

  constructor(private validator: ComponentValidator) {}

  async onModuleInit() {
    this.logger.log('ComponentRegistry initialized');
  }

  /**
   * Register a component (with validation)
   */
  async register(component: CompilableComponent): Promise<void> {
    try {
      // Validate component
      await this.validator.validateComponent(component);

      // Store component
      this.components.set(component.id, component);

      // Index all capabilities
      for (const capability of component.capabilities) {
        this.capabilities.set(capability.id, capability);
      }

      this.logger.log(
        `Registered component: ${component.id} with ${component.capabilities.length} capabilities`,
      );

      // Invalidate catalog cache
      this.catalog = null;
    } catch (error) {
      if (error instanceof ComponentValidationError) {
        this.logger.error(
          `Component validation failed: ${error.message}`,
          error.stack,
        );
        throw error;
      }
      throw error;
    }
  }

  /**
   * Register multiple components
   */
  async registerBatch(components: CompilableComponent[]): Promise<void> {
    const results = await Promise.allSettled(components.map(c => this.register(c)));

    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      this.logger.warn(
        `Failed to register ${failed.length}/${components.length} components`,
      );
    }

    this.logger.log(
      `Registered batch: ${components.length} components (${failed.length} failed)`,
    );
  }

  /**
   * Get a registered component
   */
  getComponent(componentId: string): CompilableComponent | undefined {
    return this.components.get(componentId);
  }

  /**
   * Get a capability
   */
  getCapability(capabilityId: string): Capability | undefined {
    return this.capabilities.get(capabilityId);
  }

  /**
   * Get all registered components
   */
  getAllComponents(): CompilableComponent[] {
    return Array.from(this.components.values());
  }

  /**
   * Get all registered capabilities
   */
  getAllCapabilities(): Capability[] {
    return Array.from(this.capabilities.values());
  }

  /**
   * Get capabilities by category
   */
  getCapabilitiesByCategory(category: 'connector' | 'service' | 'action' | 'transform'): Capability[] {
    return Array.from(this.capabilities.values()).filter(c => c.category === category);
  }

  /**
   * Get capabilities by component
   */
  getCapabilitiesByComponent(componentId: string): Capability[] {
    const component = this.getComponent(componentId);
    if (!component) return [];
    return component.capabilities;
  }

  /**
   * Build the Capability Catalog (cached after first build)
   */
  async buildCatalog(): Promise<CapabilityCatalog> {
    if (this.catalog) {
      return this.catalog;
    }

    const components = this.getAllComponents();
    const componentJSONs = components.map(c => c.toJSON());

    this.catalog = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      totalComponents: components.length,
      totalCapabilities: this.capabilities.size,
      components: componentJSONs,
      index: this.buildCapabilityIndex(),
    };

    this.logger.log(
      `Built capability catalog: ${this.catalog.totalComponents} components, ${this.catalog.totalCapabilities} capabilities`,
    );

    return this.catalog;
  }

  /**
   * Get the catalog as JSON (for caching/storage)
   */
  async getCatalogJSON(): Promise<object> {
    const catalog = await this.buildCatalog();
    return {
      version: catalog.version,
      timestamp: catalog.timestamp,
      components: catalog.components,
      systemStats: {
        totalComponents: catalog.totalComponents,
        totalCapabilities: catalog.totalCapabilities,
      },
    };
  }

  /**
   * Search capabilities by name or description (for LLM context)
   */
  searchCapabilities(query: string): Capability[] {
    const lower = query.toLowerCase();
    return Array.from(this.capabilities.values()).filter(cap => {
      return (
        cap.id.toLowerCase().includes(lower) ||
        cap.name.toLowerCase().includes(lower) ||
        cap.description.toLowerCase().includes(lower)
      );
    });
  }

  /**
   * Get capabilities for a category (for compiler optimizer)
   */
  getCapabilitiesForCategory(category: string): Capability[] {
    return this.getCapabilitiesByCategory(category as any);
  }

  /**
   * Check if a capability exists
   */
  hasCapability(capabilityId: string): boolean {
    return this.capabilities.has(capabilityId);
  }

  /**
   * Get capability metadata for optimization
   */
  getCapabilityMetadata(capabilityId: string): CapabilityMetadata | null {
    const capability = this.getCapability(capabilityId);
    if (!capability) return null;

    return {
      id: capability.id,
      name: capability.name,
      category: capability.category,
      estimatedDuration: capability.estimatedDuration || 1000,
      supportsParallel: capability.supportsParallel ?? false,
      cacheable: capability.cacheable ?? false,
      cacheTTL: capability.cacheTTL || 3600,
      isLLMCall: capability.isLLMCall ?? false,
      estimatedCost: capability.estimatedCost || {
        cpu: 0.5,
        memory: 256,
        concurrent: 1,
      },
    };
  }

  /**
   * Build an index for fast capability lookup
   */
  private buildCapabilityIndex(): CapabilityIndex {
    const index: CapabilityIndex = {
      byId: {},
      byCategory: { connector: [], service: [], action: [], transform: [] },
      byComponent: {},
    };

    for (const capability of this.capabilities.values()) {
      index.byId[capability.id] = {
        id: capability.id,
        name: capability.name,
        component: this.findComponentForCapability(capability.id),
      };

      index.byCategory[capability.category].push({
        id: capability.id,
        name: capability.name,
      });
    }

    // Build byComponent index
    for (const component of this.components.values()) {
      index.byComponent[component.id] = component.capabilities.map(c => c.id);
    }

    return index;
  }

  /**
   * Find which component owns a capability
   */
  private findComponentForCapability(capabilityId: string): string | null {
    for (const [componentId, component] of this.components) {
      if (component.capabilities.some(c => c.id === capabilityId)) {
        return componentId;
      }
    }
    return null;
  }

  /**
   * Get registry statistics
   */
  getStats(): RegistryStats {
    return {
      totalComponents: this.components.size,
      totalCapabilities: this.capabilities.size,
      componentsByCategory: {
        connectors: this.getCapabilitiesByCategory('connector').length,
        services: this.getCapabilitiesByCategory('service').length,
        actions: this.getCapabilitiesByCategory('action').length,
        transforms: this.getCapabilitiesByCategory('transform').length,
      },
      cacheableCapabilities: Array.from(this.capabilities.values()).filter(c => c.cacheable).length,
      llmCapabilities: Array.from(this.capabilities.values()).filter(c => c.isLLMCall).length,
    };
  }
}

/**
 * Capability Catalog (compiled registry snapshot)
 */
export interface CapabilityCatalog {
  version: string;
  timestamp: string;
  totalComponents: number;
  totalCapabilities: number;
  components: CapabilityJSON[];
  index: CapabilityIndex;
}

/**
 * Capability index for fast lookup
 */
export interface CapabilityIndex {
  byId: Record<string, { id: string; name: string; component: string | null }>;
  byCategory: Record<string, Array<{ id: string; name: string }>>;
  byComponent: Record<string, string[]>;
}

/**
 * Capability metadata for optimization
 */
export interface CapabilityMetadata {
  id: string;
  name: string;
  category: string;
  estimatedDuration: number;
  supportsParallel: boolean;
  cacheable: boolean;
  cacheTTL: number;
  isLLMCall: boolean;
  estimatedCost: {
    cpu: number;
    memory: number;
    concurrent: number;
  };
}

/**
 * Registry statistics
 */
export interface RegistryStats {
  totalComponents: number;
  totalCapabilities: number;
  componentsByCategory: {
    connectors: number;
    services: number;
    actions: number;
    transforms: number;
  };
  cacheableCapabilities: number;
  llmCapabilities: number;
}
