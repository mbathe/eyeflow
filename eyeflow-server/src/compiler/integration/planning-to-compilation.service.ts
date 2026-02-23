/**
 * Planning to Compilation Bridge Service
 * 
 * Converts Mission entities from Planning layer into compiled bytecode
 * for execution in the Semantic Virtual Machine.
 * 
 * Part of Option 1 architecture:
 * Planning Layer → [THIS SERVICE] → Compilation Layer → Execution Layer
 * 
 * @file src/compiler/integration/planning-to-compilation.service.ts
 */

import { Injectable, Inject, Optional } from '@nestjs/common';
import { Logger } from 'winston';
import {
  CompiledWorkflow,
  CompiledWorkflowImpl,
  PreLoadedServices,
} from '../interfaces/compiled-workflow.interface';
import {
  LLMIntermediateRepresentation,
  IROpcode,
} from '../interfaces/ir.interface';
import { ServiceResolutionService } from '../stages/stage-7-service-resolution.service';
import { ServicePreloaderService } from '../stages/stage-8-service-preloader.service';

/**
 * Mission-like entity from Planning layer
 * Actual type will be imported from TasksModule when needed
 */
export interface PlanningMission {
  id: string;
  name: string;
  actions?: any[];
}

/**
 * Compilation metadata for tracking
 */
export interface CompilationMetadata {
  missionId: string;
  missionName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'pending' | 'compiling' | 'success' | 'error';
  error?: string;
  bytecodeSize?: number;
  servicesUsed?: string[];
}

/**
 * Bridge service connecting Planning and Compilation layers
 */
@Injectable()
export class PlanningToCompilationService {
  private readonly logger: Logger;

  constructor(
    @Inject('LOGGER') logger: Logger,
    @Optional() private readonly serviceResolution: ServiceResolutionService,
    @Optional() private readonly servicePreloader: ServicePreloaderService,
  ) {
    this.logger = logger.child({ context: 'PlanningToCompilationService' });
  }

  /**
   * Converts a Mission from Planning layer into compiled bytecode
   * 
   * Steps:
   * 1. Extract actions/triggers/conditions from Mission
   * 2. Build execution graph from mission decomposition
   * 3. Generate IR bytecode
   * 4. Optimize bytecode
   * 5. Resolve services needed by actions
   * 6. Pre-load services for execution
   * 
   * @param mission Mission entity from Planning layer
   * @returns CompiledWorkflow ready for VM execution
   */
  async compileMission(mission: PlanningMission): Promise<CompiledWorkflow> {
    const metadata: CompilationMetadata = {
      missionId: mission.id,
      missionName: mission.name,
      startTime: Date.now(),
      status: 'compiling',
    };

    try {
      this.logger.info('Starting mission compilation', {
        missionId: mission.id,
        missionName: mission.name,
        actionCount: mission.actions?.length || 0,
      });

      // Step 1: Build LLM-IR from mission actions
      const ir = this.missionToIR(mission);

      // Step 2: Resolve service dispatch metadata (Stage 7) — if available
      let resolvedIR: any = ir;
      if (this.serviceResolution) {
        try {
          resolvedIR = await this.serviceResolution.resolveServices(ir);
          this.logger.info('Stage 7 service resolution complete', {
            missionId: mission.id,
          });
        } catch (resolveError) {
          this.logger.warn('Stage 7 service resolution failed — continuing without dispatch metadata', {
            missionId: mission.id,
            error: (resolveError as Error).message,
          });
        }
      }

      // Step 3: Pre-load services (Stage 8) — if available
      let compiled: CompiledWorkflow;
      if (this.servicePreloader) {
        compiled = await this.servicePreloader.preloadServices(
          resolvedIR,
          'system',
          mission.name,
        );
        this.logger.info('Stage 8 service preloading complete', {
          missionId: mission.id,
        });
      } else {
        // Fallback: wrap the IR in a minimal CompiledWorkflowImpl
        const emptyServices: PreLoadedServices = {
          wasm: new Map(),
          mcp: new Map(),
          native: new Map(),
          docker: new Map(),
        };
        compiled = new CompiledWorkflowImpl(ir, emptyServices, {
          id: `compiled-${mission.id}`,
          compiledAt: new Date(),
          compilerVersion: '1.0.0',
          checksum: '',
          userId: 'system',
          workflowName: mission.name,
        });
      }

      metadata.status = 'success';
      metadata.endTime = Date.now();
      metadata.duration = metadata.endTime - metadata.startTime;
      metadata.bytecodeSize = ir.instructions.length;
      metadata.servicesUsed = ir.instructions
        .filter(i => i.opcode === IROpcode.CALL_SERVICE || i.opcode === IROpcode.CALL_MCP)
        .map(i => String(i.serviceId ?? i.index));

      this.logger.info('Mission compilation completed', metadata);
      return compiled;
    } catch (error) {
      metadata.status = 'error';
      metadata.error = (error as Error).message;
      metadata.endTime = Date.now();
      metadata.duration = metadata.endTime - metadata.startTime;

      this.logger.error('Mission compilation failed', {
        ...metadata,
        stack: (error as Error).stack,
      });

      throw error;
    }
  }

