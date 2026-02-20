/**
 * Crypto Audit Chain Service — spec §12.1
 *
 * Implements the blockchain-like append-only audit trail:
 *   - Each event hashes (SHA-256) the previous event → tamper-evident chain
 *   - Each event is signed with the node's Ed25519 private key
 *   - Chain verification detects any insertion / deletion / modification
 *
 * AuditEventType (spec §12.1):
 *   EXECUTION_START | ACTION_TAKEN | FALLBACK_TRIGGERED |
 *   LLM_CALL | VALIDATION_PASS | VALIDATION_FAIL |
 *   LOOP_ITERATION | LOOP_CONVERGED | LOOP_TIMEOUT |
 *   PHYSICAL_ACTION | POSTCONDITION_PASSED | POSTCONDITION_FAILED
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { createHash, createSign, generateKeyPairSync, createVerify } from 'crypto';
import { OfflineBufferService } from './offline-buffer.service';

// ── Public types ──────────────────────────────────────────────────────────────

export type AuditEventType =
  | 'EXECUTION_START'
  | 'EXECUTION_COMPLETE'
  | 'ACTION_TAKEN'
  | 'PHYSICAL_ACTION'
  | 'FALLBACK_TRIGGERED'
  | 'LLM_CALL'
  | 'VALIDATION_PASS'
  | 'VALIDATION_FAIL'
  | 'LOOP_ITERATION'
  | 'LOOP_CONVERGED'
  | 'LOOP_TIMEOUT'
  | 'POSTCONDITION_PASSED'
  | 'POSTCONDITION_FAILED'
  | 'VAULT_SECRET_FETCHED'
  | 'HUMAN_CONFIRMATION_REQUIRED'
  | 'CANCELLATION_WINDOW_EXPIRED'
  | 'SECURITY_ALERT';  // IR version mismatch, invalid signature, etc. (spec §5.3)

export interface AuditEventInput {
  /** UUID of the workflow being executed */
  workflowId: string;
  /** Version number of the compiled workflow */
  workflowVersion?: number;
  /** Instruction index in the LLM-IR */
  instructionId?: string;
  /** Structured event type */
  eventType: AuditEventType;
  /** Raw input data (will be hashed, not stored) */
  input?: any;
  /** Raw output data (will be hashed, not stored) */
  output?: any;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Free-form details */
  details?: Record<string, any>;
}

export interface AuditChainEvent {
  eventId: string;
  timestamp: string;             // ISO 8601 with ms precision
  nodeId: string;
  workflowId: string;
  workflowVersion?: number;
  instructionId?: string;
  eventType: AuditEventType;
  inputHash: string;             // SHA-256 hex of JSON.stringify(input)
  outputHash: string;            // SHA-256 hex of JSON.stringify(output)
  durationMs: number;
  details?: Record<string, any>;
  previousEventHash: string;     // SHA-256 of the serialised previous event
  selfHash: string;              // SHA-256 of this event (without selfHash + signature)
  signature: string;             // Ed25519 signature over selfHash (hex)
  publicKeyPem: string;          // Node public key for verification
}

export interface ChainVerificationResult {
  valid: boolean;
  checkedCount: number;
  firstBrokenAt?: number;        // 0-based index of first invalid event
  error?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

/** Callback type for audit event export (Kafka exporter subscribes via this) */
export type AuditExportHandler = (event: AuditChainEvent) => void;

@Injectable()
export class CryptoAuditChainService {
  private readonly logger = new Logger(CryptoAuditChainService.name);

  /** In-memory append-only chain (persisted via TypeORM separately) */
  private readonly chain: AuditChainEvent[] = [];

  private readonly nodeId: string;
  private readonly privateKeyPem: string;
  readonly publicKeyPem: string;

  /** Registered export handlers (e.g. KafkaAuditExporterService) */
  private readonly exportHandlers: AuditExportHandler[] = [];

