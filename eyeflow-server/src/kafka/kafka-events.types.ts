/**
 * KAFKA EVENTS & CDC (Change Data Capture) Configuration
 * Real-time data streaming architecture for eyeflow
 */

export enum KafkaEventType {
  // Database Change Events (from Debezium CDC)
  DB_INSERT = 'db.insert',
  DB_UPDATE = 'db.update',
  DB_DELETE = 'db.delete',

  // System Events
  ALERT = 'system.alert',
  ANOMALY = 'system.anomaly',
  ERROR = 'system.error',

  // Business Events
  ORDER_CREATED = 'business.order.created',
  PAYMENT_RECEIVED = 'business.payment.received',
  SHIPMENT_DELAYED = 'business.shipment.delayed',
}

export enum CDCSource {
  POSTGRESQL = 'postgresql',
  MYSQL = 'mysql',
  MONGODB = 'mongodb',
  SQLSERVER = 'sqlserver',
  ORACLE = 'oracle',
}

/**
 * Change Data Capture Event Structure (from Debezium)
 * Represents a database change event
 */
export interface CDCEvent {
  // Event Metadata
  eventId: string;
  eventType: KafkaEventType; // db.insert | db.update | db.delete
  timestamp: number; // Unix timestamp
  source: {
    db: CDCSource; // Database type
    table: string; // Table name
    schema?: string; // Schema name
    connector?: string; // Debezium connector ID
  };

  // Data Change
  before?: Record<string, any>; // Previous state (for updates/deletes)
  after?: Record<string, any>; // Current state (for inserts/updates)
  operation: 'I' | 'U' | 'D'; // Insert, Update, Delete

  // Tracking
  transactionId?: string;
  logOffset?: number;
  sequenceNumber?: number;
}

/**
 * Transformed Event for Agent Processing
 * Converts CDC events into actionable agent missions
 */
export interface AgentMission {
  id: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  source: CDCEvent;
  actionType: string; // e.g., "verify_solvency", "prevent_maintenance"
  context: Record<string, any>; // Context data for the agent
  targetConnector?: string; // Which system to interact with
  deadline?: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: Date;
}

/**
 * Kafka Topic Configuration
 * Standard topic naming for eyeflow CDC pipeline
 */
export interface KafkaTopicConfig {
  name: string;
  description: string;
  partitions: number;
  replicationFactor: number;
  retention: number; // ms
  compression?: 'gzip' | 'snappy' | 'lz4';
}

/**
 * Standard Topics Structure
 */
export const KAFKA_TOPICS = {
  // CDC Topics (per database table)
  cdc: {
    databases: 'cdc.databases.events', // All DB events
    postgresql: 'cdc.postgresql.{schema}.{table}',
    mysql: 'cdc.mysql.{schema}.{table}',
    mongodb: 'cdc.mongodb.{database}.{collection}',
  },

  // Processed Events
  processed: {
    anomalies: 'processed.anomalies',
    alerts: 'processed.alerts',
    missions: 'processed.agent.missions',
  },

  // Agent Actions
  agent: {
    commands: 'agent.commands',
    results: 'agent.results',
    logs: 'agent.logs',
  },
};

/**
 * Debezium CDC Configuration Example
 * Used to set up Change Data Capture on source databases
 */
