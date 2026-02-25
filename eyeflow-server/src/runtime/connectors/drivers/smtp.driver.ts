/**
 * SmtpDriver — handles 'smtp' connector type.
 * query → list sent messages (not supported natively; returns empty with explanation)
 * executeAction (smtp_sendEmail) → send email via nodemailer
 */

import { ExecutorContext } from '../../executors/executor.interface';
import { BaseConnectorDriver, ConnectorDriverError } from '../connector-driver.interface';
import { ConnectorPayload, ConnectorQueryOptions, ConnectorActionDescriptor } from '../connector-payload.interface';
import { ConnectorDataNormalizer } from '../connector-data-normalizer';

export class SmtpDriver extends BaseConnectorDriver {
  canHandle(t: string): boolean { return t === 'smtp'; }

  async query(_opts: ConnectorQueryOptions, cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload> {
    // SMTP is write-only; return empty with a note
    return ConnectorDataNormalizer.wrap([], {
      connectorId: this._connectorId(cfg, ctx),
      connectorType: 'smtp',
      operation: 'query',
      extra: { note: 'SMTP is write-only. Use executeAction(smtp_sendEmail) to send emails.' },
    });
  }

  async executeAction(action: ConnectorActionDescriptor, cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload> {
    const nodemailer = this._require('nodemailer', 'npm install nodemailer');
    const p = action.params as Record<string, unknown>;
    const transporter = nodemailer.createTransport({
      host: cfg['host'], port: Number(cfg['port'] ?? 587),
      secure: !!(cfg['secure']),
      auth: {
        user: cfg['username'] ?? cfg['from'],
        pass: this._password(cfg, ctx),
      },
    });
    const info = await transporter.sendMail({
      from: (p['from'] as string) ?? (cfg['from'] as string),
      to: p['to'],
      cc: p['cc'],
      bcc: p['bcc'],
      replyTo: p['replyTo'],
      subject: p['subject'],
      text: p['body'],
      html: p['html'],
      attachments: p['attachments'],
    });
    return ConnectorDataNormalizer.wrap(
      { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected },
      { connectorId: this._connectorId(cfg, ctx), connectorType: 'smtp', operation: action.functionId },
    );
  }
}
