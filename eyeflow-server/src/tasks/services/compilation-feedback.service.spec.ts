import { Test, TestingModule } from '@nestjs/testing';
import { CompilationFeedbackService } from './compilation-feedback.service';
import { CompilationReport, IssueSeverity, IssueType } from './rule-compiler.service';

describe('CompilationFeedbackService', () => {
  let service: CompilationFeedbackService;

  const mockSuccessfulReport: CompilationReport = {
    ruleId: 'rule-123',
    ruleName: 'Test Rule',
    isValid: true,
    totalIssues: 0,
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
    estimatedExecutionTime: 500,
  };

  const mockFailedReportWithErrors: CompilationReport = {
    ruleId: 'rule-456',
    ruleName: 'Invalid Rule',
    isValid: false,
    totalIssues: 2,
    errorCount: 2,
    warningCount: 0,
    infoCount: 0,
    issues: [
      {
        type: IssueType.CONNECTOR_NOT_FOUND,
        severity: IssueSeverity.ERROR,
        path: 'action[0].connectorId',
        message: 'Connector "slack-connector" not found',
        affectedComponent: 'slack-connector',
      },
      {
        type: IssueType.MISSING_REQUIRED_FIELD,
        severity: IssueSeverity.ERROR,
        path: 'condition',
        message: 'Condition is required',
        affectedComponent: 'condition',
      },
    ],
    dataFlow: [],
    missingRequirements: {
      connectors: ['slack-connector'],
      agents: [],
      nodes: [],
      documents: [],
    },
    recommendations: [],
    estimatedExecutionTime: 0,
  };

  const mockWarningReport: CompilationReport = {
    ruleId: 'rule-789',
    ruleName: 'Warning Rule',
    isValid: true,
    totalIssues: 1,
    errorCount: 0,
    warningCount: 1,
    infoCount: 0,
    issues: [
      {
        type: IssueType.PERFORMANCE_RISK,
        severity: IssueSeverity.WARNING,
        path: 'action[0]',
        message: 'Large loop may cause timeout',
        affectedComponent: 'loop_action',
      },
    ],
    dataFlow: [],
    missingRequirements: {
      connectors: [],
      agents: [],
      nodes: [],
      documents: [],
    },
    recommendations: ['Consider breaking the rule into smaller pieces'],
    estimatedExecutionTime: 5000,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CompilationFeedbackService],
    }).compile();

    service = module.get<CompilationFeedbackService>(CompilationFeedbackService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateUserFeedback', () => {
    it('should return success message when rule is valid', () => {
      const feedback = service.generateUserFeedback(mockSuccessfulReport);

      expect(feedback.status).toBe('INFO');
      expect(feedback.title).toContain('✅');
      expect(feedback.title).toContain('valid');
      expect(feedback.details).toBeDefined();
      expect(feedback.details.length).toBeGreaterThan(0);
      expect(feedback.actionItems).toBeDefined();
      expect(feedback.actionItems.length).toBeGreaterThan(0);
    });

    it('should return errors when compilation fails', () => {
      const feedback = service.generateUserFeedback(mockFailedReportWithErrors);

      expect(feedback.status).toBe('ERROR');
      expect(feedback.title).toContain('❌');
      expect(feedback.title).toContain('errors');
      expect(feedback.message).toBeDefined();
      expect(feedback.details).toBeDefined();
      expect(feedback.actionItems).toBeDefined();
    });

    it('should return warning message when there are warnings', () => {
      const feedback = service.generateUserFeedback(mockWarningReport);

      expect(feedback.status).toBe('WARNING');
      expect(feedback.title).toContain('⚠️');
      expect(feedback.title).toContain('warnings');
      expect(feedback.details).toBeDefined();
      expect(feedback.actionItems).toBeDefined();
    });

    it('should handle rules with user intent', () => {
      const userIntent = 'Send a message to Slack when a new user is created';
      const feedback = service.generateUserFeedback(mockSuccessfulReport, userIntent);

      expect(feedback).toBeDefined();
      expect(feedback.status).toBe('INFO');
    });
  });

  describe('generateLLMFeedback', () => {
    it('should return comprehensive feedback when compilation fails', () => {
      const feedback = service.generateLLMFeedback(
        mockFailedReportWithErrors,
        'Send notification to Slack',
      );

      expect(feedback).toBeDefined();
      expect(feedback.summary).toBeDefined();
      expect(feedback.severity).toBe('BLOCKED');
      expect(feedback.problems).toBeDefined();
      expect(feedback.problems.length).toBeGreaterThan(0);
      expect(feedback.missing).toBeDefined();
      expect(feedback.missing.missingConnectors.length).toBeGreaterThan(0);
      expect(feedback.llmFeedback).toBeDefined();
      expect(feedback.llmFeedback.whatWentWrong).toBeDefined();
      expect(feedback.llmFeedback.constraints).toBeDefined();
      expect(feedback.llmFeedback.suggestions).toBeDefined();
      expect(feedback.nextSteps).toBeDefined();
    });

    it('should return warning severity feedback for warning report', () => {
      const feedback = service.generateLLMFeedback(mockWarningReport);

      expect(feedback.severity).toBe('WARNING');
      expect(feedback.problems).toBeDefined();
    });

    it('should return INFO severity for successful compilation', () => {
      const feedback = service.generateLLMFeedback(mockSuccessfulReport);

      expect(feedback.severity).toBe('INFO');
    });

    it('should include missing connectors in feedback', () => {
      const feedback = service.generateLLMFeedback(mockFailedReportWithErrors);

      expect(feedback.missing.missingConnectors).toBeDefined();
      expect(Array.isArray(feedback.missing.missingConnectors)).toBe(true);
    });

    it('should mark retryable status correctly', () => {
      const successFeedback = service.generateLLMFeedback(mockSuccessfulReport);
      const failureFeedback = service.generateLLMFeedback(mockFailedReportWithErrors);

      expect(successFeedback.retryable).toBeDefined();
      expect(failureFeedback.retryable).toBeDefined();
    });

    it('should handle available connectors context', () => {
      const availableConnectors = [
        { id: 'connector-1', name: 'Slack' },
        { id: 'connector-2', name: 'Teams' },
      ];

      const feedback = service.generateLLMFeedback(
        mockFailedReportWithErrors,
        'Send notification',
        availableConnectors,
      );

      expect(feedback.llmFeedback.context).toBeDefined();
    });
  });

  describe('Feedback generation for specific error types', () => {
    it('should handle CONNECTOR_NOT_FOUND errors', () => {
      const report: CompilationReport = {
        ...mockFailedReportWithErrors,
        issues: [
          {
            type: IssueType.CONNECTOR_NOT_FOUND,
            severity: IssueSeverity.ERROR,
            path: 'action.connector',
            message: 'Slack connector missing',
            affectedComponent: 'slack',
          },
        ],
      };

      const feedback = service.generateUserFeedback(report);

      expect(feedback.status).toBe('ERROR');
      expect(feedback.message).toContain('Cannot find connector');
    });

    it('should handle MISSING_DOCUMENT errors', () => {
      const report: CompilationReport = {
        ...mockFailedReportWithErrors,
        issues: [
          {
            type: IssueType.MISSING_DOCUMENT,
            severity: IssueSeverity.ERROR,
            path: 'condition',
            message: 'Document schema missing',
            affectedComponent: 'user_schema',
          },
        ],
      };

      const feedback = service.generateUserFeedback(report);

      expect(feedback.status).toBe('ERROR');
      expect(feedback.message).toContain('Cannot find');
      expect(feedback.message).toContain('document');
    });

    it('should handle TYPE_MISMATCH errors', () => {
      const report: CompilationReport = {
        ...mockFailedReportWithErrors,
        issues: [
          {
            type: IssueType.TYPE_MISMATCH,
            severity: IssueSeverity.ERROR,
            path: 'action[0]',
            message: 'String expected, got number',
            affectedComponent: 'email_field',
          },
        ],
      };

      const feedback = service.generateUserFeedback(report);

      expect(feedback.status).toBe('ERROR');
      expect(feedback.message).toContain('Data type mismatch');
    });
  });

  describe('User action items generation', () => {
    it('should provide actionable steps for failed rules', () => {
      const feedback = service.generateUserFeedback(mockFailedReportWithErrors);

      expect(feedback.actionItems).toBeDefined();
      expect(feedback.actionItems.length).toBeGreaterThan(0);

      feedback.actionItems.forEach((item) => {
        expect(item.action).toBeDefined();
        expect(item.priority).toMatch(/HIGH|MEDIUM|LOW/);
        expect(item.effort).toMatch(/EASY|MEDIUM|HARD/);
      });
    });

    it('should provide actionable steps for successful rules', () => {
      const feedback = service.generateUserFeedback(mockSuccessfulReport);

      expect(feedback.actionItems).toBeDefined();
      expect(feedback.actionItems.length).toBeGreaterThan(0);

      const actions = feedback.actionItems.map((item) => item.action.toLowerCase());
      expect(actions.some((a) => a.includes('create') || a.includes('activate'))).toBe(true);
    });
  });

  describe('LLM context building', () => {
    it('should provide next steps for LLM', () => {
      const feedback = service.generateLLMFeedback(mockFailedReportWithErrors);

      expect(feedback.nextSteps).toBeDefined();
      expect(Array.isArray(feedback.nextSteps)).toBe(true);
      expect(feedback.nextSteps.length).toBeGreaterThan(0);
    });

    it('should provide constraints for LLM', () => {
      const feedback = service.generateLLMFeedback(mockFailedReportWithErrors);

      expect(feedback.llmFeedback.constraints).toBeDefined();
      expect(Array.isArray(feedback.llmFeedback.constraints)).toBe(true);
    });

    it('should provide suggestions for LLM to improve', () => {
      const feedback = service.generateLLMFeedback(mockFailedReportWithErrors);

      expect(feedback.llmFeedback.suggestions).toBeDefined();
      expect(Array.isArray(feedback.llmFeedback.suggestions)).toBe(true);
      expect(feedback.llmFeedback.suggestions.length).toBeGreaterThan(0);
    });
  });
});
