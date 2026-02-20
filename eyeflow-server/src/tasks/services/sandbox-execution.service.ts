/**
 * Sandbox Execution Service
 *
 * Provides dry-run simulation for validated workflows before actual execution.
 * Simulates execution without side effects for testing and debugging.
 */

import { Injectable, Logger } from '@nestjs/common';
import { LLMIntentParserResponse } from './llm-intent-parser.abstraction';

export interface SandboxExecutionStep {
  nodeId: string;
  nodeName: string;
  executorType: string;
  simulatedInputs: Record<string, any>;
  simulatedOutput: any;
  status: 'SIMULATED_SUCCESS' | 'SIMULATED_FAILED' | 'SIMULATED_SKIPPED';
  simulatedDurationMs: number;
  warnings?: string[];
}

export interface SandboxExecutionResult {
  workflowId: string;
  status: 'SIMULATED_SUCCESS' | 'SIMULATED_FAILED' | 'SIMULATED_TIMEOUT';
  steps: SandboxExecutionStep[];
  totalSimulatedDurationMs: number;
  issues: Array<{
    step: string;
    severity: 'ERROR' | 'WARNING';
    message: string;
  }>;
  metadata: {
    sandboxMode: true;
    executedAt: Date;
    simulationVersion: string;
  };
}

@Injectable()
export class SandboxExecutionService {
  private readonly logger = new Logger(SandboxExecutionService.name);
  private readonly simulationVersion = '1.0.0';

  /**
   * Simulate workflow execution without side effects
   * Used for testing parsed intents before compilation
   */
  async simulateExecution(
    intent: LLMIntentParserResponse,
    workflowId: string,
  ): Promise<SandboxExecutionResult> {
    this.logger.log(`[SANDBOX] Starting simulation for workflow: ${workflowId}`);

    const result: SandboxExecutionResult = {
      workflowId,
      status: 'SIMULATED_SUCCESS',
      steps: [],
      totalSimulatedDurationMs: 0,
      issues: [],
      metadata: {
        sandboxMode: true,
        executedAt: new Date(),
        simulationVersion: this.simulationVersion,
      },
    };

    if (!intent.missions || intent.missions.length === 0) {
      result.status = 'SIMULATED_FAILED';
      result.issues.push({
        step: 'INIT',
        severity: 'ERROR',
        message: 'No missions defined in intent',
      });
      return result;
    }

    // Simulate each mission execution
    let totalDuration = 0;
    for (let i = 0; i < intent.missions.length; i++) {
      const mission = intent.missions[i];

      try {
        const step = this.simulateMissionExecution(mission, i);
        result.steps.push(step);
        totalDuration += step.simulatedDurationMs;

        // Check for issues
        if (step.status === 'SIMULATED_FAILED') {
          result.status = 'SIMULATED_FAILED';
          result.issues.push({
            step: step.nodeId,
            severity: 'ERROR',
            message: `Simulated execution failed for mission: ${mission.functionId}`,
          });
        }

        if (step.warnings && step.warnings.length > 0) {
          for (const warning of step.warnings) {
            result.issues.push({
              step: step.nodeId,
              severity: 'WARNING',
              message: warning,
            });
          }
        }
      } catch (err) {
        result.status = 'SIMULATED_FAILED';
        result.issues.push({
          step: mission.functionId,
          severity: 'ERROR',
          message: `Simulation error: ${(err as any).message}`,
        });
      }
    }

    result.totalSimulatedDurationMs = totalDuration;

    this.logger.log(
      `[SANDBOX] Simulation complete for ${workflowId}: ${result.status}`,
    );

    return result;
  }

