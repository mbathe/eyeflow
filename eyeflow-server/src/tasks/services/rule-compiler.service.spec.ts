import { Test, TestingModule } from '@nestjs/testing';
import { RuleCompilerService } from './rule-compiler.service';
import { ConnectorRegistryService } from './connector-registry.service';
import { AgentBrokerService } from './agent-broker.service';

describe('RuleCompilerService - Basic Coverage', () => {
  let service: RuleCompilerService;
  let mockConnectorRegistry: any;
  let mockAgentBroker: any;

  beforeEach(async () => {
    mockConnectorRegistry = {
      getConnector: jest.fn().mockResolvedValue({
        id: 'connector-1',
        name: 'Slack',
      }),
    };

    mockAgentBroker = {
      getAgent: jest.fn().mockResolvedValue({ id: 'agent-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RuleCompilerService,
        {
          provide: ConnectorRegistryService,
          useValue: mockConnectorRegistry,
        },
        {
          provide: AgentBrokerService,
          useValue: mockAgentBroker,
        },
      ],
    }).compile();

    service = module.get<RuleCompilerService>(RuleCompilerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have compileRule method', () => {
    expect(typeof service.compileRule).toBe('function');
  });

  it('should return a compilation report from compileRule', async () => {
    const mockRule: any = {
      id: 'rule-1',
      name: 'Test Rule',
      trigger: { type: 'ON_CREATE', source: 'webhook' },
      condition: { fieldName: 'status', operator: 'equals', value: 'active' },
      actions: [],
    };

    const report = await service.compileRule(mockRule);

    expect(report).toBeDefined();
    expect(report).toHaveProperty('ruleId');
    expect(report).toHaveProperty('ruleName');
    expect(report).toHaveProperty('isValid');
    expect(report).toHaveProperty('issues');
    expect(Array.isArray(report.issues)).toBe(true);
  });

  it('should handle invalid rules gracefully', async () => {
    const invalidRule: any = {
      id: 'rule-2',
      name: 'Invalid Rule',
      trigger: null,
      condition: null,
      actions: [],
    };

    const report = await service.compileRule(invalidRule);

    expect(report).toBeDefined();
    expect(report.isValid).toBe(false);
    expect(report.errorCount).toBeGreaterThan(0);
  });

  it('should format compilation report as string', async () => {
    const mockReport: any = {
      ruleId: 'rule-1',
      ruleName: 'Test Rule',
      isValid: true,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      issues: [],
      dataFlow: [],
      missingRequirements: {
        connectors: [],
        agents: [],
        nodes: [],
        documents: [],
      },
      recommendations: [],
    };

    const formatted = service.formatCompilationReport(mockReport);

    expect(formatted).toBeDefined();
    expect(typeof formatted).toBe('string');
  });

  it('should include rule name in formatted report', async () => {
    const mockReport: any = {
      ruleId: 'rule-1',
      ruleName: 'My Special Rule',
      isValid: true,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      issues: [],
      dataFlow: [],
      missingRequirements: {
        connectors: [],
        agents: [],
        nodes: [],
        documents: [],
      },
      recommendations: [],
    };

    const formatted = service.formatCompilationReport(mockReport);

    expect(formatted).toContain('My Special Rule');
  });
});
