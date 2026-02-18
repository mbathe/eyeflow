/**
 * 🔧 LLM Context Module Extension System
 * 
 * Allows ANY module to register itself and contribute to the LLM context
 * Examples: Analytics module, Notifications module, Workflow module, etc.
 */

/**
 * Interface that any module must implement to contribute to LLM context
 * Think of this as a "plugin interface"
 */
export interface ILLMContextProvider {
  /**
   * Unique identifier for this provider
   * Example: 'analytics-module', 'notifications-module', 'workflow-module'
   */
  providerId: string;

  /**
   * Display name
   */
  displayName: string;

  /**
   * Version of this provider
   */
  version: string;

  /**
   * Describe what this module contributes
   */
  description: string;

  /**
   * Get condition types provided by this module
   * Example: Analytics might provide TREND_ANALYSIS, ANOMALY_DETECTION
   */
  getConditionTypes?(): ConditionTypeDefinition[];

  /**
   * Get action types provided by this module
   * Example: Notifications might provide SEND_EMAIL, SEND_SMS, SEND_PUSH
   */
  getActionTypes?(): ActionTypeDefinition[];

  /**
   * Get context variables provided by this module
   * Example: Analytics might provide $analytics_context, $metrics
   */
  getContextVariables?(): Record<string, ContextVariableDefinition>;

  /**
   * Get trigger types provided by this module
   * Example: Workflow might provide ON_WORKFLOW_COMPLETE, ON_STEP_FAILED
   */
  getTriggerTypes?(): TriggerTypeDefinition[];

  /**
   * Get resilience patterns this module understands
   * Example: Workflow might provide FLOW_RETRY, BRANCH_COMPENSATION
   */
  getResiliencePatterns?(): ResiliencePatternDefinition[];

  /**
   * Get example rules/tasks using this module's capabilities
   */
  getExamples?(): ExampleDefinition[];

  /**
   * Get module-specific capabilities/limits
   */
  getCapabilities?(): Record<string, any>;

  /**
   * Get best practices for using this module
   */
  getBestPractices?(): string[];
}

/**
 * Definitions for all extension types
 */

export interface ConditionTypeDefinition {
  type: string;
  description: string;
  category: 'DATA' | 'SERVICE' | 'ML' | 'LOGIC' | 'STATE' | 'WORKFLOW';
  example: any;
  operators?: string[];
  supportedModels?: string[];
}

export interface ActionTypeDefinition {
  type: string;
  description: string;
  category: 'NOTIFICATION' | 'DATA' | 'WORKFLOW' | 'INTEGRATION' | 'COMPUTE';
  example: any;
  returnType?: string;
  async?: boolean;
}

export interface ContextVariableDefinition {
  name: string;
  module: string;
  description: string;
  type: string;
  example: any;
  isReadOnly: boolean;
  permissions?: string[];
}

export interface TriggerTypeDefinition {
  type: string;
  description: string;
  module: string;
  example: any;
  filterableFields?: string[];
}

export interface ResiliencePatternDefinition {
  type: string;
  description: string;
  module: string;
  example: any;
  applicableTo?: string[]; // Which action types it applies to
}

export interface ExampleDefinition {
  name: string;
  description: string;
  module: string;
  complexity: 'simple' | 'medium' | 'complex';
  category: 'rule' | 'task' | 'workflow';
  content: any;
}

/**
 * Registry for LLM Context Providers
 * Modules register themselves here
 */
export class LLMContextProviderRegistry {
  private providers = new Map<string, ILLMContextProvider>();

  /**
   * Register a provider
   */
  register(provider: ILLMContextProvider): void {
    if (this.providers.has(provider.providerId)) {
      throw new Error(`Provider already registered: ${provider.providerId}`);
    }
    this.providers.set(provider.providerId, provider);
    console.log(`✅ LLM Context Provider registered: ${provider.displayName} v${provider.version}`);
  }

  /**
   * Unregister a provider
   */
  unregister(providerId: string): void {
    this.providers.delete(providerId);
  }

