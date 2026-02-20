/**
 * Version Lifecycle Service — spec §11.1-11.2
 *
 * Enforces the version state machine required by spec §11:
 *
 *   DRAFT ──► VALIDATING ──► VALID ──► ACTIVE ──► ARCHIVED
 *                │                        │
 *                └── (validation fails) ──┘ (re-compile → new DRAFT)
 *
 * §11.1 — Lineage traceability: every version carries `parentVersion`,
 *          `irChecksum`, `validatedBy`, `changeReason`.
 *
 * §11.2 — Immutability: once a version leaves DRAFT, its IR binary
 *          and DAG definition are frozen (checksum-guarded write).
 *
 * §11.3 — Active version management: only one version per project may
 *          be ACTIVE at a time; promoting a new version atomically
 *          archives the previous one.
 */

import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { ProjectVersionEntity } from '../entities/project-version.entity';
import { ProjectVersionStatus } from '../types/project.types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PromoteVersionInput {
  projectId:    string;
  validatedBy:  string;          // UUID of the validating user
  validationReason?: string;
  changeReason?: string;
}

export interface VersionLineageNode {
  id:            string;
  version:       number;
  status:        ProjectVersionStatus;
  parentVersion: number | undefined;
  irChecksum:    string;
  validatedBy:   string | undefined;
  validatedAt:   Date | undefined;
  changeReason:  string | undefined;
  createdAt:     Date;
}

