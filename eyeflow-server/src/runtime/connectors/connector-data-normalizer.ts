/**
 * ConnectorDataNormalizer
 *
 * Converts any raw connector response into the canonical
 * `ConnectorPayload.data: Record<string, unknown>[]` array.
 *
 * RULES (applied in order, first match wins):
 *  ① null / undefined                        → []
 *  ② Already an array                        → used as-is (items cast to Record)
 *  ③ Object with well-known array property   → extract that property
 *     (.rows, .data, .items, .results, .records, .documents, .entries,
 *      .hits, .orders, .products, .customers, .contacts, .deals)
 *  ④ Object with a single array property     → extract that array
 *  ⑤ Plain object (not array, not above)     → [obj]
 *  ⑥ Scalar (string, number, boolean, …)     → [{ value: scalar }]
 *
 * Additionally extracts field names from the first record (for schema discovery)
 * and the row count.
 *
 * This class is framework-agnostic (no NestJS decorators) so it can be used
 * as a plain utility by driver tests or edge-node agents.
 */

import { ConnectorPayload, ConnectorPayloadMetadata } from './connector-payload.interface';

// Well-known array-bearing keys in order of priority (most common first)
const KNOWN_ARRAY_KEYS = [
  'rows', 'data', 'items', 'results', 'records', 'documents',
  'entries', 'hits', 'list', 'orders', 'products', 'customers',
  'contacts', 'deals', 'messages', 'events', 'logs', 'values',
] as const;

export class ConnectorDataNormalizer {

  /**
   * Build a full ConnectorPayload from a raw driver result.
   */
  static wrap(
    raw: unknown,
    opts: {
      connectorId: string;
      connectorType: string;
      operation: string;
      source?: string;
      contentType?: string;
      extra?: Record<string, unknown>;
    },
  ): ConnectorPayload {
    const data = ConnectorDataNormalizer.normalize(raw);
    const fields = ConnectorDataNormalizer.extractFields(data);

    // Detect hasMore / nextCursor from common shapes in raw
    let hasMore: boolean | undefined;
    let nextCursor: string | null | undefined;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const r = raw as Record<string, unknown>;
      hasMore = typeof r['hasMore'] === 'boolean' ? r['hasMore']
        : typeof r['has_more'] === 'boolean' ? r['has_more']
        : r['nextPage'] !== undefined ? true : undefined;
      nextCursor = (r['nextCursor'] ?? r['next_cursor'] ?? r['LastEvaluatedKey'] ?? r['pageToken'] ?? null) as string | null;
    }

    const metadata: ConnectorPayloadMetadata = {
      rowCount: data.length,
      source: opts.source,
      fields: fields.length > 0 ? fields : undefined,
      contentType: opts.contentType,
      hasMore,
      nextCursor,
      executedAt: new Date().toISOString(),
      extra: opts.extra,
    };

    return {
      connectorId: opts.connectorId,
      connectorType: opts.connectorType,
      operation: opts.operation,
      raw,
      data,
      metadata,
    };
  }

  /**
   * Core normalization: any raw value → Record<string, unknown>[]
   */
  static normalize(raw: unknown): Record<string, unknown>[] {
    // ① null / undefined
    if (raw === null || raw === undefined) return [];

    // ② Already an array
    if (Array.isArray(raw)) {
      return raw.map((item) => ConnectorDataNormalizer._toRecord(item));
    }

    // ③ Object with well-known array-bearing key
    if (typeof raw === 'object') {
      const r = raw as Record<string, unknown>;

      for (const key of KNOWN_ARRAY_KEYS) {
        if (Array.isArray(r[key])) {
          return (r[key] as unknown[]).map((item) => ConnectorDataNormalizer._toRecord(item));
        }
      }

      // ④ Object with exactly ONE array-valued property
      const arrayEntries = Object.entries(r).filter(([, v]) => Array.isArray(v));
      if (arrayEntries.length === 1) {
        return (arrayEntries[0][1] as unknown[]).map((item) => ConnectorDataNormalizer._toRecord(item));
      }

      // ⑤ Plain object → wrap in array
      return [r as Record<string, unknown>];
    }

    // ⑥ Scalar
    return [{ value: raw }];
  }

  /**
   * Extract field names from the first record.
   * Returns [] if data is empty or the record has no enumerable keys.
   */
  static extractFields(data: Record<string, unknown>[]): string[] {
    if (data.length === 0) return [];
    return Object.keys(data[0]);
  }

  // ─────────────────────────────────────────────────────────────────────────

  private static _toRecord(item: unknown): Record<string, unknown> {
    if (item === null || item === undefined) return { value: null };
    if (typeof item === 'object' && !Array.isArray(item)) return item as Record<string, unknown>;
    // Scalar item inside array (e.g. SELECT count(*) → [42])
    return { value: item };
  }
}
