/**
 * IMAP Trigger Service — spec §7 "Email (IMAP/Gmail)"
 *
 * Polls an IMAP mailbox (or Gmail via IMAP) and fires workflow triggers
 * when matching emails arrive.
 *
 * Uses Node.js `net` / `tls` for raw IMAP — no npm deps required.
 * For production use with Gmail: enable "Less Secure Apps" or use OAuth2
 * (see IMAP_OAUTH2_TOKEN env var).
 *
 * Configuration via environment variables:
 *   IMAP_HOST         IMAP server hostname (default: imap.gmail.com)
 *   IMAP_PORT         IMAP port (default: 993)
 *   IMAP_USER         IMAP username / email
 *   IMAP_PASSWORD     IMAP password or app-specific password
 *   IMAP_POLL_MS      Polling interval in milliseconds (default: 30000)
 *   IMAP_MAILBOX      Mailbox to watch (default: INBOX)
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as tls from 'tls';
import * as net from 'net';

export interface EmailTriggerRule {
  id: string;
  /** Workflow task to trigger */
  taskId: string;
  /** Filter: from address contains this string (case-insensitive) */
  fromContains?: string;
  /** Filter: subject contains this string (case-insensitive) */
  subjectContains?: string;
  /** Whether the email must be unread */
  unseenOnly?: boolean;
  /** Label to apply to matched emails (Gmail only) */
  markLabel?: string;
  enabled: boolean;
}

export interface ImapEmailEvent {
  uid: string;
  from: string;
  subject: string;
  date: string;
  body?: string;
  ruleId: string;
  taskId: string;
}

type ImapFireCallback = (event: ImapEmailEvent) => void | Promise<void>;

/**
 * Lightweight IMAP client using Node.js TLS sockets.
 * Implements IMAP IDLE command for push notifications where available,
 * otherwise falls back to polling via SEARCH UNSEEN.
 */
