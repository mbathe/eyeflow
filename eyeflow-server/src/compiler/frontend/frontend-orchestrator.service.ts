/**
 * DEPRECATED: Frontend Parser Orchestrator
 * 
 * NOT USED in Option 1 - Natural language parsing happens at Planning layer
 * This service kept for reference/historical purposes only.
 * 
 * Previous Purpose:
 * Coordinated all Layer 2 services (Parser, Type Inference, Constraint Validation)
 * Entry point for NL → AST compilation
 * 
 * @deprecated Use Planning layer (LLM service) for NL parsing instead
 */

// DEPRECATED: Imports removed due to non-usage in Option 1 architecture
// This file remains for historical reference only

/**
 * Compilation result from Layer 2
 */
export interface CompilationResult {
  success: boolean;
  tree?: any;
  errors: any[];
  warnings: any[];
  metrics: {
    parseTime: number;
    typeCheckTime: number;
    validationTime: number;
    totalTime: number;
    operationCount: number;
    variableCount: number;
  };
}

/**
 * DEPRECATED: FrontendOrchestratorService
 * 
 * @deprecated This service is not used in Option 1
 * Use Python LLM Service (Planning layer) instead
 */
export class FrontendOrchestratorService {
  // DEPRECATED: Full implementation removed (see git history)
  // This service is not used in Option 1 architecture
  // NL parsing is handled by Python LLM Service in Planning layer

  async compile(input: string, workflowName = 'Untitled'): Promise<CompilationResult> {
    throw new Error('DEPRECATED: Use Planning layer LLM service for NL parsing');
  }

  async parseInteractive(input: string, workflowName: string): Promise<CompilationResult> {
    throw new Error('DEPRECATED: Use Planning layer LLM service for NL parsing');
  }

  async clearCache(input?: string, workflowName?: string): Promise<void> {
    // No-op, deprecated
  }

  async getStatistics(): Promise<{
    parserVersion: string;
    supportedVerbs: string[];
    maxWorkflowDuration: number;
  }> {
    return {
      parserVersion: '0.0.0-deprecated',
      supportedVerbs: [],
      maxWorkflowDuration: 0,
    };
  }
}
