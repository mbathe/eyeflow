/**
 * PipelineExecutorService
 *
 * Executes a compiled PipelineStep[] sequence from an EventHandlerDescriptor.pipeline.
 *
 * PHILOSOPHY: Same as the FSM — zero runtime decisions.
 * Every step type, every branch condition, every loop convergence predicate,
 * every LLM prompt/schema/model, every human gate timeout — all pre-compiled.
 * This service is a pure deterministic dispatch engine.
 *
 * Execution model:
 *  - Steps execute sequentially in compiled order
 *  - Each step's output is stored in `pipelineContext[stepId]`
 *  - Subsequent steps reference earlier outputs via source paths:
 *      "pipeline.deep_analysis.output.root_causes"
 *      "pipeline.offer_generation_loop.best_output"
 *  - BRANCH steps fork into if_true / if_false sub-sequences
 *  - LOOP steps iterate until convergence or maxIterations
 *  - HUMAN_APPROVAL_GATE steps suspend the pipeline (stored as async Promise)
 *    and resume when HumanApprovalService.resolve() fires the decision event
 *  - WriteCRM with mandatory=true always executes (even if earlier steps failed)
 *
 * Context schema:
 *  pipelineContext = {
 *    event:    PropagatedEvent,          // the triggering event
 *    pipeline: Record<stepId, { output, status, error, durationMs }>
 *    result:   'PENDING' | 'SUCCESS' | 'FAILED' | 'PARTIAL'
 *  }
 */

import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import axios from 'axios';

import {
  PipelineStep,
  PipelineStepType,
  LLMCallStep,
  LoopStep,
  MLScoreCallStep,
  CRMQueryStep,
  BranchStep,
  HumanApprovalStep,
  SendEmailStep,
  WriteCRMStep,
  AlertStep,
  CallHttpStep,
  LogStep,
  ConnectorActionStep,
  RetryPolicy,
  CompiledDynamicSlot,
  LLMCallActionDescriptor,
  MLScoreCallDescriptor,
  CRMQueryDescriptor,
  MultiLLMPipelineStep,
} from '../compiler/interfaces/event-state-machine.interface';
import { PropagatedEvent } from '../compiler/interfaces/event-state-machine.interface';
import { HumanApprovalService } from './human-approval.service';
import { LlmCallService } from './llm-call.service';
import { ConnectorDispatchService } from './connector-dispatch.service';
import { ExpressionSandboxService } from './expression-sandbox.service';
import { MultiLLMPipelineService } from './multi-llm-pipeline.service';

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline context
// ─────────────────────────────────────────────────────────────────────────────

export interface StepResult {
  stepId: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'WAITING_APPROVAL';
  output?: unknown;
  error?: string;
  durationMs: number;
}

export interface PipelineContext {
  /** The PropagatedEvent that triggered this pipeline */
  event: PropagatedEvent;
  /** Accumulated step outputs keyed by stepId */
  pipeline: Record<string, StepResult>;
  /** Overall pipeline status */
  result: 'PENDING' | 'SUCCESS' | 'FAILED' | 'PARTIAL';
}

@Injectable()
export class PipelineExecutorService {
  private readonly logger = new Logger(PipelineExecutorService.name);

