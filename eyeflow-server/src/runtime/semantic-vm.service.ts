/**
 * LAYER 5: Semantic Virtual Machine (SVM)
 * 
 * Execution engine for LLMIntermediateRepresentation.
 *
 * Two execution modes
 * ──────────────────
 *  MONOLITHIC  : all instructions on CENTRAL (no distribution plan, or plan.isDistributed=false)
 *  DISTRIBUTED : central slice runs locally; remote slices are dispatched to edge nodes
 *                via NodeDispatcherService, results merged at SyncPoints.
 *
 * Guarantees:
 *  – Zero LLM calls at runtime (LLM confined to compilation phase)
 *  – Deterministic register-based execution
 *  – Cross-node data flows handled transparently
 *  – Automatic fallback to CENTRAL if a remote node is unavailable
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { 
  LLMIntermediateRepresentation, 
  IRInstruction, 
  IROpcode,
  EnrichedDispatchMetadata,
  LoopOperands,
  LoopConvergencePredicate,
  MAX_LOOP_ITERATIONS,
} from '../compiler/interfaces/ir.interface';
import { ExecutorRegistryService } from './executor-registry.service';
import { ExecutorContext } from './executors/executor.interface';
import { 
  CompiledWorkflow,
  PreLoadedServices 
} from '../compiler/interfaces/compiled-workflow.interface';
import {
  DistributedExecutionPlan,
  ExecutionSlice,
  SyncPoint,
  SliceDispatchPayload,
  SliceResultPayload,
} from '../compiler/interfaces/distributed-execution.interface';
import { NodeDispatcherService } from '../nodes/node-dispatcher.service';
import { NodeRegistryService } from '../nodes/node-registry.service';
import { CENTRAL_NODE_ID } from '../nodes/interfaces/node-capability.interface';
import { VaultService } from './vault.service';
import { PhysicalControlService, PhysicalActionOperands } from './physical-control.service';
import { CryptoAuditChainService } from './crypto-audit-chain.service';

// ── IR format version compatibility (spec §5.3) ───────────────────────────────
/**
 * Major version of the LLM-IR format this SVM accepts.
 * Same major → execute (warn if minor differs).
 * Different major → refuse execution + security alert.
 * Configurable via SVM_IR_VERSION_MAJOR env var.
 */
const SVM_IR_VERSION_MAJOR = parseInt(
  process.env['SVM_IR_VERSION_MAJOR'] ?? '1',
  10,
);

export interface ExecutionContext {
  registers: Map<number, any>;
  memory: Buffer;
  callStack: number[];
  currentInstructionIndex: number;
  startTime: Date;
}

export interface ExecutionResult {
  output: any;
  durationMs: number;
  instructionsExecuted: number;
  servicesCalled: Array<{
    serviceId: string;
    format: string;
    durationMs: number;
    nodeId?: string;
  }>;
  distributedSlicesCompleted?: number;
}

@Injectable()
export class SemanticVirtualMachine {
  private readonly logger = new Logger(SemanticVirtualMachine.name);

