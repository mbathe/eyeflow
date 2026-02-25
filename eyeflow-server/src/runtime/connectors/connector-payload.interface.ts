/**
 * ConnectorPayload — universal data envelope produced by every connector driver.
 *
 * DESIGN RULE: Every driver MUST wrap its raw output in this shape before returning.
 * The SVM registers always receive `ConnectorPayload`, regardless of the underlying
 * connector type (SQL, NoSQL, REST, MQTT, S3, custom, …).
 *
 * This means downstream rules / LLM-compiled IR instructions can always navigate
 *   payload.data[0].fieldName
 * without knowing whether the data came from a PostgreSQL query, a Shopify order,
 * an S3 object listing, or a completely custom REST connector.
 */

export interface ConnectorPayload {
  /** DB id of the connector instance that produced this payload */
  connectorId: string;

  /**
   * ConnectorType enum value OR a free-form string for custom connectors.
   * Custom connectors registered via REST_API / GRAPHQL / WEBHOOK will carry
   * their type as-is (e.g. 'rest_api', 'my_custom_erp').
   */
  connectorType: string;

  /** The operation / function that was called (e.g. 'query', 'insert', 'sendEmail') */
  operation: string;

  /**
   * The raw response exactly as returned by the external system.
   * Never mutated — preserved for debugging, logging, and audit.
   */
  raw: unknown;

  /**
   * Normalised record array.
   *
   * Rules:
   *  • SQL → rows array → each row is one record
   *  • MongoDB find → documents array → each document is one record
   *  • Single object → wrapped in [obj]
   *  • Already an array → used as-is
   *  • Nested array found at .data / .items / .results / .records → extracted
   *  • Scalar (string, number, boolean) → [{ value: scalar }]
   *  • null / undefined → []
   *
   * This ensures that rule conditions like `payload.data[0].price > 100`
   * work identically regardless of the connector.
   */
  data: Record<string, unknown>[];

  /** Structural metadata that LLM-compiled rules may use for schema discovery */
  metadata: ConnectorPayloadMetadata;
}

export interface ConnectorPayloadMetadata {
  /** Number of records in data[] */
  rowCount: number;

  /** Human-readable source description (e.g. 'postgresql:orders', 's3:reports/') */
  source?: string;

  /**
   * Field names detected from the first record.
   * Can be used by the rules engine to validate that a field actually exists
   * before generating a condition comparison.
   */
  fields?: string[];

  /** MIME type (for file / binary connectors) */
  contentType?: string;

  /** Whether data is paginated and there are more records */
  hasMore?: boolean;

  /** Pagination cursor / next page token (connector-specific) */
  nextCursor?: string | null;

  /** ISO-8601 timestamp of the moment the call was completed */
  executedAt: string;

  /** Any extra connector-specific metadata (e.g. DynamoDB LastEvaluatedKey) */
  extra?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query / action descriptors passed by the SVM to a driver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structured query filter — the universal query language understood by every driver.
 * The `ConnectorDriverRegistry` translates this into the connector-native format
 * (SQL WHERE clause, MongoDB filter, DynamoDB FilterExpression, REST query params, …).
 */
export interface ConnectorQueryFilter {
  /** Field name to filter on */
  field: string;
  /** Operator (mirrors ConditionOperator enum from connector-manifest.types) */
  op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'contains' | 'starts_with' | 'ends_with' | 'between' | 'exists' | 'regex';
  /** Value to compare against (for 'between': [min, max]) */
  value: unknown;
}

export interface ConnectorQueryOptions {
  /** Resource / table / collection / bucket to query */
  resource: string;
  filters?: ConnectorQueryFilter[];
  /** Fields to project (undefined = all) */
  select?: string[];
  /** Sort order */
  orderBy?: Array<{ field: string; dir: 'asc' | 'desc' }>;
  limit?: number;
  offset?: number;
  /** Raw pass-through for connectors that accept a full native query (SQL, Flux, etc.) */
  rawQuery?: string;
  /** Extra connector-specific options */
  extra?: Record<string, unknown>;
}

/**
 * Descriptor for an action (write / delete / execute / send / publish).
 * Mirrors the `ConnectorFunction` in connector-manifest.types.ts.
 */
export interface ConnectorActionDescriptor {
  /** The function id from the manifest (e.g. 'mysql_insert', 'smtp_sendEmail') */
  functionId: string;
  /** Parameters as declared by the function's parameter list */
  params: Record<string, unknown>;
}
