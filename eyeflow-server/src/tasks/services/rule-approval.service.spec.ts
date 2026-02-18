import { Test, TestingModule } from '@nestjs/testing';
import { RuleApprovalService } from './rule-approval.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventRuleExtendedEntity } from '../entities/event-rule-extended.entity';
import { RuleApprovalStatus } from '../types/task.types';

describe('RuleApprovalService', () => {
  let service: RuleApprovalService;
  let mockRepository: any;

  const mockUserId = '550e8400-e29b-41d4-a716-446655440000';
  const mockRuleId = 'rule-550e8400-e29b-41d4-a716-446655440001';

  const mockRule = {
    id: mockRuleId,
    userId: mockUserId,
    name: 'Test Rule',
    approvalStatus: RuleApprovalStatus.PENDING_APPROVAL,
    compilationReport: { isValid: true },
    dag: { nodes: [], edges: [] },
  };

  beforeEach(async () => {
    mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RuleApprovalService,
        {
          provide: getRepositoryToken(EventRuleExtendedEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<RuleApprovalService>(RuleApprovalService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPendingApproval', () => {
    it('should return all rules pending approval for a user', async () => {
      const pendingRules = [mockRule];
      mockRepository.find.mockResolvedValueOnce(pendingRules);

      const result = await service.getPendingApproval(mockUserId);

      expect(result).toEqual(pendingRules);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          approvalStatus: RuleApprovalStatus.PENDING_APPROVAL,
        },
      });
    });

    it('should return empty array when no rules pending', async () => {
      mockRepository.find.mockResolvedValueOnce([]);

      const result = await service.getPendingApproval(mockUserId);

      expect(result).toEqual([]);
      expect(result.length).toBe(0);
    });
  });

  describe('getRuleForApproval', () => {
    it('should return rule with DAG for approval review', async () => {
      mockRepository.findOne.mockResolvedValueOnce(mockRule);

      const result = await service.getRuleForApproval(mockRuleId, mockUserId);

      expect(result).toHaveProperty('rule');
      expect(result).toHaveProperty('dag');
      expect(result.rule.id).toBe(mockRuleId);
    });

    it('should throw error if rule not found', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.getRuleForApproval(mockRuleId, mockUserId)
      ).rejects.toThrow();
    });
  });

  describe('approveRule', () => {
    it('should approve a rule and return success', async () => {
      const approvedRule = { ...mockRule, approvalStatus: RuleApprovalStatus.APPROVED };
      mockRepository.findOne.mockResolvedValueOnce(mockRule);
      mockRepository.save.mockResolvedValueOnce(approvedRule);

      const result = await service.approveRule(mockRuleId, mockUserId);

      expect(result.success).toBe(true);
      expect(result.rule.approvalStatus).toBe(RuleApprovalStatus.APPROVED);
    });

    it('should throw error if rule not pending approval', async () => {
      const activeRule = { ...mockRule, approvalStatus: RuleApprovalStatus.ACTIVE };
      mockRepository.findOne.mockResolvedValueOnce(activeRule);

      await expect(
        service.approveRule(mockRuleId, mockUserId)
      ).rejects.toThrow();
    });
  });

  describe('rejectRule', () => {
    it('should reject a rule with feedback', async () => {
      const feedback = 'Not accurate';
      const rejectedRule = { 
        ...mockRule, 
        approvalStatus: RuleApprovalStatus.REJECTED,
        userMessage: feedback,
      };
      mockRepository.findOne.mockResolvedValueOnce(mockRule);
      mockRepository.save.mockResolvedValueOnce(rejectedRule);

      const result = await service.rejectRule(mockRuleId, mockUserId, feedback);

      expect(result.success).toBe(true);
      expect(result.rule.approvalStatus).toBe(RuleApprovalStatus.REJECTED);
      expect(result.rule.userMessage).toBe(feedback);
    });
  });

  describe('updateRuleWithDAG', () => {
    it('should update rule with DAG and compilation report', async () => {
      const dag = { nodes: ['node1'], edges: ['edge1'] };
      const compilationReport = { isValid: true, errorCount: 0 };

      mockRepository.findOne.mockResolvedValueOnce(mockRule);
      mockRepository.save.mockResolvedValueOnce({
        ...mockRule,
        dag,
        compilationReport,
      });

      const result = await service.updateRuleWithDAG(mockRuleId, dag, compilationReport);

      expect(result).toBeDefined();
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });
});
