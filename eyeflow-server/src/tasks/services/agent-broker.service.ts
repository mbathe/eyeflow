/**
 * AGENT BROKER SERVICE
 * 
 * Manages expert agents available in the system:
 * - Legal review agents
 * - Compliance validators
 * - ML models
 * - Human review queues
 * - External expert services
 * 
 * These agents can be called as conditions or actions in rules
 */

import { Injectable, Logger } from '@nestjs/common';

/**
 * Types of expert agents the system can call
 */
export enum AgentType {
  LEGAL_REVIEW = 'LEGAL_REVIEW',           // Legal document review
  COMPLIANCE_CHECK = 'COMPLIANCE_CHECK',   // Regulatory compliance
  ML_MODEL = 'ML_MODEL',                   // Machine learning predictions
  HUMAN_APPROVAL = 'HUMAN_APPROVAL',       // Queue for human review
  THIRD_PARTY_API = 'THIRD_PARTY_API',     // External expert service
  CUSTOM_ALGORITHM = 'CUSTOM_ALGORITHM',   // Custom validation logic
}

/**
 * When can an agent be called?
 */
export enum AgentCallingContext {
  CONDITION = 'CONDITION',   // Use agent result as part of condition evaluation
  ACTION = 'ACTION',         // Call agent as an action
  ENRICHMENT = 'ENRICHMENT', // Enrich event data before rule evaluation
}

/**
 * Agent capability/function signature
 */
export interface AgentFunction {
  id: string;                          // Unique ID: "legal-review-doc-v1"
  name: string;                        // "Legal Document Review"
  description: string;
  
  // Input specification
  inputSchema: {
    type: string;                      // e.g., "object"
    properties: Record<string, any>;   // What fields it accepts
    required: string[];                // Required fields
  };
  
  // Output specification
  outputSchema: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
  
  // Execution
  endpoint?: string;                   // HTTP endpoint if external
  timeout?: number;                    // Max execution time (ms)
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
  
  // Reliability
  sla?: {
    maxLatencyMs: number;
    reliability: number;               // 0-1: expected success rate
  };
}

/**
 * Registered expert agent
 */
export interface AgentInfo {
  id: string;                              // Unique agent ID
  type: AgentType;                         // What kind of agent
  name: string;                            // Display name
  description: string;
  
  // What this agent is expert at
  domain: string;                          // e.g., "legal", "finance", "compliance"
  expertise: string[];                     // e.g., ["contract-review", "ndas", "terms-of-service"]
  
  // Agent functions
  functions: Map<string, AgentFunction>;   // Callable functions
  
  // Meta
  provider: string;                        // Who provides this agent
  version: string;
  availability: 'AVAILABLE' | 'MAINTENANCE' | 'OFFLINE';
  lastHealthCheck?: Date;
  
  // Usage
  costPerCall?: number;                    // If external/paid service
  quotaPerDay?: number;                    // Rate limiting
  
  // Supported contexts
  supportedContexts: AgentCallingContext[];
}

@Injectable()
export class AgentBrokerService {
  private readonly logger = new Logger(AgentBrokerService.name);
  private agents = new Map<string, AgentInfo>();

  /**
   * Register a new expert agent or function
   */
  registerAgent(agent: AgentInfo): void {
    this.logger.log(`📋 Registering agent: ${agent.name} (${agent.id})`);
    this.agents.set(agent.id, agent);
  }

