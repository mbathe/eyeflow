/**
 * Protobuf IR Serializer — spec §3 + §16.3
 *
 * Replaces the ad-hoc binary envelope in ir-serializer.service.ts with a
 * true Protocol Buffers serialization using protobufjs (NestJS side) —
 * matching the `prost` crate format used by Rust SVM nodes.
 *
 * Wire format: SignedIRArtifact protobuf message (see proto/llm_ir.proto)
 *   magic(4) | payload(N) | ed25519_signature(64)
 *
 * Compatibility notes:
 *   - Protobuf binary format is byte-for-byte compatible with the Rust prost crate
 *   - Field numbers must NOT change after deployment (breaking change)
 *   - Add new fields with new numbers, never reuse old ones
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash, createSign, createVerify, generateKeyPairSync } from 'crypto';
import * as path from 'path';
import * as protobuf from 'protobufjs';
import { LLMIntermediateRepresentation } from '../interfaces/ir.interface';

export interface ProtobufArtifact {
  /** Raw protobuf-encoded SignedIRArtifact bytes */
  buffer: Buffer;
  /** Ed25519 hex signature over the payload bytes */
  signature: string;
  /** Signer's public key PEM */
  publicKeyPem: string;
  /** SHA-256 hex of the protobuf payload */
  payloadChecksum: string;
  /** Serialization format version */
  version: number;
  /** ISO 8601 timestamp */
  signedAt: string;
}

export interface ProtobufVerifyResult {
  valid: boolean;
  error?: string;
  ir?: LLMIntermediateRepresentation;
}

const MAGIC = 0x4c4c4d49; // "LLMI"
const FORMAT_VERSION = 1;
const PROTO_FILE = path.join(__dirname, '..', '..', '..', 'proto', 'llm_ir.proto');

@Injectable()
export class ProtobufIRSerializerService implements OnModuleInit {
  private readonly logger = new Logger(ProtobufIRSerializerService.name);

  private privateKeyPem: string;
  readonly publicKeyPem: string;

  private protoRoot!: protobuf.Root;
  private SignedIRArtifact!: protobuf.Type;
  private LLMIntermediateRepresentation!: protobuf.Type;

