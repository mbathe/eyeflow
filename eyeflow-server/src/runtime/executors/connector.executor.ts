/**
 * CONNECTOR Executor
 *
 * Executes operations against external data systems using connector configurations
 * stored on the node (or injected at compile time).
 *
 * Supported connector types (from connector.types.ts):
 *   Databases:       postgresql, mysql, mongodb, dynamodb, firestore
 *   File systems:    local_file, s3, google_drive, dropbox
 *   IoT / Messaging: mqtt, kafka, influxdb
 *   Communication:   smtp, slack, teams, whatsapp
 *   Business:        shopify, stripe, hubspot
 *   Custom:          webhook, rest_api, graphql
 *
 * The executor resolves the connector configuration at runtime from `ctx.connectorConfigs`,
 * then delegates to the appropriate sub-driver.
 */

import { Injectable, Logger } from '@nestjs/common';
import { IServiceExecutor, ExecutorContext, ExecutorResult, ExecutorError } from './executor.interface';
import {
  ExecutionDescriptor,
  ConnectorExecutionDescriptor,
  ConnectorOperation,
} from '../../compiler/interfaces/service-manifest.interface';

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ConnectorExecutor implements IServiceExecutor {
  readonly format = 'CONNECTOR' as const;
  private readonly logger = new Logger(ConnectorExecutor.name);

  async canExecute(descriptor: ExecutionDescriptor): Promise<boolean> {
    const d = descriptor as ConnectorExecutionDescriptor;
    return !!(d.connectorType && d.operation);
  }

  async execute(descriptor: ExecutionDescriptor, ctx: ExecutorContext): Promise<ExecutorResult> {
    const d = descriptor as ConnectorExecutionDescriptor;
    const t0 = Date.now();

    // Resolve inputs (apply inputMapping if declared)
    const resolvedInputs = this._applyInputMapping(ctx.inputs, d.inputMapping);

    // Resolve operationConfig template (replace {placeholder} with input values)
    const resolvedConfig = this._resolveTemplate(d.operationConfig, resolvedInputs);

    this.logger.debug(`[CONNECTOR] ${d.connectorType}.${d.operation}(${JSON.stringify(resolvedConfig).slice(0, 80)})`);

    let rawResult: any;

    switch (d.connectorType) {
      // ── Databases ─────────────────────────────────────────────────────────
      case 'postgresql':
      case 'mysql':
        rawResult = await this._runSql(d, resolvedConfig, ctx);
        break;

      case 'mongodb':
        rawResult = await this._runMongo(d, resolvedConfig, ctx);
        break;

      // ── Messaging ─────────────────────────────────────────────────────────
      case 'kafka':
        rawResult = await this._runKafka(d, resolvedConfig, ctx);
        break;

      case 'mqtt':
        rawResult = await this._runMqtt(d, resolvedConfig, ctx);
        break;

      // ── Communication ─────────────────────────────────────────────────────
      case 'smtp':
        rawResult = await this._runSmtp(d, resolvedConfig, ctx);
        break;

      case 'slack':
        rawResult = await this._runSlack(d, resolvedConfig, ctx);
        break;

      case 'webhook':
      case 'rest_api':
        rawResult = await this._runRestApi(d, resolvedConfig, ctx);
        break;

      case 'graphql':
        rawResult = await this._runGraphql(d, resolvedConfig, ctx);
        break;

      // ── Business / SaaS ───────────────────────────────────────────────────
      case 'stripe':
        rawResult = await this._runStripe(d, resolvedConfig, ctx);
        break;

      case 'shopify':
      case 'hubspot':
        rawResult = await this._runGenericApi(d, resolvedConfig, ctx);
        break;

      // ── File systems ─────────────────────────────────────────────────────
      case 'local_file':
        rawResult = await this._runLocalFile(d, resolvedConfig, ctx);
        break;

      case 's3':
        rawResult = await this._runS3(d, resolvedConfig, ctx);
        break;

      default:
        throw new ExecutorError(
          `Connector type '${d.connectorType}' not implemented`,
          'RUNTIME_ERROR',
          false,
        );
    }

    // Apply output mapping
    const outputs = this._applyOutputMapping(rawResult, d.outputMapping);
    return { outputs, durationMs: Date.now() - t0, rawResponse: rawResult };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sub-drivers (each delegates to optional peer dependencies)
  // ─────────────────────────────────────────────────────────────────────────

  private async _runSql(
    d: ConnectorExecutionDescriptor,
    config: Record<string, any>,
    ctx: ExecutorContext,
  ): Promise<any> {
    const connCfg = this._getConnectorConfig(d, ctx);
    let client: any;

    if (d.connectorType === 'postgresql') {
      const { Client } = this._require('pg', 'npm install pg');
      client = new Client({
        host: connCfg.host,
        port: connCfg.port || 5432,
        database: connCfg.database,
        user: connCfg.username,
        password: connCfg.password || ctx.secrets?.[connCfg.passwordEnvVar] || '',
        ssl: connCfg.ssl,
      });
      await client.connect();
    } else {
      const mysql = this._require('mysql2/promise', 'npm install mysql2');
      client = await mysql.createConnection({
        host: connCfg.host,
        port: connCfg.port || 3306,
        database: connCfg.database,
        user: connCfg.username,
        password: connCfg.password || ctx.secrets?.[connCfg.passwordEnvVar] || '',
        ssl: connCfg.ssl ? {} : undefined,
      });
    }

    try {
      const sql: string = config.sql || config.query;
      const params: any[] = config.params || [];
      const result = await client.query(sql, params);
      return d.connectorType === 'postgresql'
        ? { rows: result.rows, rowCount: result.rowCount }
        : { rows: result[0], rowCount: (result[0] as any[]).length };
    } finally {
      await client.end?.() || await client.close?.();
    }
  }

  private async _runMongo(
    d: ConnectorExecutionDescriptor,
    config: Record<string, any>,
    ctx: ExecutorContext,
  ): Promise<any> {
    const { MongoClient } = this._require('mongodb', 'npm install mongodb');
    const connCfg = this._getConnectorConfig(d, ctx);
    const uri = connCfg.uri || `mongodb://${connCfg.host}:${connCfg.port || 27017}/${connCfg.database}`;
    const client = new MongoClient(uri);
    try {
      await client.connect();
      const db = client.db(connCfg.database);
      const coll = db.collection(config.collection);
      switch (d.operation) {
        case 'query':   return await coll.find(config.filter || {}).limit(config.limit || 100).toArray();
        case 'insert':  return await coll.insertOne(config.document);
        case 'update':  return await coll.updateMany(config.filter || {}, { $set: config.update });
        case 'delete':  return await coll.deleteMany(config.filter || {});
        default:        throw new ExecutorError(`MongoDB: unsupported operation '${d.operation}'`, 'RUNTIME_ERROR', false);
      }
    } finally {
      await client.close();
    }
  }

  private async _runKafka(
    d: ConnectorExecutionDescriptor,
    config: Record<string, any>,
    ctx: ExecutorContext,
  ): Promise<any> {
    const { Kafka } = this._require('kafkajs', 'npm install kafkajs');
    const connCfg = this._getConnectorConfig(d, ctx);
    const kafka = new Kafka({ clientId: 'eyeflow-svm', brokers: connCfg.brokers || [connCfg.broker] });

    if (d.operation === 'publish') {
      const producer = kafka.producer();
      await producer.connect();
      try {
        const result = await producer.send({
          topic: config.topic,
          messages: [{ key: config.key ? String(config.key) : undefined, value: JSON.stringify(config.payload || ctx) }],
        });
        return { partition: result[0]?.partition, offset: result[0]?.baseOffset };
      } finally {
        await producer.disconnect();
      }
    }

    throw new ExecutorError('Kafka subscribe not supported in synchronous mode (use event connector)', 'RUNTIME_ERROR', false);
  }

  private async _runMqtt(
    d: ConnectorExecutionDescriptor,
    config: Record<string, any>,
    ctx: ExecutorContext,
  ): Promise<any> {
    const mqtt = this._require('mqtt', 'npm install mqtt');
    const connCfg = this._getConnectorConfig(d, ctx);
    const client = mqtt.connect(connCfg.brokerUrl || `mqtt://${connCfg.host}:${connCfg.port || 1883}`);

    return new Promise((resolve, reject) => {
      client.on('connect', () => {
        if (d.operation === 'publish') {
          client.publish(config.topic, JSON.stringify(config.payload), (err: any) => {
            client.end();
            if (err) reject(new ExecutorError(`MQTT publish error: ${err.message}`, 'CONNECTOR_ERROR', true, err));
            else resolve({ published: true, topic: config.topic });
          });
        } else {
          client.end();
          reject(new ExecutorError('MQTT subscribe requires async event connector', 'RUNTIME_ERROR', false));
        }
      });
      client.on('error', (err: any) => {
        client.end();
        reject(new ExecutorError(`MQTT error: ${err.message}`, 'CONNECTOR_ERROR', true, err));
      });
    });
  }

  private async _runSmtp(
    d: ConnectorExecutionDescriptor,
    config: Record<string, any>,
    ctx: ExecutorContext,
  ): Promise<any> {
    const nodemailer = this._require('nodemailer', 'npm install nodemailer');
    const connCfg = this._getConnectorConfig(d, ctx);
    const transporter = nodemailer.createTransport({
      host: connCfg.host,
      port: connCfg.port || 587,
      secure: connCfg.secure || false,
      auth: {
        user: connCfg.username,
        pass: connCfg.password || ctx.secrets?.[connCfg.passwordEnvVar] || '',
      },
    });
    const info = await transporter.sendMail({
      from: config.from || connCfg.username,
      to: config.to,
      cc: config.cc,
      bcc: config.bcc,
      subject: config.subject,
      text: config.body,
      html: config.htmlBody,
    });
    return { messageId: info.messageId, accepted: info.accepted };
  }

  private async _runSlack(
    d: ConnectorExecutionDescriptor,
    config: Record<string, any>,
    ctx: ExecutorContext,
  ): Promise<any> {
    const connCfg = this._getConnectorConfig(d, ctx);
    const token = connCfg.botToken || ctx.secrets?.[connCfg.botTokenEnvVar] || '';
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        channel: config.channel,
        text: config.message,
        blocks: config.blocks,
      }),
    });
    const data: any = await res.json();
    if (!data.ok) throw new ExecutorError(`Slack error: ${data.error}`, 'CONNECTOR_ERROR', false);
    return { ts: data.ts, channel: data.channel };
  }

  private async _runRestApi(
    d: ConnectorExecutionDescriptor,
    config: Record<string, any>,
    ctx: ExecutorContext,
  ): Promise<any> {
    const connCfg = this._getConnectorConfig(d, ctx);
    const baseUrl = connCfg.baseUrl || connCfg.url || '';
    const url = `${baseUrl}${config.path || ''}`;
    const method = config.method || 'POST';
    const headers: any = { 'Content-Type': 'application/json', ...(connCfg.headers || {}), ...(config.headers || {}) };

    if (connCfg.apiKey) headers[connCfg.apiKeyHeader || 'X-Api-Key'] = connCfg.apiKey;

    const res = await fetch(url, {
      method,
      headers,
      body: ['POST', 'PUT', 'PATCH'].includes(method) ? JSON.stringify(config.body || ctx) : undefined,
      signal: AbortSignal.timeout(ctx.timeoutMs || 30_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ExecutorError(`REST API ${res.status}: ${JSON.stringify(body).slice(0, 200)}`, 'CONNECTOR_ERROR', res.status >= 500);
    return body;
  }

  private async _runGraphql(
    d: ConnectorExecutionDescriptor,
    config: Record<string, any>,
    ctx: ExecutorContext,
  ): Promise<any> {
    const connCfg = this._getConnectorConfig(d, ctx);
    const headers: any = { 'Content-Type': 'application/json', ...(connCfg.headers || {}) };
    if (connCfg.authToken) headers['Authorization'] = `Bearer ${connCfg.authToken}`;
    const res = await fetch(connCfg.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: config.query, variables: config.variables || ctx.inputs }),
      signal: AbortSignal.timeout(ctx.timeoutMs || 30_000),
    });
    const data: any = await res.json();
    if (data.errors) throw new ExecutorError(`GraphQL error: ${JSON.stringify(data.errors)}`, 'CONNECTOR_ERROR', false);
    return data.data;
  }

  private async _runStripe(
    d: ConnectorExecutionDescriptor,
    config: Record<string, any>,
    ctx: ExecutorContext,
  ): Promise<any> {
    const Stripe = this._require('stripe', 'npm install stripe');
    const connCfg = this._getConnectorConfig(d, ctx);
    const stripe = new Stripe(connCfg.secretKey || ctx.secrets?.[connCfg.secretKeyEnvVar] || '');
    const resource = stripe[config.resource];
    if (!resource) throw new ExecutorError(`Unknown Stripe resource: ${config.resource}`, 'RUNTIME_ERROR', false);
    return await resource[config.action](config.params || {});
  }

  private async _runGenericApi(
    d: ConnectorExecutionDescriptor,
    config: Record<string, any>,
    ctx: ExecutorContext,
  ): Promise<any> {
    return this._runRestApi(d, config, ctx);
  }

  private async _runLocalFile(
    d: ConnectorExecutionDescriptor,
    config: Record<string, any>,
    _ctx: ExecutorContext,
  ): Promise<any> {
    const fs = require('fs');
    const filePath: string = config.path;
    switch (d.operation) {
      case 'query':  return { content: fs.readFileSync(filePath, config.encoding || 'utf8') };
      case 'insert': fs.writeFileSync(filePath, config.content, config.encoding || 'utf8'); return { written: true };
      case 'delete': fs.unlinkSync(filePath); return { deleted: true };
      default:       throw new ExecutorError(`local_file: unsupported operation '${d.operation}'`, 'RUNTIME_ERROR', false);
    }
  }

  private async _runS3(
    d: ConnectorExecutionDescriptor,
    config: Record<string, any>,
    ctx: ExecutorContext,
  ): Promise<any> {
    const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = this._require('@aws-sdk/client-s3', 'npm install @aws-sdk/client-s3');
    const connCfg = this._getConnectorConfig(d, ctx);
    const s3 = new S3Client({
      region: connCfg.region || 'us-east-1',
      credentials: {
        accessKeyId: connCfg.accessKey || ctx.secrets?.['AWS_ACCESS_KEY_ID'] || '',
        secretAccessKey: connCfg.secretKey || ctx.secrets?.['AWS_SECRET_ACCESS_KEY'] || '',
      },
    });
    switch (d.operation) {
      case 'query': {
        const res = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: config.key }));
        const body = await (res.Body as any).transformToString();
        return { content: body, contentType: res.ContentType };
      }
      case 'insert': {
        await s3.send(new PutObjectCommand({ Bucket: config.bucket, Key: config.key, Body: config.content, ContentType: config.contentType }));
        return { uploaded: true, key: config.key };
      }
      case 'delete': {
        await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: config.key }));
        return { deleted: true };
      }
      default:
        throw new ExecutorError(`S3: unsupported operation '${d.operation}'`, 'RUNTIME_ERROR', false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────────

  private _getConnectorConfig(d: ConnectorExecutionDescriptor, ctx: ExecutorContext): Record<string, any> {
    const configs = ctx.connectorConfigs || {};
    // Look for a connector config matching the type
    const found = Object.values(configs).find((c: any) => c?.type === d.connectorType || c?.connectorType === d.connectorType);
    if (!found) {
      this.logger.warn(`[CONNECTOR] No '${d.connectorType}' config found in context; using empty config`);
      return {};
    }
    return found as Record<string, any>;
  }

  private _resolveTemplate(config: Record<string, any>, inputs: Record<string, any>): Record<string, any> {
    const resolve = (val: any): any => {
      if (typeof val === 'string') {
        return val.replace(/\{(\w+)\}/g, (_, key) => inputs[key] !== undefined ? String(inputs[key]) : `{${key}}`);
      }
      if (Array.isArray(val)) return val.map(resolve);
      if (val && typeof val === 'object') {
        return Object.fromEntries(Object.entries(val).map(([k, v]) => [k, resolve(v)]));
      }
      return val;
    };
    return resolve(config) as Record<string, any>;
  }

  private _applyInputMapping(inputs: Record<string, any>, mapping?: Record<string, string>): Record<string, any> {
    if (!mapping) return inputs;
    const result: Record<string, any> = { ...inputs };
    for (const [portName, targetName] of Object.entries(mapping)) {
      if (inputs[portName] !== undefined) {
        result[targetName] = inputs[portName];
      }
    }
    return result;
  }

  private _applyOutputMapping(result: any, mapping?: Record<string, string>): Record<string, any> {
    if (!result || typeof result !== 'object') return { result };
    if (!mapping) return result;
    const outputs: Record<string, any> = { ...result };
    for (const [from, to] of Object.entries(mapping)) {
      if (result[from] !== undefined) {
        outputs[to] = result[from];
      }
    }
    return outputs;
  }

  private _require(moduleName: string, hint: string): any {
    try {
      return require(moduleName);
    } catch {
      throw new ExecutorError(
        `Connector driver '${moduleName}' not installed. ${hint}`,
        'BINARY_NOT_FOUND',
        false,
      );
    }
  }
}