  /**
   * Register a new function for an existing agent
   */
  registerAgentFunction(agentId: string, func: AgentFunction): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }
    agent.functions.set(func.id, func);
    this.logger.log(`📋 Registered function ${func.id} for agent ${agentId}`);
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentInfo | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all available agents
   */
  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values()).filter(
      (a) => a.availability === 'AVAILABLE',
    );
  }

  /**
   * Get agents by type
   */
  getAgentsByType(type: AgentType): AgentInfo[] {
    return this.getAllAgents().filter((a) => a.type === type);
  }

  /**
   * Find agents that can handle a specific domain/expertise
   * e.g., "contract review" → find legal agents with contract expertise
   */
  findAgentsByExpertise(domain: string, expertise: string): AgentInfo[] {
    return this.getAllAgents().filter(
      (a) =>
        a.domain.toLowerCase() === domain.toLowerCase() &&
        a.expertise.some((exp) =>
          exp.toLowerCase().includes(expertise.toLowerCase()),
        ),
    );
  }

  /**
   * Get all available contexts where an agent can be called
   */
  getAgentSupportedContexts(agentId: string): AgentCallingContext[] {
    const agent = this.getAgent(agentId);
    return agent?.supportedContexts || [];
  }

  /**
   * Check if agent can be called in a specific context
   */
  canCallInContext(agentId: string, context: AgentCallingContext): boolean {
    const agent = this.getAgent(agentId);
    return agent?.supportedContexts.includes(context) ?? false;
  }

  /**
   * Get all expert capabilities (for LLM context)
   */
  getExpertCapabilities(): any[] {
    const capabilities = [];

    for (const agent of this.getAllAgents()) {
      for (const func of agent.functions.values()) {
        capabilities.push({
          agentId: agent.id,
          agentName: agent.name,
          agentType: agent.type,
          domain: agent.domain,
          expertise: agent.expertise,
          functionId: func.id,
          functionName: func.name,
          description: func.description,
          inputSchema: func.inputSchema,
          outputSchema: func.outputSchema,
          timeout: func.timeout || 30000,
          contexts: agent.supportedContexts,
        });
      }
    }

    return capabilities;
  }

  /**
   * Mock: Initialize with common agents (in production, load from config/database)
   */
  initializeMockAgents(): void {
    // Legal Review Agent
    this.registerAgent({
      id: 'agent-legal',
      type: AgentType.LEGAL_REVIEW,
      name: 'Legal Review Specialist',
      description: 'Expert at reviewing legal documents and contracts',
      domain: 'legal',
      expertise: ['contract-review', 'ndas', 'tos', 'compliance-legal'],
      provider: 'internal-ai',
      version: '1.0',
      availability: 'AVAILABLE',
      supportedContexts: [AgentCallingContext.CONDITION, AgentCallingContext.ENRICHMENT],
      functions: new Map([
        [
          'legal-review-document',
          {
            id: 'legal-review-document',
            name: 'Review Legal Document',
            description: 'Comprehensive legal review of a document',
            inputSchema: {
              type: 'object',
              properties: {
                documentId: { type: 'string', description: 'Document to review' },
                reviewType: { type: 'string', enum: ['contract', 'nda', 'tos', 'general'] },
                restrictions: { type: 'array', items: { type: 'string' }, description: 'Things to check' },
              },
              required: ['documentId', 'reviewType'],
            },
            outputSchema: {
              type: 'object',
              properties: {
                isCompliant: { type: 'boolean', description: 'Passes legal review?' },
                risks: { type: 'array', items: { type: 'string' } },
                recommendations: { type: 'array', items: { type: 'string' } },
                reviewerConfidence: { type: 'number', minimum: 0, maximum: 1 },
                reviewDetails: { type: 'string' },
              },
              required: ['isCompliant', 'risks'],
            },
            timeout: 60000,
            retryPolicy: { maxRetries: 2, backoffMs: 1000 },
            sla: { maxLatencyMs: 45000, reliability: 0.98 },
          } as AgentFunction,
        ],
      ]),
    });

    // Compliance Check Agent
    this.registerAgent({
      id: 'agent-compliance',
      type: AgentType.COMPLIANCE_CHECK,
      name: 'Compliance Validator',
      description: 'Checks compliance against regulations',
      domain: 'compliance',
      expertise: ['gdpr', 'hipaa', 'sox', 'regulations'],
      provider: 'internal-ai',
      version: '1.0',
      availability: 'AVAILABLE',
      supportedContexts: [AgentCallingContext.CONDITION, AgentCallingContext.ACTION],
      functions: new Map([
        [
          'check-compliance',
          {
            id: 'check-compliance',
            name: 'Check Compliance',
            description: 'Check if data/process is compliant',
            inputSchema: {
              type: 'object',
              properties: {
                dataType: { type: 'string', enum: ['pii', 'health', 'financial', 'general'] },
                regulations: { type: 'array', items: { type: 'string' } },
                dataContent: { type: 'object', description: 'Data to check' },
              },
              required: ['dataType', 'regulations'],
            },
            outputSchema: {
              type: 'object',
              properties: {
                isCompliant: { type: 'boolean' },
                violations: { type: 'array', items: { type: 'string' } },
                requiresAction: { type: 'boolean' },
                actionItems: { type: 'array', items: { type: 'string' } },
              },
              required: ['isCompliant', 'violations'],
            },
            timeout: 30000,
            sla: { maxLatencyMs: 25000, reliability: 0.99 },
          } as AgentFunction,
        ],
      ]),
    });

    // ML Model Agent
    this.registerAgent({
      id: 'agent-ml',
      type: AgentType.ML_MODEL,
      name: 'ML Prediction Model',
      description: 'ML-based predictions and classifications',
      domain: 'ml',
      expertise: ['fraud-detection', 'sentiment-analysis', 'classification', 'scoring'],
      provider: 'ml-platform',
      version: '2.1',
      availability: 'AVAILABLE',
      supportedContexts: [AgentCallingContext.CONDITION, AgentCallingContext.ENRICHMENT],
      functions: new Map([
        [
          'predict-fraud',
          {
            id: 'predict-fraud',
            name: 'Fraud Detection',
            description: 'Predict if transaction is fraudulent',
            inputSchema: {
              type: 'object',
              properties: {
                transactionAmount: { type: 'number' },
                merchantCategory: { type: 'string' },
                location: { type: 'string' },
                userHistory: { type: 'object' },
              },
              required: ['transactionAmount'],
            },
            outputSchema: {
              type: 'object',
              properties: {
                isFraud: { type: 'boolean' },
                fraudScore: { type: 'number', minimum: 0, maximum: 1 },
                explanation: { type: 'string' },
              },
              required: ['isFraud', 'fraudScore'],
            },
            endpoint: 'http://ml-service:5000/predict',
            timeout: 5000,
            sla: { maxLatencyMs: 3000, reliability: 0.97 },
          } as AgentFunction,
        ],
      ]),
    });

    // Human Approval Agent
    this.registerAgent({
      id: 'agent-human',
      type: AgentType.HUMAN_APPROVAL,
      name: 'Human Reviewer Queue',
      description: 'Queue tasks for human review',
      domain: 'human',
      expertise: ['manual-review', 'final-approval', 'escalation'],
      provider: 'internal',
      version: '1.0',
      availability: 'AVAILABLE',
      supportedContexts: [AgentCallingContext.ACTION],
      functions: new Map([
        [
          'request-approval',
          {
            id: 'request-approval',
            name: 'Request Human Approval',
            description: 'Send document for human review/approval',
            inputSchema: {
              type: 'object',
              properties: {
                documentId: { type: 'string' },
                approverRole: { type: 'string', enum: ['manager', 'compliance', 'legal'] },
                priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                reason: { type: 'string' },
              },
              required: ['documentId', 'approverRole'],
            },
            outputSchema: {
              type: 'object',
              properties: {
                taskId: { type: 'string' },
                assignedTo: { type: 'string' },
                dueDate: { type: 'string', format: 'date-time' },
                status: { type: 'string', enum: ['PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED'] },
              },
              required: ['taskId', 'status'],
            },
            timeout: 300000, // 5 minutes to create task, not wait for approval
          } as AgentFunction,
        ],
      ]),
    });

    this.logger.log('✅ Initialized 4 mock agents (Legal, Compliance, ML, Human)');
  }
}