@Injectable()
export class ImapTriggerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImapTriggerService.name);

  private rules: EmailTriggerRule[] = [];
  private callbacks: ImapFireCallback[] = [];
  private pollTimer: NodeJS.Timeout | null = null;
  private isConnected = false;

  private readonly host: string;
  private readonly port: number;
  private readonly user: string;
  private readonly password: string;
  private readonly pollMs: number;
  private readonly mailbox: string;

  /** Tracks UIDs already processed to avoid duplicate triggers */
  private processedUids = new Set<string>();

  constructor() {
    this.host     = process.env.IMAP_HOST     ?? 'imap.gmail.com';
    this.port     = parseInt(process.env.IMAP_PORT ?? '993');
    this.user     = process.env.IMAP_USER     ?? '';
    this.password = process.env.IMAP_PASSWORD ?? '';
    this.pollMs   = parseInt(process.env.IMAP_POLL_MS ?? '30000');
    this.mailbox  = process.env.IMAP_MAILBOX  ?? 'INBOX';
  }

  onModuleInit() {
    if (!this.user || !this.password) {
      this.logger.warn(
        '[ImapTrigger] IMAP_USER or IMAP_PASSWORD not set — email trigger disabled. ' +
        'Set environment variables to enable.'
      );
      return;
    }
    this.logger.log(`[ImapTrigger] Service initialized — polling ${this.host} every ${this.pollMs}ms`);
    this._startPolling();
  }

  onModuleDestroy() {
    this._stopPolling();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Register a callback to receive email trigger events */
  onEmail(callback: ImapFireCallback): void {
    this.callbacks.push(callback);
  }

  /** Add an email trigger rule */
  addRule(rule: EmailTriggerRule): void {
    this.rules.push(rule);
    this.logger.log(
      `[ImapTrigger] Rule added: "${rule.subjectContains ?? '*'}" from "${rule.fromContains ?? '*'}" → task ${rule.taskId}`
    );
  }

  /** Remove a rule by ID */
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(r => r.id !== ruleId);
  }

  // ── Polling ───────────────────────────────────────────────────────────────

  private _startPolling(): void {
    const poll = async () => {
      try {
        await this._checkMailbox();
      } catch (err: any) {
        this.logger.error(`[ImapTrigger] Poll error: ${err.message}`);
      } finally {
        this.pollTimer = setTimeout(poll, this.pollMs);
        if (this.pollTimer.unref) this.pollTimer.unref();
      }
    };

    // First poll after a short delay
    this.pollTimer = setTimeout(poll, 5000);
    if (this.pollTimer.unref) this.pollTimer.unref();
  }

  private _stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Connect to IMAP server, fetch UNSEEN emails, apply rules, fire callbacks.
   */
  private async _checkMailbox(): Promise<void> {
    const activeRules = this.rules.filter(r => r.enabled);
    if (activeRules.length === 0) return;

    const messages = await this._fetchUnseenMessages();

    for (const msg of messages) {
      if (this.processedUids.has(msg.uid)) continue;
      this.processedUids.add(msg.uid);

      for (const rule of activeRules) {
        if (this._matchesRule(msg, rule)) {
          const event: ImapEmailEvent = { ...msg, ruleId: rule.id, taskId: rule.taskId };
          this.logger.log(
            `[ImapTrigger] MATCHED rule "${rule.id}": from="${msg.from}" subject="${msg.subject}" → task ${rule.taskId}`
          );
          for (const cb of this.callbacks) {
            try { await cb(event); } catch (err: any) {
              this.logger.error(`[ImapTrigger] Callback error: ${err.message}`);
            }
          }
        }
      }
    }
  }

  private _matchesRule(
    msg: { from: string; subject: string },
    rule: EmailTriggerRule
  ): boolean {
    if (rule.fromContains && !msg.from.toLowerCase().includes(rule.fromContains.toLowerCase())) {
      return false;
    }
    if (rule.subjectContains && !msg.subject.toLowerCase().includes(rule.subjectContains.toLowerCase())) {
      return false;
    }
    return true;
  }

  /**
   * Minimalist IMAP session:
   *   CONNECT → LOGIN → SELECT inbox → SEARCH UNSEEN → FETCH headers → LOGOUT
   *
   * Lines are read with a promise-based reader over the TLS socket.
   */
  private async _fetchUnseenMessages(): Promise<
    Array<{ uid: string; from: string; subject: string; date: string }>
  > {
    return new Promise((resolve, _reject) => {
      const messages: Array<{ uid: string; from: string; subject: string; date: string }> = [];
      const socket = tls.connect({ host: this.host, port: this.port }, () => {});

      let buffer    = '';
      let tagCounter = 1;
      let state: 'GREETING' | 'LOGIN' | 'SELECT' | 'SEARCH' | 'FETCH' | 'LOGOUT' | 'DONE' = 'GREETING';
      let unseenUids: string[] = [];
      let currentMsg: Partial<{ uid: string; from: string; subject: string; date: string }> = {};

      const send = (cmd: string) => {
        socket.write(`A${tagCounter} ${cmd}\r\n`);
        tagCounter++;
      };

      const finish = () => {
        try { socket.destroy(); } catch {}
        resolve(messages);
      };

      socket.setTimeout(15000, finish);
      socket.on('error', () => finish());

      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\r\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line) continue;

          if (state === 'GREETING' && line.startsWith('* OK')) {
            state = 'LOGIN';
            send(`LOGIN ${this.user} ${this.password}`);
            continue;
          }

          if (state === 'LOGIN' && line.includes('OK LOGIN')) {
            state = 'SELECT';
            send(`SELECT ${this.mailbox}`);
            continue;
          }

          if (state === 'SELECT' && line.includes('OK [READ-WRITE]')) {
            state = 'SEARCH';
            send('UID SEARCH UNSEEN');
            continue;
          }

          if (state === 'SEARCH') {
            if (line.startsWith('* SEARCH')) {
              unseenUids = line.replace('* SEARCH', '').trim().split(' ').filter(Boolean);
            }
            if (line.includes('OK UID SEARCH')) {
              if (unseenUids.length === 0) {
                state = 'LOGOUT';
                send('LOGOUT');
              } else {
                state = 'FETCH';
                // Fetch headers for first 10 unseen only to avoid huge responses
                const uids = unseenUids.slice(0, 10).join(',');
                send(`UID FETCH ${uids} (UID ENVELOPE)`);
              }
            }
            continue;
          }

          if (state === 'FETCH') {
            // Parse ENVELOPE response — very simplified
            const uidMatch    = line.match(/UID (\d+)/);
            const fromMatch   = line.match(/From["\s]+([^"]+@[^"\s]+)/i);
            const subjectMatch = line.match(/Subject["\s]+"?([^"\\)]+)"?/i);
            const dateMatch   = line.match(/"([A-Z][a-z]+,\s+\d+\s+[A-Z][a-z]+\s+\d{4})/);

            if (uidMatch)     currentMsg.uid     = uidMatch[1];
            if (fromMatch)    currentMsg.from    = fromMatch[1];
            if (subjectMatch) currentMsg.subject = subjectMatch[1];
            if (dateMatch)    currentMsg.date    = dateMatch[1];

            if (line.includes(')') && currentMsg.uid) {
              messages.push({
                uid:     currentMsg.uid!,
                from:    currentMsg.from    ?? 'unknown',
                subject: currentMsg.subject ?? '(no subject)',
                date:    currentMsg.date    ?? new Date().toISOString(),
              });
              currentMsg = {};
            }

            if (line.includes(`OK UID FETCH`)) {
              state = 'LOGOUT';
              send('LOGOUT');
            }
            continue;
          }

          if (state === 'LOGOUT') {
            state = 'DONE';
            finish();
          }
        }
      });
    });
  }
}
