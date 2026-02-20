/**
 * NATIVE Executor
 *
 * Executes pre-compiled native binaries (ELF / PE / bare-metal firmware).
 * Compatible node tiers: CENTRAL, LINUX, MCU.
 *
 * Invocation protocols
 * ────────────────────
 *  json_stdin      – Spawn process, write JSON to stdin, read JSON from stdout
 *  json_args       – Spawn with JSON-encoded args, read JSON from stdout
 *  msgpack_stdin   – Like json_stdin but using MessagePack encoding
 *  shared_memory   – Write inputs to /dev/shm, invoke binary, read result buffer
 *  ffi_c           – Load shared library via dlopen, call exported C function
 *
 * For bare-metal MCU targets this executor is replaced by the edge node's
 * Rust SVM (which flashes and executes the firmware directly).
 */

import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { IServiceExecutor, ExecutorContext, ExecutorResult, ExecutorError } from './executor.interface';
import {
  ExecutionDescriptor,
  NativeExecutionDescriptor,
  NativePlatform,
} from '../../compiler/interfaces/service-manifest.interface';

@Injectable()
export class NativeExecutor implements IServiceExecutor {
  readonly format = 'NATIVE' as const;
  private readonly logger = new Logger(NativeExecutor.name);

  /** Cache: checksum → local binary path */
  private binaryPathCache = new Map<string, string>();

  private readonly binDir = path.join(os.tmpdir(), 'eyeflow-native-bins');

  async onInit(): Promise<void> {
    if (!fs.existsSync(this.binDir)) {
      fs.mkdirSync(this.binDir, { recursive: true });
    }
  }

  async canExecute(descriptor: ExecutionDescriptor): Promise<boolean> {
    const d = descriptor as NativeExecutionDescriptor;
    const platform = this._currentPlatform();
    return d.binaries.some(b => b.platform === platform);
  }

  async execute(descriptor: ExecutionDescriptor, ctx: ExecutorContext): Promise<ExecutorResult> {
    const d = descriptor as NativeExecutionDescriptor;
    const t0 = Date.now();
    const platform = this._currentPlatform();

    const binaryEntry = d.binaries.find(b => b.platform === platform);
    if (!binaryEntry) {
      throw new ExecutorError(
        `No native binary available for platform '${platform}'`,
        'UNSUPPORTED_PLATFORM',
        false,
      );
    }

    // Download if not cached
    const localPath = await this._ensureBinary(binaryEntry.binaryUrl, binaryEntry.checksum);

    // Build environment
    const env: Record<string, string> = { ...process.env as any };
    if (d.requiredEnvVars) {
      for (const key of d.requiredEnvVars) {
        const val = ctx.secrets?.[key] || process.env[key];
        if (!val) {
          throw new ExecutorError(
            `Required env var '${key}' not found on this node`,
            'RUNTIME_ERROR',
            false,
          );
        }
        env[key] = val;
      }
    }

    // Invoke
    let outputs: Record<string, any>;
    switch (d.invocationProtocol) {
      case 'json_stdin':
      case 'msgpack_stdin':
        outputs = await this._invokeViaStdin(localPath, ctx.inputs, env, ctx.timeoutMs);
        break;
      case 'json_args': {
        const args = this._buildArgs(d.argsTemplate || [], ctx.inputs);
        outputs = await this._invokeViaArgs(localPath, args, env, ctx.timeoutMs);
        break;
      }
      case 'shared_memory':
        outputs = await this._invokeViaSharedMemory(localPath, ctx.inputs, env, ctx.timeoutMs);
        break;
      default:
        throw new ExecutorError(`Unsupported invocation protocol: ${d.invocationProtocol}`, 'RUNTIME_ERROR', false);
    }

    return { outputs, durationMs: Date.now() - t0 };
  }

  // ─────────────────────────────────────────────────────────────────────────

