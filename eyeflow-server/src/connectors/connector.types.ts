/**
 * CONNECTOR TYPES - Définition complète des types de connecteurs supportés
 * Chaque connecteur peut avoir ses propres paramètres de configuration
 */

export enum ConnectorType {
  // DATABASE
  POSTGRESQL = 'postgresql',
  MYSQL = 'mysql',
  MONGODB = 'mongodb',
  DYNAMODB = 'dynamodb',
  FIRESTORE = 'firestore',

  // FILE SYSTEMS
  LOCAL_FILE = 'local_file',
  S3 = 's3',
  GOOGLE_DRIVE = 'google_drive',
  DROPBOX = 'dropbox',

  // IoT & PROTOCOLS
  MQTT = 'mqtt',
  KAFKA = 'kafka',
  INFLUXDB = 'influxdb',

  // COMMUNICATION
  SMTP = 'smtp',
  SLACK = 'slack',
  TEAMS = 'teams',
  WHATSAPP = 'whatsapp',

  // ERP & BUSINESS APPS
  SHOPIFY = 'shopify',
  STRIPE = 'stripe',
  HUBSPOT = 'hubspot',

  // WEBHOOKS & CUSTOM
  WEBHOOK = 'webhook',
  REST_API = 'rest_api',
  GRAPHQL = 'graphql',
}

export enum ConnectorStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
  TESTING = 'testing',
}

export enum AuthType {
  NONE = 'none',
  API_KEY = 'api_key',
  OAUTH2 = 'oauth2',
  BASIC_AUTH = 'basic_auth',
  BEARER_TOKEN = 'bearer_token',
  CONNECTION_STRING = 'connection_string',
}

/**
 * Configuration de base pour tous les connecteurs
 */
export interface BaseConnectorConfig {
  // Identifiants
  id: string;
  name: string;
  type: ConnectorType;
  userId: string;

  // Description & docs
  description?: string;
  icon?: string;
  category?: string;

  // Authentification
  auth: AuthConfig;

  // Configuration commune
  timeout?: number; // en millisecondes, défaut 30000
  retryCount?: number; // défaut 3
  retryDelay?: number; // en ms, défaut 1000
  rateLimit?: number; // requêtes par seconde
  enabled: boolean;

  // Logs
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Configuration d'authentification générique
 */
export interface AuthConfig {
  type: AuthType;
  credentials: Record<string, string | number | boolean>;
  encrypted: boolean; // Les credentials sont chiffrés en DB
}

/**
 * ========================
 * DATABASE CONNECTORS
 * ========================
 */

export interface PostgresConnectorConfig extends BaseConnectorConfig {
  type: ConnectorType.POSTGRESQL;
  auth: AuthConfig & {
    credentials: {
      host: string;
      port: number;
      database: string;
      username: string;
      password: string;
      ssl?: boolean;
    };
  };
  connectionPool?: {
    min: number;
    max: number;
  };
}

export interface MongoDbConnectorConfig extends BaseConnectorConfig {
  type: ConnectorType.MONGODB;
  auth: AuthConfig & {
    credentials: {
      connectionString: string;
      database?: string;
    };
  };
}

export interface DynamoDbConnectorConfig extends BaseConnectorConfig {
  type: ConnectorType.DYNAMODB;
  auth: AuthConfig & {
    credentials: {
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
    };
  };
}

/**
 * ========================
 * FILE SYSTEMS
 * ========================
 */

export interface LocalFileConnectorConfig extends BaseConnectorConfig {
  type: ConnectorType.LOCAL_FILE;
  basePath: string;
  extensions?: string[];
  recursive?: boolean;
}

export interface S3ConnectorConfig extends BaseConnectorConfig {
  type: ConnectorType.S3;
  auth: AuthConfig & {
    credentials: {
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
    };
  };
  bucket: string;
}

/**
 * ========================
 * IoT & PROTOCOLS
 * ========================
 */

export interface MqttConnectorConfig extends BaseConnectorConfig {
  type: ConnectorType.MQTT;
  auth: AuthConfig & {
    credentials: {
      broker: string;
      port: number;
      username?: string;
      password?: string;
      clientId?: string;
    };
  };
  topics: string[];
  qos?: 0 | 1 | 2;
}

export interface KafkaConnectorConfig extends BaseConnectorConfig {
  type: ConnectorType.KAFKA;
  auth: AuthConfig & {
    credentials: {
      brokers: string[];
      groupId: string;
      clientId?: string;
      saslMechanism?: 'plain' | 'scram-sha-256' | 'scram-sha-512';
      username?: string;
      password?: string;
      ssl?: boolean;
      caPath?: string;
    };
  };
  // Consumer configuration
  topics: string[];
  sessionTimeout?: number; // ms, default 30000
  heartbeatInterval?: number; // ms, default 3000
  
