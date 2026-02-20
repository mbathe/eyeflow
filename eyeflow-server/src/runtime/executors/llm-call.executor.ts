/**
 * LLM Call Executor — spec §3.4 "CompiledLLMContext figé à la compilation"
 *
 * Executes LLM_CALL instructions.  The context (system prompt, model, bounds)
 * is FROZEN in the LlmCallExecutionDescriptor at compile time.
 * At runtime this executor ONLY fills the dynamic slots in `promptTemplate`
 * with register values — it NEVER constructs prompts from scratch.
 *
 * Supported providers (resolved from descriptor.provider):
 *   'openai'        → api.openai.com/v1/chat/completions
 *   'azure-openai'  → <endpoint>/openai/deployments/<model>/chat/completions
 *   'anthropic'     → api.anthropic.com/v1/messages
 *   'local-ollama'  → http://localhost:11434/api/chat
 *
 * The API key is read from ExecutorContext.secrets[descriptor.credentialsVaultPath].
 * The SVM must pre-populate ctx.secrets from Vault BEFORE calling this executor.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  IServiceExecutor,
  ExecutorContext,
  ExecutorResult,
  ExecutorError,
} from './executor.interface';
import {
  ExecutionDescriptor,
  LlmCallExecutionDescriptor,
} from '../../compiler/interfaces/service-manifest.interface';

@Injectable()
export class LlmCallExecutor implements IServiceExecutor {
  readonly format = 'LLM_CALL' as const;
  private readonly logger = new Logger(LlmCallExecutor.name);

  async canExecute(descriptor: ExecutionDescriptor): Promise<boolean> {
    const d = descriptor as LlmCallExecutionDescriptor;
    return !!(d.provider && d.model && d.systemPrompt && d.promptTemplate);
  }

  async execute(descriptor: ExecutionDescriptor, ctx: ExecutorContext): Promise<ExecutorResult> {
    const d = descriptor as LlmCallExecutionDescriptor;
    const t0 = Date.now();

    this.logger.debug(`[LLM_CALL] provider=${d.provider} model=${d.model}`);

    // ── 1. Fill dynamic slots in the prompt template ───────────────────────
    // "Au runtime, la SVM injecte uniquement les données dynamiques dans les
    //  slots pré-définis." (spec §3.4)
    const userPrompt = this._fillSlots(d.promptTemplate, ctx.inputs, d.inputMapping);

    // ── 2. Resolve the API key from vault/secrets ──────────────────────────
    const apiKey = ctx.secrets?.[d.credentialsVaultPath] ??
                   ctx.secrets?.[d.credentialsVaultPath.split('/').pop()!] ?? '';
    if (!apiKey) {
      this.logger.warn(`[LLM_CALL] No API key found at vault path '${d.credentialsVaultPath}'.  Using empty key (may fail).`);
    }

    // ── 3. Call the provider ───────────────────────────────────────────────
    let rawResponse: any;
    try {
      rawResponse = await this._callProvider(d, userPrompt, apiKey, ctx.timeoutMs);
    } catch (err: any) {
      throw new ExecutorError(`LLM provider '${d.provider}' call failed: ${err.message}`, 'NETWORK_ERROR', true, err);
    }

    // ── 4. Extract and map outputs ─────────────────────────────────────────
    const rawContent = this._extractContent(d.provider, rawResponse);
    const outputs = this._mapOutputs(rawContent, d.outputMapping);

    const durationMs = Date.now() - t0;
    this.logger.debug(`[LLM_CALL] ${d.provider}/${d.model} completed in ${durationMs}ms`);

    return { outputs, durationMs, rawResponse };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Fill {placeholder} slots in the template with runtime input values.
   * inputMapping: { placeholder → inputPortName }
   */
  private _fillSlots(
    template: string,
    inputs: Record<string, any>,
    inputMapping?: Record<string, string>,
  ): string {
    return template.replace(/\{(\w+)\}/g, (_match, placeholder) => {
      const portName = inputMapping?.[placeholder] ?? placeholder;
      const value = inputs[portName] ?? inputs[`r${portName}`] ?? '';
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    });
  }

  /** Call the appropriate provider API */
  private async _callProvider(
    d: LlmCallExecutionDescriptor,
    userPrompt: string,
    apiKey: string,
    timeoutOverrideMs?: number,
  ): Promise<any> {
    const timeout = timeoutOverrideMs ?? d.timeoutMs ?? 30_000;

    switch (d.provider) {
      case 'openai':
      case 'azure-openai':
        return this._callOpenAI(d, userPrompt, apiKey, timeout);
      case 'anthropic':
        return this._callAnthropic(d, userPrompt, apiKey, timeout);
      case 'local-ollama':
        return this._callOllama(d, userPrompt, timeout);
      default:
        // Generic OpenAI-compatible endpoint (LM Studio, Mistral, etc.)
        return this._callOpenAI(d, userPrompt, apiKey, timeout);
    }
  }

  private async _callOpenAI(
    d: LlmCallExecutionDescriptor,
    userPrompt: string,
    apiKey: string,
    timeout: number,
  ): Promise<any> {
    const baseUrl = d.provider === 'azure-openai'
      ? (d as any).endpoint ?? 'https://api.openai.com'
      : 'https://api.openai.com';

    const url = `${baseUrl}/v1/chat/completions`;

    const controller = new AbortController();
    const tId = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: d.model,
          messages: [
            { role: 'system', content: d.systemPrompt },
            { role: 'user',   content: userPrompt },
          ],
          max_tokens: d.maxTokens ?? 1024,
          temperature: d.temperature ?? 0,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`HTTP ${res.status}: ${err}`);
      }
      return res.json();
    } finally {
      clearTimeout(tId);
    }
  }

  private async _callAnthropic(
    d: LlmCallExecutionDescriptor,
    userPrompt: string,
    apiKey: string,
    timeout: number,
  ): Promise<any> {
    const controller = new AbortController();
    const tId = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: d.model,
          system: d.systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          max_tokens: d.maxTokens ?? 1024,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`HTTP ${res.status}: ${err}`);
      }
      return res.json();
    } finally {
      clearTimeout(tId);
    }
  }

  private async _callOllama(
    d: LlmCallExecutionDescriptor,
    userPrompt: string,
    timeout: number,
  ): Promise<any> {
    const controller = new AbortController();
    const tId = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: d.model,
          messages: [
            { role: 'system', content: d.systemPrompt },
            { role: 'user',   content: userPrompt },
          ],
          stream: false,
          options: {
            num_predict: d.maxTokens ?? 1024,
            temperature: d.temperature ?? 0,
          },
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } finally {
      clearTimeout(tId);
    }
  }

  /** Extract the text content from the provider's response envelope */
  private _extractContent(provider: string, raw: any): string {
    if (!raw) return '';

    switch (provider) {
      case 'openai':
      case 'azure-openai':
      default:
        return raw?.choices?.[0]?.message?.content ?? '';

      case 'anthropic':
        return raw?.content?.[0]?.text ?? '';

      case 'local-ollama':
        return raw?.message?.content ?? raw?.response ?? '';
    }
  }

  /** Map output fields to port names */
  private _mapOutputs(
    rawContent: string,
    outputMapping?: Record<string, string>,
  ): Record<string, any> {
    // Try to parse JSON from the response
    let parsed: any = rawContent;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      // Not JSON — use raw string
    }

    if (!outputMapping) {
      // Default: expose the full response as 'output' and 'content'
      return { output: parsed, content: rawContent };
    }

    const result: Record<string, any> = { output: parsed, content: rawContent };
    for (const [fieldKey, portName] of Object.entries(outputMapping)) {
      result[portName] = typeof parsed === 'object' ? parsed?.[fieldKey] : parsed;
    }
    return result;
  }
}
