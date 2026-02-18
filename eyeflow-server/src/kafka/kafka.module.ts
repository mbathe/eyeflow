import { Module } from '@nestjs/common';
import { CDCEventProcessorService } from './cdc-event-processor.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { KafkaEventsController } from './kafka-events.controller';

/**
 * Kafka Module
 * Manages CDC event processing and Kafka integration
 */
@Module({
  providers: [CDCEventProcessorService, KafkaConsumerService],
  controllers: [KafkaEventsController],
  exports: [KafkaConsumerService, CDCEventProcessorService],
})
export class KafkaModule {}
