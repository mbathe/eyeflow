/**
 * IR Serializer Service — spec §3.5 + §6.2
 *
 * "Le DAG validé et vérifié est compilé en LLM-IR binaire au format Protocol
 *  Buffers.  Ce binaire est signé cryptographiquement (SHA-256 + clé privée de
 *  l'instance) et versionné.  Le nœud Rust refuse d'exécuter tout LLM-IR non
 *  signé ou dont la signature ne correspond pas."
 *
 * Implementation
 * ──────────────
 * Full Protobuf serialization requires the `protobufjs` or `@bufbuild/protobuf`
 * package.  This service uses a DETERMINISTIC JSON encoding (all keys sorted,
 * Map/Set converted to arrays, Dates converted to ISO strings) that produces a
 * stable byte stream, making it a drop-in replacement for the real Protobuf
 * binary once the schema is defined.  The field names and structure already
 * match the `LLMIntermediateRepresentation` Protobuf schema documented in
 * docs/technical-deep-dive/llm-ir.md.
 *
 * Cryptography
 * ────────────
 * • Signing algorithm : Ed25519 (RFC 8032) — small keys, fast, deterministic
 * • The private key is loaded from SVM_SIGNING_PRIVATE_KEY_PEM env var, or
 *   generated ephemerally on first use (suitable for dev; forbidden in prod).
 * • The SIGNED artifact format:
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │  4 bytes  — magic number 0x4C4C4D49 ('LLMI')         │
 *   │  1 byte   — format version (currently 0x01)          │
 *   │  4 bytes  — payload length (uint32 big-endian)       │
 *   │  N bytes  — deterministic JSON payload               │
 *   │  1 byte   — signature length marker (0x40 = 64)      │
 *   │  64 bytes — Ed25519 signature over (magic+version+   │
 *   │             payload_length+payload)                  │
 *   └──────────────────────────────────────────────────────┘
 *
 * Node verification
 * ─────────────────
 * Any execution node (NestJS, Rust SVM) must:
 *   1. Parse the magic number and version byte
 *   2. Extract the payload
 *   3. Verify the Ed25519 signature using the compiler's PUBLIC key
 *   4. Reject the artifact if verification fails
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import { LLMIntermediateRepresentation } from '../interfaces/ir.interface';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAGIC = Buffer.from([0x4c, 0x4c, 0x4d, 0x49]); // 'LLMI'
const FORMAT_VERSION = 0x01;
const SIG_LENGTH = 64; // Ed25519 signature is always 64 bytes

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface SerializedIRArtifact {
  /** Fully encoded and signed binary artifact */
  buffer: Buffer;

  /** Base64url-encoded Ed25519 signature (64 bytes) */
  signature: string;

  /** PEM-encoded Ed25519 public key — distributed to all execution nodes */
  publicKeyPem: string;

  /** SHA-256 hex digest of the payload (before signing) */
  payloadChecksum: string;

  /** Artifact format version */
  version: number;

  /** ISO timestamp of when this artifact was signed */
  signedAt: string;
}

