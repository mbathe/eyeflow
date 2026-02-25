/**
 * SqlDriver — handles 'postgresql' and 'mysql' connector types.
 *
 * Query API:   options.rawQuery takes precedence; otherwise a SELECT is built
 *              from options.resource, options.filters, options.select.
 * Action API:  functionId determines the operation:
 *               mysql_insert / postgres_insert  → INSERT INTO
 *               mysql_update / postgres_update  → UPDATE … SET … WHERE
 *               mysql_delete / postgres_delete  → DELETE FROM … WHERE
 *               mysql_select / postgres_select  → SELECT (same as query)
 */

import { ExecutorContext } from '../../executors/executor.interface';
import { BaseConnectorDriver, ConnectorDriverError } from '../connector-driver.interface';
import { ConnectorPayload, ConnectorQueryOptions, ConnectorActionDescriptor } from '../connector-payload.interface';
import { ConnectorDataNormalizer } from '../connector-data-normalizer';

export class SqlDriver extends BaseConnectorDriver {
  canHandle(t: string): boolean {
    return t === 'postgresql' || t === 'mysql';
  }

  async query(opts: ConnectorQueryOptions, cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload> {
    const client = await this._connect(cfg, ctx);
    try {
      const sql = opts.rawQuery ?? this._buildSelect(opts);
      const params = opts.filters?.map((f) => f.value) ?? [];
      const raw = await this._exec(client, sql, params, cfg);
      return ConnectorDataNormalizer.wrap(raw, {
        connectorId: this._connectorId(cfg, ctx),
        connectorType: cfg['type'] as string,
        operation: 'query',
        source: `${cfg['type']}:${opts.resource}`,
      });
    } finally {
      await this._end(client, cfg);
    }
  }

  async executeAction(action: ConnectorActionDescriptor, cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload> {
    const client = await this._connect(cfg, ctx);
    try {
      const p = action.params as Record<string, unknown>;
      let sql: string;
      let params: unknown[];

      if (action.functionId.endsWith('_insert')) {
        const keys = Object.keys(p['data'] as Record<string, unknown>);
        const vals = Object.values(p['data'] as Record<string, unknown>);
        sql = `INSERT INTO ${p['table']} (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})`;
        params = vals;
      } else if (action.functionId.endsWith('_update')) {
        const data = p['data'] as Record<string, unknown>;
        const where = p['where'] as Record<string, unknown>;
        const setCols = Object.keys(data).map((k, i) => `${k} = $${i + 1}`);
        const whereCols = Object.keys(where).map((k, i) => `${k} = $${Object.keys(data).length + i + 1}`);
        sql = `UPDATE ${p['table']} SET ${setCols.join(', ')} WHERE ${whereCols.join(' AND ')}`;
        params = [...Object.values(data), ...Object.values(where)];
      } else if (action.functionId.endsWith('_delete')) {
        const where = p['where'] as Record<string, unknown>;
        const whereCols = Object.keys(where).map((k, i) => `${k} = $${i + 1}`);
        sql = `DELETE FROM ${p['table']} WHERE ${whereCols.join(' AND ')}`;
        params = Object.values(where);
      } else {
        // Fallback: raw SQL
        sql = (p['sql'] ?? p['query']) as string;
        params = (p['params'] as unknown[]) ?? [];
      }

      const raw = await this._exec(client, sql, params, cfg);
      return ConnectorDataNormalizer.wrap(raw, {
        connectorId: this._connectorId(cfg, ctx),
        connectorType: cfg['type'] as string,
        operation: action.functionId,
      });
    } finally {
      await this._end(client, cfg);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  private async _connect(cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<any> {
    const type = cfg['type'] as string;
    if (type === 'postgresql') {
      const { Client } = this._require('pg', 'npm install pg');
      const c = new Client({
        host: cfg['host'], port: cfg['port'] ?? 5432,
        database: cfg['database'], user: cfg['username'],
        password: this._password(cfg, ctx), ssl: cfg['ssl'],
      });
      await c.connect();
      return { client: c, type };
    } else {
      const mysql = this._require('mysql2/promise', 'npm install mysql2');
      const c = await mysql.createConnection({
        host: cfg['host'], port: cfg['port'] ?? 3306,
        database: cfg['database'], user: cfg['username'],
        password: this._password(cfg, ctx),
        ssl: cfg['ssl'] ? {} : undefined,
      });
      return { client: c, type };
    }
  }

  private async _exec(conn: any, sql: string, params: unknown[], cfg: Record<string, unknown>): Promise<unknown> {
    if (conn.type === 'postgresql') {
      const r = await conn.client.query(sql, params);
      return { rows: r.rows, rowCount: r.rowCount };
    } else {
      const [rows] = await conn.client.execute(sql, params);
      return { rows, rowCount: (rows as unknown[]).length };
    }
  }

  private async _end(conn: any, _cfg: Record<string, unknown>): Promise<void> {
    try { await conn.client.end?.() ?? await conn.client.destroy?.(); } catch { /* ignore */ }
  }

  private _buildSelect(opts: ConnectorQueryOptions): string {
    const cols = opts.select?.join(', ') ?? '*';
    let sql = `SELECT ${cols} FROM ${opts.resource}`;
    if (opts.filters?.length) {
      const conditions = opts.filters.map((f, i) => `${f.field} ${this._sqlOp(f.op)} $${i + 1}`);
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    if (opts.orderBy?.length) {
      sql += ` ORDER BY ${opts.orderBy.map((o) => `${o.field} ${o.dir.toUpperCase()}`).join(', ')}`;
    }
    if (opts.limit) sql += ` LIMIT ${opts.limit}`;
    if (opts.offset) sql += ` OFFSET ${opts.offset}`;
    return sql;
  }

  private _sqlOp(op: string): string {
    const m: Record<string, string> = { eq: '=', ne: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=', contains: 'ILIKE', starts_with: 'ILIKE' };
    return m[op] ?? '=';
  }
}
