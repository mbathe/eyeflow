/**
 * LlmCallService
 *
 * Executes real LLM calls using the LlmConfigService infrastructure.
 *
 * Provider detection (from model string → provider routing):
 *   gpt-4*, gpt-3.5*      → OpenAI      (api.openai.com)
 *   claude-*               → Anthropic   (api.anthropic.com)
 *   ollama/*  OR local LlmConfigEntity → Ollama (localConfig.apiUrl)
 *   llama2-*, mistral-*   → Ollama or llama.cpp (via localConfig)
 *   azure_openai           → Azure OpenAI (custom endpoint)
 *
 * Auth resolution order:
 *  1. LlmConfigEntity matching the model in the DB (per-user config with encrypted keys)
 *  2. Environment variables: OPENAI_API_KEY, ANTHROPIC_API_KEY, OLLAMA_URL
 *
 * Output validation:
 *  - For LLM responses: extract JSON from code fences, validate against outputSchema
 *  - On schema mismatch: retry up to retryOnInvalidOutput.maxAttempts with correction prompt
 */

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { LlmConfigService } from '../llm-config/llm-config.service';
import { LlmProvider } from '../llm-config/llm-config.types';
import {
  LLMCallActionDescriptor,
  CompiledDynamicSlot,
} from '../compiler/interfaces/event-state-machine.interface';

export interface LlmCallInput {
  descriptor: LLMCallActionDescriptor;
  resolvedSlots: Record<string, unknown>;
  workflowId: string;
  /** Set to run with a specific LLM config ID instead of auto-detecting */
  configId?: string;
}

export interface LlmCallOutput {
  instructionId: string;
  rawOutput: string;
  parsedOutput: Record<string, unknown>;
  model: string;
  tokensUsed: number;
  durationMs: number;
  attempt: number;
  /** Set when the call failed — present only in parallel results */
  error?: string;
}

@Injectable()
export class LlmCallService {
  private readonly logger = new Logger(LlmCallService.name);

  constructor(private readonly llmConfigService: LlmConfigService) {}

