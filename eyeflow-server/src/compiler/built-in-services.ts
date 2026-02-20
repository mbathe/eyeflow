/**
 * BUILT-IN SERVICE CATALOGUE
 *
 * All services shipped with Eyeflow out-of-the-box.
 * These are automatically seeded into the ServiceRegistryService on startup.
 *
 * Structure of each entry (PowerfulServiceManifest):
 *  - inputs / outputs           : typed I/O ports
 *  - executionDescriptors       : one entry per supported format (ordered by preference)
 *  - nodeRequirements           : what the execution node must provide
 *  - contract                   : determinism, idempotency, latency, retry
 *
 * Adding a new built-in service is as simple as appending an entry here.
 * Users can register custom services via the ServiceRegistry REST API.
 */

import { PowerfulServiceManifest } from './interfaces/service-manifest.interface';

const NOW = new Date('2026-02-19T00:00:00Z');

// ─────────────────────────────────────────────────────────────────────────────
// Helper defaults
// ─────────────────────────────────────────────────────────────────────────────

function defaultRetry(attempts = 3) {
  return { maxAttempts: attempts, delayMs: 200, backoffFactor: 2, retryOn: ['TIMEOUT', 'NETWORK_ERROR'] };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── 1. COMPUTE / ML ──────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const sentimentAnalyzer: PowerfulServiceManifest = {
  id: 'sentiment-analyzer',
  name: 'Sentiment Analyzer',
  version: '2.1.0',
  description: 'Analyzes the sentiment of a text (positive / negative / neutral) with a confidence score.',
  author: 'eyeflow-team',
  publishedBy: 'eyeflow.core',
  publishedAt: NOW,
  tags: ['nlp', 'sentiment', 'ml'],
  category: 'ml',
  namespace: 'eyeflow.core',

  inputs: [
    { name: 'text', type: 'string', required: true, description: 'Text to analyze' },
    { name: 'language', type: 'string', required: false, defaultValue: 'en', description: 'ISO 639-1 language code' },
  ],
  outputs: [
    { name: 'sentiment', type: 'string', label: 'Sentiment label (positive/negative/neutral)' },
    { name: 'score', type: 'number', label: 'Confidence score 0-1' },
  ],

  executionDescriptors: [
    // Prefer WASM on edge nodes (fast, offline-capable)
    {
      format: 'WASM',
      binaryUrl: 'https://cdn.eyeflow.io/services/sentiment-analyzer-2.1.0.wasm',
      checksum: 'sha256:aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
      memorySizeMb: 8,
      exportedFunction: 'run',
      abi: 'json_stdin',
      compatibleTiers: ['CENTRAL', 'LINUX'],
    },
    // Fall back to HTTP API on central if WASM is not available
    {
      format: 'HTTP',
      urlTemplate: 'https://api.eyeflow.io/v1/sentiment',
      method: 'POST',
      auth: { type: 'bearer', envVar: 'EYEFLOW_API_KEY' },
      requestMapping: 'body_json',
      responseMapping: 'body_json',
      outputMapping: { 'label': 'sentiment', 'confidence': 'score' },
      compatibleTiers: ['CENTRAL', 'LINUX'],
    },
  ],

  nodeRequirements: {
    supportedTiers: ['CENTRAL', 'LINUX'],
    needsInternet: false, // WASM works offline; HTTP version needs internet
  },

  contract: {
    deterministic: true,
    idempotent: true,
    hasExternalSideEffects: false,
    nominalLatencyMs: 15,
    timeoutMs: 5_000,
    retryPolicy: defaultRetry(),
  },

  trusted: true,
  costPerCall: 0,

  examples: [
    {
      description: 'Positive review',
      input: { text: 'This product is absolutely amazing!' },
      expectedOutput: { sentiment: 'positive', score: 0.97 },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────

const imageProcessor: PowerfulServiceManifest = {
  id: 'image-processor',
  name: 'Image Processor',
  version: '1.5.0',
  description: 'Applies image transformations (resize, crop, filter, OCR).',
  author: 'eyeflow-team',
  publishedBy: 'eyeflow.core',
  publishedAt: NOW,
  tags: ['image', 'computer-vision', 'ocr'],
  category: 'ml',

  inputs: [
    { name: 'imageData', type: 'buffer', required: true, description: 'Raw image bytes (JPEG/PNG/WebP)' },
    { name: 'operation', type: 'string', required: true, description: 'One of: resize, crop, grayscale, ocr, thumbnail' },
    { name: 'options', type: 'object', required: false, defaultValue: {}, description: 'Operation-specific options (width, height, …)' },
  ],
  outputs: [
    { name: 'result', type: 'buffer', label: 'Processed image bytes (or null for ocr)' },
    { name: 'text', type: 'string', label: 'OCR extracted text (only for operation=ocr)' },
    { name: 'metadata', type: 'object', label: 'Image metadata (dimensions, format, …)' },
  ],

  executionDescriptors: [
    {
      format: 'NATIVE',
      binaries: [
        { platform: 'linux-x64',   binaryUrl: 'https://cdn.eyeflow.io/services/image-processor-1.5.0-linux-x64',   checksum: 'sha256:aabb0011' },
        { platform: 'linux-arm64', binaryUrl: 'https://cdn.eyeflow.io/services/image-processor-1.5.0-linux-arm64', checksum: 'sha256:ccdd2233' },
      ],
      invocationProtocol: 'json_stdin',
      compatibleTiers: ['CENTRAL', 'LINUX'],
    },
    {
      format: 'DOCKER',
      image: 'eyeflow/image-processor',
      tag: '1.5.0',
      invocationProtocol: 'stdin_json',
      memoryMb: 256,
      compatibleTiers: ['CENTRAL'],
    },
  ],

  nodeRequirements: {
    supportedTiers: ['CENTRAL', 'LINUX'],
    minMemoryMb: 64,
  },

  contract: {
    deterministic: true,
    idempotent: true,
    hasExternalSideEffects: false,
    nominalLatencyMs: 80,
    timeoutMs: 15_000,
    retryPolicy: defaultRetry(2),
  },

  trusted: true,
};

// ─────────────────────────────────────────────────────────────────────────────

const mlTrainer: PowerfulServiceManifest = {
  id: 'ml-trainer',
  name: 'ML Model Trainer',
  version: '3.0.0',
  description: 'Trains a machine learning model on a labeled dataset. Long-running service.',
  author: 'data-team',
  publishedBy: 'eyeflow.core',
  publishedAt: NOW,
  tags: ['ml', 'training', 'gpu'],
  category: 'ml',

  inputs: [
    { name: 'datasetS3Key', type: 'string', required: true },
    { name: 'modelType', type: 'string', required: true, description: 'xgboost | random_forest | neural_net' },
    { name: 'epochs', type: 'number', required: false, defaultValue: 10 },
    { name: 'hyperparams', type: 'object', required: false, defaultValue: {} },
  ],
  outputs: [
    { name: 'modelId', type: 'string' },
    { name: 'accuracy', type: 'number' },
    { name: 'trainingTimeMs', type: 'number' },
    { name: 'modelS3Key', type: 'string' },
  ],

  executionDescriptors: [
    {
      format: 'DOCKER',
      image: 'eyeflow/ml-trainer',
      tag: '3.0.0',
      invocationProtocol: 'stdin_json',
      secretEnvVars: { AWS_ACCESS_KEY_ID: 'AWS_ACCESS_KEY_ID', AWS_SECRET_ACCESS_KEY: 'AWS_SECRET_ACCESS_KEY' },
      memoryMb: 4096,
      compatibleTiers: ['CENTRAL'],
    },
  ],

  nodeRequirements: {
    supportedTiers: ['CENTRAL'],
    minMemoryMb: 2048,
    needsVaultAccess: true,
  },

  contract: {
    deterministic: false,
    idempotent: true,
    hasExternalSideEffects: true, // Writes model to S3
    nominalLatencyMs: 60_000,
    timeoutMs: 3_600_000, // 1 hour
    retryPolicy: { maxAttempts: 1, delayMs: 0, backoffFactor: 1 },
  },

  trusted: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// ── 2. GITHUB (MCP) ──────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const githubSearch: PowerfulServiceManifest = {
  id: 'github-search',
  name: 'GitHub Repository Search',
  version: '1.0.0',
  description: 'Searches GitHub for repositories matching a query.',
  author: 'eyeflow-team',
  publishedBy: 'eyeflow.core',
  publishedAt: NOW,
  tags: ['github', 'search', 'git'],
  category: 'utility',

  inputs: [
    { name: 'query', type: 'string', required: true },
    { name: 'language', type: 'string', required: false },
    { name: 'limit', type: 'number', required: false, defaultValue: 10 },
  ],
  outputs: [
    { name: 'repositories', type: 'array' },
    { name: 'count', type: 'number' },
  ],

  executionDescriptors: [
    {
      format: 'MCP',
      serverName: 'ghcli',
      toolName: 'search_repos',
      inputMapping: { query: 'q', language: 'language', limit: 'per_page' },
      outputMapping: { items: 'repositories', total_count: 'count' },
      compatibleTiers: ['CENTRAL'],
    },
    {
      format: 'HTTP',
      urlTemplate: 'https://api.github.com/search/repositories',
      method: 'GET',
      auth: { type: 'bearer', envVar: 'GITHUB_TOKEN' },
      requestMapping: 'query_params',
      responseMapping: 'body_json',
      outputMapping: { 'items': 'repositories', 'total_count': 'count' },
      headers: { 'Accept': 'application/vnd.github.v3+json' },
      compatibleTiers: ['CENTRAL', 'LINUX'],
    },
  ],

  nodeRequirements: {
    supportedTiers: ['CENTRAL'],
    needsInternet: true,
  },

  contract: {
    deterministic: false,
    idempotent: true,
    hasExternalSideEffects: false,
    nominalLatencyMs: 400,
    timeoutMs: 15_000,
    retryPolicy: defaultRetry(),
  },

  trusted: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// ── 3. DATABASE CONNECTORS ───────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function makeDbQueryService(
  id: string,
  name: string,
  connectorType: string,
  description: string,
): PowerfulServiceManifest {
  return {
    id,
    name,
    version: '1.0.0',
    description,
    author: 'eyeflow-team',
    publishedBy: 'eyeflow.core',
    publishedAt: NOW,
    tags: ['database', 'sql', connectorType],
    category: 'connector',

    inputs: [
      { name: 'query', type: 'string', required: true, description: 'SQL query (parameterized with $1/$2/? placeholders)' },
      { name: 'params', type: 'array', required: false, defaultValue: [], description: 'Query parameters' },
      { name: 'connectorId', type: 'string', required: false, description: 'Connector instance ID (if multiple configured)' },
    ],
    outputs: [
      { name: 'rows', type: 'array', label: 'Result rows as JSON objects' },
      { name: 'rowCount', type: 'number', label: 'Number of rows returned / affected' },
    ],

    executionDescriptors: [
      {
        format: 'CONNECTOR',
        connectorType,
        operation: 'query',
        operationConfig: { sql: '{query}', params: '{params}' },
        inputMapping: { query: 'query', params: 'params' },
        compatibleTiers: ['CENTRAL', 'LINUX'],
      },
    ],

    nodeRequirements: {
      supportedTiers: ['CENTRAL', 'LINUX'],
      needsInternet: false, // connects to local DB
      requiredConnectorIds: [connectorType],
    },

    contract: {
      deterministic: true, // Same query → same result (for read-only ops)
      idempotent: true,
      hasExternalSideEffects: false, // SELECT only; INSERT/UPDATE are separate services
      nominalLatencyMs: 20,
      timeoutMs: 30_000,
      retryPolicy: defaultRetry(),
    },

    trusted: true,
  };
}

function makeDbWriteService(
  id: string,
  name: string,
  connectorType: string,
  operation: 'insert' | 'update' | 'delete',
): PowerfulServiceManifest {
  return {
    id,
    name,
    version: '1.0.0',
    description: `${operation.charAt(0).toUpperCase() + operation.slice(1)} records in a ${connectorType} database.`,
    author: 'eyeflow-team',
    publishedBy: 'eyeflow.core',
    publishedAt: NOW,
    tags: ['database', connectorType, operation],
    category: 'connector',

    inputs: [
      { name: 'sql', type: 'string', required: true, description: `${operation.toUpperCase()} statement` },
      { name: 'params', type: 'array', required: false, defaultValue: [] },
    ],
    outputs: [
      { name: 'rowCount', type: 'number' },
      { name: 'insertedId', type: 'any', label: 'Last inserted ID (insert only)' },
    ],

    executionDescriptors: [
      {
        format: 'CONNECTOR',
        connectorType,
        operation,
        operationConfig: { sql: '{sql}', params: '{params}' },
        compatibleTiers: ['CENTRAL', 'LINUX'],
      },
    ],

    nodeRequirements: { supportedTiers: ['CENTRAL', 'LINUX'], requiredConnectorIds: [connectorType] },

    contract: {
      deterministic: true,
      idempotent: operation === 'delete',
      hasExternalSideEffects: true,
      nominalLatencyMs: 25,
      timeoutMs: 30_000,
      retryPolicy: { maxAttempts: 1, delayMs: 0, backoffFactor: 1 },
    },

    trusted: true,
  };
}

const postgresqlQuery  = makeDbQueryService('postgresql-query',  'PostgreSQL Query',  'postgresql', 'Execute a SELECT query against a PostgreSQL database.');
const postgresqlInsert = makeDbWriteService('postgresql-insert', 'PostgreSQL Insert', 'postgresql', 'insert');
const postgresqlUpdate = makeDbWriteService('postgresql-update', 'PostgreSQL Update', 'postgresql', 'update');
const postgresqlDelete = makeDbWriteService('postgresql-delete', 'PostgreSQL Delete', 'postgresql', 'delete');

const mysqlQuery  = makeDbQueryService('mysql-query',  'MySQL Query',  'mysql', 'Execute a SELECT query against a MySQL/MariaDB database.');
const mysqlInsert = makeDbWriteService('mysql-insert', 'MySQL Insert', 'mysql', 'insert');

const mongodbQuery  = makeDbQueryService('mongodb-find',   'MongoDB Find',   'mongodb', 'Query documents from a MongoDB collection.');
const mongodbInsert = makeDbWriteService('mongodb-insert', 'MongoDB Insert', 'mongodb', 'insert');
const mongodbUpdate = makeDbWriteService('mongodb-update', 'MongoDB Update', 'mongodb', 'update');
const mongodbDelete = makeDbWriteService('mongodb-delete', 'MongoDB Delete', 'mongodb', 'delete');

// ─────────────────────────────────────────────────────────────────────────────
// ── 4. MESSAGING / IOT CONNECTORS ────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const kafkaPublish: PowerfulServiceManifest = {
  id: 'kafka-publish',
  name: 'Kafka Publish',
  version: '1.0.0',
  description: 'Publishes a message to a Kafka topic.',
  author: 'eyeflow-team',
  publishedBy: 'eyeflow.core',
  publishedAt: NOW,
  tags: ['kafka', 'messaging', 'event-streaming'],
  category: 'connector',

  inputs: [
    { name: 'topic', type: 'string', required: true },
    { name: 'payload', type: 'any', required: true, description: 'Message payload (will be JSON-serialized)' },
    { name: 'key', type: 'string', required: false, description: 'Kafka partition key' },
  ],
  outputs: [
    { name: 'partition', type: 'number' },
    { name: 'offset', type: 'string' },
  ],

  executionDescriptors: [
    {
      format: 'CONNECTOR',
      connectorType: 'kafka',
      operation: 'publish',
      operationConfig: { topic: '{topic}', payload: '{payload}', key: '{key}' },
      compatibleTiers: ['CENTRAL', 'LINUX'],
    },
  ],

  nodeRequirements: { supportedTiers: ['CENTRAL', 'LINUX'], requiredConnectorIds: ['kafka'] },

  contract: {
    deterministic: false,
    idempotent: false,
    hasExternalSideEffects: true,
    nominalLatencyMs: 10,
    timeoutMs: 10_000,
    retryPolicy: defaultRetry(),
  },

  trusted: true,
};

const mqttPublish: PowerfulServiceManifest = {
  id: 'mqtt-publish',
  name: 'MQTT Publish',
  version: '1.0.0',
  description: 'Publishes a message to an MQTT broker topic.',
  author: 'eyeflow-team',
  publishedBy: 'eyeflow.core',
  publishedAt: NOW,
  tags: ['mqtt', 'iot', 'messaging'],
  category: 'iot',

  inputs: [
    { name: 'topic', type: 'string', required: true },
    { name: 'payload', type: 'any', required: true },
    { name: 'qos', type: 'number', required: false, defaultValue: 0 },
    { name: 'retain', type: 'boolean', required: false, defaultValue: false },
  ],
  outputs: [
    { name: 'published', type: 'boolean' },
    { name: 'topic', type: 'string' },
  ],

  executionDescriptors: [
    {
      format: 'CONNECTOR',
      connectorType: 'mqtt',
      operation: 'publish',
      operationConfig: { topic: '{topic}', payload: '{payload}', qos: '{qos}', retain: '{retain}' },
      compatibleTiers: ['CENTRAL', 'LINUX'],
    },
    // MCU edge nodes can publish MQTT natively via Rust SVM
    {
      format: 'NATIVE',
      binaries: [
        { platform: 'bare-metal-arm-cm4',  binaryUrl: 'https://cdn.eyeflow.io/services/mqtt-publish-cm4.bin',  checksum: 'sha256:00aa', flashAddress: '0x08020000' },
        { platform: 'bare-metal-xtensa', binaryUrl: 'https://cdn.eyeflow.io/services/mqtt-publish-esp32.bin', checksum: 'sha256:00bb', flashAddress: '0x10000' },
      ],
      invocationProtocol: 'json_stdin',
      worksWithoutOs: true,
      compatibleTiers: ['MCU'],
    },
  ],

  nodeRequirements: { supportedTiers: ['CENTRAL', 'LINUX', 'MCU'] },

  contract: {
    deterministic: false,
    idempotent: false,
    hasExternalSideEffects: true,
    nominalLatencyMs: 5,
    timeoutMs: 5_000,
    retryPolicy: defaultRetry(),
  },

  trusted: true,
};

const influxdbWrite: PowerfulServiceManifest = {
  id: 'influxdb-write',
  name: 'InfluxDB Write',
  version: '1.0.0',
  description: 'Writes time-series data points to an InfluxDB bucket.',
  author: 'eyeflow-team',
  publishedBy: 'eyeflow.core',
  publishedAt: NOW,
  tags: ['influxdb', 'time-series', 'iot', 'monitoring'],
  category: 'iot',

  inputs: [
    { name: 'measurement', type: 'string', required: true },
    { name: 'fields', type: 'object', required: true, description: 'Field key-value pairs' },
    { name: 'tags', type: 'object', required: false, defaultValue: {} },
    { name: 'timestamp', type: 'number', required: false, description: 'Unix nanoseconds (defaults to now)' },
  ],
  outputs: [
    { name: 'written', type: 'boolean' },
    { name: 'timestamp', type: 'number' },
  ],

  executionDescriptors: [
    {
      format: 'HTTP',
      urlTemplate: '{INFLUXDB_URL}/api/v2/write?org={INFLUXDB_ORG}&bucket={INFLUXDB_BUCKET}&precision=ns',
      method: 'POST',
      auth: { type: 'bearer', envVar: 'INFLUXDB_TOKEN' },
      requestMapping: 'body_json',
      responseMapping: 'status_code',
      compatibleTiers: ['CENTRAL', 'LINUX'],
    },
    {
      format: 'CONNECTOR',
      connectorType: 'influxdb',
      operation: 'insert',
      operationConfig: { measurement: '{measurement}', fields: '{fields}', tags: '{tags}', timestamp: '{timestamp}' },
      compatibleTiers: ['CENTRAL', 'LINUX'],
    },
  ],

  nodeRequirements: { supportedTiers: ['CENTRAL', 'LINUX'] },

  contract: {
    deterministic: false,
    idempotent: true,
    hasExternalSideEffects: true,
    nominalLatencyMs: 10,
    timeoutMs: 10_000,
    retryPolicy: defaultRetry(),
  },

  trusted: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// ── 5. COMMUNICATION CONNECTORS ──────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const smtpSendEmail: PowerfulServiceManifest = {
  id: 'smtp-send-email',
  name: 'Send Email (SMTP)',
  version: '1.0.0',
  description: 'Sends an email via SMTP (Nodemailer).',
  author: 'eyeflow-team',
  publishedBy: 'eyeflow.core',
  publishedAt: NOW,
  tags: ['email', 'smtp', 'communication'],
  category: 'communication',

  inputs: [
    { name: 'to', type: 'string', required: true, description: 'Recipient email or comma-separated list' },
    { name: 'subject', type: 'string', required: true },
    { name: 'body', type: 'string', required: true, description: 'Plain-text body' },
    { name: 'htmlBody', type: 'string', required: false },
    { name: 'cc', type: 'string', required: false },
    { name: 'bcc', type: 'string', required: false },
  ],
  outputs: [
    { name: 'messageId', type: 'string' },
    { name: 'accepted', type: 'array' },
  ],

  executionDescriptors: [
    {
      format: 'CONNECTOR',
      connectorType: 'smtp',
      operation: 'publish',
      operationConfig: { to: '{to}', subject: '{subject}', body: '{body}', htmlBody: '{htmlBody}', cc: '{cc}', bcc: '{bcc}' },
      compatibleTiers: ['CENTRAL'],
    },
  ],

  nodeRequirements: { supportedTiers: ['CENTRAL'], needsInternet: true },

  contract: {
    deterministic: false,
    idempotent: false,
    hasExternalSideEffects: true,
    nominalLatencyMs: 500,
    timeoutMs: 15_000,
    retryPolicy: { maxAttempts: 2, delayMs: 1000, backoffFactor: 2 },
  },

  trusted: true,
};

const slackPostMessage: PowerfulServiceManifest = {
  id: 'slack-post-message',
  name: 'Slack Post Message',
  version: '1.0.0',
  description: 'Posts a message or rich block to a Slack channel.',
  author: 'eyeflow-team',
  publishedBy: 'eyeflow.core',
  publishedAt: NOW,
  tags: ['slack', 'notification', 'communication'],
  category: 'communication',

  inputs: [
    { name: 'channel', type: 'string', required: true, description: '#channel-name or channel ID' },
    { name: 'message', type: 'string', required: true },
    { name: 'blocks', type: 'array', required: false, description: 'Slack Block Kit blocks (overrides message)' },
  ],
  outputs: [
    { name: 'ts', type: 'string', label: 'Message timestamp (Slack thread ID)' },
    { name: 'channel', type: 'string' },
  ],

  executionDescriptors: [
    {
      format: 'CONNECTOR',
      connectorType: 'slack',
      operation: 'publish',
      operationConfig: { channel: '{channel}', message: '{message}', blocks: '{blocks}' },
      compatibleTiers: ['CENTRAL'],
    },
    {
      format: 'HTTP',
      urlTemplate: 'https://slack.com/api/chat.postMessage',
      method: 'POST',
      auth: { type: 'bearer', envVar: 'SLACK_BOT_TOKEN' },
      requestMapping: 'body_json',
      responseMapping: 'body_json',
      outputMapping: { 'ts': 'ts', 'channel': 'channel' },
      compatibleTiers: ['CENTRAL'],
    },
  ],

  nodeRequirements: { supportedTiers: ['CENTRAL'], needsInternet: true },

  contract: {
    deterministic: false,
    idempotent: false,
    hasExternalSideEffects: true,
    nominalLatencyMs: 300,
    timeoutMs: 10_000,
    retryPolicy: defaultRetry(),
  },

  trusted: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// ── 6. S3 STORAGE ────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const s3GetObject: PowerfulServiceManifest = {
  id: 's3-get-object',
  name: 'S3 Get Object',
  version: '1.0.0',
  description: 'Downloads an object from AWS S3 or compatible storage.',
  author: 'eyeflow-team',
  publishedBy: 'eyeflow.core',
  publishedAt: NOW,
  tags: ['s3', 'storage', 'aws'],
  category: 'storage',

  inputs: [
    { name: 'bucket', type: 'string', required: true },
    { name: 'key', type: 'string', required: true },
  ],
  outputs: [
    { name: 'content', type: 'string', label: 'Object content as string' },
    { name: 'contentType', type: 'string' },
  ],

  executionDescriptors: [
    {
      format: 'CONNECTOR',
      connectorType: 's3',
      operation: 'query',
      operationConfig: { bucket: '{bucket}', key: '{key}' },
      compatibleTiers: ['CENTRAL', 'LINUX'],
    },
  ],

  nodeRequirements: { supportedTiers: ['CENTRAL', 'LINUX'], needsInternet: true, needsVaultAccess: true },

  contract: {
    deterministic: false,
    idempotent: true,
    hasExternalSideEffects: false,
    nominalLatencyMs: 200,
    timeoutMs: 30_000,
    retryPolicy: defaultRetry(),
  },

  trusted: true,
};

const s3PutObject: PowerfulServiceManifest = {
  id: 's3-put-object',
  name: 'S3 Put Object',
  version: '1.0.0',
  description: 'Uploads an object to AWS S3.',
  author: 'eyeflow-team',
  publishedBy: 'eyeflow.core',
  publishedAt: NOW,
  tags: ['s3', 'storage', 'aws'],
  category: 'storage',

  inputs: [
    { name: 'bucket', type: 'string', required: true },
    { name: 'key', type: 'string', required: true },
    { name: 'content', type: 'any', required: true },
    { name: 'contentType', type: 'string', required: false, defaultValue: 'application/octet-stream' },
  ],
  outputs: [
    { name: 'uploaded', type: 'boolean' },
    { name: 'etag', type: 'string' },
  ],

  executionDescriptors: [
    {
      format: 'CONNECTOR',
      connectorType: 's3',
      operation: 'insert',
      operationConfig: { bucket: '{bucket}', key: '{key}', content: '{content}', contentType: '{contentType}' },
      compatibleTiers: ['CENTRAL', 'LINUX'],
    },
  ],

  nodeRequirements: { supportedTiers: ['CENTRAL', 'LINUX'], needsInternet: true, needsVaultAccess: true },

  contract: {
    deterministic: false,
    idempotent: true,
    hasExternalSideEffects: true,
    nominalLatencyMs: 300,
    timeoutMs: 60_000,
    retryPolicy: defaultRetry(),
  },

  trusted: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// ── 7. STRIPE ────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const stripeCreateCharge: PowerfulServiceManifest = {
  id: 'stripe-create-payment-intent',
  name: 'Stripe Create Payment Intent',
  version: '1.0.0',
  description: 'Creates a Stripe PaymentIntent. Returns the client_secret for front-end confirmation.',
  author: 'eyeflow-team',
  publishedBy: 'eyeflow.core',
  publishedAt: NOW,
  tags: ['stripe', 'payment', 'business'],
  category: 'connector',

  inputs: [
    { name: 'amount', type: 'number', required: true, description: 'Amount in the smallest currency unit (e.g., cents)' },
    { name: 'currency', type: 'string', required: true, description: 'ISO 4217 (e.g., usd, eur)' },
    { name: 'customerId', type: 'string', required: false },
    { name: 'metadata', type: 'object', required: false, defaultValue: {} },
  ],
  outputs: [
    { name: 'paymentIntentId', type: 'string' },
    { name: 'clientSecret', type: 'string' },
    { name: 'status', type: 'string' },
  ],

  executionDescriptors: [
    {
      format: 'CONNECTOR',
      connectorType: 'stripe',
      operation: 'call',
      operationConfig: {
        resource: 'paymentIntents',
        action: 'create',
        params: { amount: '{amount}', currency: '{currency}', customer: '{customerId}', metadata: '{metadata}' },
      },
      outputMapping: { 'id': 'paymentIntentId', 'client_secret': 'clientSecret', 'status': 'status' },
      compatibleTiers: ['CENTRAL'],
    },
  ],

  nodeRequirements: { supportedTiers: ['CENTRAL'], needsInternet: true, needsVaultAccess: true },

  contract: {
    deterministic: false,
    idempotent: false,
    hasExternalSideEffects: true, // Creates a charge record
    nominalLatencyMs: 400,
    timeoutMs: 20_000,
    retryPolicy: { maxAttempts: 1, delayMs: 0, backoffFactor: 1 },
  },

  trusted: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// ── 8. UTILITY: EmbeddedJS ───────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const jsonTransform: PowerfulServiceManifest = {
  id: 'json-transform',
  name: 'JSON Transform',
  version: '1.0.0',
  description: 'Applies a user-defined JavaScript transformation to a JSON payload. Runs in a sandboxed VM.',
  author: 'eyeflow-team',
  publishedBy: 'eyeflow.core',
  publishedAt: NOW,
  tags: ['transform', 'utility', 'js'],
  category: 'utility',

  inputs: [
    { name: 'payload', type: 'any', required: true, description: 'Input data to transform' },
    { name: 'code', type: 'string', required: true, description: 'JS function: function main({payload}) { return {...}; }' },
  ],
  outputs: [
    { name: 'result', type: 'any' },
  ],

  executionDescriptors: [
    {
      format: 'EMBEDDED_JS',
      code: `
        // 'code' input contains the user's transform function
        // We eval it in the sandbox and call it with the payload
        const userFn = eval('(' + inputs.code + ')');
        outputs.result = userFn({ payload: inputs.payload });
      `,
      executionTimeoutMs: 2_000,
      compatibleTiers: ['CENTRAL', 'LINUX'],
    },
  ],

  nodeRequirements: { supportedTiers: ['CENTRAL', 'LINUX'] },

  contract: {
    deterministic: true,
    idempotent: true,
    hasExternalSideEffects: false,
    nominalLatencyMs: 2,
    timeoutMs: 3_000,
    retryPolicy: defaultRetry(1),
  },

  trusted: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// ── EXPORT ───────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export const BUILT_IN_SERVICES: PowerfulServiceManifest[] = [
  // Compute / ML
  sentimentAnalyzer,
  imageProcessor,
  mlTrainer,

  // GitHub (MCP)
  githubSearch,

  // PostgreSQL
  postgresqlQuery,
  postgresqlInsert,
  postgresqlUpdate,
  postgresqlDelete,

  // MySQL
  mysqlQuery,
  mysqlInsert,

  // MongoDB
  mongodbQuery,
  mongodbInsert,
  mongodbUpdate,
  mongodbDelete,

  // Kafka
  kafkaPublish,

  // MQTT (also MCU-capable)
  mqttPublish,

  // InfluxDB
  influxdbWrite,

  // Communication
  smtpSendEmail,
  slackPostMessage,

  // S3
  s3GetObject,
  s3PutObject,

  // Business
  stripeCreateCharge,

  // Utility
  jsonTransform,
];

export function getBuiltInServiceById(id: string): PowerfulServiceManifest | undefined {
  return BUILT_IN_SERVICES.find(s => s.id === id);
}
