/**
 * MultiLLMPipelineService — spec §10.2
 *
 * Executes a compiled multi-LLM pipeline where each stage's validated output
 * is injected into the next stage's dynamic slots before execution.
 *
 * Architecture (spec §10.2):
 *   Stage 1 (Claude Opus)   → [output_schema validation]
 *   ↓ previousStageOutput slot injected
 *   Stage 2 (GPT-4o Vision) → [output_schema validation]
 *   ↓ previousStageOutput slot injected
 *   Stage N (domain model)  → step final output
 *
 * Guarantees:
 *   – Static system_prompt, few_shots, output_schema compiled at compile time
 *   – Only dynamic_slots resolved at runtime (event payload, Vault, previous stage)
 *   – Type validation enforced between stages (schema mismatch = fallback)
 *   – Parallel mode supported: all stages run concurrently (fan-out)
 */

import { Injectable, Logger } from '@nestjs/common';
import * as Ajv from 'ajv';
import { LlmCallService } from './llm-call.service';
import {
  MultiLLMStage,
  CompiledDynamicSlot,
} from '../compiler/interfaces/event-state-machine.interface';
import type { PipelineContext } from './pipeline-executor.service';

// ── Stage result ──────────────────────────────────────────────────────────────

export interface MultiLLMStageResult {
  stageId: string;
  label?: string;
  model: string;
  output: unknown;
  durationMs: number;
  validationPassed: boolean;
  error?: string;
}

export interface MultiLLMPipelineResult {
  /** Results for each stage in execution order */
  stages: MultiLLMStageResult[];
  /** Final stage output (or merged object in parallel mode) */
  output: unknown;
  totalDurationMs: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class MultiLLMPipelineService {
  private readonly logger = new Logger(MultiLLMPipelineService.name);
  private readonly ajv = new (Ajv as any).default({ strict: false });

  constructor(private readonly llmCallService: LlmCallService) {}

  // ── Sequential pipeline ───────────────────────────────────────────────────

  /**
   * Execute a sequential multi-LLM pipeline.
   *
   * Each stage's output is validated against its `outputSchema` then injected
   * as `previousStageOutput` into the next stage's dynamic slots.
   */
  async executeSequential(
    stages: MultiLLMStage[],
    context: PipelineContext,
    workflowId: string,
  ): Promise<MultiLLMPipelineResult> {
    const totalStart = Date.now();
    const results: MultiLLMStageResult[] = [];
    let previousOutput: unknown = null;
    const scope = { pipeline: context.pipeline, event: context.event };

    this.logger.log(
      `[MultiLLM] Starting sequential pipeline: ${stages.length} stages ` +
      `for workflow="${workflowId}"`
    );

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i]!;
      const stageStart = Date.now();

      this.logger.log(
        `[MultiLLM] Stage ${i + 1}/${stages.length}: "${stage.stageId}" ` +
        `model="${stage.model}" provider="${stage.provider}"`
      );

      try {
        // Resolve slots, injecting previous stage output where applicable
        const resolvedSlots = this.resolveSlots(
          stage.dynamicSlots,
          scope,
          previousOutput,
        );

        // Build descriptor for LlmCallService
        const descriptor = this.buildDescriptor(stage);

        const llmResult = await this.llmCallService.call({
          descriptor,
          resolvedSlots,
          workflowId,
        });

        const stageOutput = llmResult.parsedOutput;
        const durationMs = Date.now() - stageStart;

        // Validate output against stage's schema
        const { valid, error: validationError } = this.validateOutput(
          stageOutput,
          stage.outputSchema,
          stage.stageId,
        );

        if (!valid) {
          const fallback = stage.onValidationFailure ?? 'FAIL_SAFE';
          this.logger.warn(
            `[MultiLLM] Stage "${stage.stageId}" output failed schema validation ` +
            `— applying ${fallback}: ${validationError}`
          );

          results.push({
            stageId: stage.stageId,
            label: stage.label,
            model: stage.model,
            output: stageOutput,
            durationMs,
            validationPassed: false,
            error: validationError,
          });

          if (fallback === 'FAIL_SAFE') {
            // Use null as safe output and continue
            previousOutput = null;
            continue;
          } else {
            // Abort pipeline
            throw new Error(
              `MultiLLM stage "${stage.stageId}" validation failed: ${validationError}`
            );
          }
        }

        results.push({
          stageId: stage.stageId,
          label: stage.label,
          model: stage.model,
          output: stageOutput,
          durationMs,
          validationPassed: true,
        });

        previousOutput = stageOutput;

        this.logger.log(
          `[MultiLLM] Stage "${stage.stageId}" completed in ${durationMs}ms ✓`
        );

      } catch (err: any) {
        const durationMs = Date.now() - stageStart;
        const fallback = stage.onTimeout ?? 'FAIL_SAFE';

        this.logger.error(
          `[MultiLLM] Stage "${stage.stageId}" failed: ${err.message} ` +
          `— applying ${fallback}`
        );

        results.push({
          stageId: stage.stageId,
          label: stage.label,
          model: stage.model,
          output: null,
          durationMs,
          validationPassed: false,
          error: err.message,
        });

        if (fallback === 'FAIL_SAFE') {
          previousOutput = null;
          // Continue to next stage with null context
          continue;
        } else {
          throw err;
        }
      }
    }

