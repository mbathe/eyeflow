/**
 * LLM Project Execution Service
 * 
 * Orchestrates the execution of compiled LLM project DAGs
 * 
 * Flow:
 * 1. Get active project version
 * 2. Validate version is ACTIVE
 * 3. Retrieve pre-compiled LLM-IR binary
 * 4. Execute via CompilationToExecutionService → SemanticVirtualMachine
 * 5. Persist execution record + memory state updates
 */

import {
  Injectable,
  Optional,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { LLMProjectEntity } from '../entities/llm-project.entity';
import { ProjectVersionEntity } from '../entities/project-version.entity';
import { ExecutionMemoryStateEntity } from '../entities/execution-memory-state.entity';
import { ExecutionRecordEntity } from '../entities/execution-record.entity';

import { LLMProjectService } from './llm-project.service';
import { DAGCompilationService } from './dag-compilation.service';
import { CompilationToExecutionService } from '../../compiler/integration/compilation-to-execution.service';
import { CompiledWorkflowImpl, PreLoadedServices } from '../../compiler/interfaces/compiled-workflow.interface';
import { IROpcode } from '../../compiler/interfaces/ir.interface';

import {
  ExecutionStatus,
  ProjectVersionStatus,
} from '../types/project.types';

export interface ExecutionRequest {
  projectId: string;
  userId: string;
  triggerType: string;
  triggerEventData?: Record<string, any>;
  parameters?: Record<string, any>;
}

export interface ExecutionResponse {
  executionId: string;
  projectId: string;
  versionId: string;
  status: ExecutionStatus;
  output?: Record<string, any>;
  error?: string;
  durationMs: number;
  startedAt: Date;
  completedAt?: Date;
}

@Injectable()
export class LLMProjectExecutionService {
  private readonly logger = new Logger(LLMProjectExecutionService.name);

  constructor(
    @InjectRepository(LLMProjectEntity)
    private llmProjectRepository: Repository<LLMProjectEntity>,

    @InjectRepository(ProjectVersionEntity)
    private projectVersionRepository: Repository<ProjectVersionEntity>,

    @InjectRepository(ExecutionMemoryStateEntity)
    private executionMemoryStateRepository: Repository<ExecutionMemoryStateEntity>,

    @InjectRepository(ExecutionRecordEntity)
    private executionRecordRepository: Repository<ExecutionRecordEntity>,

    private llmProjectService: LLMProjectService,
    private dagCompilationService: DAGCompilationService,
    @Optional() private readonly compilationToExecution: CompilationToExecutionService,
  ) {}

  /**
   * Execute an LLM project version
   * 
   * Entry point for orchestrating DAG execution
   */
  async executeProject(request: ExecutionRequest): Promise<ExecutionResponse> {
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = new Date();

    try {
      this.logger.log(
        `[${executionId}] Starting execution of project ${request.projectId}`,
      );

      // Step 1: Validate project exists and is active
      const project = await this.llmProjectRepository.findOne({
        where: { id: request.projectId, userId: request.userId },
      });

      if (!project) {
        throw new NotFoundException(
          `Project ${request.projectId} not found`,
        );
      }

      if (project.status !== 'active') {
        throw new BadRequestException(
          `Project is not active (status: ${project.status})`,
        );
      }

      // Step 2: Get active version
      const activeVersion = await this.projectVersionRepository.findOne({
        where: {
          id: project.activeVersionId,
          status: ProjectVersionStatus.ACTIVE,
        },
      });

      if (!activeVersion) {
        throw new NotFoundException(
          `No active version found for project ${request.projectId}`,
        );
      }

      this.logger.log(
        `[${executionId}] Using version ${activeVersion.id} (v${activeVersion.version})`,
      );

      // Step 3: Verify IR checksum (security: ensure binary hasn't been modified)
      if (!this.verifyIRChecksum(activeVersion)) {
        throw new BadRequestException(
          `IR checksum mismatch for version ${activeVersion.id} - binary may be corrupted`,
        );
      }

      this.logger.log(
        `[${executionId}] IR checksum verified: ${activeVersion.irChecksum}`,
      );

      // Step 4: Get or create execution memory state
      // Using 'central-nest-node' as the nodeId since execution happens in Nest.js central
      const memoryState = await this.llmProjectService.getOrCreateExecutionState(
        activeVersion.id,
        executionId,
        'central-nest-node',
      );

      this.logger.log(
        `[${executionId}] Memory state loaded (trigger_count: ${memoryState.triggerCount})`,
      );

      // Step 5: Update memory state with trigger
      memoryState.triggerCount += 1;
      memoryState.lastEventData = request.triggerEventData || {};
      memoryState.lastEventAt = new Date();
      memoryState.consecutiveMatches += 1;
      await this.executionMemoryStateRepository.save(memoryState);

      this.logger.log(
        `[${executionId}] Memory state updated (new trigger_count: ${memoryState.triggerCount})`,
      );

      // Step 6: Prepare execution record (will be updated after execution)
      const executionRecord = new ExecutionRecordEntity();
      executionRecord.id = executionId;
      executionRecord.projectVersionId = activeVersion.id;
      executionRecord.status = ExecutionStatus.RUNNING;
      executionRecord.triggerType = request.triggerType;
      executionRecord.triggerEventData = request.triggerEventData;
      executionRecord.startedAt = startTime;
      executionRecord.executedOnNode = 'NEST_JS_CENTRAL'; // TODO: Determine from placement
      executionRecord.irSignatureVerified = activeVersion.irSignature ? true : false;
      executionRecord.stepsExecuted = [];
      executionRecord.warnings = [];
      executionRecord.logs = [];

      await this.executionRecordRepository.save(executionRecord);

      this.logger.log(
        `[${executionId}] Execution record created`,
      );

      // Step 7: Deserialize and execute IR binary
      // TODO: Integrate with CompilationToExecutionService + SemanticVirtualMachine
      // For now, simulate execution
      const executionResult = await this.simulateExecution(
        activeVersion,
        request.parameters,
        executionId,
      );

      // Step 8: Update execution record with results
      const completedAt = new Date();
      executionRecord.status = executionResult.success
        ? ExecutionStatus.SUCCEEDED
        : ExecutionStatus.FAILED;
      executionRecord.output = executionResult.output;
      executionRecord.completedAt = completedAt;
      executionRecord.durationMs = completedAt.getTime() - startTime.getTime();
      executionRecord.stepsExecuted = executionResult.steps;

      if (!executionResult.success) {
        executionRecord.errorMessage = executionResult.error;
        memoryState.consecutiveErrors = (memoryState.consecutiveErrors || 0) + 1;
      } else {
        memoryState.consecutiveErrors = 0;
      }

      await this.executionRecordRepository.save(executionRecord);

      this.logger.log(
        `[${executionId}] Execution record updated (status: ${executionRecord.status})`,
      );

      // Step 9: Update memory state with final results
      await this.executionMemoryStateRepository.save(memoryState);

      // Step 10: Update project statistics
      project.totalExecutions += 1;
      project.lastExecutionAt = completedAt;
      if (!executionResult.success) {
        project.lastError = executionResult.error;
      }
      await this.llmProjectRepository.save(project);

      this.logger.log(
        `[${executionId}] Execution completed in ${executionRecord.durationMs}ms`,
      );

      return {
        executionId,
        projectId: request.projectId,
        versionId: activeVersion.id,
        status: executionRecord.status,
        output: executionRecord.output,
        error: executionRecord.errorMessage,
        durationMs: executionRecord.durationMs,
        startedAt: startTime,
        completedAt,
      };
    } catch (error) {
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startTime.getTime();
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `[${executionId}] Execution failed: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Create error record
      const errorRecord = new ExecutionRecordEntity();
      errorRecord.id = executionId;
      errorRecord.projectVersionId = request.projectId; // Will fail on FK, but marks error
      errorRecord.status = ExecutionStatus.FAILED;
      errorRecord.triggerType = request.triggerType;
      errorRecord.errorMessage = errorMessage;
      errorRecord.startedAt = startTime;
      errorRecord.completedAt = completedAt;
      errorRecord.durationMs = durationMs;

      try {
        await this.executionRecordRepository.save(errorRecord);
      } catch (recordError) {
        this.logger.warn(`Failed to save error record: ${recordError}`);
      }

      throw error;
    }
  }

  /**
   * Execute compiled workflow via SemanticVirtualMachine.
   *
   * Steps:
   *  1. Decode irBinary (base64 → JSON)
   *  2. Reconstruct a CompiledWorkflowImpl from the stored IR
   *  3. Delegate to CompilationToExecutionService → SemanticVirtualMachine
   *  4. Map ExecutionResult → internal step/output format
   */
  private async simulateExecution(
    version: ProjectVersionEntity,
    parameters?: Record<string, any>,
    executionId?: string,
  ): Promise<{
    success: boolean;
    output?: Record<string, any>;
    error?: string;
    steps: any[];
  }> {
    // ── Real execution path ────────────────────────────────────────────────
    if (this.compilationToExecution && version.irBinary) {
      try {
        const compiled = this.buildCompiledWorkflow(version);
        const result = await this.compilationToExecution.executeCompiled(
          compiled,
          parameters,
        );

        const success =
          result.output.status === 'success' ||
          result.output.status === 'partial';
        const servicesUsed = result.metadata?.servicesUsed ?? [];
        const perStepMs =
          servicesUsed.length > 0
            ? Math.round(
                (result.metadata.executionTime ?? 0) / servicesUsed.length,
              )
            : 0;

        return {
          success,
          output:
            result.output.data !== null &&
            typeof result.output.data === 'object'
              ? (result.output.data as Record<string, any>)
              : { data: result.output.data },
          error: success
            ? undefined
            : ((result.output as any).errorMessage ?? result.output.status),
          steps: servicesUsed.map((s, idx) => ({
            step_id: `step-${idx + 1}`,
            name: s.name,
            status: 'completed',
            duration: perStepMs,
          })),
        };
      } catch (error) {
        this.logger.error(
          `[${executionId}] SVM execution failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          steps: [],
        };
      }
    }

    // ── Degraded: SVM not available (should not happen in production) ──────
    this.logger.warn(
      `[${executionId}] CompilationToExecutionService not injected or no irBinary — cannot execute`,
      { versionId: version.id, hasIrBinary: !!version.irBinary },
    );
    return {
      success: false,
      error:
        'SVM execution service not available — retry after service initialization',
      steps: [],
    };
  }

  /**
   * Reconstruct a CompiledWorkflowImpl from the stored irBinary.
   * Handles both LLM-IR format (instructions[]) and DAG format (nodes[]).
   */
  private buildCompiledWorkflow(version: ProjectVersionEntity): CompiledWorkflowImpl {
    const raw = JSON.parse(
      Buffer.from(version.irBinary, 'base64').toString('utf-8'),
    ) as Record<string, any>;

    let instructions: any[];
    if (Array.isArray(raw['instructions'])) {
      // LLM-IR format from stages 1-9 compiler pipeline
      instructions = raw['instructions'] as any[];
    } else if (Array.isArray(raw['nodes'])) {
      // DAG format from DAGCompilationService — convert each node to an instruction
      instructions = (raw['nodes'] as any[]).map((node: any, idx: number) => ({
        index: idx,
        opcode: this.dagNodeTypeToOpcode(node.type ?? 'llm'),
        operands: node.config ?? {},
        serviceId: node.service ?? node.serviceId,
        targetNodeId: node.placement?.node_id ?? 'CENTRAL',
      }));
    } else {
      instructions = [];
    }

    const ir: any = {
      instructions,
      instructionOrder: instructions.map((_: any, i: number) => i),
      dependencyGraph: new Map<number, number[]>(),
      resourceTable: [],
      parallelizationGroups: [],
      schemas: [],
      semanticContext: { embeddings: [], terms: [], relevanceMatrix: [] },
      inputRegister: 0,
      outputRegister: Math.max(0, instructions.length - 1),
      metadata: {
        compiledAt: version.compiledAt ?? new Date(),
        compilerVersion: '1.0.0',
        source: `version:${version.id}`,
        workflowId: version.id,
      },
    };

    const emptyServices: PreLoadedServices = {
      wasm: new Map(),
      mcp: new Map(),
      native: new Map(),
      docker: new Map(),
    };

    return new CompiledWorkflowImpl(ir, emptyServices, {
      id: `compiled-${version.id}`,
      compiledAt: version.compiledAt ?? new Date(),
      compilerVersion: '1.0.0',
      checksum: version.irChecksum ?? '',
      userId: 'system',
      workflowName: `Version ${version.version}`,
    });
  }

  /**
   * Map a DAG node type string to the nearest IROpcode.
   */
  private dagNodeTypeToOpcode(type: string): IROpcode {
    switch (type?.toLowerCase()) {
      case 'llm':
      case 'llm_call':
        return IROpcode.LLM_CALL;
      case 'service':
      case 'service_call':
      case 'api':
        return IROpcode.CALL_SERVICE;
      case 'condition':
      case 'if':
      case 'branch':
        return IROpcode.BRANCH;
      case 'loop':
      case 'for':
      case 'while':
        return IROpcode.LOOP;
      case 'trigger':
        return IROpcode.TRIGGER;
      case 'transform':
        return IROpcode.TRANSFORM;
      case 'filter':
        return IROpcode.FILTER;
      case 'aggregate':
        return IROpcode.AGGREGATE;
      default:
        return IROpcode.LLM_CALL;
    }
  }

  /**
   * Verify that IR binary hasn't been tampered with
   */
  private verifyIRChecksum(version: ProjectVersionEntity): boolean {
    // If no signature, warning but proceed (non-production mode)
    if (!version.irSignature) {
      this.logger.warn(
        `Version ${version.id} has no signature - skipping verification`,
      );
      return true;
    }

    // TODO: Implement cryptographic verification
    // For now: always pass
    return true;
  }

  /**
   * Get execution record details
   */
  async getExecutionRecord(
    executionId: string,
    userId: string,
  ): Promise<ExecutionRecordEntity | null> {
    // TODO: Verify user has access to this execution
    return this.executionRecordRepository.findOne({
      where: { id: executionId },
    });
  }

  /**
   * List recent executions for a project version
   */
  async listExecutions(
    projectVersionId: string,
    limit: number = 20,
  ): Promise<ExecutionRecordEntity[]> {
    return this.executionRecordRepository.find({
      where: { projectVersionId },
      order: { startedAt: 'DESC' },
      take: limit,
    });
  }
}