// ── Allowed transitions ───────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<string, ProjectVersionStatus[]> = {
  [ProjectVersionStatus.DRAFT]:      [ProjectVersionStatus.VALIDATING, ProjectVersionStatus.ARCHIVED],
  [ProjectVersionStatus.VALIDATING]: [ProjectVersionStatus.VALID, ProjectVersionStatus.DRAFT],
  [ProjectVersionStatus.VALID]:      [ProjectVersionStatus.ACTIVE, ProjectVersionStatus.ARCHIVED],
  [ProjectVersionStatus.ACTIVE]:     [ProjectVersionStatus.ARCHIVED, ProjectVersionStatus.EXECUTING],
  [ProjectVersionStatus.EXECUTING]:  [ProjectVersionStatus.ACTIVE],
  [ProjectVersionStatus.ARCHIVED]:   [],  // terminal — immutable
};

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class VersionLifecycleService {
  private readonly logger = new Logger(VersionLifecycleService.name);

  constructor(
    @InjectRepository(ProjectVersionEntity)
    private readonly repo: Repository<ProjectVersionEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // ── 1. Transition validation ──────────────────────────────────────────────

  /**
   * Validate that a status transition is allowed by the state machine.
   * Throws `BadRequestException` if the transition is forbidden.
   */
  assertTransitionAllowed(
    current: ProjectVersionStatus,
    next: ProjectVersionStatus,
    versionId: string,
  ): void {
    const allowed = ALLOWED_TRANSITIONS[current] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Version ${versionId}: transition ${current} → ${next} is not allowed. ` +
        `Allowed next states: [${allowed.join(', ')}]`
      );
    }
  }

  // ── 2. Submit for validation (DRAFT → VALIDATING) ─────────────────────────

  /**
   * Freeze a DRAFT version for validation.
   * Computes irChecksum to detect further edits (§11.2 immutability).
   */
  async submitForValidation(versionId: string): Promise<ProjectVersionEntity> {
    const version = await this._findOrFail(versionId);
    this.assertTransitionAllowed(version.status, ProjectVersionStatus.VALIDATING, versionId);

    // Compute/verify irChecksum (§11.1)
    const computedChecksum = this._computeIrChecksum(version.irBinary);
    if (version.irChecksum && version.irChecksum !== computedChecksum) {
      throw new ConflictException(
        `Version ${versionId}: IR binary has been modified after initial storage ` +
        `(stored checksum: ${version.irChecksum}, computed: ${computedChecksum}). ` +
        `Re-compile to create a new version.`
      );
    }

    version.irChecksum = computedChecksum;
    version.status = ProjectVersionStatus.VALIDATING;

    this.logger.log(`[VersionLifecycle] ${versionId} v${version.version}: DRAFT → VALIDATING`);
    return this.repo.save(version);
  }

  // ── 3. Mark as validated (VALIDATING → VALID) ────────────────────────────

  async markValidated(
    versionId: string,
    validatedBy: string,
    validationReason?: string,
  ): Promise<ProjectVersionEntity> {
    const version = await this._findOrFail(versionId);
    this.assertTransitionAllowed(version.status, ProjectVersionStatus.VALID, versionId);

    version.status          = ProjectVersionStatus.VALID;
    version.validatedBy     = validatedBy;
    version.validatedAt     = new Date();
    version.validationReason = validationReason;

    this.logger.log(
      `[VersionLifecycle] ${versionId} v${version.version}: VALIDATING → VALID ` +
      `(validated by ${validatedBy})`
    );
    return this.repo.save(version);
  }

  // ── 4. Promote to ACTIVE (VALID → ACTIVE) — atomic ───────────────────────

  /**
   * Atomically promote a VALID version to ACTIVE and archive the
   * previously ACTIVE version (spec §11.3 — single active version).
   */
  async promoteToActive(input: PromoteVersionInput): Promise<ProjectVersionEntity> {
    const { projectId, validatedBy, validationReason, changeReason } = input;

    return this.dataSource.transaction(async manager => {
      const versionRepo = manager.getRepository(ProjectVersionEntity);

      // Find the VALID version to promote
      const candidate = await versionRepo.findOne({
        where: { projectId, status: ProjectVersionStatus.VALID },
        order: { version: 'DESC' },
      });

      if (!candidate) {
        throw new NotFoundException(
          `No VALID version found for project ${projectId}. ` +
          `Submit a version for validation first.`
        );
      }

      this.assertTransitionAllowed(candidate.status, ProjectVersionStatus.ACTIVE, candidate.id);

      // Archive currently ACTIVE version
      const currentActive = await versionRepo.findOne({
        where: { projectId, status: ProjectVersionStatus.ACTIVE },
      });

      if (currentActive) {
        currentActive.status     = ProjectVersionStatus.ARCHIVED;
        currentActive.archivedAt = new Date();
        await versionRepo.save(currentActive);
        this.logger.log(
          `[VersionLifecycle] Project ${projectId}: v${currentActive.version} archived`
        );
      }

      // Promote candidate
      candidate.status          = ProjectVersionStatus.ACTIVE;
      candidate.validatedBy     = validatedBy;
      candidate.validatedAt     = new Date();
      candidate.validationReason = validationReason;
      candidate.changeReason     = changeReason ?? candidate.changeReason;

      await versionRepo.save(candidate);
      this.logger.log(
        `[VersionLifecycle] Project ${projectId}: v${candidate.version} → ACTIVE`
      );

      return candidate;
    });
  }

  // ── 5. Archive a version ─────────────────────────────────────────────────

  async archiveVersion(versionId: string): Promise<ProjectVersionEntity> {
    const version = await this._findOrFail(versionId);
    this.assertTransitionAllowed(version.status, ProjectVersionStatus.ARCHIVED, versionId);

    version.status     = ProjectVersionStatus.ARCHIVED;
    version.archivedAt = new Date();

    this.logger.log(
      `[VersionLifecycle] ${versionId} v${version.version}: → ARCHIVED`
    );
    return this.repo.save(version);
  }

  // ── 6. Lineage / traceability ─────────────────────────────────────────────

  /**
   * Returns the full version lineage for a project (spec §11.1).
   * Sorted by version number ascending — can be traversed via parentVersion.
   */
  async getVersionLineage(projectId: string): Promise<VersionLineageNode[]> {
    const versions = await this.repo.find({
      where: { projectId },
      order: { version: 'ASC' },
    });

    return versions.map(v => ({
      id:            v.id,
      version:       v.version,
      status:        v.status as ProjectVersionStatus,
      parentVersion: v.parentVersion,
      irChecksum:    v.irChecksum,
      validatedBy:   v.validatedBy,
      validatedAt:   v.validatedAt,
      changeReason:  v.changeReason,
      createdAt:     v.createdAt,
    }));
  }

  /**
   * Get the currently ACTIVE version for a project.
   */
  async getActiveVersion(projectId: string): Promise<ProjectVersionEntity | null> {
    return this.repo.findOne({
      where: { projectId, status: ProjectVersionStatus.ACTIVE },
    });
  }

  // ── 7. Immutability guard (§11.2) ─────────────────────────────────────────

  /**
   * Verify that the stored IR binary matches the stored checksum.
   * Returns false if the binary has been altered outside the lifecycle.
   */
  async verifyIrIntegrity(versionId: string): Promise<{
    versionId: string;
    intact: boolean;
    storedChecksum: string;
    computedChecksum: string;
  }> {
    const version = await this._findOrFail(versionId);
    const computedChecksum = this._computeIrChecksum(version.irBinary);

    return {
      versionId,
      intact:           computedChecksum === version.irChecksum,
      storedChecksum:   version.irChecksum,
      computedChecksum,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async _findOrFail(id: string): Promise<ProjectVersionEntity> {
    const v = await this.repo.findOne({ where: { id } });
    if (!v) throw new NotFoundException(`ProjectVersion ${id} not found`);
    return v;
  }

  /** SHA-256 of the base64-encoded IR binary string */
  private _computeIrChecksum(irBinary: string): string {
    return crypto.createHash('sha256').update(irBinary).digest('hex');
  }
}
