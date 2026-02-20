import { Test, TestingModule } from '@nestjs/testing';
import { AgentsGateway } from './agents.gateway';
import { AgentsService } from './agents.service';

describe('AgentsGateway', () => {
  let gateway: AgentsGateway;
  let mockAgentsService: Partial<AgentsService>;
  let mockClient: any;

  beforeEach(async () => {
    mockAgentsService = {
      registerAgent: jest.fn().mockReturnValue({ id: 'agent-1', name: 'test-agent' }),
      updateAgentStatus: jest.fn(),
    };

    mockClient = {
      id: 'socket-1',
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsGateway,
        { provide: AgentsService, useValue: mockAgentsService },
      ],
    }).compile();

    gateway = module.get<AgentsGateway>(AgentsGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('should handle connection and disconnection without throwing', () => {
    expect(() => gateway.handleConnection(mockClient as any)).not.toThrow();
    expect(() => gateway.handleDisconnect(mockClient as any)).not.toThrow();
  });

  it('handleAgentRegister should call service and emit event', () => {
    const payload = { agentName: 'agent-x', version: '1.0', capabilities: ['a'] };

    const res = gateway.handleAgentRegister(payload as any, mockClient as any);

    expect(mockAgentsService.registerAgent).toHaveBeenCalledWith(expect.objectContaining({ agentName: 'agent-x' }));
    expect(mockClient.emit).toHaveBeenCalledWith('agent:registered', expect.objectContaining({ agent: expect.any(Object) }));
    expect(res).toEqual(expect.objectContaining({ success: true, agent: expect.any(Object) }));
  });

  it('handleHeartbeat should update status when agentId provided', () => {
    const ok = gateway.handleHeartbeat({ agentId: 'agent-1' } as any, mockClient as any);
    expect((mockAgentsService.updateAgentStatus as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    expect(ok).toEqual({ success: true });
  });

  it('handleHeartbeat should return failure when no agentId', () => {
    const res = gateway.handleHeartbeat({} as any, mockClient as any);
    expect(res).toEqual({ success: false });
  });

  it('handleJobComplete should return success true', () => {
    const res = gateway.handleJobComplete({ jobId: 'job-123' } as any);
    expect(res).toEqual({ success: true });
  });
});
