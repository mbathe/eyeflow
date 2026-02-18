import { Injectable, Logger } from '@nestjs/common';
import { ConnectorRegistryService } from './connector-registry.service';
import {
  ILLMContextProvider,
  LLMContextProviderRegistry,
} from './llm-context-provider.interface';

/**
 * ENRICHED LLM Context Service
 * 
 * This service provides the LLM with COMPLETE KNOWLEDGE of:
 * - All available connectors and their capabilities
 * - All condition types it can create (simple, service calls, ML, LLM, etc.)
 * - All action types it can execute
 * - All context variables it can access ($event, $result, $context, $user)
 * - All error resilience patterns
 * - Examples of complex rules
 * 
 * The LLM receives this + can create hyper-powerful rules and tasks!
 */

interface ConditionType {
  type: string;
  description: string;
  example: any;
  operators?: string[];
}

interface ActionType {
  type: string;
  description: string;
  example: any;
}

interface ResiliencePattern {
  type: string;
  description: string;
  example: any;
}

interface ContextVariable {
  name: string;
  description: string;
  example: any;
}

interface ExampleRule {
  name: string;
  description: string;
  complexity: 'simple' | 'medium' | 'complex';
  rule: any;
}

export interface EnrichedLLMContext {
  // Core system info
  systemInfo: {
    version: string;
    timestamp: string;
    capabilities: string[];
  };

  // All available connectors with full details
  connectors: any[];

  // Types of conditions the LLM can create
  conditionTypes: ConditionType[];

  // Types of actions the LLM can execute
  actionTypes: ActionType[];

  // Context variables available everywhere
  contextVariables: Record<string, ContextVariable>;

  // All supported operators
  operators: any[];

  // Trigger types for rules
  triggerTypes: any[];

  // Error resilience patterns
  resiliencePatterns: ResiliencePattern[];

  // Performance hints
  performanceHints: any;

  // Example rules showing possibilities
  exampleRules: ExampleRule[];

  // User capabilities and limits
  userCapabilities: any;

  // Best practices
  bestPractices: string[];
}

@Injectable()
export class LLMContextEnhancedService {
  private readonly logger = new Logger(LLMContextEnhancedService.name);
  private readonly providerRegistry = new LLMContextProviderRegistry();

  // 🔷 Register built-in provider (tasks module itself)
  constructor(
    private connectorRegistry: ConnectorRegistryService,
    // Optional: inject external providers
    private externalProviders: ILLMContextProvider[] = [],
  ) {
    // Register built-in Tasks module as a provider
    this.registerBuiltInProvider();
    
    // Register any external providers
    this.externalProviders.forEach((provider) => {
      this.registerProvider(provider);
    });
  }

  /**
   * 🔷 CORE EXTENSION SYSTEM: Register external providers
   * Called by other modules to contribute to LLM context
   * 
   * Example:
   * constructor(
   *   private contextEnhanced: LLMContextEnhancedService,
   * ) {
   *   this.contextEnhanced.registerProvider(new AnalyticsContextProvider());
   * }
   */
  registerProvider(provider: ILLMContextProvider): void {
    this.logger.log(`Registering LLM Context Provider: ${provider.providerId}`);
    this.providerRegistry.register(provider);
  }

  /**
   * Unregister a provider
   */
  unregisterProvider(providerId: string): void {
    this.logger.log(`Unregistering LLM Context Provider: ${providerId}`);
    this.providerRegistry.unregister(providerId);
  }

  /**
   * Get all registered providers info
   */
  getProvidersInfo(): any[] {
    return this.providerRegistry.getProvidersInfo();
  }

