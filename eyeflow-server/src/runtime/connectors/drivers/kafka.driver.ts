/**
 * KafkaDriver — handles 'kafka' connector type.
 * query → consume N messages from a topic
 * executeAction → produce a message
 */

import { ExecutorContext } from '../../executors/executor.interface';
import { BaseConnectorDriver } from '../connector-driver.interface';
import { ConnectorPayload, ConnectorQueryOptions, ConnectorActionDescriptor } from '../connector-payload.interface';
import { ConnectorDataNormalizer } from '../connector-data-normalizer';

export class KafkaDriver extends BaseConnectorDriver {
  canHandle(t: string): boolean { return t === 'kafka'; }

  async query(opts: ConnectorQueryOptions, cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload> {
    const { Kafka } = this._require('kafkajs', 'npm install kafkajs');
    const kafka = new Kafka({
      clientId: (cfg['clientId'] as string) ?? 'eyeflow',
      brokers: ((cfg['brokers'] as string) ?? 'localhost:9092').split(','),
    });
    const consumer = kafka.consumer({ groupId: (cfg['groupId'] as string) ?? 'eyeflow-consumer' });
    await consumer.connect();
    await consumer.subscribe({ topic: opts.resource, fromBeginning: false });

    const messages: Record<string, unknown>[] = [];
    const limit = opts.limit ?? 10;
    await new Promise<void>((res) => {
      void consumer.run({
        eachMessage: async ({ message }: { message: any }) => {
          messages.push({
            key: message.key?.toString(),
            value: message.value?.toString(),
            offset: message.offset,
            timestamp: message.timestamp,
          });
          if (messages.length >= limit) { void consumer.stop(); res(); }
        },
      });
      setTimeout(() => res(), 5000); // 5 s timeout
    });
    await consumer.disconnect();
    return ConnectorDataNormalizer.wrap({ messages }, {
      connectorId: this._connectorId(cfg, ctx),
      connectorType: 'kafka',
      operation: 'consume',
      source: `kafka:${opts.resource}`,
    });
  }

  async executeAction(action: ConnectorActionDescriptor, cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload> {
    const { Kafka } = this._require('kafkajs', 'npm install kafkajs');
    const kafka = new Kafka({
      clientId: (cfg['clientId'] as string) ?? 'eyeflow',
      brokers: ((cfg['brokers'] as string) ?? 'localhost:9092').split(','),
    });
    const producer = kafka.producer();
    await producer.connect();
    const p = action.params as Record<string, unknown>;
    const topic = (p['topic'] as string) ?? 'default';
    const value = typeof p['value'] === 'string' ? p['value'] : JSON.stringify(p['value']);
    await producer.send({ topic, messages: [{ key: p['key'] as string, value }] });
    await producer.disconnect();
    return ConnectorDataNormalizer.wrap({ produced: true, topic }, {
      connectorId: this._connectorId(cfg, ctx),
      connectorType: 'kafka',
      operation: action.functionId,
    });
  }
}
