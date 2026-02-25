/**
 * MqttDriver — handles 'mqtt' connector type.
 * query       → subscribe briefly and collect N messages from a topic
 * executeAction → publish a message to a topic
 */

import { ExecutorContext } from '../../executors/executor.interface';
import { BaseConnectorDriver } from '../connector-driver.interface';
import { ConnectorPayload, ConnectorQueryOptions, ConnectorActionDescriptor } from '../connector-payload.interface';
import { ConnectorDataNormalizer } from '../connector-data-normalizer';

export class MqttDriver extends BaseConnectorDriver {
  canHandle(t: string): boolean { return t === 'mqtt'; }

  async query(opts: ConnectorQueryOptions, cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload> {
    const mqtt = this._require('mqtt', 'npm install mqtt');
    const client = mqtt.connect(cfg['brokerUrl'] as string, {
      clientId: (cfg['clientId'] as string) ?? `eyeflow_${Date.now()}`,
      username: cfg['username'] as string,
      password: this._password(cfg, ctx),
    });
    const topic = opts.resource;
    const limit = opts.limit ?? 10;
    const messages: Record<string, unknown>[] = [];

    await new Promise<void>((resolve) => {
      client.on('connect', () => { client.subscribe(topic); });
      client.on('message', (t: string, payload: Buffer) => {
        let parsed: unknown;
        try { parsed = JSON.parse(payload.toString()); } catch { parsed = payload.toString(); }
        messages.push({ topic: t, payload: parsed, receivedAt: new Date().toISOString() });
        if (messages.length >= limit) { client.end(); resolve(); }
      });
      // 3 s collection window
      setTimeout(() => { client.end(); resolve(); }, 3000);
    });

    return ConnectorDataNormalizer.wrap({ messages }, {
      connectorId: this._connectorId(cfg, ctx),
      connectorType: 'mqtt',
      operation: 'subscribe',
      source: `mqtt:${topic}`,
    });
  }

  async executeAction(action: ConnectorActionDescriptor, cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload> {
    const mqtt = this._require('mqtt', 'npm install mqtt');
    const p = action.params as Record<string, unknown>;
    const client = mqtt.connect(cfg['brokerUrl'] as string, {
      clientId: (cfg['clientId'] as string) ?? `eyeflow_pub_${Date.now()}`,
      username: cfg['username'] as string,
      password: this._password(cfg, ctx),
    });
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => {
        const value = typeof p['payload'] === 'string' ? p['payload'] : JSON.stringify(p['payload']);
        client.publish(p['topic'] as string, value, { qos: (p['qos'] as 0 | 1 | 2) ?? 0, retain: !!(p['retain']) }, (err: any) => {
          client.end();
          err ? reject(err) : resolve();
        });
      });
      client.on('error', (err: any) => { client.end(); reject(err); });
    });
    return ConnectorDataNormalizer.wrap({ published: true, topic: p['topic'] }, {
      connectorId: this._connectorId(cfg, ctx),
      connectorType: 'mqtt',
      operation: action.functionId,
    });
  }
}
