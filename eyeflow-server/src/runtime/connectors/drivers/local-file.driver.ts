/**
 * LocalFileDriver — handles 'local_file' connector type.
 * query  → read file content
 * action → write / append / delete / list-directory
 */

import * as path from 'path';
import { ExecutorContext } from '../../executors/executor.interface';
import { BaseConnectorDriver, ConnectorDriverError } from '../connector-driver.interface';
import { ConnectorPayload, ConnectorQueryOptions, ConnectorActionDescriptor } from '../connector-payload.interface';
import { ConnectorDataNormalizer } from '../connector-data-normalizer';

export class LocalFileDriver extends BaseConnectorDriver {
  canHandle(t: string): boolean { return t === 'local_file'; }

  async query(opts: ConnectorQueryOptions, cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload> {
    const fs = require('fs') as typeof import('fs');
    const filePath = this._resolvePath(opts.resource, cfg);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      const entries = fs.readdirSync(filePath).map((name) => {
        const full = path.join(filePath, name);
        const s = fs.statSync(full);
        return { name, path: full, isDirectory: s.isDirectory(), size: s.size, mtime: s.mtime };
      });
      return ConnectorDataNormalizer.wrap({ items: entries }, {
        connectorId: this._connectorId(cfg, ctx),
        connectorType: 'local_file',
        operation: 'listDirectory',
        source: filePath,
      });
    }

    const encoding = (opts.extra?.['encoding'] as BufferEncoding) ?? 'utf8';
    const content = fs.readFileSync(filePath, encoding);

    // If content looks like JSON, parse it for richer querying
    let data: unknown = content;
    if (typeof content === 'string') {
      const trimmed = content.trim();
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try { data = JSON.parse(content); } catch { /* keep as string */ }
      }
    }

    return ConnectorDataNormalizer.wrap(data, {
      connectorId: this._connectorId(cfg, ctx),
      connectorType: 'local_file',
      operation: 'read',
      source: filePath,
    });
  }

  async executeAction(action: ConnectorActionDescriptor, cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload> {
    const fs = require('fs') as typeof import('fs');
    const p = action.params as Record<string, unknown>;
    const filePath = this._resolvePath(p['path'] as string, cfg);
    const op = action.functionId.replace(/^(file|filesystem|local_file)_/, '');
    let raw: unknown;

    switch (op) {
      case 'write':
      case 'insert':
        fs.writeFileSync(filePath, p['content'] as string, (p['encoding'] as BufferEncoding) ?? 'utf8');
        raw = { written: true, path: filePath };
        break;
      case 'append':
        fs.appendFileSync(filePath, p['content'] as string, (p['encoding'] as BufferEncoding) ?? 'utf8');
        raw = { appended: true, path: filePath };
        break;
      case 'delete':
        fs.unlinkSync(filePath);
        raw = { deleted: true, path: filePath };
        break;
      case 'mkdir':
        fs.mkdirSync(filePath, { recursive: true });
        raw = { created: true, path: filePath };
        break;
      case 'exists':
        raw = { exists: fs.existsSync(filePath), path: filePath };
        break;
      default:
        throw new ConnectorDriverError(`local_file: unsupported operation '${op}'`, 'UNSUPPORTED_OPERATION', false);
    }
    return ConnectorDataNormalizer.wrap(raw, {
      connectorId: this._connectorId(cfg, ctx),
      connectorType: 'local_file',
      operation: action.functionId,
    });
  }

  private _resolvePath(inputPath: string, cfg: Record<string, unknown>): string {
    const base = (cfg['basePath'] as string) ?? '';
    if (path.isAbsolute(inputPath)) return inputPath;
    return base ? path.join(base, inputPath) : inputPath;
  }
}