  /**
   * Batch compile multiple missions
   * 
   * @param missions Array of Mission entities
   * @returns Array of CompiledWorkflows
   */
  async compileMissions(missions: PlanningMission[]): Promise<CompiledWorkflow[]> {
    this.logger.info('Starting batch mission compilation', {
      count: missions.length,
    });

    const results: CompiledWorkflow[] = [];
    for (const mission of missions) {
      try {
        const compiled = await this.compileMission(mission);
        results.push(compiled);
      } catch (error) {
        this.logger.warn('Skipping failed mission in batch', {
          missionId: mission.id,
          error: (error as Error).message,
        });
        // Continue with next mission
      }
    }

    this.logger.info('Batch compilation completed', {
      total: missions.length,
      successful: results.length,
      failed: missions.length - results.length,
    });

    return results;
  }

  /**
   * Validate mission can be compiled before attempting full compilation
   * 
   * Checks:
   * - Mission has valid structure
   * - All actions are supported
   * - All triggers are valid
   * - All conditions are evaluable
   * 
   * @param mission Mission to validate
   * @returns Validation result with details
   */
  async validateMission(mission: PlanningMission): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // TODO: Implement validation logic
    // - Check mission structure
    // - Validate actions
    // - Validate triggers/conditions

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Convert a PlanningMission into a minimal LLMIntermediateRepresentation.
   * One IR instruction is generated per action.
   */
  private missionToIR(mission: PlanningMission): LLMIntermediateRepresentation {
    const actions = mission.actions ?? [];
    const instructions: any[] = actions.map((action: any, idx: number) => ({
      index: idx,
      opcode: this.actionTypeToOpcode(action.type ?? action.kind ?? 'llm'),
      serviceId: action.service ?? action.serviceId,
      operands: action,
    }));

    return {
      instructions,
      instructionOrder: instructions.map((_: any, i: number) => i),
      dependencyGraph: new Map<number, number[]>(),
      resourceTable: [],
      parallelizationGroups: [],
      schemas: [],
      semanticContext: { embeddings: [], terms: [], relevanceMatrix: [] } as any,
      inputRegister: 0,
      outputRegister: Math.max(0, instructions.length - 1),
      metadata: {
        compiledAt: new Date(),
        compilerVersion: '1.0.0',
        source: mission.name,
        workflowId: mission.id,
      },
    } as unknown as LLMIntermediateRepresentation;
  }

  /**
   * Map an action type string to the nearest IROpcode.
   */
  private actionTypeToOpcode(type: string): IROpcode {
    switch (type?.toLowerCase()) {
      case 'llm':
      case 'llm_call':
      case 'generate':
        return IROpcode.LLM_CALL;
      case 'service':
      case 'service_call':
      case 'api':
        return IROpcode.CALL_SERVICE;
      case 'mcp':
        return IROpcode.CALL_MCP;
      case 'branch':
      case 'condition':
      case 'if':
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
      case 'validate':
        return IROpcode.VALIDATE;
      default:
        return IROpcode.LLM_CALL;
    }
  }
}