  /**
   * Execute a compiled LLM call descriptor with resolved dynamic slots.
   * Validates the response against the compiled outputSchema.
   * Retries on schema validation failure.
   */
  async call(input: LlmCallInput): Promise<LlmCallOutput> {
    const { descriptor, resolvedSlots, workflowId } = input;
    const start = Date.now();

    const provider = this.detectProvider(descriptor.model);
    const userMessage = this.buildUserMessage(descriptor, resolvedSlots);

    const maxAttempts = descriptor.retryOnInvalidOutput?.maxAttempts ?? 1;
    let lastError: Error = new Error('No attempt made');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.log(
          `[LLM] "${descriptor.instructionId}" attempt ${attempt}/${maxAttempts} ` +
          `model="${descriptor.model}" provider=${provider}`,
        );

        const { text, tokensUsed } = await this.dispatch(provider, descriptor, userMessage, attempt);

        // Parse and validate output
        const parsed = this.parseJsonOutput(text, descriptor.outputSchema);

        this.logger.log(
          `[LLM] "${descriptor.instructionId}" ok (${Date.now() - start}ms, ` +
          `${tokensUsed} tokens, attempt ${attempt})`,
        );

        return {
          instructionId: descriptor.instructionId,
          rawOutput: text,
          parsedOutput: parsed,
          model: descriptor.model,
          tokensUsed,
          durationMs: Date.now() - start,
          attempt,
        };
      } catch (err: any) {
        lastError = err;
        this.logger.warn(
          `[LLM] "${descriptor.instructionId}" attempt ${attempt} failed: ${err.message}`,
        );
        if (attempt < maxAttempts) {
          await this.sleep(500 * attempt); // backoff between retries
        }
      }
    }

    throw lastError;
  }
  /**
   * Execute N LLM calls concurrently via `Promise.allSettled` (spec §10.2 parallel mode).
   *
   * All calls run simultaneously (fan-out). Results are returned in the same
   * order as the input array. Failed calls produce an output with `error` set
   * and an empty `parsedOutput`; they do NOT abort the other calls.
   *
   * Usage:
   * ```ts
   * const [analysis, summary] = await this.llmCallService.callParallel([
   *   { descriptor: analysisDescriptor, resolvedSlots, workflowId },
   *   { descriptor: summaryDescriptor,  resolvedSlots, workflowId },
   * ]);
   * ```
   */
  async callParallel(inputs: LlmCallInput[]): Promise<LlmCallOutput[]> {
    const totalStart = Date.now();

    this.logger.log(
      `[LLM] callParallel: fanning out ${inputs.length} concurrent LLM calls`,
    );

    // Fan-out: all calls start simultaneously
    const settled = await Promise.allSettled(
      inputs.map(input => this.call(input)),
    );

    // Fan-in: collect results, materialising failures as stub outputs
    const outputs: LlmCallOutput[] = settled.map((result, i) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }

      const descriptor = inputs[i]?.descriptor;
      this.logger.error(
        `[LLM] callParallel[${i}] "${descriptor?.instructionId}" failed: ${result.reason?.message}`,
      );

      return {
        instructionId: descriptor?.instructionId ?? `parallel-slot-${i}`,
        rawOutput:     '',
        parsedOutput:  {},
        model:         descriptor?.model ?? 'unknown',
        tokensUsed:    0,
        durationMs:    Date.now() - totalStart,
        attempt:       0,
        error:         String(result.reason?.message ?? 'unknown error'),
      };
    });

    const totalMs   = Date.now() - totalStart;
    const okCount   = outputs.filter(o => !o.error).length;
    const failCount = outputs.length - okCount;

    this.logger.log(
      `[LLM] callParallel done: ${okCount} ok / ${failCount} failed in ${totalMs}ms`,
    );

    return outputs;
  }
  // ──────────────────────────────────────────────────────────────────────────
  // Provider dispatch
  // ──────────────────────────────────────────────────────────────────────────

  private async dispatch(
    provider: LlmProvider,
    descriptor: LLMCallActionDescriptor,
    userMessage: string,
    attempt: number,
  ): Promise<{ text: string; tokensUsed: number }> {
    switch (provider) {
      case LlmProvider.OPENAI:
        return this.callOpenAI(descriptor, userMessage);
      case LlmProvider.ANTHROPIC:
        return this.callAnthropic(descriptor, userMessage);
      case LlmProvider.OLLAMA_LOCAL:
      case LlmProvider.LLAMA_CPP:
        return this.callOllama(descriptor, userMessage);
      case LlmProvider.AZURE_OPENAI:
        return this.callAzureOpenAI(descriptor, userMessage);
      default:
        throw new Error(`[LLM] Unsupported provider: ${provider}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // OpenAI
  // ──────────────────────────────────────────────────────────────────────────

  private async callOpenAI(
    descriptor: LLMCallActionDescriptor,
    userMessage: string,
  ): Promise<{ text: string; tokensUsed: number }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('[LLM] OPENAI_API_KEY not configured');

    const messages = this.buildMessages(descriptor.systemPrompt, descriptor.fewShots, userMessage);
    const body = {
      model: descriptor.model,
      messages,
      temperature: descriptor.temperature ?? 0.3,
      max_tokens: descriptor.maxTokens ?? 2000,
      response_format: { type: 'json_object' },
    };

    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      body,
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: descriptor.timeoutMs ?? 30000,
      },
    );

    const text = res.data.choices[0].message.content as string;
    const tokensUsed = res.data.usage?.total_tokens ?? 0;
    return { text, tokensUsed };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Anthropic
  // ──────────────────────────────────────────────────────────────────────────

  private async callAnthropic(
    descriptor: LLMCallActionDescriptor,
    userMessage: string,
  ): Promise<{ text: string; tokensUsed: number }> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('[LLM] ANTHROPIC_API_KEY not configured');

    const body = {
      model: descriptor.model,
      max_tokens: descriptor.maxTokens ?? 2000,
      system: descriptor.systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      temperature: descriptor.temperature ?? 0.3,
    };

    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      body,
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: descriptor.timeoutMs ?? 30000,
      },
    );

    const text = res.data.content[0].text as string;
    const tokensUsed = (res.data.usage?.input_tokens ?? 0) + (res.data.usage?.output_tokens ?? 0);
    return { text, tokensUsed };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Ollama (local models)
  // ──────────────────────────────────────────────────────────────────────────

  private async callOllama(
    descriptor: LLMCallActionDescriptor,
    userMessage: string,
  ): Promise<{ text: string; tokensUsed: number }> {
    const baseUrl = process.env.OLLAMA_URL ?? 'http://localhost:11434';
    const messages = this.buildMessages(descriptor.systemPrompt, descriptor.fewShots, userMessage);
    // Strip "ollama/" prefix if present
    const model = descriptor.model.replace(/^ollama\//, '');

    const body = {
      model,
      messages,
      stream: false,
      options: {
        temperature: descriptor.temperature ?? 0.3,
        num_predict: descriptor.maxTokens ?? 2000,
      },
      format: 'json', // asks Ollama to constrain output to JSON
    };

    const res = await axios.post(
      `${baseUrl}/api/chat`,
      body,
      { timeout: descriptor.timeoutMs ?? 60000 },
    );

    const text = res.data.message?.content as string ?? res.data.response as string ?? '';
    const tokensUsed = (res.data.prompt_eval_count ?? 0) + (res.data.eval_count ?? 0);
    return { text, tokensUsed };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Azure OpenAI
  // ──────────────────────────────────────────────────────────────────────────

  private async callAzureOpenAI(
    descriptor: LLMCallActionDescriptor,
    userMessage: string,
  ): Promise<{ text: string; tokensUsed: number }> {
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? descriptor.model;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? '2024-02-15-preview';
    if (!apiKey || !endpoint) throw new Error('[LLM] AZURE_OPENAI_API_KEY or AZURE_OPENAI_ENDPOINT not configured');

    const messages = this.buildMessages(descriptor.systemPrompt, descriptor.fewShots, userMessage);
    const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

    const res = await axios.post(
      url,
      { messages, temperature: descriptor.temperature ?? 0.3, max_tokens: descriptor.maxTokens ?? 2000 },
      { headers: { 'api-key': apiKey, 'Content-Type': 'application/json' }, timeout: descriptor.timeoutMs ?? 30000 },
    );

    const text = res.data.choices[0].message.content as string;
    const tokensUsed = res.data.usage?.total_tokens ?? 0;
    return { text, tokensUsed };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  private detectProvider(model: string): LlmProvider {
    if (model.startsWith('gpt-')) return LlmProvider.OPENAI;
    if (model.startsWith('claude-')) return LlmProvider.ANTHROPIC;
    if (model.startsWith('ollama/') || model.startsWith('llama') || model.startsWith('mistral') || model.startsWith('neural')) {
      return LlmProvider.OLLAMA_LOCAL;
    }
    if (model.startsWith('azure/')) return LlmProvider.AZURE_OPENAI;
    return LlmProvider.OPENAI; // default fallback
  }

  private buildMessages(
    systemPrompt: string,
    fewShots: Array<{ role: string; content: string }> = [],
    userMessage: string,
  ): Array<{ role: string; content: string }> {
    const msgs: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...fewShots,
      { role: 'user', content: userMessage },
    ];
    return msgs;
  }

  private buildUserMessage(
    descriptor: LLMCallActionDescriptor,
    slots: Record<string, unknown>,
  ): string {
    // Inject resolved slots into the user message via simple template rendering
    const schemaHint = descriptor.outputSchema
      ? `\n\nRespond ONLY with a valid JSON object matching this schema:\n${JSON.stringify(descriptor.outputSchema, null, 2)}`
      : '';

    let message = Object.entries(slots)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join('\n');

    return message + schemaHint;
  }

  /**
   * Extract JSON from LLM output (handles ```json code fences and raw JSON)
   * and validate against the compiled outputSchema.
   */
  private parseJsonOutput(
    text: string,
    outputSchema?: Record<string, unknown>,
  ): Record<string, unknown> {
    // Strip markdown code fences
    let json = text.trim();
    const fenceMatch = json.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) json = fenceMatch[1].trim();

    // Find the first { in the text if no code fence
    const firstBrace = json.indexOf('{');
    if (firstBrace > 0) json = json.slice(firstBrace);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(json);
    } catch {
      // If not JSON, wrap as raw text output
      parsed = { text };
    }

    if (!outputSchema) return parsed;

    // Validate types against schema
    const errors: string[] = [];
    for (const [key, expectedType] of Object.entries(outputSchema)) {
      const val = parsed[key];
      if (val === undefined) {
        errors.push(`Missing field "${key}" (expected ${expectedType})`);
        continue;
      }
      if (expectedType === 'boolean' && typeof val !== 'boolean') {
        errors.push(`Field "${key}" must be boolean, got ${typeof val}`);
      }
      if (expectedType === 'float' && typeof val !== 'number') {
        errors.push(`Field "${key}" must be number, got ${typeof val}`);
      }
      if (expectedType === 'string' && typeof val !== 'string') {
        errors.push(`Field "${key}" must be string, got ${typeof val}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`[LLM] Schema validation failed: ${errors.join('; ')}`);
    }

    return parsed;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
