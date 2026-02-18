import { Injectable, Logger } from '@nestjs/common';
import {
  ILLMContextProvider,
  ConditionTypeDefinition,
  ActionTypeDefinition,
  ContextVariableDefinition,
  TriggerTypeDefinition,
  ResiliencePatternDefinition,
  ExampleDefinition,
} from './llm-context-provider.interface';

/**
 * Workflow Module Provider
 * Orchestration and workflow execution capabilities
 * Handles complex multi-step processes with branching, error handling, and compensation
 */
@Injectable()
export class WorkflowProvider implements ILLMContextProvider {
  private readonly logger = new Logger(WorkflowProvider.name);

  readonly providerId = 'workflow-module';
  readonly displayName = 'Workflow Module';
  readonly version = '1.0.0';
  readonly description =
    'Enterprise-grade workflow orchestration with branching, compensation, and advanced error handling';

  // 🔷 FLEXIBLE WORKFLOW EXECUTION TYPES
  private readonly supportedExecutionModes = ['sequential', 'parallel', 'conditional', 'dynamic'];
  private readonly supportedCompensationStrategies = ['undo', 'rollback', 'manual', 'none'];

  constructor() {
    this.logger.log('Workflow Provider initialized');
    this.logger.log(`Execution modes: ${this.supportedExecutionModes.join(', ')}`);
    this.logger.log(`Compensation strategies: ${this.supportedCompensationStrategies.join(', ')}`);
  }

  getConditionTypes(): ConditionTypeDefinition[] {
    return [
      {
        type: 'WORKFLOW_STATE',
        description: 'Check current workflow state and properties',
        category: 'STATE',
        example: {
          workflow_id: 'wf_12345',
          state: 'running',
          progress_percent: 45,
          elapsed_seconds: 300,
        },
      },
      {
        type: 'STEP_COMPLETED',
        description: 'Check if a workflow step has completed successfully',
        category: 'WORKFLOW',
        example: {
          step_name: 'data_validation',
          status: 'completed',
          duration_seconds: 15,
          result_summary: 'validated 1000 records',
        },
      },
      {
        type: 'CONDITIONAL_BRANCH',
        description: 'Evaluate condition to determine workflow path',
        category: 'LOGIC',
        example: {
          condition: '$result.records_count > 1000',
          true_path: 'batch_processing',
          false_path: 'direct_processing',
          evaluation_time_ms: 5,
        },
      },
      {
        type: 'PARALLEL_COMPLETION',
        description: 'Check if all parallel steps completed (with timeout)',
        category: 'WORKFLOW',
        example: {
          parallel_step_names: ['fetch_users', 'fetch_products', 'fetch_orders'],
          all_completed: true,
          fastest_ms: 120,
          slowest_ms: 450,
        },
      },
      {
        type: 'ERROR_OCCURRED',
        description: 'Check for errors in current or previous steps',
        category: 'STATE',
        example: {
          check_scope: 'current_step',
          error_type: 'timeout',
          error_count: 1,
          error_severity: 'critical',
        },
      },
    ];
  }

  getActionTypes(): ActionTypeDefinition[] {
    return [
      {
        type: 'EXECUTE_STEP',
        description: 'Execute a single workflow step',
        category: 'WORKFLOW',
        example: {
          step_name: 'validate_data',
          action_connector: 'validation_service',
          action_function: 'validate',
          input_params: { records: 'from_event' },
          timeout_seconds: 60,
          on_failure: 'retry',
        },
        async: true,
      },
      {
        type: 'EXECUTE_PARALLEL',
        description: 'Execute multiple steps in parallel',
        category: 'WORKFLOW',
        example: {
          parallel_steps: [
            { name: 'fetch_users', connector: 'api', function: 'get_users' },
            { name: 'fetch_products', connector: 'api', function: 'get_products' },
            { name: 'fetch_orders', connector: 'api', function: 'get_orders' },
          ],
          max_parallel: 3,
          timeout_seconds: 120,
          aggregation_mode: 'wait_all',
        },
        async: true,
      },
      {
        type: 'CONDITIONAL_ROUTING',
        description: 'Route workflow to different paths based on conditions',
        category: 'COMPUTE',
        example: {
          condition: '$previous_result.count > 100',
          true_path: 'heavy_processing',
          false_path: 'light_processing',
          else_path: 'error_handling',
          evaluate_frequency: 'once',
        },
        async: false,
      },
      {
        type: 'EXECUTE_COMPENSATION',
        description: 'Execute compensation/rollback logic if workflow fails',
        category: 'WORKFLOW',
        example: {
          compensation_steps: [
            { name: 'revert_db_changes', connector: 'database', function: 'rollback' },
            { name: 'notify_users', connector: 'notifications', function: 'send_alert' },
            { name: 'cleanup_temp_files', connector: 'storage', function: 'delete_temp' },
          ],
          execution_order: 'reverse',
          stop_on_first_error: false,
        },
        async: true,
      },
      {
        type: 'WORKFLOW_DECISION',
        description: 'Make dynamic decisions based on complex logic and context',
        category: 'COMPUTE',
        example: {
          decision_rules: [
            { condition: '$priority == high', action: 'escalate_to_vip_queue' },
            { condition: '$error_count > 3', action: 'switch_strategy' },
            { condition: '$elapsed_minutes > 30', action: 'notify_admin' },
          ],
          default_action: 'continue_normal_flow',
          log_analytics: true,
        },
        async: false,
      },
    ];
  }