  private async _ensureBinary(url: string, checksum: string): Promise<string> {
    if (this.binaryPathCache.has(checksum)) {
      return this.binaryPathCache.get(checksum)!;
    }

    const localPath = path.join(this.binDir, checksum.replace('sha256:', '') + '.bin');

    if (fs.existsSync(localPath)) {
      // Verify cached binary
      const actual = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(localPath)).digest('hex');
      if (actual === checksum) {
        this.binaryPathCache.set(checksum, localPath);
        return localPath;
      }
      // Corrupted: re-download
      fs.unlinkSync(localPath);
    }

    this.logger.log(`[NATIVE] Downloading binary from ${url}`);
    const binary = await new Promise<Buffer>((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const chunks: Buffer[] = [];
      client.get(url, (res) => {
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });

    // Verify
    const actual = 'sha256:' + crypto.createHash('sha256').update(binary).digest('hex');
    if (actual !== checksum) {
      throw new ExecutorError(`Checksum mismatch: expected ${checksum}, got ${actual}`, 'CHECKSUM_MISMATCH', false);
    }

    fs.writeFileSync(localPath, binary, { mode: 0o755 });
    this.binaryPathCache.set(checksum, localPath);
    return localPath;
  }

  private _invokeViaStdin(
    binaryPath: string,
    inputs: Record<string, any>,
    env: Record<string, string>,
    timeoutMs = 30_000,
  ): Promise<Record<string, any>> {
    return new Promise((resolve, reject) => {
      const child = spawn(binaryPath, [], { env });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new ExecutorError(`Native binary timed out after ${timeoutMs}ms`, 'TIMEOUT', true));
      }, timeoutMs);

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new ExecutorError(`Binary exited with code ${code}: ${stderr}`, 'RUNTIME_ERROR', false));
          return;
        }
        try { resolve(JSON.parse(stdout)); }
        catch { reject(new ExecutorError(`Binary output is not valid JSON: ${stdout}`, 'CONTRACT_VIOLATION', false)); }
      });

      child.stdin.write(JSON.stringify(inputs));
      child.stdin.end();
    });
  }

  private _invokeViaArgs(
    binaryPath: string,
    args: string[],
    env: Record<string, string>,
    timeoutMs = 30_000,
  ): Promise<Record<string, any>> {
    return new Promise((resolve, reject) => {
      const child = spawn(binaryPath, args, { env });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new ExecutorError(`Binary timed out after ${timeoutMs}ms`, 'TIMEOUT', true));
      }, timeoutMs);

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new ExecutorError(`Exit ${code}: ${stderr}`, 'RUNTIME_ERROR', false));
          return;
        }
        try { resolve(JSON.parse(stdout)); }
        catch { resolve({ result: stdout.trim() }); }
      });
    });
  }

  private async _invokeViaSharedMemory(
    binaryPath: string,
    inputs: Record<string, any>,
    env: Record<string, string>,
    timeoutMs = 30_000,
  ): Promise<Record<string, any>> {
    // Write inputs to a temp file (true shared memory requires kernel magic)
    const shmPath = path.join(os.tmpdir(), `eyeflow-shm-${Date.now()}.json`);
    const outPath = shmPath + '.out';
    fs.writeFileSync(shmPath, JSON.stringify(inputs));
    try {
      const result = await this._invokeViaArgs(binaryPath, [shmPath, outPath], env, timeoutMs);
      if (fs.existsSync(outPath)) {
        return JSON.parse(fs.readFileSync(outPath, 'utf8'));
      }
      return result;
    } finally {
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    }
  }

  private _buildArgs(template: string[], inputs: Record<string, any>): string[] {
    return template.map(arg =>
      arg.replace(/\{(\w+)\}/g, (_, key) => {
        const val = inputs[key];
        return val !== undefined ? String(val) : arg;
      })
    );
  }

  private _currentPlatform(): NativePlatform {
    const map: Record<string, NativePlatform> = {
      'linux-x64': 'linux-x64',
      'linux-arm': 'linux-armv7',
      'linux-arm64': 'linux-arm64',
      'darwin-x64': 'darwin-x64',
      'win32-x64': 'win32-x64',
    };
    const key = `${os.platform()}-${os.arch()}`;
    return map[key] || 'linux-x64';
  }
}
