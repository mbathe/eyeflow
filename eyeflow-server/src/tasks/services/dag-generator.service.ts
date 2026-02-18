import { Injectable, Logger } from '@nestjs/common';
import {
  DAGVisualization,
  DAGNode,
  DAGEdge,
  DAGMetadata,
} from '../interfaces/dag.interface';
import {
  CompilationReport,
  DataFlowStep,
} from '../interfaces/compilation-report.interface';

@Injectable()
export class DAGGeneratorService {
  private readonly logger = new Logger(DAGGeneratorService.name);

  /**
   * Convert CompilationReport.dataFlow into DAG structure for visualization
   */
  generateDAGFromCompilationReport(report: CompilationReport): DAGVisualization {
    const nodes = this.generateNodes(report.dataFlow);
    const edges = this.generateEdges(report.dataFlow);
    const positions = this.calculatePositions(nodes, edges);

    const nodesWithPositions = nodes.map((node, index) => ({
      ...node,
      position: positions[index],
    }));

    const metadata = this.createMetadata(report);

    this.logger.log(
      `Generated DAG for rule "${report.ruleName}": ${nodes.length} nodes, ${edges.length} edges`
    );

    return {
      nodes: nodesWithPositions,
      edges,
      metadata,
    };
  }

  /**
   * Generate DAG nodes from dataFlow steps
   */
  private generateNodes(dataFlow: DataFlowStep[]): DAGNode[] {
    return dataFlow.map((step, index) => {
      const type = this.determineNodeType(step);
      const icon = this.getIconForStep(step);

      return {
        id: step.stepId?.toString() || `step-${index}`,
        label: step.stepName,
        type,
        description: step.description || '',
        icon,
        position: { x: 0, y: 0 }, // Will be recalculated
        metadata: {
          connector: step.connector,
          agent: step.agent,
          serviceCall: step.serviceCall,
          estimatedTime: step.estimatedTime,
          complexity: this.estimateNodeComplexity(step),
        },
      };
    });
  }

  /**
   * Generate DAG edges connecting the steps
   */
  private generateEdges(dataFlow: DataFlowStep[]): DAGEdge[] {
    const edges: DAGEdge[] = [];

    for (let i = 0; i < dataFlow.length - 1; i++) {
      const current = dataFlow[i];
      const next = dataFlow[i + 1];

      edges.push({
        id: `edge-${i}-${i + 1}`,
        source: current.stepId?.toString() || `step-${i}`,
        target: next.stepId?.toString() || `step-${i + 1}`,
        type: 'success',
        label: 'Next',
      });

      // Add error/failure edge if applicable
      if (current.type === 'condition' || current.type === 'action') {
        edges.push({
          id: `edge-${i}-error`,
          source: current.stepId?.toString() || `step-${i}`,
          target: 'error-handler', // Conceptual error handler
          type: 'failure',
          label: 'On Error',
        });
      }
    }

    return edges;
  }

  /**
   * Calculate node positions in a hierarchical layout
   */
  private calculatePositions(
    nodes: DAGNode[],
    edges: DAGEdge[]
  ): Array<{ x: number; y: number }> {
    // Simple horizontal layout (can be enhanced with Dagre/ELK algorithm)
    const ySpacing = 120;
    const xSpacing = 250;

    let triggerY = 50;
    let conditionY = 50 + ySpacing;
    let actionY = 50 + ySpacing * 2;

    const positions: Array<{ x: number; y: number }> = [];
    let triggerCount = 0;
    let conditionCount = 0;
    let actionCount = 0;

    nodes.forEach((node) => {
      if (node.type === 'trigger') {
        positions.push({ x: xSpacing, y: triggerY });
        triggerCount++;
      } else if (node.type === 'condition' || node.type === 'decision') {
        positions.push({ x: xSpacing + conditionCount * xSpacing, y: conditionY });
        conditionCount++;
      } else if (node.type === 'action') {
        positions.push({ x: xSpacing + actionCount * xSpacing, y: actionY });
        actionCount++;
      }
    });

    return positions;
  }

  /**
   * Determine DAG node type from step information
   */
  private determineNodeType(
    step: DataFlowStep
  ): 'trigger' | 'condition' | 'action' | 'decision' {
    if (step.stepId === 'trigger') return 'trigger';
    if (step.stepId === 'condition') return 'condition';
    if (step.stepName?.toLowerCase().includes('if') ||
        step.stepName?.toLowerCase().includes('decision')) {
      return 'decision';
    }
    return 'action';
  }

  /**
   * Get visual icon for step type
   */
  private getIconForStep(step: DataFlowStep): string {
    if (step.stepId === 'trigger') return '🎯';
    if (step.stepId === 'condition') return '❓';
    if (step.stepName?.toLowerCase().includes('slack')) return '💬';
    if (step.stepName?.toLowerCase().includes('email')) return '📧';
    if (step.stepName?.toLowerCase().includes('database')) return '🗄️';
    if (step.stepName?.toLowerCase().includes('service')) return '⚙️';
    if (step.stepName?.toLowerCase().includes('agent')) return '🤖';
    if (step.stepName?.toLowerCase().includes('llm')) return '🧠';
    if (step.stepName?.toLowerCase().includes('webhook')) return '🌐';
    if (step.stepName?.toLowerCase().includes('slack_post_file')) return '📎';
    return '→';
  }

  /**
   * Estimate complexity of a single node
   */
  private estimateNodeComplexity(
    step: DataFlowStep
  ): 'SIMPLE' | 'MEDIUM' | 'COMPLEX' {
    // Service calls and agent calls are more complex
    if (step.serviceCall || step.agent) return 'COMPLEX';
    // Conditions with multiple levels
    if (step.condition && typeof step.condition === 'object') return 'MEDIUM';
    // Simple conditions
    return 'SIMPLE';
  }

  /**
   * Create metadata for DAG visualization
   */
  private createMetadata(report: CompilationReport): DAGMetadata {
    return {
      title: report.ruleName,
      description: `Rule: ${report.ruleName} | Complexity: ${report.ruleComplexity} | Status: ${report.isValid ? '✅ Valid' : '❌ Invalid'}`,
      estimatedExecutionTime: report.estimatedExecutionTime || 0,
      complexity: report.ruleComplexity,
      ruleId: report.ruleId,
      createdAt: new Date(),
    };
  }

  /**
   * Generate a simplified DAG for quick preview (without full compilation details)
   */
  generateSimplifiedDAG(
    ruleName: string,
    description: string,
    complexity: string
  ): DAGVisualization {
    // Quick DAG for UI preview
    const nodes: DAGNode[] = [
      {
        id: 'trigger',
        label: 'Trigger',
        type: 'trigger',
        description: 'Rule is triggered',
        icon: '🎯',
        position: { x: 50, y: 50 },
      },
      {
        id: 'condition',
        label: 'Condition',
        type: 'condition',
        description: 'Evaluate condition',
        icon: '❓',
        position: { x: 300, y: 50 },
      },
      {
        id: 'action',
        label: 'Action',
        type: 'action',
        description: 'Execute action',
        icon: '→',
        position: { x: 550, y: 50 },
      },
    ];

    const edges: DAGEdge[] = [
      {
        id: 'edge-0-1',
        source: 'trigger',
        target: 'condition',
        type: 'success',
      },
      {
        id: 'edge-1-2',
        source: 'condition',
        target: 'action',
        type: 'success',
      },
    ];

    return {
      nodes,
      edges,
      metadata: {
        title: ruleName,
        description,
        estimatedExecutionTime: 0,
        complexity: complexity as any,
      },
    };
  }
}
