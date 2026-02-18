/**
 * LLM COMPILATION FEEDBACK SYSTEM
 * 
 * When rule compilation fails, this service:
 * 1. Analyzes the compilation errors
 * 2. Generates user-friendly explanations
 * 3. Creates feedback for LLM to improve next suggestion
 * 4. Suggests how to fix the rule
 * 5. Lists what's missing and how to get it
 */

import { Injectable, Logger } from '@nestjs/common';
import { CompilationReport, CompilationIssue, IssueSeverity, IssueType } from './rule-compiler.service';

/**
 * User-friendly feedback about why rule compilation failed
 */
export interface CompilationFeedback {
  // Summary for user
  summary: string; // "Your rule cannot execute because..."
  severity: 'BLOCKED' | 'WARNING' | 'INFO';

  // What's wrong (simple terms)
  problems: {
    title: string;
    description: string;
    howToFix: string;
  }[];

  // What's missing
  missing: {
    missingConnectors: { name: string; reason: string; howToGet: string }[];
    missingAgents: { name: string; reason: string; howToGet: string }[];
    missingDocuments: { name: string; reason: string; whatToProvide: string }[];
    missingInformation: { field: string; reason: string; example: string }[];
  };

  // Feedback for LLM to improve
  llmFeedback: {
    whatWentWrong: string;
    context: string; // What's available in the system
    constraints: string[]; // Limitations
    suggestions: string[]; // How to generate better rules next time
  };

  // User next steps
  nextSteps: string[];
  retryable: boolean; // Can user fix and try again?
}

/**
 * Message to send back to user about rule generation
 */
export interface UserMessage {
  status: 'ERROR' | 'WARNING' | 'INFO';
  title: string;
  message: string;
  details: string[];
  actionItems: {
    action: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    effort: 'EASY' | 'MEDIUM' | 'HARD';
  }[];
}

@Injectable()
export class CompilationFeedbackService {
  private readonly logger = new Logger(CompilationFeedbackService.name);

  /**
   * Generate user-friendly feedback from compilation errors
   */
  generateUserFeedback(report: CompilationReport, userIntent?: string): UserMessage {
    const errorCount = report.errorCount;
    const warningCount = report.warningCount;

    if (errorCount === 0 && warningCount === 0) {
      return {
        status: 'INFO',
        title: '✅ Rule is valid and ready to execute',
        message: `Your rule "${report.ruleName}" passed all compilations checks and will work correctly.`,
        details: [
          `Estimated execution time: ~${report.estimatedExecutionTime}ms`,
          `Data flow: Validated`,
          `All connectors and dependencies: Available`,
        ],
        actionItems: [
          { action: 'Create and activate the rule', priority: 'HIGH', effort: 'EASY' },
        ],
      };
    }

    if (errorCount > 0) {
      return {
        status: 'ERROR',
        title: `❌ Rule cannot execute (${errorCount} errors)`,
        message: this.buildErrorMessage(report),
        details: this.extractErrorDetails(report),
        actionItems: this.buildActionItems(report),
      };
    }

    return {
      status: 'WARNING',
      title: `⚠️ Rule may have issues (${warningCount} warnings)`,
      message: `Your rule might not work well in some cases. Review the warnings and consider optimizations.`,
      details: this.extractWarningDetails(report),
      actionItems: this.buildActionItems(report),
    };
  }

  /**
   * Generate detailed feedback for LLM about why compilation failed
   */
  generateLLMFeedback(
    report: CompilationReport,
    userIntent?: string,
    availableConnectors?: any[],
  ): CompilationFeedback {
    const feedback: CompilationFeedback = {
      summary: this.buildErrorMessageForLLM(report, userIntent),
      severity: report.errorCount > 0 ? 'BLOCKED' : report.warningCount > 0 ? 'WARNING' : 'INFO',

      problems: this.extractProblems(report),

      missing: {
        missingConnectors: this.buildMissingConnectorsList(report, availableConnectors),
        missingAgents: this.buildMissingAgentsList(report),
        missingDocuments: this.buildMissingDocumentsList(report),
        missingInformation: this.buildMissingInformationList(report),
      },

      llmFeedback: {
        whatWentWrong: this.buildLLMExplanation(report),
        context: this.buildContextForLLM(availableConnectors),
        constraints: this.buildConstraints(report),
        suggestions: this.buildLLMSuggestions(report, userIntent),
      },

      nextSteps: this.buildNextSteps(report),
      retryable: report.errorCount === 0 || this.canRetryAfterFixes(report),
    };

    return feedback;
  }