  /**
   * Get specific provider
   */
  getProvider(providerId: string): ILLMContextProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): ILLMContextProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get all condition types from all providers
   */
  getAllConditionTypes(): Record<string, ConditionTypeDefinition[]> {
    const result: Record<string, ConditionTypeDefinition[]> = {};
    for (const provider of this.providers.values()) {
      if (provider.getConditionTypes) {
        result[provider.providerId] = provider.getConditionTypes();
      }
    }
    return result;
  }

  /**
   * Get all action types from all providers
   */
  getAllActionTypes(): Record<string, ActionTypeDefinition[]> {
    const result: Record<string, ActionTypeDefinition[]> = {};
    for (const provider of this.providers.values()) {
      if (provider.getActionTypes) {
        result[provider.providerId] = provider.getActionTypes();
      }
    }
    return result;
  }

  /**
   * Get all context variables from all providers
   */
  getAllContextVariables(): Record<string, Record<string, ContextVariableDefinition>> {
    const result: Record<string, Record<string, ContextVariableDefinition>> = {};
    for (const provider of this.providers.values()) {
      if (provider.getContextVariables) {
        result[provider.providerId] = provider.getContextVariables();
      }
    }
    return result;
  }

  /**
   * Get all triggers from all providers
   */
  getAllTriggerTypes(): Record<string, TriggerTypeDefinition[]> {
    const result: Record<string, TriggerTypeDefinition[]> = {};
    for (const provider of this.providers.values()) {
      if (provider.getTriggerTypes) {
        result[provider.providerId] = provider.getTriggerTypes();
      }
    }
    return result;
  }

  /**
   * Get all resilience patterns from all providers
   */
  getAllResiliencePatterns(): Record<string, ResiliencePatternDefinition[]> {
    const result: Record<string, ResiliencePatternDefinition[]> = {};
    for (const provider of this.providers.values()) {
      if (provider.getResiliencePatterns) {
        result[provider.providerId] = provider.getResiliencePatterns();
      }
    }
    return result;
  }

  /**
   * Get all examples from all providers
   */
  getAllExamples(): Record<string, ExampleDefinition[]> {
    const result: Record<string, ExampleDefinition[]> = {};
    for (const provider of this.providers.values()) {
      if (provider.getExamples) {
        result[provider.providerId] = provider.getExamples();
      }
    }
    return result;
  }

  /**
   * Get aggregated capabilities from all providers
   */
  getAggregatedCapabilities(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const provider of this.providers.values()) {
      if (provider.getCapabilities) {
        result[provider.providerId] = provider.getCapabilities();
      }
    }
    return result;
  }

  /**
   * Get all best practices from all providers
   */
  getAllBestPractices(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const provider of this.providers.values()) {
      if (provider.getBestPractices) {
        result[provider.providerId] = provider.getBestPractices();
      }
    }
    return result;
  }

  /**
   * Get provider info (for debugging/documentation)
   */
  getProvidersInfo(): Array<{
    providerId: string;
    displayName: string;
    version: string;
    description: string;
    capabilities: string[];
  }> {
    return Array.from(this.providers.values()).map(provider => ({
      providerId: provider.providerId,
      displayName: provider.displayName,
      version: provider.version,
      description: provider.description,
      capabilities: [
        provider.getConditionTypes ? 'conditions' : null,
        provider.getActionTypes ? 'actions' : null,
        provider.getContextVariables ? 'context_variables' : null,
        provider.getTriggerTypes ? 'triggers' : null,
        provider.getResiliencePatterns ? 'resilience' : null,
        provider.getExamples ? 'examples' : null,
      ].filter(Boolean) as string[],
    }));
  }
}

/**
 * Example: How a new module would implement this
 * 
 * @Module({
 *   providers: [AnalyticsContextProvider],
 *   exports: [AnalyticsContextProvider],
 * })
 * export class AnalyticsModule {}
 * 
 * @Injectable()
 * export class AnalyticsContextProvider implements ILLMContextProvider {
 *   providerId = 'analytics-module';
 *   displayName = 'Analytics Module';
 *   version = '1.0.0';
 *   description = 'Provides advanced analytics conditions and actions';
 * 
 *   constructor(private registry: LLMContextProviderRegistry) {
 *     this.registry.register(this);
 *   }
 * 
 *   getConditionTypes(): ConditionTypeDefinition[] {
 *     return [
 *       {
 *         type: 'TREND_ANALYSIS',
 *         description: 'Detect trends in time-series data',
 *         category: 'ML',
 *         example: { field: '$event.metric', window: '7d', threshold: 0.15 },
 *       },
 *       {
 *         type: 'ANOMALY_DETECTION',
 *         description: 'Detect anomalies using statistical analysis',
 *         category: 'ML',
 *         example: { field: '$event.value', sensitivity: 2.5 },
 *       },
 *     ];
 *   }
 * 
 *   getActionTypes(): ActionTypeDefinition[] {
 *     return [
 *       {
 *         type: 'GENERATE_REPORT',
 *         description: 'Generate analytics report',
 *         category: 'COMPUTE',
 *         example: { format: 'pdf', recipients: ['admin@example.com'] },
 *       },
 *     ];
 *   }
 * 
 *   getContextVariables(): Record<string, ContextVariableDefinition> {
 *     return {
 *       '$analytics_context': {
 *         name: '$analytics_context',
 *         module: 'analytics',
 *         description: 'Analytics data and metrics',
 *         type: 'object',
 *         example: { trend: 0.45, anomaly_score: 2.1 },
 *         isReadOnly: true,
 *       },
 *     };
 *   }
 * }
 */