  /**
   * 🔷 Register built-in Tasks module as a provider
   */
  private registerBuiltInProvider(): void {
    const builtInProvider: ILLMContextProvider = {
      providerId: 'tasks-module',
      displayName: 'Tasks Module',
      version: '2.0',
      description: 'Core tasks and rules engine capabilities',

      getConditionTypes: () => [
        {
          type: 'SIMPLE',
          description: 'Simple field comparison using operators',
          category: 'DATA',
          example: { field: '$event.status', operator: 'EQ', value: 'ACTIVE' },
          operators: ['EQ', 'GT', 'CONTAINS', 'REGEX', 'BETWEEN', 'EXISTS', 'TRUTHY', 'FALSY'],
        },
        {
          type: 'SERVICE_CALL',
          description: 'Call external HTTP service during evaluation',
          category: 'SERVICE',
          example: { service: 'compliance', endpoint: '/check', body: { customerId: '$event.id' } },
        },
        {
          type: 'LLM_ANALYSIS',
          description: 'Analyze text with LLM for insights',
          category: 'ML',
          example: { content: '$event.notes', prompt: 'Is this spam?' },
        },
        {
          type: 'ML_PREDICTION',
          description: 'Call ML model for predictions',
          category: 'ML',
          example: { model: 'fraud-detector', features: { amount: '$event.amount' } },
        },
        {
          type: 'DATABASE_QUERY',
          description: 'Execute database query during evaluation',
          category: 'DATA',
          example: { query: 'SELECT COUNT(*) FROM orders WHERE customer_id = $1' },
        },
        {
          type: 'PATTERN_ANALYSIS',
          description: 'Analyze patterns with regex/keywords/NLP',
          category: 'LOGIC',
          example: { patterns: ['SPAM_KEYWORDS', 'INAPPROPRIATE_LANGUAGE'] },
        },
        {
          type: 'AGGREGATION',
          description: 'Call multiple services in parallel and combine',
          category: 'SERVICE',
          example: { sources: ['compliance', 'fraud', 'history'], logic: '(compliance.score > 80) AND (fraud.prob < 0.5)' },
        },
      ],

      getActionTypes: () => [
        {
          type: 'CONNECTOR_CALL',
          description: 'Call any connector function',
          category: 'INTEGRATION',
          example: { connector: 'Slack', function: 'send_message' },
          async: true,
        },
        {
          type: 'CHAINED_ACTIONS',
          description: 'Execute multiple actions sequentially',
          category: 'WORKFLOW',
          example: { actions: [{ connector: 'DB', function: 'query' }, { connector: 'Slack', function: 'send' }] },
          async: true,
        },
        {
          type: 'CONDITIONAL_ACTION',
          description: 'Execute action based on condition',
          category: 'COMPUTE',
          example: { condition: '$result.from.1.score > 0.8', action: { connector: 'Slack', function: 'send_message' } },
        },
        {
          type: 'ERROR_HANDLING',
          description: 'Handle errors with retry, timeout, compensation',
          category: 'COMPUTE',
          example: { retries: 3, timeout: 5000, compensation: { connector: 'DB', function: 'rollback' } },
        },
        {
          type: 'PARALLEL_ACTIONS',
          description: 'Execute multiple actions in parallel',
          category: 'WORKFLOW',
          example: { parallel: true, actions: [{ connector: 'Slack', function: 'send' }, { connector: 'DB', function: 'update' }] },
          async: true,
        },
      ],

      getContextVariables: () => ({
        '$event': {
          name: '$event',
          module: 'tasks',
          description: 'The triggering event with all data',
          type: 'object',
          example: { id: 'evt-123', type: 'ON_CREATE', data: { customerId: '123', email: 'test@example.com' } },
          isReadOnly: true,
        },
        '$result': {
          name: '$result',
          module: 'tasks',
          description: 'Results from previous actions in chain',
          type: 'object',
          example: { from: { 1: { data: { score: 0.85 } }, 2: { data: { probability: 0.45 } } } },
          isReadOnly: true,
        },
        '$context': {
          name: '$context',
          module: 'tasks',
          description: 'Request context (user, tenant, auth)',
          type: 'object',
          example: { userId: 'uuid', tenantId: 'uuid', token: '...' },
          isReadOnly: true,
        },
        '$user': {
          name: '$user',
          module: 'tasks',
          description: 'Current user information',
          type: 'object',
          example: { id: 'uuid', email: '...', role: 'admin' },
          isReadOnly: true,
        },
        '$rule': {
          name: '$rule',
          module: 'tasks',
          description: 'Current rule being executed',
          type: 'object',
          example: { id: 'uuid', name: '...', version: 2 },
          isReadOnly: true,
        },
      }),

      getTriggerTypes: () => [
        { type: 'ON_CREATE', description: 'When record created', module: 'tasks', example: {} },
        { type: 'ON_UPDATE', description: 'When record updated', module: 'tasks', example: {} },
        { type: 'ON_DELETE', description: 'When record deleted', module: 'tasks', example: {} },
        { type: 'ON_SCHEDULE', description: 'On cron schedule', module: 'tasks', example: { cron: '0 9 * * *' } },
        { type: 'ON_WEBHOOK', description: 'When webhook triggered', module: 'tasks', example: {} },
        { type: 'ON_STATE_CHANGE', description: 'State machine transition', module: 'tasks', example: {} },
        { type: 'ON_ERROR', description: 'When action fails', module: 'tasks', example: {} },
      ],

      getResiliencePatterns: () => [
        { type: 'RETRY', description: 'Retry with exponential backoff', module: 'tasks', example: { retries: 3 } },
        { type: 'TIMEOUT', description: 'Set execution timeout', module: 'tasks', example: { timeoutMs: 5000 } },
        { type: 'CIRCUIT_BREAKER', description: 'Pause after consecutive failures', module: 'tasks', example: { threshold: 5 } },
        { type: 'FALLBACK', description: 'Execute fallback action', module: 'tasks', example: { fallbackValue: false } },
        { type: 'COMPENSATION', description: 'Undo changes on error', module: 'tasks', example: {} },
        { type: 'DEBOUNCE', description: 'Prevent frequent firing', module: 'tasks', example: { windowMs: 60000 } },
      ],

      getExamples: () => [
        {
          name: 'Compliance Check',
          description: 'Check compliance from multiple sources',
          module: 'tasks',
          complexity: 'complex',
          category: 'rule',
          content: { /* full rule example */ },
        },
      ],

      getCapabilities: () => ({
        maxConditionsPerRule: 100,
        maxActionsPerRule: 50,
        maxServiceCallsPerRule: 10,
        maxExecutionTimeMs: 30000,
        supportsErrorHandling: true,
        supportsParallel: true,
        supportsCaching: true,
      }),

      getBestPractices: () => [
        '✅ Use SERVICE_CALL for external validation',
        '✅ Use LLM_ANALYSIS for complex text understanding',
        '✅ Use ML_PREDICTION for probability-based decisions',
        '✅ Use AGGREGATION to combine multiple checks',
        '✅ Always include error handling patterns',
        '✅ Keep conditions simple, combine with AND/OR for complexity',
        '✅ Cache results when possible',
        '✅ Add debounce to prevent frequent firing',
      ],
    };

    this.providerRegistry.register(builtInProvider);
  }

