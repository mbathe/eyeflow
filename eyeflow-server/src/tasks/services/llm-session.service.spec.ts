import { Test, TestingModule } from '@nestjs/testing';
import { LLMSessionService } from './llm-session.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LLMSessionEntity } from '../entities/llm-session.entity';

describe('LLMSessionService', () => {
  let service: LLMSessionService;
  let mockRepo: any;

  beforeEach(async () => {
    mockRepo = {
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation(async (v) => ({ ...v, id: 'sess-1' })),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMSessionService,
        { provide: getRepositoryToken(LLMSessionEntity), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<LLMSessionService>(LLMSessionService);
  });

  it('should create ephemeral session and set expiry', async () => {
    const dto: any = { name: 'test', allowedConnectorIds: ['slack'], ttlMinutes: 1 };
    const s = await service.createSession('user-1', dto);
    expect(s).toBeDefined();
    expect(s.id).toBe('sess-1');
    expect(mockRepo.save).toHaveBeenCalled();
  });

  it('filterLLMContext should redact connectors not in allowed list', () => {
    const context: any = {
      connectors: [{ id: 'slack' }, { id: 'postgres' }],
      nodes: [{ connectorId: 'slack', node: {} }, { connectorId: 'postgres', node: {} }],
      functions: [
        { connectorId: 'slack', function: { id: 'slack_send_message' } },
        { connectorId: 'postgres', function: { id: 'pg_query' } },
      ],
      triggers: [{ connectorId: 'slack', trigger: {} }, { connectorId: 'postgres', trigger: {} }],
    };

    const session: any = { allowedConnectorIds: ['slack'], allowedFunctionIds: [] };
    const filtered = service.filterLLMContext(context, session as any);
    expect(filtered.connectors.map((c) => c.id)).toEqual(['slack']);
    expect(filtered.functions.map((f) => f.connectorId)).toEqual(['slack']);
    expect(filtered.triggers.map((t) => t.connectorId)).toEqual(['slack']);
  });
});
