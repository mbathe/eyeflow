/**
 * SERVICE REGISTRY
 *
 * The source of truth for all services available in the system.
 * On startup, seeds the registry with BUILT_IN_SERVICES.
 * Exposes a lookup API used by Stage 7 at compile time.
 *
 * Features
 * ────────
 *  – In-memory storage (with optional JSON file persistence)
 *  – Semantic search by tags, category, or capability
 *  – Descriptor selection: given a node tier, returns the best ExecutionDescriptor
 *  – User-defined service registration (via REST API)
 *  – Signature verification (optional, for trusted namespaces)
 *
 * Production upgrade path: swap the Map for a TypeORM repository.
 */

import { Injectable, Logger, OnModuleInit, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  PowerfulServiceManifest,
  ExecutionDescriptor,
  NodeTier,
  ServiceFormat,
} from './interfaces/service-manifest.interface';
import { BUILT_IN_SERVICES } from './built-in-services';

// ─────────────────────────────────────────────────────────────────────────────

export interface ServiceLookupResult {
  manifest: PowerfulServiceManifest;
  selectedDescriptor: ExecutionDescriptor;
  targetTier: NodeTier;
}

export interface RegistryStats {
  total: number;
  byCategory: Record<string, number>;
  byFormat: Record<string, number>;
  trustedCount: number;
  userDefinedCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ServiceRegistryService implements OnModuleInit {
  private readonly logger = new Logger(ServiceRegistryService.name);

  /** Main store: `id@version` → manifest */
  private readonly store = new Map<string, PowerfulServiceManifest>();

  /** Path for optional persistence */
  private readonly persistPath = path.join(
    process.env['EYEFLOW_DATA_DIR'] || os.tmpdir(),
    'eyeflow-service-registry.json',
  );

  // ─────────────────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    // 1. Seed with built-in services
    for (const svc of BUILT_IN_SERVICES) {
      this._store(svc, false);
    }

    // 2. Load user-defined services from persistence
    this._loadFromDisk();

    this.logger.log(
      `[ServiceRegistry] Initialized with ${this.store.size} services ` +
      `(${BUILT_IN_SERVICES.length} built-in, ${this.store.size - BUILT_IN_SERVICES.length} user-defined)`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 7 API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Main lookup called by Stage 7 during compilation.
   *
   * Algorithm:
   *   1. Look up service by id + version (or 'latest')
   *   2. Find the FIRST ExecutionDescriptor compatible with the target tier
   *   3. Return the manifest + selected descriptor + resolved tier
   *
   * @throws NotFoundException if service doesn't exist
   * @throws BadRequestException if no descriptor is compatible with the target tier
   */
  resolveForNode(
    serviceId: string,
    version: string = 'latest',
    targetTier: NodeTier = 'CENTRAL',
  ): ServiceLookupResult {
    const manifest = this.findByIdAndVersion(serviceId, version);

    // Find the best descriptor for this tier
    const selectedDescriptor = this._selectDescriptor(manifest, targetTier);
    if (!selectedDescriptor) {
      const availableTiers = this._allCompatibleTiers(manifest);
      throw new BadRequestException(
        `[Stage 7] Service '${serviceId}@${version}' cannot be executed on a ${targetTier} node. ` +
        `Compatible tiers: [${availableTiers.join(', ')}]. ` +
        `Add an ExecutionDescriptor with compatibleTiers including '${targetTier}' to fix this.`
      );
    }

    return { manifest, selectedDescriptor, targetTier };
  }

  /**
   * Find all services compatible with a given node tier.
   * Used by LLM prompt builders to show available actions.
   */
  findCompatibleWith(tier: NodeTier): PowerfulServiceManifest[] {
    return Array.from(this.store.values()).filter(
      svc => svc.nodeRequirements.supportedTiers.includes(tier)
    );
  }

  /**
   * Search services by tags, category, or free-text name match.
   */
  search(query: string, category?: string, tier?: NodeTier): PowerfulServiceManifest[] {
    const q = query.toLowerCase();
    return Array.from(this.store.values()).filter(svc => {
      const matchesQuery = !q || svc.id.includes(q) || svc.name.toLowerCase().includes(q) ||
        svc.tags.some(t => t.includes(q)) || svc.description.toLowerCase().includes(q);
      const matchesCategory = !category || svc.category === category;
      const matchesTier = !tier || svc.nodeRequirements.supportedTiers.includes(tier);
      return matchesQuery && matchesCategory && matchesTier;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CRUD
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register a new service (or update if allowUpdate=true).
   * Called by the REST API controller when users publish their own services.
   */
  register(manifest: PowerfulServiceManifest, allowUpdate = false): PowerfulServiceManifest {
    const key = this._key(manifest.id, manifest.version);

    if (this.store.has(key) && !allowUpdate) {
      throw new ConflictException(
        `Service '${manifest.id}@${manifest.version}' already exists. Use PUT to update.`
      );
    }

    this._validate(manifest);
    this._store(manifest, true); // persist user-defined services
    this.logger.log(`[ServiceRegistry] Registered: ${key} (category: ${manifest.category}, formats: ${this._formats(manifest).join('/')})`);
    return manifest;
  }

  /**
   * Remove a user-defined service. Built-in services cannot be removed.
   */
  unregister(serviceId: string, version: string): void {
    const key = this._key(serviceId, version);
    const manifest = this.store.get(key);
    if (!manifest) throw new NotFoundException(`Service '${key}' not found`);
    if (manifest.publishedBy === 'eyeflow.core') {
      throw new BadRequestException(`Built-in service '${key}' cannot be removed`);
    }
    this.store.delete(key);
    this._persistToDisk();
    this.logger.log(`[ServiceRegistry] Removed: ${key}`);
  }

  findByIdAndVersion(serviceId: string, version = 'latest'): PowerfulServiceManifest {
    if (version === 'latest') {
      // Find highest semver for this id
      const versions = Array.from(this.store.values())
        .filter(s => s.id === serviceId)
        .sort((a, b) => this._compareSemver(b.version, a.version));
      if (versions.length === 0) {
        throw new NotFoundException(`Service '${serviceId}' not found. Use GET /services to see available services.`);
      }
      return versions[0];
    }

    const manifest = this.store.get(this._key(serviceId, version));
    if (!manifest) {
      throw new NotFoundException(`Service '${serviceId}@${version}' not found`);
    }
    return manifest;
  }

  /**
   * Convenience alias — returns the latest version of a service, or undefined
   * if not found.  Used by Stage 5 (FormalVerifier) which should not throw.
   */
  getService(serviceId: string): PowerfulServiceManifest | undefined {
    try {
      return this.findByIdAndVersion(serviceId, 'latest');
    } catch {
      return undefined;
    }
  }

  listAll(): PowerfulServiceManifest[] {
    return Array.from(this.store.values());
  }

  getStats(): RegistryStats {
    const all = this.listAll();
    const byCategory: Record<string, number> = {};
    const byFormat: Record<string, number> = {};

    for (const svc of all) {
      byCategory[svc.category] = (byCategory[svc.category] || 0) + 1;
      for (const f of this._formats(svc)) {
        byFormat[f] = (byFormat[f] || 0) + 1;
      }
    }

    return {
      total: all.length,
      byCategory,
      byFormat,
      trustedCount: all.filter(s => s.trusted).length,
      userDefinedCount: all.filter(s => s.publishedBy !== 'eyeflow.core').length,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internals
  // ─────────────────────────────────────────────────────────────────────────

  private _key(id: string, version: string): string {
    return `${id}@${version}`;
  }

  private _store(manifest: PowerfulServiceManifest, persist: boolean): void {
    this.store.set(this._key(manifest.id, manifest.version), manifest);
    if (persist) this._persistToDisk();
  }

  private _validate(manifest: PowerfulServiceManifest): void {
    if (!manifest.id?.match(/^[a-z0-9-]+(\.[a-z0-9-]+)*$/)) {
      throw new BadRequestException(`Invalid service id '${manifest.id}'. Must be kebab-case (a-z, 0-9, hyphens, dots).`);
    }
    if (!manifest.version?.match(/^\d+\.\d+\.\d+/)) {
      throw new BadRequestException(`Invalid version '${manifest.version}'. Must be semver (e.g. 1.0.0).`);
    }
    if (!manifest.executionDescriptors?.length) {
      throw new BadRequestException(`Service '${manifest.id}' must have at least one executionDescriptor.`);
    }
    if (!manifest.inputs?.length) {
      throw new BadRequestException(`Service '${manifest.id}' must declare at least one input port.`);
    }
    if (!manifest.outputs?.length) {
      throw new BadRequestException(`Service '${manifest.id}' must declare at least one output port.`);
    }
  }

  private _selectDescriptor(manifest: PowerfulServiceManifest, tier: NodeTier): ExecutionDescriptor | undefined {
    return manifest.executionDescriptors.find(d => (d.compatibleTiers as string[]).includes(tier) || (d.compatibleTiers as string[]).includes('ANY'));
  }

  private _allCompatibleTiers(manifest: PowerfulServiceManifest): NodeTier[] {
    const set = new Set<NodeTier>();
    for (const d of manifest.executionDescriptors) {
      for (const t of d.compatibleTiers) set.add(t);
    }
    return Array.from(set);
  }

  private _formats(manifest: PowerfulServiceManifest): ServiceFormat[] {
    return [...new Set(manifest.executionDescriptors.map(d => d.format))];
  }

  private _compareSemver(a: string, b: string): number {
    const parse = (v: string) => v.split('.').map(Number);
    const [aMaj, aMin, aPat] = parse(a);
    const [bMaj, bMin, bPat] = parse(b);
    if (aMaj !== bMaj) return aMaj - bMaj;
    if (aMin !== bMin) return aMin - bMin;
    return aPat - bPat;
  }

  private _loadFromDisk(): void {
    if (!fs.existsSync(this.persistPath)) return;
    try {
      const raw = fs.readFileSync(this.persistPath, 'utf8');
      const services: PowerfulServiceManifest[] = JSON.parse(raw);
      let count = 0;
      for (const svc of services) {
        const key = this._key(svc.id, svc.version);
        if (!this.store.has(key)) { // don't override built-ins
          this.store.set(key, svc);
          count++;
        }
      }
      if (count > 0) this.logger.log(`[ServiceRegistry] Loaded ${count} user-defined services from disk`);
    } catch (err: any) {
      this.logger.warn(`[ServiceRegistry] Failed to load persisted services: ${err.message}`);
    }
  }

  private _persistToDisk(): void {
    try {
      const userDefined = Array.from(this.store.values()).filter(s => s.publishedBy !== 'eyeflow.core');
      fs.writeFileSync(this.persistPath, JSON.stringify(userDefined, null, 2), 'utf8');
    } catch (err: any) {
      this.logger.warn(`[ServiceRegistry] Failed to persist services: ${err.message}`);
    }
  }
}
