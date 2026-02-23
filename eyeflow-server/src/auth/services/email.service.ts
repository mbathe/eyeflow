import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

/**
 * Thin wrapper around nodemailer.
 * Configure via environment:
 *   MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, MAIL_FROM
 *
 * In test mode (MAIL_ENABLED=false or NODE_ENV=test),
 * emails are logged but not sent.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private readonly from: string;
  private readonly appUrl: string;
  private readonly enabled: boolean;

  constructor(private config: ConfigService) {
    this.from = config.get<string>('MAIL_FROM', 'noreply@eyeflow.io');
    this.appUrl = config.get<string>('APP_URL', 'http://localhost:3000');
    this.enabled =
      config.get<string>('NODE_ENV') !== 'test' &&
      config.get<string>('MAIL_ENABLED', 'false') === 'true';

    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        host: config.get<string>('MAIL_HOST', 'smtp.mailtrap.io'),
        port: config.get<number>('MAIL_PORT', 587),
        auth: {
          user: config.get<string>('MAIL_USER', ''),
          pass: config.get<string>('MAIL_PASS', ''),
        },
      });
    }
  }

  private async _send(to: string, subject: string, html: string): Promise<void> {
    if (!this.enabled || !this.transporter) {
      this.logger.debug(`[EMAIL SUPPRESSED] To: ${to} | Subject: ${subject}`);
      return;
    }
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}`, err);
      // Don't throw — email failure should not crash the auth flow
    }
  }

  async sendEmailVerification(to: string, firstName: string, token: string): Promise<void> {
    const url = `${this.appUrl}/auth/verify-email?token=${token}`;
    await this._send(
      to,
      'Verify your EyeFlow account',
      `<p>Hi ${firstName},</p>
       <p>Please verify your email address by clicking the link below:</p>
       <p><a href="${url}">${url}</a></p>
       <p>This link expires in 24 hours.</p>`,
    );
  }

  async sendPasswordReset(to: string, firstName: string, token: string): Promise<void> {
    const url = `${this.appUrl}/auth/reset-password?token=${token}`;
    await this._send(
      to,
      'Reset your EyeFlow password',
      `<p>Hi ${firstName},</p>
       <p>You requested a password reset. Click the link below:</p>
       <p><a href="${url}">${url}</a></p>
       <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>`,
    );
  }

  async sendWelcomeEmail(to: string, firstName: string): Promise<void> {
    await this._send(
      to,
      'Welcome to EyeFlow!',
      `<p>Hi ${firstName},</p>
       <p>Your account has been created successfully. Welcome aboard!</p>
       <p>You can now log in at <a href="${this.appUrl}">${this.appUrl}</a>.</p>`,
    );
  }
}
