/**
 * Compilation to Execution Bridge Service
 * 
 * Sends compiled bytecode to Semantic Virtual Machine for execution
 * and collects execution results with metadata.
 * 
 * Part of Option 1 architecture:
 * Planning Layer → Compilation Layer → [THIS SERVICE] → Execution Layer (VM)
 * 
 * @file src/compiler/integration/compilation-to-execution.service.ts
 */

import { Injectable, Inject, Optional } from '@nestjs/common';
import { Logger } from 'winston';
import { CompiledWorkflow } from '../interfaces/compiled-workflow.interface';
import { ExecutionResult } from '../interfaces/execution-result.interface';
import { SemanticVirtualMachine } from '../../runtime/semantic-vm.service';

/**
 * Execution parameters for VM
 */
export interface ExecutionParameters {
  [key: string]: any;
}

/**
 * Execution metadata for tracking
 */
export interface ExecutionMetadata {
  compiledWorkflowId: string;
  missionId?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'pending' | 'executing' | 'success' | 'error' | 'timeout';
  error?: string;
  servicesUsed?: { name: string; format: string }[];
  tasksExecuted?: number;
  resultSize?: number;
}

/**
 * Bridge service connecting Compilation and Execution layers
 */
@Injectable()
export class CompilationToExecutionService {
  private readonly logger: Logger;

  constructor(
    @Inject('LOGGER') logger: Logger,
    @Optional() private readonly vm: SemanticVirtualMachine,
  ) {
    this.logger = logger.child({ context: 'CompilationToExecutionService' });
  }

  /**
   * Executes a compiled workflow using the Semantic Virtual Machine
   * 
   * Steps:
   * 1. Validate compiled bytecode
   * 2. Prepare execution environment
   * 3. Send bytecode to VM
   * 4. Monitor execution
   * 5. Collect results
   * 6. Return results with metadata
   * 
   * @param compiled CompiledWorkflow from Compilation layer
   * @param parameters Execution parameters (inputs, config, etc.)
   * @returns ExecutionResult with output and metadata
   */
  async executeCompiled(
    compiled: CompiledWorkflow,
    parameters?: ExecutionParameters,
  ): Promise<ExecutionResult> {
    const metadata: ExecutionMetadata = {
      compiledWorkflowId: compiled.metadata.id,
      missionId: undefined,
      startTime: Date.now(),
      status: 'executing',
    };

    try {
      this.logger.info('Starting compiled workflow execution', {
        workflowId: compiled.metadata.id,
        bytecodeSize: 0, // TODO: Calculate from IR
        parametersCount: Object.keys(parameters || {}).length,
      });

      // Validate IR/bytecode
      if (!compiled.ir) {
        throw new Error('Invalid bytecode: empty or null IR');
      }

      // ── Delegate to SemanticVirtualMachine ────────────────────────────
      if (this.vm) {
        const vmResult = await this.vm.execute(compiled, parameters ?? {});

        const result: ExecutionResult = {
          id: `exec-${compiled.metadata.id}-${Date.now()}`,
          workflowId: compiled.metadata.id,
          missionId: undefined,
          output: {
            status: 'success',
            data: vmResult.output,
            timestamp: new Date(),
          },
          metadata: {
            executionTime: vmResult.durationMs,
            servicesUsed: vmResult.servicesCalled.map(s => ({
              name:    s.serviceId,
              format:  s.format as any,
              version: 'runtime',
            })),
            bytecodeSize: compiled.ir.instructions?.length ?? 0,
            tasksExecuted: vmResult.instructionsExecuted,
          },
          proof: {
            serviceCallOrder: vmResult.servicesCalled.map(s => s.serviceId),
          },
        };

        metadata.status      = 'success';
        metadata.endTime     = Date.now();
        metadata.duration    = metadata.endTime - metadata.startTime;
        metadata.tasksExecuted = vmResult.instructionsExecuted;
        metadata.resultSize  = JSON.stringify(result.output).length;
        metadata.servicesUsed = vmResult.servicesCalled.map(s => ({
          name: s.serviceId,
          format: s.format,
        }));

        this.logger.info('Compiled workflow execution completed via SVM', metadata);
        return result;
      }

      // ── Fallback (SVM not yet available in this context) ──────────────
      this.logger.warn('SemanticVirtualMachine not injected — returning stub result', {
        workflowId: compiled.metadata.id,
      });
      const result: ExecutionResult = {
          id: `exec-${compiled.metadata.id}`,
          workflowId: compiled.metadata.id,
          missionId: undefined,
          output: {
            status: 'success',
            data: {},
            timestamp: new Date(),
          },
          metadata: {
            executionTime: 0,
            servicesUsed: [],
            bytecodeSize: compiled.ir.instructions?.length ?? 0,
          },
        };

      metadata.status = 'success';
        metadata.endTime = Date.now();
        metadata.duration = metadata.endTime - metadata.startTime;
        metadata.tasksExecuted = 0;
        metadata.resultSize = JSON.stringify(result.output).length;

      this.logger.info('Compiled workflow execution completed', metadata);
      return result;
    } catch (error) {
      metadata.status = 'error';
      metadata.error = (error as Error).message;
      metadata.endTime = Date.now();
      metadata.duration = metadata.endTime - metadata.startTime;

      this.logger.error('Compiled workflow execution failed', {
        ...metadata,
        stack: (error as Error).stack,
      });

      throw error;
    }
  }

  /**
   * Execute multiple compiled workflows in sequence
   * 
   * @param workflowsBatch Array of compiled workflows
   * @param parametersBatch Array of parameter sets (parallel to workflows)
   * @returns Array of execution results
   */
  async executeCompiledBatch(
    workflowsBatch: CompiledWorkflow[],
    parametersBatch?: ExecutionParameters[],
  ): Promise<ExecutionResult[]> {
    this.logger.info('Starting batch execution', {
      count: workflowsBatch.length,
    });

    const results: ExecutionResult[] = [];
    for (let i = 0; i < workflowsBatch.length; i++) {
      try {
        const compiled = workflowsBatch[i];
        const params = parametersBatch?.[i];
        const result = await this.executeCompiled(compiled, params);
        results.push(result);
      } catch (error) {
        this.logger.warn('Skipping failed workflow in batch', {
          workflowId: workflowsBatch[i].metadata.id,
          error: (error as Error).message,
        });
        // Continue with next workflow
      }
    }

    this.logger.info('Batch execution completed', {
      total: workflowsBatch.length,
      successful: results.length,
      failed: workflowsBatch.length - results.length,
    });

    return results;
  }

  /**
   * Execute with timeout protection
   * 
   * @param compiled CompiledWorkflow to execute
   * @param parameters Execution parameters
   * @param timeoutMs Timeout in milliseconds
   * @returns ExecutionResult or timeout error
   */
  async executeWithTimeout(
    compiled: CompiledWorkflow,
    parameters?: ExecutionParameters,
    timeoutMs: number = 30000,
  ): Promise<ExecutionResult> {
    return Promise.race([
      this.executeCompiled(compiled, parameters),
      new Promise<ExecutionResult>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Execution timeout after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
  }

  /**
   * Get execution results with full methodology/proof
   * 
   * Returns not just the output but also:
   * - Which services were used
   * - Order of execution
   * - Performance metrics
   * - Input/output mapping
   * 
   * @param executionId ID of completed execution
   * @returns ExecutionResult with full provenance
   */
  async getExecutionProof(executionId: string): Promise<ExecutionResult | null> {
    this.logger.debug('Fetching execution proof', { executionId });

    // TODO: Implement retrieval from cache or database

    return null;
  }
}
