/**
 * TASK EXECUTION SERVICE
 * 
 * Gère la compilation et l'exécution des tâches de l'utilisateur
 * Flux complet: User Request → IR Generation → Stage 7 → Stage 8 → Layer 5
 */

import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ServiceResolutionService } from './stages/stage-7-service-resolution.service';
import { ServicePreloaderService } from './stages/stage-8-service-preloader.service';
import { SemanticVirtualMachine } from '../runtime/semantic-vm.service';
import {
  LLMIntermediateRepresentation,
  IROpcode,
} from './interfaces/ir.interface';
import {
  AVAILABLE_ACTIONS,
  getActionDetails,
  getAllServiceIds,
  AVAILABLE_CONNECTORS,
} from './manifest';

export interface UserTaskRequest {
  userId: string;
  action: string; // e.g., 'analyze-sentiment', 'process-image'
  parameters: Record<string, any>;
}

export interface TaskExecutionResult {
  taskId: string;
  userId: string;
  action: string;
  status: 'success' | 'failed' | 'error';
  result?: any;
  compilationTime: number;
  executionTime: number;
  totalTime: number;
  services: string[];
  error?: string;
}

@Injectable()
export class TaskExecutionService {
  private readonly logger = new Logger(TaskExecutionService.name);

  constructor(
    private resolutionService: ServiceResolutionService,
    private preloaderService: ServicePreloaderService,
    private vm: SemanticVirtualMachine,
  ) {}

  /**
   * Execute a user task through the full compilation pipeline
   */
  async executeTask(request: UserTaskRequest): Promise<TaskExecutionResult> {
    const taskId = `task-${Date.now()}`;
    const totalStartTime = Date.now();

    this.logger.log(`[Task ${taskId}] Starting execution for user ${request.userId}`);
    this.logger.log(`[Task ${taskId}] Action: ${request.action}`);
    this.logger.log(`[Task ${taskId}] Parameters: ${JSON.stringify(request.parameters)}`);

    try {
      // STEP 1: Validate action
      if (!this.isActionAvailable(request.action)) {
        throw new BadRequestException(
          `Action "${request.action}" is not available. Available actions: ${Object.keys(AVAILABLE_ACTIONS).join(', ')}`
        );
      }

      const actionDetails = getActionDetails(request.action);
      this.logger.log(`[Task ${taskId}] Action details: ${JSON.stringify(actionDetails)}`);

      // STEP 2: Validate parameters
      const missingParams = actionDetails.parameters.filter(
        (param: string) => !(param in request.parameters)
      );
      if (missingParams.length > 0) {
        throw new BadRequestException(
          `Missing required parameters: ${missingParams.join(', ')}`
        );
      }

      // STEP 3: Generate IR from user request (simulated Layer 4)
      this.logger.log(`[Task ${taskId}] [Layer 4] Generating IR bytecode...`);
      const compilationStartTime = Date.now();

      const ir = this.generateIRFromUserRequest(request, actionDetails);
      this.logger.log(
        `[Task ${taskId}] [Layer 4] Generated IR with ${ir.instructions.length} instructions`
      );

      // STEP 4: Stage 7 - Service Resolution
      this.logger.log(`[Task ${taskId}] [Stage 7] Resolving services...`);

      const resolved = await this.resolutionService.resolveServices(ir);

      const resolvedServiceIds = resolved.resolvedServices.map(s => s.serviceId);
      this.logger.log(
        `[Task ${taskId}] [Stage 7] Resolved ${resolved.resolvedServices.length} services: ${resolvedServiceIds.join(', ')}`
      );

      // STEP 5: Stage 8 - Service Pre-loading
      this.logger.log(`[Task ${taskId}] [Stage 8] Pre-loading services...`);

      const compiled = await this.preloaderService.preloadServices(
        resolved,
        request.userId,
        `${request.action}-workflow`
      );

      const compilationTime = Date.now() - compilationStartTime;
      this.logger.log(
        `[Task ${taskId}] [Stage 8] Pre-loading complete. Workflow ID: ${compiled.metadata.id}`
      );

      // STEP 6: Layer 5 - Execute
      this.logger.log(`[Task ${taskId}] [Layer 5] Executing workflow...`);
      const executionStartTime = Date.now();

      const executionResult = await this.vm.execute(compiled, {});

      const executionTime = Date.now() - executionStartTime;
      const totalTime = Date.now() - totalStartTime;

      this.logger.log(`[Task ${taskId}] [Layer 5] Execution complete in ${executionTime}ms`);
      this.logger.log(`[Task ${taskId}] Total pipeline time: ${totalTime}ms`);

      return {
        taskId,
        userId: request.userId,
        action: request.action,
        status: 'success',
        result: {
          output: executionResult.output,
          instructionsExecuted: executionResult.instructionsExecuted,
          servicesCalled: executionResult.servicesCalled.map(s => ({
            serviceId: s.serviceId,
            format: s.format,
            duration: s.durationMs,
          })),
        },
        compilationTime,
        executionTime,
        totalTime,
        services: resolvedServiceIds,
      };
    } catch (error: any) {
      const totalTime = Date.now() - totalStartTime;

      this.logger.error(`[Task ${taskId}] Error: ${error.message}`);
      this.logger.error(`[Task ${taskId}] Stack: ${error.stack}`);

      return {
        taskId,
        userId: request.userId,
        action: request.action,
        status: 'error',
        compilationTime: 0,
        executionTime: 0,
        totalTime,
        services: [],
        error: error.message,
      };
    }
  }

