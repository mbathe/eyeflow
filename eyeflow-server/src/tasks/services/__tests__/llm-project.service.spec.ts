/**
 * Unit Tests for LLMProjectService
 * 
 * Tests for:
 * - Project CRUD operations
 * - Strict versioning rules
 * - Version lifecycle (draft → valid → active → archived)
 * - Execution memory state management
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';

import { LLMProjectService } from '../llm-project.service';
import { LLMProjectEntity } from '../../entities/llm-project.entity';
import { ProjectVersionEntity } from '../../entities/project-version.entity';
import { ExecutionMemoryStateEntity } from '../../entities/execution-memory-state.entity';
import { ExecutionRecordEntity } from '../../entities/execution-record.entity';
import { ProjectStatus, ProjectVersionStatus, ExecutionStatus } from '../../types/project.types';

describe('LLMProjectService', () => {
  let service: LLMProjectService;
  let projectRepository: Repository<LLMProjectEntity>;
  let versionRepository: Repository<ProjectVersionEntity>;
  let memoryStateRepository: Repository<ExecutionMemoryStateEntity>;
  let executionRecordRepository: Repository<ExecutionRecordEntity>;

  const mockProjectRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockVersionRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockMemoryStateRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockExecutionRecordRepository = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMProjectService,
        {
          provide: getRepositoryToken(LLMProjectEntity),
          useValue: mockProjectRepository,
        },
        {
          provide: getRepositoryToken(ProjectVersionEntity),
          useValue: mockVersionRepository,
        },
        {
          provide: getRepositoryToken(ExecutionMemoryStateEntity),
          useValue: mockMemoryStateRepository,
        },
        {
          provide: getRepositoryToken(ExecutionRecordEntity),
          useValue: mockExecutionRecordRepository,
        },
      ],
    }).compile();

    service = module.get<LLMProjectService>(LLMProjectService);
    projectRepository = module.get<Repository<LLMProjectEntity>>(getRepositoryToken(LLMProjectEntity));
    versionRepository = module.get<Repository<ProjectVersionEntity>>(getRepositoryToken(ProjectVersionEntity));
    memoryStateRepository = module.get<Repository<ExecutionMemoryStateEntity>>(getRepositoryToken(ExecutionMemoryStateEntity));
    executionRecordRepository = module.get<Repository<ExecutionRecordEntity>>(getRepositoryToken(ExecutionRecordEntity));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Project CRUD', () => {
    it('should create a new project with v1 version', async () => {
      const userId = 'user-123';
      const dto = {
        name: 'Test Project',
        description: 'A test project',
        allowedConnectorIds: ['connector-1', 'connector-2'],
        allowedFunctionIds: ['func-1'],
        allowedTriggerTypes: ['ON_EVENT'],
        allowedNodeIds: ['node-1'],
      };

      mockProjectRepository.save.mockResolvedValue({
        id: 'proj-123',
        userId,
        name: dto.name,
        status: ProjectStatus.DRAFT,
        currentVersion: 1,
        totalVersions: 1,
        activeVersionId: null,
      });

      mockVersionRepository.save.mockResolvedValue({
        id: 'ver-123',
        projectId: 'proj-123',
        version: 1,
        status: ProjectVersionStatus.DRAFT,
      });

      const result = await service.createProject(userId, dto);

      expect(result.name).toEqual(dto.name);
      expect(projectRepository.save).toHaveBeenCalled();
      expect(versionRepository.save).toHaveBeenCalled();
    });

    it('should get project by ID', async () => {
      const userId = 'user-123';
      const projectId = 'proj-123';
      const mockProject = {
        id: projectId,
        userId,
        name: 'Test Project',
        status: ProjectStatus.ACTIVE,
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);

      const result = await service.getProject(userId, projectId);

      expect(result.id).toEqual(projectId);
      expect(projectRepository.findOne).toHaveBeenCalledWith({
        where: { id: projectId, userId },
      });
    });

    it('should throw NotFoundException when project not found', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getProject('user-123', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update project fields', async () => {
      const userId = 'user-123';
      const projectId = 'proj-123';
      const updateDto = { name: 'Updated Project' };

      const mockProject = {
        id: projectId,
        userId,
        name: 'Old Name',
        status: ProjectStatus.ACTIVE,
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      mockProjectRepository.save.mockResolvedValue({
        ...mockProject,
        name: 'Updated Project',
      });

      const result = await service.updateProject(userId, projectId, updateDto);

      expect(result.name).toEqual('Updated Project');
      expect(projectRepository.save).toHaveBeenCalled();
    });

    it('should archive a project', async () => {
      const userId = 'user-123';
      const projectId = 'proj-123';

      const mockProject = {
        id: projectId,
        userId,
        name: 'Test Project',
        status: ProjectStatus.ACTIVE,
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      mockProjectRepository.save.mockResolvedValue({
        ...mockProject,
        status: ProjectStatus.ARCHIVED,
        archivedAt: expect.any(Date),
      });

      const result = await service.archiveProject(userId, projectId);

      expect(result.status).toEqual(ProjectStatus.ARCHIVED);
      expect(projectRepository.save).toHaveBeenCalled();
    });
  });

  describe('Strict Versioning Rules', () => {
    it('should create a new version from active version', async () => {
      const userId = 'user-123';
      const projectId = 'proj-123';
      const dto = {
        dagDefinition: { nodes: [] },
        changeReason: 'Updated conditions',
      };

      const mockProject = {
        id: projectId,
        userId,
        name: 'Test Project',
        status: ProjectStatus.ACTIVE,
        currentVersion: 1,
        activeVersionId: 'ver-1',
      };

      const mockParentVersion = {
        id: 'ver-1',
        version: 1,
        status: ProjectVersionStatus.ACTIVE,
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      mockExecutionRecordRepository.find.mockResolvedValue([]);
      mockVersionRepository.findOne.mockResolvedValue(mockParentVersion);
      mockVersionRepository.save.mockResolvedValue({
        id: 'ver-2',
        projectId,
        version: 2,
        parentVersion: 1,
        status: ProjectVersionStatus.DRAFT,
      });

      const result = await service.createVersion(userId, projectId, dto);

      expect(result.version).toEqual(2);
      expect(result.status).toEqual(ProjectVersionStatus.DRAFT);
      expect(result.parentVersion).toEqual(1);
    });

    it('should prevent version creation during active execution', async () => {
      const userId = 'user-123';
      const projectId = 'proj-123';

      const mockProject = {
        id: projectId,
        userId,
        currentVersion: 1,
        activeVersionId: 'ver-1',
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      mockExecutionRecordRepository.find.mockResolvedValue([
        { id: 'exec-1', status: ExecutionStatus.RUNNING },
      ]);

      await expect(
        service.createVersion(userId, projectId, {
          dagDefinition: { nodes: [] },
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should validate version (draft → valid)', async () => {
      const userId = 'user-123';
      const projectId = 'proj-123';
      const versionId = 'ver-2';

      const mockProject = { id: projectId, userId };
      const mockVersion = {
        id: versionId,
        projectId,
        status: ProjectVersionStatus.DRAFT,
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      mockVersionRepository.findOne.mockResolvedValue(mockVersion);
      mockVersionRepository.save.mockResolvedValue({
        ...mockVersion,
        status: ProjectVersionStatus.VALID,
        validatedBy: userId,
        validatedAt: expect.any(Date),
      });

      const result = await service.validateVersion(userId, projectId, versionId);

      expect(result.status).toEqual(ProjectVersionStatus.VALID);
      expect(result.validatedBy).toEqual(userId);
    });

    it('should prevent validation of non-draft version', async () => {
      const userId = 'user-123';
      const projectId = 'proj-123';
      const versionId = 'ver-1';

      const mockProject = { id: projectId, userId };
      const mockVersion = {
        id: versionId,
        status: ProjectVersionStatus.ACTIVE, // Already active
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      mockVersionRepository.findOne.mockResolvedValue(mockVersion);

      await expect(
        service.validateVersion(userId, projectId, versionId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should activate a valid version', async () => {
      const userId = 'user-123';
      const projectId = 'proj-123';
      const newVersionId = 'ver-2';
      const oldVersionId = 'ver-1';

      const mockProject = {
        id: projectId,
        userId,
        activeVersionId: oldVersionId,
        currentVersion: 1,
      };

      const mockNewVersion = {
        id: newVersionId,
        projectId,
        version: 2,
        status: ProjectVersionStatus.VALID,
      };

      const mockOldVersion = {
        id: oldVersionId,
        status: ProjectVersionStatus.ACTIVE,
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      mockVersionRepository.findOne.mockResolvedValueOnce(mockNewVersion);
      mockVersionRepository.findOne.mockResolvedValueOnce(mockOldVersion);
      mockVersionRepository.save.mockResolvedValue({
        ...mockNewVersion,
        status: ProjectVersionStatus.ACTIVE,
      });

      const result = await service.activateVersion(userId, projectId, newVersionId);

      expect(result.status).toEqual(ProjectVersionStatus.ACTIVE);
      // Verify old version was archived
      expect(versionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ProjectVersionStatus.ARCHIVED,
        }),
      );
    });

    it('should prevent activation of draft version', async () => {
      const userId = 'user-123';
      const projectId = 'proj-123';
      const versionId = 'ver-2';

      const mockProject = { id: projectId, userId };
      const mockVersion = {
        id: versionId,
        status: ProjectVersionStatus.DRAFT, // Still draft
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      mockVersionRepository.findOne.mockResolvedValue(mockVersion);

      await expect(
        service.activateVersion(userId, projectId, versionId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent activation of archived version', async () => {
      const userId = 'user-123';
      const projectId = 'proj-123';
      const versionId = 'ver-1';

      const mockProject = { id: projectId, userId };
      const mockVersion = {
        id: versionId,
        status: ProjectVersionStatus.ARCHIVED,
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      mockVersionRepository.findOne.mockResolvedValue(mockVersion);

      await expect(
        service.activateVersion(userId, projectId, versionId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should archive a version (prevent new executions)', async () => {
      const userId = 'user-123';
      const projectId = 'proj-123';
      const versionId = 'ver-2';
      const activeVersionId = 'ver-3';

      const mockProject = {
        id: projectId,
        userId,
        activeVersionId,
      };

      const mockVersion = {
        id: versionId,
        status: ProjectVersionStatus.VALID,
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      mockVersionRepository.findOne.mockResolvedValue(mockVersion);
      mockVersionRepository.save.mockResolvedValue({
        ...mockVersion,
        status: ProjectVersionStatus.ARCHIVED,
        archivedAt: expect.any(Date),
      });

      const result = await service.archiveVersion(userId, projectId, versionId);

      expect(result.status).toEqual(ProjectVersionStatus.ARCHIVED);
    });

    it('should prevent archiving of active version', async () => {
      const userId = 'user-123';
      const projectId = 'proj-123';
      const versionId = 'ver-1';

      const mockProject = {
        id: projectId,
        userId,
        activeVersionId: versionId, // Is active
      };

      const mockVersion = {
        id: versionId,
        status: ProjectVersionStatus.ACTIVE,
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      mockVersionRepository.findOne.mockResolvedValue(mockVersion);

      await expect(
        service.archiveVersion(userId, projectId, versionId),
      ).rejects.toThrow(ConflictException);
    });

    it('should track version lineage (parentVersion)', async () => {
      const userId = 'user-123';
      const projectId = 'proj-123';

      // Version 1
      const mockProject = {
        id: projectId,
        userId,
        currentVersion: 1,
        activeVersionId: 'ver-1',
      };

      const mockV1 = {
        id: 'ver-1',
        version: 1,
        status: ProjectVersionStatus.ACTIVE,
      };

      const mockV2 = {
        id: 'ver-2',
        version: 2,
        parentVersion: 1, // Links to parent
        status: ProjectVersionStatus.DRAFT,
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      mockExecutionRecordRepository.find.mockResolvedValue([]);
      mockVersionRepository.findOne.mockResolvedValue(mockV1);
      mockVersionRepository.save.mockResolvedValue(mockV2);

      const result = await service.createVersion(userId, projectId, {
        dagDefinition: { nodes: [] },
      });

      expect(result.parentVersion).toEqual(1);
      expect(result.version).toEqual(2);
    });
  });

  describe('Execution Memory State', () => {
    it('should create new memory state if not exists', async () => {
      const versionId = 'ver-1';
      const executionId = 'exec-1';
      const nodeId = 'node-1';

      mockMemoryStateRepository.findOne.mockResolvedValue(null);
      mockMemoryStateRepository.save.mockResolvedValue({
        id: 'mem-1',
        projectVersionId: versionId,
        executionId,
        nodeId,
        triggerCount: 0,
        consecutiveMatches: 0,
        consecutiveErrors: 0,
      });

      const result = await service.getOrCreateExecutionState(versionId, executionId, nodeId);

      expect(result.triggerCount).toEqual(0);
      expect(result.consecutiveMatches).toEqual(0);
      expect(memoryStateRepository.save).toHaveBeenCalled();
    });

    it('should return existing memory state if present', async () => {
      const versionId = 'ver-1';
      const executionId = 'exec-1';
      const nodeId = 'node-1';

      const mockMemoryState = {
        id: 'mem-1',
        projectVersionId: versionId,
        executionId,
        nodeId,
        triggerCount: 5,
        consecutiveMatches: 2,
      };

      mockMemoryStateRepository.findOne.mockResolvedValue(mockMemoryState);

      const result = await service.getOrCreateExecutionState(versionId, executionId, nodeId);

      expect(result.triggerCount).toEqual(5);
      expect(result.consecutiveMatches).toEqual(2);
      expect(memoryStateRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('Version Listing', () => {
    it('should list all versions of a project', async () => {
      const userId = 'user-123';
      const projectId = 'proj-123';

      const mockProject = { id: projectId, userId };
      const mockVersions = [
        { version: 2, status: ProjectVersionStatus.ACTIVE },
        { version: 1, status: ProjectVersionStatus.ARCHIVED },
      ];

      mockProjectRepository.findOne.mockResolvedValue(mockProject);

      const mockQueryBuilder = {
        where: jest.fn().returnThis(),
        andWhere: jest.fn().returnThis(),
        orderBy: jest.fn().returnThis(),
        getMany: jest.fn().resolvedValue(mockVersions),
      };

      mockVersionRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.listVersions(userId, projectId);

      expect(result.length).toEqual(2);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('v.version', 'DESC');
    });

    it('should filter versions by status', async () => {
      const userId = 'user-123';
      const projectId = 'proj-123';

      const mockProject = { id: projectId, userId };
      const mockVersions = [
        { version: 2, status: ProjectVersionStatus.ACTIVE },
      ];

      mockProjectRepository.findOne.mockResolvedValue(mockProject);

      const mockQueryBuilder = {
        where: jest.fn().returnThis(),
        andWhere: jest.fn().returnThis(),
        orderBy: jest.fn().returnThis(),
        getMany: jest.fn().resolvedValue(mockVersions),
      };

      mockVersionRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.listVersions(userId, projectId, {
        status: ProjectVersionStatus.ACTIVE,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('v.status = :status', {
        status: ProjectVersionStatus.ACTIVE,
      });
    });
  });
});
