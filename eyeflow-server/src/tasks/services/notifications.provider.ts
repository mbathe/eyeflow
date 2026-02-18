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
 * Notifications Module Provider
 * Flexible notification system supporting multiple channels
 * Easily extensible to add new channels (Email, SMS, Slack, Teams, etc.)
 */
@Injectable()
export class NotificationsProvider implements ILLMContextProvider {
  private readonly logger = new Logger(NotificationsProvider.name);

  readonly providerId = 'notifications-module';
  readonly displayName = 'Notifications Module';
  readonly version = '1.0.0';
  readonly description =
    'Flexible multi-channel notification system with delivery tracking and escalation';

  // 🔷 FLEXIBLE CHANNEL REGISTRY
  // Add new channels here - no core changes needed!
  private readonly supportedChannels = [
    'email',
    'slack',
    'sms',
    'pagerduty',
    'webhook',
    'teams',
    'discord',
    'telegram',
  ];

  constructor() {
    this.logger.log('Notifications Provider initialized');
    this.logger.log(`Supported channels: ${this.supportedChannels.join(', ')}`);
  }

  getConditionTypes(): ConditionTypeDefinition[] {
    return [
      {
        type: 'NOTIFICATION_DELIVERY_STATUS',
        description: 'Check if notification was successfully delivered',
        category: 'DATA',
        example: {
          notification_id: 'notif_12345',
          channel: 'email',
          status: 'delivered',
          delivered_at: '2026-02-18T12:00:00Z',
        },
      },
      {
        type: 'CHANNEL_AVAILABILITY',
        description: 'Check if notification channel is available and configured',
        category: 'SERVICE',
        example: {
          channel: 'slack',
          is_available: true,
          is_configured: true,
          last_health_check: '2026-02-18T11:59:00Z',
        },
      },
      {
        type: 'RECIPIENT_STATUS',
        description: 'Check recipient subscription/opt-in status for a channel',
        category: 'DATA',
        example: {
          recipient_id: 'user_456',
          channel: 'email',
          is_subscribed: true,
          is_blacklisted: false,
          opt_in_timestamp: '2025-01-01T00:00:00Z',
        },
      },
      {
        type: 'NOTIFICATION_QUEUE_DEPTH',
        description: 'Check pending notification count per channel',
        category: 'SERVICE',
        example: {
          channel: 'sms',
          pending_count: 45,
          max_queue_size: 1000,
          queue_utilization_percent: 4.5,
        },
      },
      {
        type: 'DELIVERY_LATENCY',
        description: 'Check average delivery time for a channel',
        category: 'DATA',
        example: {
          channel: 'slack',
          avg_latency_ms: 250,
          p95_latency_ms: 800,
          p99_latency_ms: 2500,
        },
      },
    ];
  }

  getActionTypes(): ActionTypeDefinition[] {
    return [
      {
        type: 'SEND_NOTIFICATION',
        description: 'Send notification via flexible channel selector',
        category: 'NOTIFICATION',
        example: {
          channel: 'email',
          recipients: ['user@company.com'],
          subject: 'Alert: High CPU Usage',
          body: 'CPU usage exceeded 80%',
          priority: 'high',
          tags: ['alert', 'infrastructure'],
        },
        async: true,
      },
      {
        type: 'SEND_BATCH_NOTIFICATIONS',
        description: 'Send notifications to multiple recipients efficiently',
        category: 'NOTIFICATION',
        example: {
          channel: 'email',
          recipients: ['user1@company.com', 'user2@company.com', 'user3@company.com'],
          template: 'incident_alert',
          template_vars: {
            incident_id: 'INC-789',
            severity: 'critical',
          },
          batch_size: 100,
          rate_limit_per_second: 50,
        },
        async: true,
      },
      {
        type: 'SEND_WITH_ESCALATION',
        description: 'Send notification with escalation chain (fallback channels)',
        category: 'NOTIFICATION',
        example: {
          primary_channel: 'slack',
          escalation_channels: ['email', 'sms'],
          escalation_delay_minutes: [5, 15],
          recipients: ['ops-team'],
          message: 'Critical system failure',
          acknowledgment_required: true,
        },
        async: true,
      },
      {
        type: 'TRACK_DELIVERY',
        description: 'Track notification delivery status for monitoring',
        category: 'DATA',
        example: {
          notification_id: 'notif_xyz789',
          track_read: true,
          track_click: true,
          callback_url: 'https://api.company.com/delivery-webhook',
          timeout_seconds: 3600,
        },
        async: false,
      },
      {
        type: 'SUBSCRIBER_MANAGEMENT',
        description: 'Manage notification subscriptions and preferences',
        category: 'INTEGRATION',
        example: {
          action: 'subscribe',
          recipient_id: 'user_123',
          channels: ['email', 'slack', 'sms'],
          notification_level: 'all',
          quiet_hours_start: '22:00',
          quiet_hours_end: '08:00',
        },
        async: false,
      },
    ];
  }

