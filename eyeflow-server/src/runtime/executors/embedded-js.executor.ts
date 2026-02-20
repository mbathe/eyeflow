/**
 * EMBEDDED JS Executor
 *
 * Executes inline JavaScript code snippets inside a sandboxed Node.js VM context.
 * This is ideal for simple data transformations, format conversions, and
 * lightweight business logic that does not justify a full binary or container.
 *
 * Security model
 * ──────────────
 *  - Code runs inside `vm.runInNewContext()` with a minimal global scope.
 *  - No access to `require`, `process`, `__dirname`, or the file system
 *    unless the descriptor explicitly allows specific modules via `allowedModules`.
 *  - A hard execution timeout kills the script if it exceeds `executionTimeoutMs`.
 *  - Allowed modules are pre-loaded and injected into the sandbox scope.
 *
 * Compatible tiers: CENTRAL, LINUX.
 */

import { Injectable, Logger } from '@nestjs/common';
import * as vm from 'vm';
import { IServiceExecutor, ExecutorContext, ExecutorResult, ExecutorError } from './executor.interface';
import {
  ExecutionDescriptor,
  EmbeddedJsExecutionDescriptor,
} from '../../compiler/interfaces/service-manifest.interface';

/** Safe allowlist of modules that embedded scripts may use */
const MODULE_ALLOWLIST: Record<string, () => any> = {
  'lodash':       () => require('lodash'),
  'dayjs':        () => require('dayjs'),
  'uuid':         () => require('uuid'),
  'crypto':       () => require('crypto'),
};

@Injectable()
export class EmbeddedJsExecutor implements IServiceExecutor {
  readonly format = 'EMBEDDED_JS' as const;
  private readonly logger = new Logger(EmbeddedJsExecutor.name);

  async canExecute(descriptor: ExecutionDescriptor): Promise<boolean> {
    const d = descriptor as EmbeddedJsExecutionDescriptor;
    return typeof d.code === 'string' && d.code.trim().length > 0;
  }

  async execute(descriptor: ExecutionDescriptor, ctx: ExecutorContext): Promise<ExecutorResult> {
    const d = descriptor as EmbeddedJsExecutionDescriptor;
    const t0 = Date.now();

    // Prepare the sandbox
    const sandbox: Record<string, any> = {
      // Inject inputs
      inputs: { ...ctx.inputs },

      // Safe JSON utilities
      JSON,

      // Output collector (the script assigns its result here)
      outputs: {} as Record<string, any>,

      // Console for debugging (writes to NestJS logger)
      console: {
        log: (...args: any[]) => this.logger.debug(`[EmbeddedJS] ${args.join(' ')}`),
        warn: (...args: any[]) => this.logger.warn(`[EmbeddedJS] ${args.join(' ')}`),
        error: (...args: any[]) => this.logger.error(`[EmbeddedJS] ${args.join(' ')}`),
      },

      // Math and other safe globals
      Math,
      Date,
      parseInt,
      parseFloat,
      Number,
      String,
      Boolean,
      Array,
      Object,
      Promise,
      setTimeout: undefined,  // Explicitly blocked
      setInterval: undefined, // Explicitly blocked
      fetch: undefined,       // Explicitly blocked (use HTTP descriptor instead)
    };

    // Inject allowed modules
    if (d.allowedModules) {
      for (const mod of d.allowedModules) {
        if (MODULE_ALLOWLIST[mod]) {
          try {
            sandbox[mod] = MODULE_ALLOWLIST[mod]();
          } catch {
            this.logger.warn(`[EmbeddedJS] Could not load optional module '${mod}'`);
          }
        } else {
          this.logger.warn(`[EmbeddedJS] Module '${mod}' is not in the allowlist, skipping`);
        }
      }
    }

    // Wrap the user code so that:
    //  1. The function body can use `inputs.portName` directly
    //  2. The return value is assigned to `outputs`
    const wrappedCode = `
(function() {
  "use strict";
  ${d.code}
  // If the script defines a \`main\` function, call it automatically
  if (typeof main === 'function') {
    const result = main(inputs);
    if (result !== undefined && result !== null) {
      if (typeof result === 'object' && !Array.isArray(result)) {
        Object.assign(outputs, result);
      } else {
        outputs.result = result;
      }
    }
  }
})();
`;

    const timeoutMs = d.executionTimeoutMs || ctx.timeoutMs || 5_000;

    try {
      vm.runInNewContext(wrappedCode, vm.createContext(sandbox), {
        timeout: timeoutMs,
        displayErrors: true,
        filename: 'embedded-js-service.js',
      });
    } catch (err: any) {
      if (err.message?.includes('timed out')) {
        throw new ExecutorError(
          `EmbeddedJS timed out after ${timeoutMs}ms`,
          'TIMEOUT',
          false,
        );
      }
      throw new ExecutorError(
        `EmbeddedJS runtime error: ${err.message}`,
        'RUNTIME_ERROR',
        false,
        err,
      );
    }

    const outputs = sandbox.outputs as Record<string, any>;
    this.logger.debug(`[EmbeddedJS] Executed in ${Date.now() - t0}ms → ${JSON.stringify(outputs).slice(0, 200)}`);

    return { outputs, durationMs: Date.now() - t0 };
  }
}