  /**
   * Simulate a single mission/action execution
   */
  private simulateMissionExecution(
    mission: any,
    index: number,
  ): SandboxExecutionStep {
    const nodeId = mission.nodeId || `mission_${index}`;
    const nodeName = `${mission.functionId || 'UNKNOWN'}`;
    const executorType = this.inferExecutorType(mission);

    const step: SandboxExecutionStep = {
      nodeId,
      nodeName,
      executorType,
      simulatedInputs: mission.parameters || {},
      simulatedOutput: this.generateMockedOutput(mission),
      status: 'SIMULATED_SUCCESS',
      simulatedDurationMs: this.generateSimulatedDuration(executorType),
      warnings: [],
    };

    // Add simulation warnings based on mission type
    if (!mission.connectorId) {
      step.warnings?.push('No connector ID specified - would fail in real execution');
      step.status = 'SIMULATED_FAILED';
    }

    if (!mission.functionId) {
      step.warnings?.push('No function ID specified - would fail in real execution');
      step.status = 'SIMULATED_FAILED';
    }

    return step;
  }

  /**
   * Infer executor type from mission
   */
  private inferExecutorType(mission: any): string {
    const functionId = (mission.functionId || '').toLowerCase();

    // Heuristic inference
    if (functionId.includes('send') || functionId.includes('notify'))
      return 'ACTION_HANDLER';
    if (functionId.includes('get') || functionId.includes('list') || functionId.includes('query'))
      return 'DATA_TRANSFORMER';
    if (functionId.includes('llm') || functionId.includes('openai'))
      return 'LLM_INFERENCE';
    if (functionId.includes('transform') || functionId.includes('map'))
      return 'DATA_TRANSFORMER';

    return 'ACTION_HANDLER';
  }

  /**
   * Generate mocked output for simulation
   */
  private generateMockedOutput(mission: any): any {
    const functionId = (mission.functionId || '').toLowerCase();

    // Heuristic output generation
    if (functionId.includes('send') || functionId.includes('notify')) {
      return {
        status: 'sent',
        messageId: `sim_msg_${Date.now()}`,
        timestamp: new Date().toISOString(),
      };
    }

    if (functionId.includes('get') || functionId.includes('list')) {
      return {
        status: 'retrieved',
        count: Math.floor(Math.random() * 10) + 1,
        data: Array(Math.floor(Math.random() * 3) + 1)
          .fill(null)
          .map((_, i) => ({
            id: `sim_item_${i}`,
            value: `Simulated item ${i}`,
          })),
      };
    }

    if (functionId.includes('llm')) {
      return {
        status: 'generated',
        response: '[SIMULATED LLM RESPONSE] This is a mocked response for testing purposes.',
        tokens: Math.floor(Math.random() * 100) + 10,
      };
    }

    // Default response
    return {
      status: 'completed',
      simulatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate simulated execution duration
   */
  private generateSimulatedDuration(executorType: string): number {
    // Realistic simulated durations
    const baseDurations: Record<string, [number, number]> = {
      TRIGGER_HANDLER: [10, 50],
      CONDITION_EVALUATOR: [5, 20],
      ACTION_HANDLER: [50, 200],
      MCP_SERVER_CALL: [100, 500],
      LLM_INFERENCE: [500, 2000],
      FALLBACK_HANDLER: [50, 150],
      SCRIPT_EXECUTOR: [100, 300],
      DATA_TRANSFORMER: [50, 200],
    };

    const [min, max] = baseDurations[executorType] || [50, 100];
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Validate that all steps in sandbox result are safe for compilation
   */
  validateSandboxResult(result: SandboxExecutionResult): boolean {
    // Only allow progression if:
    // 1. Status is SIMULATED_SUCCESS
    // 2. No ERROR-level issues
    if (result.status !== 'SIMULATED_SUCCESS') {
      return false;
    }

    const errors = result.issues.filter((i) => i.severity === 'ERROR');
    return errors.length === 0;
  }

  /**
   * Get human-readable summary of sandbox execution
   */
  getSummary(result: SandboxExecutionResult): string {
    const errorCount = result.issues.filter((i) => i.severity === 'ERROR').length;
    const warningCount = result.issues.filter((i) => i.severity === 'WARNING').length;

    return (
      `Sandbox Execution: ${result.status} ` +
      `| Steps: ${result.steps.length} | ` +
      `Duration: ${result.totalSimulatedDurationMs}ms | ` +
      `Errors: ${errorCount} | Warnings: ${warningCount}`
    );
  }
}
