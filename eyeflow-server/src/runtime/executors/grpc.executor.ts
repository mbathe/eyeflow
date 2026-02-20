/**
 * GRPC Executor
 *
 * Calls gRPC services. Loads the .proto definition at service registration time.
 * Compatible tiers: CENTRAL, LINUX.
 *
 * NOTE: Requires `@grpc/grpc-js` and `@grpc/proto-loader` packages.
 * These are optional peer dependencies. If not installed, the executor
 * returns BINARY_NOT_FOUND for all canExecute() checks.
 */

import { Injectable, Logger } from '@nestjs/common';
import { IServiceExecutor, ExecutorContext, ExecutorResult, ExecutorError } from './executor.interface';
import {
  ExecutionDescriptor,
  GrpcExecutionDescriptor,
} from '../../compiler/interfaces/service-manifest.interface';

// Lazy-load gRPC to avoid hard dependency
let grpc: any;
let protoLoader: any;

function loadGrpc(): boolean {
  if (grpc) return true;
  try {
    grpc = require('@grpc/grpc-js');
    protoLoader = require('@grpc/proto-loader');
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class GrpcExecutor implements IServiceExecutor {
  readonly format = 'GRPC' as const;
  private readonly logger = new Logger(GrpcExecutor.name);

  /** Cache: protoUrl → loaded package definition */
  private protoCache = new Map<string, any>();

  /** Cache: `host:port` → grpc client instance */
  private clientCache = new Map<string, any>();

  async canExecute(descriptor: ExecutionDescriptor): Promise<boolean> {
    if (!loadGrpc()) return false;
    const d = descriptor as GrpcExecutionDescriptor;
    return !!(d.host && d.port && d.serviceName && d.methodName && d.protoUrl);
  }

  async execute(descriptor: ExecutionDescriptor, ctx: ExecutorContext): Promise<ExecutorResult> {
    const d = descriptor as GrpcExecutionDescriptor;
    const t0 = Date.now();

    if (!loadGrpc()) {
      throw new ExecutorError(
        '@grpc/grpc-js not installed. Run: npm install @grpc/grpc-js @grpc/proto-loader',
        'BINARY_NOT_FOUND',
        false,
      );
    }

    // Map inputs
    const request: Record<string, any> = {};
    if (d.inputMapping) {
      for (const [portName, protoField] of Object.entries(d.inputMapping)) {
        request[protoField] = ctx.inputs[portName];
      }
    } else {
      Object.assign(request, ctx.inputs);
    }

    // Get or build client
    const client = await this._getClient(d);

    // Call the method
    const rawResponse = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(
        new ExecutorError(`gRPC call timed out after ${ctx.timeoutMs}ms`, 'TIMEOUT', true)
      ), ctx.timeoutMs || 30_000);

      (client as any)[d.methodName](request, (err: any, response: any) => {
        clearTimeout(timer);
        if (err) {
          reject(new ExecutorError(`gRPC error ${err.code}: ${err.message}`, 'RUNTIME_ERROR', err.code >= 14));
        } else {
          resolve(response);
        }
      });
    });

    // Map outputs
    const outputs: Record<string, any> = {};
    if (d.outputMapping) {
      for (const [protoField, portName] of Object.entries(d.outputMapping)) {
        outputs[portName] = rawResponse[protoField];
      }
    } else {
      Object.assign(outputs, rawResponse);
    }

    return { outputs, durationMs: Date.now() - t0, rawResponse };
  }

  async onDestroy(): Promise<void> {
    for (const client of this.clientCache.values()) {
      client.close?.();
    }
    this.clientCache.clear();
  }

  // ─────────────────────────────────────────────────────────────────────────

  private async _getClient(d: GrpcExecutionDescriptor): Promise<any> {
    const cacheKey = `${d.host}:${d.port}:${d.serviceName}`;
    if (this.clientCache.has(cacheKey)) return this.clientCache.get(cacheKey);

    // Load proto
    let packageDef = this.protoCache.get(d.protoUrl);
    if (!packageDef) {
      // Download .proto
      const protoText = await fetch(d.protoUrl).then(r => r.text());
      const tmpFile = require('path').join(require('os').tmpdir(), `eyeflow-${Date.now()}.proto`);
      require('fs').writeFileSync(tmpFile, protoText);
      packageDef = protoLoader.loadSync(tmpFile, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });
      require('fs').unlinkSync(tmpFile);
      this.protoCache.set(d.protoUrl, packageDef);
    }

    const proto = grpc.loadPackageDefinition(packageDef);
    const ServiceClass = this._getNestedService(proto, d.serviceName);

    const creds = d.tlsCertUrl
      ? grpc.credentials.createSsl()
      : grpc.credentials.createInsecure();

    const client = new ServiceClass(`${d.host}:${d.port}`, creds);
    this.clientCache.set(cacheKey, client);
    return client;
  }

  private _getNestedService(proto: any, serviceName: string): any {
    const parts = serviceName.split('.');
    let obj = proto;
    for (const part of parts) {
      obj = obj?.[part];
    }
    if (!obj) throw new ExecutorError(`gRPC service '${serviceName}' not found in proto`, 'RUNTIME_ERROR', false);
    return obj;
  }
}
