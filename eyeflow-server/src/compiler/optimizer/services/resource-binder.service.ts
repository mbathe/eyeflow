/**
 * Resource Binder Service
 * Pre-loads resources and creates vector embeddings for RAG
 */

import { Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { Inject } from '@nestjs/common';
import { SemanticTree } from '../../frontend/interfaces/semantic-node.interface';
import { ResourceBinding, ResourceBindingResult } from '../interfaces/optimizer.interface';

@Injectable()
export class ResourceBinderService {
  constructor(@Inject('LOGGER') private logger: Logger) {}

  /**
   * Bind and catalog all resources in workflow
   */
  async bindResources(tree: SemanticTree): Promise<ResourceBindingResult> {
    const bindings: ResourceBinding[] = [];
    const errors: string[] = [];
    const preloadPlan = {
      sequentialResources: [] as string[],
      parallelResources: [] as string[][],
    };

    try {
      // Extract resource references from operations
      for (const [opId, operation] of tree.operations) {
        const resources = this.extractResourcesFromOperation(operation);
        for (const resource of resources) {
          // Check if already bound
          if (!bindings.find(b => b.resourcePath === resource.path)) {
            const binding: ResourceBinding = {
              resourceId: `res_${opId}_${bindings.length}`,
              resourceType: this.determineResourceType(resource.path),
              resourcePath: resource.path,
              preloadRequired: this.shouldPreload(resource.path),
              vectorized: this.isVectorizableResource(resource.path),
              vectorDimensions: 768,
              estimatedSize: this.estimateResourceSize(resource.path),
              cacheTTL: 3600,
              metadata: {
                sourceOperation: opId,
                accessPattern: resource.accessPattern,
              },
            };
            bindings.push(binding);
          }
        }
      }

      // Plan resource preloading
      const preloadResources = bindings.filter(b => b.preloadRequired);
      const vectorResources = bindings.filter(b => b.vectorized);

      // Sequential preload: heavy resources first
      preloadPlan.sequentialResources = preloadResources
        .sort((a, b) => b.estimatedSize - a.estimatedSize)
        .slice(0, 3)
        .map(r => r.resourceId);

      // Parallel preload: smaller resources
      const parallelBatch = preloadResources
        .filter(r => !preloadPlan.sequentialResources.includes(r.resourceId))
        .map(r => r.resourceId);
      if (parallelBatch.length > 0) {
        preloadPlan.parallelResources.push(parallelBatch);
      }

      const estimatedPreloadTime = preloadPlan.sequentialResources.length * 500 + (parallelBatch.length > 0 ? 300 : 0);

      this.logger.info(`Bound ${bindings.length} resources`, {
        context: 'ResourceBinder',
        vectorizedCount: vectorResources.length,
        preloadCount: preloadResources.length,
        estimatedPreloadTime,
      });

      return {
        bindings,
        preloadPlan,
        estimatedPreloadTime,
        errors,
      };
    } catch (error) {
      this.logger.error('Error binding resources', {
        context: 'ResourceBinder',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      errors.push(
        `Failed to bind resources: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      return {
        bindings,
        preloadPlan,
        estimatedPreloadTime: 0,
        errors,
      };
    }
  }

  /**
   * Extract resource references from operation
   */
  private extractResourcesFromOperation(operation: any): Array<{ path: string; accessPattern: string }> {
    const resources: Array<{ path: string; accessPattern: string }> = [];

    if (!operation.operation) return resources;

    const inputs = operation.operation.inputs || {};
    for (const [key, value] of Object.entries(inputs)) {
      if (this.isResourcePath(value as string)) {
        resources.push({
          path: value as string,
          accessPattern: key,
        });
      }
    }

    return resources;
  }

  /**
   * Check if value looks like a resource path
   */
  private isResourcePath(value: string): boolean {
    if (typeof value !== 'string') return false;

    const patterns = [
      /\.xlsx?$/i,
      /\.csv$/i,
      /\.json$/i,
      /^https?:\/\//,
      /^db:\/\//,
      /^file:\/\//,
    ];

    return patterns.some(p => p.test(value));
  }

  /**
   * Determine resource type from path
   */
  private determineResourceType(path: string): 'EXCEL' | 'DATABASE' | 'API' | 'FILE' | 'CACHE' | 'VECTOR_STORE' {
    if (path.match(/\.xlsx?$/i)) return 'EXCEL';
    if (path.match(/^db:\/\//)) return 'DATABASE';
    if (path.match(/^https?:\/\//)) return 'API';
    if (path.match(/^cache:/)) return 'CACHE';
    if (path.match(/^vector:/)) return 'VECTOR_STORE';
    return 'FILE';
  }

  /**
   * Determine if resource should be preloaded
   */
  private shouldPreload(path: string): boolean {
    // Large files and databases benefit from preloading
    return path.match(/\.xlsx?$/i) != null || path.match(/^db:\/\//) != null;
  }

  /**
   * Check if resource is vectorizable
   */
  private isVectorizableResource(path: string): boolean {
    // Excel files, databases, and text files are vectorizable
    return (
      path.match(/\.xlsx?$/i) != null ||
      path.match(/^db:\/\//) != null ||
      path.match(/\.txt$/i) != null ||
      path.match(/\.json$/i) != null
    );
  }

  /**
   * Estimate resource size in MB
   */
  private estimateResourceSize(path: string): number {
    // Default estimation by type
    if (path.match(/\.xlsx?$/i)) return 10; // Excel files
    if (path.match(/^db:\/\//)) return 100; // Databases
    if (path.match(/\.csv$/i)) return 5;
    if (path.match(/\.json$/i)) return 2;
    return 1; // Default
  }
}