export const DEBEZIUM_CONFIG_TEMPLATE = {
  // For PostgreSQL
  postgresql: {
    name: 'postgres-cdc-eyeflow',
    config: {
      'connector.class': 'io.debezium.connector.postgresql.PostgresConnector',
      'database.hostname': '{host}',
      'database.port': '5432',
      'database.user': '{user}',
      'database.password': '{password}',
      'database.dbname': '{database}',
      'database.server.name': 'postgres-prod',
      'plugin.name': 'pgoutput', // Logical decoding plugin
      'publication.name': 'dbz_publication',
      'slot.name': 'dbz_slot',
      'table.include.list': '{schema}.{tables}',
      'transforms': 'route',
      'transforms.route.type':
        'org.apache.kafka.connect.transforms.RegexRouter',
      'transforms.route.regex': '([^.]+)\\.([^.]+)\\.([^.]+)',
      'transforms.route.replacement': 'cdc.$1.$2.$3',
    },
  },

  // For MySQL (with binlog)
  mysql: {
    name: 'mysql-cdc-eyeflow',
    config: {
      'connector.class': 'io.debezium.connector.mysql.MySqlConnector',
      'database.hostname': '{host}',
      'database.port': '3306',
      'database.user': '{user}',
      'database.password': '{password}',
      'database.server.id': '{server_id}',
      'database.server.name': 'mysql-prod',
      'database.include.list': '{databases}',
      'table.include.list': '{schema}.{tables}',
      'database.history.kafka.bootstrap.servers':
        'kafka:9092',
      'database.history.kafka.topic': 'dbhistory.mysql',
    },
  },

  // For SQL Server (with log mining)
  sqlserver: {
    name: 'sqlserver-cdc-eyeflow',
    config: {
      'connector.class': 'io.debezium.connector.sqlserver.SqlServerConnector',
      'database.hostname': '{host}',
      'database.port': '1433',
      'database.user': '{user}',
      'database.password': '{password}',
      'database.dbname': '{database}',
      'database.server.name': 'sqlserver-prod',
      'table.include.list': '{schema}.{tables}',
      'database.history.kafka.bootstrap.servers':
        'kafka:9092',
      'database.history.kafka.topic': 'dbhistory.sqlserver',
    },
  },
};

/**
 * Event Routing Rules
 * Maps database changes to agent actions
 */
export interface EventRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: {
    source: CDCSource;
    table: string;
    schema?: string;
    operations: ('I' | 'U' | 'D')[]; // Which operations trigger
    condition?: (event: CDCEvent) => boolean; // Custom filter
  };
  action: {
    type: string; // e.g., "verify_solvency", "check_maintenance"
    targetConnector: string; // Which system to interact with
    priority: 'critical' | 'high' | 'normal' | 'low';
    params?: Record<string, any>;
  };
}

/**
 * Example Rules
 */
export const EXAMPLE_RULES: EventRule[] = [
  {
    id: 'rule-1',
    name: 'High-Value Order Verification',
    enabled: true,
    trigger: {
      source: CDCSource.POSTGRESQL,
      table: 'orders',
      schema: 'ecommerce',
      operations: ['I'], // Trigger on INSERT only
      condition: (event) => {
        const order = event.after;
        return !!(order && order.total_amount > 1000 && order.is_new_customer);
      },
    },
    action: {
      type: 'verify_solvency',
      targetConnector: 'hubspot', // Check customer credit
      priority: 'high',
      params: {
        checkFraud: true,
        requireManualReview: true,
      },
    },
  },

  {
    id: 'rule-2',
    name: 'Preventive Maintenance Alert',
    enabled: true,
    trigger: {
      source: CDCSource.MONGODB,
      table: 'sensor_readings',
      schema: 'iot_production',
      operations: ['I'],
      condition: (event) => {
        const reading = event.after;
        return !!(
          reading &&
          reading.vibration_level > 8.5 &&
          reading.temperature > 90
        );
      },
    },
    action: {
      type: 'prevent_equipment_failure',
      targetConnector: 'machine_console',
      priority: 'critical',
      params: {
        reduce_speed: 30,
        alert_supervisor: true,
      },
    },
  },

  {
    id: 'rule-3',
    name: 'Payment Reconciliation',
    enabled: true,
    trigger: {
      source: CDCSource.MYSQL,
      table: 'transactions',
      schema: 'finance',
      operations: ['I', 'U'],
    },
    action: {
      type: 'reconcile_payment',
      targetConnector: 'stripe',
      priority: 'normal',
      params: {
        autoMatch: true,
        flagDiscrepancies: true,
      },
    },
  },
];
