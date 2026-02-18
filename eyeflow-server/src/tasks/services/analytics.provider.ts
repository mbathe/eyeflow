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
 * Analytics Module Provider
 * Extends LLM context with analytics-specific capabilities
 * Provides trend analysis, anomaly detection, and report generation
 */
@Injectable()
export class AnalyticsProvider implements ILLMContextProvider {
  private readonly logger = new Logger(AnalyticsProvider.name);

  readonly providerId = 'analytics-module';
  readonly displayName = 'Analytics Module';
  readonly version = '1.0.0';
  readonly description = 'Advanced analytics capabilities for trend analysis, anomaly detection, and reporting';

  constructor() {
    this.logger.log('Analytics Provider initialized');
  }

  getConditionTypes(): ConditionTypeDefinition[] {
    return [
      {
        type: 'TREND_ANALYSIS',
        description: 'Detect upward or downward trends in metrics over time',
        category: 'DATA',
        example: {
          metric: 'customer_complaints',
          window: '7d',
          threshold: 10,
          direction: 'up',
        },
      },
      {
        type: 'ANOMALY_DETECTION',
        description: 'Identify unusual patterns or outliers in data',
        category: 'ML',
        example: {
          metric: 'response_time_ms',
          baseline: 'statistical',
          sensitivity: 2.5,
          comparison_window: '24h',
        },
      },
      {
        type: 'METRIC_THRESHOLD',
        description: 'Check if metric value crosses a threshold',
        category: 'DATA',
        example: {
          metric: 'error_rate',
          operator: '>',
          threshold: 0.05,
          duration: '5m',
        },
      },
      {
        type: 'CORRELATION_ANALYSIS',
        description: 'Check correlation between two metrics',
        category: 'ML',
        example: {
          metric1: 'cpu_usage',
          metric2: 'request_latency',
          correlation_threshold: 0.7,
          window: '1h',
        },
      },
      {
        type: 'PERCENTILE_CHECK',
        description: 'Check if metric is in certain percentile',
        category: 'DATA',
        example: {
          metric: 'response_time_ms',
          percentile: 95,
          value: 500,
          operator: '<',
        },
      },
    ];
  }

  getActionTypes(): ActionTypeDefinition[] {
    return [
      {
        type: 'GENERATE_REPORT',
        description: 'Generate analytics report and save or send',
        category: 'DATA',
        example: {
          report_type: 'trend_summary',
          metrics: ['customer_complaints', 'resolution_time'],
          period: '7d',
          format: 'pdf',
          recipients: ['ops-team@company.com'],
        },
        async: true,
      },
      {
        type: 'ALERT_ON_ANOMALY',
        description: 'Create alert when anomaly is detected',
        category: 'NOTIFICATION',
        example: {
          alert_level: 'warning',
          channels: ['email', 'slack'],
          message_template: 'anomaly_detected',
          escalate_if: 'not_acknowledged_30m',
        },
        async: true,
      },
      {
        type: 'TRIGGER_INVESTIGATION',
        description: 'Trigger automated investigation workflow',
        category: 'WORKFLOW',
        example: {
          investigation_type: 'root_cause_analysis',
          related_metrics: ['*'],
          depth: 'deep',
          timeout_minutes: 10,
        },
        async: true,
      },
      {
        type: 'STORE_BASELINE',
        description: 'Record current metric values as baseline for future comparison',
        category: 'DATA',
        example: {
          metrics: ['response_time', 'error_rate', 'throughput'],
          baseline_name: 'production_baseline_feb_2026',
          tags: ['production', 'validated'],
        },
        async: false,
      },
      {
        type: 'APPLY_AUTO_REMEDIATION',
        description: 'Apply automated remediation based on detected issue',
        category: 'INTEGRATION',
        example: {
          remediation_type: 'scale_up',
          target_service: 'api_server',
          scale_percentage: 50,
          max_instances: 10,
        },
        async: true,
      },
    ];
  }

