import { Test, TestingModule } from '@nestjs/testing';
import { TasksController } from './tasks.controller';
import { TaskCompilerService } from '../services/task-compiler.service';
import { RuleApprovalService } from '../services/rule-approval.service';
import { DAGGeneratorService } from '../services/dag-generator.service';

describe('TasksController - Approval Workflow', () => {
  let controller: TasksController;
  let taskCompilerService: TaskCompilerService;
  let ruleApprovalService: RuleApprovalService;
  let dagGeneratorService: DAGGeneratorService;

  const mockUserId = '550e8400-e29b-41d4-a716-446655440000';
  const mockRuleId = 'rule-550e8400-e29b-41d4-a716-446655440001';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        {
          provide: TaskCompilerService,
          useValue: {
            getEventRuleStatus: jest.fn().mockResolvedValue({
              id: mockRuleId,
              name: 'Test Rule',
              status: 'ACTIVE',
            }),
          },
        },
        {
          provide: RuleApprovalService,
          useValue: {
            getPendingApproval: jest.fn().mockResolvedValue([]),
            getRuleForApproval: jest.fn().mockResolvedValue({
              rule: { id: mockRuleId, name: 'Test Rule' },
              dag: { nodes: [], edges: [] },
              compilationReport: {},
            }),
            approveRule: jest.fn().mockResolvedValue({
              success: true,
              message: 'Rule approved',
              rule: { id: mockRuleId, approvalStatus: 'APPROVED' },
            }),
            rejectRule: jest.fn().mockResolvedValue({
              success: true,
              message: 'Rule rejected',
              rule: { id: mockRuleId, approvalStatus: 'REJECTED' },
            }),
          },
        },
        {
          provide: DAGGeneratorService,
          useValue: {
            generateDAG: jest.fn().mockReturnValue({
              nodes: [],
              edges: [],
              metadata: {},
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<TasksController>(TasksController);
    taskCompilerService = module.get<TaskCompilerService>(TaskCompilerService);
    ruleApprovalService = module.get<RuleApprovalService>(RuleApprovalService);
    dagGeneratorService = module.get<DAGGeneratorService>(DAGGeneratorService);
  });

  describe('GET /tasks/rules/pending-approval', () => {
    it('should return empty array when no rules pending', async () => {
      const result = await controller.getPendingApprovalRules(mockUserId);
      expect(result).toEqual({
        success: true,
        count: 0,
        rules: [],
      });
      expect(ruleApprovalService.getPendingApproval).toHaveBeenCalledWith(mockUserId);
    });

    it('should return pending approval rules with count', async () => {
      const mockRules = [
        { id: 'rule-1', name: 'Rule 1', approvalStatus: 'PENDING_APPROVAL' },
      ];
      (ruleApprovalService.getPendingApproval as jest.Mock).mockResolvedValueOnce(mockRules);

      const result = await controller.getPendingApprovalRules(mockUserId);
      expect(result.count).toBe(1);
      expect(result.rules).toEqual(mockRules);
    });
  });

  describe('GET /tasks/approval/stats', () => {
    it('should return approval statistics', async () => {
      const result = await controller.getApprovalStats(mockUserId);
      expect(result).toEqual({
        success: true,
        stats: {
          pending: 0,
          approved: 0,
          rejected: 0,
          total: 0,
        },
      });
    });
  });

  describe('GET /tasks/rules/:ruleId/for-approval', () => {
    it('should return rule with DAG for approval review', async () => {
      const result = await controller.getRuleForApproval(mockRuleId, mockUserId);
      expect(result.success).toBe(true);
      expect(result.rule).toBeDefined();
      expect(result.dag).toBeDefined();
      expect(ruleApprovalService.getRuleForApproval).toHaveBeenCalledWith(mockRuleId, mockUserId);
    });
  });

  describe('POST /tasks/rules/:ruleId/approve', () => {
    it('should approve a rule successfully', async () => {
      const result = await controller.approveRule(mockRuleId, mockUserId);
      expect(result.success).toBe(true);
      expect(result.message).toContain('approved');
      expect(ruleApprovalService.approveRule).toHaveBeenCalledWith(mockRuleId, mockUserId);
    });
  });

  describe('POST /tasks/rules/:ruleId/reject', () => {
    it('should reject a rule with feedback', async () => {
      const feedback = { feedback: 'Not accurate enough' };
      const result = await controller.rejectRule(mockRuleId, mockUserId, feedback);
      expect(result.success).toBe(true);
      expect(result.message).toContain('rejected');
      expect(ruleApprovalService.rejectRule).toHaveBeenCalledWith(mockRuleId, mockUserId, feedback.feedback);
    });
  });

  describe('GET /tasks/rules/:ruleId/dag', () => {
    it('should return DAG visualization for a rule', async () => {
      const result = await controller.getDAGForRule(mockRuleId, mockUserId);
      expect(result.success).toBe(true);
      expect(result.ruleId).toBe(mockRuleId);
      expect(result.dag).toBeDefined();
    });
  });

  describe('GET /tasks/rules/:id (generic)', () => {
    it('should return rule status for valid ID', async () => {
      const result = await controller.getEventRuleStatus(mockUserId, mockRuleId);
      expect(result.id).toBe(mockRuleId);
      expect(result.name).toBe('Test Rule');
      expect(result.status).toBe('ACTIVE');
      expect(taskCompilerService.getEventRuleStatus).toHaveBeenCalledWith(mockUserId, mockRuleId);
    });
  });
});