  getContextVariables(): Record<string, ContextVariableDefinition> {
    return {
      notification_config: {
        name: 'notification_config',
        module: 'notifications-module',
        description: 'Notification system configuration and channel settings',
        type: 'object',
        isReadOnly: true,
        example: {
          enabled_channels: this.supportedChannels,
          default_channel: 'email',
          retry_policy: {
            max_retries: 3,
            backoff_seconds: [10, 60, 300],
          },
          rate_limits: {
            email: 1000,
            sms: 500,
            slack: 5000,
          },
        },
      },
      delivery_status: {
        name: 'delivery_status',
        module: 'notifications-module',
        description: 'Status of recently sent notifications',
        type: 'array',
        isReadOnly: true,
        example: [
          {
            notification_id: 'notif_001',
            channel: 'email',
            recipient: 'user@company.com',
            status: 'delivered',
            sent_at: '2026-02-18T12:00:00Z',
            delivered_at: '2026-02-18T12:00:05Z',
            latency_ms: 5000,
          },
        ],
      },
      channel_status: {
        name: 'channel_status',
        module: 'notifications-module',
        description: 'Real-time status of all notification channels',
        type: 'object',
        isReadOnly: true,
        example: {
          email: {
            is_available: true,
            is_configured: true,
            queue_depth: 42,
            error_rate: 0.02,
            avg_latency_ms: 250,
          },
          slack: { is_available: true, is_configured: true, queue_depth: 0 },
          sms: { is_available: false, error: 'API key expired' },
        },
      },
      recipient_preferences: {
        name: 'recipient_preferences',
        module: 'notifications-module',
        description: 'User notification preferences and subscriptions',
        type: 'object',
        isReadOnly: true,
        example: {
          subscribed_channels: ['email', 'slack'],
          notification_level: 'high',
          quiet_hours_enabled: true,
          quiet_hours: { start: '22:00', end: '08:00' },
          blocked_senders: [],
          custom_rules: [
            {
              condition: 'severity >= critical',
              channels: ['email', 'sms'],
            },
          ],
        },
      },
      notification_templates: {
        name: 'notification_templates',
        module: 'notifications-module',
        description: 'Available message templates for different scenarios',
        type: 'array',
        isReadOnly: true,
        example: [
          {
            id: 'incident_alert',
            description: 'Template for incident alerts',
            channels: ['email', 'slack', 'sms'],
            variables: ['incident_id', 'severity', 'description'],
          },
          {
            id: 'threshold_warning',
            description: 'Template for threshold warnings',
            channels: ['email', 'slack'],
            variables: ['metric', 'threshold', 'current_value'],
          },
        ],
      },
    };
  }

