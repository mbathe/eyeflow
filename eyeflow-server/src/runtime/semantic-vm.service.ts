/**
 * LAYER 5: Semantic Virtual Machine (SVM)
 * 
 * Execution engine for LLMIntermediateRepresentation
 * - Deterministic bytecode execution
 * - Pre-loaded services dispatch
 * - Zero LLM at runtime (LLM only at compilation)
 */

import { Injectable, Logger } from '@nestjs/common';
import { 
  LLMIntermediateRepresentation, 
  IRInstruction, 
  IROpcode,
  RegisterType 
} from '../compiler/interfaces/ir.interface';
import { 
  CompiledWorkflow,
  PreLoadedServices 
} from '../compiler/interfaces/compiled-workflow.interface';

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
  servicesOalled: Array<{
    serviceId: string;
    format: string;
    durationMs: number;
  }>;
}

@Injectable()
export class SemanticVirtualMachine {
  private readonly logger = new Logger(SemanticVirtualMachine.name);

  /**
   * Execute a compiled workflow with user inputs
   */
  async execute(
    workflow: CompiledWorkflow,
    userInputs: Record<string, any>
  ): Promise<ExecutionResult> {
    const startTime = new Date();
    this.logger.log(
      `[SVM] Starting execution of workflow ${workflow.metadata.workflowName}`
    );

    // Initialize execution context
    const context = this.initializeContext(workflow.ir);
    const servicesOalled: ExecutionResult['servicesOalled'] = [];

    try {
      // Execute each instruction in topological order
      for (const instrIdx of workflow.ir.instructionOrder) {
        context.currentInstructionIndex = instrIdx;
        const instr = workflow.ir.instructions[instrIdx];

        // Execute instruction
        await this.executeInstruction(
          instr,
          context,
          workflow.preLoadedServices,
          servicesOalled
        );
      }

      // Retrieve output
      const output = context.registers.get(workflow.ir.outputRegister);
      const durationMs = new Date().getTime() - startTime.getTime();

      this.logger.log(
        `[SVM] Execution complete in ${durationMs}ms (${workflow.ir.instructionOrder.length} instructions)`
      );

      return {
        output,
        durationMs,
        instructionsExecuted: workflow.ir.instructionOrder.length,
        servicesOalled
      };
    } catch (error: any) {
      this.logger.error(
        `[SVM] Execution failed at instruction ${context.currentInstructionIndex}: ${error?.message || String(error)}`
      );
      throw error;
    }
  }

  /**
   * Initialize execution context
   */
  private initializeContext(ir: LLMIntermediateRepresentation): ExecutionContext {
    const context: ExecutionContext = {
      registers: new Map(),
      memory: Buffer.alloc(10 * 1024 * 1024), // 10MB
      callStack: [],
      currentInstructionIndex: 0,
      startTime: new Date()
    };

    // Pre-allocate registers
    for (let i = 0; i < 256; i++) {
      context.registers.set(i, null);
    }

    return context;
  }

  /**
   * Load user inputs into registers
   */
  private loadInputs(
    ir: LLMIntermediateRepresentation,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): void {
    // Map input names to registers based on IR input schema
    Object.entries(inputs).forEach(([name, value]) => {
      // In production: use IR.inputMapping to find register
      // For now: assume first N registers are inputs
      context.registers.set(0, value);
    });

    this.logger.debug(`[SVM] Loaded ${Object.keys(inputs).length} inputs`);
  }

  /**
   * Execute a single instruction
   */
  private async executeInstruction(
    instr: IRInstruction,
    context: ExecutionContext,
    preLoaded: PreLoadedServices,
    servicesOalled: ExecutionResult['servicesOalled']
  ): Promise<void> {
    switch (instr.opcode) {
      case IROpcode.LOAD_RESOURCE:
        this.handleLoadResource(instr, context);
        break;

      case IROpcode.VALIDATE:
        this.handleValidate(instr, context);
        break;

      case IROpcode.CALL_SERVICE:
        await this.handleCallService(instr, context, preLoaded, servicesOalled);
        break;

      case IROpcode.CALL_ACTION:
        this.handleCallAction(instr, context);
        break;

      case IROpcode.TRANSFORM:
        this.handleTransform(instr, context);
        break;

      case IROpcode.BRANCH:
        // Note: BRANCH doesn't execute here, it changes instructionOrder
        // For now: log it
        this.logger.debug(`[SVM] BRANCH instruction (target: ${instr.targetInstruction})`);
        break;

      case IROpcode.RETURN:
        // Return will be handled after instruction loop
        break;

      default:
        this.logger.warn(`[SVM] Unknown opcode: ${instr.opcode}`);
    }
  }

  /**
   * LOAD_RESOURCE: Load pre-allocated resource into register
   */
  private handleLoadResource(instr: IRInstruction, context: ExecutionContext): void {
    const { dest, operands } = instr;
    const resourceId = operands?.resourceId;

    if (dest === undefined || resourceId === undefined) {
      throw new Error(`[SVM] LOAD_RESOURCE: missing dest or resourceId`);
    }

    // In production: lookup in IR.resourceTable
    const resource = { data: Buffer.from('mock-resource') };

    context.registers.set(dest, resource.data);
    this.logger.debug(`[SVM] LOAD_RESOURCE r${dest} from resource ${resourceId}`);
  }