  getContextVariables(): Record<string, ContextVariableDefinition> {
    return {
      analytics: {
        name: 'analytics',
        module: 'analytics-module',
        description: 'Current analytics context and calculations',
        type: 'object',
        isReadOnly: true,
        example: {
          latest_trends: {
            customer_complaints: { direction: 'up', change_percent: 15 },
            resolution_time: { direction: 'down', change_percent: -8 },
          },
          anomalies: [
            { metric: 'response_time_ms', deviation: 3.2, severity: 'high' },
          ],
          baselines: {
            response_time_ms: 150,
            error_rate: 0.02,
          },
        },
      },
      metrics: {
        name: 'metrics',
        module: 'analytics-module',
        description: 'Real-time metric values',
        type: 'object',
        isReadOnly: true,
        example: {
          response_time_ms: 180,
          error_rate: 0.035,
          throughput_rps: 1250,
          cpu_usage: 65,
          memory_usage: 72,
        },
      },
      metric_history: {
        name: 'metric_history',
        module: 'analytics-module',
        description: 'Historical metric data for the specified window',
        type: 'array',
        isReadOnly: true,
        example: [
          { timestamp: '2026-02-18T12:00:00Z', value: 150 },
          { timestamp: '2026-02-18T12:01:00Z', value: 155 },
          { timestamp: '2026-02-18T12:02:00Z', value: 160 },
        ],
      },
      anomalies: {
        name: 'anomalies',
        module: 'analytics-module',
        description: 'Detected anomalies and deviations',
        type: 'array',
        isReadOnly: true,
        example: [
          {
            metric: 'response_time',
            detected_at: '2026-02-18T12:30:00Z',
            value: 450,
            expected: 150,
            deviation_sigma: 2.8,
            severity: 'warning',
          },
        ],
      },
      correlation_pairs: {
        name: 'correlation_pairs',
        module: 'analytics-module',
        description: 'Correlated metric pairs',
        type: 'array',
        isReadOnly: true,
        example: [
          {
            metric1: 'cpu_usage',
            metric2: 'response_time',
            correlation: 0.82,
            lag_ms: 500,
          },
        ],
      },
    };
  }

  getTriggerTypes(): TriggerTypeDefinition[] {
    return [
      {
        type: 'ON_TREND_DETECTED',
        description: 'Fired when a significant trend is detected in metrics',
        module: 'analytics-module',
        example: {
          metric: 'customer_complaints',
          trend_direction: 'up',
          change_percent: 15,
        },
      },
      {
        type: 'ON_ANOMALY_DETECTED',
        description: 'Fired when anomaly is detected in metric',
        module: 'analytics-module',
        example: {
          metric: 'response_time_ms',
          deviation_sigma: 3.5,
          anomaly_score: 0.92,
        },
      },
      {
        type: 'ON_THRESHOLD_EXCEEDED',
        description: 'Fired when metric crosses configured threshold',
        module: 'analytics-module',
        example: {
          metric: 'error_rate',
          threshold: 0.05,
          current_value: 0.067,
          duration_seconds: 300,
        },
      },
      {
        type: 'ON_BASELINE_DEVIATION',
        description: 'Fired when metric deviates from established baseline',
        module: 'analytics-module',
        example: {
          metric: 'throughput_rps',
          baseline: 1000,
          current: 750,
          deviation_percent: -25,
        },
      },
      {
        type: 'ON_CORRELATION_FOUND',
        description: 'Fired when high correlation between metrics is discovered',
        module: 'analytics-module',
        example: {
          metric1: 'cpu_usage',
          metric2: 'request_latency',
          correlation_coefficient: 0.87,
        },
      },
    ];
  }

  getResiliencePatterns(): ResiliencePatternDefinition[] {
    return [
      {
        type: 'METRIC_RETRY_BACKOFF',
        description: 'Retry metric collection with exponential backoff',
        module: 'analytics-module',
        applicableTo: ['GENERATE_REPORT', 'TRIGGER_INVESTIGATION'],
        example: {
          initial_delay_ms: 100,
          max_delay_ms: 5000,
          backoff_multiplier: 2,
          max_retries: 5,
        },
      },
      {
        type: 'ANALYTICS_CIRCUIT_BREAKER',
        description: 'Stop analytics processing if error rate too high',
        module: 'analytics-module',
        applicableTo: ['TRIGGER_INVESTIGATION', 'APPLY_AUTO_REMEDIATION'],
        example: {
          failure_threshold: 10,
          success_threshold: 5,
          timeout_seconds: 60,
        },
      },
      {
        type: 'METRIC_FALLBACK',
        description: 'Use cached or historical metric if live collection fails',
        module: 'analytics-module',
        applicableTo: ['GENERATE_REPORT', 'ALERT_ON_ANOMALY'],
        example: {
          max_age_seconds: 300,
          use_last_known: true,
          degraded_mode: 'reduced_precision',
        },
      },
      {
        type: 'ANOMALY_SUPPRESSION',
        description: 'Suppress repeated anomaly alerts during storms',
        module: 'analytics-module',
        applicableTo: ['ALERT_ON_ANOMALY'],
        example: {
          burst_threshold: 5,
          suppression_window_minutes: 15,
          severity_minimum: 'warning',
        },
      },
    ];
  }

