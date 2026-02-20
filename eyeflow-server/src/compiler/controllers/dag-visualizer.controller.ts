/**
 * DAG Visualizer Controller — spec §3.2 Phase 4
 *
 * REST endpoints for human validation of compiled DAG workflows.
 *
 *   GET /api/dag/:workflowId/visualize
 *     Returns D3-compatible JSON: { workflowId, nodes, edges, meta }
 *
 *   GET /api/dag/:workflowId/visualize?format=mermaid
 *     Returns plain-text Mermaid.js flowchart markup
 *
 * The controller delegates visualisation logic to DagVisualizerService and
 * fetches the compiled IR from the IRSerializerService cache / task registry.
 */

import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
  Logger,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { DagVisualizerService, DagGraph } from '../services/dag-visualizer.service';
import { TaskExecutionService } from '../task-execution.service';

@Controller('api/dag')
export class DagVisualizerController {
  private readonly logger = new Logger(DagVisualizerController.name);

  constructor(
    private readonly dagVisualizer: DagVisualizerService,
    private readonly taskExecution: TaskExecutionService,
  ) {}

  // ── GET /api/dag/:workflowId/visualize ────────────────────────────────────

  /**
   * Visualise a compiled workflow DAG.
   *
   * @param workflowId  The workflow / project version id (UUID)
   * @param format      Output format: "json" (default) | "mermaid"
   *
   * @example
   *   GET /api/dag/abc-123/visualize
   *   GET /api/dag/abc-123/visualize?format=mermaid
   */
  @Get(':workflowId/visualize')
  @HttpCode(HttpStatus.OK)
  async visualize(
    @Param('workflowId') workflowId: string,
    @Query('format') format: string,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`[DagVisualizer] GET /api/dag/${workflowId}/visualize?format=${format ?? 'json'}`);

    // Fetch the latest compiled IR for this workflow
    const ir = await this.getCompiledIR(workflowId);

    const graph: DagGraph = this.dagVisualizer.visualize(ir, workflowId);

    if (format === 'mermaid') {
      const mermaid = this.dagVisualizer.toMermaid(graph);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('X-Workflow-Id', workflowId);
      res.send(mermaid);
      return;
    }

    // Default: D3-compatible JSON
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Workflow-Id', workflowId);
    res.json(graph);
  }

  // ── GET /api/dag/:workflowId/summary ─────────────────────────────────────

  /**
   * Lightweight endpoint returning only graph metadata (no nodes/edges).
   * Useful for dashboards that want a badge count of LLM calls / approvals.
   */
  @Get(':workflowId/summary')
  @HttpCode(HttpStatus.OK)
  async summary(@Param('workflowId') workflowId: string) {
    const ir = await this.getCompiledIR(workflowId);
    const graph = this.dagVisualizer.visualize(ir, workflowId);
    return {
      workflowId,
      workflowName: graph.workflowName,
      version: graph.version,
      compiledAt: graph.compiledAt,
      ...graph.meta,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Retrieve the compiled IR for a workflow.
   *
   * Strategy (in order):
   *   1. Ask TaskExecutionService for a cached result (in-process tasks)
   *   2. TODO: look up ProjectVersionRepository by workflowId (when DB entity exists)
   *
   * Throws NotFoundException if no compiled IR is found.
   */
  private async getCompiledIR(workflowId: string) {
    // Try TaskExecutionService cache first
    const cached = this.taskExecution.getCompiledIR?.(workflowId);
    if (cached) {
      return cached;
    }

    // Fallback: construct a minimal IR scaffold so the endpoint stays useful
    // even before the DB layer is wired.  This allows the frontend to call the
    // endpoint immediately and get an empty-but-valid graph.
    this.logger.warn(
      `[DagVisualizer] No compiled IR found for workflow=${workflowId} — returning empty scaffold`
    );

    throw new NotFoundException(
      `No compiled IR found for workflow "${workflowId}". ` +
      `Execute the workflow first via POST /api/tasks/execute or trigger compilation.`
    );
  }
}