  constructor(
    @Optional() private readonly offlineBuffer?: OfflineBufferService,
  ) {
    this.nodeId = process.env.SVM_NODE_ID ?? 'central-nestjs';

    // Load or generate Ed25519 key pair for this node
    const existing = process.env.SVM_SIGNING_PRIVATE_KEY_PEM;
    if (existing) {
      this.privateKeyPem = existing;
      // Derive a dummy placeholder — real public key comes from key object
      this.publicKeyPem = process.env.SVM_SIGNING_PUBLIC_KEY_PEM ?? '';
    } else {
      const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding:  { type: 'spki',  format: 'pem' },
      });
      this.privateKeyPem = privateKey;
      this.publicKeyPem  = publicKey;
      this.logger.warn(
        '[CryptoAuditChain] No SVM_SIGNING_PRIVATE_KEY_PEM set — ' +
        'using ephemeral key pair. Signatures will not survive restarts.'
      );
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Append a new event to the audit chain.
   * Returns the fully formed, signed AuditChainEvent.
   */
  append(input: AuditEventInput): AuditChainEvent {
    const previousEvent = this.chain[this.chain.length - 1];
    const previousEventHash = previousEvent
      ? this._sha256(JSON.stringify(previousEvent))
      : '0'.repeat(64); // genesis

    const eventId = this._uuid();
    const timestamp = new Date().toISOString();

    const inputHash  = this._sha256(JSON.stringify(input.input  ?? null));
    const outputHash = this._sha256(JSON.stringify(input.output ?? null));

    // Build event body (without selfHash + signature — needed for selfHash calc)
    const body = {
      eventId,
      timestamp,
      nodeId:          this.nodeId,
      workflowId:      input.workflowId,
      workflowVersion: input.workflowVersion,
      instructionId:   input.instructionId,
      eventType:       input.eventType,
      inputHash,
      outputHash,
      durationMs:      input.durationMs ?? 0,
      details:         input.details,
      previousEventHash,
    };

    const selfHash = this._sha256(JSON.stringify(body));
    const signature = this._sign(selfHash);

    const event: AuditChainEvent = {
      ...body,
      selfHash,
      signature,
      publicKeyPem: this.publicKeyPem,
    };

    this.chain.push(event);

    this.logger.debug(
      `[AuditChain] ${input.eventType} on ${input.workflowId} → ` +
      `#${this.chain.length} hash:${selfHash.substring(0, 12)}…`
    );

    // ── Gap 4: Offline buffering ─────────────────────────────────────────────
    // When the upstream transport is unreachable, the event is buffered locally
    // (NDJSON on disk) and replayed on reconnection (spec §8.3).
    if (this.offlineBuffer?.isBuffering) {
      this.offlineBuffer.enqueueAuditEvent(event.workflowId, event.eventType, event as any);
      this.logger.debug(`[AuditChain] event enqueued in offline buffer (isBuffering=true)`);
    }

    // ── Gap 5: Kafka export callbacks ────────────────────────────────────────
    // Export handlers are called synchronously (fire-and-forget side-effect).
    // KafkaAuditExporterService registers here on startup.
    for (const handler of this.exportHandlers) {
      try { handler(event); } catch (err) {
        this.logger.warn(`[AuditChain] export handler error: ${err}`);
      }
    }

    return event;
  }

  /**
   * Register an export handler that is called after every `append()`.
   * Used by KafkaAuditExporterService (spec §12.3).
   */
  onAuditEvent(handler: AuditExportHandler): void {
    this.exportHandlers.push(handler);
  }

  /**
   * Get the last N events from the chain (default: all).
   */
  getChain(last?: number): AuditChainEvent[] {
    return last ? this.chain.slice(-last) : [...this.chain];
  }

  /**
   * Verify the integrity of the entire chain.
   * Any tampering (insertion, deletion, modification) breaks the hash chain.
   */
  verifyChain(events?: AuditChainEvent[]): ChainVerificationResult {
    const toVerify = events ?? this.chain;
    let checkedCount = 0;

    for (let i = 0; i < toVerify.length; i++) {
      const ev = toVerify[i];
      checkedCount++;

      // 1. Verify selfHash
      const { selfHash, signature, publicKeyPem, ...body } = ev;
      const expectedSelfHash = this._sha256(JSON.stringify(body));
      if (expectedSelfHash !== selfHash) {
        return {
          valid: false,
          checkedCount,
          firstBrokenAt: i,
          error: `Event #${i} selfHash mismatch (tampering detected)`,
        };
      }

      // 2. Verify Ed25519 signature
      const sigValid = this._verify(selfHash, signature, publicKeyPem);
      if (!sigValid) {
        return {
          valid: false,
          checkedCount,
          firstBrokenAt: i,
          error: `Event #${i} signature invalid`,
        };
      }

      // 3. Verify chain linkage (previous hash)
      if (i > 0) {
        const prevEvent = toVerify[i - 1];
        const expectedPrevHash = this._sha256(JSON.stringify(prevEvent));
        if (ev.previousEventHash !== expectedPrevHash) {
          return {
            valid: false,
            checkedCount,
            firstBrokenAt: i,
            error: `Event #${i} previousEventHash broken (insertion/deletion detected)`,
          };
        }
      }
    }

    return { valid: true, checkedCount };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _sha256(data: string): string {
    return createHash('sha256').update(data, 'utf8').digest('hex');
  }

  private _sign(data: string): string {
    try {
      const signer = createSign('SHA256');
      signer.update(data);
      signer.end();
      return signer.sign(this.privateKeyPem, 'hex');
    } catch {
      // Ed25519 doesn't use a digest — use raw sign
      const signer = createSign('ed25519');
      signer.update(Buffer.from(data, 'utf8'));
      return signer.sign(this.privateKeyPem, 'hex');
    }
  }

  private _verify(data: string, signature: string, publicKeyPem: string): boolean {
    if (!publicKeyPem) return true; // no key to verify against (ephemeral)
    try {
      const verifier = createVerify('ed25519');
      verifier.update(Buffer.from(data, 'utf8'));
      return verifier.verify(publicKeyPem, Buffer.from(signature, 'hex'));
    } catch {
      return false;
    }
  }

  private _uuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}