    return {
      stages: results,
      output: previousOutput,
      totalDurationMs: Date.now() - totalStart,
    };
  }

  // ── Parallel pipeline (fan-out / fan-in) ──────────────────────────────────

  /**
   * Execute all stages in parallel. Output is a merged object keyed by stageId.
   * Useful when stages are independent analyses of the same input.
   */
  async executeParallel(
    stages: MultiLLMStage[],
    context: PipelineContext,
    workflowId: string,
  ): Promise<MultiLLMPipelineResult> {
    const totalStart = Date.now();

    this.logger.log(
      `[MultiLLM] Starting parallel pipeline: ${stages.length} stages ` +
      `for workflow="${workflowId}"`
    );

    const scope = { pipeline: context.pipeline, event: context.event };
    const stagePromises = stages.map(async (stage): Promise<MultiLLMStageResult> => {
      const stageStart = Date.now();
      try {
        const resolvedSlots = this.resolveSlots(stage.dynamicSlots, scope, null);
        const descriptor = this.buildDescriptor(stage);

        const llmResult = await this.llmCallService.call({
          descriptor,
          resolvedSlots,
          workflowId,
        });

        const { valid, error: validationError } = this.validateOutput(
          llmResult.parsedOutput,
          stage.outputSchema,
          stage.stageId,
        );

        return {
          stageId: stage.stageId,
          label: stage.label,
          model: stage.model,
          output: llmResult.parsedOutput,
          durationMs: Date.now() - stageStart,
          validationPassed: valid,
          error: validationError,
        };
      } catch (err: any) {
        return {
          stageId: stage.stageId,
          label: stage.label,
          model: stage.model,
          output: null,
          durationMs: Date.now() - stageStart,
          validationPassed: false,
          error: err.message,
        };
      }
    });

    const results = await Promise.all(stagePromises);

    // Merge outputs by stageId
    const merged: Record<string, unknown> = {};
    for (const r of results) {
      merged[r.stageId] = r.output;
    }

    this.logger.log(
      `[MultiLLM] Parallel pipeline completed in ${Date.now() - totalStart}ms`
    );

    return {
      stages: results,
      output: merged,
      totalDurationMs: Date.now() - totalStart,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Resolve slot values using the same dot-path convention as PipelineExecutorService.
   * `source` is walked against `{ pipeline, event }` scope.
   *
   * Special case: if `source` equals `'previousStageOutput'` the value is taken
   * from `previousOutput` argument (injected by the sequential caller).
   */
  private resolveSlots(
    slots: CompiledDynamicSlot[],
    scope: { pipeline: unknown; event: unknown },
    previousOutput: unknown,
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    for (const slot of slots) {
      if (slot.source === 'previousStageOutput') {
        resolved[slot.slot] = previousOutput;
      } else {
        resolved[slot.slot] = this.dotGet(scope as any, slot.source);
      }
    }
    return resolved;
  }

  /**
   * Build an LLMCallActionDescriptor-compatible object from a MultiLLMStage.
   */
  private buildDescriptor(stage: MultiLLMStage): any {
    return {
      instructionId: stage.stageId,
      model:         stage.model,
      temperature:   stage.temperature,
      maxTokens:     stage.maxTokens,
      systemPrompt:  stage.systemPrompt,
      fewShots:      stage.fewShots ?? [],
      dynamicSlots:  stage.dynamicSlots,
      outputSchema:  stage.outputSchema,
      timeoutMs:     stage.timeoutMs ?? 30_000,
      onTimeout:     stage.onTimeout,
    };
  }

  /**
   * Validate output against a compiled output schema.
   * Returns `{ valid: true }` or `{ valid: false, error: string }`.
   */
  private validateOutput(
    output: unknown,
    schema: any,
    stageId: string,
  ): { valid: boolean; error?: string } {
    if (!schema || typeof schema !== 'object') {
      return { valid: true }; // No schema = accept any
    }

    try {
      const validate = this.ajv.compile(schema.jsonSchema ?? schema);
      const valid = validate(output);
      if (!valid) {
        const errMsg = this.ajv.errorsText(validate.errors);
        return { valid: false, error: `Stage "${stageId}" schema: ${errMsg}` };
      }
      return { valid: true };
    } catch (err: any) {
      this.logger.warn(
        `[MultiLLM] Schema compile error for stage "${stageId}": ${err.message}`
      );
      return { valid: true }; // Fail open on compile error
    }
  }

  /** Walk a dot-separated path against an object (same as PipelineExecutorService.resolvePath). */
  private dotGet(obj: unknown, path: string): unknown {
    return path.split('.').reduce((acc: any, key) => acc?.[key], obj as any);
  }
}