  getTriggerTypes(): TriggerTypeDefinition[] {
    return [
      {
        type: 'ON_NOTIFICATION_SENT',
        description: 'Fired when notification is successfully sent',
        module: 'notifications-module',
        example: {
          notification_id: 'notif_001',
          channel: 'email',
          recipient: 'user@company.com',
          timestamp: '2026-02-18T12:00:00Z',
        },
      },
      {
        type: 'ON_NOTIFICATION_FAILED',
        description: 'Fired when notification delivery fails',
        module: 'notifications-module',
        example: {
          notification_id: 'notif_002',
          channel: 'sms',
          error: 'Invalid phone number',
          retry_count: 3,
        },
      },
      {
        type: 'ON_DELIVERY_CONFIRMED',
        description: 'Fired when recipient confirms delivery (receipt)',
        module: 'notifications-module',
        example: {
          notification_id: 'notif_003',
          channel: 'slack',
          confirmed_at: '2026-02-18T12:00:15Z',
        },
      },
      {
        type: 'ON_CHANNEL_UNAVAILABLE',
        description: 'Fired when notification channel becomes unavailable',
        module: 'notifications-module',
        example: {
          channel: 'sms',
          reason: 'API rate limit exceeded',
          unavailable_until: '2026-02-18T13:00:00Z',
        },
      },
      {
        type: 'ON_QUEUE_BACKLOG',
        description: 'Fired when notification queue exceeds threshold',
        module: 'notifications-module',
        example: {
          channel: 'email',
          queue_depth: 5000,
          threshold: 1000,
          utilization_percent: 500,
        },
      },
    ];
  }

  getResiliencePatterns(): ResiliencePatternDefinition[] {
    return [
      {
        type: 'CHANNEL_FALLBACK',
        description: 'Automatically fallback to alternate channel if primary fails',
        module: 'notifications-module',
        applicableTo: ['SEND_NOTIFICATION', 'SEND_BATCH_NOTIFICATIONS'],
        example: {
          primary: 'slack',
          fallbacks: ['email', 'sms'],
          fallback_delay_seconds: 30,
          max_fallbacks: 2,
        },
      },
      {
        type: 'DELIVERY_RETRY',
        description: 'Retry failed notifications with exponential backoff',
        module: 'notifications-module',
        applicableTo: ['SEND_NOTIFICATION', 'SEND_BATCH_NOTIFICATIONS'],
        example: {
          max_retries: 5,
          initial_delay_seconds: 10,
          backoff_multiplier: 2,
          max_delay_seconds: 600,
        },
      },
      {
        type: 'RECIPIENT_FILTERING',
        description: 'Filter recipients based on preferences and opt-in status',
        module: 'notifications-module',
        applicableTo: ['SEND_NOTIFICATION', 'SEND_BATCH_NOTIFICATIONS'],
        example: {
          respect_quiet_hours: true,
          check_opt_in_status: true,
          skip_blacklisted: true,
          validate_contact_info: true,
        },
      },
      {
        type: 'ESCALATION_TIMEOUT',
        description:
          'Escalate to next channel if no acknowledgment within timeout',
        module: 'notifications-module',
        applicableTo: ['SEND_WITH_ESCALATION'],
        example: {
          timeout_minutes: 5,
          escalation_sequence: ['slack', 'email', 'sms'],
          require_ack_on_each: true,
          max_escalations: 3,
        },
      },
    ];
  }