  // CDC Configuration (if used for CDC)
  isCdcSource?: boolean; // Flag if this connector serves as CDC source
  cdcTopicPattern?: string; // Pattern matching for CDC topics (e.g., "cdc.*.*.*")
  
  // Producer configuration (if used for writing)
  isProducer?: boolean;
  producerCompressionType?: 'gzip' | 'snappy' | 'lz4' | 'zstd';
  producerBatchSize?: number;
}

export interface InfluxDbConnectorConfig extends BaseConnectorConfig {
  type: ConnectorType.INFLUXDB;
  auth: AuthConfig & {
    credentials: {
      url: string;
      token: string;
      org: string;
      bucket: string;
    };
  };
}

/**
 * ========================
 * COMMUNICATION
 * ========================
 */

export interface SlackConnectorConfig extends BaseConnectorConfig {
  type: ConnectorType.SLACK;
  auth: AuthConfig & {
    credentials: {
      botToken: string;
      webhookUrl?: string;
    };
  };
  defaultChannel?: string;
}

export interface TeamsConnectorConfig extends BaseConnectorConfig {
  type: ConnectorType.TEAMS;
  auth: AuthConfig & {
    credentials: {
      webhookUrl: string;
      tenantId?: string;
      clientId?: string;
      clientSecret?: string;
    };
  };
}

export interface SmtpConnectorConfig extends BaseConnectorConfig {
  type: ConnectorType.SMTP;
  auth: AuthConfig & {
    credentials: {
      host: string;
      port: number;
      secure: boolean;
      username: string;
      password: string;
      fromEmail: string;
    };
  };
}

/**
 * ========================
 * CUSTOM REST/GRAPHQL
 * ========================
 */

export interface RestApiConnectorConfig extends BaseConnectorConfig {
  type: ConnectorType.REST_API;
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
  auth: AuthConfig;
}

export interface GraphQLConnectorConfig extends BaseConnectorConfig {
  type: ConnectorType.GRAPHQL;
  endpoint: string;
  auth: AuthConfig;
}

/**
 * Union type pour tous les connecteurs
 */
export type AnyConnectorConfig =
  | PostgresConnectorConfig
  | MongoDbConnectorConfig
  | DynamoDbConnectorConfig
  | LocalFileConnectorConfig
  | S3ConnectorConfig
  | MqttConnectorConfig
  | KafkaConnectorConfig
  | InfluxDbConnectorConfig
  | SlackConnectorConfig
  | TeamsConnectorConfig
  | SmtpConnectorConfig
  | RestApiConnectorConfig
  | GraphQLConnectorConfig;

/**
 * Kafka-specific types for CDC operations
 */
export interface KafkaTopicInfo {
  name: string;
  partitions: number;
  replicas: number;
  isCdcTopic: boolean; // true if matches cdc.* pattern
  source?: string; // Database source (postgres, mysql, etc.)
  schema?: string;
  table?: string;
}

export interface KafkaProducerMessage {
  topic: string;
  partition?: number;
  key?: string;
  value: Record<string, any>;
  headers?: Record<string, string>;
  timestamp?: number;
}

/**
 * Opération standard pour chaque connecteur
 */
export interface ConnectorOperation {
  id: string;
  name: string;
  description: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'SUBSCRIBE' | 'QUERY';
  parameters: OperationParameter[];
  returns: {
    type: string;
    schema?: any;
  };
}

export interface OperationParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  defaultValue?: any;
  enum?: any[];
}

/**
 * Response de test de connexion
 */
export interface ConnectorTestResponse {
  success: boolean;
  message: string;
  latency?: number;
  error?: string;
}

/**
 * Résultat d'exécution d'une opération
 */
export interface ConnectorExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
  timestamp: Date;
}
