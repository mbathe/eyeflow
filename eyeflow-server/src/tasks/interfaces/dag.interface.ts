/**
 * DAG (Directed Acyclic Graph) structures for rule visualization
 */

export interface DAGNode {
  id: string;
  label: string;
  type: 'trigger' | 'condition' | 'action' | 'decision';
  description: string;
  icon: string; // emoji or icon name
  position: { x: number; y: number };
  metadata?: {
    connector?: string;
    agent?: string;
    serviceCall?: string;
    estimatedTime?: number;
    complexity?: 'SIMPLE' | 'MEDIUM' | 'COMPLEX';
  };
}

export interface DAGEdge {
  id: string;
  source: string; // node id
  target: string; // node id
  label?: string;
  type: 'success' | 'failure' | 'conditional' | 'default';
  condition?: string;
}

export interface DAGExecution {
  nodeId: string;
  nodeName: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  duration?: number;
  error?: string;
  timestamp?: Date;
}

export interface DAGMetadata {
  title: string;
  description: string;
  estimatedExecutionTime: number;
  complexity: 'SIMPLE' | 'MEDIUM' | 'COMPLEX';
  ruleId?: string;
  createdAt?: Date;
  lastModified?: Date;
}

export interface DAGVisualization {
  nodes: DAGNode[];
  edges: DAGEdge[];
  metadata: DAGMetadata;
  executionTrace?: DAGExecution[]; // Optional: for execution visualization
}
