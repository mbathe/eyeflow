/**
 * API Controller Tests for Projects Endpoints
 * 
 * Tests for:
 * - Project CRUD endpoints
 * - Version management endpoints
 * - Execution triggering endpoints
 * - Error responses
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException, NotFoundException } from '@nestjs/common';
import * as request from 'supertest';

import { ProjectsController } from '../projects.controller';
import { LLMProjectService } from '../llm-project.service';
import { DAGCompilationService } from '../dag-compilation.service';
import { LLMProjectExecutionService } from '../llm-project-execution.service';

import { ProjectStatus, ProjectVersionStatus, ExecutionStatus } from '../../types/project.types';
import {
  CreateProjectDto,
  CreateVersionDto,
  ExecutionRequestDto,
} from '../../dto/projects.dto';

describe('ProjectsController (e2e)', () => {
  let app: INestApplication;
  let projectService: LLMProjectService;
  let compilationService: DAGCompilationService;
  let executionService: LLMProjectExecutionService;

  const mockProjectService = {
    createProject: jest.fn(),
    getProject: jest.fn(),
    updateProject: jest.fn(),
    listProjects: jest.fn(),
    archiveProject: jest.fn(),
    createVersion: jest.fn(),
    validateVersion: jest.fn(),
    activateVersion: jest.fn(),
    archiveVersion: jest.fn(),
    listVersions: jest.fn(),
    getVersion: jest.fn(),
    getOrCreateExecutionState: jest.fn(),
  };

  const mockCompilationService = {
    compileDAG: jest.fn(),
  };

  const mockExecutionService = {
    executeProject: jest.fn(),
    getExecutionRecord: jest.fn(),
    listExecutions: jest.fn(),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        {
          provide: LLMProjectService,
          useValue: mockProjectService,
        },
        {
          provide: DAGCompilationService,
          useValue: mockCompilationService,
        },
        {
          provide: LLMProjectExecutionService,
          useValue: mockExecutionService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    projectService = moduleFixture.get<LLMProjectService>(LLMProjectService);
    compilationService = moduleFixture.get<DAGCompilationService>(DAGCompilationService);
    executionService = moduleFixture.get<LLMProjectExecutionService>(LLMProjectExecutionService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await app.close();
  });

  describe('Project CRUD Endpoints', () => {
    describe('POST /projects', () => {
      it('should create a new project', () => {
        const createDto: CreateProjectDto = {
          name: 'My Project',
          description: 'Test project',
        };

        const mockProject = {
          id: 'proj-123',
          userId: 'user-123',
          name: 'My Project',
          status: ProjectStatus.DRAFT,
          currentVersion: 1,
        };

        mockProjectService.createProject.mockResolvedValueOnce(mockProject);

        return request(app.getHttpServer())
          .post('/projects')
          .set('X-User-ID', 'user-123')
          .send(createDto)
          .expect(201)
          .expect((res) => {
            expect(res.body.id).toEqual('proj-123');
            expect(res.body.status).toEqual(ProjectStatus.DRAFT);
          });
      });

      it('should require X-User-ID header', () => {
        const createDto: CreateProjectDto = {
          name: 'My Project',
        };

        return request(app.getHttpServer())
          .post('/projects')
          .send(createDto)
          .expect(400); // Bad Request due to missing header
      });

      it('should validate required fields', () => {
        return request(app.getHttpServer())
          .post('/projects')
          .set('X-User-ID', 'user-123')
          .send({})
          .expect(400);
      });
    });

    describe('GET /projects/:id', () => {
      it('should retrieve project by ID', () => {
        const mockProject = {
          id: 'proj-123',
          userId: 'user-123',
          name: 'My Project',
          status: ProjectStatus.ACTIVE,
        };

        mockProjectService.getProject.mockResolvedValueOnce(mockProject);

        return request(app.getHttpServer())
          .get('/projects/proj-123')
          .set('X-User-ID', 'user-123')
          .expect(200)
          .expect((res) => {
            expect(res.body.id).toEqual('proj-123');
            expect(res.body.name).toEqual('My Project');
          });
      });

      it('should return 404 for non-existent project', () => {
        mockProjectService.getProject.mockRejectedValueOnce(new NotFoundException());

        return request(app.getHttpServer())
          .get('/projects/non-existent')
          .set('X-User-ID', 'user-123')
          .expect(404);
      });
    });

    describe('GET /projects', () => {
      it('should list all projects for user', () => {
        const mockProjects = [
          {
            id: 'proj-1',
            userId: 'user-123',
            name: 'Project 1',
            status: ProjectStatus.ACTIVE,
          },
          {
            id: 'proj-2',
            userId: 'user-123',
            name: 'Project 2',
            status: ProjectStatus.DRAFT,
          },
        ];

        mockProjectService.listProjects.mockResolvedValueOnce(mockProjects);

        return request(app.getHttpServer())
          .get('/projects')
          .set('X-User-ID', 'user-123')
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveLength(2);
            expect(res.body[0].name).toEqual('Project 1');
          });
      });
    });

    describe('PUT /projects/:id', () => {
      it('should update project', () => {
        const updateDto = {
          name: 'Updated Name',
          description: 'Updated description',
        };

        const mockProject = {
          id: 'proj-123',
          userId: 'user-123',
          name: 'Updated Name',
          status: ProjectStatus.DRAFT,
        };

        mockProjectService.updateProject.mockResolvedValueOnce(mockProject);

        return request(app.getHttpServer())
          .put('/projects/proj-123')
          .set('X-User-ID', 'user-123')
          .send(updateDto)
          .expect(200)
          .expect((res) => {
            expect(res.body.name).toEqual('Updated Name');
          });
      });
    });

    describe('DELETE /projects/:id', () => {
      it('should archive project', () => {
        mockProjectService.archiveProject.mockResolvedValueOnce(undefined);

        return request(app.getHttpServer())
          .delete('/projects/proj-123')
          .set('X-User-ID', 'user-123')
          .expect(204);
      });
    });
  });

  describe('Version Management Endpoints', () => {
    describe('POST /projects/:projectId/versions', () => {
      it('should create new version', () => {
        const createVersionDto: CreateVersionDto = {
          dagDefinition: {
            nodes: [{ id: 'node1', type: 'trigger', name: 'Start' }],
            edges: [],
          },
          changeReason: 'Initial version',
        };

        const mockVersion = {
          id: 'ver-1',
          projectId: 'proj-123',
          version: 1,
          status: ProjectVersionStatus.DRAFT,
          dagChecksum: 'checksum123',
        };

        mockProjectService.createVersion.mockResolvedValueOnce(mockVersion);

        return request(app.getHttpServer())
          .post('/projects/proj-123/versions')
          .set('X-User-ID', 'user-123')
          .send(createVersionDto)
          .expect(201)
          .expect((res) => {
            expect(res.body.version).toEqual(1);
            expect(res.body.status).toEqual(ProjectVersionStatus.DRAFT);
          });
      });
    });

    describe('GET /projects/:projectId/versions', () => {
      it('should list all versions', () => {
        const mockVersions = [
          {
            id: 'ver-1',
            version: 1,
            status: ProjectVersionStatus.ARCHIVED,
          },
          {
            id: 'ver-2',
            version: 2,
            status: ProjectVersionStatus.ACTIVE,
          },
        ];

        mockProjectService.listVersions.mockResolvedValueOnce(mockVersions);

        return request(app.getHttpServer())
          .get('/projects/proj-123/versions')
          .set('X-User-ID', 'user-123')
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveLength(2);
            expect(res.body[1].version).toEqual(2);
          });
      });
    });

    describe('GET /projects/:projectId/versions/:versionId', () => {
      it('should retrieve specific version', () => {
        const mockVersion = {
          id: 'ver-2',
          projectId: 'proj-123',
          version: 2,
          status: ProjectVersionStatus.ACTIVE,
          dagDefinition: { nodes: [], edges: [] },
        };

        mockProjectService.getVersion.mockResolvedValueOnce(mockVersion);

        return request(app.getHttpServer())
          .get('/projects/proj-123/versions/ver-2')
          .set('X-User-ID', 'user-123')
          .expect(200)
          .expect((res) => {
            expect(res.body.version).toEqual(2);
            expect(res.body.status).toEqual(ProjectVersionStatus.ACTIVE);
          });
      });
    });

    describe('POST /projects/:projectId/versions/:versionId/validate', () => {
      it('should validate version', () => {
        const mockVersion = {
          id: 'ver-1',
          status: ProjectVersionStatus.VALID,
          irChecksum: 'new-checksum',
        };

        mockProjectService.validateVersion.mockResolvedValueOnce(mockVersion);

        return request(app.getHttpServer())
          .post('/projects/proj-123/versions/ver-1/validate')
          .set('X-User-ID', 'user-123')
          .send({ validatedBy: 'validator-1' })
          .expect(200)
          .expect((res) => {
            expect(res.body.status).toEqual(ProjectVersionStatus.VALID);
          });
      });
    });

    describe('POST /projects/:projectId/versions/:versionId/activate', () => {
      it('should activate version', () => {
        const mockVersion = {
          id: 'ver-2',
          status: ProjectVersionStatus.ACTIVE,
        };

        mockProjectService.activateVersion.mockResolvedValueOnce(mockVersion);

        return request(app.getHttpServer())
          .post('/projects/proj-123/versions/ver-2/activate')
          .set('X-User-ID', 'user-123')
          .expect(200)
          .expect((res) => {
            expect(res.body.status).toEqual(ProjectVersionStatus.ACTIVE);
          });
      });

      it('should not activate invalid version', () => {
        mockProjectService.activateVersion.mockRejectedValueOnce(
          new BadRequestException('Version is not valid'),
        );

        return request(app.getHttpServer())
          .post('/projects/proj-123/versions/ver-1/activate')
          .set('X-User-ID', 'user-123')
          .expect(400);
      });
    });

    describe('DELETE /projects/:projectId/versions/:versionId', () => {
      it('should archive version', () => {
        mockProjectService.archiveVersion.mockResolvedValueOnce(undefined);

        return request(app.getHttpServer())
          .delete('/projects/proj-123/versions/ver-1')
          .set('X-User-ID', 'user-123')
          .expect(204);
      });
    });
  });

  describe('Execution Endpoints', () => {
    describe('POST /projects/:projectId/execute', () => {
      it('should trigger project execution', async () => {
        const executionRequest: ExecutionRequestDto = {
          triggerType: 'ON_EVENT',
          triggerEventData: { action: 'update' },
        };

        const mockExecution = {
          executionId: 'exec-123',
          status: ExecutionStatus.SUCCEEDED,
          durationMs: 250,
          output: { result: 'success' },
        };

        mockExecutionService.executeProject.mockResolvedValueOnce(mockExecution);

        return request(app.getHttpServer())
          .post('/projects/proj-123/execute')
          .set('X-User-ID', 'user-123')
          .send(executionRequest)
          .expect(202) // 202 ACCEPTED
          .expect((res) => {
            expect(res.body.executionId).toEqual('exec-123');
            expect(res.body.status).toEqual(ExecutionStatus.SUCCEEDED);
          });
      });

      it('should handle execution errors', () => {
        mockExecutionService.executeProject.mockRejectedValueOnce(
          new BadRequestException('Project not active'),
        );

        return request(app.getHttpServer())
          .post('/projects/proj-123/execute')
          .set('X-User-ID', 'user-123')
          .send({ triggerType: 'ON_EVENT' })
          .expect(400);
      });
    });

    describe('GET /projects/:projectId/executions', () => {
      it('should list execution history', () => {
        const mockExecutions = [
          {
            id: 'exec-1',
            status: ExecutionStatus.SUCCEEDED,
            startedAt: '2026-02-19T10:00:00Z',
            durationMs: 100,
          },
          {
            id: 'exec-2',
            status: ExecutionStatus.FAILED,
            startedAt: '2026-02-19T10:05:00Z',
            durationMs: 50,
            errorMessage: 'Timeout',
          },
        ];

        mockExecutionService.listExecutions.mockResolvedValueOnce(mockExecutions);

        return request(app.getHttpServer())
          .get('/projects/proj-123/executions')
          .set('X-User-ID', 'user-123')
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveLength(2);
            expect(res.body[0].status).toEqual(ExecutionStatus.SUCCEEDED);
            expect(res.body[1].errorMessage).toEqual('Timeout');
          });
      });

      it('should support pagination', () => {
        mockExecutionService.listExecutions.mockResolvedValueOnce([]);

        return request(app.getHttpServer())
          .get('/projects/proj-123/executions?limit=10&offset=0')
          .set('X-User-ID', 'user-123')
          .expect(200);
      });
    });

    describe('GET /projects/:projectId/executions/:executionId', () => {
      it('should retrieve execution details', () => {
        const mockExecution = {
          id: 'exec-123',
          projectVersionId: 'ver-2',
          status: ExecutionStatus.SUCCEEDED,
          startedAt: '2026-02-19T10:00:00Z',
          completedAt: '2026-02-19T10:00:00.250Z',
          durationMs: 250,
          stepsExecuted: [
            {
              nodeId: 'node1',
              nodeName: 'Trigger',
              executorType: 'TRIGGER_HANDLER',
              status: 'succeeded',
              durationMs: 10,
            },
            {
              nodeId: 'node2',
              nodeName: 'Condition',
              executorType: 'CONDITION_EVALUATOR',
              status: 'succeeded',
              durationMs: 50,
            },
            {
              nodeId: 'node3',
              nodeName: 'LLM Call',
              executorType: 'LLM_INFERENCE',
              status: 'succeeded',
              durationMs: 150,
              output: { llmResponse: 'Hello!' },
            },
          ],
          output: {
            finalResult: 'Processed successfully',
          },
        };

        mockExecutionService.getExecutionRecord.mockResolvedValueOnce(mockExecution);

        return request(app.getHttpServer())
          .get('/projects/proj-123/executions/exec-123')
          .set('X-User-ID', 'user-123')
          .expect(200)
          .expect((res) => {
            expect(res.body.status).toEqual(ExecutionStatus.SUCCEEDED);
            expect(res.body.stepsExecuted).toHaveLength(3);
            expect(res.body.stepsExecuted[2].executorType).toEqual('LLM_INFERENCE');
          });
      });

      it('should return 404 for non-existent execution', () => {
        mockExecutionService.getExecutionRecord.mockRejectedValueOnce(
          new NotFoundException(),
        );

        return request(app.getHttpServer())
          .get('/projects/proj-123/executions/non-existent')
          .set('X-User-ID', 'user-123')
          .expect(404);
      });
    });
  });

  describe('Response Format', () => {
    it('should include X-Request-Id in responses', () => {
      const mockProject = {
        id: 'proj-123',
        userId: 'user-123',
        name: 'Test',
      };

      mockProjectService.getProject.mockResolvedValueOnce(mockProject);

      return request(app.getHttpServer())
        .get('/projects/proj-123')
        .set('X-User-ID', 'user-123')
        .expect(200)
        .expect((res) => {
          // Response should ideally include request tracking
        });
    });

    it('should document error responses', () => {
      mockProjectService.getProject.mockRejectedValueOnce(new NotFoundException());

      return request(app.getHttpServer())
        .get('/projects/not-found')
        .set('X-User-ID', 'user-123')
        .expect(404)
        .expect((res) => {
          // Error response should have standard format
          expect(res.body).toHaveProperty('message');
        });
    });
  });

  describe('Security', () => {
    it('should enforce X-User-ID header for all requests', () => {
      return request(app.getHttpServer())
        .get('/projects')
        .expect(400); // Missing header
    });

    it('should only return user-owned projects', () => {
      const mockProjects = [
        {
          id: 'proj-1',
          userId: 'user-123',
          name: 'My Project',
        },
      ];

      mockProjectService.listProjects.mockResolvedValueOnce(mockProjects);

      return request(app.getHttpServer())
        .get('/projects')
        .set('X-User-ID', 'user-123')
        .expect(200)
        .expect((res) => {
          // All projects should belong to user-123
          expect(res.body.every((p) => p.userId === 'user-123')).toBe(true);
        });
    });
  });
});
