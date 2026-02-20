/**
 * Semantic Context Binding Service
 *
 * Binds semantic embeddings and contexts to IR.
 * Key responsibility per spec §3.4: freezes the LLM context for each
 * LLM_CALL node into the IR at compile time so the SVM never constructs
 * context at runtime (primary defence against hallucination).
 */

import { Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { Inject } from '@nestjs/common';
import { SemanticTree } from '../../frontend/interfaces/semantic-node.interface';
import { LLMContext, OptimizationPlan } from '../../optimizer/interfaces/optimizer.interface';
import {
  IROpcode,
  LLMIntermediateRepresentation,
  LlmCompiledContext,
  LlmDynamicSlot,
  LlmFewShotExample,
  SemanticContextBindingResult,
  SemanticsData,
  IRInstruction,
} from '../interfaces/ir.interface';

@Injectable()
export class SemanticContextBindingService {
  constructor(@Inject('LOGGER') private logger: Logger) {}

  /**
   * Bind semantic context to IR.
   *
   * Pass 1 — classify/embed: populate semanticContext from optimizationPlan embeddings.
   * Pass 2 — freeze LLM contexts: for every CALL_FUNCTION instruction that maps
   *           to an LLMContext, build a CompiledLLMContext and attach it to the
   *           instruction (spec §3.4).
   */
  async bindSemanticContext(
    semanticTree: SemanticTree,
    optimizationPlan: OptimizationPlan,
    ir: LLMIntermediateRepresentation,
  ): Promise<SemanticContextBindingResult> {
    this.logger.debug('Starting semantic context binding', {
      context: 'SemanticContextBinding',
    });

    const contextInstructions: IRInstruction[] = [];
    const errors: string[] = [];

    try {
      // ── Pass 1: Embeddings & relationships ─────────────────────────────
      const semanticContext: SemanticsData = {
        embeddings: {},
        contexts: {},
        relationships: {},
      };

      if (optimizationPlan.llmContexts?.length) {
        for (const ctx of optimizationPlan.llmContexts) {
          if (ctx.contextId && ctx.semanticEmbeddings) {
            semanticContext.embeddings[ctx.contextId] = ctx.semanticEmbeddings[0] ?? [];
            semanticContext.contexts[ctx.contextId] = ctx.operationDescription ?? '';
          }
        }
      }

      this.buildRelationships(semanticTree, semanticContext);

      // ── Pass 2: Freeze CompiledLLMContext into LLM_CALL instructions ───
      // Build a lookup: contextId → LLMContext
      const contextById = new Map<string, LLMContext>(
        (optimizationPlan.llmContexts ?? []).map(c => [c.contextId, c]),
      );

      let frozenCount = 0;
      for (const instr of ir.instructions) {
        // Any instruction whose opcode is CALL_FUNCTION or whose service
        // metadata marks it as an LLM call gets a frozen context.
        const isLlmCall =
          instr.opcode === IROpcode.CALL_FUNCTION ||
          (instr.comment ?? '').toLowerCase().includes('llm');

        if (!isLlmCall) continue;

        // Find the matching LLMContext by instruction id or positional fallback
        const ctx: LLMContext | undefined =
          contextById.get(instr.id) ??
          [...contextById.values()][frozenCount] ??
          undefined;

        if (!ctx) continue;

        const compiledContext = this.buildCompiledContext(ctx, instr);
        instr.compiledContext = compiledContext;
        frozenCount++;

        this.logger.debug(`[ContextBinding] Froze LLM context on instr ${instr.id}`, {
          context: 'SemanticContextBinding',
          model: compiledContext.model,
          fewShotCount: compiledContext.fewShotExamples.length,
          dynamicSlots: compiledContext.dynamicSlots.length,
        });
      }

      this.logger.debug('Semantic context binding completed', {
        context: 'SemanticContextBinding',
        embeddingCount: Object.keys(semanticContext.embeddings).length,
        frozenLlmContexts: frozenCount,
      });

      return { semanticContext, contextInstructions, errors };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(msg);
      this.logger.error(`Semantic context binding failed: ${msg}`, {
        context: 'SemanticContextBinding',
      });

      return {
        semanticContext: { embeddings: {}, contexts: {}, relationships: {} },
        contextInstructions,
        errors,
      };
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Build a frozen CompiledLLMContext from optimizer output + instruction
   * metadata (spec §3.4).
   *
   * Temperature calibration heuristics (spec §10.2):
   *   extraction / classification → 0.0
   *   validation / structured output → 0.1
   *   reasoning / diagnosis → 0.3
   *   creative / generation → 0.7
   */
  private buildCompiledContext(
    ctx: LLMContext,
    instr: IRInstruction,
  ): LlmCompiledContext {
    const description = (ctx.operationDescription ?? '').toLowerCase();

    // Calibrate temperature at compile time (spec §3.4)
    let temperature = 0.2; // safe default
    if (description.match(/extract|parse|classify|find|detect/)) temperature = 0.0;
    else if (description.match(/valid|schema|format|structured/))  temperature = 0.1;
    else if (description.match(/reason|diagnos|analys|evaluat/))   temperature = 0.3;
    else if (description.match(/generat|creat|suggest|recommend/)) temperature = 0.7;

    // Derive model from metadata or fall back to sensible defaults
    const meta = ctx.metadata ?? {};
    const model: string = (meta['model'] as string) || 'gpt-4o';
    const provider: string = (meta['provider'] as string) || 'openai';

    // Build few-shot examples from metadata if present (spec §3.4)
    const rawExamples = (meta['fewShotExamples'] as unknown[]) ?? [];
    const fewShotExamples: LlmFewShotExample[] = rawExamples
      .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
      .map(e => ({
        inputJson:  JSON.stringify(e['input'] ?? e['inputJson'] ?? {}),
        outputJson: JSON.stringify(e['output'] ?? e['outputJson'] ?? {}),
        label:      typeof e['label'] === 'string' ? e['label'] : undefined,
      }));

    // Dynamic slots: secrets and runtime data (spec §3.4 + §13.2)
    // Any operand that looks like a Vault path gets a vault slot.
    const dynamicSlots: LlmDynamicSlot[] = [];
    const vaultPrefix = (meta['vaultPrefix'] as string) ?? 'secret/eyeflow/';
    if (meta['secretKey']) {
      dynamicSlots.push({
        slotId: 'api_key',
        sourceType: 'vault',
        sourceKey: `${vaultPrefix}${meta['secretKey']}`,
      });
    }
    // Runtime slot for the primary event payload
    dynamicSlots.push({
      slotId: 'user_data',
      sourceType: 'runtime',
      sourceKey: 'event.payload',
    });

    // Output schema: combine JSON Schema from optimizer metadata
    const outputSchema = (meta['outputSchema'] as Record<string, unknown>) ?? {
      type: 'object',
      description: `Output for operation: ${ctx.operationDescription}`,
    };

    return {
      systemPrompt: this.buildSystemPrompt(ctx),
      fewShotExamples,
      outputSchema,
      model: `${provider}/${model}`,
      temperature,
      maxTokens: (meta['maxTokens'] as number) ?? 2048,
      dynamicSlots,
      promptTemplate: (meta['promptTemplate'] as string) ??
        `You are performing: ${ctx.operationDescription}.\nInput: {{user_data}}`,
    };
  }

  /**
   * Construct a precise system prompt from optimizer context (spec §3.4).
   * A well-crafted static system prompt is the single biggest factor
   * in reducing hallucinations.
   */
  private buildSystemPrompt(ctx: LLMContext): string {
    const lines: string[] = [
      `You are a deterministic processing component in an automated workflow.`,
      `Your task: ${ctx.operationDescription}`,
      ``,
      `Rules:`,
      `- Respond ONLY with valid JSON matching the output_schema.`,
      `- Do NOT add explanations or markdown outside the JSON.`,
      `- If you cannot perform the task, return {"error": "reason"}.`,
      `- Never hallucinate data that is not present in the input.`,
    ];

    if (ctx.workflowName) {
      lines.push(``, `Workflow context: ${ctx.workflowName}`);
    }

    return lines.join('\n');
  }

  /**
   * Build relationship graph from semantic tree variables.
   */
  private buildRelationships(tree: SemanticTree, context: SemanticsData): void {
    if (!tree?.variables) return;
    for (const [, variable] of tree.variables.entries()) {
      if (variable?.name) {
        context.relationships[variable.name] = variable.producedBy
          ? [variable.producedBy]
          : [];
      }
    }
  }
}
