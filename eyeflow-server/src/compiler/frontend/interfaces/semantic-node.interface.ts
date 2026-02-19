/**
 * Semantic Tree Node Interface
 * Represents a single node in the Abstract Syntax Tree (AST)
 * produced by the NL Parser (Layer 2)
 *
 * @file src/compiler/frontend/interfaces/semantic-node.interface.ts
 */

/**
 * Core semantic node type
 * Supports: operations, parallel branches, conditionals, loops, and references
 */
export interface SemanticNode {
  type: 'operation' | 'parallel' | 'conditional' | 'loop' | 'reference';
  id: string;
  description?: string;

  // Operation node: Calls a capability from the Catalog (Layer 1)
  operation?: {
    capabilityId: string; // Must exist in Catalog
    inputs: Record<string, unknown>;
    outputVariable?: string; // Where to store result
  };

  // Parallel node: Execute multiple branches in parallel
  parallel?: {
    branches: SemanticNode[];
    mergeStrategy: 'all' | 'first' | 'race' | 'custom';
    mergeFunction?: string; // Custom merge logic (optional)
  };

  // Conditional node: Branch based on condition
  conditional?: {
    condition: string; // JavaScript expression, evaluated at runtime
    thenBranch: SemanticNode;
    elseBranch?: SemanticNode;
  };

  // Loop node: Iterate over collection
  loop?: {
    items: string; // Variable name to iterate (must be array)
    itemVariable: string; // Name of loop variable
    body: SemanticNode;
  };

  // Reference node: Access result from previous operation
  reference?: {
    operationId: string;
    path?: string; // For nested field access (e.g., "data.0.email")
  };

  // Execution metadata for optimization
  metadata?: {
    estimatedDuration?: number; // ms
    estimatedCost?: Record<string, unknown>;
    parallelizable: boolean;
    dependencies: string[]; // IDs of operations this depends on
    sourceLineNumber?: number; // For error reporting
  };
}

/**
 * Complete Semantic Tree (AST)
 * Produced by NL Parser, consumed by Optimizer (Layer 3)
 */
export interface SemanticTree {
  // Root execution node
  root: SemanticNode;

  // Flattened map of all operations for quick lookup
  operations: Map<string, SemanticNode>;

  // All declared variables and their types
  variables: Map<string, VariableDeclaration>;

  // Input variables from user
  inputs: Map<string, VariableDeclaration>;

  // Metadata about the tree
  metadata: {
    name: string;
    description?: string;
    createdAt: Date;
    parserVersion: string;
    source: 'natural_language' | 'json' | 'api';
  };
}

/**
 * Variable Declaration
 * Tracks all named values in the workflow
 */
export interface VariableDeclaration {
  name: string;
  type: 'constant' | 'input' | 'computed' | 'reference';
  value?: unknown;

  // Data classification for optimization (Layer 3)
  dataClassification: 'CONSTANT' | 'COMPILE_TIME_COMPUTED' | 'RUNTIME_DYNAMIC';

  // JSON Schema for validation
  schema?: Record<string, unknown>;

  // Metadata
  sourceLineNumber?: number;
  description?: string;

  // For computed variables: ID of operation that produces this
  producedBy?: string;
}

/**
 * Parse result with diagnostics
 * Returned by NL Parser, consumed by error handling
 */
export interface ParseResult {
  success: boolean;
  tree?: SemanticTree;
  errors: ParseError[];
  warnings: ParseWarning[];
  metadata: {
    parsingTime: number; // ms
    inputLength: number;
    nodeCount: number;
  };
}

/**
 * Parse error for detailed error reporting
 */
export interface ParseError {
  code: string; // e.g., "UNKNOWN_CAPABILITY", "TYPE_MISMATCH"
  message: string;
  lineNumber: number;
  columnNumber?: number;
  context?: string; // The problematic text
  suggestions?: string[]; // Suggested fixes
}

/**
 * Parse warning for non-critical issues
 */
export interface ParseWarning {
  code: string; // e.g., "UNUSED_VARIABLE", "LONG_DURATION"
  message: string;
  lineNumber?: number;
  suggestion?: string;
}

/**
 * Node type guard functions for type safety
 */
export namespace SemanticNodeGuards {
  export function isOperationNode(node: SemanticNode): node is SemanticNode & { operation: NonNullable<SemanticNode['operation']> } {
    return node.type === 'operation' && !!node.operation;
  }

  export function isParallelNode(node: SemanticNode): node is SemanticNode & { parallel: NonNullable<SemanticNode['parallel']> } {
    return node.type === 'parallel' && !!node.parallel;
  }

  export function isConditionalNode(node: SemanticNode): node is SemanticNode & { conditional: NonNullable<SemanticNode['conditional']> } {
    return node.type === 'conditional' && !!node.conditional;
  }

  export function isLoopNode(node: SemanticNode): node is SemanticNode & { loop: NonNullable<SemanticNode['loop']> } {
    return node.type === 'loop' && !!node.loop;
  }

  export function isReferenceNode(node: SemanticNode): node is SemanticNode & { reference: NonNullable<SemanticNode['reference']> } {
    return node.type === 'reference' && !!node.reference;
  }
}
