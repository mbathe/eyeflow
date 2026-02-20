import { Module } from '@nestjs/common';
import { CDCEventProcessorService } from './cdc-event-processor.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { KafkaAuditExporterService } from './kafka-audit-exporter.service';
import { KafkaEventsController } from './kafka-events.controller';
import { RuntimeModule } from '../runtime/runtime.module';

/**
 * Kafka Module
 * Manages CDC event processing, Kafka integration and audit export.
 *
 * Imports RuntimeModule to access:
 *   • CryptoAuditChainService (subscribe to audit events — spec §12.3)
 *   • OfflineBufferService    (buffer audit events when Kafka is down — spec §8.3)
 */
@Module({
  imports: [RuntimeModule],
  providers: [CDCEventProcessorService, KafkaConsumerService, KafkaAuditExporterService],
  controllers: [KafkaEventsController],
  exports: [KafkaConsumerService, CDCEventProcessorService, KafkaAuditExporterService],
})
export class KafkaModule {}
