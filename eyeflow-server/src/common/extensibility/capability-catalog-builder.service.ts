import { Injectable, Logger } from '@nestjs/common';
import { ComponentRegistry, CapabilityCatalog } from './component-registry.service';
import { RedisCacheService } from '../services/redis-cache.service';
import { Capability, CapabilityParameter, CompilableComponent } from './compilable-component.interface';

/**
 * Builds and manages the Capability Catalog (Layer 1 of Semantic Compiler)
 * The catalog is the system manifest of all available capabilities
 */
@Injectable()
export class CapabilityCatalogBuilder {
  private static readonly CATALOG_CACHE_KEY = 'compiler:catalog:latest';
  private static readonly CATALOG_CACHE_TTL = 86400; // 24 hours
  private logger = new Logger(CapabilityCatalogBuilder.name);

  constructor(
    private registry: ComponentRegistry,
    private cache: RedisCacheService,
  ) {}

  /**
   * Build complete capability catalog
   * Attempts to load from cache first, rebuilds if needed
   */
  async buildCatalog(): Promise<CapabilityCatalogDocument> {
    try {
      // Try to get from cache
      const cached = await this.getCachedCatalog();
      if (cached) {
        this.logger.log('Loaded capability catalog from cache');
        return cached;
      }
    } catch (error) {
      this.logger.warn(`Failed to load cached catalog: ${error}`);
    }

    // Build catalog from registry
    this.logger.log('Building capability catalog from registry');
    const catalog = await this.buildFromRegistry();

    // Cache for future use
    try {
      await this.cacheCatalog(catalog);
    } catch (error) {
      this.logger.warn(`Failed to cache catalog: ${error}`, 'CapabilityCatalogBuilder');
    }

    return catalog;
  }

  /**
   * Build catalog directly from registry (no cache)
   */
  private async buildFromRegistry(): Promise<CapabilityCatalogDocument> {
    const startTime = Date.now();
    const registryCatalog = await this.registry.buildCatalog();
    const components = this.registry.getAllComponents();

    const capabilities: CapabilityInfo[] = this.registry
      .getAllCapabilities()
      .map((cap, index) => ({
        index: index,
        id: cap.id,
        name: cap.name,
        description: cap.description,
        category: cap.category,
        inputs: cap.inputs,
        outputs: cap.outputs,
        executor: cap.executor,
        metadata: {
          estimatedDuration: cap.estimatedDuration,
          cacheable: cap.cacheable,
          cacheTTL: cap.cacheTTL,
          supportsParallel: cap.supportsParallel,
          isLLMCall: cap.isLLMCall,
          estimatedCost: cap.estimatedCost,
        },
      }));

    const componentInfos: ComponentInfo[] = components.map(comp => ({
      id: comp.id,
      name: comp.name,
      version: comp.version,
      description: comp.description,
      author: comp.author,
      capabilities: comp.capabilities.map(c => c.id),
      constraints: comp.constraints || [],
      requiredContext: comp.requiredContext || [],
    }));

    const buildTime = Date.now() - startTime;

    const catalog: CapabilityCatalogDocument = {
      version: '1.0',
      buildTime: buildTime,
      timestamp: new Date().toISOString(),
      metadata: {
        totalComponents: components.length,
        totalCapabilities: capabilities.length,
        categoryCounts: {
          connectors: capabilities.filter(c => c.category === 'connector').length,
          services: capabilities.filter(c => c.category === 'service').length,
          actions: capabilities.filter(c => c.category === 'action').length,
          transforms: capabilities.filter(c => c.category === 'transform').length,
        },
        cacheableCount: capabilities.filter(c => c.metadata.cacheable).length,
        llmCallCount: capabilities.filter(c => c.metadata.isLLMCall).length,
      },
      components: componentInfos,
      capabilities: capabilities,
      index: this.buildCatalogIndex(capabilities, componentInfos),
      compiled: {
        at: new Date(),
        version: '1.0',
        schemaVersion: '1.0',
      },
    };

    this.logger.log(
      `Built catalog: ${capabilities.length} capabilities from ${components.length} components (${buildTime}ms)`,
    );

    return catalog;
  }