  async buildEnrichedContext(userId: string): Promise<EnrichedLLMContext> {
    const allConnectors = this.connectorRegistry.getAllConnectors();

    return {
      // 🔷 SYSTEM INFO
      systemInfo: {
        version: '2.0',
        timestamp: new Date().toISOString(),
        capabilities: [
          'Natural language task creation',
          'Automatic rule generation',
          'Complex condition evaluation',
          'Service integration',
          'ML/AI integration',
          'Error resilience',
          'Audit logging',
        ],
      },

      // 🔷 CONNECTORS (what's available)
      connectors: allConnectors.map(manifest => ({
        id: manifest.id,
        name: manifest.name,
        description: manifest.description,
        categories: manifest.categories,
        
        functions: manifest.functions.map(fn => ({
          name: fn.name,
          description: fn.description,
          category: fn.category,
          parameters: fn.parameters.map(p => ({
            name: p.name,
            type: p.type,
            required: p.required,
            description: p.description,
            example: p.example,
          })),
          responseType: fn.response.dataType,
          responseSchema: fn.response.schema,
        })),

        nodes: manifest.nodes.map(node => ({
          name: node.name,
          displayName: node.displayName,
          description: node.description,
          schema: node.dataSchema.name,
          supportsTriggers: node.supportsSubscription,
          availableFunctions: node.availableFunctions.map(f => f.name),
        })),

        triggers: manifest.triggers,
        
        example: {
          description: `Example: Call ${manifest.name}`,
          code: {
            connector: manifest.name,
            function: manifest.functions[0]?.name,
            params: {},
          },
        },
      })),

      // 🔷 CONDITION TYPES (what LLM can create!)
      conditionTypes: [
        {
          type: 'SIMPLE',
          description: 'Simple field comparison using one of 18 operators',
          example: {
            field: '$event.status',
            operator: 'EQ',
            value: 'ACTIVE',
          },
          operators: [
            'EQ (equal)',
            'NE (not equal)',
            'GT (greater than)',
            'GTE (greater than or equal)',
            'LT (less than)',
            'LTE (less than or equal)',
            'IN (in list)',
            'NOT_IN (not in list)',
            'CONTAINS (string contains)',
            'NOT_CONTAINS (string does not contain)',
            'STARTS_WITH (string starts with)',
            'ENDS_WITH (string ends with)',
            'REGEX (matches regex pattern)',
            'BETWEEN (between two values)',
            'EXISTS (field exists)',
            'NOT_EXISTS (field does not exist)',
            'TRUTHY (is truthy)',
            'FALSY (is falsy)',
          ],
        },

        {
          type: 'SERVICE_CALL',
          description: 'Call an external HTTP service and evaluate its response',
          example: {
            type: 'SERVICE_CALL',
            service: {
              connector: 'HTTP',
              function: 'POST',
              url: 'http://compliance-checker:8080/verify',
              headers: { 'Authorization': 'Bearer $context.token' },
              body: {
                customerId: '$event.id',
                email: '$event.email',
              },
            },
            evaluation: {
              resultField: 'compliance_score',
              operator: 'GT',
              value: 0.85,
            },
            resilience: {
              retries: 3,
              timeoutMs: 5000,
              backoffMs: 1000,
            },
          },
        },

        {
          type: 'LLM_ANALYSIS',
          description: 'Analyze text content with an LLM to extract insights',
          example: {
            type: 'LLM_ANALYSIS',
            content: '$event.customer_notes',
            analysis: {
              prompt: 'Analyze this text for: sentiment (positive/negative/neutral), appropriateness (appropriate/inappropriate), urgency (low/medium/high). Return JSON.',
              model: 'gpt-4',
              temperature: 0.3,
            },
            evaluation: {
              OR: [
                {
                  resultField: 'sentiment',
                  operator: 'EQ',
                  value: 'negative',
                },
                {
                  resultField: 'appropriateness',
                  operator: 'EQ',
                  value: 'inappropriate',
                },
              ],
            },
          },
        },

        {
          type: 'ML_PREDICTION',
          description: 'Call an ML model for predictions (fraud, sentiment, etc.)',
          example: {
            type: 'ML_PREDICTION',
            model: {
              connector: 'HTTP',
              url: 'http://ml-service:8080/predict/fraud-detection',
              features: {
                transaction_amount: '$event.amount',
                customer_country: '$event.country',
                transaction_frequency: '$result.from.1.frequency',
                email_domain: '$event.email_domain',
              },
            },
            evaluation: {
              resultField: 'fraud_probability',
              operator: 'GT',
              value: 0.75,
            },
            resilience: {
              fallbackValue: false,
              timeoutMs: 3000,
            },
          },
        },

        {
          type: 'DATABASE_QUERY',
          description: 'Execute a complex database query and evaluate results',
          example: {
            type: 'DATABASE_QUERY',
            connector: 'PostgreSQL',
            query: `
              SELECT COUNT(*) as complaint_count
              FROM complaints
              WHERE customer_id = $1
              AND created_at > NOW() - INTERVAL '30 days'
            `,
            parameters: { customerId: '$event.customer_id' },
            evaluation: {
              resultField: 'complaint_count',
              operator: 'GT',
              value: 5,
            },
          },
        },

        {
          type: 'PATTERN_ANALYSIS',
          description: 'Analyze text for patterns (regex, keywords, NLP indicators)',
          example: {
            type: 'PATTERN_ANALYSIS',
            content: '$event.customer_notes',
            patterns: [
              {
                name: 'SPAM_KEYWORDS',
                type: 'KEYWORD',
                keywords: ['buy now', 'click here', 'limited offer', '$$$'],
              },
              {
                name: 'INAPPROPRIATE_LANGUAGE',
                type: 'REGEX',
                pattern: '/(badword1|badword2|badword3)/gi',
              },
              {
                name: 'URGENCY_KEYWORDS',
                type: 'KEYWORD',
                keywords: ['urgent', 'emergency', 'critical', 'asap', 'now'],
              },
            ],
            evaluation: {
              OR: [
                { pattern: 'SPAM_KEYWORDS', matched: true },
                { pattern: 'INAPPROPRIATE_LANGUAGE', matched: true },
              ],
            },
          },
        },

        {
          type: 'AGGREGATION',
          description: 'Call multiple services in parallel and combine results with logic',
          example: {
            type: 'AGGREGATION',
            sources: [
              {
                name: 'compliance_check',
                type: 'SERVICE_CALL',
                service: {
                  connector: 'HTTP',
                  url: 'http://compliance:8080/check',
                  body: { customerId: '$event.id' },
                },
              },
              {
                name: 'fraud_detection',
                type: 'ML_PREDICTION',
                model: {
                  connector: 'HTTP',
                  url: 'http://ml:8080/fraud',
                  features: { amount: '$event.amount', country: '$event.country' },
                },
              },
              {
                name: 'customer_history',
                type: 'DATABASE_QUERY',
                connector: 'PostgreSQL',
                query: 'SELECT * FROM customer_history WHERE id = $1',
                parameters: { id: '$event.customer_id' },
              },
            ],
            evaluation: {
              type: 'COMPLEX_LOGIC',
              logic: '(compliance_check.score > 80) AND (fraud_detection.probability < 0.5) AND (customer_history.is_trusted == true)',
            },
          },
        },

        {
          type: 'COMPLEX_AND_OR',
          description: 'Combine multiple conditions with AND/OR/NOT logic',
          example: {
            type: 'AND',
            conditions: [
              {
                type: 'OR',
                conditions: [
                  { field: '$event.status', operator: 'EQ', value: 'NEW' },
                  { field: '$event.status', operator: 'EQ', value: 'PENDING' },
                ],
              },
              {
                field: '$event.amount',
                operator: 'GT',
                value: 100000,
              },
              {
                type: 'NOT',
                condition: {
                  field: '$event.is_verified',
                  operator: 'EQ',
                  value: true,
                },
              },
            ],
          },
        },
      ],

      // 🔷 ACTION TYPES (what LLM can do!)
      actionTypes: [
        {
          type: 'CONNECTOR_CALL',
          description: 'Call any connector function',
          example: {
            connector: 'Slack',
            function: 'send_message',
            params: {
              channel: '#alerts',
              text: 'Alert: $event.name - Status: $event.status',
            },
          },
        },

        {
          type: 'CHAINED_ACTIONS',
          description: 'Execute multiple actions sequentially, each can use $result from previous',
          example: {
            actions: [
              {
                sequence: 1,
                connector: 'PostgreSQL',
                function: 'select',
                params: {
                  query: 'SELECT * FROM compliance_rules WHERE customer_id = $1',
                  parameters: { customerId: '$event.id' },
                },
              },
              {
                sequence: 2,
                connector: 'Slack',
                function: 'send_message',
                params: {
                  channel: '#alerts',
                  text: 'Found $result.from.1.length rules for customer $event.name',
                },
              },
            ],
          },
        },

        {
          type: 'CONDITIONAL_ACTION',
          description: 'Execute action only if a condition is true',
          example: {
            condition: '$result.from.1.compliant == false',
            connector: 'Slack',
            function: 'send_message',
            params: {
              channel: '#compliance-alerts',
              text: '🚨 NON-COMPLIANT: $event.name. Reason: $result.from.1.reason',
            },
          },
        },

        {
          type: 'ERROR_HANDLING',
          description: 'Handle errors with retry, timeout, and compensation',
          example: {
            connector: 'PostgreSQL',
            function: 'update',
            params: { table: 'customers', where: { id: '$event.id' }, data: { status: 'FLAGGED' } },
            errorHandling: {
              retries: 3,
              backoffMs: 1000,
              timeoutMs: 5000,
              compensation: {
                connector: 'PostgreSQL',
                function: 'rollback',
                params: { transactionId: '$context.txId' },
              },
            },
          },
        },

        {
          type: 'PARALLEL_ACTIONS',
          description: 'Execute multiple actions in parallel',
          example: {
            parallel: true,
            actions: [
              { connector: 'Slack', function: 'send_message', params: {} },
              { connector: 'PostgreSQL', function: 'update', params: {} },
              { connector: 'Kafka', function: 'produce', params: {} },
            ],
          },
        },
      ],

      // 🔷 CONTEXT VARIABLES (what's available in conditions/actions)
      contextVariables: {
        $event: {
          name: '$event',
          description: 'The event that triggered the rule/task',
          example: {
            trigger: 'ON_CREATE',
            sourceConnector: 'PostgreSQL',
            sourceNode: 'customers',
            data: {
              id: 'cust-123',
              name: 'Paul Dupont',
              email: 'paul@example.com',
              status: 'ACTIVE',
              country: 'FR',
              amount: 150000,
              customer_notes: 'This is spam buy my product',
              created_at: '2026-02-18T12:00:00Z',
            },
            timestamp: '2026-02-18T12:00:00Z',
            userId: 'user-uuid',
          },
        },

        $result: {
          name: '$result',
          description: 'Results from previous actions (in sequence)',
          example: {
            from: {
              1: {
                status: 'success',
                duration: 245,
                data: { compliance_score: 0.45, reason: 'Missing KYC documents' },
              },
              2: {
                status: 'success',
                duration: 340,
                data: { fraud_probability: 0.75, risk_level: 'high' },
              },
            },
          },
        },

        $context: {
          name: '$context',
          description: 'Request-level context and metadata',
          example: {
            userId: 'user-uuid',
            token: 'auth-token-xxx',
            tenantId: 'tenant-uuid',
            timestamp: '2026-02-18T12:00:00Z',
            requestId: 'req-uuid',
            ipAddress: '192.168.1.1',
          },
        },

        $user: {
          name: '$user',
          description: 'Current user information',
          example: {
            id: 'user-uuid',
            email: 'paul@example.com',
            role: 'admin',
            permissions: ['read_postgresql', 'write_slack', 'execute_http'],
            department: 'Compliance',
          },
        },

        $rule: {
          name: '$rule',
          description: 'Current rule information (for rules)',
          example: {
            id: 'rule-uuid',
            name: 'Compliance check on customer creation',
            version: 2,
            createdAt: '2026-02-15T10:00:00Z',
            updatedAt: '2026-02-18T12:00:00Z',
          },
        },
      },

      // 🔷 OPERATORS
      operators: [
        { operator: 'EQ', description: 'Equal', example: "field == 'value'" },
        { operator: 'NE', description: 'Not equal', example: "field != 'value'" },
        { operator: 'GT', description: 'Greater than', example: 'field > 100' },
        { operator: 'GTE', description: 'Greater than or equal', example: 'field >= 100' },
        { operator: 'LT', description: 'Less than', example: 'field < 100' },
        { operator: 'LTE', description: 'Less than or equal', example: 'field <= 100' },
        { operator: 'IN', description: 'In list', example: "field in ['a', 'b', 'c']" },
        { operator: 'NOT_IN', description: 'Not in list', example: "field not in ['a', 'b']" },
        { operator: 'CONTAINS', description: 'String contains', example: "field contains 'substring'" },
        { operator: 'NOT_CONTAINS', description: 'String does not contain', example: "field not contains 'spam'" },
        { operator: 'STARTS_WITH', description: 'String starts with', example: "field starts 'prefix'" },
        { operator: 'ENDS_WITH', description: 'String ends with', example: "field ends '.com'" },
        { operator: 'REGEX', description: 'Matches regex', example: "field matches /pattern/gi" },
        { operator: 'BETWEEN', description: 'Between two values', example: 'field between 10 and 100' },
        { operator: 'EXISTS', description: 'Field exists', example: 'field exists' },
        { operator: 'NOT_EXISTS', description: 'Field does not exist', example: 'field not exists' },
        { operator: 'TRUTHY', description: 'Is truthy', example: 'field is truthy' },
        { operator: 'FALSY', description: 'Is falsy', example: 'field is falsy' },
      ],

      // 🔷 TRIGGER TYPES
      triggerTypes: [
        {
          type: 'ON_CREATE',
          description: 'When a new record is created',
          example: { type: 'ON_CREATE', sourceConnector: 'PostgreSQL', sourceNode: 'customers' },
        },
        {
          type: 'ON_UPDATE',
          description: 'When a record is updated',
          example: { type: 'ON_UPDATE', sourceConnector: 'PostgreSQL', sourceNode: 'customers' },
        },
        {
          type: 'ON_DELETE',
          description: 'When a record is deleted',
          example: { type: 'ON_DELETE', sourceConnector: 'PostgreSQL', sourceNode: 'customers' },
        },
        {
          type: 'ON_SCHEDULE',
          description: 'On a cron schedule',
          example: { type: 'ON_SCHEDULE', schedule: '0 9 * * *' },
        },
        {
          type: 'ON_WEBHOOK',
          description: 'When webhook is received',
          example: { type: 'ON_WEBHOOK', endpoint: '/events/custom' },
        },
        {
          type: 'ON_STATE_CHANGE',
          description: 'When state machine transitions',
          example: { type: 'ON_STATE_CHANGE', from: 'DRAFT', to: 'ACTIVE' },
        },
        {
          type: 'ON_ERROR',
          description: 'When an action fails',
          example: { type: 'ON_ERROR', action: 'send_slack_message' },
        },
      ],

      // 🔷 RESILIENCE PATTERNS
      resiliencePatterns: [
        {
          type: 'RETRY',
          description: 'Retry failed actions with exponential backoff',
          example: {
            retries: 3,
            backoffMs: 1000,
            maxBackoffMs: 30000,
          },
        },
        {
          type: 'TIMEOUT',
          description: 'Set timeout for service calls',
          example: {
            timeoutMs: 5000,
          },
        },
        {
          type: 'CIRCUIT_BREAKER',
          description: 'Pause rule after consecutive failures',
          example: {
            failureThreshold: 5,
            pauseMs: 300000,
          },
        },
        {
          type: 'FALLBACK',
          description: 'Execute fallback action on error',
          example: {
            fallbackValue: false,
            fallbackAction: { connector: 'Slack', function: 'send_message' },
          },
        },
        {
          type: 'COMPENSATION',
          description: 'Undo changes on error',
          example: {
            compensation: { connector: 'PostgreSQL', function: 'rollback' },
          },
        },
        {
          type: 'DEBOUNCE',
          description: 'Prevent rule from firing too frequently',
          example: {
            windowMs: 60000,
            maxTriggers: 1,
          },
        },
      ],

      // 🔷 PERFORMANCE HINTS
      performanceHints: {
        parallelEvaluation: 'Multiple conditions can be evaluated in parallel for speed',
        caching: 'Results are cached during rule execution to avoid duplicate calls',
        asyncActions: 'Actions execute sequentially by default, but can be marked parallel: true',
        timeoutDefaults: 'Default timeout is 5000ms per service call - adjust if needed',
        retryDefaults: 'Default 3 retries with exponential backoff starting at 1000ms',
        batch: 'Use AGGREGATION type to batch multiple service calls',
        index: 'Database queries are indexed on common fields for performance',
      },

      // 🔷 EXAMPLE RULES (showing the possibilities!)
      exampleRules: [
        {
          name: 'Comprehensive Compliance Check',
          description: 'Check compliance from multiple sources with error handling',
          complexity: 'complex',
          rule: {
            trigger: { type: 'ON_CREATE', sourceConnector: 'PostgreSQL', sourceNode: 'customers' },
            conditions: {
              type: 'AGGREGATION',
              sources: [
                {
                  name: 'compliance_check',
                  type: 'SERVICE_CALL',
                  service: {
                    connector: 'HTTP',
                    url: 'http://compliance:8080/check',
                    body: { customerId: '$event.id' },
                  },
                  evaluation: { resultField: 'score', operator: 'LT', value: 0.8 },
                },
                {
                  name: 'fraud_detection',
                  type: 'ML_PREDICTION',
                  model: {
                    connector: 'HTTP',
                    url: 'http://ml:8080/fraud',
                    features: { amount: '$event.amount' },
                  },
                  evaluation: { resultField: 'probability', operator: 'GT', value: 0.7 },
                },
              ],
              evaluation: {
                logic: '(compliance_check.score < 0.8) OR (fraud_detection.probability > 0.7)',
              },
            },
            actions: [
              {
                sequence: 1,
                connector: 'Slack',
                function: 'send_message',
                params: {
                  channel: '#alerts',
                  text: '🚨 ALERT: Customer $event.name - Compliance: $result.from.1.score, Fraud: $result.from.2.probability',
                },
              },
              {
                sequence: 2,
                connector: 'PostgreSQL',
                function: 'update',
                params: {
                  table: 'customers',
                  where: { id: '$event.id' },
                  data: { status: 'FLAGGED_FOR_REVIEW' },
                },
              },
            ],
          },
        },

        {
          name: 'Text Moderation with LLM',
          description: 'Analyze customer notes for inappropriate content',
          complexity: 'medium',
          rule: {
            trigger: { type: 'ON_CREATE', sourceConnector: 'PostgreSQL', sourceNode: 'customer_feedback' },
            conditions: {
              type: 'LLM_ANALYSIS',
              content: '$event.customer_notes',
              analysis: {
                prompt: 'Is this text inappropriate, spam, or urgent? Return JSON: {is_inappropriate, is_spam, is_urgent}',
                model: 'gpt-4',
              },
              evaluation: {
                OR: [
                  { resultField: 'is_inappropriate', operator: 'EQ', value: true },
                  { resultField: 'is_spam', operator: 'EQ', value: true },
                ],
              },
            },
            actions: [
              {
                sequence: 1,
                condition: '$result.from.1.is_inappropriate == true',
                connector: 'Slack',
                function: 'send_message',
                params: { channel: '#moderation', text: '⚠️ Inappropriate content: $event.customer_notes' },
              },
            ],
          },
        },

        {
          name: 'Pattern Detection',
          description: 'Detect spam and urgency keywords',
          complexity: 'simple',
          rule: {
            trigger: { type: 'ON_CREATE', sourceConnector: 'PostgreSQL', sourceNode: 'messages' },
            conditions: {
              type: 'PATTERN_ANALYSIS',
              content: '$event.text',
              patterns: [
                { name: 'SPAM', type: 'KEYWORD', keywords: ['buy', 'click', 'limited offer'] },
                { name: 'URGENT', type: 'KEYWORD', keywords: ['urgent', 'emergency', 'asap'] },
              ],
              evaluation: { OR: [{ pattern: 'SPAM', matched: true }] },
            },
            actions: [
              {
                connector: 'Slack',
                function: 'send_message',
                params: { channel: '#spam-alerts', text: 'Spam detected: $event.text' },
              },
            ],
          },
        },
      ],

      // 🔷 USER CAPABILITIES & LIMITS
      userCapabilities: {
        maxConditionsPerRule: 100,
        maxActionsPerRule: 50,
        maxServiceCallsPerRule: 10,
        maxExecutionTimeMs: 30000,
        allowedConnectors: allConnectors.map(c => c.name),
        allowedLLMModels: ['gpt-4', 'gpt-3.5-turbo', 'claude-2'],
        canUseMachineLearning: true,
        canCallExternalApis: true,
        canQueryDatabase: true,
        canUseErrorHandling: true,
      },

      // 🔷 BEST PRACTICES
      bestPractices: [
        '✅ Use SERVICE_CALL for external validation (compliance, fraud, etc.)',
        '✅ Use LLM_ANALYSIS for complex text understanding',
        '✅ Use ML_PREDICTION for probability-based decisions (0-1 scores)',
        '✅ Use AGGREGATION to combine multiple checks in parallel',
        '✅ Always include error handling (retry, timeout, compensation)',
        '✅ Use PATTERN_ANALYSIS for simple keyword/regex detection first (faster than LLM)',
        '✅ Cache results when possible using $result.from.X references',
        '✅ Add debounce to prevent rule from firing too frequently',
        '✅ Keep conditions simple but combine with AND/OR for complexity',
        '✅ Use $event, $result, $context, $user in params for dynamic values',
        '✅ Test complex rules with example data before deploying',
        '✅ Monitor rule execution stats to detect issues',
        '✅ Use conditional actions to avoid unnecessary processing',
        '✅ Chain actions sequentially to use results from previous steps',
      ],
    };
  }