  getContextVariables(): Record<string, ContextVariableDefinition> {
    return {
      workflow_state: {
        name: 'workflow_state',
        module: 'workflow-module',
        description: 'Current workflow execution state and metadata',
        type: 'object',
        isReadOnly: true,
        example: {
          workflow_id: 'wf_abc123',
          workflow_name: 'order_processing',
          current_step: 'validation',
          current_step_index: 2,
          total_steps: 5,
          status: 'running',
          progress_percent: 40,
          started_at: '2026-02-18T12:00:00Z',
          elapsed_seconds: 300,
          estimated_remaining_seconds: 450,
        },
      },
      step_context: {
        name: 'step_context',
        module: 'workflow-module',
        description: 'Context and result of current step execution',
        type: 'object',
        isReadOnly: true,
        example: {
          step_name: 'data_fetch',
          step_index: 1,
          status: 'completed',
          result: { records_fetched: 5000, latency_ms: 250 },
          duration_seconds: 1.5,
          retries: 0,
          tags: ['fetch', 'api_call'],
        },
      },
      parallel_results: {
        name: 'parallel_results',
        module: 'workflow-module',
        description: 'Results from parallel step execution',
        type: 'object',
        isReadOnly: true,
        example: {
          completed_steps: ['fetch_users', 'fetch_products'],
          failed_steps: [],
          pending_steps: ['fetch_orders'],
          results: {
            fetch_users: { count: 1200, latency_ms: 180 },
            fetch_products: { count: 3500, latency_ms: 220 },
          },
        },
      },
      workflow_variables: {
        name: 'workflow_variables',
        module: 'workflow-module',
        description: 'User-defined variables and state maintained across steps',
        type: 'object',
        isReadOnly: false,
        example: {
          total_records: 0,
          error_count: 0,
          batch_size: 100,
          current_batch: 0,
          custom_flags: { requires_review: false, is_priority: true },
        },
      },
      error_context: {
        name: 'error_context',
        module: 'workflow-module',
        description: 'Error information and handling context',
        type: 'object',
        isReadOnly: true,
        example: {
          has_errors: false,
          error_count: 0,
          last_error: null,
          error_history: [],
          compensation_available: true,
          can_retry: true,
        },
      },
    };
  }

  getTriggerTypes(): TriggerTypeDefinition[] {
    return [
      {
        type: 'ON_WORKFLOW_START',
        description: 'Fired when workflow execution begins',
        module: 'workflow-module',
        example: {
          workflow_id: 'wf_xyz789',
          workflow_name: 'data_pipeline',
          triggered_by: 'scheduler',
          timestamp: '2026-02-18T12:00:00Z',
        },
      },
      {
        type: 'ON_STEP_COMPLETE',
        description: 'Fired when a step completes (success or failure)',
        module: 'workflow-module',
        example: {
          step_name: 'validation',
          status: 'completed',
          duration_seconds: 5,
          output_records: 1000,
        },
      },
      {
        type: 'ON_PARALLEL_COMPLETE',
        description: 'Fired when all parallel steps complete',
        module: 'workflow-module',
        example: {
          parallel_group_id: 'pg_123',
          completed_steps: 3,
          failed_steps: 0,
          total_duration_seconds: 10,
        },
      },
      {
        type: 'ON_WORKFLOW_COMPLETE',
        description: 'Fired when entire workflow completes (success or failure)',
        module: 'workflow-module',
        example: {
          workflow_id: 'wf_xyz789',
          status: 'completed',
          total_steps_executed: 5,
          total_duration_seconds: 47,
          success_rate_percent: 100,
        },
      },
      {
        type: 'ON_COMPENSATION_TRIGGERED',
        description: 'Fired when workflow compensation/rollback begins',
        module: 'workflow-module',
        example: {
          workflow_id: 'wf_xyz789',
          reason: 'step_failure',
          failed_step: 'processing',
          compensation_steps_count: 3,
        },
      },
    ];
  }