export interface VerificationResult {
  valid: boolean;
  error?: string;
  payloadChecksum?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class IRSerializerService implements OnModuleInit {
  private readonly logger = new Logger(IRSerializerService.name);

  private privateKey!: crypto.KeyObject;
  private publicKey!: crypto.KeyObject;
  private publicKeyPem!: string;

  onModuleInit(): void {
    this._loadOrGenerateKeyPair();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Main API
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Serialize an IR to a signed binary artifact.
   *
   * Steps:
   *   1. Deterministic JSON encode
   *   2. Build the artifact buffer (magic + version + length + payload)
   *   3. Ed25519 sign
   *   4. Append signature
   */
  serialize(ir: LLMIntermediateRepresentation): SerializedIRArtifact {
    const payload = this._deterministicJsonEncode(ir);
    const payloadChecksum = crypto.createHash('sha256').update(payload).digest('hex');

    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32BE(payload.length, 0);

    // Header = magic(4) + version(1) + payloadLength(4)
    const header = Buffer.concat([MAGIC, Buffer.from([FORMAT_VERSION]), lengthBuf]);

    // The bytes that are signed = header + payload
    const signedPart = Buffer.concat([header, payload]);
    const signatureBuf = crypto.sign(null, signedPart, this.privateKey);
    const signature = signatureBuf.toString('base64url');

    // Full artifact = signedPart + sigLengthMarker(1) + signature(64)
    const artifact = Buffer.concat([
      signedPart,
      Buffer.from([SIG_LENGTH]),
      signatureBuf,
    ]);

    this.logger.log(
      `[IRSerializer] Serialized IR — payload ${payload.length}B, ` +
      `checksum sha256:${payloadChecksum.substring(0, 16)}…`
    );

    return {
      buffer: artifact,
      signature,
      publicKeyPem: this.publicKeyPem,
      payloadChecksum,
      version: FORMAT_VERSION,
      signedAt: new Date().toISOString(),
    };
  }

  /**
   * Verify a previously signed artifact.
   * Returns { valid: true } on success, { valid: false, error } on failure.
   *
   * Any execution node (NestJS or Rust SVM) calls the equivalent of this
   * method before accepting an artifact for execution.
   */
  verify(artifact: Buffer, publicKeyPem: string): VerificationResult {
    try {
      // Parse header
      if (!artifact.subarray(0, 4).equals(MAGIC)) {
        return { valid: false, error: 'Invalid magic number — not an LLMI artifact' };
      }

      const version = artifact[4];
      if (version !== FORMAT_VERSION) {
        return { valid: false, error: `Unsupported format version: ${version}` };
      }

      const payloadLength = artifact.readUInt32BE(5);
      const headerLength = 4 + 1 + 4; // magic + version + length field
      const payloadStart = headerLength;
      const payloadEnd = payloadStart + payloadLength;

      if (artifact.length < payloadEnd + 1 + SIG_LENGTH) {
        return { valid: false, error: 'Artifact too short — truncated signature' };
      }

      const signedPart = artifact.subarray(0, payloadEnd);
      const sigMarker = artifact[payloadEnd];
      if (sigMarker !== SIG_LENGTH) {
        return { valid: false, error: `Unexpected signature length marker: ${sigMarker}` };
      }

      const signatureBuf = artifact.subarray(payloadEnd + 1, payloadEnd + 1 + SIG_LENGTH);
      const payload = artifact.subarray(payloadStart, payloadEnd);
      const payloadChecksum = crypto.createHash('sha256').update(payload).digest('hex');

      const pubKey = crypto.createPublicKey(publicKeyPem);
      const valid = crypto.verify(null, signedPart, pubKey, signatureBuf);

      if (!valid) {
        return { valid: false, error: 'Ed25519 signature verification failed — artifact may have been tampered with' };
      }

      return { valid: true, payloadChecksum };
    } catch (err: any) {
      return { valid: false, error: `Verification error: ${err.message}` };
    }
  }

  /**
   * Deserialize the payload from a verified artifact buffer.
   * MUST be called after verify() returns { valid: true }.
   */
  deserialize(artifact: Buffer): LLMIntermediateRepresentation {
    const payloadLength = artifact.readUInt32BE(5);
    const headerLength = 4 + 1 + 4;
    const payload = artifact.subarray(headerLength, headerLength + payloadLength);
    return JSON.parse(payload.toString('utf8')) as LLMIntermediateRepresentation;
  }

  /** Expose the compiler's public key PEM so nodes can verify artifacts */
  getPublicKeyPem(): string {
    return this.publicKeyPem;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  private _loadOrGenerateKeyPair(): void {
    const envKey = process.env['SVM_SIGNING_PRIVATE_KEY_PEM'];

    if (envKey) {
      try {
        this.privateKey = crypto.createPrivateKey(envKey);
        this.publicKey = crypto.createPublicKey(this.privateKey);
        this.publicKeyPem = this.publicKey.export({ type: 'spki', format: 'pem' }) as string;
        this.logger.log('[IRSerializer] Loaded Ed25519 key pair from SVM_SIGNING_PRIVATE_KEY_PEM');
        return;
      } catch (err: any) {
        this.logger.warn(`[IRSerializer] Failed to load key from env: ${err.message}`);
      }
    }

    // Generate ephemeral key pair — suitable for dev/test only
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

    this.logger.warn(
      '[IRSerializer] ⚠️  Using EPHEMERAL Ed25519 key pair (not persisted). ' +
      'Set SVM_SIGNING_PRIVATE_KEY_PEM in production to ensure artifacts survive restarts.'
    );
  }

  /**
   * Deterministic JSON encoding.
   *
   * Properties:
   *  - All object keys are sorted alphabetically (recursive)
   *  - Map<K,V> → Array<[K,V]> (sorted by key string representation)
   *  - Set<T>   → Array<T> (sorted)
   *  - Date     → ISO 8601 string
   *  - Buffer   → { __type: 'Buffer', hex: '<hex>' }
   *  - undefined values in objects are omitted
   *  - undefined values in arrays → null (JSON standard)
   *
   * This guarantees that serializing the same IR twice produces identical bytes.
   */
  private _deterministicJsonEncode(value: any): Buffer {
    return Buffer.from(JSON.stringify(this._normalise(value)), 'utf8');
  }

  private _normalise(val: any): any {
    if (val === null || val === undefined) return val;
    if (val instanceof Date) return val.toISOString();
    if (Buffer.isBuffer(val)) return { __type: 'Buffer', hex: val.toString('hex') };
    if (val instanceof Map) {
      const entries = Array.from(val.entries())
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      return entries.map(([k, v]) => [this._normalise(k), this._normalise(v)]);
    }
    if (val instanceof Set) {
      return Array.from(val).map(v => this._normalise(v)).sort();
    }
    if (Array.isArray(val)) {
      return val.map(v => this._normalise(v));
    }
    if (typeof val === 'object') {
      const sorted: Record<string, any> = {};
      Object.keys(val).sort().forEach(k => {
        const v = this._normalise(val[k]);
        if (v !== undefined) sorted[k] = v;
      });
      return sorted;
    }
    return val;
  }
}