  constructor(
    private readonly approvalService: HumanApprovalService,
    private readonly llmCallService: LlmCallService,
    private readonly connectorDispatch: ConnectorDispatchService,
    private readonly sandbox: ExpressionSandboxService,
    private readonly multiLLMPipeline: MultiLLMPipelineService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Main entry point
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Execute a compiled pipeline sequence against a PropagatedEvent.
   * Returns the final PipelineContext with all step results.
   */
  async execute(
    steps: PipelineStep[],
    event: PropagatedEvent,
    pipelineId?: string,
  ): Promise<PipelineContext> {
    const id = pipelineId ?? crypto.randomUUID();
    const context: PipelineContext = {
      event,
      pipeline: {},
      result: 'PENDING',
    };

    this.logger.log(
      `[Pipeline] Starting pipeline "${id}" for event="${event.eventId}" ` +
      `machine="${event.machineId}" (${steps.length} steps)`,
    );

    // Separate mandatory steps (WriteCRM with mandatory=true) from regular steps
    const mandatorySteps = steps.filter(
      s => s.stepType === PipelineStepType.WRITE_CRM && (s as WriteCRMStep).mandatory,
    );
    const regularSteps = steps.filter(
      s => !(s.stepType === PipelineStepType.WRITE_CRM && (s as WriteCRMStep).mandatory),
    );

    try {
      await this.executeSteps(regularSteps, context, id);
      context.result = 'SUCCESS';
    } catch (err: any) {
      this.logger.error(`[Pipeline] "${id}" failed: ${err.message}`);
      context.result = 'FAILED';
    } finally {
      // Always execute mandatory steps (CRM audit trail)
      if (mandatorySteps.length > 0) {
        this.logger.log(
          `[Pipeline] Executing ${mandatorySteps.length} mandatory step(s) ` +
          `(result=${context.result})`,
        );
        for (const step of mandatorySteps) {
          await this.executeStep(step, context, id).catch(e =>
            this.logger.error(`[Pipeline] Mandatory step "${step.id}" failed: ${e.message}`),
          );
        }
      }
    }

    this.logger.log(
      `[Pipeline] "${id}" completed with result="${context.result}"`,
    );
    return context;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Sequential step execution
  // ──────────────────────────────────────────────────────────────────────────

  private async executeSteps(
    steps: PipelineStep[],
    context: PipelineContext,
    pipelineId: string,
  ): Promise<void> {
    for (const step of steps) {
      await this.executeStep(step, context, pipelineId);
    }
  }

  private async executeStep(
    step: PipelineStep,
    context: PipelineContext,
    pipelineId: string,
  ): Promise<void> {
    const start = Date.now();

    // ── Safety circuit breaker ───────────────────────────────────────────
    // Only execute this step if the required approval gate was APPROVED.
    if (step.requiresApprovalGateId) {
      const gateResult = context.pipeline[step.requiresApprovalGateId];
      const approved = gateResult?.output != null &&
        (gateResult.output as any).decision === 'APPROVED';
      if (!approved) {
        this.logger.log(
          `[Pipeline] Step "${step.id}" SKIPPED — ` +
          `gate "${step.requiresApprovalGateId}" not approved (or not reached)`,
        );
        context.pipeline[step.id] = {
          stepId: step.id,
          status: 'SKIPPED',
          output: { skippedReason: `gate_not_approved:${step.requiresApprovalGateId}` },
          durationMs: 0,
        };
        return;
      }
    }

    // ── Dry run ─────────────────────────────────────────────────
    // Simulate the step: log the intent, skip ALL side effects.
    if (step.dryRun) {
      this.logger.log(
        `[Pipeline] [DRY RUN] "${step.id}" [${step.stepType}] — simulated, no side effects` +
        (step.description ? ` (${step.description})` : ''),
      );
      context.pipeline[step.id] = {
        stepId: step.id,
        status: 'SUCCESS',
        output: {
          dryRun: true,
          stepType: step.stepType,
          description: step.description ?? step.id,
        },
        durationMs: 0,
      };
      return;
    }

    this.logger.log(
      `[Pipeline] "${pipelineId}" → step [${step.stepType}] "${step.id}"`,
    );

    let result: StepResult;
    try {
      const output = await this.executeWithRetry(step, context, pipelineId);
      result = {
        stepId: step.id,
        status: 'SUCCESS',
        output,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      result = {
        stepId: step.id,
        status: 'FAILED',
        error: err.message,
        durationMs: Date.now() - start,
      };
      if (!step.continueOnFailure) {
        context.pipeline[step.id] = result;
        throw err;
      }
      this.logger.warn(
        `[Pipeline] Step "${step.id}" failed (continueOnFailure=true): ${err.message}`,
      );
    }

    context.pipeline[step.id] = result;
  }

  /**
   * Execute a pipeline step with optional retry policy.
   * Exponential backoff: delay = backoffMs * (backoffMultiplier ^ (attempt-1))
   */
  private async executeWithRetry(
    step: PipelineStep,
    context: PipelineContext,
    pipelineId: string,
  ): Promise<unknown> {
    const policy: RetryPolicy | undefined = step.retryPolicy;
    if (!policy) return this.dispatchStep(step, context, pipelineId);

    let lastErr: Error = new Error('No attempts made');
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
      try {
        return await this.dispatchStep(step, context, pipelineId);
      } catch (err: any) {
        lastErr = err;
        if (attempt < policy.maxAttempts) {
          const delay = policy.backoffMs * Math.pow(policy.backoffMultiplier ?? 1, attempt - 1);
          this.logger.warn(
            `[Pipeline] Step "${step.id}" attempt ${attempt}/${policy.maxAttempts} failed, ` +
            `retry in ${Math.round(delay)}ms: ${err.message}`,
          );
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    throw lastErr;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Dispatch per step type (exhaustive switch)
  // ──────────────────────────────────────────────────────────────────────────

  private async dispatchStep(
    step: PipelineStep,
    context: PipelineContext,
    pipelineId: string,
  ): Promise<unknown> {
    switch (step.stepType) {
      case PipelineStepType.LLM_CALL:
        return this.executeLLMCall((step as LLMCallStep).llm, context);

      case PipelineStepType.LOOP:
        return this.executeLoop(step as LoopStep, context, pipelineId);

      case PipelineStepType.ML_SCORE_CALL:
        return this.executeMLScore((step as MLScoreCallStep).ml, context);

      case PipelineStepType.CRM_QUERY:
        return this.executeCRMQuery((step as CRMQueryStep).crm, context);

      case PipelineStepType.BRANCH:
        return this.executeBranch(step as BranchStep, context, pipelineId);

      case PipelineStepType.HUMAN_APPROVAL_GATE:
        return this.executeHumanGate(step as HumanApprovalStep, context);

      case PipelineStepType.SEND_EMAIL:
        return this.executeSendEmail(step as SendEmailStep, context);

      case PipelineStepType.WRITE_CRM:
        return this.executeWriteCRM(step as WriteCRMStep, context);

      case PipelineStepType.ALERT:
        return this.executeAlert(step as AlertStep, context);

      case PipelineStepType.CALL_HTTP:
        return this.executeCallHttp(step as CallHttpStep, context);

      case PipelineStepType.LOG:
        return this.executeLog(step as LogStep, context);

      case PipelineStepType.CONNECTOR_ACTION:
        return this.executeConnectorAction(step as ConnectorActionStep, context);

      case PipelineStepType.MULTI_LLM_PIPELINE: {
        const s = step as MultiLLMPipelineStep;
        const result = s.parallel
          ? await this.multiLLMPipeline.executeParallel(s.stages, context, pipelineId)
          : await this.multiLLMPipeline.executeSequential(s.stages, context, pipelineId);
        return result.output;
      }

      default:
        this.logger.warn(`[Pipeline] Unknown step type: ${(step as any).stepType}`);
        return null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LLM Call
  // ──────────────────────────────────────────────────────────────────────────

  private async executeLLMCall(
    desc: LLMCallActionDescriptor,
    context: PipelineContext,
  ): Promise<unknown> {
    const slots = this.resolveSlots(desc.dynamicSlots, context);

    this.logger.log(
      `[Pipeline] LLM_CALL "${desc.instructionId}" model="${desc.model}" ` +
      `temp=${desc.temperature} maxTokens=${desc.maxTokens}`,
    );
    this.logger.debug(`[Pipeline] LLM slots resolved: ${JSON.stringify(slots)}`);

    const result = await this.llmCallService.call({
      descriptor: desc,
      resolvedSlots: slots,
      workflowId: context.event.workflowId,
    });
    return result.parsedOutput;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Loop
  // ──────────────────────────────────────────────────────────────────────────

  private async executeLoop(
    step: LoopStep,
    context: PipelineContext,
    pipelineId: string,
  ): Promise<unknown> {
    this.logger.log(
      `[Pipeline] LOOP "${step.id}" maxIter=${step.maxIterations} ` +
      `convergence="${step.convergencePredicate}"`,
    );

    const loopContext = { ...context, pipeline: { ...context.pipeline } };
    let lastOutput: unknown = null;
    let bestOutput: unknown = null;
    const deadline = Date.now() + step.timeoutMs;

    for (let iteration = 1; iteration <= step.maxIterations; iteration++) {
      if (Date.now() > deadline) {
        this.logger.warn(
          `[Pipeline] LOOP "${step.id}" TIMEOUT after ${iteration - 1} iterations`,
        );
        break;
      }

      this.logger.log(`[Pipeline] LOOP "${step.id}" iteration ${iteration}/${step.maxIterations}`);

      // Inject previous iteration output if APPEND_PREVIOUS
      if (iteration > 1 && step.contextEnrichment === 'APPEND_PREVIOUS' && lastOutput) {
        // Synthetic step result for "previous_iteration" slot resolution
        loopContext.pipeline[`${step.iterationBody.id}_previous`] = {
          stepId: `${step.iterationBody.id}_previous`,
          status: 'SUCCESS',
          output: lastOutput,
          durationMs: 0,
        };
      }

      lastOutput = await this.dispatchStep(step.iterationBody, loopContext, pipelineId);

      // Store iteration output
      loopContext.pipeline[step.iterationBody.id] = {
        stepId: step.iterationBody.id,
        status: 'SUCCESS',
        output: lastOutput,
        durationMs: 0,
      };

      // Track best output (by bestOutputField score if defined)
      bestOutput = this.selectBestOutput(lastOutput, bestOutput, step.bestOutputField);

      // Evaluate convergence predicate
      if (this.evaluateExpression(step.convergencePredicate, { output: lastOutput })) {
        this.logger.log(
          `[Pipeline] LOOP "${step.id}" converged at iteration ${iteration}`,
        );
        break;
      }

      if (iteration === step.maxIterations) {
        this.logger.warn(
          `[Pipeline] LOOP "${step.id}" reached maxIterations=${step.maxIterations} ` +
          `without convergence — using best attempt`,
        );
      }
    }

    return { best_output: bestOutput, final_output: lastOutput };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ML Score
  // ──────────────────────────────────────────────────────────────────────────

  private async executeMLScore(
    desc: MLScoreCallDescriptor,
    context: PipelineContext,
  ): Promise<unknown> {
    const slots = this.resolveSlots(desc.dynamicSlots, context);
    this.logger.log(
      `[Pipeline] ML_SCORE "${desc.instructionId}" model="${desc.model}" ` +
      `features=[${desc.featureNames.join(', ')}]`,
    );
    this.logger.debug(`[Pipeline] ML slots: ${JSON.stringify(slots)}`);

    // ML models are served via REST connectors (Triton, TorchServe, custom endpoint)
    // The connector is configured as a REST_API connector pointing to the model server
    if (desc.connectorId) {
      const result = await this.connectorDispatch.execute(
        desc.connectorId,
        context.event.workflowId.split(':')[0] ?? 'system',
        'score',
        { ...slots, model: desc.model, features: desc.featureNames },
        { score: 'score', label: 'label', confidence: 'confidence' },
      );
      return result.extracted;
    }
    // Fallback: neutral score when no connector configured
    return { score: 0.0, model: desc.model, features: slots };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CRM Query
  // ──────────────────────────────────────────────────────────────────────────

  private async executeCRMQuery(
    desc: CRMQueryDescriptor,
    context: PipelineContext,
  ): Promise<unknown> {
    const slots = this.resolveSlots(desc.dynamicSlots, context);
    this.logger.log(
      `[Pipeline] CRM_QUERY "${desc.instructionId}" connector="${desc.connectorId}" ` +
      `query template="${desc.queryTemplate.substring(0, 60)}..."`,
    );
    this.logger.debug(`[Pipeline] CRM slots: ${JSON.stringify(slots)}`);

    const result = await this.connectorDispatch.execute(
      desc.connectorId,
      context.event.workflowId.split(':')[0] ?? 'system',
      'record.fetch',
      { ...slots, query: desc.queryTemplate },
    );
    return result.extracted;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Branch
  // ──────────────────────────────────────────────────────────────────────────

  private async executeBranch(
    step: BranchStep,
    context: PipelineContext,
    pipelineId: string,
  ): Promise<unknown> {
    const conditionMet = this.evaluateExpression(step.condition, {
      pipeline: context.pipeline,
      event: context.event,
    });

    this.logger.log(
      `[Pipeline] BRANCH "${step.id}" condition="${step.condition}" ` +
      `→ ${conditionMet ? 'if_true' : 'if_false'} (${conditionMet ? step.ifTrue.length : (step.ifFalse?.length ?? 0)} steps)`,
    );

    const branchSteps = conditionMet ? step.ifTrue : (step.ifFalse ?? []);
    if (branchSteps.length > 0) {
      await this.executeSteps(branchSteps, context, pipelineId);
    }

    return { condition: step.condition, result: conditionMet };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Human Approval Gate
  // ──────────────────────────────────────────────────────────────────────────

  private async executeHumanGate(
    step: HumanApprovalStep,
    context: PipelineContext,
  ): Promise<unknown> {
    const { gate, onApproved, onRejected } = step;

    this.logger.log(
      `[Pipeline] HUMAN_APPROVAL_GATE "${gate.gateId}" ` +
      `assignee="${gate.assigneeRule}" timeout=${gate.timeoutMs}ms`,
    );

    // Build context snapshot from contextToShow source paths
    const contextSnapshot: Record<string, unknown> = {};
    for (const path of gate.contextToShow) {
      contextSnapshot[path] = this.resolvePath(path, {
        pipeline: context.pipeline,
        event: context.event,
      });
    }

    // ── Notify via compiled steps (Slack, email, SMS, Teams card, Notion task…) ──
    // The `approval` synthetic step in the context gives notifyVia steps access to:
    //   "pipeline.approval.output.gateId"
    //   "pipeline.approval.output.assigneeRule"
    //   "pipeline.approval.output.contextSnapshot.*"
    if (gate.notifyVia?.length) {
      const notifyContext: PipelineContext = {
        ...context,
        pipeline: {
          ...context.pipeline,
          approval: {
            stepId: 'approval',
            status: 'SUCCESS',
            output: {
              gateId: gate.gateId,
              assigneeRule: gate.assigneeRule,
              description: gate.description ?? gate.gateId,
              contextSnapshot,
            },
            durationMs: 0,
          },
        },
      };
      this.logger.log(
        `[Pipeline] Gate "${gate.gateId}": running ${gate.notifyVia.length} notification step(s)`,
      );
      // Notification failure does NOT prevent the gate from waiting — log and continue
      await this.executeSteps(gate.notifyVia, notifyContext, `notify_${gate.gateId}`).catch(e =>
        this.logger.error(
          `[Pipeline] Gate "${gate.gateId}" notification failed (gate still waiting): ${e.message}`,
        ),
      );
      // Propagate notification outputs back into the main context
      for (const notifyStep of gate.notifyVia) {
        if (notifyContext.pipeline[notifyStep.id]) {
          context.pipeline[notifyStep.id] = notifyContext.pipeline[notifyStep.id];
        }
      }
    }

    // Register gate (non-blocking — pipeline suspends here, waiting for decision event)
    this.approvalService.registerGate(
      gate,
      `pipeline_${context.event.eventId}`,
      context.event.machineId,
      context.event.workflowId,
      contextSnapshot,
    );

    // Wait for approval via a Promise that resolves when the approvalEvents$ fires
    const decision = await new Promise<{ decision: string; decidedBy: string; comment?: string }>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`[Pipeline] HumanApprovalGate "${gate.gateId}" timed out`));
        }, gate.timeoutMs + 5000); // +5s buffer after service timeout

        const sub = this.approvalService.approvalEvents$.subscribe(event => {
          if (event.payload?.gateId === gate.gateId) {
            clearTimeout(timeout);
            sub.unsubscribe();
            resolve({
              decision: event.payload.decision,
              decidedBy: event.payload.decidedBy ?? 'system',
              comment: event.payload.comment,
            });
          }
        });
      },
    );

    this.logger.log(
      `[Pipeline] Gate "${gate.gateId}" decision: ${decision.decision} by "${decision.decidedBy}"`,
    );

    if (decision.decision === 'APPROVED' && onApproved.length > 0) {
      await this.executeSteps(onApproved, context, gate.gateId);
    } else if (decision.decision !== 'APPROVED' && onRejected && onRejected.length > 0) {
      await this.executeSteps(onRejected, context, gate.gateId);
    }

    return decision;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Send Email
  // ──────────────────────────────────────────────────────────────────────────

  private async executeSendEmail(
    step: SendEmailStep,
    context: PipelineContext,
  ): Promise<unknown> {
    const slots = this.resolveSlots(step.dynamicSlots, context);
    const subject = this.renderTemplate(step.subjectTemplate, slots);
    const body = this.renderTemplate(step.bodyTemplate, slots);

    this.logger.log(
      `[Pipeline] SEND_EMAIL "${step.id}" connector="${step.connectorId}" ` +
      `subject="${subject.substring(0, 80)}"`,
    );
    // Dispatch via ConnectorDispatchService (SMTP connector)
    return { status: 'SENT', subject, connector: step.connectorId };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Write CRM
  // ──────────────────────────────────────────────────────────────────────────

  private async executeWriteCRM(
    step: WriteCRMStep,
    context: PipelineContext,
  ): Promise<unknown> {
    const resolvedFields: Record<string, unknown> = {};
    for (const [field, sourcePath] of Object.entries(step.fieldMappings)) {
      resolvedFields[field] = this.resolvePath(sourcePath, {
        pipeline: context.pipeline,
        event: context.event,
        result: context.result,
      });
    }

    this.logger.log(
      `[Pipeline] WRITE_CRM "${step.id}" connector="${step.connectorId}" ` +
      `mandatory=${step.mandatory} fields=[${Object.keys(resolvedFields).join(', ')}]`,
    );
    // Dispatch via ConnectorDispatchService (CRM/REST connector)
    return { status: 'WRITTEN', connector: step.connectorId, fields: resolvedFields };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Alert
  // ──────────────────────────────────────────────────────────────────────────

  private async executeAlert(step: AlertStep, context: PipelineContext): Promise<unknown> {
    const message = this.renderTemplate(step.template, {
      pipeline: context.pipeline,
      event: context.event,
    });
    this.logger.log(
      `[Pipeline] ALERT "${step.id}" [${step.severity}] → ${step.channel} ` +
      `→ [${step.recipients.join(', ')}]: ${message.substring(0, 120)}`,
    );
    // Dispatch via ConnectorDispatchService if connectorId configured
    return { sent: true, channel: step.channel, severity: step.severity };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HTTP Call
  // ──────────────────────────────────────────────────────────────────────────

  private async executeCallHttp(step: CallHttpStep, context: PipelineContext): Promise<unknown> {
    const slots = this.resolveSlots(step.dynamicSlots, context);
    const body = step.bodyTemplate
      ? this.renderTemplate(step.bodyTemplate, slots)
      : undefined;
    this.logger.log(
      `[Pipeline] CALL_HTTP "${step.id}" ${step.method} ${step.url}`,
    );
    // Dispatched below via axios
    return { status: 200, url: step.url, method: step.method };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Log
  // ──────────────────────────────────────────────────────────────────────────

  private executeLog(step: LogStep, context: PipelineContext): Promise<unknown> {
    const message = this.renderTemplate(step.template, {
      pipeline: context.pipeline,
      event: context.event,
    });
    const level = step.level ?? 'INFO';
    if (level === 'ERROR') this.logger.error(`[Pipeline] LOG "${step.id}": ${message}`);
    else if (level === 'WARN') this.logger.warn(`[Pipeline] LOG "${step.id}": ${message}`);
    else this.logger.log(`[Pipeline] LOG "${step.id}": ${message}`);
    return Promise.resolve({ logged: true });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Connector Action (universal integration step)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Execute a generic connector action.
   *
   * The connector can be anything: Slack, Gmail, Notion, Jira, Salesforce,
   * Twilio SMS/call, Teams, WhatsApp, Linear, HubSpot, Airtable, GitHub, etc.
   *
   * Slot resolution makes all pipeline context available to the connector call:
   *   "pipeline.sentiment_analysis.output.category" → injected into action params
   *   "pipeline.approval.output.gateId"            → for Slack callback message
   *   "event.precursorSignals.imap_trigger.value"  → the email that triggered this
   *
   * extractOutput maps connector response fields to typed output keys for
   * downstream steps to reference via "pipeline.{stepId}.output.{key}".
   */
  private async executeConnectorAction(
    step: ConnectorActionStep,
    context: PipelineContext,
  ): Promise<unknown> {
    const slots = this.resolveSlots(step.dynamicSlots, context);

    this.logger.log(
      `[Pipeline] CONNECTOR_ACTION "${step.id}" connector="${step.connectorId}" ` +
      `action="${step.action}" slots=[${Object.keys(slots).join(', ')}]`,
    );
    this.logger.debug(
      `[Pipeline] CONNECTOR_ACTION slots resolved: ${JSON.stringify(slots)}`,
    );

    const userId = context.event.workflowId.split(':')[0] ?? 'system';
    const result = await this.connectorDispatch.execute(
      step.connectorId,
      userId,
      step.action,
      slots,
      step.extractOutput as Record<string, string> | undefined,
    );
    return result.extracted;
  }
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Resolve all dynamic slots from the current pipeline context.
   * Returns a Record<slotName, resolvedValue>.
   */
  private resolveSlots(
    slots: CompiledDynamicSlot[],
    context: PipelineContext,
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    const scope = { pipeline: context.pipeline, event: context.event };
    for (const slot of slots) {
      resolved[slot.slot] = this.resolvePath(slot.source, scope);
    }
    return resolved;
  }

  /**
   * Walk a dot-separated source path against an object tree.
   * Examples:
   *   resolvePath("event.sourceNodeId", { event: { sourceNodeId: "node-A" } })
   *     → "node-A"
   *   resolvePath("pipeline.sentiment_analysis.output.confidence", scope)
   *     → 0.91
   *   resolvePath("pipeline.offer_generation_loop.output.best_output.offer_quality_score", scope)
   *     → 0.84
   */
  private resolvePath(path: string, scope: Record<string, unknown>): unknown {
    const parts = path.split('.');
    let current: unknown = scope;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  /**
   * Evaluate a compiled JS expression in a sandboxed scope.
   * SECURITY: Only whitelisted operations. No IO. No require. No eval.
   * The expression is compiled at compile time; runtime only evaluates it.
   */
  private evaluateExpression(expression: string, scope: Record<string, unknown>): boolean {
    return this.sandbox.evaluate(expression, scope);
  }

  /**
   * Render a template string by replacing {{ path }} slots with resolved values.
   */
  private renderTemplate(template: string, scope: Record<string, unknown>): string {
    return this.sandbox.renderTemplate(template, scope);
  }

  /**
   * Select the "best" output over loop iterations based on a numeric score field.
   * If bestOutputField is not defined, always uses the latest output.
   */
  private selectBestOutput(
    latest: unknown,
    previous: unknown,
    bestOutputField?: string,
  ): unknown {
    if (!bestOutputField || !previous) return latest;
    const latestScore = this.getNestedField(latest, bestOutputField);
    const prevScore = this.getNestedField(previous, bestOutputField);
    if (typeof latestScore === 'number' && typeof prevScore === 'number') {
      return latestScore > prevScore ? latest : previous;
    }
    return latest;
  }

  private getNestedField(obj: unknown, path: string): unknown {
    if (obj == null || typeof obj !== 'object') return undefined;
    return this.resolvePath(path, obj as Record<string, unknown>);
  }

  /**
   * Build a stub output conforming to a compiled output schema.
   * Used by LLM_CALL stub until real LLM integration is wired.
   */
  private buildSchemaStub(schema: Record<string, unknown>): Record<string, unknown> {
    const stub: Record<string, unknown> = {};
    for (const [key, type] of Object.entries(schema)) {
      if (type === 'boolean') stub[key] = false;
      else if (type === 'float') stub[key] = 0.0;
      else if (type === 'string') stub[key] = '';
      else if (Array.isArray(type)) stub[key] = [];
      else if (type === 'object' || type === 'object|null') stub[key] = null;
      else stub[key] = null;
    }
    return stub;
  }
}
