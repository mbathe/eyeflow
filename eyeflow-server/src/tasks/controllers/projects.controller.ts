/**
 * Projects Controller
 * 
 * API endpoints for:
 * - Project management (create, list, get, update, archive)
 * - Version management (create, list, validate, activate, archive)
 */

import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Headers,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

import { LLMProjectService } from '../services/llm-project.service';
import { LLMProjectExecutionService } from '../services/llm-project-execution.service';
import { CreateLLMProjectDto, UpdateLLMProjectDto, LLMProjectDto, CreateProjectVersionDto, ProjectVersionDto } from '../dto/project.dto';
import { ProjectStatus, ProjectVersionStatus } from '../types/project.types';

@ApiTags('Projects')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectService: LLMProjectService,
    private readonly executionService: LLMProjectExecutionService,
  ) {}

  // ==========================================
  // PROJECT ENDPOINTS
  // ==========================================

  /**
   * POST /projects
   * Create a new project (persistent session/workspace)
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create new project',
    description: 'Create a persistent project with security scoping (allowed connectors, functions, triggers)',
  })
  @ApiHeader({
    name: 'X-User-ID',
    description: 'User ID for multi-tenancy',
    required: true,
  })
  @ApiResponse({
    status: 201,
    description: 'Project created',
    type: LLMProjectDto,
  })
  async createProject(
    @Headers('X-User-ID') userId: string,
    @Body() dto: CreateLLMProjectDto,
  ): Promise<LLMProjectDto> {
    if (!userId) {
      throw new BadRequestException('X-User-ID header required');
    }
    return this.projectService.createProject(userId, dto);
  }

  /**
   * GET /projects/:projectId
   * Get project details
   */
  @Get(':projectId')
  @ApiOperation({ summary: 'Get project by ID' })
  @ApiHeader({
    name: 'X-User-ID',
    required: true,
  })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: LLMProjectDto })
  async getProject(
    @Headers('X-User-ID') userId: string,
    @Param('projectId') projectId: string,
  ): Promise<LLMProjectDto> {
    if (!userId) {
      throw new BadRequestException('X-User-ID header required');
    }
    return this.projectService.getProject(userId, projectId);
  }

  /**
   * GET /projects
   * List all projects for user
   */
  @Get()
  @ApiOperation({ summary: 'List all projects' })
  @ApiHeader({ name: 'X-User-ID', required: true })
  @ApiQuery({ name: 'status', required: false, enum: ProjectStatus })
  @ApiQuery({ name: 'tag', required: false, type: String })
  @ApiResponse({ status: 200, type: [LLMProjectDto] })
  async listProjects(
    @Headers('X-User-ID') userId: string,
    @Query('status') status?: ProjectStatus,
    @Query('tag') tag?: string,
  ): Promise<LLMProjectDto[]> {
    if (!userId) {
      throw new BadRequestException('X-User-ID header required');
    }
    return this.projectService.listProjects(userId, { status, tag });
  }

  /**
   * PUT /projects/:projectId
   * Update project
   */
  @Put(':projectId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update project' })
  @ApiHeader({ name: 'X-User-ID', required: true })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: LLMProjectDto })
  async updateProject(
    @Headers('X-User-ID') userId: string,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateLLMProjectDto,
  ): Promise<LLMProjectDto> {
    if (!userId) {
      throw new BadRequestException('X-User-ID header required');
    }
    return this.projectService.updateProject(userId, projectId, dto);
  }

  /**
   * DELETE /projects/:projectId
   * Archive project
   */
  @Delete(':projectId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive project (soft delete)' })
  @ApiHeader({ name: 'X-User-ID', required: true })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: LLMProjectDto })
  async archiveProject(
    @Headers('X-User-ID') userId: string,
    @Param('projectId') projectId: string,
  ): Promise<LLMProjectDto> {
    if (!userId) {
      throw new BadRequestException('X-User-ID header required');
    }
    return this.projectService.archiveProject(userId, projectId);
  }

  // ==========================================
  // VERSION ENDPOINTS
  // ==========================================

  /**
   * POST /projects/:projectId/versions
   * Create new version
   */
  @Post(':projectId/versions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create new project version',
    description: 'Create a new DAG version from current. Strict versioning: v1, v2, v3... with full audit.',
  })
  @ApiHeader({ name: 'X-User-ID', required: true })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, type: ProjectVersionDto })
  async createVersion(
    @Headers('X-User-ID') userId: string,
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectVersionDto,
  ): Promise<ProjectVersionDto> {
    if (!userId) {
      throw new BadRequestException('X-User-ID header required');
    }
    return this.projectService.createVersion(userId, projectId, dto);
  }

  /**
   * GET /projects/:projectId/versions/:versionId
   * Get version details
   */
  @Get(':projectId/versions/:versionId')
  @ApiOperation({ summary: 'Get version by ID' })
  @ApiHeader({ name: 'X-User-ID', required: true })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: ProjectVersionDto })
  async getVersion(
    @Headers('X-User-ID') userId: string,
    @Param('projectId') projectId: string,
    @Param('versionId') versionId: string,
  ): Promise<ProjectVersionDto> {
    if (!userId) {
      throw new BadRequestException('X-User-ID header required');
    }
    return this.projectService.getVersion(userId, projectId, versionId);
  }

  /**
   * GET /projects/:projectId/versions
   * List all versions
   */
  @Get(':projectId/versions')
  @ApiOperation({ summary: 'List all versions of project' })
  @ApiHeader({ name: 'X-User-ID', required: true })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'status', required: false, enum: ProjectVersionStatus })
  @ApiResponse({ status: 200, type: [ProjectVersionDto] })
  async listVersions(
    @Headers('X-User-ID') userId: string,
    @Param('projectId') projectId: string,
    @Query('status') status?: ProjectVersionStatus,
  ): Promise<ProjectVersionDto[]> {
    if (!userId) {
      throw new BadRequestException('X-User-ID header required');
    }
    return this.projectService.listVersions(userId, projectId, { status });
  }

  /**
   * POST /projects/:projectId/versions/:versionId/validate
   * Validate version (DRAFT → VALID)
   */
  @Post(':projectId/versions/:versionId/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate version' })
  @ApiHeader({ name: 'X-User-ID', required: true })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: ProjectVersionDto })
  async validateVersion(
    @Headers('X-User-ID') userId: string,
    @Param('projectId') projectId: string,
    @Param('versionId') versionId: string,
  ): Promise<ProjectVersionDto> {
    if (!userId) {
      throw new BadRequestException('X-User-ID header required');
    }
    return this.projectService.validateVersion(userId, projectId, versionId);
  }

  /**
   * POST /projects/:projectId/versions/:versionId/activate
   * Activate version (VALID → ACTIVE)
   */
  @Post(':projectId/versions/:versionId/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate version',
    description: 'Set this version as ACTIVE. Only one version can be ACTIVE at a time.',
  })
  @ApiHeader({ name: 'X-User-ID', required: true })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: ProjectVersionDto })
  async activateVersion(
    @Headers('X-User-ID') userId: string,
    @Param('projectId') projectId: string,
    @Param('versionId') versionId: string,
  ): Promise<ProjectVersionDto> {
    if (!userId) {
      throw new BadRequestException('X-User-ID header required');
    }
    return this.projectService.activateVersion(userId, projectId, versionId);
  }

  /**
   * DELETE /projects/:projectId/versions/:versionId
   * Archive version
   */
  @Delete(':projectId/versions/:versionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive version' })
  @ApiHeader({ name: 'X-User-ID', required: true })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: ProjectVersionDto })
  async archiveVersion(
    @Headers('X-User-ID') userId: string,
    @Param('projectId') projectId: string,
    @Param('versionId') versionId: string,
  ): Promise<ProjectVersionDto> {
    if (!userId) {
      throw new BadRequestException('X-User-ID header required');
    }
    return this.projectService.archiveVersion(userId, projectId, versionId);
  }

  // ==========================================
  // EXECUTION ENDPOINTS
  // ==========================================

  /**
   * POST /projects/:projectId/execute
   * Execute the active version of a project
   */
  @Post(':projectId/execute')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ 
    summary: 'Execute a project version',
    description: 'Execute the active version of a project. Returns execution ID and status.',
  })
  @ApiHeader({ name: 'X-User-ID', required: true, description: 'User ID' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiResponse({ 
    status: 202,
    description: 'Execution started',
    schema: {
      type: 'object',
      properties: {
        executionId: { type: 'string' },
        projectId: { type: 'string' },
        versionId: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'running', 'succeeded', 'failed'] },
        durationMs: { type: 'number' },
        startedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Project or version not found' })
  @ApiResponse({ status: 400, description: 'Project not active or invalid request' })
  async executeProject(
    @Headers('X-User-ID') userId: string,
    @Param('projectId') projectId: string,
    @Body() body?: { triggerType?: string; triggerEventData?: Record<string, any>; parameters?: Record<string, any> },
  ): Promise<any> {
    if (!userId) {
      throw new BadRequestException('X-User-ID header required');
    }

    const triggerType = body?.triggerType || 'MANUAL';
    const triggerEventData = body?.triggerEventData;
    const parameters = body?.parameters;

    return this.executionService.executeProject({
      projectId,
      userId,
      triggerType,
      triggerEventData,
      parameters,
    });
  }

  /**
   * GET /projects/:projectId/executions
   * List recent executions for a project
   */
  @Get(':projectId/executions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List project executions',
    description: 'Get recent execution records for active version',
  })
  @ApiHeader({ name: 'X-User-ID', required: true })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'limit', type: 'number', required: false, description: 'Max records (default 20)' })
  @ApiResponse({
    status: 200,
    description: 'Execution records',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string' },
          startedAt: { type: 'string', format: 'date-time' },
          completedAt: { type: 'string', format: 'date-time' },
          durationMs: { type: 'number' },
        },
      },
    },
  })
  async listExecutions(
    @Headers('X-User-ID') userId: string,
    @Param('projectId') projectId: string,
    @Query('limit') limit?: number,
  ): Promise<any> {
    if (!userId) {
      throw new BadRequestException('X-User-ID header required');
    }

    // Get active version
    const project = await this.projectService.getProject(userId, projectId);
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    if (!project.activeVersionId) {
      return [];
    }

    return this.executionService.listExecutions(
      project.activeVersionId,
      limit || 20,
    );
  }

  /**
   * GET /projects/:projectId/executions/:executionId
   * Get execution details
   */
  @Get(':projectId/executions/:executionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get execution details',
    description: 'Retrieve full execution record with step traces',
  })
  @ApiHeader({ name: 'X-User-ID', required: true })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'executionId', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Execution record',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string' },
        output: { type: 'object' },
        errorMessage: { type: 'string' },
        stepsExecuted: { type: 'array' },
        durationMs: { type: 'number' },
        startedAt: { type: 'string', format: 'date-time' },
        completedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  async getExecution(
    @Headers('X-User-ID') userId: string,
    @Param('projectId') projectId: string,
    @Param('executionId') executionId: string,
  ): Promise<any> {
    if (!userId) {
      throw new BadRequestException('X-User-ID header required');
    }

    const execution = await this.executionService.getExecutionRecord(executionId, userId);
    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    return execution;
  }
}
