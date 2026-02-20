/**
 * IMAP Trigger Driver  — example driver (spec §7 + existing ImapTriggerService)
 *
 * Polls an IMAP mailbox for new messages matching filter criteria and emits
 * a TriggerEvent for each matching email.  Wraps the existing IMAP logic
 * (ImapTriggerService / imapflow) into the ITriggerDriver interface.
 *
 * Supported tiers : CENTRAL
 * Required protocol: IMAP
 *
 * Config shape:
 * {
 *   host           : string    — e.g. "imap.example.com"
 *   port?          : number    — default 993
 *   secure?        : boolean   — default true
 *   username       : string
 *   password       : string    — injected from vault at activation time
 *   mailbox?       : string    — default "INBOX"
 *   pollingInterval?: number   — seconds between polls, default 60
 *   fromContains?  : string    — filter: sender must contain this string
 *   subjectContains?: string   — filter: subject must contain this string
 *   unseenOnly?    : boolean   — default true
 * }
 */

import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject, interval } from 'rxjs';
import { takeUntil, switchMap, filter } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import {
  ITriggerDriver,
  TriggerEvent,
} from '../interfaces/trigger-driver.interface';
import { NodeTier } from '../../nodes/interfaces/node-capability.interface';

// ── Config ────────────────────────────────────────────────────────────────

interface ImapDriverConfig {
  host:              string;
  port?:             number;
  secure?:           boolean;
  username:          string;
  password:          string;
  mailbox?:          string;
  pollingInterval?:  number;  // seconds
  fromContains?:     string;
  subjectContains?:  string;
  unseenOnly?:       boolean;
}

// ── Driver ────────────────────────────────────────────────────────────────

@Injectable()
export class ImapTriggerDriver implements ITriggerDriver {
  readonly driverId    = 'imap';
  readonly displayName = 'IMAP Email Trigger';
  readonly supportedTiers: NodeTier[] = [NodeTier.CENTRAL];
  readonly configSchema = {
    host:             { type: 'string',  required: true,  example: 'imap.example.com' },
    port:             { type: 'number',  required: false, default: 993 },
    secure:           { type: 'boolean', required: false, default: true },
    username:         { type: 'string',  required: true },
    password:         { type: 'string',  required: true,  secret: true },
    mailbox:          { type: 'string',  required: false, default: 'INBOX' },
    pollingInterval:  { type: 'number',  required: false, default: 60 },
    fromContains:     { type: 'string',  required: false },
    subjectContains:  { type: 'string',  required: false },
    unseenOnly:       { type: 'boolean', required: false, default: true },
  };
  readonly requiredProtocols = ['IMAP'];

  private readonly logger = new Logger(ImapTriggerDriver.name);
  private readonly activations = new Map<string, { stop$: Subject<void> }>();

  activate(
    activationId: string,
    config: Record<string, any>,
    workflowId: string,
    version: number,
  ): Observable<TriggerEvent> {
    const cfg     = config as ImapDriverConfig;
    const stop$   = new Subject<void>();
    const pollMs  = (cfg.pollingInterval ?? 60) * 1_000;

    this.activations.set(activationId, { stop$ });

    this.logger.log(
      `[IMAP:${activationId.slice(0, 8)}] Polling ${cfg.host} every ${cfg.pollingInterval ?? 60}s`,
    );

    const stream$ = new Observable<TriggerEvent>(observer => {
      const poll$ = interval(pollMs);

      const sub = poll$.pipe(
        takeUntil(stop$),
        switchMap(() => this._fetchMatchingMails(cfg, workflowId, version)),
        filter((e): e is TriggerEvent => e !== null),
      ).subscribe({
        next:  event  => observer.next(event),
        error: err    => observer.error(err),
      });

      return () => sub.unsubscribe();
    });

    return stream$;
  }

  deactivate(activationId: string): void {
    const entry = this.activations.get(activationId);
    if (!entry) return;
    entry.stop$.next();
    entry.stop$.complete();
    this.activations.delete(activationId);
    this.logger.log(`[IMAP] Deactivated: ${activationId}`);
  }

  deactivateAll(): void {
    for (const id of this.activations.keys()) this.deactivate(id);
  }

  isHealthy(): boolean {
    return true;
  }

  // ── Private: poll IMAP ────────────────────────────────────────────────

  private async _fetchMatchingMails(
    cfg:        ImapDriverConfig,
    workflowId: string,
    version:    number,
  ): Promise<TriggerEvent | null> {
    // Dynamically import imapflow to keep it optional at startup
    let ImapFlow: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('imapflow') as { ImapFlow: any };
      ImapFlow = mod.ImapFlow;
    } catch {
      this.logger.warn('[IMAP] imapflow not installed — skipping poll');
      return null;
    }

    const client = new ImapFlow({
      host:     cfg.host,
      port:     cfg.port ?? 993,
      secure:   cfg.secure ?? true,
      auth:     { user: cfg.username, pass: cfg.password },
      logger:   false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock(cfg.mailbox ?? 'INBOX');

      const searchCriteria: any = {};
      if (cfg.unseenOnly !== false) searchCriteria.unseen = true;
      if (cfg.fromContains)         searchCriteria.from   = cfg.fromContains;
      if (cfg.subjectContains)      searchCriteria.subject = cfg.subjectContains;

      const uids: number[] = await client.search(searchCriteria);

      if (!uids.length) {
        lock.release();
        await client.logout();
        return null;
      }

      // Fetch only the first matching message (one event per poll cycle)
      const uid = uids[0];
      const msg = await client.fetchOne(String(uid), { envelope: true, bodyStructure: true });
      lock.release();
      await client.logout();

      if (!msg) return null;

      return {
        eventId:         uuidv4(),
        occurredAt:      new Date().toISOString(),
        driverId:        this.driverId,
        workflowId,
        workflowVersion: version,
        payload: {
          uid,
          subject:  msg.envelope?.subject,
          from:     msg.envelope?.from?.[0]?.address,
          date:     msg.envelope?.date,
          messageId: msg.envelope?.messageId,
        },
        source: { host: cfg.host, mailbox: cfg.mailbox ?? 'INBOX' },
      };
    } catch (err: any) {
      this.logger.error(`[IMAP] Fetch error: ${err?.message}`);
      try { await client.logout(); } catch {}
      return null;
    }
  }
}
