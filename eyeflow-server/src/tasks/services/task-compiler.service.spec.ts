import { Test, TestingModule } from '@nestjs/testing';
import { TaskCompilerService } from './task-compiler.service';
import { ConnectorRegistryService } from './connector-registry.service';
import { LLMContextBuilderService } from './llm-context-builder.service';
import { LLMContextEnhancedService } from './llm-context-enhanced.service';
import { LLMIntentParserService } from './llm-intent-parser.abstraction';
import { TaskValidatorService } from './task-validator.service';
import { AgentBrokerService } from './agent-broker.service';
import { RuleCompilerService } from './rule-compiler.service';
import { CompilationFeedbackService } from './compilation-feedback.service';
import { LLMContextEnricherService } from './llm-context-enricher.service';
import { LLMSessionService } from './llm-session.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GlobalTaskEntity } from '../entities/global-task.entity';
import { EventRuleEntity } from '../entities/event-rule.entity';
import { MissionEntity } from '../entities/mission.entity';
import { GlobalTaskStateEntity } from '../entities/task-state.entity';
import { AuditLogEntity } from '../entities/audit-log.entity';

describe('TaskCompilerService - Basic Coverage', () => {
  let service: TaskCompilerService;
  let mockGlobalTaskRepository: any;
  let mockEventRuleRepository: any;
  let mockMissionRepository: any;
  let mockTaskStateRepository: any;
  let mockAuditLogRepository: any;

  beforeEach(async () => {
    mockGlobalTaskRepository = {
      save: jest.fn().mockResolvedValue({ id: 'task-1' }),
      findOne: jest.fn().mockResolvedValue({ id: 'task-1', userId: 'user-1' }),
      find: jest.fn().mockResolvedValue([]),
    };

    mockEventRuleRepository = {
      save: jest.fn().mockResolvedValue({ id: 'rule-1' }),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'rule-1', userId: 'user-1' }),
    };

    mockMissionRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    mockTaskStateRepository = {
      save: jest.fn().mockResolvedValue({ id: 'state-1' }),
      find: jest.fn().mockResolvedValue([]),
    };

    mockAuditLogRepository = {
      save: jest.fn().mockResolvedValue({ id: 'log-1' }),
    };

    const mockConnectorRegistry = {
      getAllConnectors: jest.fn().mockReturnValue([]),
      getConnector: jest.fn().mockResolvedValue({ id: 'connector-1' }),
    };

    const mockContextBuilder = {
      buildContext: jest.fn().mockReturnValue({}),
      exportContextAsJSON: jest.fn().mockReturnValue('{}'),
    };

    const mockContextEnhanced = {
      enhanceContext: jest.fn().mockReturnValue({}),
    };

    const mockLLMParser = {
      parse: jest.fn().mockResolvedValue({ intent: 'test' }),
    };

    const mockValidator = {
      validateCompilation: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
    };

    const mockAgentBroker = {
      registerAgent: jest.fn().mockResolvedValue({ id: 'agent-1' }),
    };

    const mockRuleCompiler = {
      compileRule: jest.fn().mockResolvedValue({ isValid: true, errorCount: 0 }),
    };

    const mockCompilationFeedback = {
      generateUserFeedback: jest.fn().mockReturnValue({ status: 'INFO' }),
    };

    const mockContextEnricher = {
      enrichContext: jest.fn().mockResolvedValue({}),
    };

    const mockLLMSessionService = {
      getSession: jest.fn().mockResolvedValue({ id: 'sess-1', userId: 'user-123', allowedConnectorIds: ['slack'] }),
      filterLLMContext: jest.fn().mockImplementation((ctx) => ctx),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskCompilerService,
        {
          provide: getRepositoryToken(GlobalTaskEntity),
          useValue: mockGlobalTaskRepository,
        },
        {
          provide: getRepositoryToken(EventRuleEntity),
          useValue: mockEventRuleRepository,
        },
        {
          provide: getRepositoryToken(MissionEntity),
          useValue: mockMissionRepository,
        },
        {
          provide: getRepositoryToken(GlobalTaskStateEntity),
          useValue: mockTaskStateRepository,
        },
        {
          provide: getRepositoryToken(AuditLogEntity),
          useValue: mockAuditLogRepository,
        },
        {
          provide: ConnectorRegistryService,
          useValue: mockConnectorRegistry,
        },
        {
          provide: LLMContextBuilderService,
          useValue: mockContextBuilder,
        },
        {
          provide: LLMContextEnhancedService,
          useValue: mockContextEnhanced,
        },
        {
          provide: 'LLMIntentParser',
          useValue: mockLLMParser,
        },
        {
          provide: TaskValidatorService,
          useValue: mockValidator,
        },
        {
          provide: AgentBrokerService,
          useValue: mockAgentBroker,
        },
        {
          provide: RuleCompilerService,
          useValue: mockRuleCompiler,
        },
        {
          provide: CompilationFeedbackService,
          useValue: mockCompilationFeedback,
        },
        {
          provide: LLMContextEnricherService,
          useValue: mockContextEnricher,
        },
        {
          provide: LLMSessionService,
          useValue: mockLLMSessionService,
        },
      ],
    }).compile();

    service = module.get<TaskCompilerService>(TaskCompilerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have createTask method', () => {
    expect(typeof service.createTask).toBe('function');
  });

  it('should have compileTask method', () => {
    expect(typeof service.compileTask).toBe('function');
  });

  it('should have executeTask method', () => {
    expect(typeof service.executeTask).toBe('function');
  });

  it('should have getTaskStatus method', () => {
    expect(typeof service.getTaskStatus).toBe('function');
  });

  it('should have createEventRule method', () => {
    expect(typeof service.createEventRule).toBe('function');
  });

  it('should have getConnectorManifests method', () => {
    expect(typeof service.getConnectorManifests).toBe('function');
  });

  it('should have getLLMContext method', () => {
    expect(typeof service.getLLMContext).toBe('function');
  });

  it('should have getEnrichedLLMContext method', () => {
    expect(typeof service.getEnrichedLLMContext).toBe('function');
  });

  describe('Task creation', () => {
    it('should create a task successfully', async () => {
      const result = await service.createTask('user-123', {
        type: 'AUTOMATION' as any,
        userInput: 'Send notification',
        targetConnectorIds: [],
      });

      expect(result).toBeDefined();
      expect(mockGlobalTaskRepository.save).toHaveBeenCalled();
    });
  });

  describe('LLM Context methods', () => {
    it('should provide connector manifests', () => {
      const manifests = service.getConnectorManifests();
      expect(manifests).toBeDefined();
      expect(Array.isArray(manifests)).toBe(true);
    });

    it('should provide LLM context for user', () => {
      const context = service.getLLMContext('user-123');
      expect(context).toBeDefined();
    });

    it('generateEventRuleFromIntent should use session filter when sessionId provided', async () => {
      // call generateEventRuleFromIntent with a sessionId; the mock session service should be used
      const spy = jest.spyOn((service as any).llmSessionService, 'filterLLMContext');
      await service.generateEventRuleFromIntent('user-123', 'alert when X', false, 'sess-1');
      expect(spy).toHaveBeenCalled();
    });

    it('should export LLM context as JSON', () => {
      const json = service.exportLLMContextJSON('user-123');
      expect(json).toBeDefined();
      expect(typeof json).toBe('string');
    });
  });
});