  /**
   * Build error message for user
   */
  private buildErrorMessage(report: CompilationReport): string {
    const errors = report.issues.filter((i) => i.severity === IssueSeverity.ERROR);

    if (errors.length === 0) {
      return 'Rule cannot be created for unknown reasons.';
    }

    const firstError = errors[0];

    switch (firstError.type) {
      case IssueType.CONNECTOR_NOT_FOUND:
        return `Cannot find connector "${firstError.affectedComponent}". This connector is needed but not installed in the system.`;

      case IssueType.FUNCTION_NOT_FOUND:
        return `Cannot find the function "${firstError.affectedComponent}". The connector exists but this specific function is not available.`;

      case IssueType.MISSING_DOCUMENT:
        return `Cannot find the referenced document/schema "${firstError.affectedComponent}". Your rule depends on this but it doesn't exist in the system.`;

      case IssueType.MISSING_REQUIRED_FIELD:
        return `Your rule is missing required information: ${firstError.affectedComponent}. The rule cannot be structured correctly without this.`;

      case IssueType.TYPE_MISMATCH:
        return `Data type mismatch. The rule tries to use data in an incompatible way.`;

      default:
        return `Rule cannot execute: ${firstError.message}`;
    }
  }

  /**
   * Build error message for LLM to understand why it failed
   */
  private buildErrorMessageForLLM(report: CompilationReport, userIntent?: string): string {
    const errorCount = report.errorCount;
    const missingConnectors = report.missingRequirements.connectors;
    const missingAgents = report.missingRequirements.agents;
    const missingDocs = report.missingRequirements.documents;

    let summary = `Rule compilation FAILED.\n\n`;

    if (userIntent) {
      summary += `User Request: "${userIntent}"\n\n`;
    }

    summary += `Issues Found:\n`;
    summary += `- ${errorCount} Error(s)\n`;

    if (missingConnectors.length > 0) {
      summary += `- Missing connectors: ${missingConnectors.join(', ')}\n`;
    }
    if (missingAgents.length > 0) {
      summary += `- Missing agents: ${missingAgents.join(', ')}\n`;
    }
    if (missingDocs.length > 0) {
      summary += `- Missing documents: ${missingDocs.join(', ')}\n`;
    }

    summary += `\nPlease generate a different rule that:\n`;
    summary += `1. Uses only the AVAILABLE connectors and agents\n`;
    summary += `2. Asks the user for missing information\n`;
    summary += `3. Suggests how to get required resources\n`;

    return summary;
  }

  /**
   * Extract problems with specific advice
   */
  private extractProblems(
    report: CompilationReport,
  ): { title: string; description: string; howToFix: string }[] {
    const problems: { title: string; description: string; howToFix: string }[] = [];

    report.issues
      .filter((i) => i.severity === IssueSeverity.ERROR)
      .slice(0, 5)
      .forEach((issue) => {
        problems.push({
          title: this.getIssueTitle(issue.type),
          description: issue.message,
          howToFix: issue.suggestion || this.getDefaultFix(issue.type),
        });
      });

    return problems;
  }

  /**
   * Build list of missing connectors
   */
  private buildMissingConnectorsList(
    report: CompilationReport,
    availableConnectors?: any[],
  ): { name: string; reason: string; howToGet: string }[] {
    return report.missingRequirements.connectors.map((connName) => ({
      name: connName,
      reason: `Your rule needs to call the "${connName}" connector, but it's not installed.`,
      howToGet: `Install the "${connName}" connector from the marketplace or register it manually. Then try again.`,
    }));
  }

  /**
   * Build list of missing agents
   */
  private buildMissingAgentsList(
    report: CompilationReport,
  ): { name: string; reason: string; howToGet: string }[] {
    return report.missingRequirements.agents.map((agentName) => ({
      name: agentName,
      reason: `Your rule needs an expert agent "${agentName}" to validate data, but it's not registered.`,
      howToGet: `Register the "${agentName}" agent in the system (legal review, compliance check, etc). Then generate the rule again.`,
    }));
  }

  /**
   * Build list of missing documents
   */
  private buildMissingDocumentsList(
    report: CompilationReport,
  ): { name: string; reason: string; whatToProvide: string }[] {
    return report.missingRequirements.documents.map((docId) => ({
      name: docId,
      reason: `Your rule references a schema/config "${docId}" for validation, but it doesn't exist.`,
      whatToProvide: `Create or upload the "${docId}" document to the system. It should be a schema or configuration file the rule needs.`,
    }));
  }

  /**
   * Build list of missing information (user needs to provide)
   */
  private buildMissingInformationList(
    report: CompilationReport,
  ): { field: string; reason: string; example: string }[] {
    const missing: { field: string; reason: string; example: string }[] = [];

    report.issues
      .filter((i) => i.type === IssueType.MISSING_REQUIRED_FIELD && i.severity === IssueSeverity.ERROR)
      .forEach((issue) => {
        missing.push({
          field: issue.affectedComponent || issue.path,
          reason: issue.message,
          example: this.getExampleForField(issue.path),
        });
      });

    return missing;
  }