  constructor() {
    const existing = process.env.SVM_SIGNING_PRIVATE_KEY_PEM;
    if (existing) {
      this.privateKeyPem = existing;
      this.publicKeyPem  = process.env.SVM_SIGNING_PUBLIC_KEY_PEM ?? '';
    } else {
      const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding:  { type: 'spki',  format: 'pem' },
      });
      this.privateKeyPem = privateKey;
      this.publicKeyPem  = publicKey;
      this.logger.warn(
        '[ProtobufSerializer] Using ephemeral Ed25519 key pair — set SVM_SIGNING_PRIVATE_KEY_PEM to persist'
      );
    }
  }

  async onModuleInit(): Promise<void> {
    try {
      this.protoRoot = await protobuf.load(PROTO_FILE);
      this.SignedIRArtifact           = this.protoRoot.lookupType('llmir.SignedIRArtifact');
      this.LLMIntermediateRepresentation = this.protoRoot.lookupType('llmir.LLMIntermediateRepresentation');
      this.logger.log('[ProtobufSerializer] Proto schema loaded from llm_ir.proto');
    } catch (err: any) {
      this.logger.error(`[ProtobufSerializer] Failed to load proto: ${err.message}`);
      throw err;
    }
  }

  /**
   * Serialize + sign an LLM-IR into a SignedIRArtifact protobuf buffer.
   * This is the format distributed to Rust SVM nodes via WebSocket TLS.
   */
  serialize(ir: LLMIntermediateRepresentation): ProtobufArtifact {
    const signedAt = new Date().toISOString();

    // 1. Convert IR to protobuf-friendly plain object
    const irPlain = this._irToProtoObject(ir);

    // 2. Encode IR as protobuf bytes (payload)
    const irMessage = this.LLMIntermediateRepresentation.create(irPlain);
    const payload   = Buffer.from(this.LLMIntermediateRepresentation.encode(irMessage).finish());

    // 3. SHA-256 checksum of payload
    const payloadChecksum = createHash('sha256').update(payload).digest('hex');

    // 4. Ed25519 sign the payload
    const signature = this._sign(payload);

    // 5. Build SignedIRArtifact protobuf message
    const artifact = this.SignedIRArtifact.create({
      magic:           MAGIC,
      version:         FORMAT_VERSION,
      payload,
      signature:       Buffer.from(signature, 'hex'),
      publicKeyPem:    this.publicKeyPem,
      payloadChecksum,
      signedAt,
    });

    const buffer = Buffer.from(this.SignedIRArtifact.encode(artifact).finish());

    this.logger.debug(
      `[ProtobufSerializer] Serialized ${payload.length}B payload + ${buffer.length}B artifact ` +
      `| sha256:${payloadChecksum.substring(0, 16)}…`
    );

    return { buffer, signature, publicKeyPem: this.publicKeyPem, payloadChecksum, version: FORMAT_VERSION, signedAt };
  }

  /**
   * Verify a received SignedIRArtifact buffer (from a Rust node or remote source).
   */
  verify(buffer: Buffer, expectedPublicKeyPem?: string): ProtobufVerifyResult {
    try {
      const artifact = this.SignedIRArtifact.decode(buffer) as any;

      if (artifact.magic !== MAGIC) {
        return { valid: false, error: `Invalid magic: expected 0x${MAGIC.toString(16)}, got 0x${artifact.magic?.toString(16)}` };
      }

      const payload      = Buffer.from(artifact.payload);
      const signature    = Buffer.from(artifact.signature).toString('hex');
      const publicKeyPem = expectedPublicKeyPem ?? artifact.publicKeyPem;

      // Verify Ed25519 signature
      if (publicKeyPem) {
        const valid = this._verify(payload, signature, publicKeyPem);
        if (!valid) {
          return { valid: false, error: 'Ed25519 signature verification failed' };
        }
      }

      // Verify checksum
      const actualChecksum = createHash('sha256').update(payload).digest('hex');
      if (artifact.payloadChecksum && actualChecksum !== artifact.payloadChecksum) {
        return { valid: false, error: `Checksum mismatch: ${actualChecksum} ≠ ${artifact.payloadChecksum}` };
      }

      return { valid: true };
    } catch (err: any) {
      return { valid: false, error: err.message };
    }
  }

  /**
   * Deserialize a SignedIRArtifact back to a plain IR object.
   */
  deserialize(buffer: Buffer): LLMIntermediateRepresentation {
    const artifact = this.SignedIRArtifact.decode(buffer) as any;
    const payload  = Buffer.from(artifact.payload);
    const irProto  = this.LLMIntermediateRepresentation.decode(payload) as any;
    return this._protoObjectToIr(irProto);
  }

  // ── Conversion helpers ────────────────────────────────────────────────────

  private _irToProtoObject(ir: LLMIntermediateRepresentation): Record<string, any> {
    // Convert Map<number, IRInstruction> to plain object for protobuf map<int32, ...>
    const instructions: Record<number, any> = {};
    if (ir.instructions) {
      for (const [key, instr] of Object.entries(ir.instructions)) {
        const instrAny = instr as any;
        instructions[Number(key)] = {
          index:            instrAny.index,
          opcode:           instrAny.opcode,
          dest:             instrAny.dest,
          src:              instrAny.src,
          serviceId:        instrAny.serviceId,
          serviceVersion:   instrAny.serviceVersion,
          targetInstruction: instrAny.targetInstruction,
          parallelGroupId:  instrAny.parallelGroupId,
          targetNodeId:     instrAny.targetNodeId,
          requiredTier:     instrAny.requiredTier,
          operandsJson:     JSON.stringify(instrAny.operands ?? {}),
          dispatchMetadata: instrAny.dispatchMetadata ?? undefined,
          loopOperands:     instrAny.operands as any,
        };
      }
    }

    return {
      instructions,
      instructionOrder:      ir.instructionOrder ?? [],
      dependencyGraphJson:   JSON.stringify(
        ir.dependencyGraph instanceof Map
          ? Object.fromEntries(ir.dependencyGraph)
          : ir.dependencyGraph ?? {}
      ),
      resourceTable:         (ir.resourceTable ?? []).map((r: any) => ({
        resourceId:   r.resourceId ?? r.id ?? '',
        resourceType: r.resourceType ?? r.type ?? '',
        location:     r.location ?? '',
        schemaJson:   JSON.stringify(r.schema ?? {}),
      })),
      parallelizationGroups: ir.parallelizationGroups ?? [],
      schemasJson:           (ir.schemas ?? []).map((s: any) => JSON.stringify(s)),
      semanticContext:       ir.semanticContext ?? {},
      inputRegister:         ir.inputRegister  ?? 0,
      outputRegister:        ir.outputRegister ?? 0,
      metadata: {
        id:              (ir.metadata as any)?.id              ?? '',
        workflowName:    (ir.metadata as any)?.workflowName    ?? '',
        compiledAt:      (ir.metadata as any)?.compiledAt?.toISOString?.() ?? new Date().toISOString(),
        compilerVersion: (ir.metadata as any)?.compilerVersion ?? '1.0.0',
        source:          (ir.metadata as any)?.source          ?? '',
        validatedBy:     (ir.metadata as any)?.validatedBy     ?? '',
        version:         (ir.metadata as any)?.version         ?? 1,
        parentVersion:   (ir.metadata as any)?.parentVersion   ?? '',
        changeReason:    (ir.metadata as any)?.changeReason    ?? '',
      },
    };
  }

  private _protoObjectToIr(proto: any): LLMIntermediateRepresentation {
    const instructions: Record<number, any> = {};
    for (const [k, v] of Object.entries(proto.instructions ?? {})) {
      const val = v as any;
      instructions[Number(k)] = {
        ...val,
        operands: val.operandsJson ? JSON.parse(val.operandsJson) : {},
      };
    }

    return {
      instructions,
      instructionOrder:      proto.instructionOrder ?? [],
      dependencyGraph:       new Map(Object.entries(
        proto.dependencyGraphJson ? JSON.parse(proto.dependencyGraphJson) : {}
      )),
      resourceTable: (proto.resourceTable ?? []).map((r: any) => ({
        ...r,
        schema: r.schemaJson ? JSON.parse(r.schemaJson) : {},
      })),
      parallelizationGroups: proto.parallelizationGroups ?? [],
      schemas:               (proto.schemasJson ?? []).map((s: string) => JSON.parse(s)),
      semanticContext:       proto.semanticContext ?? {},
      inputRegister:         proto.inputRegister  ?? 0,
      outputRegister:        proto.outputRegister ?? 0,
      metadata:              proto.metadata ?? {},
    } as any;
  }

  // ── Crypto helpers ────────────────────────────────────────────────────────

  private _sign(data: Buffer): string {
    try {
      const signer = createSign('ed25519');
      signer.update(data);
      return signer.sign(this.privateKeyPem, 'hex');
    } catch {
      const signer = createSign('SHA256');
      signer.update(data);
      return signer.sign(this.privateKeyPem, 'hex');
    }
  }

  private _verify(data: Buffer, signature: string, publicKeyPem: string): boolean {
    if (!publicKeyPem) return true;
    try {
      const verifier = createVerify('ed25519');
      verifier.update(data);
      return verifier.verify(publicKeyPem, Buffer.from(signature, 'hex'));
    } catch {
      return false;
    }
  }
}