  /**
   * Generate IR from user request (simulates Layer 4 - LLM output)
   */
  private generateIRFromUserRequest(
    request: UserTaskRequest,
    actionDetails: any
  ): LLMIntermediateRepresentation {
    const instructions = [];
    let instructionIndex = 0;
    const dependencyGraph = new Map<number, number[]>();
    const requiredServices = actionDetails.requires as string[];

    // INSTRUCTION 0: Load input parameters
    instructions.push({
      index: instructionIndex,
      opcode: IROpcode.LOAD_RESOURCE,
      dest: 0,
      operands: { resourceId: 0 },
    });
    dependencyGraph.set(instructionIndex, []);
    instructionIndex++;

    // INSTRUCTIONS 1..N: Call required services
    const serviceCallRegisters: number[] = [];
    for (let i = 0; i < requiredServices.length; i++) {
      const serviceId = requiredServices[i];
      const register = i + 1;

      instructions.push({
        index: instructionIndex,
        opcode: IROpcode.CALL_SERVICE,
        dest: register,
        src: [0],
        serviceId,
        serviceVersion: this.getServiceVersion(serviceId),
      });

      serviceCallRegisters.push(register);
      dependencyGraph.set(instructionIndex, [0]); // Depends on load
      instructionIndex++;
    }

    // INSTRUCTION N+1: Combine results if multiple services
    if (serviceCallRegisters.length > 1) {
      instructions.push({
        index: instructionIndex,
        opcode: IROpcode.STORE_MEMORY,
        dest: serviceCallRegisters.length + 1,
        src: serviceCallRegisters,
        operands: { format: 'combined' },
      });
      dependencyGraph.set(
        instructionIndex,
        serviceCallRegisters.map((_, i) => i + 1)
      );
      instructionIndex++;
    }

    // FINAL: Return instruction
    const outputRegister = serviceCallRegisters.length > 1
      ? serviceCallRegisters.length + 1
      : serviceCallRegisters[0];

    instructions.push({
      index: instructionIndex,
      opcode: IROpcode.RETURN,
      src: [outputRegister],
    });
    dependencyGraph.set(instructionIndex, [outputRegister]);

    // Build instruction order
    const instructionOrder = Array.from(
      { length: instructions.length },
      (_, i) => i
    );

    // Build resource table from parameters
    const resourceTable = [
      {
        handleId: 0,
        type: 'cache' as const,
        metadata: {
          name: 'user-parameters',
          ...request.parameters,
        },
      },
    ];

    return {
      instructions,
      instructionOrder,
      dependencyGraph,
      resourceTable,
      parallelizationGroups: [],
      schemas: [],
      semanticContext: {
        embeddings: [],
        relationships: [],
        fallbackStrategies: [],
      },
      inputRegister: 0,
      outputRegister,
      metadata: {
        compiledAt: new Date(),
        compilerVersion: '1.0.0',
        source: `User action: ${request.action} with parameters: ${JSON.stringify(request.parameters)}`,
      },
    };
  }

  /**
   * Get service version
   */
  private getServiceVersion(serviceId: string): string {
    const serviceIdVersionMap: Record<string, string> = {
      'sentiment-analyzer': '2.1.0',
      'image-processor': '1.5.0',
      'github-search': '1.0.0',
      'ml-trainer': '3.0.0',
    };

    return serviceIdVersionMap[serviceId] || '1.0.0';
  }

  /**
   * Check if action is available
   */
  private isActionAvailable(action: string): boolean {
    return action in AVAILABLE_ACTIONS;
  }

  /**
   * Get system information
   */
  getSystemInfo() {
    return {
      availableActions: Object.keys(AVAILABLE_ACTIONS),
      availableServiceIds: getAllServiceIds(),
      availableConnectors: AVAILABLE_CONNECTORS.map(c => ({
        id: c.id,
        name: c.name,
        services: c.services,
      })),
      totalServices: getAllServiceIds().length,
    };
  }
}