  /**
   * Extract error details for display
   */
  private extractErrorDetails(report: CompilationReport): string[] {
    return report.issues
      .filter((i) => i.severity === IssueSeverity.ERROR)
      .map((issue) => `[${issue.type}] ${issue.message}`)
      .slice(0, 5);
  }

  /**
   * Extract warning details for display
   */
  private extractWarningDetails(report: CompilationReport): string[] {
    return report.issues
      .filter((i) => i.severity === IssueSeverity.WARNING)
      .map((issue) => `⚠️ ${issue.message}`)
      .slice(0, 3);
  }

  /**
   * Build action items for user
   */
  private buildActionItems(
    report: CompilationReport,
  ): { action: string; priority: 'HIGH' | 'MEDIUM' | 'LOW'; effort: 'EASY' | 'MEDIUM' | 'HARD' }[] {
    const items = [];

    if (report.missingRequirements.connectors.length > 0) {
      items.push({
        action: `Install missing connectors: ${report.missingRequirements.connectors.join(', ')}`,
        priority: 'HIGH',
        effort: 'MEDIUM',
      });
    }

    if (report.missingRequirements.documents.length > 0) {
      items.push({
        action: `Upload missing documents/schemas: ${report.missingRequirements.documents.join(', ')}`,
        priority: 'HIGH',
        effort: 'EASY',
      });
    }

    if (report.warningCount > 0) {
      items.push({
        action: 'Review warnings and optimize rule',
        priority: 'MEDIUM',
        effort: 'MEDIUM',
      });
    }

    return items as { action: string; priority: 'HIGH' | 'MEDIUM' | 'LOW'; effort: 'EASY' | 'MEDIUM' | 'HARD' }[];
  }

  /**
   * Build explanation for LLM about what went wrong
   */
  private buildLLMExplanation(report: CompilationReport): string {
    const errors = report.issues.filter((i) => i.severity === IssueSeverity.ERROR);

    if (errors.length === 0) {
      return 'Rule compilation succeeded.';
    }

    const reasons: string[] = [];

    errors.forEach((err) => {
      if (err.type === IssueType.CONNECTOR_NOT_FOUND) {
        reasons.push(`Connector "${err.affectedComponent}" is not available.`);
      } else if (err.type === IssueType.FUNCTION_NOT_FOUND) {
        reasons.push(`Function "${err.affectedComponent}" does not exist.`);
      } else if (err.type === IssueType.MISSING_DOCUMENT) {
        reasons.push(`Referenced document "${err.affectedComponent}" not found.`);
      }
    });

    return `Compilation failed because:\n${reasons.map((r) => `• ${r}`).join('\n')}`;
  }

  /**
   * Build system context info for LLM
   */
  private buildContextForLLM(availableConnectors?: any[]): string {
    if (!availableConnectors || availableConnectors.length === 0) {
      return 'No connector information available.';
    }

    const connectorList = availableConnectors.map((c) => c.name).join(', ');
    return `Available connectors in the system:\n${connectorList}\n\nYou MUST use only these connectors when generating rules.`;
  }

  /**
   * Build list of constraints for LLM
   */
  private buildConstraints(report: CompilationReport): string[] {
    const constraints = [];

    constraints.push(
      'All connectors must be registered in the system before use in a rule.',
    );
    constraints.push(
      'All document references (schemas, configs) must be uploaded to the system first.',
    );
    constraints.push(
      'If an expert agent is needed, it must be registered (legal review, compliance check, ML models, etc).',
    );
    constraints.push(
      'All functions must be available in the referenced connector.',
    );
    constraints.push(
      'Avoid operations that would create circular dependencies (rule triggering itself).',
    );
    constraints.push(
      'Service calls should have reasonable timeouts (max 30 seconds).',
    );

    return constraints;
  }

  /**
   * Build suggestions for better LLM generation
   */
  private buildLLMSuggestions(report: CompilationReport, userIntent?: string): string[] {
    const suggestions = [];

    if (report.missingRequirements.connectors.length > 0) {
      suggestions.push(
        `The user might need connectors that are not installed. Suggest they install: ${report.missingRequirements.connectors.join(', ')}. Then generate a rule using only available connectors.`,
      );
    }

    if (report.missingRequirements.documents.length > 0) {
      suggestions.push(
        `Ask the user to provide the missing documents first: ${report.missingRequirements.documents.join(', ')}. Then generate the rule.`,
      );
    }

    suggestions.push(
      'If you don\'t have all the information needed, ask the user what connector or service they want to use.',
    );
    suggestions.push(
      'Always suggest available expert agents (legal, compliance, ML models) in your responses.',
    );

    return suggestions;
  }