  getResiliencePatterns(): ResiliencePatternDefinition[] {
    return [
      {
        type: 'STEP_RETRY',
        description: 'Automatically retry failed steps with exponential backoff',
        module: 'workflow-module',
        applicableTo: ['EXECUTE_STEP', 'EXECUTE_PARALLEL'],
        example: {
          max_retries: 3,
          initial_delay_seconds: 5,
          backoff_multiplier: 2,
          max_delay_seconds: 60,
          retry_on_errors: ['timeout', 'connection_error'],
          dont_retry_on: ['validation_error'],
        },
      },
      {
        type: 'STEP_TIMEOUT',
        description: 'Enforce timeout limits on step execution',
        module: 'workflow-module',
        applicableTo: ['EXECUTE_STEP', 'EXECUTE_PARALLEL'],
        example: {
          timeout_seconds: 300,
          soft_timeout_seconds: 240,
          on_timeout: 'escalate',
          graceful_shutdown: true,
        },
      },
      {
        type: 'COMPENSATION_STRATEGY',
        description: 'Define how to handle workflow compensation/rollback',
        module: 'workflow-module',
        applicableTo: ['EXECUTE_COMPENSATION'],
        example: {
          strategy: 'reverse',
          stop_on_error: false,
          parallel_compensation: false,
          compensation_timeout_seconds: 600,
        },
      },
      {
        type: 'CIRCUIT_BREAKER',
        description: 'Stop workflow if error rate exceeds threshold',
        module: 'workflow-module',
        applicableTo: ['EXECUTE_STEP', 'EXECUTE_PARALLEL'],
        example: {
          failure_threshold: 5,
          success_threshold: 2,
          timeout_seconds: 300,
          action_on_open: 'fail_workflow',
        },
      },
    ];
  }

