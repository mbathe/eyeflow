import { JsonSchema } from './json-schema.interface';

/**
 * TypeScript representation of a capability.
 * All plugins MUST implement this interface.
 */
export interface CompilableComponent {
  // Metadata
  id: string; // e.g., "connector.excel", "service.openai", "action.sendEmail"
  name: string;
  version: string;
  description: string;
  author?: string;

  // Capability Declaration
  capabilities: Capability[];

  // Constraints & Requirements
  constraints?: Constraint[];
  requiredContext?: ContextRequirement[];

  // Validation & Compilation Hooks
  validate(): Promise<void>; // Must throw if invalid
  toJSON(): CapabilityJSON; // Serialize for Catalog
}

/**
 * A single capability (e.g., "list all Excel files", "send HTTP request")
 */
export interface Capability {
  id: string;
  name: string;
  description: string;
  category: 'connector' | 'service' | 'action' | 'transform';

  // Input/Output contracts
  inputs: CapabilityParameter[];
  outputs: CapabilityParameter[];

  // How to call this capability
  executor: CapabilityExecutor;

  // Performance hints (used by Optimizer)
  estimatedDuration?: number; // ms
  supportsParallel?: boolean;
  cacheable?: boolean;
  cacheTTL?: number; // seconds
  isLLMCall?: boolean; // marks explicit LLM integration points

  // Cost (for resource-constrained execution)
  estimatedCost?: {
    cpu: number; // 0-1 (core fraction)
    memory: number; // MB
    concurrent: number; // max parallel invocations
  };
}

export interface CapabilityParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any';
  required: boolean;
  schema?: JsonSchema;
  description?: string;
  defaultValue?: any;
}

export interface CapabilityExecutor {
  type: 'function' | 'http' | 'grpc' | 'websocket';

  // For 'function' type
  functionRef?: {
    module: string;
    functionName: string;
  };

  // For 'http' type
  httpRef?: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    url: string;
    headers?: Record<string, string>;
    timeout?: number;
  };

  // For 'grpc' type
  grpcRef?: {
    service: string;
    method: string;
    proto: string;
  };
}

export interface Constraint {
  type: 'maxConcurrent' | 'rateLimit' | 'resource' | 'dependency';
  value: any;
  description: string;
}

export interface ContextRequirement {
  name: string;
  type: 'catalog' | 'cache' | 'config' | 'runtime';
  description: string;
}

export interface CapabilityJSON {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  capabilities: Capability[];
  constraints?: Constraint[];
}

/**
 * Marker decorator for compile-time validation.
 * Usage: @Compilable({ strictMode: true })
 */
export function Compilable(options?: { strictMode?: boolean }) {
  return function (target: any) {
    target._isCompilable = true;
    target._strictMode = options?.strictMode ?? false;
    return target;
  };
}

/**
 * Validation errors during component compilation
 */
export class ComponentValidationError extends Error {
  constructor(
    public componentId: string,
    public errors: string[],
  ) {
    super(
      `Component ${componentId} validation failed:\n${errors.map(e => `  • ${e}`).join('\n')}`,
    );
  }
}
