import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { EventRuleExtendedEntity } from '../entities/event-rule-extended.entity';
import { RuleApprovalStatus } from '../types/task.types';

@Injectable()
export class RuleApprovalService {
  private readonly logger = new Logger(RuleApprovalService.name);

  constructor(
    @InjectRepository(EventRuleExtendedEntity)
    private ruleRepository: Repository<EventRuleExtendedEntity>
  ) {}

  /**
   * Get rules pending user approval
   */
  async getPendingApproval(userId: string): Promise<EventRuleExtendedEntity[]> {
    this.logger.log(`Fetching pending approvals for user: ${userId}`);

    return this.ruleRepository.find({
      where: {
        userId,
        approvalStatus: RuleApprovalStatus.PENDING_APPROVAL,
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get detailed rule info with DAG for approval review
   */
  async getRuleForApproval(
    ruleId: string,
    userId: string,
  ): Promise<{
    rule: EventRuleExtendedEntity;
    dag: any;
    compilationReport: any;
    approvalStatus: RuleApprovalStatus | undefined;
  }> {
    const rule = await this.ruleRepository.findOne({
      where: { id: ruleId, userId },
    });

    if (!rule) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    if (rule.approvalStatus !== RuleApprovalStatus.PENDING_APPROVAL) {
      this.logger.warn(
        `Rule ${ruleId} is not pending approval (status: ${rule.approvalStatus})`,
      );
    }

    return {
      rule,
      dag: rule.dag || null,
      compilationReport: rule.compilationReport || null,
      approvalStatus: rule.approvalStatus,
    };
  }

  /**
   * Approve a rule and activate it
   */
  async approveRule(
    ruleId: string,
    userId: string,
  ): Promise<{ success: boolean; rule: EventRuleExtendedEntity; message: string }> {
    const rule = await this.ruleRepository.findOne({
      where: { id: ruleId, userId },
    });

    if (!rule) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    if (rule.approvalStatus !== RuleApprovalStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Rule is not pending approval (current status: ${rule.approvalStatus})`,
      );
    }

    // Update approval status
    rule.approvalStatus = RuleApprovalStatus.APPROVED;
    rule.userApprovalFeedback = {
      approved: true,
      feedback: 'User approved the DAG and rule compilation',
      approvedAt: new Date(),
      approvedBy: userId,
    };

    // Activate the rule
    rule.status = 'ACTIVE' as any; // From EventRuleStatus

    await this.ruleRepository.save(rule);

    this.logger.log(`Rule ${ruleId} approved by ${userId} and activated`);

    return {
      success: true,
      rule,
      message: `Rule "${rule.name}" approved and activated successfully`,
    };
  }

  /**
   * Reject a rule with feedback
   */
  async rejectRule(
    ruleId: string,
    userId: string,
    feedback: string,
  ): Promise<{ success: boolean; rule: EventRuleExtendedEntity; message: string }> {
    const rule = await this.ruleRepository.findOne({
      where: { id: ruleId, userId },
    });

    if (!rule) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    if (rule.approvalStatus !== RuleApprovalStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Rule is not pending approval (current status: ${rule.approvalStatus})`,
      );
    }

    // Store rejection feedback
    rule.approvalStatus = RuleApprovalStatus.REJECTED;
    rule.userMessage = feedback;

    await this.ruleRepository.save(rule);

    this.logger.log(`Rule ${ruleId} rejected by ${userId} with feedback: "${feedback}"`);

    return {
      success: true,
      rule,
      message: `Rule rejected. LLM will retry with your feedback.`,
    };
  }

  /**
   * Update rule with new DAG after compilation
   */
  async updateRuleWithDAG(
    ruleId: string,
    dag: any,
    compilationReport: any,
  ): Promise<EventRuleExtendedEntity> {
    const rule = await this.ruleRepository.findOne({
      where: { id: ruleId },
    });

    if (!rule) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    rule.dag = dag;
    rule.compilationReport = compilationReport;
    rule.approvalStatus = RuleApprovalStatus.PENDING_APPROVAL;

    await this.ruleRepository.save(rule);

    this.logger.log(`Updated rule ${ruleId} with new DAG and compilation report`);

    return rule;
  }

  /**
   * Get approval feedback for a rule
   */
  async getApprovalFeedback(ruleId: string, userId: string): Promise<any> {
    const rule = await this.ruleRepository.findOne({
      where: { id: ruleId, userId },
    });

    if (!rule) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    return rule.userApprovalFeedback || null;
  }

  /**
   * Return aggregated approval statistics for a user
   */
  async getApprovalStats(userId: string): Promise<{ pending: number; approved: number; rejected: number; total: number }> {
    const rules: EventRuleExtendedEntity[] = await this.ruleRepository.find({ where: { userId } });

    const pending = rules.filter((r) => r.approvalStatus === RuleApprovalStatus.PENDING_APPROVAL).length;
    const approved = rules.filter((r) => r.approvalStatus === RuleApprovalStatus.APPROVED).length;
    const rejected = rules.filter((r) => r.approvalStatus === RuleApprovalStatus.REJECTED).length;
    const total = rules.length;

    return { pending, approved, rejected, total };
  }
}