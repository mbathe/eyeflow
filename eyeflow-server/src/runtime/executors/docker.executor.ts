/**
 * DOCKER Executor
 *
 * Runs a Docker container and communicates via stdin/stdout JSON or HTTP.
 * Compatible node tiers: CENTRAL only (needs Docker daemon).
 *
 * Invocation protocols
 * ────────────────────
 *  stdin_json  – `docker run -i <image> echo "..." | container`, parse stdout
 *  http_json   – `docker run -d -p <port>:<port> <image>`, POST to /invoke
 *  exec_json   – `docker run <image> <cmd> '<json>'`, parse stdout
 */

import { Injectable, Logger } from '@nestjs/common';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { IServiceExecutor, ExecutorContext, ExecutorResult, ExecutorError } from './executor.interface';
import {
  ExecutionDescriptor,
  DockerExecutionDescriptor,
} from '../../compiler/interfaces/service-manifest.interface';

const execAsync = promisify(exec);

@Injectable()
export class DockerExecutor implements IServiceExecutor {
  readonly format = 'DOCKER' as const;
  private readonly logger = new Logger(DockerExecutor.name);

  async canExecute(_descriptor: ExecutionDescriptor): Promise<boolean> {
    try {
      await execAsync('docker info --format "{{.ServerVersion}}"');
      return true;
    } catch {
      return false;
    }
  }

  async execute(descriptor: ExecutionDescriptor, ctx: ExecutorContext): Promise<ExecutorResult> {
    const d = descriptor as DockerExecutionDescriptor;
    const t0 = Date.now();

    const image = `${d.image}:${d.tag}`;

    // Pull image if needed (idempotent)
    await this._pullImage(image);

    let outputs: Record<string, any>;

    switch (d.invocationProtocol) {
      case 'stdin_json':
        outputs = await this._invokeStdinJson(image, d, ctx);
        break;
      case 'http_json':
        outputs = await this._invokeHttpJson(image, d, ctx);
        break;
      case 'exec_json':
        outputs = await this._invokeExecJson(image, d, ctx);
        break;
      default:
        throw new ExecutorError(`Unknown Docker protocol: ${d.invocationProtocol}`, 'RUNTIME_ERROR', false);
    }

    return { outputs, durationMs: Date.now() - t0 };
  }

  // ─────────────────────────────────────────────────────────────────────────

  private async _pullImage(image: string): Promise<void> {
    this.logger.debug(`[DOCKER] Ensuring image ${image} is present`);
    try {
      await execAsync(`docker image inspect ${image} --format "exists" 2>/dev/null`);
    } catch {
      this.logger.log(`[DOCKER] Pulling ${image}`);
      await execAsync(`docker pull ${image}`);
    }
  }

  private _buildEnvFlags(d: DockerExecutionDescriptor, secrets: Record<string, string>): string {
    const envPairs: string[] = [];
    if (d.env) {
      for (const [k, v] of Object.entries(d.env)) {
        envPairs.push(`-e ${k}=${JSON.stringify(v)}`);
      }
    }
    if (d.secretEnvVars) {
      for (const [k, secretName] of Object.entries(d.secretEnvVars)) {
        const val = secrets[secretName] || process.env[secretName] || '';
        envPairs.push(`-e ${k}=${JSON.stringify(val)}`);
      }
    }
    return envPairs.join(' ');
  }

  private _buildVolumeFlags(d: DockerExecutionDescriptor): string {
    if (!d.volumes) return '';
    return Object.entries(d.volumes)
      .map(([host, container]) => `-v "${host}:${container}"`)
      .join(' ');
  }

  private _buildResourceFlags(d: DockerExecutionDescriptor): string {
    const flags: string[] = [];
    if (d.cpuLimit) flags.push(`--cpus="${d.cpuLimit}"`);
    if (d.memoryMb) flags.push(`--memory="${d.memoryMb}m"`);
    return flags.join(' ');
  }

  private _invokeStdinJson(
    image: string,
    d: DockerExecutionDescriptor,
    ctx: ExecutorContext,
  ): Promise<Record<string, any>> {
    const cmd = d.command?.join(' ') || '';
    const entrypoint = d.entrypoint ? `--entrypoint ${d.entrypoint[0]}` : '';
    const envFlags = this._buildEnvFlags(d, ctx.secrets || {});
    const volFlags = this._buildVolumeFlags(d);
    const resFlags = this._buildResourceFlags(d);

    const fullCmd = `docker run --rm -i ${entrypoint} ${envFlags} ${volFlags} ${resFlags} ${image} ${cmd}`.trim();

    return new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', fullCmd]);
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new ExecutorError(`Docker timed out after ${ctx.timeoutMs}ms`, 'TIMEOUT', true));
      }, ctx.timeoutMs || 60_000);

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new ExecutorError(`Docker exit ${code}: ${stderr}`, 'RUNTIME_ERROR', false));
          return;
        }
        try { resolve(JSON.parse(stdout)); }
        catch { reject(new ExecutorError(`Docker stdout not JSON: ${stdout.slice(0, 200)}`, 'CONTRACT_VIOLATION', false)); }
      });
      child.stdin.write(JSON.stringify(ctx.inputs));
      child.stdin.end();
    });
  }

  private async _invokeHttpJson(
    image: string,
    d: DockerExecutionDescriptor,
    ctx: ExecutorContext,
  ): Promise<Record<string, any>> {
    const port = d.httpPort || 8080;
    const envFlags = this._buildEnvFlags(d, ctx.secrets || {});
    const volFlags = this._buildVolumeFlags(d);
    const resFlags = this._buildResourceFlags(d);

    // Start container
    const { stdout: containerId } = await execAsync(
      `docker run --rm -d -p ${port}:${port} ${envFlags} ${volFlags} ${resFlags} ${image}`.trim()
    );
    const id = containerId.trim();

    try {
      // Wait for readiness
      await this._waitForHttp(`http://localhost:${port}/health`, 30_000);

      // Call /invoke
      const res = await fetch(`http://localhost:${port}/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ctx.inputs),
        signal: AbortSignal.timeout(ctx.timeoutMs || 60_000),
      });

      if (!res.ok) throw new ExecutorError(`HTTP ${res.status} from Docker container`, 'RUNTIME_ERROR', false);
      return await res.json() as Record<string, any>;
    } finally {
      await execAsync(`docker stop ${id} 2>/dev/null`).catch(() => {});
    }
  }

  private async _invokeExecJson(
    image: string,
    d: DockerExecutionDescriptor,
    ctx: ExecutorContext,
  ): Promise<Record<string, any>> {
    const inputJson = JSON.stringify(ctx.inputs).replace(/"/g, '\\"');
    const cmd = d.command?.join(' ') || '';
    const envFlags = this._buildEnvFlags(d, ctx.secrets || {});
    const resFlags = this._buildResourceFlags(d);

    const { stdout } = await execAsync(
      `docker run --rm ${envFlags} ${resFlags} ${image} ${cmd} "${inputJson}"`.trim()
    );

    try {
      return JSON.parse(stdout);
    } catch {
      return { result: stdout.trim() };
    }
  }

  private async _waitForHttp(url: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        await fetch(url, { signal: AbortSignal.timeout(1000) });
        return;
      } catch {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    throw new ExecutorError(`Container health check timed out: ${url}`, 'TIMEOUT', false);
  }
}