  /**
   * Build indexing structures for efficient lookup
   */
  private buildCatalogIndex(
    capabilities: CapabilityInfo[],
    components: ComponentInfo[],
  ): CatalogIndex {
    const index: CatalogIndex = {
      // Quick lookup by ID
      capabilityById: {},
      // Search by category
      capabilitiesByCategory: {
        connector: [],
        service: [],
        action: [],
        transform: [],
      },
      // Reverse lookup: capability -> component
      capabilityToComponent: {},
      // Components by type
      componentsByCategory: {
        connector: [],
        service: [],
        action: [],
        transform: [],
      },
      // Searchable index (for LLM context)
      searchIndex: [],
    };

    // Index capabilities
    for (const cap of capabilities) {
      index.capabilityById[cap.id] = cap;
      const categoryKey = cap.category as 'connector' | 'service' | 'action' | 'transform';
      index.capabilitiesByCategory[categoryKey].push({
        id: cap.id,
        name: cap.name,
        index: cap.index,
      });

      // Find parent component
      const parentComponent = components.find(comp => comp.capabilities.includes(cap.id));
      if (parentComponent) {
        index.capabilityToComponent[cap.id] = parentComponent.id;
      }

      // Add to search index (for LLM RAG context)
      index.searchIndex.push({
        id: cap.id,
        name: cap.name,
        description: cap.description,
        category: cap.category,
        keywords: [
          ...cap.name.toLowerCase().split(/\s+/),
          ...cap.description.toLowerCase().split(/\s+/),
        ].filter(k => k.length > 2),
      });
    }

    // Index components
    for (const comp of components) {
      const capabilities = comp.capabilities;

      // Determine component category by majority capability type
      const types = capabilities
        .map(capId => capabilities.find(c => c === capId))
        .filter(Boolean);

      // Mark components by their primary capability type
      for (const capId of capabilities) {
        const cap = index.capabilityById[capId];
        if (cap) {
          index.componentsByCategory[cap.category as any].push({
            componentId: comp.id,
            componentName: comp.name,
            capabilityId: cap.id,
          });
        }
      }
    }

    return index;
  }

  /**
   * Get cached catalog if available and valid
   */
  private async getCachedCatalog(): Promise<CapabilityCatalogDocument | null> {
    try {
      const cached = await this.cache.get(CapabilityCatalogBuilder.CATALOG_CACHE_KEY);
      if (cached) {
        if (typeof cached === 'string') {
          return JSON.parse(cached) as CapabilityCatalogDocument;
        }
        return cached as CapabilityCatalogDocument;
      }
    } catch (error) {
      this.logger.debug(`Failed to read cached catalog: ${error}`);
    }
    return null;
  }

  /**
   * Cache the catalog for future use
   */
  private async cacheCatalog(catalog: CapabilityCatalogDocument): Promise<void> {
    try {
      await this.cache.set(
        CapabilityCatalogBuilder.CATALOG_CACHE_KEY,
        JSON.stringify(catalog),
        CapabilityCatalogBuilder.CATALOG_CACHE_TTL,
      );
    } catch (error) {
      this.logger.warn(`Failed to cache catalog: ${error}`);
    }
  }

  /**
   * Invalidate cached catalog (call when new component registered)
   */
  async invalidateCache(): Promise<void> {
    try {
      await this.cache.delete(CapabilityCatalogBuilder.CATALOG_CACHE_KEY);
      this.logger.log('Invalidated capability catalog cache');
    } catch (error) {
      this.logger.warn(`Failed to invalidate cache: ${error}`);
    }
  }

  /**
   * Get catalog as JSON string (for API response)
   */
  async getCatalogJSON(): Promise<string> {
    const catalog = await this.buildCatalog();
    // Exclude internal index for API response
    const { index, compiled, ...publicCatalog } = catalog;
    return JSON.stringify(publicCatalog, null, 2);
  }

  /**
   * Get catalog statistics
   */
  async getCatalogStats(): Promise<CatalogStats> {
    const catalog = await this.buildCatalog();
    return {
      totalComponents: catalog.metadata.totalComponents,
      totalCapabilities: catalog.metadata.totalCapabilities,
      byCategory: catalog.metadata.categoryCounts,
      cacheableCapabilities: catalog.metadata.cacheableCount,
      llmCapabilities: catalog.metadata.llmCallCount,
      buildTime: catalog.buildTime,
      timestamp: catalog.timestamp,
    };
  }

