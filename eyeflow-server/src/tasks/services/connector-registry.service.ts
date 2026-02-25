/**
 * ConnectorRegistryService
 * Central registry for all connectors in the system
 * Exposes manifests so the LLM knows what's available
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  ConnectorManifest,
  ConnectorRegistryEntry,
  DataType,
  DataSchema,
  ConnectorNode,
  ConnectorFunction,
  TriggerConfiguration,
  TriggerType,
  ConditionOperator,
} from '../types/connector-manifest.types';

@Injectable()
export class ConnectorRegistryService {
  private readonly logger = new Logger(ConnectorRegistryService.name);
  private connectorRegistry: Map<string, ConnectorRegistryEntry> = new Map();

  constructor() {
    this.initializeConnectors();
  }

  /**
   * Initialize built-in connectors with their manifests
   * In production, these would come from a database or configuration files
   */
  private initializeConnectors(): void {
    // ── Existing connectors ─────────────────────────────────────────────
    this.registerConnector(this.createSlackManifest());
    this.registerConnector(this.createPostgresManifest());
    this.registerConnector(this.createApiConnectorManifest());
    this.registerConnector(this.createKafkaManifest());
    this.registerConnector(this.createFileSystemManifest());
    // ── Databases ───────────────────────────────────────────────────────
    this.registerConnector(this.createMysqlManifest());
    this.registerConnector(this.createMongodbManifest());
    this.registerConnector(this.createDynamodbManifest());
    this.registerConnector(this.createFirestoreManifest());
    // ── File / Cloud Storage ────────────────────────────────────────────
    this.registerConnector(this.createS3Manifest());
    this.registerConnector(this.createGoogleDriveManifest());
    this.registerConnector(this.createDropboxManifest());
    // ── IoT / Streaming ─────────────────────────────────────────────────
    this.registerConnector(this.createMqttManifest());
    this.registerConnector(this.createInfluxdbManifest());
    // ── Communication ───────────────────────────────────────────────────
    this.registerConnector(this.createSmtpManifest());
    this.registerConnector(this.createTeamsManifest());
    this.registerConnector(this.createWhatsappManifest());
    // ── ERP / SaaS ──────────────────────────────────────────────────────
    this.registerConnector(this.createShopifyManifest());
    this.registerConnector(this.createStripeManifest());
    this.registerConnector(this.createHubspotManifest());
    // ── Generic ─────────────────────────────────────────────────────────
    this.registerConnector(this.createWebhookManifest());
    this.registerConnector(this.createGraphqlManifest());
  }

  /**
   * Register a connector manifest
   */
  registerConnector(manifest: ConnectorManifest): void {
    const entry: ConnectorRegistryEntry = {
      connectorId: manifest.id,
      manifest,
      available: true,
      instances: [],
    };
    this.connectorRegistry.set(manifest.id, entry);
    this.logger.log(`Connector registered: ${manifest.name} (${manifest.id})`);
  }

  /**
   * Get all available connectors
   */
  getAllConnectors(): ConnectorManifest[] {
    return Array.from(this.connectorRegistry.values())
      .filter((entry) => entry.available)
      .map((entry) => entry.manifest);
  }

  /**
   * Get a specific connector by ID
   */
  getConnector(connectorId: string): ConnectorManifest | null {
    const entry = this.connectorRegistry.get(connectorId);
    return entry && entry.available ? entry.manifest : null;
  }

  /**
   * Get all nodes from all connectors
   */
  getAllNodes(): Array<{ connectorId: string; node: ConnectorNode }> {
    const nodes: Array<{ connectorId: string; node: ConnectorNode }> = [];
    for (const [connectorId, entry] of this.connectorRegistry) {
      if (entry.available) {
        entry.manifest.nodes.forEach((node) => {
          nodes.push({ connectorId, node });
        });
      }
    }
    return nodes;
  }

  /**
   * Get all functions from all connectors
   */
  getAllFunctions(): Array<{ connectorId: string; function: ConnectorFunction }> {
    const functions: Array<{ connectorId: string; function: ConnectorFunction }> = [];
    for (const [connectorId, entry] of this.connectorRegistry) {
      if (entry.available) {
        entry.manifest.functions.forEach((func) => {
          functions.push({ connectorId, function: func });
        });
      }
    }
    return functions;
  }

  /**
   * Get all data schemas from all connectors
   */
  getAllSchemas(): DataSchema[] {
    const schemas: DataSchema[] = [];
    for (const entry of this.connectorRegistry.values()) {
      if (entry.available) {
        schemas.push(...entry.manifest.dataSchemas);
      }
    }
    return schemas;
  }

  /**
   * Get all trigger configurations from all connectors
   */
  getAllTriggers(): Array<{ connectorId: string; trigger: TriggerConfiguration }> {
    const triggers: Array<{ connectorId: string; trigger: TriggerConfiguration }> = [];
    for (const [connectorId, entry] of this.connectorRegistry) {
      if (entry.available) {
        entry.manifest.triggers.forEach((trigger) => {
          triggers.push({ connectorId, trigger });
        });
      }
    }
    return triggers;
  }

  // ========================================================================
  // CONNECTOR MANIFESTS (Examples)
  // ========================================================================

  private createSlackManifest(): ConnectorManifest {
    return {
      id: 'slack',
      name: 'Slack',
      displayName: 'Slack Messaging',
      version: '1.0.0',
      vendor: 'Slack Technologies',
      description: 'Send and receive messages, manage channels, post to boards',
      categories: ['Messaging', 'Collaboration'],
      capabilities: {
        canRead: true,
        canWrite: true,
        canDelete: false,
        canSubscribe: true,
        canExecuteQueries: true,
        supportsRules: true,
        supportsDirectQuery: [DataType.STRING, DataType.JSON],
      },
      authentication: {
        type: 'oauth',
        fields: [
          {
            key: 'token',
            name: 'Bot Token',
            type: 'string',
            required: true,
            sensitive: true,
          },
          {
            key: 'appId',
            name: 'App ID',
            type: 'string',
            required: true,
            sensitive: false,
          },
        ],
      },
      dataSchemas: [
        {
          name: 'SlackMessage',
          description: 'A Slack message with metadata',
          fields: [
            {
              name: 'id',
              type: DataType.STRING,
              description: 'Unique message ID (ts)',
              required: true,
            },
            { name: 'channel', type: DataType.STRING, description: 'Channel ID', required: true },
            {
              name: 'user',
              type: DataType.STRING,
              description: 'User ID who sent message',
              required: false,
            },
            {
              name: 'text',
              type: DataType.STRING,
              description: 'Message text content',
              required: true,
            },
            { name: 'timestamp', type: DataType.DATETIME, description: 'Send time', required: true },
            {
              name: 'attachments',
              type: DataType.ARRAY,
              description: 'Attachments',
              arrayItemType: DataType.JSON,
              required: false,
            },
          ],
          example: {
            id: '1234567890.123456',
            channel: 'C123456',
            user: 'U123456',
            text: 'Hello world',
            timestamp: '2026-02-18T12:00:00Z',
          },
        },
      ],
      nodes: [
        {
          id: 'slack_channel',
          name: 'Channel',
          displayName: 'Slack Channel',
          description: 'A Slack channel (public or private)',
          dataSchema: {
            name: 'Channel',
            description: 'Slack channel',
            fields: [
              {
                name: 'id',
                type: DataType.STRING,
                description: 'Channel ID',
                required: true,
              },
              {
                name: 'name',
                type: DataType.STRING,
                description: 'Channel name',
                required: true,
              },
              {
                name: 'isPrivate',
                type: DataType.BOOLEAN,
                description: 'Is private?',
                required: true,
              },
              {
                name: 'topic',
                type: DataType.STRING,
                description: 'Channel topic',
                required: false,
              },
            ],
          },
          availableFunctions: [
            {
              id: 'slack_send_message',
              name: 'Send Message',
              description: 'Send a message to this channel',
              category: 'WRITE',
              parameters: [
                {
                  name: 'text',
                  type: DataType.STRING,
                  description: 'Message text',
                  required: true,
                },
                {
                  name: 'threadTs',
                  type: DataType.STRING,
                  description: 'Thread timestamp (reply to thread)',
                  required: false,
                },
                {
                  name: 'blocks',
                  type: DataType.ARRAY,
                  description: 'Slack block kit JSON',
                  required: false,
                },
              ],
              response: {
                success: true,
                dataType: DataType.JSON,
                description: 'Message sent confirmation',
                example: {
                  ok: true,
                  channel: 'C123456',
                  ts: '1234567890.123456',
                },
              },
              targetNodeTypes: ['slack_channel'],
              requiresAuth: true,
              rateLimitPerMinute: 60,
              examples: [
                {
                  description: 'Send simple text message',
                  input: { text: 'Hello from eyeflow!' },
                  output: { ok: true, ts: '1234567890.123456' },
                },
              ],
            },
            {
              id: 'slack_list_messages',
              name: 'List Messages',
              description: 'List recent messages in channel',
              category: 'READ',
              parameters: [
                {
                  name: 'limit',
                  type: DataType.INTEGER,
                  description: 'Max messages',
                  required: false,
                  default: 10,
                },
              ],
              response: {
                success: true,
                dataType: DataType.ARRAY,
                description: 'Array of messages',
              },
              targetNodeTypes: ['slack_channel'],
              requiresAuth: true,
            },
          ],
          supportsSubscription: true,
          subscriptionTriggerTypes: [TriggerType.ON_CREATE, TriggerType.ON_UPDATE],
          identifierFields: ['id', 'name'],
        },
      ],
      functions: [
        {
          id: 'slack_post_file',
          name: 'Post File',
          description: 'Upload and share a file in Slack',
          category: 'WRITE',
          parameters: [
            {
              name: 'channels',
              type: DataType.ARRAY,
              description: 'Channel IDs to upload to',
              required: true,
            },
            {
              name: 'file',
              type: DataType.BINARY,
              description: 'File content',
              required: true,
            },
            {
              name: 'filename',
              type: DataType.STRING,
              description: 'Filename',
              required: true,
            },
          ],
          response: {
            success: true,
            dataType: DataType.JSON,
            description: 'File uploaded',
          },
          requiresAuth: true,
        },
      ],
      triggers: [
        {
          type: TriggerType.ON_CREATE,
          description: 'When new message posted in channel',
          filterableFields: ['channel', 'user', 'text'],
          debounceMs: 100,
        },
        {
          type: TriggerType.ON_UPDATE,
          description: 'When message edited',
          filterableFields: ['channel', 'messageId'],
        },
        {
          type: TriggerType.ON_WEBHOOK,
          description: 'Slack event webhook',
          filterableFields: [],
        },
      ],
      supportedOperators: [
        ConditionOperator.EQ,
        ConditionOperator.NE,
        ConditionOperator.CONTAINS,
        ConditionOperator.STARTS_WITH,
        ConditionOperator.REGEX,
      ],
      outputFormats: [DataType.JSON, DataType.STRING],
      tags: ['messaging', 'collaboration', 'webhook', 'event-driven'],
      status: 'active',
    };
  }

  private createPostgresManifest(): ConnectorManifest {
    return {
      id: 'postgres',
      name: 'PostgreSQL',
      displayName: 'PostgreSQL Database',
      version: '1.0.0',
      vendor: 'PostgreSQL Global Development Group',
      description: 'Query, insert, update, delete data in PostgreSQL databases',
      categories: ['Database', 'Data'],
      capabilities: {
        canRead: true,
        canWrite: true,
        canDelete: true,
        canSubscribe: false,
        canExecuteQueries: true,
        supportsRules: true,
        supportsDirectQuery: [DataType.JSON, DataType.OBJECT],
      },
      authentication: {
        type: 'basic',
        fields: [
          {
            key: 'host',
            name: 'Host',
            type: 'string',
            required: true,
            sensitive: false,
          },
          {
            key: 'port',
            name: 'Port',
            type: 'string',
            required: true,
            sensitive: false,
          },
          {
            key: 'database',
            name: 'Database',
            type: 'string',
            required: true,
            sensitive: false,
          },
          {
            key: 'username',
            name: 'Username',
            type: 'string',
            required: true,
            sensitive: false,
          },
          {
            key: 'password',
            name: 'Password',
            type: 'string',
            required: true,
            sensitive: true,
          },
        ],
      },
      dataSchemas: [
        {
          name: 'Customer',
          description: 'Customer record from database',
          fields: [
            { name: 'id', type: DataType.INTEGER, description: 'Primary key', required: true },
            { name: 'email', type: DataType.EMAIL, description: 'Customer email', required: true },
            {
              name: 'firstName',
              type: DataType.STRING,
              description: 'First name',
              required: true,
            },
            {
              name: 'lastName',
              type: DataType.STRING,
              description: 'Last name',
              required: true,
            },
            {
              name: 'complianceStatus',
              type: DataType.ENUM,
              description: 'Compliance status',
              required: true,
              enumValues: ['COMPLIANT', 'NON_COMPLIANT', 'PENDING_REVIEW'],
            },
            {
              name: 'createdAt',
              type: DataType.DATETIME,
              description: 'Creation timestamp',
              required: true,
            },
          ],
        },
      ],
      nodes: [
        {
          id: 'postgres_table',
          name: 'Table',
          displayName: 'Database Table',
          description: 'A PostgreSQL table',
          dataSchema: {
            name: 'Table',
            description: 'Table metadata',
            fields: [
              {
                name: 'name',
                type: DataType.STRING,
                description: 'Table name',
                required: true,
              },
              {
                name: 'schema',
                type: DataType.STRING,
                description: 'Schema name',
                required: true,
              },
            ],
          },
          availableFunctions: [
            {
              id: 'postgres_select',
              name: 'Select Query',
              description: 'Execute SELECT query on this table',
              category: 'QUERY',
              parameters: [
                {
                  name: 'sql',
                  type: DataType.STRING,
                  description: 'SQL SELECT query',
                  required: true,
                },
                {
                  name: 'limit',
                  type: DataType.INTEGER,
                  description: 'Result limit',
                  required: false,
                  default: 100,
                },
              ],
              response: {
                success: true,
                dataType: DataType.ARRAY,
                description: 'Query results',
              },
              targetNodeTypes: ['postgres_table'],
              requiresAuth: true,
            },
            {
              id: 'postgres_insert',
              name: 'Insert Row',
              description: 'Insert a new row',
              category: 'WRITE',
              parameters: [
                {
                  name: 'data',
                  type: DataType.OBJECT,
                  description: 'Row data',
                  required: true,
                },
              ],
              response: {
                success: true,
                dataType: DataType.JSON,
                description: 'Inserted row',
              },
              targetNodeTypes: ['postgres_table'],
              requiresAuth: true,
            },
            {
              id: 'postgres_update',
              name: 'Update Row',
              description: 'Update existing rows',
              category: 'WRITE',
              parameters: [
                {
                  name: 'whereClause',
                  type: DataType.STRING,
                  description: 'WHERE clause',
                  required: true,
                },
                {
                  name: 'data',
                  type: DataType.OBJECT,
                  description: 'Data to update',
                  required: true,
                },
              ],
              response: {
                success: true,
                dataType: DataType.JSON,
                description: 'Update result',
              },
              targetNodeTypes: ['postgres_table'],
              requiresAuth: true,
            },
          ],
          supportsSubscription: false,
          identifierFields: ['name', 'schema'],
        },
      ],
      functions: [],
      triggers: [
        {
          type: TriggerType.ON_SCHEDULE,
          description: 'Execute query on schedule',
          filterableFields: ['table', 'condition'],
          cronPattern: '0 * * * *',
        },
      ],
      supportedOperators: [
        ConditionOperator.EQ,
        ConditionOperator.NE,
        ConditionOperator.GT,
        ConditionOperator.GTE,
        ConditionOperator.LT,
        ConditionOperator.LTE,
        ConditionOperator.IN,
        ConditionOperator.CONTAINS,
        ConditionOperator.BETWEEN,
      ],
      outputFormats: [DataType.JSON, DataType.ARRAY],
      rateLimit: {
        requestsPerMinute: 300,
        requestsPerHour: 10000,
        requestsPerDay: 100000,
      },
      tags: ['database', 'sql', 'query', 'data-source'],
      status: 'active',
    };
  }

  private createApiConnectorManifest(): ConnectorManifest {
    return {
      id: 'http_api',
      name: 'HTTP API',
      displayName: 'Generic HTTP API',
      version: '1.0.0',
      description: 'Call any HTTP/REST API endpoint',
      categories: ['API', 'Integration'],
      capabilities: {
        canRead: true,
        canWrite: true,
        canDelete: true,
        canSubscribe: false,
        canExecuteQueries: true,
        supportsRules: true,
        supportsDirectQuery: [DataType.JSON],
      },
      authentication: {
        type: 'custom',
        fields: [
          {
            key: 'baseUrl',
            name: 'Base URL',
            type: 'string',
            required: true,
            sensitive: false,
          },
          {
            key: 'authType',
            name: 'Auth Type',
            type: 'string',
            required: false,
            sensitive: false,
          },
          {
            key: 'authToken',
            name: 'Auth Token',
            type: 'string',
            required: false,
            sensitive: true,
          },
        ],
      },
      dataSchemas: [],
      nodes: [],
      functions: [
        {
          id: 'http_get',
          name: 'HTTP GET',
          description: 'Execute GET request',
          category: 'READ',
          parameters: [
            {
              name: 'endpoint',
              type: DataType.STRING,
              description: 'Endpoint path',
              required: true,
            },
            {
              name: 'params',
              type: DataType.OBJECT,
              description: 'Query parameters',
              required: false,
            },
          ],
          response: {
            success: true,
            dataType: DataType.JSON,
            description: 'Response body',
          },
          requiresAuth: false,
        },
        {
          id: 'http_post',
          name: 'HTTP POST',
          description: 'Execute POST request',
          category: 'WRITE',
          parameters: [
            {
              name: 'endpoint',
              type: DataType.STRING,
              description: 'Endpoint path',
              required: true,
            },
            {
              name: 'body',
              type: DataType.JSON,
              description: 'Request body',
              required: true,
            },
          ],
          response: {
            success: true,
            dataType: DataType.JSON,
            description: 'Response body',
          },
          requiresAuth: false,
        },
      ],
      triggers: [],
      supportedOperators: [ConditionOperator.EQ],
      outputFormats: [DataType.JSON],
      tags: ['api', 'http', 'integration', 'rest'],
      status: 'active',
    };
  }

  private createKafkaManifest(): ConnectorManifest {
    return {
      id: 'kafka',
      name: 'Apache Kafka',
      displayName: 'Kafka Message Broker',
      version: '1.0.0',
      vendor: 'Confluent',
      description: 'Produce and consume messages from Kafka topics',
      categories: ['Messaging', 'Event Streaming'],
      capabilities: {
        canRead: true,
        canWrite: true,
        canDelete: false,
        canSubscribe: true,
        canExecuteQueries: true,
        supportsRules: true,
        supportsDirectQuery: [DataType.JSON],
      },
      authentication: {
        type: 'custom',
        fields: [
          {
            key: 'brokers',
            name: 'Broker Addresses',
            type: 'string',
            required: true,
            sensitive: false,
          },
          {
            key: 'saslUsername',
            name: 'SASL Username',
            type: 'string',
            required: false,
            sensitive: false,
          },
          {
            key: 'saslPassword',
            name: 'SASL Password',
            type: 'string',
            required: false,
            sensitive: true,
          },
        ],
      },
      dataSchemas: [],
      nodes: [
        {
          id: 'kafka_topic',
          name: 'Topic',
          displayName: 'Kafka Topic',
          description: 'A Kafka topic for message streaming',
          dataSchema: {
            name: 'KafkaMessage',
            description: 'Message in Kafka topic',
            fields: [
              {
                name: 'key',
                type: DataType.STRING,
                description: 'Message key',
                required: false,
              },
              {
                name: 'value',
                type: DataType.JSON,
                description: 'Message value',
                required: true,
              },
              {
                name: 'partition',
                type: DataType.INTEGER,
                description: 'Partition',
                required: true,
              },
              {
                name: 'offset',
                type: DataType.INTEGER,
                description: 'Offset',
                required: true,
              },
            ],
          },
          availableFunctions: [
            {
              id: 'kafka_produce',
              name: 'Produce Message',
              description: 'Send message to topic',
              category: 'WRITE',
              parameters: [
                {
                  name: 'key',
                  type: DataType.STRING,
                  description: 'Message key',
                  required: false,
                },
                {
                  name: 'value',
                  type: DataType.JSON,
                  description: 'Message value',
                  required: true,
                },
              ],
              response: {
                success: true,
                dataType: DataType.JSON,
                description: 'Produce result',
              },
              targetNodeTypes: ['kafka_topic'],
              requiresAuth: true,
              rateLimitPerMinute: 10000,
            },
            {
              id: 'kafka_consume',
              name: 'Consume Messages',
              description: 'Read messages from topic',
              category: 'READ',
              parameters: [
                {
                  name: 'limit',
                  type: DataType.INTEGER,
                  description: 'Number of messages',
                  required: false,
                  default: 10,
                },
                {
                  name: 'fromOffset',
                  type: DataType.INTEGER,
                  description: 'Start from offset',
                  required: false,
                },
              ],
              response: {
                success: true,
                dataType: DataType.ARRAY,
                description: 'Array of messages',
              },
              targetNodeTypes: ['kafka_topic'],
              requiresAuth: true,
            },
          ],
          supportsSubscription: true,
          subscriptionTriggerTypes: [TriggerType.ON_CREATE],
          identifierFields: ['name'],
        },
      ],
      functions: [],
      triggers: [
        {
          type: TriggerType.ON_CREATE,
          description: 'When new message arrives',
          filterableFields: ['topic', 'key'],
          debounceMs: 50,
        },
      ],
      supportedOperators: [ConditionOperator.EQ, ConditionOperator.CONTAINS],
      outputFormats: [DataType.JSON],
      tags: ['messaging', 'event-streaming', 'pub-sub'],
      status: 'active',
    };
  }

  private createFileSystemManifest(): ConnectorManifest {
    return {
      id: 'filesystem',
      name: 'File System',
      displayName: 'Local File System',
      version: '1.0.0',
      description: 'Read, write, and manage files on local file system',
      categories: ['Storage', 'Files'],
      capabilities: {
        canRead: true,
        canWrite: true,
        canDelete: true,
        canSubscribe: false,
        canExecuteQueries: false,
        supportsRules: true,
        supportsDirectQuery: [DataType.STRING],
      },
      authentication: {
        type: 'none',
        fields: [],
      },
      dataSchemas: [],
      nodes: [
        {
          id: 'fs_file',
          name: 'File',
          displayName: 'File',
          description: 'A file or directory',
          dataSchema: {
            name: 'File',
            description: 'File metadata',
            fields: [
              {
                name: 'path',
                type: DataType.STRING,
                description: 'File path',
                required: true,
              },
              {
                name: 'size',
                type: DataType.INTEGER,
                description: 'File size in bytes',
                required: true,
              },
              {
                name: 'type',
                type: DataType.ENUM,
                description: 'File type',
                required: true,
                enumValues: ['file', 'directory'],
              },
            ],
          },
          availableFunctions: [
            {
              id: 'fs_read',
              name: 'Read File',
              description: 'Read file content',
              category: 'READ',
              parameters: [
                {
                  name: 'encoding',
                  type: DataType.STRING,
                  description: 'File encoding',
                  required: false,
                  default: 'utf8',
                },
              ],
              response: {
                success: true,
                dataType: DataType.STRING,
                description: 'File content',
              },
              targetNodeTypes: ['fs_file'],
              requiresAuth: false,
            },
            {
              id: 'fs_write',
              name: 'Write File',
              description: 'Write content to file',
              category: 'WRITE',
              parameters: [
                {
                  name: 'content',
                  type: DataType.STRING,
                  description: 'Content to write',
                  required: true,
                },
                {
                  name: 'append',
                  type: DataType.BOOLEAN,
                  description: 'Append to file?',
                  required: false,
                  default: false,
                },
              ],
              response: {
                success: true,
                dataType: DataType.JSON,
                description: 'Write result',
              },
              targetNodeTypes: ['fs_file'],
              requiresAuth: false,
            },
          ],
          supportsSubscription: false,
          identifierFields: ['path'],
        },
      ],
      functions: [],
      triggers: [],
      supportedOperators: [ConditionOperator.EQ, ConditionOperator.REGEX],
      outputFormats: [DataType.STRING, DataType.JSON],
      tags: ['storage', 'files', 'local'],
      status: 'active',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATABASES
  // ═══════════════════════════════════════════════════════════════════════════

  private createMysqlManifest(): ConnectorManifest {
    const sqlFunctions: ConnectorFunction[] = [
      {
        id: 'mysql_select', name: 'Select', description: 'Execute a SELECT query', category: 'QUERY',
        parameters: [
          { name: 'sql', type: DataType.STRING, description: 'SQL query', required: true },
          { name: 'params', type: DataType.ARRAY, description: 'Prepared statement values', required: false },
        ],
        response: { success: true, dataType: DataType.ARRAY, description: 'Result rows' },
        requiresAuth: true,
      },
      {
        id: 'mysql_insert', name: 'Insert', description: 'Insert a row', category: 'WRITE',
        parameters: [
          { name: 'table', type: DataType.STRING, description: 'Table name', required: true },
          { name: 'data', type: DataType.OBJECT, description: 'Row data (field → value)', required: true },
        ],
        response: { success: true, dataType: DataType.JSON, description: '{ insertId, affectedRows }' },
        requiresAuth: true,
      },
      {
        id: 'mysql_update', name: 'Update', description: 'Update rows matching a condition', category: 'WRITE',
        parameters: [
          { name: 'table', type: DataType.STRING, description: 'Table name', required: true },
          { name: 'data', type: DataType.OBJECT, description: 'Fields to update', required: true },
          { name: 'where', type: DataType.OBJECT, description: 'WHERE conditions', required: true },
        ],
        response: { success: true, dataType: DataType.JSON, description: '{ affectedRows }' },
        requiresAuth: true,
      },
      {
        id: 'mysql_delete', name: 'Delete', description: 'Delete rows', category: 'DELETE',
        parameters: [
          { name: 'table', type: DataType.STRING, description: 'Table name', required: true },
          { name: 'where', type: DataType.OBJECT, description: 'WHERE conditions', required: true },
        ],
        response: { success: true, dataType: DataType.JSON, description: '{ affectedRows }' },
        requiresAuth: true,
      },
    ];
    return {
      id: 'mysql', name: 'MySQL', displayName: 'MySQL / MariaDB', version: '1.0.0',
      vendor: 'Oracle / MariaDB Foundation',
      description: 'Query and write data in MySQL or MariaDB databases.',
      categories: ['Database', 'Data'],
      capabilities: { canRead: true, canWrite: true, canDelete: true, canSubscribe: false, canExecuteQueries: true, supportsRules: true, supportsDirectQuery: [DataType.JSON, DataType.OBJECT] },
      authentication: {
        type: 'basic',
        fields: [
          { key: 'host', name: 'Host', type: 'string', required: true, sensitive: false },
          { key: 'port', name: 'Port', type: 'string', required: true, sensitive: false },
          { key: 'database', name: 'Database', type: 'string', required: true, sensitive: false },
          { key: 'username', name: 'Username', type: 'string', required: true, sensitive: false },
          { key: 'password', name: 'Password', type: 'string', required: true, sensitive: true },
          { key: 'ssl', name: 'SSL', type: 'boolean', required: false, sensitive: false },
        ],
      },
      dataSchemas: [],
      nodes: [{
        id: 'mysql_table', name: 'Table', displayName: 'MySQL Table', description: 'A MySQL database table',
        dataSchema: { name: 'MysqlRow', description: 'A MySQL table row', fields: [{ name: 'id', type: DataType.INTEGER, description: 'Primary key', required: false }] },
        availableFunctions: sqlFunctions,
        supportsSubscription: false, identifierFields: ['name'],
      }],
      functions: [],
      triggers: [{ type: TriggerType.ON_SCHEDULE, description: 'Run query on schedule', filterableFields: ['table'] }],
      supportedOperators: [ConditionOperator.EQ, ConditionOperator.NE, ConditionOperator.GT, ConditionOperator.GTE, ConditionOperator.LT, ConditionOperator.LTE, ConditionOperator.IN, ConditionOperator.CONTAINS, ConditionOperator.BETWEEN],
      outputFormats: [DataType.JSON, DataType.ARRAY],
      tags: ['database', 'sql', 'mysql', 'mariadb'], status: 'active',
    };
  }

  private createMongodbManifest(): ConnectorManifest {
    return {
      id: 'mongodb', name: 'MongoDB', displayName: 'MongoDB', version: '1.0.0', vendor: 'MongoDB Inc.',
      description: 'Read and write documents in MongoDB collections.',
      categories: ['Database', 'NoSQL'],
      capabilities: { canRead: true, canWrite: true, canDelete: true, canSubscribe: false, canExecuteQueries: true, supportsRules: true, supportsDirectQuery: [DataType.JSON] },
      authentication: {
        type: 'connection_string' as any,
        fields: [
          { key: 'uri', name: 'URI', type: 'string', required: true, sensitive: true },
          { key: 'database', name: 'Database', type: 'string', required: true, sensitive: false },
        ],
      },
      dataSchemas: [],
      nodes: [{
        id: 'mongo_collection', name: 'Collection', displayName: 'MongoDB Collection', description: 'A MongoDB collection',
        dataSchema: { name: 'MongoDocument', description: 'A MongoDB document', fields: [{ name: '_id', type: DataType.STRING, description: 'Document ID', required: true }] },
        availableFunctions: [
          {
            id: 'mongo_find', name: 'Find', description: 'Query documents with a filter', category: 'QUERY',
            parameters: [
              { name: 'collection', type: DataType.STRING, description: 'Collection name', required: true },
              { name: 'filter', type: DataType.OBJECT, description: 'MongoDB filter document', required: false, default: {} },
              { name: 'projection', type: DataType.OBJECT, description: 'Fields to include/exclude', required: false },
              { name: 'limit', type: DataType.INTEGER, description: 'Max results', required: false, default: 100 },
              { name: 'sort', type: DataType.OBJECT, description: 'Sort order', required: false },
            ],
            response: { success: true, dataType: DataType.ARRAY, description: 'Matching documents' },
            requiresAuth: true,
          },
          {
            id: 'mongo_findOne', name: 'Find One', description: 'Find a single document', category: 'QUERY',
            parameters: [
              { name: 'collection', type: DataType.STRING, description: 'Collection name', required: true },
              { name: 'filter', type: DataType.OBJECT, description: 'Filter', required: true },
            ],
            response: { success: true, dataType: DataType.JSON, description: 'The matched document or null' },
            requiresAuth: true,
          },
          {
            id: 'mongo_insertOne', name: 'Insert One', description: 'Insert a document', category: 'WRITE',
            parameters: [
              { name: 'collection', type: DataType.STRING, description: 'Collection name', required: true },
              { name: 'document', type: DataType.OBJECT, description: 'Document to insert', required: true },
            ],
            response: { success: true, dataType: DataType.JSON, description: '{ insertedId }' },
            requiresAuth: true,
          },
          {
            id: 'mongo_updateOne', name: 'Update One', description: 'Update the first matching document', category: 'WRITE',
            parameters: [
              { name: 'collection', type: DataType.STRING, description: 'Collection name', required: true },
              { name: 'filter', type: DataType.OBJECT, description: 'Filter', required: true },
              { name: 'update', type: DataType.OBJECT, description: 'Update operators (e.g. $set)', required: true },
              { name: 'upsert', type: DataType.BOOLEAN, description: 'Create if not exists?', required: false, default: false },
            ],
            response: { success: true, dataType: DataType.JSON, description: '{ matchedCount, modifiedCount }' },
            requiresAuth: true,
          },
          {
            id: 'mongo_deleteOne', name: 'Delete One', description: 'Delete the first matching document', category: 'DELETE',
            parameters: [
              { name: 'collection', type: DataType.STRING, description: 'Collection name', required: true },
              { name: 'filter', type: DataType.OBJECT, description: 'Filter', required: true },
            ],
            response: { success: true, dataType: DataType.JSON, description: '{ deletedCount }' },
            requiresAuth: true,
          },
          {
            id: 'mongo_aggregate', name: 'Aggregate', description: 'Run an aggregation pipeline', category: 'QUERY',
            parameters: [
              { name: 'collection', type: DataType.STRING, description: 'Collection name', required: true },
              { name: 'pipeline', type: DataType.ARRAY, description: 'Aggregation stages', required: true },
            ],
            response: { success: true, dataType: DataType.ARRAY, description: 'Pipeline result' },
            requiresAuth: true,
          },
        ],
        supportsSubscription: false, identifierFields: ['_id'],
      }],
      functions: [],
      triggers: [{ type: TriggerType.ON_SCHEDULE, description: 'Poll collection on schedule', filterableFields: ['collection'] }],
      supportedOperators: [ConditionOperator.EQ, ConditionOperator.NE, ConditionOperator.GT, ConditionOperator.LT, ConditionOperator.IN, ConditionOperator.EXISTS, ConditionOperator.REGEX],
      outputFormats: [DataType.JSON, DataType.ARRAY],
      tags: ['database', 'nosql', 'mongodb', 'document'], status: 'active',
    };
  }

  private createDynamodbManifest(): ConnectorManifest {
    return {
      id: 'dynamodb', name: 'DynamoDB', displayName: 'AWS DynamoDB', version: '1.0.0', vendor: 'Amazon Web Services',
      description: 'Read and write items in AWS DynamoDB tables. Serverless key-value store.',
      categories: ['Database', 'Cloud', 'AWS'],
      capabilities: { canRead: true, canWrite: true, canDelete: true, canSubscribe: false, canExecuteQueries: true, supportsRules: true, supportsDirectQuery: [DataType.JSON] },
      authentication: {
        type: 'api_key',
        fields: [
          { key: 'region', name: 'AWS Region', type: 'string', required: true, sensitive: false },
          { key: 'accessKeyId', name: 'Access Key ID', type: 'string', required: true, sensitive: false },
          { key: 'secretAccessKey', name: 'Secret Access Key', type: 'string', required: true, sensitive: true },
          { key: 'sessionToken', name: 'Session Token', type: 'string', required: false, sensitive: true },
          { key: 'endpoint', name: 'Custom Endpoint', type: 'string', required: false, sensitive: false },
        ],
      },
      dataSchemas: [],
      nodes: [{
        id: 'dynamo_table', name: 'Table', displayName: 'DynamoDB Table', description: 'A DynamoDB table',
        dataSchema: { name: 'DynamoItem', description: 'A DynamoDB item', fields: [{ name: 'pk', type: DataType.STRING, description: 'Partition key', required: true }] },
        availableFunctions: [
          {
            id: 'dynamo_getItem', name: 'Get Item', description: 'Retrieve an item by primary key', category: 'READ',
            parameters: [
              { name: 'tableName', type: DataType.STRING, description: 'Table name', required: true },
              { name: 'key', type: DataType.OBJECT, description: 'Primary key (pk + optional sk)', required: true },
            ],
            response: { success: true, dataType: DataType.JSON, description: 'The item or null' },
            requiresAuth: true,
          },
          {
            id: 'dynamo_putItem', name: 'Put Item', description: 'Insert or replace an item', category: 'WRITE',
            parameters: [
              { name: 'tableName', type: DataType.STRING, description: 'Table name', required: true },
              { name: 'item', type: DataType.OBJECT, description: 'Item attributes', required: true },
            ],
            response: { success: true, dataType: DataType.JSON, description: 'Put result' },
            requiresAuth: true,
          },
          {
            id: 'dynamo_updateItem', name: 'Update Item', description: 'Update specific attributes of an item', category: 'WRITE',
            parameters: [
              { name: 'tableName', type: DataType.STRING, description: 'Table name', required: true },
              { name: 'key', type: DataType.OBJECT, description: 'Primary key', required: true },
              { name: 'updateExpression', type: DataType.STRING, description: 'UpdateExpression string', required: true },
              { name: 'expressionValues', type: DataType.OBJECT, description: 'ExpressionAttributeValues', required: false },
            ],
            response: { success: true, dataType: DataType.JSON, description: 'Updated attributes' },
            requiresAuth: true,
          },
          {
            id: 'dynamo_deleteItem', name: 'Delete Item', description: 'Delete an item by key', category: 'DELETE',
            parameters: [
              { name: 'tableName', type: DataType.STRING, description: 'Table name', required: true },
              { name: 'key', type: DataType.OBJECT, description: 'Primary key', required: true },
            ],
            response: { success: true, dataType: DataType.JSON, description: 'Delete result' },
            requiresAuth: true,
          },
          {
            id: 'dynamo_query', name: 'Query', description: 'Query items by partition key (and optional sort key condition)', category: 'QUERY',
            parameters: [
              { name: 'tableName', type: DataType.STRING, description: 'Table name', required: true },
              { name: 'keyConditionExpression', type: DataType.STRING, description: 'Key condition expression', required: true },
              { name: 'expressionValues', type: DataType.OBJECT, description: 'ExpressionAttributeValues', required: true },
              { name: 'indexName', type: DataType.STRING, description: 'GSI/LSI name (optional)', required: false },
              { name: 'limit', type: DataType.INTEGER, description: 'Max items', required: false },
            ],
            response: { success: true, dataType: DataType.ARRAY, description: 'Matching items' },
            requiresAuth: true,
          },
          {
            id: 'dynamo_scan', name: 'Scan', description: 'Full table scan with optional filter', category: 'QUERY',
            parameters: [
              { name: 'tableName', type: DataType.STRING, description: 'Table name', required: true },
              { name: 'filterExpression', type: DataType.STRING, description: 'Filter expression', required: false },
              { name: 'expressionValues', type: DataType.OBJECT, description: 'ExpressionAttributeValues', required: false },
              { name: 'limit', type: DataType.INTEGER, description: 'Max items', required: false },
            ],
            response: { success: true, dataType: DataType.ARRAY, description: 'Scanned items' },
            requiresAuth: true,
          },
        ],
        supportsSubscription: false, identifierFields: ['pk'],
      }],
      functions: [],
      triggers: [{ type: TriggerType.ON_SCHEDULE, description: 'Poll table on schedule', filterableFields: ['tableName'] }],
      supportedOperators: [ConditionOperator.EQ, ConditionOperator.NE, ConditionOperator.GT, ConditionOperator.LT, ConditionOperator.BETWEEN, ConditionOperator.EXISTS],
      outputFormats: [DataType.JSON, DataType.ARRAY],
      tags: ['database', 'nosql', 'aws', 'dynamodb', 'cloud'], status: 'active',
    };
  }

  private createFirestoreManifest(): ConnectorManifest {
    return {
      id: 'firestore', name: 'Firestore', displayName: 'Google Firestore', version: '1.0.0', vendor: 'Google',
      description: 'Read and write documents in Google Cloud Firestore (Firebase NoSQL database).',
      categories: ['Database', 'Cloud', 'Google'],
      capabilities: { canRead: true, canWrite: true, canDelete: true, canSubscribe: true, canExecuteQueries: true, supportsRules: true, supportsDirectQuery: [DataType.JSON] },
      authentication: {
        type: 'api_key',
        fields: [
          { key: 'projectId', name: 'Project ID', type: 'string', required: true, sensitive: false },
          { key: 'serviceAccountKey', name: 'Service Account JSON', type: 'string', required: true, sensitive: true },
        ],
      },
      dataSchemas: [],
      nodes: [{
        id: 'firestore_collection', name: 'Collection', displayName: 'Firestore Collection', description: 'A Firestore collection',
        dataSchema: { name: 'FirestoreDocument', description: 'A Firestore document', fields: [{ name: 'id', type: DataType.STRING, description: 'Document ID', required: true }] },
        availableFunctions: [
          {
            id: 'firestore_getDocument', name: 'Get Document', description: 'Retrieve a document by path', category: 'READ',
            parameters: [
              { name: 'collection', type: DataType.STRING, description: 'Collection name', required: true },
              { name: 'documentId', type: DataType.STRING, description: 'Document ID', required: true },
            ],
            response: { success: true, dataType: DataType.JSON, description: 'Document data' },
            requiresAuth: true,
          },
          {
            id: 'firestore_setDocument', name: 'Set Document', description: 'Create or overwrite a document', category: 'WRITE',
            parameters: [
              { name: 'collection', type: DataType.STRING, description: 'Collection name', required: true },
              { name: 'documentId', type: DataType.STRING, description: 'Document ID (auto if omitted)', required: false },
              { name: 'data', type: DataType.OBJECT, description: 'Document fields', required: true },
              { name: 'merge', type: DataType.BOOLEAN, description: 'Merge instead of overwrite', required: false, default: false },
            ],
            response: { success: true, dataType: DataType.JSON, description: '{ id, writeTime }' },
            requiresAuth: true,
          },
          {
            id: 'firestore_updateDocument', name: 'Update Document', description: 'Partially update a document', category: 'WRITE',
            parameters: [
              { name: 'collection', type: DataType.STRING, description: 'Collection name', required: true },
              { name: 'documentId', type: DataType.STRING, description: 'Document ID', required: true },
              { name: 'data', type: DataType.OBJECT, description: 'Fields to update', required: true },
            ],
            response: { success: true, dataType: DataType.JSON, description: '{ writeTime }' },
            requiresAuth: true,
          },
          {
            id: 'firestore_deleteDocument', name: 'Delete Document', description: 'Delete a document', category: 'DELETE',
            parameters: [
              { name: 'collection', type: DataType.STRING, description: 'Collection name', required: true },
              { name: 'documentId', type: DataType.STRING, description: 'Document ID', required: true },
            ],
            response: { success: true, dataType: DataType.JSON, description: '{ writeTime }' },
            requiresAuth: true,
          },
          {
            id: 'firestore_query', name: 'Query', description: 'Query documents by field conditions', category: 'QUERY',
            parameters: [
              { name: 'collection', type: DataType.STRING, description: 'Collection name', required: true },
              { name: 'where', type: DataType.ARRAY, description: '[{field, op, value},...] conditions', required: false },
              { name: 'orderBy', type: DataType.STRING, description: 'Field to order by', required: false },
              { name: 'limit', type: DataType.INTEGER, description: 'Max results', required: false },
            ],
            response: { success: true, dataType: DataType.ARRAY, description: 'Matching documents' },
            requiresAuth: true,
          },
        ],
        supportsSubscription: true,
        subscriptionTriggerTypes: [TriggerType.ON_CREATE, TriggerType.ON_UPDATE, TriggerType.ON_DELETE],
        identifierFields: ['id'],
      }],
      functions: [],
      triggers: [
        { type: TriggerType.ON_CREATE, description: 'New document created in collection', filterableFields: ['collection'] },
        { type: TriggerType.ON_UPDATE, description: 'Document updated', filterableFields: ['collection', 'documentId'] },
        { type: TriggerType.ON_DELETE, description: 'Document deleted', filterableFields: ['collection', 'documentId'] },
      ],
      supportedOperators: [ConditionOperator.EQ, ConditionOperator.NE, ConditionOperator.GT, ConditionOperator.LT, ConditionOperator.IN, ConditionOperator.BETWEEN],
      outputFormats: [DataType.JSON, DataType.ARRAY],
      tags: ['database', 'nosql', 'google', 'firebase', 'firestore', 'realtime'], status: 'active',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FILE / CLOUD STORAGE
  // ═══════════════════════════════════════════════════════════════════════════

  private createS3Manifest(): ConnectorManifest {
    return {
      id: 's3', name: 'AWS S3', displayName: 'AWS S3 Object Storage', version: '1.0.0', vendor: 'Amazon Web Services',
      description: 'Store, retrieve and manage objects in AWS S3 buckets (or S3-compatible stores like MinIO).',
      categories: ['Storage', 'Cloud', 'Files', 'AWS'],
      capabilities: { canRead: true, canWrite: true, canDelete: true, canSubscribe: false, canExecuteQueries: false, supportsRules: true, supportsDirectQuery: [DataType.BINARY, DataType.STRING] },
      authentication: {
        type: 'api_key',
        fields: [
          { key: 'region', name: 'Region', type: 'string', required: true, sensitive: false },
          { key: 'bucket', name: 'Bucket', type: 'string', required: true, sensitive: false },
          { key: 'accessKeyId', name: 'Access Key ID', type: 'string', required: true, sensitive: false },
          { key: 'secretAccessKey', name: 'Secret Access Key', type: 'string', required: true, sensitive: true },
          { key: 'endpoint', name: 'Custom Endpoint', type: 'string', required: false, sensitive: false },
          { key: 'pathStyle', name: 'Path-style URLs', type: 'boolean', required: false, sensitive: false },
        ],
      },
      dataSchemas: [{
        name: 'S3Object', description: 'Metadata of an S3 object',
        fields: [
          { name: 'key', type: DataType.STRING, description: 'Object key (path)', required: true },
          { name: 'size', type: DataType.INTEGER, description: 'Size in bytes', required: true },
          { name: 'lastModified', type: DataType.DATETIME, description: 'Last modified', required: true },
          { name: 'etag', type: DataType.STRING, description: 'ETag hash', required: false },
          { name: 'contentType', type: DataType.STRING, description: 'MIME type', required: false },
        ],
      }],
      nodes: [],
      functions: [
        {
          id: 's3_getObject', name: 'Get Object', description: 'Download an object from S3', category: 'READ',
          parameters: [
            { name: 'key', type: DataType.STRING, description: 'Object key', required: true },
            { name: 'bucket', type: DataType.STRING, description: 'Bucket override (optional)', required: false },
          ],
          response: { success: true, dataType: DataType.BINARY, description: 'Object content + metadata' },
          requiresAuth: true,
        },
        {
          id: 's3_putObject', name: 'Put Object', description: 'Upload an object to S3', category: 'WRITE',
          parameters: [
            { name: 'key', type: DataType.STRING, description: 'Object key (path)', required: true },
            { name: 'body', type: DataType.BINARY, description: 'Object content', required: true },
            { name: 'contentType', type: DataType.STRING, description: 'MIME type', required: false },
            { name: 'metadata', type: DataType.OBJECT, description: 'Custom metadata headers', required: false },
          ],
          response: { success: true, dataType: DataType.JSON, description: '{ etag, versionId }' },
          requiresAuth: true,
        },
        {
          id: 's3_deleteObject', name: 'Delete Object', description: 'Delete an object', category: 'DELETE',
          parameters: [{ name: 'key', type: DataType.STRING, description: 'Object key', required: true }],
          response: { success: true, dataType: DataType.JSON, description: 'Delete result' },
          requiresAuth: true,
        },
        {
          id: 's3_listObjects', name: 'List Objects', description: 'List objects matching a prefix', category: 'READ',
          parameters: [
            { name: 'prefix', type: DataType.STRING, description: 'Key prefix filter', required: false },
            { name: 'maxKeys', type: DataType.INTEGER, description: 'Max results (default 1000)', required: false },
          ],
          response: { success: true, dataType: DataType.ARRAY, description: 'Array of S3Object metadata' },
          requiresAuth: true,
        },
        {
          id: 's3_getSignedUrl', name: 'Get Signed URL', description: 'Generate a pre-signed URL for temporary access', category: 'EXECUTE',
          parameters: [
            { name: 'key', type: DataType.STRING, description: 'Object key', required: true },
            { name: 'operation', type: DataType.STRING, description: 'getObject or putObject', required: true, enumValues: ['getObject', 'putObject'] },
            { name: 'expiresIn', type: DataType.INTEGER, description: 'Expiry in seconds', required: false, default: 3600 },
          ],
          response: { success: true, dataType: DataType.URL, description: 'Pre-signed URL' } as any,
          requiresAuth: true,
        },
      ],
      triggers: [],
      supportedOperators: [ConditionOperator.EQ, ConditionOperator.STARTS_WITH, ConditionOperator.REGEX],
      outputFormats: [DataType.BINARY, DataType.JSON],
      tags: ['storage', 'cloud', 'files', 'aws', 's3', 'minio'], status: 'active',
    };
  }

  private createGoogleDriveManifest(): ConnectorManifest {
    return {
      id: 'google_drive', name: 'Google Drive', displayName: 'Google Drive', version: '1.0.0', vendor: 'Google',
      description: 'List, download, upload and manage files in Google Drive.',
      categories: ['Storage', 'Files', 'Google'],
      capabilities: { canRead: true, canWrite: true, canDelete: true, canSubscribe: false, canExecuteQueries: false, supportsRules: true, supportsDirectQuery: [DataType.BINARY] },
      authentication: {
        type: 'oauth',
        fields: [
          { key: 'clientId', name: 'Client ID', type: 'string', required: true, sensitive: false },
          { key: 'clientSecret', name: 'Client Secret', type: 'string', required: true, sensitive: true },
          { key: 'refreshToken', name: 'Refresh Token', type: 'string', required: true, sensitive: true },
        ],
      },
      dataSchemas: [{
        name: 'DriveFile', description: 'A Google Drive file or folder',
        fields: [
          { name: 'id', type: DataType.STRING, description: 'File ID', required: true },
          { name: 'name', type: DataType.STRING, description: 'File name', required: true },
          { name: 'mimeType', type: DataType.STRING, description: 'MIME type', required: true },
          { name: 'size', type: DataType.INTEGER, description: 'Size in bytes', required: false },
          { name: 'modifiedTime', type: DataType.DATETIME, description: 'Last modified', required: false },
          { name: 'webViewLink', type: DataType.URL, description: 'Browser-accessible URL', required: false } as any,
        ],
      }],
      nodes: [],
      functions: [
        {
          id: 'gdrive_listFiles', name: 'List Files', description: 'List files matching a query', category: 'READ',
          parameters: [
            { name: 'query', type: DataType.STRING, description: 'Drive API query string (e.g. name contains "report")', required: false },
            { name: 'folderId', type: DataType.STRING, description: 'Parent folder ID filter', required: false },
            { name: 'pageSize', type: DataType.INTEGER, description: 'Max items', required: false, default: 50 },
          ],
          response: { success: true, dataType: DataType.ARRAY, description: 'Array of DriveFile metadata' },
          requiresAuth: true,
        },
        {
          id: 'gdrive_downloadFile', name: 'Download File', description: 'Download a file by ID', category: 'READ',
          parameters: [{ name: 'fileId', type: DataType.STRING, description: 'File ID', required: true }],
          response: { success: true, dataType: DataType.BINARY, description: 'File content' },
          requiresAuth: true,
        },
        {
          id: 'gdrive_uploadFile', name: 'Upload File', description: 'Upload a file to Drive', category: 'WRITE',
          parameters: [
            { name: 'name', type: DataType.STRING, description: 'File name', required: true },
            { name: 'content', type: DataType.BINARY, description: 'File content', required: true },
            { name: 'mimeType', type: DataType.STRING, description: 'MIME type', required: false },
            { name: 'folderId', type: DataType.STRING, description: 'Destination folder ID', required: false },
          ],
          response: { success: true, dataType: DataType.JSON, description: 'Created DriveFile metadata' },
          requiresAuth: true,
        },
        {
          id: 'gdrive_createFolder', name: 'Create Folder', description: 'Create a new folder', category: 'WRITE',
          parameters: [
            { name: 'name', type: DataType.STRING, description: 'Folder name', required: true },
            { name: 'parentId', type: DataType.STRING, description: 'Parent folder ID', required: false },
          ],
          response: { success: true, dataType: DataType.JSON, description: 'Created folder metadata' },
          requiresAuth: true,
        },
        {
          id: 'gdrive_deleteFile', name: 'Delete File', description: 'Delete a file or folder', category: 'DELETE',
          parameters: [{ name: 'fileId', type: DataType.STRING, description: 'File ID', required: true }],
          response: { success: true, dataType: DataType.JSON, description: 'Delete result' },
          requiresAuth: true,
        },
      ],
      triggers: [],
      supportedOperators: [ConditionOperator.EQ, ConditionOperator.CONTAINS, ConditionOperator.STARTS_WITH],
      outputFormats: [DataType.BINARY, DataType.JSON],
      tags: ['storage', 'files', 'google', 'cloud', 'drive'], status: 'active',
    };
  }

  private createDropboxManifest(): ConnectorManifest {
    return {
      id: 'dropbox', name: 'Dropbox', displayName: 'Dropbox', version: '1.0.0', vendor: 'Dropbox',
      description: 'Upload, download and manage files in Dropbox.',
      categories: ['Storage', 'Files'],
      capabilities: { canRead: true, canWrite: true, canDelete: true, canSubscribe: false, canExecuteQueries: false, supportsRules: true, supportsDirectQuery: [DataType.BINARY] },
      authentication: {
        type: 'oauth',
        fields: [
          { key: 'accessToken', name: 'Access Token', type: 'string', required: false, sensitive: true },
          { key: 'appKey', name: 'App Key', type: 'string', required: false, sensitive: false },
          { key: 'appSecret', name: 'App Secret', type: 'string', required: false, sensitive: true },
          { key: 'refreshToken', name: 'Refresh Token', type: 'string', required: false, sensitive: true },
        ],
      },
      dataSchemas: [],
      nodes: [],
      functions: [
        {
          id: 'dropbox_listFolder', name: 'List Folder', description: 'List files and folders at a path', category: 'READ',
          parameters: [
            { name: 'path', type: DataType.STRING, description: 'Dropbox path (e.g. /reports)', required: true },
            { name: 'recursive', type: DataType.BOOLEAN, description: 'Include subfolders', required: false, default: false },
          ],
          response: { success: true, dataType: DataType.ARRAY, description: 'Array of file/folder metadata' },
          requiresAuth: true,
        },
        {
          id: 'dropbox_download', name: 'Download', description: 'Download a file', category: 'READ',
          parameters: [{ name: 'path', type: DataType.STRING, description: 'File path', required: true }],
          response: { success: true, dataType: DataType.BINARY, description: 'File content' },
          requiresAuth: true,
        },
        {
          id: 'dropbox_upload', name: 'Upload', description: 'Upload a file', category: 'WRITE',
          parameters: [
            { name: 'path', type: DataType.STRING, description: 'Destination path', required: true },
            { name: 'content', type: DataType.BINARY, description: 'File content', required: true },
            { name: 'mode', type: DataType.STRING, description: 'add | overwrite | update', required: false, default: 'add' },
          ],
          response: { success: true, dataType: DataType.JSON, description: 'File metadata' },
          requiresAuth: true,
        },
        {
          id: 'dropbox_delete', name: 'Delete', description: 'Delete a file or folder', category: 'DELETE',
          parameters: [{ name: 'path', type: DataType.STRING, description: 'Path to delete', required: true }],
          response: { success: true, dataType: DataType.JSON, description: 'Delete result' },
          requiresAuth: true,
        },
        {
          id: 'dropbox_getSharedLink', name: 'Get Shared Link', description: 'Create a shared link for a file', category: 'EXECUTE',
          parameters: [{ name: 'path', type: DataType.STRING, description: 'File path', required: true }],
          response: { success: true, dataType: DataType.STRING, description: 'Shared URL' },
          requiresAuth: true,
        },
      ],
      triggers: [],
      supportedOperators: [ConditionOperator.EQ, ConditionOperator.STARTS_WITH],
      outputFormats: [DataType.BINARY, DataType.JSON],
      tags: ['storage', 'files', 'dropbox', 'cloud'], status: 'active',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IoT / STREAMING
  // ═══════════════════════════════════════════════════════════════════════════

  private createMqttManifest(): ConnectorManifest {
    return {
      id: 'mqtt', name: 'MQTT', displayName: 'MQTT Broker', version: '1.0.0',
      description: 'Publish and subscribe to MQTT topics. Ideal for IoT and M2M communication.',
      categories: ['IoT', 'Messaging', 'Streaming'],
      capabilities: { canRead: true, canWrite: true, canDelete: false, canSubscribe: true, canExecuteQueries: false, supportsRules: true, supportsDirectQuery: [DataType.JSON, DataType.STRING] },
      authentication: {
        type: 'basic',
        fields: [
          { key: 'brokerUrl', name: 'Broker URL', type: 'string', required: true, sensitive: false },
          { key: 'clientId', name: 'Client ID', type: 'string', required: false, sensitive: false },
          { key: 'username', name: 'Username', type: 'string', required: false, sensitive: false },
          { key: 'password', name: 'Password', type: 'string', required: false, sensitive: true },
          { key: 'useTls', name: 'TLS / SSL', type: 'boolean', required: false, sensitive: false },
        ],
      },
      dataSchemas: [{
        name: 'MqttMessage', description: 'An MQTT message',
        fields: [
          { name: 'topic', type: DataType.STRING, description: 'Topic path', required: true },
          { name: 'payload', type: DataType.STRING, description: 'Message payload', required: true },
          { name: 'qos', type: DataType.INTEGER, description: 'QoS level (0, 1, 2)', required: false },
          { name: 'retain', type: DataType.BOOLEAN, description: 'Retained message?', required: false },
        ],
      }],
      nodes: [{
        id: 'mqtt_topic', name: 'Topic', displayName: 'MQTT Topic', description: 'An MQTT topic subscription',
        dataSchema: { name: 'MqttMessage', description: 'MQTT message', fields: [{ name: 'topic', type: DataType.STRING, description: 'Topic', required: true }, { name: 'payload', type: DataType.STRING, description: 'Payload', required: true }] },
        availableFunctions: [
          {
            id: 'mqtt_publish', name: 'Publish', description: 'Publish a message to a topic', category: 'WRITE',
            parameters: [
              { name: 'topic', type: DataType.STRING, description: 'Topic to publish to', required: true },
              { name: 'payload', type: DataType.STRING, description: 'Message payload (string or JSON)', required: true },
              { name: 'qos', type: DataType.INTEGER, description: 'QoS level', required: false, default: 0 },
              { name: 'retain', type: DataType.BOOLEAN, description: 'Retain message on broker', required: false, default: false },
            ],
            response: { success: true, dataType: DataType.JSON, description: 'Publish result' },
            requiresAuth: false,
          },
          {
            id: 'mqtt_subscribe', name: 'Subscribe', description: 'Subscribe to a topic and receive messages', category: 'READ',
            parameters: [
              { name: 'topic', type: DataType.STRING, description: 'Topic pattern (supports wildcards + and #)', required: true },
              { name: 'qos', type: DataType.INTEGER, description: 'QoS level', required: false, default: 0 },
            ],
            response: { success: true, dataType: DataType.JSON, description: 'Subscription confirmation; messages arrive as events' },
            requiresAuth: false,
          },
        ],
        supportsSubscription: true,
        subscriptionTriggerTypes: [TriggerType.ON_CREATE],
        identifierFields: ['topic'],
      }],
      functions: [],
      triggers: [
        { type: TriggerType.ON_CREATE, description: 'New message received on subscribed topic', filterableFields: ['topic', 'payload'], debounceMs: 100 },
      ],
      supportedOperators: [ConditionOperator.EQ, ConditionOperator.CONTAINS, ConditionOperator.REGEX, ConditionOperator.STARTS_WITH],
      outputFormats: [DataType.STRING, DataType.JSON],
      tags: ['iot', 'mqtt', 'messaging', 'pub-sub', 'realtime'], status: 'active',
    };
  }

  private createInfluxdbManifest(): ConnectorManifest {
    return {
      id: 'influxdb', name: 'InfluxDB', displayName: 'InfluxDB Time Series', version: '1.0.0', vendor: 'InfluxData',
      description: 'Query and write time-series data in InfluxDB. Ideal for metrics, monitoring and sensor data.',
      categories: ['Database', 'Time Series', 'IoT'],
      capabilities: { canRead: true, canWrite: true, canDelete: false, canSubscribe: false, canExecuteQueries: true, supportsRules: true, supportsDirectQuery: [DataType.JSON] },
      authentication: {
        type: 'bearer',
        fields: [
          { key: 'url', name: 'URL', type: 'string', required: true, sensitive: false },
          { key: 'token', name: 'API Token', type: 'string', required: true, sensitive: true },
          { key: 'org', name: 'Organization', type: 'string', required: true, sensitive: false },
          { key: 'bucket', name: 'Default Bucket', type: 'string', required: true, sensitive: false },
        ],
      },
      dataSchemas: [{
        name: 'InfluxPoint', description: 'A time-series data point',
        fields: [
          { name: 'measurement', type: DataType.STRING, description: 'Measurement name (table)', required: true },
          { name: 'tags', type: DataType.OBJECT, description: 'Tag set (indexed metadata)', required: false },
          { name: 'fields', type: DataType.OBJECT, description: 'Field set (actual values)', required: true },
          { name: 'timestamp', type: DataType.DATETIME, description: 'Data point timestamp', required: false },
        ],
      }],
      nodes: [],
      functions: [
        {
          id: 'influx_query', name: 'Query', description: 'Execute a Flux query and return results', category: 'QUERY',
          parameters: [
            { name: 'query', type: DataType.STRING, description: 'Flux query string', required: true },
            { name: 'bucket', type: DataType.STRING, description: 'Override default bucket', required: false },
          ],
          response: { success: true, dataType: DataType.ARRAY, description: 'Query result tables' },
          requiresAuth: true,
        },
        {
          id: 'influx_write', name: 'Write', description: 'Write one or more data points', category: 'WRITE',
          parameters: [
            { name: 'points', type: DataType.ARRAY, description: 'Array of InfluxPoint objects', required: true },
            { name: 'bucket', type: DataType.STRING, description: 'Override default bucket', required: false },
            { name: 'precision', type: DataType.STRING, description: 'Timestamp precision: ns/us/ms/s', required: false, default: 'ms' },
          ],
          response: { success: true, dataType: DataType.JSON, description: 'Write result' },
          requiresAuth: true,
        },
      ],
      triggers: [
        { type: TriggerType.ON_SCHEDULE, description: 'Run a Flux query on schedule', filterableFields: ['measurement', 'bucket'] },
      ],
      supportedOperators: [ConditionOperator.EQ, ConditionOperator.GT, ConditionOperator.LT, ConditionOperator.BETWEEN],
      outputFormats: [DataType.JSON, DataType.ARRAY],
      tags: ['database', 'timeseries', 'influxdb', 'metrics', 'iot', 'monitoring'], status: 'active',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMUNICATION
  // ═══════════════════════════════════════════════════════════════════════════

  private createSmtpManifest(): ConnectorManifest {
    return {
      id: 'smtp', name: 'Email (SMTP)', displayName: 'SMTP Email', version: '1.0.0',
      description: 'Send transactional or notification emails via any SMTP server (Gmail, Mailgun, SendGrid, etc.).',
      categories: ['Communication', 'Email'],
      capabilities: { canRead: false, canWrite: true, canDelete: false, canSubscribe: false, canExecuteQueries: false, supportsRules: true, supportsDirectQuery: [] },
      authentication: {
        type: 'basic',
        fields: [
          { key: 'host', name: 'SMTP Host', type: 'string', required: true, sensitive: false },
          { key: 'port', name: 'Port', type: 'string', required: true, sensitive: false },
          { key: 'from', name: 'Sender Address', type: 'string', required: true, sensitive: false },
          { key: 'username', name: 'Username', type: 'string', required: false, sensitive: false },
          { key: 'password', name: 'Password', type: 'string', required: false, sensitive: true },
          { key: 'secure', name: 'TLS (port 465)', type: 'boolean', required: false, sensitive: false },
        ],
      },
      dataSchemas: [],
      nodes: [],
      functions: [
        {
          id: 'smtp_sendEmail', name: 'Send Email', description: 'Send an email message', category: 'WRITE',
          parameters: [
            { name: 'to', type: DataType.STRING, description: 'Recipient(s), comma-separated', required: true },
            { name: 'subject', type: DataType.STRING, description: 'Email subject', required: true },
            { name: 'body', type: DataType.STRING, description: 'Email body (plain text)', required: false },
            { name: 'html', type: DataType.STRING, description: 'HTML body (overrides body if set)', required: false },
            { name: 'cc', type: DataType.STRING, description: 'CC recipients', required: false },
            { name: 'bcc', type: DataType.STRING, description: 'BCC recipients', required: false },
            { name: 'replyTo', type: DataType.STRING, description: 'Reply-To address', required: false },
            { name: 'attachments', type: DataType.ARRAY, description: 'Attachment objects {filename, content}', required: false },
          ],
          response: { success: true, dataType: DataType.JSON, description: '{ messageId, accepted, rejected }' },
          requiresAuth: true,
          examples: [
            {
              description: 'Send a compliance alert',
              input: { to: 'admin@company.com', subject: 'Compliance Alert', body: 'Action required.' },
              output: { messageId: '<msg-id@smtp>', accepted: ['admin@company.com'] },
            },
          ],
        },
      ],
      triggers: [],
      supportedOperators: [],
      outputFormats: [DataType.JSON],
      tags: ['email', 'smtp', 'communication', 'notification'], status: 'active',
    };
  }

  private createTeamsManifest(): ConnectorManifest {
    return {
      id: 'teams', name: 'Microsoft Teams', displayName: 'Microsoft Teams', version: '1.0.0', vendor: 'Microsoft',
      description: 'Post adaptive cards and messages to Microsoft Teams channels via incoming webhooks or Bot Framework.',
      categories: ['Communication', 'Collaboration', 'Microsoft'],
      capabilities: { canRead: false, canWrite: true, canDelete: false, canSubscribe: false, canExecuteQueries: false, supportsRules: true, supportsDirectQuery: [] },
      authentication: {
        type: 'api_key',
        fields: [
          { key: 'webhookUrl', name: 'Webhook URL', type: 'string', required: true, sensitive: true },
        ],
      },
      dataSchemas: [],
      nodes: [],
      functions: [
        {
          id: 'teams_sendMessage', name: 'Send Message', description: 'Post a text message to a Teams channel via webhook', category: 'WRITE',
          parameters: [
            { name: 'text', type: DataType.STRING, description: 'Message text (Markdown supported)', required: true },
            { name: 'title', type: DataType.STRING, description: 'Card title', required: false },
            { name: 'themeColor', type: DataType.STRING, description: 'Hex colour for card stripe', required: false, default: '0078D4' },
          ],
          response: { success: true, dataType: DataType.JSON, description: 'Post result' },
          requiresAuth: true,
          examples: [
            {
              description: 'Send a red alert',
              input: { title: '🚨 Alert', text: 'CPU > 90% on prod-server', themeColor: 'FF0000' },
              output: { ok: true },
            },
          ],
        },
        {
          id: 'teams_sendAdaptiveCard', name: 'Send Adaptive Card', description: 'Post a rich Adaptive Card payload', category: 'WRITE',
          parameters: [
            { name: 'card', type: DataType.OBJECT, description: 'Adaptive Card JSON payload', required: true },
          ],
          response: { success: true, dataType: DataType.JSON, description: 'Post result' },
          requiresAuth: true,
        },
      ],
      triggers: [],
      supportedOperators: [],
      outputFormats: [DataType.JSON],
      tags: ['teams', 'microsoft', 'communication', 'webhook', 'notification'], status: 'active',
    };
  }

  private createWhatsappManifest(): ConnectorManifest {
    return {
      id: 'whatsapp', name: 'WhatsApp', displayName: 'WhatsApp Business (Cloud API)', version: '1.0.0', vendor: 'Meta',
      description: 'Send and receive WhatsApp messages via the Meta WhatsApp Cloud Business API.',
      categories: ['Communication', 'Messaging'],
      capabilities: { canRead: true, canWrite: true, canDelete: false, canSubscribe: true, canExecuteQueries: false, supportsRules: true, supportsDirectQuery: [] },
      authentication: {
        type: 'bearer',
        fields: [
          { key: 'apiUrl', name: 'API URL', type: 'string', required: true, sensitive: false },
          { key: 'phoneNumberId', name: 'Phone Number ID', type: 'string', required: true, sensitive: false },
          { key: 'accessToken', name: 'Access Token', type: 'string', required: true, sensitive: true },
          { key: 'wabaId', name: 'WABA ID', type: 'string', required: false, sensitive: false },
        ],
      },
      dataSchemas: [{
        name: 'WhatsAppMessage', description: 'A WhatsApp Cloud API message',
        fields: [
          { name: 'to', type: DataType.PHONE, description: 'Recipient phone (E.164)', required: true } as any,
          { name: 'type', type: DataType.STRING, description: 'text | template | image | document | audio', required: true },
          { name: 'body', type: DataType.STRING, description: 'Message text body', required: false },
          { name: 'templateName', type: DataType.STRING, description: 'Approved template name', required: false },
          { name: 'templateLanguage', type: DataType.STRING, description: 'Template language code', required: false },
        ],
      }],
      nodes: [],
      functions: [
        {
          id: 'whatsapp_sendText', name: 'Send Text', description: 'Send a plain text message', category: 'WRITE',
          parameters: [
            { name: 'to', type: DataType.STRING, description: 'Recipient phone in E.164 format', required: true },
            { name: 'text', type: DataType.STRING, description: 'Message text', required: true },
          ],
          response: { success: true, dataType: DataType.JSON, description: '{ messageId }' },
          requiresAuth: true,
        },
        {
          id: 'whatsapp_sendTemplate', name: 'Send Template', description: 'Send an approved template message', category: 'WRITE',
          parameters: [
            { name: 'to', type: DataType.STRING, description: 'Recipient phone', required: true },
            { name: 'templateName', type: DataType.STRING, description: 'Approved template name', required: true },
            { name: 'languageCode', type: DataType.STRING, description: 'Language code (e.g. en_US)', required: true },
            { name: 'components', type: DataType.ARRAY, description: 'Template component parameters', required: false },
          ],
          response: { success: true, dataType: DataType.JSON, description: '{ messageId }' },
          requiresAuth: true,
        },
        {
          id: 'whatsapp_sendMedia', name: 'Send Media', description: 'Send an image, document or audio file', category: 'WRITE',
          parameters: [
            { name: 'to', type: DataType.STRING, description: 'Recipient phone', required: true },
            { name: 'mediaType', type: DataType.STRING, description: 'image | document | audio | video', required: true },
            { name: 'mediaUrl', type: DataType.STRING, description: 'Publicly accessible media URL', required: true },
            { name: 'caption', type: DataType.STRING, description: 'Optional caption', required: false },
          ],
          response: { success: true, dataType: DataType.JSON, description: '{ messageId }' },
          requiresAuth: true,
        },
      ],
      triggers: [
        { type: TriggerType.ON_WEBHOOK, description: 'Incoming message or status update webhook from Meta', filterableFields: ['from', 'type', 'status'] },
      ],
      supportedOperators: [ConditionOperator.EQ, ConditionOperator.CONTAINS],
      outputFormats: [DataType.JSON],
      tags: ['whatsapp', 'messaging', 'sms', 'communication', 'meta'], status: 'active',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ERP / SaaS
  // ═══════════════════════════════════════════════════════════════════════════

  private createShopifyManifest(): ConnectorManifest {
    return {
      id: 'shopify', name: 'Shopify', displayName: 'Shopify', version: '1.0.0', vendor: 'Shopify',
      description: 'Manage orders, products, customers and inventory in a Shopify store.',
      categories: ['E-commerce', 'ERP', 'SaaS'],
      capabilities: { canRead: true, canWrite: true, canDelete: true, canSubscribe: true, canExecuteQueries: true, supportsRules: true, supportsDirectQuery: [DataType.JSON] },
      authentication: {
        type: 'api_key',
        fields: [
          { key: 'shopDomain', name: 'Shop Domain', type: 'string', required: true, sensitive: false },
          { key: 'accessToken', name: 'Access Token', type: 'string', required: true, sensitive: true },
        ],
      },
      dataSchemas: [
        {
          name: 'ShopifyOrder', description: 'A Shopify order',
          fields: [
            { name: 'id', type: DataType.INTEGER, description: 'Order ID', required: true },
            { name: 'orderNumber', type: DataType.STRING, description: 'Human-readable number', required: true },
            { name: 'financialStatus', type: DataType.STRING, description: 'pending | paid | refunded | voided', required: true },
            { name: 'fulfillmentStatus', type: DataType.STRING, description: 'fulfilled | partial | null', required: false },
            { name: 'totalPrice', type: DataType.STRING, description: 'Order total', required: true },
            { name: 'createdAt', type: DataType.DATETIME, description: 'Creation timestamp', required: true },
          ],
        },
        {
          name: 'ShopifyProduct', description: 'A Shopify product',
          fields: [
            { name: 'id', type: DataType.INTEGER, description: 'Product ID', required: true },
            { name: 'title', type: DataType.STRING, description: 'Product title', required: true },
            { name: 'status', type: DataType.STRING, description: 'active | archived | draft', required: true },
            { name: 'vendor', type: DataType.STRING, description: 'Vendor name', required: false },
          ],
        },
      ],
      nodes: [],
      functions: [
        {
          id: 'shopify_getOrders', name: 'Get Orders', description: 'List orders with optional filters', category: 'READ',
          parameters: [
            { name: 'status', type: DataType.STRING, description: 'Filter: open | closed | cancelled | any', required: false, default: 'open' },
            { name: 'financialStatus', type: DataType.STRING, description: 'Filter by financial status', required: false },
            { name: 'limit', type: DataType.INTEGER, description: 'Max results (max 250)', required: false, default: 50 },
            { name: 'since_id', type: DataType.INTEGER, description: 'Paginate from this order ID', required: false },
          ],
          response: { success: true, dataType: DataType.ARRAY, description: 'Array of ShopifyOrder' },
          requiresAuth: true,
        },
        {
          id: 'shopify_getOrder', name: 'Get Order', description: 'Get a single order by ID', category: 'READ',
          parameters: [{ name: 'orderId', type: DataType.INTEGER, description: 'Order ID', required: true }],
          response: { success: true, dataType: DataType.JSON, description: 'ShopifyOrder' },
          requiresAuth: true,
        },
        {
          id: 'shopify_updateOrder', name: 'Update Order', description: 'Update order fields (note, tags, etc.)', category: 'WRITE',
          parameters: [
            { name: 'orderId', type: DataType.INTEGER, description: 'Order ID', required: true },
            { name: 'data', type: DataType.OBJECT, description: 'Fields to update', required: true },
          ],
          response: { success: true, dataType: DataType.JSON, description: 'Updated ShopifyOrder' },
          requiresAuth: true,
        },
        {
          id: 'shopify_getProducts', name: 'Get Products', description: 'List products', category: 'READ',
          parameters: [
            { name: 'status', type: DataType.STRING, description: 'active | archived | draft', required: false },
            { name: 'limit', type: DataType.INTEGER, description: 'Max results', required: false, default: 50 },
          ],
          response: { success: true, dataType: DataType.ARRAY, description: 'Array of ShopifyProduct' },
          requiresAuth: true,
        },
        {
          id: 'shopify_getCustomers', name: 'Get Customers', description: 'Search and list customers', category: 'READ',
          parameters: [
            { name: 'query', type: DataType.STRING, description: 'Search query (email, name, etc.)', required: false },
            { name: 'limit', type: DataType.INTEGER, description: 'Max results', required: false, default: 50 },
          ],
          response: { success: true, dataType: DataType.ARRAY, description: 'Array of customer objects' },
          requiresAuth: true,
        },
      ],
      triggers: [
        { type: TriggerType.ON_CREATE, description: 'New order created', filterableFields: ['financialStatus', 'totalPrice'] },
        { type: TriggerType.ON_UPDATE, description: 'Order updated or fulfilled', filterableFields: ['orderId', 'financialStatus', 'fulfillmentStatus'] },
        { type: TriggerType.ON_WEBHOOK, description: 'Shopify webhook event', filterableFields: ['topic'] },
      ],
      supportedOperators: [ConditionOperator.EQ, ConditionOperator.NE, ConditionOperator.GT, ConditionOperator.LT, ConditionOperator.IN, ConditionOperator.CONTAINS],
      outputFormats: [DataType.JSON, DataType.ARRAY],
      tags: ['shopify', 'ecommerce', 'orders', 'saas'], status: 'active',
    };
  }

  private createStripeManifest(): ConnectorManifest {
    return {
      id: 'stripe', name: 'Stripe', displayName: 'Stripe Payments', version: '1.0.0', vendor: 'Stripe',
      description: 'Process payments, manage customers, subscriptions and invoices via the Stripe API.',
      categories: ['Payment', 'Finance', 'SaaS'],
      capabilities: { canRead: true, canWrite: true, canDelete: false, canSubscribe: true, canExecuteQueries: true, supportsRules: true, supportsDirectQuery: [DataType.JSON] },
      authentication: {
        type: 'api_key',
        fields: [
          { key: 'secretKey', name: 'Secret Key', type: 'string', required: true, sensitive: true },
          { key: 'webhookSecret', name: 'Webhook Secret', type: 'string', required: false, sensitive: true },
        ],
      },
      dataSchemas: [
        {
          name: 'StripePaymentIntent', description: 'A Stripe PaymentIntent',
          fields: [
            { name: 'id', type: DataType.STRING, description: 'pi_... ID', required: true },
            { name: 'amount', type: DataType.INTEGER, description: 'Amount in centimes', required: true },
            { name: 'currency', type: DataType.STRING, description: 'ISO currency code', required: true },
            { name: 'status', type: DataType.STRING, description: 'requires_payment_method | succeeded | canceled | ...', required: true },
          ],
        },
      ],
      nodes: [],
      functions: [
        {
          id: 'stripe_createPaymentIntent', name: 'Create Payment Intent', description: 'Create a PaymentIntent for a charge', category: 'WRITE',
          parameters: [
            { name: 'amount', type: DataType.INTEGER, description: 'Amount in smallest currency unit (centimes)', required: true },
            { name: 'currency', type: DataType.STRING, description: 'ISO currency code (e.g. eur)', required: true },
            { name: 'customerId', type: DataType.STRING, description: 'Stripe customer ID', required: false },
            { name: 'metadata', type: DataType.OBJECT, description: 'Custom metadata', required: false },
          ],
          response: { success: true, dataType: DataType.JSON, description: 'StripePaymentIntent object' },
          requiresAuth: true,
        },
        {
          id: 'stripe_getCustomer', name: 'Get Customer', description: 'Retrieve a customer by ID', category: 'READ',
          parameters: [{ name: 'customerId', type: DataType.STRING, description: 'Stripe customer ID (cus_...)', required: true }],
          response: { success: true, dataType: DataType.JSON, description: 'Stripe Customer object' },
          requiresAuth: true,
        },
        {
          id: 'stripe_createCustomer', name: 'Create Customer', description: 'Create a new Stripe customer', category: 'WRITE',
          parameters: [
            { name: 'email', type: DataType.EMAIL, description: 'Customer email', required: true } as any,
            { name: 'name', type: DataType.STRING, description: 'Customer name', required: false },
            { name: 'metadata', type: DataType.OBJECT, description: 'Custom metadata', required: false },
          ],
          response: { success: true, dataType: DataType.JSON, description: 'Stripe Customer object' },
          requiresAuth: true,
        },
        {
          id: 'stripe_listInvoices', name: 'List Invoices', description: 'List invoices for a customer', category: 'READ',
          parameters: [
            { name: 'customerId', type: DataType.STRING, description: 'Stripe customer ID', required: false },
            { name: 'status', type: DataType.STRING, description: 'draft | open | paid | void | uncollectible', required: false },
            { name: 'limit', type: DataType.INTEGER, description: 'Max results', required: false, default: 10 },
          ],
          response: { success: true, dataType: DataType.ARRAY, description: 'Array of Stripe Invoice objects' },
          requiresAuth: true,
        },
        {
          id: 'stripe_createRefund', name: 'Create Refund', description: 'Refund a payment', category: 'WRITE',
          parameters: [
            { name: 'paymentIntentId', type: DataType.STRING, description: 'PaymentIntent ID', required: true },
            { name: 'amount', type: DataType.INTEGER, description: 'Amount to refund (full if omitted)', required: false },
            { name: 'reason', type: DataType.STRING, description: 'duplicate | fraudulent | requested_by_customer', required: false },
          ],
          response: { success: true, dataType: DataType.JSON, description: 'Stripe Refund object' },
          requiresAuth: true,
        },
      ],
      triggers: [
        { type: TriggerType.ON_WEBHOOK, description: 'Stripe webhook event (payment_intent.succeeded, charge.failed, invoice.paid, ...)', filterableFields: ['type', 'data.object.status', 'data.object.amount'] },
      ],
      supportedOperators: [ConditionOperator.EQ, ConditionOperator.NE, ConditionOperator.GT, ConditionOperator.LT, ConditionOperator.IN],
      outputFormats: [DataType.JSON],
      tags: ['payment', 'stripe', 'finance', 'billing'], status: 'active',
    };
  }

  private createHubspotManifest(): ConnectorManifest {
    return {
      id: 'hubspot', name: 'HubSpot', displayName: 'HubSpot CRM', version: '1.0.0', vendor: 'HubSpot',
      description: 'Create and manage contacts, deals, companies and marketing data in HubSpot CRM.',
      categories: ['CRM', 'Marketing', 'SaaS'],
      capabilities: { canRead: true, canWrite: true, canDelete: true, canSubscribe: true, canExecuteQueries: true, supportsRules: true, supportsDirectQuery: [DataType.JSON] },
      authentication: {
        type: 'bearer',
        fields: [
          { key: 'accessToken', name: 'Private App Access Token', type: 'string', required: true, sensitive: true },
          { key: 'portalId', name: 'Portal ID', type: 'string', required: false, sensitive: false },
        ],
      },
      dataSchemas: [
        {
          name: 'HubSpotContact', description: 'A HubSpot CRM contact',
          fields: [
            { name: 'id', type: DataType.STRING, description: 'Contact ID', required: true },
            { name: 'email', type: DataType.EMAIL, description: 'Email address', required: false } as any,
            { name: 'firstname', type: DataType.STRING, description: 'First name', required: false },
            { name: 'lastname', type: DataType.STRING, description: 'Last name', required: false },
            { name: 'lifecyclestage', type: DataType.STRING, description: 'subscriber | lead | customer | ...', required: false },
          ],
        },
        {
          name: 'HubSpotDeal', description: 'A HubSpot deal',
          fields: [
            { name: 'id', type: DataType.STRING, description: 'Deal ID', required: true },
            { name: 'dealname', type: DataType.STRING, description: 'Deal name', required: true },
            { name: 'amount', type: DataType.NUMBER, description: 'Deal amount', required: false },
            { name: 'dealstage', type: DataType.STRING, description: 'Pipeline stage id', required: false },
            { name: 'closedate', type: DataType.DATETIME, description: 'Expected close date', required: false },
          ],
        },
      ],
      nodes: [],
      functions: [
        {
          id: 'hubspot_searchContacts', name: 'Search Contacts', description: 'Search CRM contacts by properties', category: 'QUERY',
          parameters: [
            { name: 'filterGroups', type: DataType.ARRAY, description: 'HubSpot filter groups array', required: false },
            { name: 'properties', type: DataType.ARRAY, description: 'Properties to return', required: false },
            { name: 'limit', type: DataType.INTEGER, description: 'Max results', required: false, default: 20 },
          ],
          response: { success: true, dataType: DataType.ARRAY, description: 'Array of HubSpotContact' },
          requiresAuth: true,
        },
        {
          id: 'hubspot_createContact', name: 'Create Contact', description: 'Create a new CRM contact', category: 'WRITE',
          parameters: [
            { name: 'properties', type: DataType.OBJECT, description: 'Contact properties (email, firstname, etc.)', required: true },
          ],
          response: { success: true, dataType: DataType.JSON, description: 'Created HubSpotContact' },
          requiresAuth: true,
        },
        {
          id: 'hubspot_updateContact', name: 'Update Contact', description: 'Update a contact by ID', category: 'WRITE',
          parameters: [
            { name: 'contactId', type: DataType.STRING, description: 'Contact ID', required: true },
            { name: 'properties', type: DataType.OBJECT, description: 'Properties to update', required: true },
          ],
          response: { success: true, dataType: DataType.JSON, description: 'Updated HubSpotContact' },
          requiresAuth: true,
        },
        {
          id: 'hubspot_getDeals', name: 'Get Deals', description: 'List deals optionally filtered by pipeline stage', category: 'READ',
          parameters: [
            { name: 'pipelineId', type: DataType.STRING, description: 'Pipeline ID', required: false },
            { name: 'stageId', type: DataType.STRING, description: 'Stage ID', required: false },
            { name: 'limit', type: DataType.INTEGER, description: 'Max results', required: false, default: 20 },
          ],
          response: { success: true, dataType: DataType.ARRAY, description: 'Array of HubSpotDeal' },
          requiresAuth: true,
        },
        {
          id: 'hubspot_createDeal', name: 'Create Deal', description: 'Create a new deal in the CRM pipeline', category: 'WRITE',
          parameters: [
            { name: 'properties', type: DataType.OBJECT, description: 'Deal properties (dealname, amount, etc.)', required: true },
            { name: 'associations', type: DataType.ARRAY, description: 'Links to contacts / companies', required: false },
          ],
          response: { success: true, dataType: DataType.JSON, description: 'Created HubSpotDeal' },
          requiresAuth: true,
        },
      ],
      triggers: [
        { type: TriggerType.ON_WEBHOOK, description: 'HubSpot subscription webhook (contact created, deal stage changed, etc.)', filterableFields: ['eventType', 'objectId', 'propertyName'] },
      ],
      supportedOperators: [ConditionOperator.EQ, ConditionOperator.NE, ConditionOperator.CONTAINS, ConditionOperator.IN],
      outputFormats: [DataType.JSON, DataType.ARRAY],
      tags: ['crm', 'hubspot', 'marketing', 'sales', 'saas'], status: 'active',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERIC
  // ═══════════════════════════════════════════════════════════════════════════

  private createWebhookManifest(): ConnectorManifest {
    return {
      id: 'webhook', name: 'Webhook', displayName: 'Outgoing Webhook', version: '1.0.0',
      description: 'Send HTTP POST notifications to any external endpoint with optional HMAC signature.',
      categories: ['Integration', 'Generic'],
      capabilities: { canRead: false, canWrite: true, canDelete: false, canSubscribe: false, canExecuteQueries: false, supportsRules: true, supportsDirectQuery: [] },
      authentication: {
        type: 'custom',
        fields: [
          { key: 'endpointUrl', name: 'Endpoint URL', type: 'string', required: true, sensitive: false },
          { key: 'secret', name: 'HMAC Secret', type: 'string', required: false, sensitive: true },
          { key: 'authHeader', name: 'Auth Header Value', type: 'string', required: false, sensitive: true },
        ],
      },
      dataSchemas: [],
      nodes: [],
      functions: [
        {
          id: 'webhook_send', name: 'Send', description: 'POST a JSON payload to the configured endpoint', category: 'WRITE',
          parameters: [
            { name: 'payload', type: DataType.OBJECT, description: 'JSON body to send', required: true },
            { name: 'headers', type: DataType.OBJECT, description: 'Extra HTTP headers', required: false },
            { name: 'timeoutMs', type: DataType.INTEGER, description: 'Request timeout (default 5000 ms)', required: false },
          ],
          response: { success: true, dataType: DataType.JSON, description: '{ status, responseBody, responseHeaders }' },
          requiresAuth: false,
          examples: [
            {
              description: 'Notify external service of a compliance event',
              input: { payload: { event: 'compliance.violation', severity: 'high', entityId: 'ORD-123' } },
              output: { status: 200, responseBody: { received: true } },
            },
          ],
        },
      ],
      triggers: [
        { type: TriggerType.ON_WEBHOOK, description: 'Incoming webhook call to eyeflow webhook endpoint', filterableFields: ['headers', 'body'] },
      ],
      supportedOperators: [ConditionOperator.EQ, ConditionOperator.CONTAINS],
      outputFormats: [DataType.JSON],
      tags: ['webhook', 'http', 'integration', 'generic'], status: 'active',
    };
  }

  private createGraphqlManifest(): ConnectorManifest {
    return {
      id: 'graphql', name: 'GraphQL', displayName: 'GraphQL API', version: '1.0.0',
      description: 'Execute queries and mutations against any GraphQL endpoint.',
      categories: ['API', 'Integration', 'Generic'],
      capabilities: { canRead: true, canWrite: true, canDelete: true, canSubscribe: false, canExecuteQueries: true, supportsRules: true, supportsDirectQuery: [DataType.JSON] },
      authentication: {
        type: 'custom',
        fields: [
          { key: 'endpoint', name: 'GraphQL Endpoint', type: 'string', required: true, sensitive: false },
          { key: 'authType', name: 'Auth Type', type: 'string', required: false, sensitive: false },
          { key: 'apiKeyHeader', name: 'API Key Header', type: 'string', required: false, sensitive: false },
          { key: 'apiKey', name: 'API Key', type: 'string', required: false, sensitive: true },
          { key: 'bearerToken', name: 'Bearer Token', type: 'string', required: false, sensitive: true },
          { key: 'username', name: 'Username (Basic)', type: 'string', required: false, sensitive: false },
          { key: 'password', name: 'Password (Basic)', type: 'string', required: false, sensitive: true },
        ],
      },
      dataSchemas: [],
      nodes: [],
      functions: [
        {
          id: 'graphql_query', name: 'Query', description: 'Execute a GraphQL query (read-only)', category: 'QUERY',
          parameters: [
            { name: 'query', type: DataType.STRING, description: 'GraphQL query string', required: true },
            { name: 'variables', type: DataType.OBJECT, description: 'Query variables', required: false },
            { name: 'operationName', type: DataType.STRING, description: 'Named operation (optional)', required: false },
          ],
          response: { success: true, dataType: DataType.JSON, description: 'GraphQL response { data, errors }' },
          requiresAuth: false,
        },
        {
          id: 'graphql_mutation', name: 'Mutation', description: 'Execute a GraphQL mutation (write operation)', category: 'WRITE',
          parameters: [
            { name: 'mutation', type: DataType.STRING, description: 'GraphQL mutation string', required: true },
            { name: 'variables', type: DataType.OBJECT, description: 'Mutation variables', required: false },
          ],
          response: { success: true, dataType: DataType.JSON, description: 'GraphQL response { data, errors }' },
          requiresAuth: false,
        },
      ],
      triggers: [],
      supportedOperators: [ConditionOperator.EQ, ConditionOperator.CONTAINS, ConditionOperator.EXISTS],
      outputFormats: [DataType.JSON],
      tags: ['api', 'graphql', 'integration', 'generic'], status: 'active',
    };
  }
}