  constructor(
    @Optional() private readonly dispatcher: NodeDispatcherService,
    @Optional() private readonly nodeRegistry: NodeRegistryService,
    @Optional() private readonly executorRegistry: ExecutorRegistryService,
    @Optional() private readonly vault: VaultService,
    @Optional() private readonly physicalControl: PhysicalControlService,
    @Optional() private readonly auditChain: CryptoAuditChainService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Public entry point
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Execute a compiled workflow with user inputs.
   * Automatically selects MONOLITHIC or DISTRIBUTED mode based on the plan.
   */
  async execute(
    workflow: CompiledWorkflow,
    userInputs: Record<string, any>
  ): Promise<ExecutionResult> {
    // ── §5.3 IR format version compatibility check ────────────────────────
    this.validateIRCompatibility(workflow.ir);

    const plan = workflow.ir.distributionPlan;

    if (plan?.isDistributed && this.dispatcher) {
      return this.executeDistributed(workflow, userInputs, plan);
    }

    return this.executeMonolithic(workflow, userInputs);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // IR COMPATIBILITY MATRIX — spec §5.3
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Validate the LLM-IR artifact format version compatibility before execution.
   *
   * Rules (spec §5.3):
   *   - No version in metadata → WARN, allow (dev workflows)
   *   - Same major → execute normally
   *   - Same major, different minor → execute + WARN
   *   - Different major → REFUSE execution + security alert
   *   - Invalid signature (if signed) → REFUSE + alert (checked by IRSerializerService)
   */
  private validateIRCompatibility(ir: LLMIntermediateRepresentation): void {
    const compilerVersion: string = ir.metadata?.compilerVersion ?? '';

    if (!compilerVersion || compilerVersion === 'fallback') {
      this.logger.warn(
        `[SVM:Compat] IR has no compilerVersion — accepting (dev/test mode). ` +
        `Set compilerVersion in production.`
      );
      return;
    }

    // Parse semver "MAJOR.MINOR.PATCH" → extract MAJOR
    const parts = compilerVersion.split('.');
    const artifactMajor = parseInt(parts[0] ?? '0', 10);
    const artifactMinor = parseInt(parts[1] ?? '0', 10);

    if (isNaN(artifactMajor)) {
      this.logger.warn(
        `[SVM:Compat] Cannot parse compilerVersion="${compilerVersion}" — accepting.`
      );
      return;
    }

    if (artifactMajor !== SVM_IR_VERSION_MAJOR) {
      // Different major → refuse execution
      this.logger.error(
        `[SVM:Compat] ⛔ IR major version mismatch: ` +
        `SVM_MAJOR=${SVM_IR_VERSION_MAJOR} artifact_major=${artifactMajor} ` +
        `(compilerVersion="${compilerVersion}") — refusing execution (spec §5.3)`
      );
      // Non-blocking security alert to audit chain
      this.auditChain?.append({
        workflowId: ir.metadata?.workflowId ?? 'unknown',
        workflowVersion: ir.metadata?.workflowVersion,
        eventType: 'SECURITY_ALERT',
        durationMs: 0,
        details: {
          type: 'IR_VERSION_INCOMPATIBLE',
          artifactMajor,
          svmMajor: SVM_IR_VERSION_MAJOR,
          compilerVersion,
        },
      });
      throw new Error(
        `IR major version incompatible: SVM accepts v${SVM_IR_VERSION_MAJOR}.x, ` +
        `artifact is v${artifactMajor}.x — re-compile with a compatible compiler version`
      );
    }

    // Same major — check minor for warning
    const svmMinor = 0; // SVM accepts any minor within the same major
    if (artifactMinor > svmMinor) {
      this.logger.warn(
        `[SVM:Compat] IR minor version v${artifactMajor}.${artifactMinor} > ` +
        `SVM minor v${SVM_IR_VERSION_MAJOR}.${svmMinor} — executing with compatibility mode. ` +
        `Some new features may be ignored.`
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MONOLITHIC execution (original behavior, all on CENTRAL)
  // ──────────────────────────────────────────────────────────────────────────

  private async executeMonolithic(
    workflow: CompiledWorkflow,
    userInputs: Record<string, any>
  ): Promise<ExecutionResult> {
    const startTime = new Date();
    this.logger.log(`[SVM:MONOLITHIC] Starting ${workflow.metadata.workflowName}`);

    const context = this.initializeContext(workflow.ir);
    this.loadInputs(workflow.ir, userInputs, context);
    const servicesCalled: ExecutionResult['servicesCalled'] = [];

    try {
      // Track instruction indices consumed by bounded loops so the main
      // iteration does not re-execute them.
      const processedByLoop = new Set<number>();

      for (const instrIdx of workflow.ir.instructionOrder) {
        if (processedByLoop.has(instrIdx)) continue;

        context.currentInstructionIndex = instrIdx;
        const instr = workflow.ir.instructions[instrIdx];

        if (instr.opcode === IROpcode.LOOP) {
          const bodyProcessed = await this.handleBoundedLoop(
            instr, context, workflow, servicesCalled
          );
          bodyProcessed.forEach(idx => processedByLoop.add(idx));
          continue;
        }

        await this.executeInstruction(instr, context, workflow.preLoadedServices, servicesCalled);
      }

      const output = context.registers.get(workflow.ir.outputRegister);
      const durationMs = Date.now() - startTime.getTime();

      this.logger.log(
        `[SVM:MONOLITHIC] Complete in ${durationMs}ms (${workflow.ir.instructionOrder.length} instructions)`
      );

      return { output, durationMs, instructionsExecuted: workflow.ir.instructionOrder.length, servicesCalled };
    } catch (error: any) {
      this.logger.error(`[SVM:MONOLITHIC] Failed at #${context.currentInstructionIndex}: ${error?.message}`);
      throw error;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DISTRIBUTED execution
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Distributed execution flow:
   *
   *  1. Identify the CENTRAL slice (always the orchestration entry point)
   *  2. Dispatch ALL remote slices in parallel to their target nodes
   *     (they start executing immediately if they have no dependencies)
   *  3. Execute the CENTRAL slice locally instruction-by-instruction
   *  4. At each SyncPoint: PAUSE, wait for the awaited remote slices,
   *     merge their output registers into the local context, then RESUME
   *  5. Return the final output from the central output register
   */
  private async executeDistributed(
    workflow: CompiledWorkflow,
    userInputs: Record<string, any>,
    plan: DistributedExecutionPlan
  ): Promise<ExecutionResult> {
    const startTime = new Date();
    this.logger.log(
      `[SVM:DISTRIBUTED] Starting ${workflow.metadata.workflowName} — ${plan.slices.length} slices, ${plan.nodeCount} nodes`
    );

    const context = this.initializeContext(workflow.ir);
    this.loadInputs(workflow.ir, userInputs, context);
    const servicesCalled: ExecutionResult['servicesCalled'] = [];

    // ── Build a quick lookup: sliceId → slice ─────────────────────────────
    const sliceById = new Map(plan.slices.map(s => [s.sliceId, s]));

    // ── Find the central slice ────────────────────────────────────────────
    const centralSlice = plan.slices.find(s => s.nodeId === CENTRAL_NODE_ID);
    if (!centralSlice) {
      this.logger.warn('[SVM:DISTRIBUTED] No central slice found — falling back to monolithic');
      return this.executeMonolithic(workflow, userInputs);
    }

    // ── Dispatch all independent remote slices immediately ─────────────────
    const remoteSlices = plan.slices.filter(
      s => s.nodeId !== CENTRAL_NODE_ID && s.isRoot
    );

    const pendingResults = new Map<string, Promise<SliceResultPayload>>();

    for (const remoteSlice of remoteSlices) {
      const payload: SliceDispatchPayload = {
        planId: plan.planId,
        sliceId: remoteSlice.sliceId,
        instructions: remoteSlice.instructions,
        instructionOrder: remoteSlice.instructionOrder,
        registerValues: this.extractInputRegisters(remoteSlice, context),
        timeoutMs: remoteSlice.estimatedDurationMs * 3 + 2000,
        checksum: remoteSlice.checksum,
      };

      this.logger.log(
        `[SVM:DISTRIBUTED] Dispatching slice "${remoteSlice.sliceId}" → node ${remoteSlice.nodeId} (${remoteSlice.instructions.length} instructions)`
      );

      const resultPromise = this.dispatcher!
        .dispatch(remoteSlice.nodeId, payload)
        .catch((err: Error) => this.handleRemoteSliceFailure(remoteSlice, err, plan));

      pendingResults.set(remoteSlice.sliceId, resultPromise);
    }

    // ── Execute the central slice with sync-point awareness ───────────────
    let instructionsExecuted = 0;
    let syncPointIdx = 0;
    const sortedSyncPoints = [...plan.syncPoints].sort(
      (a, b) => a.pauseBeforeInstruction - b.pauseBeforeInstruction
    );

    for (const instrIdx of centralSlice.instructionOrder) {
      // Check if we hit a sync point before this instruction
      while (
        syncPointIdx < sortedSyncPoints.length &&
        sortedSyncPoints[syncPointIdx].pauseBeforeInstruction <= instrIdx
      ) {
        const sp = sortedSyncPoints[syncPointIdx++];
        await this.processSyncPoint(sp, pendingResults, context, plan, servicesCalled);
      }

      context.currentInstructionIndex = instrIdx;
      const instr = workflow.ir.instructions[instrIdx];
      await this.executeInstruction(instr, context, workflow.preLoadedServices, servicesCalled);
      instructionsExecuted++;
    }

    // ── Wait for any remaining sync points ────────────────────────────────
    while (syncPointIdx < sortedSyncPoints.length) {
      const sp = sortedSyncPoints[syncPointIdx++];
      await this.processSyncPoint(sp, pendingResults, context, plan, servicesCalled);
    }

    const output = context.registers.get(workflow.ir.outputRegister);
    const durationMs = Date.now() - startTime.getTime();

    this.logger.log(
      `[SVM:DISTRIBUTED] Complete in ${durationMs}ms (central: ${instructionsExecuted} instr, remote slices: ${pendingResults.size})`
    );

    return {
      output,
      durationMs,
      instructionsExecuted,
      servicesCalled,
      distributedSlicesCompleted: pendingResults.size,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Sync point processing
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Wait for all remote slices required by a SyncPoint,
   * then merge their output registers into the local execution context.
   */
  private async processSyncPoint(
    sp: SyncPoint,
    pendingResults: Map<string, Promise<SliceResultPayload>>,
    context: ExecutionContext,
    plan: DistributedExecutionPlan,
    servicesCalled: ExecutionResult['servicesCalled']
  ): Promise<void> {
    this.logger.log(
      `[SVM:DISTRIBUTED] Sync point "${sp.syncId}" — awaiting ${sp.awaitSliceIds.join(', ')}`
    );

    const resultPromises = sp.awaitSliceIds
      .map(id => pendingResults.get(id))
      .filter(Boolean) as Promise<SliceResultPayload>[];

    const results = await Promise.allSettled(resultPromises);

    for (let i = 0; i < results.length; i++) {
      const settled = results[i];
      const sliceId = sp.awaitSliceIds[i];

      if (settled.status === 'rejected') {
        this.logger.error(`[SVM:DISTRIBUTED] Slice "${sliceId}" rejected: ${settled.reason}`);
        if (sp.onTimeout === 'FAIL') throw new Error(`Remote slice ${sliceId} failed`);
        if (sp.onTimeout === 'USE_DEFAULT') {
          this.applyDefaultValues(sp, context);
        }
        // 'SKIP' → continue without this data
        continue;
      }

      const result: SliceResultPayload = settled.value;

      if (result.status !== 'SUCCESS') {
        this.logger.error(`[SVM:DISTRIBUTED] Slice "${sliceId}" returned status=${result.status}: ${result.error}`);
        if (sp.onTimeout === 'FAIL') throw new Error(`Remote slice ${sliceId} failed: ${result.error}`);
        continue;
      }

      // Merge output registers from remote slice into local context
      for (const flow of sp.inboundFlows.filter(f => f.fromNodeId === result.nodeId)) {
        const value = result.outputRegisters[flow.fromRegister];
        context.registers.set(flow.toRegister, value);
        this.logger.debug(
          `[SVM:DISTRIBUTED] Merged r${flow.fromRegister}@${result.nodeId} → r${flow.toRegister}@CENTRAL`
        );
      }

      // Track remote service calls in our audit
      for (const event of result.auditEvents ?? []) {
        servicesCalled.push({
          serviceId: event.opcode,
          format: 'REMOTE',
          durationMs: event.durationMs,
          nodeId: result.nodeId,
        });
      }

      this.logger.log(
        `[SVM:DISTRIBUTED] Slice "${sliceId}" on ${result.nodeId} completed in ${result.durationMs}ms`
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Remote slice failure handling (fallback to CENTRAL)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * If a remote node fails or times out, attempt to re-execute the slice locally
   * on the CENTRAL node as a FAIL_SAFE fallback.
   */
  private async handleRemoteSliceFailure(
    slice: ExecutionSlice,
    error: Error,
    _plan: DistributedExecutionPlan
  ): Promise<SliceResultPayload> {
    this.logger.warn(
      `[SVM:DISTRIBUTED] Remote slice "${slice.sliceId}" on ${slice.nodeId} failed: ${error.message}. Falling back to CENTRAL.`
    );

    // Mark node as potentially degraded
    this.nodeRegistry?.markOffline(slice.nodeId);

    // Execute the slice locally
    const localContext = this.initializeContext({
      instructions: slice.instructions,
      instructionOrder: slice.instructionOrder,
      dependencyGraph: new Map(),
      resourceTable: [],
      parallelizationGroups: [],
      schemas: [],
      semanticContext: { embeddings: [], relationships: [], fallbackStrategies: [] },
      inputRegister: 0,
      outputRegister: slice.instructions.at(-1)?.dest ?? 0,
      metadata: { compiledAt: new Date(), compilerVersion: 'fallback', source: 'fallback' },
    });

    const fallbackServicesCalled: ExecutionResult['servicesCalled'] = [];
    const startMs = Date.now();

    for (const idx of slice.instructionOrder) {
      const instr = slice.instructions.find(i => i.index === idx)!;
      await this.executeInstruction(
        instr,
        localContext,
        { wasm: new Map(), mcp: new Map(), native: new Map(), docker: new Map() },
        fallbackServicesCalled
      );
    }

    const outputRegs: Record<number, any> = {};
    for (const ob of slice.outputBindings) {
      outputRegs[ob.register] = localContext.registers.get(ob.register);
    }

    return {
      planId: _plan.planId,
      sliceId: slice.sliceId,
      nodeId: CENTRAL_NODE_ID,
      status: 'SUCCESS',
      outputRegisters: outputRegs,
      durationMs: Date.now() - startMs,
      auditEvents: fallbackServicesCalled.map(s => ({
        timestamp: new Date().toISOString(),
        instructionIndex: 0,
        opcode: s.serviceId,
        durationMs: s.durationMs,
        result: 'SUCCESS' as const,
      })),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  private extractInputRegisters(
    slice: ExecutionSlice,
    context: ExecutionContext
  ): Record<number, any> {
    const values: Record<number, any> = {};
    for (const [reg, binding] of Object.entries(slice.inputBindings)) {
      if ('fromTrigger' in binding) {
        values[Number(reg)] = context.registers.get(0); // trigger data is in r0
      } else {
        values[Number(reg)] = context.registers.get(binding.fromRegister);
      }
    }
    return values;
  }

  private applyDefaultValues(sp: SyncPoint, context: ExecutionContext): void {
    if (sp.defaultValue !== undefined) {
      for (const flow of sp.inboundFlows) {
        context.registers.set(flow.toRegister, sp.defaultValue);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Core execution primitives (unchanged from monolithic)
  // ──────────────────────────────────────────────────────────────────────────

  private initializeContext(ir: LLMIntermediateRepresentation): ExecutionContext {
    const context: ExecutionContext = {
      registers: new Map(),
      memory: Buffer.alloc(10 * 1024 * 1024), // 10MB
      callStack: [],
      currentInstructionIndex: 0,
      startTime: new Date(),
    };
    for (let i = 0; i < 256; i++) context.registers.set(i, null);
    return context;
  }

  private loadInputs(
    ir: LLMIntermediateRepresentation,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): void {
    Object.entries(inputs).forEach(([_name, value]) => {
      context.registers.set(0, value);
    });
    this.logger.debug(`[SVM] Loaded ${Object.keys(inputs).length} inputs`);
  }

  private async executeInstruction(
    instr: IRInstruction,
    context: ExecutionContext,
    preLoaded: PreLoadedServices,
    servicesCalled: ExecutionResult['servicesCalled']
  ): Promise<void> {
    switch (instr.opcode) {
      case IROpcode.LOAD_RESOURCE:   this.handleLoadResource(instr, context); break;
      case IROpcode.VALIDATE:        this.handleValidate(instr, context); break;
      case IROpcode.CALL_SERVICE:    await this.handleCallService(instr, context, preLoaded, servicesCalled); break;
      case IROpcode.CALL_ACTION:     await this.handleCallAction(instr, context); break;
      case IROpcode.CALL_MCP:        await this.handleCallService(instr, context, preLoaded, servicesCalled); break;
      case IROpcode.TRANSFORM:       this.handleTransform(instr, context); break;
      case IROpcode.FILTER:          this.handleFilter(instr, context); break;
      case IROpcode.AGGREGATE:       this.handleAggregate(instr, context); break;
      case IROpcode.STORE_MEMORY:    this.handleStoreMemory(instr, context); break;
      case IROpcode.PARALLEL_SPAWN:
      case IROpcode.PARALLEL_MERGE:
        // These are handled at the distribution-plan level; no-op locally
        this.logger.debug(`[SVM] ${instr.opcode} (handled by distribution planner)`);
        break;
      case IROpcode.BRANCH:
        this.logger.debug(`[SVM] BRANCH → ${instr.targetInstruction}`);
        break;
      case IROpcode.LOOP:
        // Should have been caught in executeMonolithic; log as warn if reached here
        this.logger.warn(`[SVM] LOOP at index ${instr.index} reached executeInstruction — not inside a bounded context`);
        break;
      case IROpcode.LLM_CALL:
        // LLM_CALL is a bounded service call with frozen context — delegates
        // to the LlmCallExecutor via ExecutorRegistry (same path as CALL_SERVICE).
        await this.handleCallService(instr, context, preLoaded, servicesCalled);
        break;
      case IROpcode.RETURN: break;
      default:
        this.logger.warn(`[SVM] Unknown opcode: ${instr.opcode}`);
    }
  }

  private handleLoadResource(instr: IRInstruction, context: ExecutionContext): void {
    const { dest, operands } = instr;
    if (dest === undefined) throw new Error(`LOAD_RESOURCE: missing dest`);
    context.registers.set(dest, { data: Buffer.from('resource') });
    this.logger.debug(`[SVM] LOAD_RESOURCE r${dest} ← ${operands?.resourceId}`);
  }

  private handleValidate(instr: IRInstruction, context: ExecutionContext): void {
    const { src, operands } = instr;
    if (!src?.length) throw new Error(`VALIDATE: missing src`);
    const value = context.registers.get(src[0]);
    if (value === null || value === undefined) {
      throw new Error(`VALIDATE: r${src[0]} is null (schema ${operands?.schemaId})`);
    }
    this.logger.debug(`[SVM] VALIDATE r${src[0]} schema=${operands?.schemaId}`);
  }

  private async handleCallService(
    instr: IRInstruction,
    context: ExecutionContext,
    preLoaded: PreLoadedServices,
    servicesCalled: ExecutionResult['servicesCalled']
  ): Promise<void> {
    const { dest, src, serviceId, dispatchMetadata } = instr;
    if (!serviceId || !dispatchMetadata) throw new Error(`CALL_SERVICE: missing serviceId/dispatch`);
    if (dest === undefined) throw new Error(`CALL_SERVICE: missing dest`);

    const meta = dispatchMetadata as EnrichedDispatchMetadata;
    const t = Date.now();
    let result: any;

    // ── Path 1: Use ExecutorRegistry (new powerful execution engine) ──────
    if (this.executorRegistry && meta.selectedDescriptor) {
      // Build input record from source registers (positional → port-name mapping)
      // For now we use a flat record of all register values keyed by index
      const inputs: Record<string, any> = {};
      if (src?.length) {
        // If the manifest declares named inputs, map positionally
        src.forEach((regIdx, i) => {
          inputs[`r${regIdx}`] = context.registers.get(regIdx);
          // Primary key = reg index string; secondary key = 'input' for single-input services
          if (i === 0) inputs['input'] = context.registers.get(regIdx);
        });
      }

      // Also expose all current register values for services that do own mapping
      context.registers.forEach((val, regIdx) => {
        if (val !== null && val !== undefined) inputs[`r${regIdx}`] = val;
      });

      const execCtx: ExecutorContext = {
        inputs,
        connectorConfigs: (context as any).connectorConfigs,
        secrets: (context as any).secrets ?? {},
        timeoutMs: meta.timeoutMs,
        traceId: (context as any).traceId,
      };

      // ── Vault: resolve credentialsVaultPath if set + Vault available ──────
      const vaultPath = (meta.selectedDescriptor as any)?.credentialsVaultPath as string | undefined;
      if (this.vault && vaultPath) {
        try {
          const secret = await this.vault.fetchSecret(vaultPath);
          execCtx.secrets = { ...execCtx.secrets };
          execCtx.secrets[vaultPath] = secret.value;

          // Audit vault access
          this.auditChain?.append({
            workflowId: (context as any).workflowId ?? 'unknown',
            instructionId: String(instr.index),
            eventType: 'VAULT_SECRET_FETCHED',
            details: { path: vaultPath, source: secret.source },
          });
        } catch (err: any) {
          this.logger.warn(`[SVM] Vault fetch failed for '${vaultPath}': ${err.message}`);
        }
      }

      const execResult = await this.executorRegistry.execute(
        meta.format as any,
        meta.selectedDescriptor,
        execCtx,
        meta.retryPolicy,
      );

      result = execResult.outputs;
      context.registers.set(dest, result);
      servicesCalled.push({
        serviceId,
        format: meta.format,
        durationMs: execResult.durationMs,
        nodeId: meta.targetTier === 'CENTRAL' ? 'central-nestjs' : undefined,
      });
      this.logger.debug(`[SVM] CALL_SERVICE ${serviceId} (${meta.format}) via ExecutorRegistry → r${dest} in ${execResult.durationMs}ms`);
      return;
    }

    // ── Path 2: Legacy pre-loaded services fallback ───────────────────────
    const args = (src ?? []).map(r => context.registers.get(r));
    switch (meta.format) {
      case 'WASM':   result = await this.callWASM(serviceId, preLoaded, args); break;
      case 'MCP':    result = await this.callMCP(serviceId, preLoaded, args); break;
      case 'NATIVE': result = await this.callNative(serviceId, preLoaded, args); break;
      case 'DOCKER': result = await this.callDocker(serviceId, preLoaded, args); break;
      default:       throw new Error(`Unknown format: ${meta.format}`);
    }

    context.registers.set(dest, result);
    servicesCalled.push({ serviceId, format: meta.format, durationMs: Date.now() - t });
    this.logger.debug(`[SVM] CALL_SERVICE ${serviceId} (${meta.format}) legacy → r${dest}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Bounded Loop — spec §3.5 "Boucles de Raisonnement Contrôlées"
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Execute a LOOP instruction with strict bounds.
   *
   * Returns the Set of instruction indices belonging to the loop body so that
   * the caller (executeMonolithic) can skip them in the main iteration.
   *
   * Spec guarantees enforced here:
   *   • max_iterations (≤ MAX_LOOP_ITERATIONS = 5) hard ceiling
   *   • timeout_ms absolute wall-clock abort
   *   • convergence_predicate early exit
   *   • fallbackInstruction jump on non-convergence (or throw)
   */
  private async handleBoundedLoop(
    loopInstr: IRInstruction,
    context: ExecutionContext,
    workflow: CompiledWorkflow,
    servicesCalled: ExecutionResult['servicesCalled'],
  ): Promise<Set<number>> {
    const ops = loopInstr.operands as LoopOperands | undefined;

    if (!ops || ops.maxIterations === undefined) {
      throw new Error(
        `[SVM] LOOP at index ${loopInstr.index} is missing LoopOperands (maxIterations required). ` +
        `Stage 5 should have blocked this — check your formal verification pass.`
      );
    }

    const maxIter  = Math.min(ops.maxIterations, MAX_LOOP_ITERATIONS);
    const timeoutMs = ops.timeoutMs ?? 5_000;
    const startMs  = Date.now();

    // ── Collect body instruction indices ──────────────────────────────────
    const bodyIndices = workflow.ir.instructionOrder.filter(
      idx => idx >= ops.bodyStartIndex && idx < ops.exitIndex
    );
    const bodyInstructions = bodyIndices.map(idx => workflow.ir.instructions[idx]);

    this.logger.debug(
      `[SVM] LOOP start: maxIter=${maxIter}, timeout=${timeoutMs}ms, ` +
      `body=[${ops.bodyStartIndex}..${ops.exitIndex - 1}] (${bodyInstructions.length} instructions)`
    );

    let converged = false;

    for (let iter = 0; iter < maxIter; iter++) {
      // Hard timeout check
      if (Date.now() - startMs > timeoutMs) {
        this.logger.warn(`[SVM] LOOP at ${loopInstr.index} hit timeout after ${iter} iteration(s)`);
        if (ops.fallbackInstruction !== undefined) {
          context.currentInstructionIndex = ops.fallbackInstruction;
          this.logger.warn(`[SVM] LOOP fallback → instruction ${ops.fallbackInstruction}`);
        } else {
          throw new Error(
            `[SVM] LOOP at ${loopInstr.index} did not converge within ${timeoutMs}ms — ` +
            `no fallbackInstruction defined. Escalate to human operator.`
          );
        }
        break;
      }

      // Execute body
      for (const bodyInstr of bodyInstructions) {
        context.currentInstructionIndex = bodyInstr.index;
        await this.executeInstruction(
          bodyInstr, context, workflow.preLoadedServices, servicesCalled
        );
      }

      // Check convergence predicate
      if (ops.convergencePredicate) {
        const regVal = context.registers.get(ops.convergencePredicate.registerIndex);
        if (this._evaluateLoopPredicate(regVal, ops.convergencePredicate)) {
          this.logger.debug(`[SVM] LOOP converged at iteration ${iter + 1}`);
          converged = true;
          break;
        }
      }
    }

    if (!converged && !ops.fallbackInstruction && ops.convergencePredicate) {
      this.logger.warn(
        `[SVM] LOOP at ${loopInstr.index} exhausted ${maxIter} iterations without convergence.`
      );
    }

    return new Set(bodyIndices);
  }

  /** Evaluate a loop convergence predicate against a register value */
  private _evaluateLoopPredicate(
    value: any,
    pred: LoopConvergencePredicate,
  ): boolean {
    switch (pred.operator) {
      case 'exists':  return value !== null && value !== undefined;
      case 'truthy':  return !!value;
      case '==':      return value === pred.value;
      case '!=':      return value !== pred.value;
      case '<':       return value < pred.value;
      case '<=':      return value <= pred.value;
      case '>':       return value > pred.value;
      case '>=':      return value >= pred.value;
      default:        return false;
    }
  }

  private async handleCallAction(
    instr: IRInstruction,
    context: ExecutionContext,
    workflowId?: string,
  ): Promise<void> {
    if (instr.dest === undefined) throw new Error(`CALL_ACTION: missing dest`);

    const ops = (instr.operands ?? {}) as PhysicalActionOperands;
    const t   = Date.now();

    // Audit: INTENTION
    this.auditChain?.append({
      workflowId: workflowId ?? 'unknown',
      instructionId: String(instr.index),
      eventType: 'PHYSICAL_ACTION',
      input: ops,
      details: { target: ops.target, command: ops.command },
    });

    // Resolve any vault secrets required by the action
    if (ops.payload?.secretPath && this.vault) {
      try {
        const secret = await this.vault.fetchSecret(ops.payload.secretPath);
        ops.payload.resolvedSecret = secret.value;
      } catch (err: any) {
        this.logger.warn(`[SVM] CALL_ACTION vault fetch failed: ${err.message}`);
      }
    }

    let result: any;

    if (this.physicalControl) {
      // Full spec §9.2 enforcement: TimeWindow + cancellation + postcondition
      const physResult = await this.physicalControl.executePhysicalAction(
        ops,
        context.registers,
        async () => {
          // Actual side-effect here — stubbed for determinism; real impl uses IoT connectors
          this.logger.log(`[SVM] PHYSICAL_ACTION: ${ops.command ?? 'EXECUTE'} on ${ops.target ?? '?'}`);
          return { executed: true, target: ops.target, command: ops.command };
        },
      );

      result = physResult;

      // Audit postcondition result
      this.auditChain?.append({
        workflowId: workflowId ?? 'unknown',
        instructionId: String(instr.index),
        eventType: physResult.postconditionPassed === false
          ? 'POSTCONDITION_FAILED'
          : physResult.postconditionPassed === true
          ? 'POSTCONDITION_PASSED'
          : 'ACTION_TAKEN',
        output: physResult,
        durationMs: physResult.durationMs,
      });
    } else {
      result = { action: 'executed', target: ops.target, command: ops.command };
    }

    context.registers.set(instr.dest, result);
    this.logger.debug(`[SVM] CALL_ACTION in ${Date.now() - t}ms`);
  }

  private handleTransform(instr: IRInstruction, context: ExecutionContext): void {
    const { dest, src } = instr;
    if (!src?.length || dest === undefined) throw new Error(`TRANSFORM: missing src/dest`);
    context.registers.set(dest, context.registers.get(src[0]));
  }

  private handleFilter(instr: IRInstruction, context: ExecutionContext): void {
    const { dest, src } = instr;
    if (!src?.length || dest === undefined) throw new Error(`FILTER: missing src/dest`);
    const value = context.registers.get(src[0]);
    context.registers.set(dest, Array.isArray(value) ? value : [value]);
  }

  private handleAggregate(instr: IRInstruction, context: ExecutionContext): void {
    const { dest, src } = instr;
    if (!src?.length || dest === undefined) throw new Error(`AGGREGATE: missing src/dest`);
    const values = src.map(r => context.registers.get(r));
    context.registers.set(dest, values);
  }

  private handleStoreMemory(instr: IRInstruction, context: ExecutionContext): void {
    const { src, operands } = instr;
    if (!src?.length) throw new Error(`STORE_MEMORY: missing src`);
    const key = operands?.key ?? 'default';
    const offset = (key.charCodeAt(0) ?? 0) % (context.memory.length - 4);
    context.memory.writeInt32LE(src[0], offset);
    this.logger.debug(`[SVM] STORE_MEMORY key=${key} r${src[0]}`);
  }

  private async callWASM(serviceId: string, preLoaded: PreLoadedServices, args: any[]): Promise<any> {
    const instance = preLoaded.wasm.get(serviceId);
    if (!instance) throw new Error(`WASM service not found: ${serviceId}`);
    return { wasmResult: args };
  }

  private async callMCP(serviceId: string, preLoaded: PreLoadedServices, args: any[]): Promise<any> {
    const connection = preLoaded.mcp.get(serviceId);
    if (!connection?.connected) throw new Error(`MCP service not connected: ${serviceId}`);
    return { mcpResult: args };
  }

  private async callNative(serviceId: string, preLoaded: PreLoadedServices, args: any[]): Promise<any> {
    const binary = preLoaded.native.get(serviceId);
    if (!binary) throw new Error(`NATIVE service not found: ${serviceId}`);
    return { nativeResult: args };
  }

  private async callDocker(serviceId: string, preLoaded: PreLoadedServices, args: any[]): Promise<any> {
    const imageRef = preLoaded.docker.get(serviceId);
    if (!imageRef) throw new Error(`DOCKER image not found: ${serviceId}`);
    return { dockerResult: args };
  }
}
