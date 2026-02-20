import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, logLevel } from 'kafkajs';
import { CDCEventProcessorService } from './cdc-event-processor.service';
import { EventRule, KAFKA_TOPICS } from './kafka-events.types';
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
   * Dispatch mission to agent execution queue
   */
  private async dispatchMission(mission: any): Promise<void> {
    // TODO: Implement mission dispatch to agents
    // This could be:
    // - Send to Kafka topic (agent.commands)
    // - Send to RabbitMQ
    // - Store in database for agent polling
    // - WebSocket push to connected agents

    this.logger.debug(`🚀 Dispatching mission: ${mission.id}`);
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
