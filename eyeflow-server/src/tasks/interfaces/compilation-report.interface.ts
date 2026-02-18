export interface CompilationIssue {
  id: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  issueType:
    | 'MISSING_CONNECTOR'
    | 'INVALID_CONDITION'
    | 'INVALID_ACTION'
    | 'MISSING_AGENT'
    | 'CIRCULAR_DEPENDENCY'
    | 'DATA_TYPE_MISMATCH'
    | 'MISSING_DOCUMENT'
    | 'SERVICE_CALL_ERROR'
    | 'DATABASE_QUERY_ERROR'
    | 'LLM_ERROR'
    | 'PERFORMANCE_WARNING'
    | 'SECURITY_WARNING'
    | 'CONFIGURATION_ERROR';
  message: string;
  location?: {
    field: string | string[];
    step?: number;
  };
  suggestedFix?: string;
}

export interface DataFlowStep {
  stepId: string | number | null;
  stepName: string;
  type: 'trigger' | 'condition' | 'action' | 'decision';
  description?: string;
  inputs?: { name: string; type: string }[];
  outputs?: { name: string; type: string }[];
  connector?: string;
  agent?: string;
  serviceCall?: string;
  condition?: any;
  estimatedTime?: number;
}

export interface Recommendation {
  id: string;
  category: 'OPTIMIZATION' | 'SECURITY' | 'PERFORMANCE' | 'BEST_PRACTICE';
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestedChange?: string;
}

export interface CompilationReport {
  ruleId: string;
  ruleName: string;
  compilationTime: number; // ms
  timestamp: Date;
  isValid: boolean;
  errorCount: number;
  warningCount: number;
  issues: CompilationIssue[];
  dataFlow: DataFlowStep[];
  estimatedExecutionTime: number; // ms
  ruleComplexity: 'SIMPLE' | 'MEDIUM' | 'COMPLEX';
  usedCapabilities: string[];
  recommendations: Recommendation[];
  circularDependencies: string[][];
  validationDetails?: {
    conditionValid: boolean;
    actionsValid: boolean;
    referenceValid: boolean;
    performanceAcceptable: boolean;
    securityCompliant: boolean;
  };
}
