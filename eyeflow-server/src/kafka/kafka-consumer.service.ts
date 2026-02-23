import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, Producer, logLevel } from 'kafkajs';
import axios from 'axios';
import { CDCEventProcessorService } from './cdc-event-processor.service';
import { AgentMission, EventRule, KAFKA_TOPICS } from './kafka-events.types';
import { OfflineBufferService } from '../runtime/offline-buffer.service';

/**
 * Kafka Consumer Service
 * Listens to CDC topics and processes database change events
 *
 * Handles:
 * - Connection to Kafka broker
 * - Subscribing to CDC topics
 * - Processing events through CDC processor
 * - Error handling and retry logic
 */
@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private kafka!: Kafka;
  private consumer!: Consumer;
  private producer: Producer | null = null;
  private isConnected = false;
  private rules: EventRule[] = []; // Rules for event routing

  constructor(
    private configService: ConfigService,
    private cdcProcessor: CDCEventProcessorService,
    @Optional() private readonly offlineBuffer?: OfflineBufferService,
  ) {}

  /**
   * Initialize Kafka connection on module startup
   * Non-blocking: connection attempts happen in background
   */
  async onModuleInit() {
    // Only initialize if Kafka is enabled in environment
    const kafkaEnabled = this.configService.get('KAFKA_ENABLED') === 'true';
    if (!kafkaEnabled) {
      this.logger.warn(
        'Kafka consumer disabled (set KAFKA_ENABLED=true to enable)',
      );
      return;
    }

    // Start connection in background without blocking module initialization
    this.connectInBackground();
  }

  /**
   * Connect to Kafka in background (non-blocking)
   */
  private async connectInBackground(): Promise<void> {
    try {
      await this.connect();
      this.logger.log('✅ Kafka consumer connected successfully');
    } catch (error) {
      this.logger.error(
        `⚠️  Failed to initialize Kafka consumer (retrying in background): ${error instanceof Error ? error.message : String(error)}`,
      );
      // Schedule retry in 30 seconds
      setTimeout(() => this.connectInBackground(), 30000);
    }
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy() {
    await this.disconnect();
  }

  /**
   * Connect to Kafka broker
   */
  async connect(): Promise<void> {
    const brokers = (this.configService.get('KAFKA_BROKERS') || 'localhost:9092')
      .split(',')
      .map((b: string) => b.trim());
    const clientId = this.configService.get('KAFKA_CLIENT_ID') || 'eyeflow-cdc-consumer';
    const groupId = this.configService.get('KAFKA_GROUP_ID') || 'eyeflow-cdc-group';
    const kafkaLogLevel = this.configService.get('KAFKA_LOG_LEVEL') || 'error';

    this.kafka = new Kafka({
      clientId,
      brokers,
      logLevel: logLevel[kafkaLogLevel as keyof typeof logLevel] || logLevel.ERROR,
      retry: {
        initialRetryTime: 100,
        retries: 8,
        maxRetryTime: 30000,
        multiplier: 2,
      },
    });

    this.consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    // Handle disconnection
    this.consumer.on('consumer.disconnect', () => {
      this.logger.warn('Kafka consumer disconnected');
      this.isConnected = false;
      // Notify offline buffer — buffering mode ON (spec §8.3)
      this.offlineBuffer?.notifyConnected(false);
    });

    await this.consumer.connect();
    this.isConnected = true;
    this.logger.log(`✅ Kafka consumer connected to ${brokers.join(', ')}`);
    // Notify offline buffer — buffering mode OFF, flush will be triggered
    this.offlineBuffer?.notifyConnected(true);

    // Create a producer for mission dispatch (lazy, shared across dispatches)
    this.producer = this.kafka.producer({ allowAutoTopicCreation: true });
    await this.producer.connect();
    this.logger.log('✅ Kafka producer ready (mission dispatch)');

    // Subscribe to CDC topics
    await this.subscribeToCDCTopics();

    // Start consuming messages
    await this.startConsuming();
  }

  /**
   * Subscribe to all CDC topics (or specific ones from env)
   */
  private async subscribeToCDCTopics(): Promise<void> {
    const topics = [
      KAFKA_TOPICS.cdc.databases,
      'cdc.postgresql.public.*', // Example PostgreSQL topic pattern
      'cdc.mysql.public.*', // Example MySQL topic pattern
      'cdc.mongodb.production.*', // Example MongoDB topic pattern
    ];

    await this.consumer.subscribe({
      topics,
      fromBeginning: false, // Only get new messages from now
    });

    this.logger.log(`📡 Subscribed to CDC topics: ${topics.join(', ')}`);
  }

  /**
   * Start consuming messages from subscribed topics
   */
  private async startConsuming(): Promise<void> {
    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }: any) => {
        try {
          const cdcEvent = JSON.parse(message.value.toString());

          this.logger.debug(
            `📨 Processing CDC event from topic: ${topic}`,
          );

          // Process the event using CDC processor
          const mission = await this.cdcProcessor.processEvent(
            cdcEvent,
            this.rules,
          );

          if (mission) {
            this.logger.log(
              `🎯 Mission created: ${mission.actionType} (priority: ${mission.priority})`,
            );
            // TODO: Send mission to agents queue
            await this.dispatchMission(mission);
          }
        } catch (error) {
          this.logger.error(`Error processing message: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
    });
  }

  /**
   * Dispatch mission to agent execution queue.
   *
   * Strategy (in priority order):
   *  1. Produce to Kafka `agent.commands` topic — consumed by eyeflow-agent workers
   *  2. If mission.targetConnector is an HTTP/HTTPS URL — also POST directly for
   *     low-latency processing (fire-and-forget, failure is logged but does not block)
   */
  private async dispatchMission(mission: AgentMission): Promise<void> {
    this.logger.debug(`🚀 Dispatching mission: ${mission.id} (actionType: ${mission.actionType}, priority: ${mission.priority})`);

    // ── 1. Kafka topic (primary path) ─────────────────────────────────────
    if (this.producer) {
      try {
        await this.producer.send({
          topic: KAFKA_TOPICS.agent.commands,
          messages: [
            {
              key: mission.id,
              value: JSON.stringify({
                ...mission,
                dispatchedAt: new Date().toISOString(),
              }),
              headers: {
                'mission-priority': mission.priority,
                'action-type': mission.actionType,
              },
            },
          ],
        });
        this.logger.log(
          `📤 Mission ${mission.id} published to ${KAFKA_TOPICS.agent.commands}`,
        );
      } catch (kafkaErr) {
        this.logger.error(
          `Failed to publish mission ${mission.id} to Kafka: ${
            kafkaErr instanceof Error ? kafkaErr.message : String(kafkaErr)
          }`,
        );
        // Fall through to HTTP direct path even on Kafka failure
      }
    } else {
      this.logger.warn(
        `Kafka producer not ready — mission ${mission.id} will only be dispatched via HTTP (if connector URL available)`,
      );
    }

    // ── 2. Direct HTTP call (secondary / immediate path) ──────────────────
    const connectorUrl = mission.targetConnector;
    if (connectorUrl && (connectorUrl.startsWith('http://') || connectorUrl.startsWith('https://'))) {
      try {
        await axios.post(
          connectorUrl,
          { mission, dispatchedAt: new Date().toISOString() },
          {
            timeout: 5000,
            headers: { 'Content-Type': 'application/json', 'X-Mission-Id': mission.id },
            validateStatus: (status) => status < 500, // accept 4xx (agent may reject)
          },
        );
        this.logger.log(`📡 Mission ${mission.id} dispatched directly to ${connectorUrl}`);
      } catch (httpErr) {
        // Non-fatal: the Kafka path is the primary delivery mechanism
        this.logger.warn(
          `Direct HTTP dispatch to ${connectorUrl} failed for mission ${mission.id}: ${
            httpErr instanceof Error ? httpErr.message : String(httpErr)
          }`,
        );
      }
    }
  }

  /**
   * Register event routing rules
   */
  registerRules(rules: EventRule[]): void {
    this.rules = rules;
    this.logger.log(`📋 Registered ${rules.length} CDC routing rules`);
  }

  /**
   * Disconnect from Kafka
   */
  async disconnect(): Promise<void> {
    if (this.consumer && this.isConnected) {
      await this.consumer.disconnect();
      this.isConnected = false;
      this.offlineBuffer?.notifyConnected(false);
      this.logger.log('✅ Kafka consumer disconnected');
    }
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }
  }

  /**
   * Check if consumer is connected
   */
  getStatus(): {
    connected: boolean;
    rulesCount: number;
    processorStats: any;
  } {
    return {
      connected: this.isConnected,
      rulesCount: this.rules.length,
      processorStats: this.cdcProcessor.getStats(),
    };
  }
}
