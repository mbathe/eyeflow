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
    // Register example connectors for demonstration
    this.registerConnector(this.createSlackManifest());
    this.registerConnector(this.createPostgresManifest());
    this.registerConnector(this.createApiConnectorManifest());
    this.registerConnector(this.createKafkaManifest());
    this.registerConnector(this.createFileSystemManifest());
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
}