  /**
   * VALIDATE: Run embedded schema validator
   */
  private handleValidate(instr: IRInstruction, context: ExecutionContext): void {
    const { src, operands } = instr;
    const schemaId = operands?.schemaId;

    if (!src || src.length === 0 || schemaId === undefined) {
      throw new Error(`[SVM] VALIDATE: missing source register or schemaId`);
    }

    const value = context.registers.get(src[0]);

    // In production: call schema.validator(value)
    // For now: just log
    this.logger.debug(`[SVM] VALIDATE r${src[0]} against schema ${schemaId}`);

    if (typeof value !== 'object') {
      throw new Error(`[SVM] VALIDATE: expected object, got ${typeof value}`);
    }
  }

  /**
   * CALL_SERVICE: Dispatch to appropriate handler (WASM/MCP/NATIVE/DOCKER)
   */
  private async handleCallService(
    instr: IRInstruction,
    context: ExecutionContext,
    preLoaded: PreLoadedServices,
    servicesOalled: ExecutionResult['servicesOalled']
  ): Promise<void> {
    const { dest, src, serviceId, dispatchMetadata } = instr;

    if (!serviceId || !dispatchMetadata) {
      throw new Error(`[SVM] CALL_SERVICE: missing serviceId or dispatchMetadata`);
    }

    if (dest === undefined) {
      throw new Error(`[SVM] CALL_SERVICE: missing destination register`);
    }

    // Load arguments from source registers
    const args = (src || []).map((regId: number) => context.registers.get(regId));

    // Dispatch based on format
    const startTime = Date.now();
    let result: any;

    switch (dispatchMetadata.format) {
      case 'WASM':
        result = await this.callWASM(serviceId, preLoaded, args, dispatchMetadata);
        break;
      case 'MCP':
        result = await this.callMCP(serviceId, preLoaded, args, dispatchMetadata);
        break;
      case 'NATIVE':
        result = await this.callNative(serviceId, preLoaded, args, dispatchMetadata);
        break;
      case 'DOCKER':
        result = await this.callDocker(serviceId, preLoaded, args, dispatchMetadata);
        break;
      default:
        throw new Error(`[SVM] Unknown service format: ${dispatchMetadata.format}`);
    }

    const durationMs = Date.now() - startTime;
    
    // Store result in register
    context.registers.set(dest, result);

    // Track service call
    servicesOalled.push({
      serviceId,
      format: dispatchMetadata.format,
      durationMs
    });

    this.logger.debug(
      `[SVM] CALL_SERVICE ${serviceId} (${dispatchMetadata.format}) -> r${dest} in ${durationMs}ms`
    );
  }

  /**
   * CALL_ACTION: Execute action (sandboxed)
   */
  private handleCallAction(instr: IRInstruction, context: ExecutionContext): void {
    const { dest, operands } = instr;

    if (dest === undefined) {
      throw new Error(`[SVM] CALL_ACTION: missing destination register`);
    }

    // In production: execute sandboxed action
    const result = { action: 'executed' };
    context.registers.set(dest, result);

    this.logger.debug(`[SVM] CALL_ACTION -> r${dest}`);
  }

  /**
   * TRANSFORM: Data transformation (pre-compiled function)
   */
  private handleTransform(instr: IRInstruction, context: ExecutionContext): void {
    const { dest, src, operands } = instr;

    if (!src || src.length === 0 || dest === undefined) {
      throw new Error(`[SVM] TRANSFORM: missing source or destination`);
    }

    const value = context.registers.get(src[0]);
    // In production: apply transformation function
    const result = value;

    context.registers.set(dest, result);
    this.logger.debug(`[SVM] TRANSFORM r${src[0]} -> r${dest}`);
  }

  /**
   * Call WASM service
   */
  private async callWASM(
    serviceId: string,
    preLoaded: PreLoadedServices,
    args: any[],
    dispatch: any
  ): Promise<any> {
    const instance = preLoaded.wasm.get(serviceId);
    if (!instance) {
      throw new Error(`[SVM] WASM service not found: ${serviceId}`);
    }

    // In production: call WASM export
    // const fn = instance.exports[dispatch.method];
    // return fn(...args);

    // For testing: mock return
    return { wasmResult: args };
  }

  /**
   * Call MCP service
   */
  private async callMCP(
    serviceId: string,
    preLoaded: PreLoadedServices,
    args: any[],
    dispatch: any
  ): Promise<any> {
    const connection = preLoaded.mcp.get(serviceId);
    if (!connection || !connection.connected) {
      throw new Error(`[SVM] MCP service not connected: ${serviceId}`);
    }

    // In production: JSON-RPC call
    // const response = await jsonRpcCall(connection.endpoint, dispatch.mcpMethod, args);

    // For testing: mock return
    return { mcpResult: args };
  }

  /**
   * Call NATIVE service
   */
  private async callNative(
    serviceId: string,
    preLoaded: PreLoadedServices,
    args: any[],
    dispatch: any
  ): Promise<any> {
    const binary = preLoaded.native.get(serviceId);
    if (!binary) {
      throw new Error(`[SVM] NATIVE service not found: ${serviceId}`);
    }

    // In production: FFI call
    // return ffiCall(binary, args);

    // For testing: mock return
    return { nativeResult: args };
  }

  /**
   * Call DOCKER service
   */
  private async callDocker(
    serviceId: string,
    preLoaded: PreLoadedServices,
    args: any[],
    dispatch: any
  ): Promise<any> {
    const imageRef = preLoaded.docker.get(serviceId);
    if (!imageRef) {
      throw new Error(`[SVM] DOCKER service not found: ${serviceId}`);
    }

    // In production: spawn container, pass args
    // const output = await dockerRun(imageRef, dispatch.dockerEnv, args);

    // For testing: mock return
    return { dockerResult: args };
  }
}
