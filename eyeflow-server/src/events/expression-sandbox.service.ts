/**
 * ExpressionSandboxService
 *
 * Evaluates compiled JS expressions safely using Node.js built-in `vm` module.
 *
 * Replaces the `new Function()` pattern used elsewhere:
 *   - `new Function()` shares the global scope → can access require, process, etc.
 *   - `vm.runInNewContext()` creates an isolated V8 context → ONLY sees the scope
 *     variables you explicitly inject + a `timeout` hard-kills runaway expressions.
 *
 * Security properties:
 *   ✅ No access to require / process / global / Buffer / setTimeout
 *   ✅ Timeout kills infinite loops (default 100ms)
 *   ✅ Scope variables are a shallow copy — mutations are discarded
 *   ⚠️ NOT hermetic against all attacks in adversarial environments (use vm2 or
 *      isolated-vm for fully hostile code, but for compiled-at-deploy expressions
 *      this is sufficient)
 *
 * Usage:
 *   sandbox.evaluate("output.confidence > 0.8 && !output.is_ambiguous", { output })
 *   sandbox.evaluate("pipeline.crm.output.incidents > 3", { pipeline })
 */

import { Injectable, Logger } from '@nestjs/common';
import * as vm from 'vm';

@Injectable()
export class ExpressionSandboxService {
  private readonly logger = new Logger(ExpressionSandboxService.name);

  /**
   * Evaluate a boolean expression in an isolated vm context.
   *
   * @param expression  Compiled JS expression returning a boolean.
   *                    Available scope keys are bound as top-level variables.
   * @param scope       Variables to expose (e.g. { output, pipeline, event })
   * @param timeoutMs   Hard timeout. Default 100ms. Runaway loops are killed.
   * @returns           The boolean result, or `false` on any error/timeout.
   */
  evaluate(
    expression: string,
    scope: Record<string, unknown>,
    timeoutMs = 100,
  ): boolean {
    try {
      // Create a fresh sandbox — shallow copy so mutations don't escape
      const sandbox: Record<string, unknown> = { ...scope, __result__: false };
      const code = `__result__ = !!(${expression});`;
      vm.runInNewContext(code, sandbox, { timeout: timeoutMs, filename: 'expression' });
      return Boolean(sandbox.__result__);
    } catch (err: any) {
      this.logger.error(
        `[Sandbox] Expression evaluation failed: "${expression}" — ${err.message}`,
      );
      return false;
    }
  }

  /**
   * Evaluate a numeric expression (for ML score comparisons, etc.)
   * Returns the numeric result or NaN on failure.
   */
  evaluateNumber(
    expression: string,
    scope: Record<string, unknown>,
    timeoutMs = 100,
  ): number {
    try {
      const sandbox: Record<string, unknown> = { ...scope, __result__: NaN };
      const code = `__result__ = +(${expression});`;
      vm.runInNewContext(code, sandbox, { timeout: timeoutMs, filename: 'expression' });
      return Number(sandbox.__result__);
    } catch (err: any) {
      this.logger.error(
        `[Sandbox] Numeric expression failed: "${expression}" — ${err.message}`,
      );
      return NaN;
    }
  }

  /**
   * Render a template string: replaces {{ path.to.value }} with resolved values.
   * Runs in the same vm context so {{ pipeline.step.output.label }} works.
   */
  renderTemplate(
    template: string,
    scope: Record<string, unknown>,
  ): string {
    return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, expr: string) => {
      try {
        const sandbox: Record<string, unknown> = { ...scope, __result__: '' };
        const code = `__result__ = String(${expr.trim()});`;
        vm.runInNewContext(code, sandbox, { timeout: 50, filename: 'template' });
        return String(sandbox.__result__ ?? '');
      } catch {
        return `<${expr.trim()}>`;
      }
    });
  }
}
