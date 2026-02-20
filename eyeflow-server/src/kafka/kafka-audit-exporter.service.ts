/**
 * Kafka Audit Exporter Service — spec §12.3
 *
 * "Les événements d'audit signés sont streamés en temps réel vers un topic
 *  Kafka `audit-events`.  Si Kafka est indisponible, les événements sont
 *  bufferisés localement (OfflineBufferService) et rejouée à la reconnexion."
 *
 * Integration:
 *   - Registers an export handler on CryptoAuditChainService via `onAuditEvent()`
 *   - Creates its own KafkaJS Producer (separate from the consumer)
 *   - Falls back to OfflineBufferService when the producer is not connected
 *
 * Topic: `audit-events`  (configurable via KAFKA_AUDIT_TOPIC env var)
 *
 * Message format (JSON, UTF-8):
 * {
 *   "eventId":           "...",
 *   "timestamp":         "2025-...",
 *   "nodeId":            "central-nestjs",
 *   "workflowId":        "...",
 *   "workflowVersion":   1,
 *   "eventType":         "LLM_CALL",
 *   "inputHash":         "sha256:...",
 *   "outputHash":        "sha256:...",
 *   "durationMs":        42,
 *   "selfHash":          "sha256:...",
 *   "signature":         "ed25519:...",
 *   "previousEventHash": "sha256:...",
 * }
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, logLevel, CompressionTypes } from 'kafkajs';
import {
  CryptoAuditChainService,
  AuditChainEvent,
} from '../runtime/crypto-audit-chain.service';
import { OfflineBufferService } from '../runtime/offline-buffer.service';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_AUDIT_TOPIC = 'audit-events';

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class KafkaAuditExporterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaAuditExporterService.name);

  private kafka?: Kafka;
  private producer?: Producer;
  private isConnected = false;
  private readonly auditTopic: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly auditChain: CryptoAuditChainService,
    @Optional() private readonly offlineBuffer?: OfflineBufferService,
  ) {
    this.auditTopic =
      this.configService.get<string>('KAFKA_AUDIT_TOPIC') ?? DEFAULT_AUDIT_TOPIC;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    const kafkaEnabled = this.configService.get('KAFKA_ENABLED') === 'true';
    if (!kafkaEnabled) {
      this.logger.warn(
        '[KafkaAuditExporter] Kafka disabled (KAFKA_ENABLED != true) — ' +
        'audit events will only be stored in-memory chain'
      );
      // Still register the handler so events can be buffered locally if needed
      this.registerAuditHandler();
      return;
    }

    this.registerAuditHandler();
    this.connectInBackground();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.producer && this.isConnected) {
      await this.producer.disconnect();
      this.isConnected = false;
    }
  }

  // ── Internal connect ──────────────────────────────────────────────────────

  private connectInBackground(): void {
    this.connectProducer().catch(err => {
      this.logger.error(
        `[KafkaAuditExporter] Producer connect failed: ${err?.message} — retrying in 30s`
      );
      setTimeout(() => this.connectInBackground(), 30_000);
    });
  }

  private async connectProducer(): Promise<void> {
    const brokers = (this.configService.get<string>('KAFKA_BROKERS') ?? 'localhost:9092')
      .split(',')
      .map(b => b.trim());

    const clientId =
      (this.configService.get<string>('KAFKA_CLIENT_ID') ?? 'eyeflow-audit-producer') +
      '-audit';

    this.kafka = new Kafka({
      clientId,
      brokers,
      logLevel: logLevel.ERROR,
      retry: { retries: 5, initialRetryTime: 300, maxRetryTime: 30_000, multiplier: 2 },
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30_000,
    });

    this.producer.on('producer.disconnect', () => {
      this.logger.warn('[KafkaAuditExporter] Producer disconnected');
      this.isConnected = false;
    });

    await this.producer.connect();
    this.isConnected = true;
    this.logger.log(
      `[KafkaAuditExporter] Kafka producer connected → topic: ${this.auditTopic}`
    );

    // Register a flush handler with OfflineBufferService so buffered audit
    // events are replayed through this producer on reconnection (spec §8.3).
    this.offlineBuffer?.registerFlushHandler(async (events) => {
      const auditEvents = events.filter(e => e.kind === 'AUDIT');
      if (auditEvents.length === 0) return events.map(() => false);

      const messages = auditEvents.map(e => ({
        key: e.workflowId ?? 'unknown',
        value: JSON.stringify(e.payload),
        headers: {
          'x-source': 'offline-flush',
          'x-original-timestamp': e.timestamp,
        },
      }));

      try {
        await this.producer!.send({
          topic: this.auditTopic,
          compression: CompressionTypes.GZIP,
          messages,
        });
        this.logger.log(
          `[KafkaAuditExporter] Offline flush: sent ${messages.length} audit events`
        );
        return events.map(e => e.kind === 'AUDIT'); // mark AUDIT events as delivered
      } catch (err) {
        this.logger.error(`[KafkaAuditExporter] Flush send failed: ${err}`);
        return events.map(() => false);
      }
    });
  }

  // ── Audit event handler ───────────────────────────────────────────────────

  /**
   * Register with CryptoAuditChainService so every `append()` call
   * triggers a Kafka produce (or fallback to offline buffer).
   */
  private registerAuditHandler(): void {
    this.auditChain.onAuditEvent((event: AuditChainEvent) => {
      this.export(event).catch(err => {
        this.logger.warn(`[KafkaAuditExporter] export error: ${err?.message}`);
      });
    });

    this.logger.debug('[KafkaAuditExporter] Audit export handler registered');
  }

  /**
   * Export a single signed audit chain event to Kafka.
   * Falls back to OfflineBufferService when disconnected.
   */
  async export(event: AuditChainEvent): Promise<void> {
    if (this.isConnected && this.producer) {
      try {
        await this.producer.send({
          topic: this.auditTopic,
          messages: [
            {
              key: event.workflowId,
              value: JSON.stringify(this.toWireFormat(event)),
              headers: {
                'x-event-type':     event.eventType,
                'x-node-id':        event.nodeId,
                'x-workflow-id':    event.workflowId,
                'x-audit-chain-id': event.eventId,
              },
            },
          ],
        });
        this.logger.debug(
          `[KafkaAuditExporter] → ${this.auditTopic} ` +
          `${event.eventType}:${event.eventId.substring(0, 8)}`
        );
        return;
      } catch (err: any) {
        this.logger.warn(
          `[KafkaAuditExporter] Kafka send failed: ${err?.message} — buffering locally`
        );
        this.isConnected = false;
      }
    }

    // Kafka unavailable — buffer locally (spec §8.3, §12.3)
    if (this.offlineBuffer) {
      this.offlineBuffer.enqueueAuditEvent(
        event.workflowId,
        event.eventType,
        this.toWireFormat(event) as Record<string, any>,
      );
      this.logger.debug(
        `[KafkaAuditExporter] Event buffered offline (workflowId=${event.workflowId})`
      );
    } else {
      this.logger.warn(
        '[KafkaAuditExporter] No Kafka producer + no OfflineBuffer — audit event LOST'
      );
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Convert internal AuditChainEvent to the Kafka wire format (spec §12.3) */
  private toWireFormat(event: AuditChainEvent): Record<string, unknown> {
    return {
      eventId:           event.eventId,
      timestamp:         event.timestamp,
      nodeId:            event.nodeId,
      workflowId:        event.workflowId,
      workflowVersion:   event.workflowVersion,
      instructionId:     event.instructionId,
      eventType:         event.eventType,
      inputHash:         event.inputHash,
      outputHash:        event.outputHash,
      durationMs:        event.durationMs,
      details:           event.details,
      previousEventHash: event.previousEventHash,
      selfHash:          event.selfHash,
      signature:         event.signature,
      // Public key omitted from wire format (nodes store it separately)
    };
  }
}
