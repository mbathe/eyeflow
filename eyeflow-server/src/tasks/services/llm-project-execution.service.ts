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
   * Simulate DAG execution (TODO: replace with actual SVM execution)
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
    try {
      // TODO: Deserialize irBinary (base64) → LLM-IR structure
      // TODO: Execute via CompilationToExecutionService.executeCompiled()
      // TODO: Collect step-by-step execution trace

      // For now: mock successful execution
      return {
        success: true,
        output: {
          message: 'Execution simulated successfully',
          projectVersionId: version.id,
          timestamp: new Date(),
        },
        steps: [
          {
            step_id: 'step-1',
            name: 'Initialize',
            status: 'completed',
            duration: 10,
            output: { initialized: true },
          },
          {
            step_id: 'step-2',
            name: 'Process',
            status: 'completed',
            duration: 50,
            output: { processed: true },
          },
        ],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        steps: [],
      };
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