  /**
   * Search capabilities in catalog (for LLM context injection)
   */
  async searchCapabilities(
    query: string,
    limit = 10,
  ): Promise<Array<CapabilityInfo & { relevance: number }>> {
    const catalog = await this.buildCatalog();
    const queryTerms = query.toLowerCase().split(/\s+/);

    const results = catalog.capabilities
      .map(cap => ({
        ...cap,
        relevance: this.calculateRelevance(cap, queryTerms, catalog.index),
      }))
      .filter(cap => cap.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);

    return results;
  }

  /**
   * Calculate relevance score for search
   */
  private calculateRelevance(cap: CapabilityInfo, queryTerms: string[], index: CatalogIndex): number {
    let score = 0;
    const capName = cap.name.toLowerCase();
    const capDesc = cap.description.toLowerCase();
    const searchEntry = index.searchIndex.find(se => se.id === cap.id);

    for (const term of queryTerms) {
      if (capName.includes(term)) score += 2;
      if (capDesc.includes(term)) score += 1;
      if (searchEntry?.keywords.some(k => k.includes(term))) score += 0.5;
    }

    return score;
  }

  /**
   * Get capabilities for a specific category
   */
  async getCapabilitiesByCategory(
    category: 'connector' | 'service' | 'action' | 'transform',
  ): Promise<CapabilityInfo[]> {
    const catalog = await this.buildCatalog();
    return catalog.index.capabilitiesByCategory[category]
      .map(ref => catalog.capabilities[ref.index])
      .filter(Boolean);
  }

  /**
   * Get capability by ID with full details
   */
  async getCapabilityDetail(capabilityId: string): Promise<CapabilityInfo | null> {
    const catalog = await this.buildCatalog();
    return catalog.index.capabilityById[capabilityId] || null;
  }

  /**
   * Get component details
   */
  async getComponentDetail(componentId: string): Promise<ComponentInfo | null> {
    const catalog = await this.buildCatalog();
    return catalog.components.find(c => c.id === componentId) || null;
  }

  /**
   * Export catalog as file content for storage
   */
  async exportCatalog(): Promise<object> {
    const catalog = await this.buildCatalog();
    // Remove internal structures
    const { index, compiled, ...exportData } = catalog;
    return exportData;
  }
}

/**
 * Full capability catalog document
 */
export interface CapabilityCatalogDocument {
  version: string;
  buildTime: number;
  timestamp: string;
  metadata: CatalogMetadata;
  components: ComponentInfo[];
  capabilities: CapabilityInfo[];
  index: CatalogIndex;
  compiled: CatalogCompilationInfo;
}

export interface CatalogMetadata {
  totalComponents: number;
  totalCapabilities: number;
  categoryCounts: {
    connectors: number;
    services: number;
    actions: number;
    transforms: number;
  };
  cacheableCount: number;
  llmCallCount: number;
}

export interface ComponentInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  capabilities: string[];
  constraints: any[];
  requiredContext: any[];
}

export interface CapabilityInfo {
  index: number;
  id: string;
  name: string;
  description: string;
  category: 'connector' | 'service' | 'action' | 'transform';
  inputs: CapabilityParameter[];
  outputs: CapabilityParameter[];
  executor: any;
  metadata: {
    estimatedDuration?: number;
    cacheable?: boolean;
    cacheTTL?: number;
    supportsParallel?: boolean;
    isLLMCall?: boolean;
    estimatedCost?: any;
  };
}

export interface CatalogIndex {
  capabilityById: Record<string, CapabilityInfo>;
  capabilitiesByCategory: {
    connector: Array<{ id: string; name: string; index: number }>;
    service: Array<{ id: string; name: string; index: number }>;
    action: Array<{ id: string; name: string; index: number }>;
    transform: Array<{ id: string; name: string; index: number }>;
  };
  capabilityToComponent: Record<string, string>;
  componentsByCategory: Record<
    string,
    Array<{
      componentId: string;
      componentName: string;
      capabilityId: string;
    }>
  >;
  searchIndex: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    keywords: string[];
  }>;
}

export interface CatalogCompilationInfo {
  at: Date;
  version: string;
  schemaVersion: string;
}

export interface CatalogStats {
  totalComponents: number;
  totalCapabilities: number;
  byCategory: {
    connectors: number;
    services: number;
    actions: number;
    transforms: number;
  };
  cacheableCapabilities: number;
  llmCapabilities: number;
  buildTime: number;
  timestamp: string;
}
