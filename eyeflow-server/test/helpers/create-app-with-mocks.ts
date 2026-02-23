/**
 * createAppWithMocks
 *
 * Starts the full NestJS application with every TypeORM repository swapped out
 * for a jest mock.  This lets us spin up the complete routing/pipe/validation
 * stack without a real database.
 *
 * The mock repositories are returned so individual tests can configure
 * spy return values:
 *
 *   const { app, repos } = await createAppWithMocks();
 *   repos.connector.findOne.mockResolvedValue({ id: '1', name: 'pg' });
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { VersionLifecycleService } from '../../src/tasks/services/version-lifecycle.service';

import { AppModule } from '../../src/app.module';
import { createMockRepo, MockRepository } from './mock-repository.factory';

// ─── Entity imports ────────────────────────────────────────────────────────
import { ConnectorEntity } from '../../src/connectors/connector.entity';
import { LlmConfigEntity } from '../../src/llm-config/llm-config.entity';
import { GlobalTaskEntity } from '../../src/tasks/entities/global-task.entity';
import { EventRuleEntity } from '../../src/tasks/entities/event-rule.entity';
import { EventRuleExtendedEntity } from '../../src/tasks/entities/event-rule-extended.entity';
import { MissionEntity } from '../../src/tasks/entities/mission.entity';
import { GlobalTaskStateEntity } from '../../src/tasks/entities/task-state.entity';
import { AuditLogEntity } from '../../src/tasks/entities/audit-log.entity';
import { LLMSessionEntity } from '../../src/tasks/entities/llm-session.entity';
import { LLMProjectEntity } from '../../src/tasks/entities/llm-project.entity';
import { ProjectVersionEntity } from '../../src/tasks/entities/project-version.entity';
import { ExecutionMemoryStateEntity } from '../../src/tasks/entities/execution-memory-state.entity';
import { ExecutionRecordEntity } from '../../src/tasks/entities/execution-record.entity';
import { UserEntity } from '../../src/auth/entities/user.entity';
import { RevokedTokenEntity } from '../../src/auth/entities/revoked-token.entity';

// ─── Exported mock repo bag ─────────────────────────────────────────────────
export interface MockRepos {
  connector: MockRepository<ConnectorEntity>;
  llmConfig: MockRepository<LlmConfigEntity>;
  globalTask: MockRepository<GlobalTaskEntity>;
  eventRule: MockRepository<EventRuleEntity>;
  eventRuleExtended: MockRepository<EventRuleExtendedEntity>;
  mission: MockRepository<MissionEntity>;
  taskState: MockRepository<GlobalTaskStateEntity>;
  auditLog: MockRepository<AuditLogEntity>;
  llmSession: MockRepository<LLMSessionEntity>;
  llmProject: MockRepository<LLMProjectEntity>;
  projectVersion: MockRepository<ProjectVersionEntity>;
  executionMemoryState: MockRepository<ExecutionMemoryStateEntity>;
  executionRecord: MockRepository<ExecutionRecordEntity>;
  user: MockRepository<UserEntity>;
  revokedToken: MockRepository<RevokedTokenEntity>;
}

export interface TestApp {
  app: INestApplication;
  repos: MockRepos;
  moduleFixture: TestingModule;
}

export async function createAppWithMocks(): Promise<TestApp> {
  // Ensure test env before any module loading
  process.env.NODE_ENV = 'test';
  process.env.KAFKA_ENABLED = 'false';

  const mockDataSource = {
    createEntityManager: jest.fn().mockReturnValue({
      transaction: jest.fn().mockImplementation(async (cb: any) => cb({})),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation(async (e: any) => e),
    }),
    transaction: jest.fn().mockImplementation(async (cb: any) => cb({})),
    getRepository: jest.fn().mockReturnValue(createMockRepo()),
    query: jest.fn().mockResolvedValue([]),
    initialize: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    isInitialized: true,
  };

  /** Stub for VersionLifecycleService which directly injects DataSource */
  const mockVersionLifecycleService = {
    assertTransitionAllowed: jest.fn(),
    submitForValidation: jest.fn().mockResolvedValue(null),
    markValidated: jest.fn().mockResolvedValue(null),
    promoteToActive: jest.fn().mockResolvedValue(null),
    archiveVersion: jest.fn().mockResolvedValue(null),
    getVersionLineage: jest.fn().mockResolvedValue([]),
    getActiveVersion: jest.fn().mockResolvedValue(null),
    verifyIrIntegrity: jest.fn().mockResolvedValue({ valid: true }),
  };

  const repos: MockRepos = {
    connector: createMockRepo<ConnectorEntity>(),
    llmConfig: createMockRepo<LlmConfigEntity>(),
    globalTask: createMockRepo<GlobalTaskEntity>(),
    eventRule: createMockRepo<EventRuleEntity>(),
    eventRuleExtended: createMockRepo<EventRuleExtendedEntity>(),
    mission: createMockRepo<MissionEntity>(),
    taskState: createMockRepo<GlobalTaskStateEntity>(),
    auditLog: createMockRepo<AuditLogEntity>(),
    llmSession: createMockRepo<LLMSessionEntity>(),
    llmProject: createMockRepo<LLMProjectEntity>(),
    projectVersion: createMockRepo<ProjectVersionEntity>(),
    executionMemoryState: createMockRepo<ExecutionMemoryStateEntity>(),
    executionRecord: createMockRepo<ExecutionRecordEntity>(),
    user: createMockRepo<UserEntity>(),
    revokedToken: createMockRepo<RevokedTokenEntity>(),
  };

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(getRepositoryToken(ConnectorEntity))
    .useValue(repos.connector)
    .overrideProvider(getRepositoryToken(LlmConfigEntity))
    .useValue(repos.llmConfig)
    .overrideProvider(getRepositoryToken(GlobalTaskEntity))
    .useValue(repos.globalTask)
    .overrideProvider(getRepositoryToken(EventRuleEntity))
    .useValue(repos.eventRule)
    .overrideProvider(getRepositoryToken(EventRuleExtendedEntity))
    .useValue(repos.eventRuleExtended)
    .overrideProvider(getRepositoryToken(MissionEntity))
    .useValue(repos.mission)
    .overrideProvider(getRepositoryToken(GlobalTaskStateEntity))
    .useValue(repos.taskState)
    .overrideProvider(getRepositoryToken(AuditLogEntity))
    .useValue(repos.auditLog)
    .overrideProvider(getRepositoryToken(LLMSessionEntity))
    .useValue(repos.llmSession)
    .overrideProvider(getRepositoryToken(LLMProjectEntity))
    .useValue(repos.llmProject)
    .overrideProvider(getRepositoryToken(ProjectVersionEntity))
    .useValue(repos.projectVersion)
    .overrideProvider(getRepositoryToken(ExecutionMemoryStateEntity))
    .useValue(repos.executionMemoryState)
    .overrideProvider(getRepositoryToken(ExecutionRecordEntity))
    .useValue(repos.executionRecord)
    .overrideProvider(getRepositoryToken(UserEntity))
    .useValue(repos.user)
    .overrideProvider(getRepositoryToken(RevokedTokenEntity))
    .useValue(repos.revokedToken)
    .overrideProvider(VersionLifecycleService)
    .useValue(mockVersionLifecycleService)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );
  await app.init();

  return { app, repos, moduleFixture };
}