  getExamples(): ExampleDefinition[] {
    return [
      {
        name: 'Simple Sequential Workflow',
        description: 'Execute steps one by one in sequence',
        module: 'workflow-module',
        complexity: 'simple',
        category: 'workflow',
        content: {
          condition: {
            type: 'WORKFLOW_STATE',
            params: {
              workflow_id: 'wf_order_processing',
              state: 'ready_to_execute',
            },
          },
          actions: [
            {
              type: 'EXECUTE_STEP',
              params: {
                step_name: 'validate_order',
                action_connector: 'order_service',
                action_function: 'validate',
                timeout_seconds: 30,
              },
            },
            {
              type: 'EXECUTE_STEP',
              params: {
                step_name: 'process_payment',
                action_connector: 'payment_service',
                action_function: 'charge',
                input_params: { amount: 'from_order', method: 'credit_card' },
                timeout_seconds: 60,
              },
            },
            {
              type: 'EXECUTE_STEP',
              params: {
                step_name: 'create_shipment',
                action_connector: 'shipping_service',
                action_function: 'create_shipment',
                timeout_seconds: 45,
              },
            },
          ],
        },
      },
      {
        name: 'Parallel Data Fetch with Conditional Routing',
        description: 'Fetch data in parallel, then route based on results',
        module: 'workflow-module',
        complexity: 'complex',
        category: 'workflow',
        content: {
          condition: {
            type: 'WORKFLOW_STATE',
            params: {
              workflow_id: 'wf_data_aggregation',
              status: 'running',
            },
          },
          actions: [
            {
              type: 'EXECUTE_PARALLEL',
              params: {
                parallel_steps: [
                  { name: 'fetch_customers', connector: 'crm_api', function: 'get_customers' },
                  { name: 'fetch_transactions', connector: 'finance_api', function: 'get_transactions' },
                  { name: 'fetch_interactions', connector: 'support_api', function: 'get_interactions' },
                ],
                max_parallel: 3,
                timeout_seconds: 120,
              },
            },
            {
              type: 'CONDITIONAL_ROUTING',
              params: {
                condition: '$parallel_results.fetch_customers.count > 10000',
                true_path: 'batch_analysis',
                false_path: 'realtime_analysis',
              },
            },
          ],
        },
      },
      {
        name: 'Workflow with Error Handling and Compensation',
        description: 'Execute with compensation logic if any step fails',
        module: 'workflow-module',
        complexity: 'complex',
        category: 'workflow',
        content: {
          condition: {
            type: 'WORKFLOW_STATE',
            params: {
              workflow_id: 'wf_database_migration',
              status: 'starting_migration',
            },
          },
          actions: [
            {
              type: 'EXECUTE_PARALLEL',
              params: {
                parallel_steps: [
                  { name: 'backup_database', connector: 'db_service', function: 'create_backup' },
                  { name: 'validate_target', connector: 'db_service', function: 'validate_target' },
                ],
              },
            },
            {
              type: 'EXECUTE_STEP',
              params: {
                step_name: 'migrate_data',
                action_connector: 'migration_service',
                action_function: 'migrate',
                timeout_seconds: 600,
              },
            },
            {
              type: 'EXECUTE_COMPENSATION',
              params: {
                compensation_steps: [
                  { name: 'restore_backup', connector: 'db_service', function: 'restore_backup' },
                  { name: 'notify_operations', connector: 'notifications', function: 'alert_team' },
                ],
                execution_order: 'reverse',
              },
            },
          ],
        },
      },
      {
        name: 'Dynamic Workflow with Decision Logic',
        description: 'Make real-time decisions based on execution context',
        module: 'workflow-module',
        complexity: 'complex',
        category: 'workflow',
        content: {
          condition: {
            type: 'WORKFLOW_STATE',
            params: {
              workflow_id: 'wf_intelligent_routing',
              status: 'processing',
            },
          },
          actions: [
            {
              type: 'EXECUTE_STEP',
              params: {
                step_name: 'classify_request',
                action_connector: 'ml_service',
                action_function: 'classify',
              },
            },
            {
              type: 'WORKFLOW_DECISION',
              params: {
                decision_rules: [
                  { condition: '$step_context.priority == critical', action: 'fast_track_processing' },
                  { condition: '$step_context.error_count > 2', action: 'escalate_to_admin' },
                  { condition: '$workflow_state.elapsed_seconds > 1800', action: 'timeout_workflow' },
                ],
                default_action: 'continue_normal_flow',
              },
            },
          ],
        },
      },
    ];
  }

  getCapabilities(): Record<string, unknown> {
    return {
      executionModes: this.supportedExecutionModes,
      compensationStrategies: this.supportedCompensationStrategies,
      maxParallelSteps: 10,
      maxWorkflowDepth: 50,
      maxStepsPerWorkflow: 1000,
      maxRetries: 10,
      maxTimeoutSeconds: 3600,
      features: {
        parallel_execution: true,
        conditional_branching: true,
        error_handling: true,
        compensation_logic: true,
        dynamic_decisions: true,
        step_timeouts: true,
        retry_policies: true,
        circuit_breakers: true,
        workflow_variables: true,
        nested_workflows: true,
      },
      supportedLanguages: ['expression', 'javascript', 'python'],
      concurrencyLimits: {
        max_concurrent_workflows: 1000,
        max_concurrent_steps_per_workflow: 10,
        max_parallel_groups: 100,
      },
    };
  }

  getBestPractices(): string[] {
    return [
      'Use EXECUTE_PARALLEL for independent steps to improve performance',
      'Always set appropriate timeouts on steps to prevent hanging workflows',
      'Implement compensation logic for workflows modifying critical data',
      'Use CONDITIONAL_ROUTING to branch based on previous step results',
      'Monitor error_count in workflow_variables to detect patterns',
      'Set retry policies but avoid infinite retry loops',
      'Use workflow_variables to maintain state across steps',
      'Prefer circuit breakers for downstream service failures',
      'Test compensation logic rigorously before production',
      'Log all step transitions for debugging and auditing',
      'Use WORKFLOW_DECISION for complex multi-condition logic',
      'Consider parallel_compensation for reversible operations',
      'Set realistic timeouts based on historical execution times',
      'Use tags in steps for filtering and monitoring',
      'Implement health checks before critical database operations',
    ];
  }
}
