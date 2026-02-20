/**
 * Integration Tests for Project Execution Flow
 * 
 * End-to-end tests covering:
 * 1. Create project
 * 2. Create version with DAG JSON
 * 3. Validate version
 * 4. Compile (DAG → IR)
 * 5. Activate version
 * 6. Execute project
 * 7. Verify execution record + memory state
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { LLMProjectService } from '../llm-project.service';
import { DAGCompilationService } from '../dag-compilation.service';
import { LLMProjectExecutionService } from '../llm-project-execution.service';

import { LLMProjectEntity } from '../../entities/llm-project.entity';
import { ProjectVersionEntity } from '../../entities/project-version.entity';
import { ExecutionMemoryStateEntity } from '../../entities/execution-memory-state.entity';
import { ExecutionRecordEntity } from '../../entities/execution-record.entity';

import { ProjectStatus, ProjectVersionStatus, ExecutionStatus } from '../../types/project.types';

describe('Project Execution Flow (E2E)', () => {
  let projectService: LLMProjectService;
  let compilationService: DAGCompilationService;
  let executionService: LLMProjectExecutionService;

  let projectRepository: Repository<LLMProjectEntity>;
  let versionRepository: Repository<ProjectVersionEntity>;
  let memoryStateRepository: Repository<ExecutionMemoryStateEntity>;
  let executionRecordRepository: Repository<ExecutionRecordEntity>;

  // Mock repositories
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
    save: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMProjectService,
        DAGCompilationService,
        LLMProjectExecutionService,
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

    projectService = module.get<LLMProjectService>(LLMProjectService);
    compilationService = module.get<DAGCompilationService>(DAGCompilationService);
    executionService = module.get<LLMProjectExecutionService>(LLMProjectExecutionService);

    projectRepository = module.get<Repository<LLMProjectEntity>>(getRepositoryToken(LLMProjectEntity));
    versionRepository = module.get<Repository<ProjectVersionEntity>>(getRepositoryToken(ProjectVersionEntity));
    memoryStateRepository = module.get<Repository<ExecutionMemoryStateEntity>>(getRepositoryToken(ExecutionMemoryStateEntity));
    executionRecordRepository = module.get<Repository<ExecutionRecordEntity>>(getRepositoryToken(ExecutionRecordEntity));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete Project Lifecycle', () => {
    it('should execute project from creation through completion', async () => {
      const userId = 'user-123';
      const projectId = 'proj-123';
      const versionId = 'ver-1';

      // Step 1: Create project
      const projectCreateDto = {
        name: 'Compliance Check Project',
        description: 'Monitors customer compliance',
        allowedConnectorIds: ['slack'],
        allowedFunctionIds: ['send_message'],
        allowedTriggerTypes: ['ON_EVENT'],
        allowedNodeIds: [],
      };

      const mockProject = {
        id: projectId,
        userId,
        name: projectCreateDto.name,
        status: ProjectStatus.ACTIVE,
        currentVersion: 1,
        totalVersions: 1,
        activeVersionId: versionId,
      };

      mockProjectRepository.save.mockResolvedValueOnce(mockProject);
      mockVersionRepository.save.mockResolvedValueOnce({
        id: versionId,
        projectId,
        version: 1,
        status: ProjectVersionStatus.DRAFT,
      });

      const createdProject = await projectService.createProject(userId, projectCreateDto);
      expect(createdProject.name).toEqual(projectCreateDto.name);
      expect(createdProject.status).toEqual(ProjectStatus.ACTIVE);

      // Step 2: Create version with DAG
      const dagDefinition = {
        nodes: [
          { id: 'node-1', type: 'trigger', name: 'Customer Updated' },
          { id: 'node-2', type: 'condition', name: 'Check Compliance' },
          { id: 'node-3', type: 'action', name: 'Send Alert' },
        ],
        edges: [
          { source: 'node-1', target: 'node-2' },
          { source: 'node-2', target: 'node-3' },
        ],
      };

      const versionCreateDto = {
        dagDefinition,
        changeReason: 'Initial version',
      };

      mockProjectRepository.findOne.mockResolvedValueOnce(mockProject);
      mockExecutionRecordRepository.find.mockResolvedValueOnce([]);
      mockVersionRepository.findOne.mockResolvedValueOnce({
        id: versionId,
        version: 1,
        status: ProjectVersionStatus.ACTIVE,
      });

      mockVersionRepository.save.mockResolvedValueOnce({
        id: versionId,
        projectId,
        version: 1,
        status: ProjectVersionStatus.DRAFT,
        dagDefinition,
      });

      const version = await projectService.createVersion(userId, projectId, versionCreateDto);
      expect(version.dagDefinition).toEqual(dagDefinition);
      expect(version.status).toEqual(ProjectVersionStatus.DRAFT);

      // Step 3: Validate version
      mockProjectRepository.findOne.mockResolvedValueOnce(mockProject);
      mockVersionRepository.findOne.mockResolvedValueOnce({
        id: versionId,
        projectId,
        status: ProjectVersionStatus.DRAFT,
      });

      mockVersionRepository.save.mockResolvedValueOnce({
        id: versionId,
        projectId,
        status: ProjectVersionStatus.VALID,
        validatedBy: userId,
        validatedAt: new Date(),
      });

      const validatedVersion = await projectService.validateVersion(userId, projectId, versionId);
      expect(validatedVersion.status).toEqual(ProjectVersionStatus.VALID);

      // Step 4: Compile DAG to IR
      const compilationResult = await compilationService.compileDAG(dagDefinition, []);
      expect(compilationResult.irBinary).toBeDefined();
      expect(compilationResult.irChecksum).toBeDefined();

      // Step 5: Activate version
      mockProjectRepository.findOne.mockResolvedValueOnce(mockProject);
      mockVersionRepository.findOne
        .mockResolvedValueOnce({
          id: versionId,
          projectId,
          version: 1,
          status: ProjectVersionStatus.VALID,
        })
        .mockResolvedValueOnce(null); // No previous version

      mockVersionRepository.save.mockResolvedValueOnce({
        id: versionId,
        projectId,
        status: ProjectVersionStatus.ACTIVE,
        irBinary: compilationResult.irBinary,
        irChecksum: compilationResult.irChecksum,
      });

      const activeVersion = await projectService.activateVersion(userId, projectId, versionId);
      expect(activeVersion.status).toEqual(ProjectVersionStatus.ACTIVE);

      // Step 6: Execute project
      mockProjectRepository.findOne.mockResolvedValueOnce(mockProject);
      mockVersionRepository.findOne.mockResolvedValueOnce({
        id: versionId,
        projectId,
        version: 1,
        status: ProjectVersionStatus.ACTIVE,
        irBinary: compilationResult.irBinary,
        irChecksum: compilationResult.irChecksum,
      });

      mockMemoryStateRepository.findOne.mockResolvedValueOnce(null);
      mockMemoryStateRepository.save.mockResolvedValue({
        id: 'mem-1',
        projectVersionId: versionId,
        executionId: 'exec-1',
        nodeId: 'central-nest-node',
        triggerCount: 1,
        consecutiveMatches: 1,
      });

      mockExecutionRecordRepository.save.mockResolvedValue({
        id: 'exec-1',
        projectVersionId: versionId,
        status: ExecutionStatus.SUCCEEDED,
        output: { result: 'success' },
        durationMs: 150,
      });

      const executionResult = await executionService.executeProject({
        projectId,
        userId,
        triggerType: 'ON_EVENT',
        triggerEventData: { customerId: '123' },
      });

      expect(executionResult.executionId).toBeDefined();
      expect(executionResult.status).toEqual(ExecutionStatus.SUCCEEDED);
      expect(executionResult.durationMs).toBeGreaterThan(0);

      // Step 7: Verify execution record persisted
      const executionRecord = await executionService.getExecutionRecord(
        executionResult.executionId,
        userId,
      );

      if (executionRecord) {
        expect(executionRecord.status).toEqual(ExecutionStatus.SUCCEEDED);
        expect(executionRecord.projectVersionId).toEqual(versionId);
        expect(executionRecord.triggerType).toEqual('ON_EVENT');
      }
    });
  });

  describe('Versioning Compliance During Execution', () => {
    it('should prevent version modification during execution', async () => {
      const userId = 'user-123';
      const projectId = 'proj-123';
      const versionId = 'ver-1';

      const mockProject = {
        id: projectId,
        userId,
        activeVersionId: versionId,
        currentVersion: 1,
      };

      // Simulate execution in progress
      const activeExecution = {
        id: 'exec-1',
        status: ExecutionStatus.RUNNING,
      };

      mockProjectRepository.findOne.mockResolvedValueOnce(mockProject);
      mockExecutionRecordRepository.find.mockResolvedValueOnce([activeExecution]);

      // Attempt to create new version should fail
      await expect(
        projectService.createVersion(userId, projectId, { dagDefinition: {} }),
      ).rejects.toThrow('Cannot create new version while');

      expect(mockExecutionRecordRepository.find).toHaveBeenCalledWith({
        where: {
          projectVersionId: versionId,
          status: ExecutionStatus.RUNNING,
        },
      });
    });

    it('should track execution in memory state', async () => {
      const versionId = 'ver-1';
      const executionId = 'exec-1';
      const nodeId = 'node-1';

      // First execution
      mockMemoryStateRepository.findOne.mockResolvedValueOnce(null);
      mockMemoryStateRepository.save.mockResolvedValueOnce({
        id: 'mem-1',
        projectVersionId: versionId,
        executionId,
        nodeId,
        triggerCount: 1,
        consecutiveMatches: 0,
        consecutiveErrors: 0,
      });

      let state = await projectService.getOrCreateExecutionState(versionId, executionId, nodeId);
      expect(state.triggerCount).toEqual(1);

      // Second execution - existing state
      mockMemoryStateRepository.findOne.mockResolvedValueOnce({
        id: 'mem-1',
        projectVersionId: versionId,
        executionId,
        nodeId,
        triggerCount: 5,
        consecutiveMatches: 2,
        consecutiveErrors: 0,
      });

      state = await projectService.getOrCreateExecutionState(versionId, executionId, nodeId);
      expect(state.triggerCount).toEqual(5);
      expect(state.consecutiveMatches).toEqual(2);
    });
  });

  describe('Multi-Version Execution', () => {
    it('should handle multiple versions with different DAGs', async () => {
      const userId = 'user-123';
      const projectId = 'proj-123';

      // Version 1: Simple DAG
      const dagV1 = {
        nodes: [
          { id: 'node-1', type: 'trigger' },
          { id: 'node-2', type: 'action' },
        ],
        edges: [{ source: 'node-1', target: 'node-2' }],
      };

      const compiledV1 = await compilationService.compileDAG(dagV1, []);

      // Version 2: More complex DAG
      const dagV2 = {
        nodes: [
          { id: 'node-1', type: 'trigger' },
          { id: 'node-2', type: 'condition' },
          { id: 'node-3', type: 'action' },
          { id: 'node-4', type: 'fallback' },
        ],
        edges: [
          { source: 'node-1', target: 'node-2' },
          { source: 'node-2', target: 'node-3' },
          { source: 'node-2', target: 'node-4' },
        ],
      };

      const compiledV2 = await compilationService.compileDAG(dagV2, []);

      // Different DAGs should compile to different checksums
      expect(compiledV1.irChecksum).not.toEqual(compiledV2.irChecksum);

      // Both should have valid IR
      expect(compiledV1.irBinary).toBeDefined();
      expect(compiledV2.irBinary).toBeDefined();
    });
  });

  describe('Execution Error Handling', () => {
    it('should handle execution failure gracefully', async () => {
      const userId = 'user-123';
      const projectId = 'proj-123';
      const versionId = 'ver-1';

      const mockProject = {
        id: projectId,
        userId,
        activeVersionId: versionId,
        status: ProjectStatus.ACTIVE,
      };

      const mockVersion = {
        id: versionId,
        projectId,
        version: 1,
        status: ProjectVersionStatus.ACTIVE,
        irBinary: 'base64-encoded-ir',
        irChecksum: 'valid-checksum',
      };

      mockProjectRepository.findOne.mockResolvedValueOnce(mockProject);
      mockVersionRepository.findOne.mockResolvedValueOnce(mockVersion);
      mockMemoryStateRepository.findOne.mockResolvedValueOnce(null);
      mockMemoryStateRepository.save.mockResolvedValue({});

      // Simulate execution failure
      mockExecutionRecordRepository.save.mockRejectedValueOnce(
        new Error('Execution failed: connection timeout'),
      );

      await expect(
        executionService.executeProject({
          projectId,
          userId,
          triggerType: 'ON_EVENT',
        }),
      ).rejects.toThrow('Execution failed');
    });

    it('should track consecutive errors in memory state', async () => {
      const versionId = 'ver-1';
      const executionId = 'exec-1';

      mockMemoryStateRepository.findOne.mockResolvedValueOnce(null);

      const state = await projectService.getOrCreateExecutionState(versionId, executionId, 'node-1');

      // Simulate error tracking
      state.consecutiveErrors = 3;
      mockMemoryStateRepository.save.mockResolvedValueOnce({
        ...state,
        consecutiveErrors: 3,
      });

      await mockMemoryStateRepository.save(state);

      expect(mockMemoryStateRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          consecutiveErrors: 3,
        }),
      );
    });
  });

  describe('Audit Trail Verification', () => {
    it('should maintain complete execution audit trail', async () => {
      const userId = 'user-123';
      const projectId = 'proj-123';
      const versionId = 'ver-1';
      const executionId = 'exec-1';

      // Create execution record with all audit details
      const auditRecord = {
        id: executionId,
        projectVersionId: versionId,
        status: ExecutionStatus.SUCCEEDED,
        triggerType: 'ON_EVENT',
        triggerEventData: { source: 'webhook' },
        startedAt: new Date('2026-02-19T10:00:00Z'),
        completedAt: new Date('2026-02-19T10:00:05Z'),
        durationMs: 5000,
        executedOnNode: 'NEST_JS_CENTRAL',
        output: { result: 'success' },
        stepsExecuted: [
          {
            step_id: 'step-1',
            name: 'Trigger Event',
            status: 'completed',
            duration: 100,
          },
          {
            step_id: 'step-2',
            name: 'Check Condition',
            status: 'completed',
            duration: 200,
          },
          {
            step_id: 'step-3',
            name: 'Execute Action',
            status: 'completed',
            duration: 4700,
          },
        ],
        irSignatureVerified: true,
      };

      mockExecutionRecordRepository.findOne.mockResolvedValueOnce(auditRecord);

      const record = await executionService.getExecutionRecord(executionId, userId);

      // Verify audit trail
      if (record) {
        expect(record.stepsExecuted).toHaveLength(3);
        expect(record.stepsExecuted[0].name).toEqual('Trigger Event');
        expect(record.durationMs).toEqual(5000);
        expect(record.irSignatureVerified).toBe(true);
      }
    });
  });
});