  /**
   * Build next steps for user
   */
  private buildNextSteps(report: CompilationReport): string[] {
    const steps = [];

    if (report.missingRequirements.connectors.length > 0) {
      steps.push(`1. Install the missing connector(s): ${report.missingRequirements.connectors.join(', ')}`);
    }

    if (report.missingRequirements.documents.length > 0) {
      steps.push(`2. Upload the required documents: ${report.missingRequirements.documents.join(', ')}`);
    }

    if (report.missingRequirements.agents.length > 0) {
      steps.push(`3. Register the required agents: ${report.missingRequirements.agents.join(', ')}`);
    }

    steps.push(`${report.missingRequirements.connectors.length > 0 ? '4' : '2'}. Generate the rule again with corrected parameters`);

    steps.push(
      `${report.missingRequirements.connectors.length > 0 ? '5' : '3'}. Review the suggested rule and approve it`,
    );

    return steps;
  }

  /**
   * Check if rule can be retried after fixes
   */
  private canRetryAfterFixes(report: CompilationReport): boolean {
    // If all errors are missing connectors/docs/agents, it's retryable
    const retryableIssues = [
      IssueType.CONNECTOR_NOT_FOUND,
      IssueType.MISSING_DOCUMENT,
      IssueType.MISSING_AGENT,
    ];

    const errorIssues = report.issues
      .filter((i) => i.severity === IssueSeverity.ERROR)
      .map((i) => i.type);

    return errorIssues.every((type) => retryableIssues.includes(type));
  }

  /**
   * Helper: Get user-friendly title for issue type
   */
  private getIssueTitle(type: IssueType): string {
    const titles: Record<IssueType, string> = {
      [IssueType.CONNECTOR_NOT_FOUND]: 'Missing Connector',
      [IssueType.FUNCTION_NOT_FOUND]: 'Function Not Found',
      [IssueType.TYPE_MISMATCH]: 'Data Type Mismatch',
      [IssueType.MISSING_REQUIRED_FIELD]: 'Missing Information',
      [IssueType.MISSING_AGENT]: 'Missing Expert Agent',
      [IssueType.MISSING_NODE]: 'Missing Execution Node',
      [IssueType.INCOMPATIBLE_TYPES]: 'Incompatible Types',
      [IssueType.MISSING_DOCUMENT]: 'Missing Document/Schema',
      [IssueType.PERFORMANCE_RISK]: 'Performance Risk',
      [IssueType.TIMEOUT_RISK]: 'Timeout Risk',
      [IssueType.UNRELIABLE_SERVICE]: 'Unreliable Service',
    };
    return titles[type] || 'Unknown Issue';
  }

  /**
   * Helper: Get default fix for issue type
   */
  private getDefaultFix(type: IssueType): string {
    const fixes: Record<IssueType, string> = {
      [IssueType.CONNECTOR_NOT_FOUND]:
        'Install the required connector or use a different connector.',
      [IssueType.FUNCTION_NOT_FOUND]:
        'Use a different function or check the connector documentation.',
      [IssueType.TYPE_MISMATCH]:
        'Ensure data types match (e.g., strings to strings, numbers to numbers).',
      [IssueType.MISSING_REQUIRED_FIELD]: 'Provide the missing information.',
      [IssueType.MISSING_AGENT]: 'Register or install the required expert agent.',
      [IssueType.MISSING_NODE]: 'Add the missing execution node.',
      [IssueType.INCOMPATIBLE_TYPES]: 'Correct the data types.',
      [IssueType.MISSING_DOCUMENT]:
        'Upload the required schema or document to the system.',
      [IssueType.PERFORMANCE_RISK]: 'Add LIMIT clause or optimize the query.',
      [IssueType.TIMEOUT_RISK]: 'Reduce complexity or add more timeout.',
      [IssueType.UNRELIABLE_SERVICE]: 'Add retry logic or use a more reliable service.',
    };
    return fixes[type] || 'Try a different approach.';
  }

  /**
   * Helper: Get example for missing field
   */
  private getExampleForField(path: string): string {
    const examples: Record<string, string> = {
      'condition.query': 'SELECT * FROM customers WHERE status = "active"',
      'trigger.interval': '"5m" or "1h" or "30s"',
      'condition.service': '"slack", "email", "database"',
      'condition.prompt': '"Is this document compliant with GDPR?"',
      'actions[0].function': '"send_message", "send_email", "update_record"',
    };
    return examples[path] || 'See documentation for examples.';
  }
}
