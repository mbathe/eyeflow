/**
 * WASM Executor
 *
 * Executes WebAssembly modules via Node's native WASM support (V8 engine).
 * Compatible node tiers: CENTRAL, LINUX.
 *
 * Execution flow
 * ──────────────
 *  1. Download binary from descriptor.binaryUrl (cached by checksum)
 *  2. Verify SHA-256 checksum
 *  3. Instantiate WebAssembly.Module with a memory limit
 *  4. Locate and call the exported function
 *  5. Serialize inputs / deserialize outputs according to descriptor.abi
 *
 * NOTE: Full wasmtime/wasmer integration is a Phase 2 goal.
 *       This implementation uses Node's built-in WebAssembly API which covers
 *       most use-cases (no WASI, no multi-threading). For WASI modules, swap
 *       `_instantiateWasm` for the wasmtime-js binding.
 */

import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import { IServiceExecutor, ExecutorContext, ExecutorResult, ExecutorError } from './executor.interface';
import {
  ExecutionDescriptor,
  WasmExecutionDescriptor,
} from '../../compiler/interfaces/service-manifest.interface';

@Injectable()
export class WasmExecutor implements IServiceExecutor {
  readonly format = 'WASM' as const;
  private readonly logger = new Logger(WasmExecutor.name);

  /** Cache: checksum → compiled WebAssembly.Module */
  private moduleCache = new Map<string, WebAssembly.Module>();

  /** Cache: checksum → raw binary */
  private binaryCache = new Map<string, Buffer>();

  // ─────────────────────────────────────────────────────────────────────────

  async canExecute(descriptor: ExecutionDescriptor): Promise<boolean> {
    const d = descriptor as WasmExecutionDescriptor;
    return !!(d.binaryUrl && d.exportedFunction && d.checksum);
  }

  async execute(descriptor: ExecutionDescriptor, ctx: ExecutorContext): Promise<ExecutorResult> {
    const d = descriptor as WasmExecutionDescriptor;
    const t0 = Date.now();

    this.logger.debug(`[WASM] Executing ${d.exportedFunction} (checksum: ${d.checksum.slice(0, 12)}…)`);

    // 1. Get compiled module (from cache or fresh download)
    const wasmModule = await this._getModule(d);

    // 2. Instantiate with memory limit
    const memPages = Math.ceil((d.memorySizeMb * 1024 * 1024) / 65536);
    const memory = new WebAssembly.Memory({ initial: memPages, maximum: memPages * 2 });

    const importObject: WebAssembly.Imports = {
      env: { memory },
      wasi_snapshot_preview1: this._makeWasiStubs(),
    };

    const instance = await WebAssembly.instantiate(wasmModule, importObject);

    // 3. Serialize inputs according to ABI
    const inputBytes = this._serializeInputs(ctx.inputs, d.abi);

    // 4. Write inputs into WASM memory and call the export
    const outBytes = await this._callExport(instance, d.exportedFunction, inputBytes, memory, d.abi);

    // 5. Deserialize outputs
    const outputs = this._deserializeOutputs(outBytes, d.abi);

    return { outputs, durationMs: Date.now() - t0 };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async _getModule(d: WasmExecutionDescriptor): Promise<WebAssembly.Module> {
    if (this.moduleCache.has(d.checksum)) {
      return this.moduleCache.get(d.checksum)!;
    }

    const binary = await this._downloadBinary(d.binaryUrl, d.checksum);
    const mod = await WebAssembly.compile(new Uint8Array(binary));
    this.moduleCache.set(d.checksum, mod);
    return mod;
  }

  private async _downloadBinary(url: string, expectedChecksum: string): Promise<Buffer> {
    if (this.binaryCache.has(expectedChecksum)) {
      return this.binaryCache.get(expectedChecksum)!;
    }

    this.logger.log(`[WASM] Downloading binary from ${url}`);

    const binary = await new Promise<Buffer>((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const chunks: Buffer[] = [];
      client.get(url, (res) => {
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });

    // Verify checksum
    const actual = 'sha256:' + crypto.createHash('sha256').update(binary).digest('hex');
    if (actual !== expectedChecksum) {
      throw new ExecutorError(
        `WASM checksum mismatch: expected ${expectedChecksum}, got ${actual}`,
        'CHECKSUM_MISMATCH',
        false,
      );
    }

    this.binaryCache.set(expectedChecksum, binary);
    return binary;
  }

  private _serializeInputs(inputs: Record<string, any>, abi: WasmExecutionDescriptor['abi']): Uint8Array {
    switch (abi) {
      case 'json_stdin':
      case 'json_args': {
        const json = JSON.stringify(inputs);
        return new TextEncoder().encode(json);
      }
      case 'msgpack_stdin': {
        // Simplified: fall back to JSON for now.
        // TODO: integrate msgpack-lite for full support.
        const json = JSON.stringify(inputs);
        return new TextEncoder().encode(json);
      }
      case 'protobuf_stdin': {
        // TODO: integrate protobufjs + per-service .proto files.
        const json = JSON.stringify(inputs);
        return new TextEncoder().encode(json);
      }
    }
  }

  private async _callExport(
    instance: WebAssembly.Instance,
    fnName: string,
    inputBytes: Uint8Array,
    memory: WebAssembly.Memory,
    abi: WasmExecutionDescriptor['abi'],
  ): Promise<Uint8Array> {
    const exports = instance.exports as Record<string, any>;

    if (typeof exports[fnName] !== 'function') {
      throw new ExecutorError(
        `WASM module does not export function '${fnName}'`,
        'RUNTIME_ERROR',
        false,
      );
    }

    // Allocate input in WASM linear memory
    const alloc: Function | undefined = exports['__alloc'] || exports['malloc'];
    if (!alloc) {
      // Simple calling convention: pass length as i32, module reads from fixed offset
      const inputLen = inputBytes.length;
      const view = new Uint8Array(memory.buffer);
      view.set(inputBytes, 0); // write at offset 0
      const outputLen: number = exports[fnName](0, inputLen);
      return view.slice(inputLen, inputLen + outputLen);
    }

    // Advanced: use __alloc (AssemblyScript / wasm-bindgen style)
    const inputPtr: number = alloc(inputBytes.length, 0);
    new Uint8Array(memory.buffer).set(inputBytes, inputPtr);
    const outputPtr: number = exports[fnName](inputPtr, inputBytes.length);
    const outputLenPtr = outputPtr - 4;
    const outputLen = new DataView(memory.buffer).getUint32(outputLenPtr, true);
    return new Uint8Array(memory.buffer).slice(outputPtr, outputPtr + outputLen);
  }

  private _deserializeOutputs(bytes: Uint8Array, abi: WasmExecutionDescriptor['abi']): Record<string, any> {
    try {
      const text = new TextDecoder().decode(bytes);
      return JSON.parse(text);
    } catch {
      return { result: bytes };
    }
  }

  private _makeWasiStubs(): Record<string, Function> {
    // Minimal WASI stubs so modules compiled with wasi_snapshot_preview1 can load.
    const noop = () => 0;
    return {
      proc_exit: noop, fd_write: noop, fd_read: noop, fd_close: noop,
      fd_seek: noop, fd_fdstat_get: noop, environ_sizes_get: noop,
      environ_get: noop, args_sizes_get: noop, args_get: noop,
      clock_time_get: noop, path_open: noop,
    };
  }
}
