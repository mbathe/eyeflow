import { Injectable, Logger } from '@nestjs/common';
import { Kafka, Consumer, Producer, Admin } from 'kafkajs';
import {
  KafkaConnectorConfig,
  ConnectorTestResponse,
  ConnectorExecutionResult,
  KafkaTopicInfo,
  KafkaProducerMessage,
} from './connector.types';

/**
 * Kafka Connector Service
 * Manages Kafka as a first-class connector alongside other data sources
 * 
 * Supports:
 * - Consumer operations (CDC event streaming)
 * - Producer operations (sending events to Kafka)
 * - Topic management
 * - Consumer group management
 */
@Injectable()
export class KafkaConnectorService {
  private readonly logger = new Logger(KafkaConnectorService.name);
  private kafkaInstances = new Map<string, Kafka>(); // Store per connector ID
  private consumerInstances = new Map<string, Consumer>();
  private producerInstances = new Map<string, Producer>();
  private adminInstances = new Map<string, Admin>();

  /**
   * Initialize Kafka connection for a connector
   */
  async initializeConnector(config: KafkaConnectorConfig): Promise<Kafka> {
    const connectorId = config.id;

    // Return cached instance if exists
    if (this.kafkaInstances.has(connectorId)) {
      return this.kafkaInstances.get(connectorId)!;
    }

    try {
      const { credentials } = config.auth;
      const kafka = new Kafka({
        clientId: credentials.clientId || `eyeflow-${connectorId}`,
        brokers: credentials.brokers,
        ssl: credentials.ssl ? {} : undefined,
        sasl: this._buildSaslConfig(credentials),
      });

      this.kafkaInstances.set(connectorId, kafka);
      this.logger.log(
        `✅ Kafka connector initialized: ${connectorId} (brokers: ${credentials.brokers.join(',')})`,
      );

      return kafka;
    } catch (error) {
      this.logger.error(`Failed to initialize Kafka connector ${connectorId}:`, error);
      throw error;
    }
  }

