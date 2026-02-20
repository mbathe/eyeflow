/**
 * SERVICE REGISTRY CONTROLLER
 *
 * REST API for managing the service catalogue.
 *
 * Endpoints
 * ─────────
 *  GET    /services              – List all services (with optional filters)
 *  GET    /services/stats        – Catalogue statistics
 *  GET    /services/:id          – Get latest version of a service
 *  GET    /services/:id/:version – Get specific version
 *  POST   /services              – Register a new user-defined service
 *  PUT    /services/:id/:version – Update an existing user-defined service
 *  DELETE /services/:id/:version – Remove a user-defined service
 *  POST   /services/resolve      – Compiler-facing: resolve a service for a node tier
 */

import {
  Controller, Get, Post, Put, Delete, Body, Param,
  Query, HttpCode, HttpStatus, Logger,
} from '@nestjs/common';
import { ServiceRegistryService } from './service-registry.service';
import { PowerfulServiceManifest, NodeTier } from './interfaces/service-manifest.interface';

// ─────────────────────────────────────────────────────────────────────────────

@Controller('services')
export class ServiceRegistryController {
  private readonly logger = new Logger(ServiceRegistryController.name);

  constructor(private readonly registry: ServiceRegistryService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Listing & search
  // ─────────────────────────────────────────────────────────────────────────

  @Get()
  listAll(
    @Query('q') query?: string,
    @Query('category') category?: string,
    @Query('tier') tier?: NodeTier,
  ) {
    const services = query || category || tier
      ? this.registry.search(query || '', category, tier)
      : this.registry.listAll();

    return {
      count: services.length,
      services: services.map(s => this._toSummary(s)),
    };
  }

  @Get('stats')
  getStats() {
    return this.registry.getStats();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Single service
  // ─────────────────────────────────────────────────────────────────────────

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.registry.findByIdAndVersion(id, 'latest');
  }

  @Get(':id/:version')
  getByIdAndVersion(@Param('id') id: string, @Param('version') version: string) {
    return this.registry.findByIdAndVersion(id, version);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Register / update
  // ─────────────────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  register(@Body() manifest: PowerfulServiceManifest) {
    this.logger.log(`[API] Registering service: ${manifest.id}@${manifest.version}`);
    return this.registry.register(manifest, false);
  }

  @Put(':id/:version')
  update(
    @Param('id') id: string,
    @Param('version') version: string,
    @Body() manifest: PowerfulServiceManifest,
  ) {
    // Enforce that the path params match the body
    manifest.id = id;
    manifest.version = version;
    this.logger.log(`[API] Updating service: ${id}@${version}`);
    return this.registry.register(manifest, true);
  }

  @Delete(':id/:version')
  @HttpCode(HttpStatus.NO_CONTENT)
  unregister(@Param('id') id: string, @Param('version') version: string) {
    this.logger.log(`[API] Removing service: ${id}@${version}`);
    this.registry.unregister(id, version);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Compiler-facing resolution
  // ─────────────────────────────────────────────────────────────────────────

  @Post('resolve')
  resolve(
    @Body() body: { serviceId: string; version?: string; targetTier?: NodeTier }
  ) {
    const result = this.registry.resolveForNode(
      body.serviceId,
      body.version || 'latest',
      body.targetTier || 'CENTRAL',
    );
    return {
      serviceId: result.manifest.id,
      version: result.manifest.version,
      selectedFormat: result.selectedDescriptor.format,
      targetTier: result.targetTier,
      descriptor: result.selectedDescriptor,
      contract: result.manifest.contract,
      nodeRequirements: result.manifest.nodeRequirements,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────

  private _toSummary(s: PowerfulServiceManifest) {
    return {
      id: s.id,
      name: s.name,
      version: s.version,
      category: s.category,
      tags: s.tags,
      formats: [...new Set(s.executionDescriptors.map(d => d.format))],
      tiers: s.nodeRequirements.supportedTiers,
      trusted: s.trusted,
      author: s.author,
    };
  }
}