  getExamples(): ExampleDefinition[] {
    return [
      {
        name: 'Simple Alert Notification',
        description: 'Send simple alert via preferred channel',
        module: 'notifications-module',
        complexity: 'simple',
        category: 'task',
        content: {
          condition: {
            type: 'CHANNEL_AVAILABILITY',
            params: {
              channel: 'email',
              is_available: true,
            },
          },
          actions: [
            {
              type: 'SEND_NOTIFICATION',
              params: {
                channel: 'email',
                recipients: ['ops-team@company.com'],
                subject: 'System Alert',
                body: 'Critical event detected',
                priority: 'high',
              },
            },
          ],
        },
      },
      {
        name: 'Multi-Channel Alert with Escalation',
        description: 'Send alert to primary channel, escalate if not acknowledged',
        module: 'notifications-module',
        complexity: 'complex',
        category: 'workflow',
        content: {
          condition: {
            type: 'DELIVERY_LATENCY',
            params: {
              channel: 'slack',
              p99_latency_ms: 2500,
            },
          },
          actions: [
            {
              type: 'SEND_WITH_ESCALATION',
              params: {
                primary_channel: 'slack',
                escalation_channels: ['email', 'sms'],
                escalation_delay_minutes: [5, 15],
                recipients: ['incident-commander@company.com'],
                message: 'CRITICAL: Database connection pool exhausted',
                acknowledgment_required: true,
              },
            },
          ],
        },
      },
      {
        name: 'Batch Notification Campaign',
        description: 'Send bulk notifications to multiple recipients with rate limiting',
        module: 'notifications-module',
        complexity: 'medium',
        category: 'task',
        content: {
          condition: {
            type: 'CHANNEL_AVAILABILITY',
            params: {
              channel: 'email',
              is_configured: true,
            },
          },
          actions: [
            {
              type: 'SEND_BATCH_NOTIFICATIONS',
              params: {
                channel: 'email',
                recipients: ['user1@company.com', 'user2@company.com', 'user3@company.com'],
                template: 'incident_alert',
                template_vars: {
                  incident_id: 'INC-123',
                  severity: 'warning',
                  recommendation: 'Monitor closely',
                },
                batch_size: 50,
                rate_limit_per_second: 100,
              },
            },
          ],
        },
      },
      {
        name: 'Track Critical Notification Delivery',
        description: 'Send notification and track delivery status with callbacks',
        module: 'notifications-module',
        complexity: 'medium',
        category: 'workflow',
        content: {
          condition: {
            type: 'CHANNEL_AVAILABILITY',
            params: {
              channel: 'email',
              is_available: true,
            },
          },
          actions: [
            {
              type: 'SEND_NOTIFICATION',
              params: {
                channel: 'email',
                recipients: ['ceo@company.com'],
                subject: 'CRITICAL: Security Incident',
                body: 'Unauthorized access detected',
                priority: 'critical',
              },
            },
            {
              type: 'TRACK_DELIVERY',
              params: {
                notification_id: 'AUTO_ASSIGNED',
                track_read: true,
                track_click: false,
                callback_url: 'https://monitoring.company.com/delivery-webhook',
                timeout_seconds: 7200,
              },
            },
          ],
        },
      },
    ];
  }

  getCapabilities(): Record<string, unknown> {
    return {
      supportedChannels: this.supportedChannels,
      defaultChannel: 'email',
      maxRecipientsPerBatch: 10000,
      maxRecipientsBatch: 1000,
      maxBatchSize: 100,
      maxRetries: 5,
      maxEscalationLevels: 3,
      rateLimits: {
        email: 1000,
        slack: 5000,
        sms: 500,
        pagerduty: 1000,
        webhook: 10000,
        teams: 5000,
        discord: 5000,
        telegram: 5000,
      },
      timeouts: {
        delivery_confirmation_seconds: 3600,
        escalation_timeout_minutes: 5,
        retry_timeout_hours: 24,
      },
      features: {
        batch_sending: true,
        escalation_chains: true,
        delivery_tracking: true,
        quiet_hours: true,
        recipient_filtering: true,
        template_support: true,
        webhook_callbacks: true,
      },
    };
  }

  getBestPractices(): string[] {
    return [
      'Always configure fallback channels for critical notifications',
      'Use SEND_WITH_ESCALATION for high-priority incidents',
      'Enable delivery tracking for critical messages',
      'Respect recipient quiet hours and preferences',
      'Set appropriate rate limits to avoid channel throttling',
      'Test channel connectivity before relying on it',
      'Use templates for consistent message formatting',
      'Implement batch notifications for high-volume sends',
      'Monitor channel queue depth and latency metrics',
      'Set up escalation timeouts appropriate to incident severity',
      'Filter recipients to ensure valid contact information',
      'Use separate channels for different notification levels',
      'Log all notification attempts for audit and debugging',
      'Implement circuit breakers for failing channels',
    ];
  }
}
