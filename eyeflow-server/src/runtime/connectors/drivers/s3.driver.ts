/**
 * S3Driver — handles 's3' connector type (and S3-compatible stores like MinIO).
 * query      → ListObjectsV2 (prefix filter from options.resource or options.filters)
 * getObject  → GetObject by key
 * putObject  → PutObject
 * deleteObject → DeleteObject
 */

import { ExecutorContext } from '../../executors/executor.interface';
import { BaseConnectorDriver, ConnectorDriverError } from '../connector-driver.interface';
import { ConnectorPayload, ConnectorQueryOptions, ConnectorActionDescriptor } from '../connector-payload.interface';
import { ConnectorDataNormalizer } from '../connector-data-normalizer';

export class S3Driver extends BaseConnectorDriver {
  canHandle(t: string): boolean { return t === 's3'; }

  async query(opts: ConnectorQueryOptions, cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload> {
    const { S3Client, ListObjectsV2Command } = this._require('@aws-sdk/client-s3', 'npm install @aws-sdk/client-s3');
    const s3 = this._client(cfg, ctx, S3Client);
    const bucket = (cfg['bucket'] as string) ?? opts.resource;
    const prefix = opts.filters?.find((f) => f.field === 'prefix')?.value as string | undefined;
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: bucket, Prefix: prefix, MaxKeys: opts.limit ?? 1000,
    }));
    return ConnectorDataNormalizer.wrap({ items: res.Contents ?? [] }, {
      connectorId: this._connectorId(cfg, ctx),
      connectorType: 's3',
      operation: 'listObjects',
      source: `s3://${bucket}/${prefix ?? ''}`,
      extra: { isTruncated: res.IsTruncated, nextToken: res.NextContinuationToken },
    });
  }

  async executeAction(action: ConnectorActionDescriptor, cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload> {
    const sdk = this._require('@aws-sdk/client-s3', 'npm install @aws-sdk/client-s3');
    const s3 = this._client(cfg, ctx, sdk.S3Client);
    const p = action.params as Record<string, unknown>;
    const bucket = (p['bucket'] as string) ?? (cfg['bucket'] as string);
    const key = p['key'] as string;
    let raw: unknown;

    const op = action.functionId.replace(/^s3_/, '');
    switch (op) {
      case 'getObject': {
        const res = await s3.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: key }));
        const body = await (res.Body as any).transformToString();
        raw = { content: body, contentType: res.ContentType };
        break;
      }
      case 'putObject':
        await s3.send(new sdk.PutObjectCommand({
          Bucket: bucket, Key: key,
          Body: p['body'], ContentType: p['contentType'] as string,
          Metadata: p['metadata'] as Record<string, string>,
        }));
        raw = { uploaded: true, key };
        break;
      case 'deleteObject':
        await s3.send(new sdk.DeleteObjectCommand({ Bucket: bucket, Key: key }));
        raw = { deleted: true };
        break;
      default:
        throw new ConnectorDriverError(`S3: unsupported operation '${op}'`, 'UNSUPPORTED_OPERATION', false);
    }
    return ConnectorDataNormalizer.wrap(raw, {
      connectorId: this._connectorId(cfg, ctx),
      connectorType: 's3',
      operation: action.functionId,
      contentType: (raw as any)?.contentType,
    });
  }

  private _client(cfg: Record<string, unknown>, ctx: ExecutorContext, S3Client: any): any {
    return new S3Client({
      region: cfg['region'] ?? 'us-east-1',
      endpoint: cfg['endpoint'] as string | undefined,
      forcePathStyle: !!(cfg['pathStyle']),
      credentials: {
        accessKeyId: (cfg['accessKeyId'] as string) || ctx.secrets?.['AWS_ACCESS_KEY_ID'] || '',
        secretAccessKey: (cfg['secretAccessKey'] as string) || ctx.secrets?.['AWS_SECRET_ACCESS_KEY'] || this._password(cfg, ctx),
      },
    });
  }
}