  /**
   * Test connector connection
   */
  async testConnection(config: KafkaConnectorConfig): Promise<ConnectorTestResponse> {
    try {
      const kafka = await this.initializeConnector(config);
      const admin = kafka.admin();

      await admin.connect();
      const brokerMetadata = await admin.fetchTopicMetadata();
      await admin.disconnect();

      return {
        success: true,
        message: `Connected to ${config.auth.credentials.brokers.length} broker(s)`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Connection failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * List all topics (regular + CDC topics)
   */
  async listTopics(config: KafkaConnectorConfig): Promise<KafkaTopicInfo[]> {
    try {
      const kafka = await this.initializeConnector(config);
      const admin = kafka.admin();

      await admin.connect();
      const topics = await admin.fetchTopicMetadata();
      await admin.disconnect();

      return topics.topics.map((topic) => {
        const isCdcTopic = topic.name.startsWith('cdc.');
        const parts = topic.name.split('.');
        
        return {
          name: topic.name,
          partitions: topic.partitions.length,
          replicas: topic.partitions[0]?.replicas?.length || 0,
          isCdcTopic,
          source: isCdcTopic ? parts[1] : undefined, // cdc.postgres.schema.table
          schema: isCdcTopic ? parts[2] : undefined,
          table: isCdcTopic ? parts[3] : undefined,
        };
      });
    } catch (error) {
      this.logger.error('Failed to list topics:', error);
      throw error;
    }
  }

  /**
   * Get or create a consumer for this connector
   */
  async getConsumer(config: KafkaConnectorConfig): Promise<Consumer> {
    const connectorId = config.id;

    if (this.consumerInstances.has(connectorId)) {
      return this.consumerInstances.get(connectorId)!;
    }

    const kafka = await this.initializeConnector(config);
    const { credentials } = config.auth;

    const consumer = kafka.consumer({
      groupId: credentials.groupId,
      sessionTimeout: config.sessionTimeout || 30000,
      heartbeatInterval: config.heartbeatInterval || 3000,
    });

    this.consumerInstances.set(connectorId, consumer);
    return consumer;
  }

  /**
   * Get or create a producer for this connector
   */
  async getProducer(config: KafkaConnectorConfig): Promise<Producer> {
    const connectorId = config.id;

    if (this.producerInstances.has(connectorId)) {
      return this.producerInstances.get(connectorId)!;
    }

    const kafka = await this.initializeConnector(config);
    const producer = kafka.producer({
      idempotent: true,
      maxInFlightRequests: 5,
    });

    await producer.connect();
    this.producerInstances.set(connectorId, producer);
    return producer;
  }

  /**
   * Produce a single message to a Kafka topic
   */
  async produceMessage(
    config: KafkaConnectorConfig,
    message: KafkaProducerMessage,
  ): Promise<ConnectorExecutionResult> {
    const startTime = Date.now();

    try {
      const producer = await this.getProducer(config);

      const result = await producer.send({
        topic: message.topic,
        messages: [
          {
            key: message.key,
            value: JSON.stringify(message.value),
            headers: message.headers,
            timestamp: message.timestamp?.toString(),
            partition: message.partition,
          },
        ],
      });

      return {
        success: true,
        data: {
          topic: message.topic,
          partitions: result,
        },
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Produce multiple messages in batch
   */
  async produceMessages(
    config: KafkaConnectorConfig,
    messages: KafkaProducerMessage[],
  ): Promise<ConnectorExecutionResult> {
    const startTime = Date.now();

    try {
      const producer = await this.getProducer(config);

      // Group by topic
      const byTopic = messages.reduce(
        (acc, msg) => {
          if (!acc[msg.topic]) acc[msg.topic] = [];
          acc[msg.topic].push({
            key: msg.key,
            value: JSON.stringify(msg.value),
            headers: msg.headers,
            partition: msg.partition,
          });
          return acc;
        },
        {} as Record<string, any[]>,
      );

      const topicMessages = Object.entries(byTopic).map(([topic, msgs]) => ({
        topic,
        messages: msgs,
      }));

      const result = await producer.sendBatch({
        topicMessages,
      });

      return {
        success: true,
        data: {
          totalMessages: messages.length,
          results: result,
        },
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Subscribe to topics and consume messages
   * Used for CDC event streaming
   */
  async consumeMessages(
    config: KafkaConnectorConfig,
    topics: string[],
    onMessage: (message: any) => Promise<void>,
  ): Promise<void> {
    try {
      const consumer = await this.getConsumer(config);

      // Subscribe with optional topic pattern for CDC topics
      if (config.cdcTopicPattern) {
        await consumer.subscribe({
          topics,
          fromBeginning: false,
        });
      } else {
        await consumer.subscribe({
          topics,
          fromBeginning: false,
        });
      }

      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const value = message.value
              ? JSON.parse(message.value.toString())
              : null;

            await onMessage({
              topic,
              partition,
              offset: message.offset,
              key: message.key?.toString(),
              value,
              headers: message.headers,
              timestamp: message.timestamp,
            });
          } catch (error) {
            this.logger.error(`Error processing message from ${topic}:`, error);
          }
        },
      });
    } catch (error) {
      this.logger.error('Failed to consume messages:', error);
      throw error;
    }
  }

  /**
   * Get consumer group information
   */
  async describeConsumerGroup(
    config: KafkaConnectorConfig,
    groupId: string,
  ): Promise<any> {
    try {
      const kafka = await this.initializeConnector(config);
      const admin = kafka.admin();

      await admin.connect();
      const groupMetadata = await admin.describeGroups([groupId]);
      const topicOffsets = await admin.fetchOffsets({ groupId });
      await admin.disconnect();

      return {
        group: groupMetadata.groups[0],
        offsets: topicOffsets,
      };
    } catch (error) {
      this.logger.error('Failed to describe consumer group:', error);
      throw error;
    }
  }

  /**
   * Cleanup connector resources
   */
  async disconnect(connectorId: string): Promise<void> {
    try {
      // Disconnect consumer
      const consumer = this.consumerInstances.get(connectorId);
      if (consumer) {
        await consumer.disconnect();
        this.consumerInstances.delete(connectorId);
      }

      // Disconnect producer
      const producer = this.producerInstances.get(connectorId);
      if (producer) {
        await producer.disconnect();
        this.producerInstances.delete(connectorId);
      }

      // Disconnect admin
      const admin = this.adminInstances.get(connectorId);
      if (admin) {
        await admin.disconnect();
        this.adminInstances.delete(connectorId);
      }

      // Clear Kafka instance
      this.kafkaInstances.delete(connectorId);

      this.logger.log(`✅ Kafka connector disconnected: ${connectorId}`);
    } catch (error) {
      this.logger.error(`Failed to disconnect Kafka connector ${connectorId}:`, error);
    }
  }

  /**
   * Helper: Build SASL configuration for Kafka client
   */
  private _buildSaslConfig(credentials: any): any {
    if (!credentials.username || !credentials.password) {
      return undefined;
    }

    const mechanism = credentials.saslMechanism || 'plain';

    // Return properly typed SASL configuration based on mechanism
    if (mechanism === 'plain') {
      return {
        mechanism: 'plain' as const,
        username: credentials.username,
        password: credentials.password,
      };
    } else if (mechanism === 'scram-sha-256') {
      return {
        mechanism: 'scram-sha-256' as const,
        username: credentials.username,
        password: credentials.password,
      };
    } else if (mechanism === 'scram-sha-512') {
      return {
        mechanism: 'scram-sha-512' as const,
        username: credentials.username,
        password: credentials.password,
      };
    }

    // Default to plain if unknown mechanism
    return {
      mechanism: 'plain' as const,
      username: credentials.username,
      password: credentials.password,
    };
  }

  /**
   * Helper: Map compression type string to kafkajs enum
   */
  private _mapCompressionType(type?: string): number {
    // Compression config for Kafka.js producer
    // Currently handled via idempotent mode
    return 0; // No compression
  }
}