  /**
   * Build context specifically for creating RULES (Module 3)
   */
  async buildRuleContext(userId: string): Promise<EnrichedLLMContext> {
    const fullContext = await this.buildEnrichedContext(userId);

    // Filter for rule-specific capabilities
    return {
      ...fullContext,
      exampleRules: fullContext.exampleRules.filter(r => r.complexity === 'medium' || r.complexity === 'complex'),
      systemInfo: {
        ...fullContext.systemInfo,
        capabilities: [
          'Event-driven automation',
          'Complex condition evaluation',
          'Service integration',
          'Error handling and retry',
          'Parallel execution',
          'Audit logging',
        ],
      },
    };
  }

  /**
   * Build context specifically for creating TASKS (Module 2)
   */
  async buildTaskContext(userId: string): Promise<EnrichedLLMContext> {
    const fullContext = await this.buildEnrichedContext(userId);

    // Filter for task-specific capabilities
    return {
      ...fullContext,
      exampleRules: fullContext.exampleRules.map(r => ({
        ...r,
        name: r.name.replace('rule', 'task'),
        description: r.description.replace('rule', 'task'),
      })),
      actionTypes: fullContext.actionTypes.filter(a => a.type !== 'ERROR_HANDLING'),
      systemInfo: {
        ...fullContext.systemInfo,
        capabilities: [
          'Natural language understanding',
          'One-time task execution',
          'Complex action chaining',
          'Integration with any connector',
          'Error handling',
          'Immediate execution',
        ],
      },
    };
  }