  getExamples(): ExampleDefinition[] {
    return [
      {
        name: 'Detect and Alert on Spike',
        description: 'Automatically detect spike in complaint volume and alert team',
        module: 'analytics-module',
        complexity: 'medium',
        category: 'rule',
        content: {
          condition: {
            type: 'TREND_ANALYSIS',
            params: {
              metric: 'customer_complaints',
              window: '7d',
              threshold: 25,
              direction: 'up',
            },
          },
          actions: [
            {
              type: 'ALERT_ON_ANOMALY',
              params: {
                alert_level: 'warning',
                channels: ['email', 'slack'],
                message_template: 'spike_detected',
              },
            },
            {
              type: 'GENERATE_REPORT',
              params: {
                report_type: 'trend_summary',
                metrics: ['customer_complaints', 'resolution_time'],
                period: '7d',
                format: 'json',
              },
            },
          ],
        },
      },
      {
        name: 'Auto-scale on Load',
        description: 'Scale up service when response time anomaly detected',
        module: 'analytics-module',
        complexity: 'complex',
        category: 'workflow',
        content: {
          condition: {
            type: 'ANOMALY_DETECTION',
            params: {
              metric: 'response_time_ms',
              baseline: 'statistical',
              sensitivity: 2.5,
              comparison_window: '24h',
            },
          },
          actions: [
            {
              type: 'TRIGGER_INVESTIGATION',
              params: {
                investigation_type: 'root_cause_analysis',
                related_metrics: ['cpu_usage', 'memory_usage', 'throughput_rps'],
                depth: 'medium',
                timeout_minutes: 5,
              },
            },
            {
              type: 'APPLY_AUTO_REMEDIATION',
              params: {
                remediation_type: 'scale_up',
                target_service: 'api_server',
                scale_percentage: 50,
                max_instances: 10,
              },
            },
          ],
        },
      },
      {
        name: 'Establish Baseline',
        description: 'Record current healthy state as baseline for future comparisons',
        module: 'analytics-module',
        complexity: 'simple',
        category: 'task',
        content: {
          condition: {
            type: 'METRIC_THRESHOLD',
            params: {
              metric: 'error_rate',
              operator: '<',
              threshold: 0.02,
              duration: '1h',
            },
          },
          actions: [
            {
              type: 'STORE_BASELINE',
              params: {
                metrics: ['response_time', 'error_rate', 'throughput_rps', 'cpu_usage'],
                baseline_name: 'healthy_state_snapshot',
                tags: ['production', 'validated', 'feb2026'],
              },
            },
          ],
        },
      },
    ];
  }

  getCapabilities(): Record<string, unknown> {
    return {
      maxTrendsPerRule: 5,
      maxAnomaliesPerQuery: 100,
      maxMetricsPerAnalysis: 20,
      maxCorrelationPairs: 50,
      maxHistoryWindow: '90d',
      supportedAggregations: ['mean', 'median', 'p95', 'p99', 'max', 'min'],
      supportedBaselines: ['statistical', 'ml', 'historical'],
      reportFormats: ['pdf', 'json', 'csv', 'html'],
      alertChannels: ['email', 'slack', 'pagerduty', 'webhook'],
      remediationTypes: ['scale_up', 'scale_down', 'restart', 'failover', 'drain'],
    };
  }

  getBestPractices(): string[] {
    return [
      'Use TREND_ANALYSIS for windows of 7+ days for stable trend detection',
      'Set ANOMALY_DETECTION sensitivity between 2.0-3.0 for most use cases',
      'Always establish baselines during known healthy periods',
      'Combine metric analysis with correlation detection for root cause identification',
      'Use ALERT_ON_ANOMALY with multiple channels for critical metrics',
      'Store baselines after each major deployment or configuration change',
      'Set anomaly suppression during known deployment windows',
      'Use percentile checks (p95, p99) rather than mean for latency metrics',
      'Correlate infrastructure metrics (CPU, memory) with application metrics',
      'Review and adjust sensitivity settings quarterly based on business requirements',
      'Use TRIGGER_INVESTIGATION for automatic root cause analysis',
      'Apply AUTO_REMEDIATION only to well-tested, reversible operations initially',
    ];
  }
}
