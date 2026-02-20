/**
 * LLM Project Service
 * 
 * Manages project lifecycle:
 * - Create projects with security scoping
 * - List/get projects
 * - Update projects
 * - Archive/delete projects
 * - Manage versions (create, validate, activate)
 */

import { Injectable, BadRequestException, NotFoundException, Logger, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

import { LLMProjectEntity } from '../entities/llm-project.entity';
import { ProjectVersionEntity } from '../entities/project-version.entity';
import { ExecutionMemoryStateEntity } from '../entities/execution-memory-state.entity';
import { ExecutionRecordEntity } from '../entities/execution-record.entity';

import { CreateLLMProjectDto, UpdateLLMProjectDto, LLMProjectDto, CreateProjectVersionDto, ProjectVersionDto } from '../dto/project.dto';
import { ProjectStatus, ProjectVersionStatus, ExecutionStatus } from '../types/project.types';

@Injectable()
export class LLMProjectService {
  private readonly logger = new Logger(LLMProjectService.name);

  constructor(
    @InjectRepository(LLMProjectEntity)
    private readonly projectRepository: Repository<LLMProjectEntity>,
    
    @InjectRepository(ProjectVersionEntity)
    private readonly versionRepository: Repository<ProjectVersionEntity>,
    
    @InjectRepository(ExecutionMemoryStateEntity)
    private readonly memoryStateRepository: Repository<ExecutionMemoryStateEntity>,
    
    @InjectRepository(ExecutionRecordEntity)
    private readonly executionRecordRepository: Repository<ExecutionRecordEntity>,
  ) {}

  // ==========================================
  // PROJECT CRUD
  // ==========================================

  /**
   * Create a new project
   */
  async createProject(userId: string, dto: CreateLLMProjectDto): Promise<LLMProjectDto> {
    try {
      const project = new LLMProjectEntity();
      project.id = uuidv4();
      project.userId = userId;
      project.name = dto.name;
      project.description = dto.description;
      project.allowedConnectorIds = dto.allowedConnectorIds;
      project.allowedFunctionIds = dto.allowedFunctionIds;
      project.allowedTriggerTypes = dto.allowedTriggerTypes;
      project.allowedNodeIds = dto.allowedNodeIds;
      project.llmModel = dto.llmModel;
      project.defaultTimeoutMs = dto.defaultTimeoutMs || 30000;
      project.status = ProjectStatus.DRAFT;
      project.currentVersion = 1;
      project.totalVersions = 0;
      project.totalTasks = 0;
      project.totalExecutions = 0;
      project.metadata = dto.metadata;
      project.tags = dto.tags;

      const saved = await this.projectRepository.save(project);
      this.logger.log(`Project created: ${saved.id} by user ${userId}`);

      return this.projectToDto(saved);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Failed to create project: ${msg}`);
    }
  }

  /**
   * Get project by ID
   */
  async getProject(userId: string, projectId: string): Promise<LLMProjectDto> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, userId },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    return this.projectToDto(project);
  }

  /**
   * List all projects for a user
   */
  async listProjects(userId: string, filters?: { status?: ProjectStatus; tag?: string }): Promise<LLMProjectDto[]> {
    let query = this.projectRepository.createQueryBuilder('p').where('p.userId = :userId', { userId });

    if (filters?.status) {
      query = query.andWhere('p.status = :status', { status: filters.status });
    }

    if (filters?.tag) {
      query = query.andWhere(':tag = ANY(p.tags)', { tag: filters.tag });
    }

    const projects = await query.orderBy('p.updatedAt', 'DESC').getMany();
    return projects.map((p) => this.projectToDto(p));
  }

  /**
   * Update project
   */
  async updateProject(userId: string, projectId: string, dto: UpdateLLMProjectDto): Promise<LLMProjectDto> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, userId },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    // Update fields
    if (dto.name !== undefined) project.name = dto.name;
    if (dto.description !== undefined) project.description = dto.description;
    if (dto.allowedConnectorIds) project.allowedConnectorIds = dto.allowedConnectorIds;
    if (dto.allowedFunctionIds) project.allowedFunctionIds = dto.allowedFunctionIds;
    if (dto.allowedTriggerTypes) project.allowedTriggerTypes = dto.allowedTriggerTypes;
    if (dto.allowedNodeIds !== undefined) project.allowedNodeIds = dto.allowedNodeIds;
    if (dto.status) project.status = dto.status;
    if (dto.llmModel !== undefined) project.llmModel = dto.llmModel;
    if (dto.defaultTimeoutMs !== undefined) project.defaultTimeoutMs = dto.defaultTimeoutMs;
    if (dto.metadata) project.metadata = { ...project.metadata, ...dto.metadata };
    if (dto.tags) project.tags = dto.tags;

    const saved = await this.projectRepository.save(project);
    this.logger.log(`Project updated: ${projectId}`);

    return this.projectToDto(saved);
  }

  /**
   * Archive project
   */
  async archiveProject(userId: string, projectId: string): Promise<LLMProjectDto> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, userId },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    project.status = ProjectStatus.ARCHIVED;
    project.archivedAt = new Date();

    const saved = await this.projectRepository.save(project);
    this.logger.log(`Project archived: ${projectId}`);

    return this.projectToDto(saved);
  }

  // ==========================================
  // VERSION MANAGEMENT (Strict Versioning)
  // ==========================================

  /**
   * Create a new version
   * 
   * Rules:
   * - Cannot create new version if execution is active
   * - Must derive from active version
   * - Starts in DRAFT status
   */
  async createVersion(userId: string, projectId: string, dto: CreateProjectVersionDto): Promise<ProjectVersionDto> {
    // Get project
    const project = await this.projectRepository.findOne({
      where: { id: projectId, userId },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    // Check if any execution is active with current version
    const activeExecutions = await this.executionRecordRepository.find({
      where: {
        projectVersionId: project.activeVersionId,
        status: ExecutionStatus.RUNNING,
      },
    });

    if (activeExecutions.length > 0) {
      throw new ConflictException(
        `Cannot create new version while ${activeExecutions.length} execution(s) are running. Wait for completion or force stop.`,
      );
    }

    // Get parent version
    let parentVersion: ProjectVersionEntity | null = null;
    if (project.activeVersionId) {
      parentVersion = await this.versionRepository.findOne({
        where: { id: project.activeVersionId },
      });
    }

    // Create new version
    const newVersionNumber = project.currentVersion + 1;
    const version = new ProjectVersionEntity();
    version.id = uuidv4();
    version.projectId = projectId;
    version.version = newVersionNumber;
    version.parentVersion = parentVersion?.version;
    version.status = ProjectVersionStatus.DRAFT;
    version.dagDefinition = dto.dagDefinition;
    version.dagChecksum = this.computeChecksum(JSON.stringify(dto.dagDefinition));
    
    // Placeholder for IR binary (will be filled by compiler)
    version.irBinary = '';
    version.irChecksum = '';
    version.irSignature = '';
    version.signatureKeyId = '';
    
    // Placeholder for placements
    version.nodePlacements = {};
    
    version.compiledAt = new Date();
    version.changeReason = dto.changeReason;
    version.changedFields = dto.changedFields;
    version.metadata = dto.metadata;
    version.totalExecutions = 0;
    version.successfulExecutions = 0;
    version.failedExecutions = 0;

    const saved = await this.versionRepository.save(version);
    
    // Update project
    project.totalVersions = newVersionNumber;
    await this.projectRepository.save(project);

    this.logger.log(`Version created: ${projectId} v${newVersionNumber}`);

    return this.versionToDto(saved);
  }

  /**
   * Get version by ID
   */
  async getVersion(userId: string, projectId: string, versionId: string): Promise<ProjectVersionDto> {
    // Verify project ownership
    const project = await this.projectRepository.findOne({
      where: { id: projectId, userId },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    const version = await this.versionRepository.findOne({
      where: { id: versionId, projectId },
    });

    if (!version) {
      throw new NotFoundException(`Version ${versionId} not found`);
    }

    return this.versionToDto(version);
  }

  /**
   * List all versions of a project
   */
  async listVersions(userId: string, projectId: string, filters?: { status?: ProjectVersionStatus }): Promise<ProjectVersionDto[]> {
    // Verify project ownership
    const project = await this.projectRepository.findOne({
      where: { id: projectId, userId },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    let query = this.versionRepository.createQueryBuilder('v').where('v.projectId = :projectId', { projectId });

    if (filters?.status) {
      query = query.andWhere('v.status = :status', { status: filters.status });
    }

    const versions = await query.orderBy('v.version', 'DESC').getMany();
    return versions.map((v) => this.versionToDto(v));
  }

  /**
   * Validate a version (moves from DRAFT to VALID)
   * Placeholder for now — full validation in separate service
   */
  async validateVersion(userId: string, projectId: string, versionId: string): Promise<ProjectVersionDto> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, userId },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    const version = await this.versionRepository.findOne({
      where: { id: versionId, projectId },
    });

    if (!version) {
      throw new NotFoundException(`Version ${versionId} not found`);
    }

    if (version.status !== ProjectVersionStatus.DRAFT) {
      throw new BadRequestException(`Cannot validate version in status ${version.status}`);
    }

    version.status = ProjectVersionStatus.VALID;
    version.validatedBy = userId;
    version.validatedAt = new Date();

    const saved = await this.versionRepository.save(version);
    this.logger.log(`Version validated: ${projectId} v${version.version}`);

    return this.versionToDto(saved);
  }

  /**
   * Activate a version (moves to ACTIVE)
   * Only one version can be ACTIVE at a time
   */
  async activateVersion(userId: string, projectId: string, versionId: string): Promise<ProjectVersionDto> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, userId },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    const version = await this.versionRepository.findOne({
      where: { id: versionId, projectId },
    });

    if (!version) {
      throw new NotFoundException(`Version ${versionId} not found`);
    }

    if (version.status === ProjectVersionStatus.DRAFT) {
      throw new BadRequestException('Cannot activate draft version. Must be VALID first.');
    }

    if (version.status === ProjectVersionStatus.ARCHIVED) {
      throw new BadRequestException('Cannot activate archived version.');
    }

    // Deactivate previous version
    if (project.activeVersionId && project.activeVersionId !== versionId) {
      const previousVersion = await this.versionRepository.findOne({
        where: { id: project.activeVersionId },
      });

      if (previousVersion && previousVersion.status === ProjectVersionStatus.ACTIVE) {
        previousVersion.status = ProjectVersionStatus.ARCHIVED;
        await this.versionRepository.save(previousVersion);
      }
    }

    // Activate new version
    version.status = ProjectVersionStatus.ACTIVE;
    const saved = await this.versionRepository.save(version);

    // Update project
    project.activeVersionId = versionId;
    project.currentVersion = version.version;
    await this.projectRepository.save(project);

    this.logger.log(`Version activated: ${projectId} v${version.version}`);

    return this.versionToDto(saved);
  }

  /**
   * Archive a version (prevent new executions)
   */
  async archiveVersion(userId: string, projectId: string, versionId: string): Promise<ProjectVersionDto> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, userId },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    const version = await this.versionRepository.findOne({
      where: { id: versionId, projectId },
    });

    if (!version) {
      throw new NotFoundException(`Version ${versionId} not found`);
    }

    if (version.status === ProjectVersionStatus.EXECUTING) {
      throw new ConflictException('Cannot archive version with active executions.');
    }

    if (project.activeVersionId === versionId) {
      throw new ConflictException('Cannot archive active version.');
    }

    version.status = ProjectVersionStatus.ARCHIVED;
    version.archivedAt = new Date();

    const saved = await this.versionRepository.save(version);
    this.logger.log(`Version archived: ${projectId} v${version.version}`);

    return this.versionToDto(saved);
  }

  // ==========================================
  // STATE MANAGEMENT
  // ==========================================

  /**
   * Get or create execution memory state for a node
   */
  async getOrCreateExecutionState(projectVersionId: string, executionId: string, nodeId: string): Promise<ExecutionMemoryStateEntity> {
    let state = await this.memoryStateRepository.findOne({
      where: {
        projectVersionId,
        executionId,
        nodeId,
      },
    });

    if (!state) {
      state = new ExecutionMemoryStateEntity();
      state.id = uuidv4();
      state.projectVersionId = projectVersionId;
      state.executionId = executionId;
      state.nodeId = nodeId;
      state.triggerCount = 0;
      state.consecutiveMatches = 0;
      state.actionsTriggeredInState = 0;
      state.consecutiveErrors = 0;

      state = await this.memoryStateRepository.save(state);
    }

    return state;
  }

  // ==========================================
  // UTILITY
  // ==========================================

  private computeChecksum(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private projectToDto(project: LLMProjectEntity): LLMProjectDto {
    return {
      id: project.id,
      userId: project.userId,
      name: project.name,
      description: project.description,
      allowedConnectorIds: project.allowedConnectorIds,
      allowedFunctionIds: project.allowedFunctionIds,
      allowedTriggerTypes: project.allowedTriggerTypes,
      allowedNodeIds: project.allowedNodeIds,
      status: project.status,
      currentVersion: project.currentVersion,
      activeVersionId: project.activeVersionId,
      totalVersions: project.totalVersions,
      totalTasks: project.totalTasks,
      totalExecutions: project.totalExecutions,
      lastExecutionAt: project.lastExecutionAt,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      archivedAt: project.archivedAt,
      metadata: project.metadata,
      tags: project.tags,
    };
  }

  private versionToDto(version: ProjectVersionEntity): ProjectVersionDto {
    return {
      id: version.id,
      projectId: version.projectId,
      version: version.version,
      parentVersion: version.parentVersion,
      status: version.status,
      dagDefinition: version.dagDefinition,
      dagChecksum: version.dagChecksum,
      irChecksum: version.irChecksum,
      validationReport: version.validationReport,
      validatedBy: version.validatedBy,
      validatedAt: version.validatedAt,
      compiledAt: version.compiledAt,
      totalExecutions: version.totalExecutions,
      successfulExecutions: version.successfulExecutions,
      failedExecutions: version.failedExecutions,
      createdAt: version.createdAt,
      archivedAt: version.archivedAt,
      lastExecutionAt: version.lastExecutionAt,
      metadata: version.metadata,
    };
  }
}