  /**
   * Export context as formatted JSON for external consumption
   */
  async exportContextAsJSON(context: EnrichedLLMContext): Promise<string> {
    return JSON.stringify(context, null, 2);
  }

  // ============================================================================
  // 🆕 AGGREGATED CONTEXT: Includes all registered providers (extensible!)
  // ============================================================================

  /**
   * 🆕 Build AGGREGATED context from ALL registered providers
   * This includes:
   * - Core Tasks module
   * - Analytics module (if registered)
   * - Notifications module (if registered)
   * - Workflow module (if registered)
   * - Any other custom module
   */
  async buildAggregatedContext(userId: string): Promise<any> {
    const baseContext = await this.buildEnrichedContext(userId);

    // Add provider information
    const providersInfo = this.getProvidersInfo();
    const allConditionTypes = this.providerRegistry.getAllConditionTypes();
    const allActionTypes = this.providerRegistry.getAllActionTypes();
    const allContextVars = this.providerRegistry.getAllContextVariables();
    const allTriggers = this.providerRegistry.getAllTriggerTypes();
    const allResilience = this.providerRegistry.getAllResiliencePatterns();
    const allExamples = this.providerRegistry.getAllExamples();
    const allCapabilities = this.providerRegistry.getAggregatedCapabilities();
    const allPractices = this.providerRegistry.getAllBestPractices();

    return {
      // Include original context
      ...baseContext,

      // 🆕 Add provider information
      providers: {
        registered: providersInfo,
        count: providersInfo.length,
        descriptions: providersInfo.map(p => `${p.displayName} (${p.providerId})`),
      },

      // 🆕 Aggregated extensions by provider
      extensionsByProvider: {
        conditionTypes: allConditionTypes,
        actionTypes: allActionTypes,
        contextVariables: allContextVars,
        triggerTypes: allTriggers,
        resiliencePatterns: allResilience,
        examples: allExamples,
      },

      // 🆕 Flattened view: All extensions merged
      allExtensions: {
        conditions: Object.values(allConditionTypes).flat(),
        actions: Object.values(allActionTypes).flat(),
        contextVariables: Object.values(allContextVars).flat(),
        triggers: Object.values(allTriggers).flat(),
        resiliencePatterns: Object.values(allResilience).flat(),
      },

      // 🆕 Capabilities from all providers
      aggregatedCapabilities: allCapabilities,

      // 🆕 Best practices from all providers
      allBestPractices: allPractices,

      // Metadata
      metadata: {
        buildTime: new Date().toISOString(),
        providersCount: providersInfo.length,
        totalConditionTypes: Object.values(allConditionTypes).flat().length,
        totalActionTypes: Object.values(allActionTypes).flat().length,
        totalContextVariables: Object.values(allContextVars).flat().length,
        totalTriggerTypes: Object.values(allTriggers).flat().length,
      },
    };
  }

