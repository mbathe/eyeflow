/**
 * MongoDriver — handles 'mongodb' connector type.
 *
 * Query API:  options.rawQuery → parsed as JSON filter; otherwise built from options.filters.
 * Action API: functionId suffix determines operation:
 *   _find, _findOne, _insertOne, _updateOne, _updateMany, _deleteOne, _deleteMany, _aggregate
 */

import { ExecutorContext } from '../../executors/executor.interface';
import { BaseConnectorDriver, ConnectorDriverError } from '../connector-driver.interface';
import { ConnectorPayload, ConnectorQueryOptions, ConnectorActionDescriptor } from '../connector-payload.interface';
import { ConnectorDataNormalizer } from '../connector-data-normalizer';

export class MongoDriver extends BaseConnectorDriver {
  canHandle(t: string): boolean { return t === 'mongodb'; }

  async query(opts: ConnectorQueryOptions, cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload> {
    const { client, db } = await this._connect(cfg, ctx);
    try {
      const collection = db.collection(opts.resource);
      const filter = opts.rawQuery ? JSON.parse(opts.rawQuery) : this._buildFilter(opts.filters ?? []);
      const projection = opts.select ? Object.fromEntries(opts.select.map((f) => [f, 1])) : undefined;
      let cursor = collection.find(filter, { projection });
      if (opts.orderBy?.length) {
        const sort = Object.fromEntries(opts.orderBy.map((o) => [o.field, o.dir === 'asc' ? 1 : -1]));
        cursor = cursor.sort(sort);
      }
      if (opts.offset) cursor = cursor.skip(opts.offset);
      if (opts.limit) cursor = cursor.limit(opts.limit);
      const docs = await cursor.toArray();
      return ConnectorDataNormalizer.wrap({ documents: docs }, {
        connectorId: this._connectorId(cfg, ctx),
        connectorType: 'mongodb',
        operation: 'find',
        source: `mongodb:${cfg['database']}/${opts.resource}`,
      });
    } finally {
      await client.close();
    }
  }

  async executeAction(action: ConnectorActionDescriptor, cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload> {
    const { client, db } = await this._connect(cfg, ctx);
    try {
      const p = action.params as Record<string, unknown>;
      const col = db.collection(p['collection'] as string ?? 'default');
      let raw: unknown;

      const op = action.functionId.replace(/^mongo_/, '');
      switch (op) {
        case 'find':
          raw = await col.find(p['filter'] ?? {}).limit((p['limit'] as number) ?? 100).toArray();
          break;
        case 'findOne':
          raw = await col.findOne(p['filter'] ?? {});
          break;
        case 'insertOne':
          raw = await col.insertOne(p['document'] as Record<string, unknown>);
          break;
        case 'updateOne':
          raw = await col.updateOne(p['filter'] as any, p['update'] as any, { upsert: !!(p['upsert']) });
          break;
        case 'updateMany':
          raw = await col.updateMany(p['filter'] as any, p['update'] as any);
          break;
        case 'deleteOne':
          raw = await col.deleteOne(p['filter'] as any);
          break;
        case 'deleteMany':
          raw = await col.deleteMany(p['filter'] as any);
          break;
        case 'aggregate':
          raw = await col.aggregate(p['pipeline'] as any[]).toArray();
          break;
        default:
          throw new ConnectorDriverError(`MongoDB: unsupported operation '${op}'`, 'UNSUPPORTED_OPERATION', false);
      }
      return ConnectorDataNormalizer.wrap(raw, {
        connectorId: this._connectorId(cfg, ctx),
        connectorType: 'mongodb',
        operation: action.functionId,
      });
    } finally {
      await client.close();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  private async _connect(cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<any> {
    const { MongoClient } = this._require('mongodb', 'npm install mongodb');
    const uri = (cfg['uri'] as string) ||
      `mongodb://${cfg['host'] ?? 'localhost'}:${cfg['port'] ?? 27017}/${cfg['database'] ?? ''}`;
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(cfg['database'] as string);
    return { client, db };
  }

  private _buildFilter(filters: Array<{ field: string; op: string; value: unknown }>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const f of filters) {
      const opMap: Record<string, string> = {
        eq: '$eq', ne: '$ne', gt: '$gt', gte: '$gte', lt: '$lt', lte: '$lte',
        in: '$in', not_in: '$nin', regex: '$regex', exists: '$exists',
      };
      const mongoOp = opMap[f.op];
      result[f.field] = mongoOp ? { [mongoOp]: f.value } : f.value;
    }
    return result;
  }
}