  /**
   * 🆕 Get context extended by specific provider
   * Useful when you want context specific to one module
   * Example: Get Analytics-specific context
   */
  async getProviderSpecificContext(userId: string, providerId: string): Promise<any> {
    const baseContext = await this.buildEnrichedContext(userId);
    const provider = this.providerRegistry.getProvider(providerId);

    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }

    return {
      provider: {
        id: provider.providerId,
        name: provider.displayName,
        version: provider.version,
        description: provider.description,
      },
      baseContext,
      providerContext: {
        conditionTypes: provider.getConditionTypes?.(),
        actionTypes: provider.getActionTypes?.(),
        contextVariables: provider.getContextVariables?.(),
        triggerTypes: provider.getTriggerTypes?.(),
        resiliencePatterns: provider.getResiliencePatterns?.(),
        examples: provider.getExamples?.(),
        capabilities: provider.getCapabilities?.(),
        bestPractices: provider.getBestPractices?.(),
      },
    };
  }

  /**
   * 🆕 Export aggregated context as JSON
   */
  async exportAggregatedContextJSON(userId: string): Promise<string> {
    const context = await this.buildAggregatedContext(userId);
    return JSON.stringify(context, null, 2);
  }

  /**
   * 🆕 Export provider-specific context as JSON
   */
  async exportProviderSpecificContextJSON(userId: string, providerId: string): Promise<string> {
    const context = await this.getProviderSpecificContext(userId, providerId);
    return JSON.stringify(context, null, 2);
  }
}
