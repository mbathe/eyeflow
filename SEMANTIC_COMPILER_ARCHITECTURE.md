# 📐 Semantic Compiler & Runtime Architecture

## Vision

Transform **natural language** → **type-safe, parallelizable, optimized bytecode** → **deterministic execution** with sub-millisecond latency.

The most powerful LLM execution engine. ~95% deterministic (LLM calls explicit & pre-contextualized).

---

## 🏗️ 5-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Capability Catalog (System Manifest)             │
│   • All connectors, services, actions indexed              │
│   • JSON schemas, resource requirements, constraints       │
│   • Vectorized for RAG context injection                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Compiler Frontend (Parser)                        │
│   • NL Input → Semantic Tree (AST)                         │
│   • Validates against Capability Catalog                   │
│   • Type checking, constraint validation                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Compiler Middle-end (Optimizer)                   │
│   • Data classification (Constants/Pre-computed/Dynamic)  │
│   • Static resource binding (pre-load Excel, etc)         │
│   • Automatic parallelization detection                    │
│   • Caching strategy planning                              │
│   • LLM context pre-computation                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: Compiler Backend (IR Generator)                   │
│   • Generates LLM-IR bytecode                              │
│   • Embeds constants (compile-time computed)              │
│   • Generates execution plan                               │
│   • Produces JSON serializable IR                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 5: Runtime (Semantic Virtual Machine)                │
│   • SVM executor (mostly deterministic)                    │
│   • Parallel execution engine                              │
│   • LLM integration points (explicit calls)                │
│   • Result validation & caching                            │
│   • Event streaming (Socket.io)                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 Layer 1: Capability Catalog

### CompilableComponent Interface

Every capability (Connector, Service, Action) must implement this contract:

```typescript
// src/common/extensibility/compilable-component.interface.ts

import { JsonSchema } from './json-schema.interface';

/**
 * TypeScript representation of a capability.
 * All plugins MUST implement this interface.
 */
export interface CompilableComponent {
  // Metadata
  id: string;  // e.g., "connector.excel", "service.openai", "action.sendEmail"
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
  validate(): Promise<void>;  // Must throw if invalid
  toJSON(): CapabilityJSON;   // Serialize for Catalog
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
  estimatedDuration?: number;  // ms
  supportsParallel?: boolean;
  cacheable?: boolean;
  cacheTTL?: number;  // seconds
  
  // Cost (for resource-constrained execution)
  estimatedCost?: {
    cpu: number;      // 0-1 (core fraction)
    memory: number;   // MB
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
  capabilities: Capability[];
  constraints: Constraint[];
}

/**
 * Marker decorator for compile-time validation.
 * Usage: @Compilable({ strictMode: true })
 */
export function Compilable(options?: { strictMode?: boolean }) {
  return function(target: any) {
    target._isCompilable = true;
    target._strictMode = options?.strictMode ?? false;
  };
}
```

### Catalog Storage Format

```json
{
  "catalog": {
    "version": "1.0",
    "timestamp": "2026-02-19T10:30:00Z",
    "components": [
      {
        "id": "connector.excel",
        "name": "Excel Connector",
        "version": "1.2.0",
        "description": "Read/write Excel files",
        "capabilities": [
          {
            "id": "connector.excel.read",
            "name": "Read Excel File",
            "description": "Load Excel file and parse sheets",
            "category": "connector",
            "inputs": [
              {
                "name": "filePath",
                "type": "string",
                "required": true,
                "description": "Path to Excel file"
              }
            ],
            "outputs": [
              {
                "name": "sheets",
                "type": "array",
                "schema": {
                  "type": "object",
                  "properties": {
                    "name": { "type": "string" },
                    "data": { "type": "array" }
                  }
                }
              }
            ],
            "executor": {
              "type": "function",
              "functionRef": {
                "module": "@eyeflow/connectors",
                "functionName": "readExcel"
              }
            },
            "estimatedDuration": 500,
            "supportsParallel": false,
            "cacheable": true,
            "cacheTTL": 3600,
            "estimatedCost": {
              "cpu": 0.2,
              "memory": 256,
              "concurrent": 1
            }
          }
        ],
        "constraints": [
          {
            "type": "resource",
            "value": { "maxFileSize": "100MB" },
            "description": "Maximum file size"
          }
        ]
      }
    ]
  }
}
```

---

## 🔍 Layer 2: Compiler Frontend (NL Parser)

### Semantic Tree (AST)

```typescript
// src/compiler/frontend/semantic-node.interface.ts

export interface SemanticNode {
  type: 'operation' | 'parallel' | 'conditional' | 'loop' | 'reference';
  id: string;
  
  // Operation node
  operation?: {
    capabilityId: string;  // reference to Catalog capability
    inputs: Record<string, any>;
  };
  
  // Parallel node
  parallel?: {
    branches: SemanticNode[];
    mergeStrategy: 'all' | 'first' | 'race' | 'custom';
  };
  
  // Conditional node
  conditional?: {
    condition: string;  // JavaScript expression
    thenBranch: SemanticNode;
    elseBranch?: SemanticNode;
  };
  
  // Loop node
  loop?: {
    items: string;  // variable name to iterate
    body: SemanticNode;
  };
  
  // Reference node (to another operation result)
  reference?: {
    operationId: string;
    path?: string;  // for nested field access
  };
  
  // Execution metadata
  metadata?: {
    estimatedDuration?: number;
    estimatedCost?: any;
    parallelizable: boolean;
    dependencies: string[];  // operation IDs this depends on
  };
}

export interface SemanticTree {
  root: SemanticNode;
  operations: Map<string, SemanticNode>;
  variables: Map<string, VariableDeclaration>;
}

export interface VariableDeclaration {
  name: string;
  type: 'constant' | 'input' | 'computed' | 'reference';
  value?: any;
  dataClassification: 'CONSTANT' | 'COMPILE_TIME_COMPUTED' | 'RUNTIME_DYNAMIC';
  schema?: any;
}
```

---

## ⚙️ Layer 3: Compiler Middle-end (Optimizer)

### Data Classification

All data falls into one of three categories:

```typescript
// src/compiler/middle-end/data-classifier.ts

enum DataClassification {
  /**
   * CONSTANT: Embedded in IR at compile time
   * Example: User provides literal value "report.xlsx"
   * Strategy: Embed directly in bytecode
   */
  CONSTANT = 'CONSTANT',

  /**
   * COMPILE_TIME_COMPUTED: Pre-computed at compile time, stored in cache
   * Example: Load Excel file → extract schema → vectorize for RAG
   * Strategy: Compute once, cache with long TTL
   */
  COMPILE_TIME_COMPUTED = 'COMPILE_TIME_COMPUTED',

  /**
   * RUNTIME_DYNAMIC: Fetched/computed at execution time
   * Example: Current timestamp, user input, API response
   * Strategy: Fetch at runtime, cache if repeated
   */
  RUNTIME_DYNAMIC = 'RUNTIME_DYNAMIC',
}

// Examples
const examples = {
  // CONSTANT
  filePath: { classification: DataClassification.CONSTANT, value: 'data/report.xlsx' },
  
  // COMPILE_TIME_COMPUTED
  excelSchema: {
    classification: DataClassification.COMPILE_TIME_COMPUTED,
    computedValue: { columns: ['Name', 'Email', 'Amount'], types: [...] },
    cacheTTL: 86400,  // 24 hours
  },
  
  // RUNTIME_DYNAMIC
  currentTimestamp: { classification: DataClassification.RUNTIME_DYNAMIC },
  userApproval: { classification: DataClassification.RUNTIME_DYNAMIC },
};
```

### Optimization Strategies

```typescript
// src/compiler/middle-end/optimizer.ts

export class CompilerOptimizer {
  /**
   * Strategy 1: Static Resource Binding
   * Pre-load Excel files → vectorize → RAG index
   */
  bindResources(semanticTree: SemanticTree): BoundResources {
    // For each Excel read in tree:
    //   1. Read file at compile time
    //   2. Extract schema + preview data
    //   3. Vectorize for RAG
    //   4. Store in cache
    //   5. Reference by cache key in IR
  }

  /**
   * Strategy 2: Pre-computation of Schemas
   * Generate JSON schemas for all inputs/outputs
   */
  precomputeSchemas(semanticTree: SemanticTree): SchemaRegistry {
    // For each operation:
    //   1. Get capability schema from Catalog
    //   2. Merge with runtime constraints
    //   3. Generate validators
    //   4. Store in registry
  }

  /**
   * Strategy 3: Parallelization Detection
   * Identify independent operations → run in parallel
   */
  detectParallelization(semanticTree: SemanticTree): ParallelExecutionPlan {
    // Analyze dependencies
    // Group independent operations
    // Create parallel branches
  }

  /**
   * Strategy 4: Caching Strategy Planning
   * Determine TTL for each cacheable result
   */
  planCaching(semanticTree: SemanticTree): CacheStrategy {
    // For each operation:
    //   1. Is it cacheable? (check Capability.cacheable)
    //   2. Set TTL (Capability.cacheTTL or default)
    //   3. Invalidation rules (when to clear)
  }

  /**
   * Strategy 5: LLM Context Optimization
   * Pre-prepare all context for LLM calls
   */
  precomputeLLMContext(semanticTree: SemanticTree): LLMContextMap {
    // For each LLM call:
    //   1. Collect required context
    //   2. Vectorize & embed query
    //   3. Pre-retrieve from RAG
    //   4. Bundle in IR
  }
}
```

---

## 🔧 Layer 4: Compiler Backend (IR Generator)

### LLM-IR Bytecode Format

```typescript
// src/compiler/backend/ir-format.ts

export interface LLMIRBytecode {
  version: string;
  id: string;
  name: string;
  
  // Compile-time computed values embedded directly
  constants: Record<string, any>;
  
  // Execution plan
  instructions: IRInstruction[];
  
  // Resources & plans
  parallelExecutionPlan: ParallelExecutionPlan;
  cacheStrategy: CacheStrategy;
  llmContextMap: LLMContextMap;
  
  // Metadata
  metadata: {
    compiledAt: Date;
    compiledBy: string;
    estimatedDuration: number;
    estimatedCost: any;
  };
}

export interface IRInstruction {
  id: string;
  opcode: 'LOAD' | 'CALL' | 'PARALLEL' | 'LOOP' | 'CACHE_GET' | 'CACHE_SET' | 'MERGE' | 'RETURN';
  
  // For LOAD
  load?: {
    source: 'constant' | 'input' | 'cache' | 'previous';
    key: string;
  };
  
  // For CALL
  call?: {
    capabilityId: string;
    inputs: Record<string, any>;  // Can reference constants or previous outputs
    timeout?: number;
  };
  
  // For PARALLEL
  parallel?: {
    branches: IRInstruction[][];
    mergeStrategy: 'all' | 'first' | 'race';
  };
  
  // For CACHE_GET
  cacheGet?: {
    key: string;
    fallbackInstruction: IRInstruction;
  };
  
  // For CACHE_SET
  cacheSet?: {
    key: string;
    ttl: number;
    instruction: IRInstruction;
  };
  
  // For MERGE
  merge?: {
    strategy: string;
  };
  
  // Dependencies on other instructions
  dependsOn?: string[];
}

// Example: Read Excel → Analyze → Generate Report
const exampleIR: LLMIRBytecode = {
  version: '1.0',
  id: 'workflow_001',
  name: 'Monthly Report Generator',
  
  constants: {
    file_path: 'data/monthly_sales.xlsx',
    report_template: { format: 'pdf', theme: 'professional' },
    email_recipients: ['manager@company.com'],
  },
  
  instructions: [
    {
      id: 'step_1',
      opcode: 'LOAD',
      load: { source: 'constant', key: 'file_path' },
    },
    {
      id: 'step_2',
      opcode: 'CALL',
      call: {
        capabilityId: 'connector.excel.read',
        inputs: { filePath: 'step_1' },  // Reference previous step
      },
    },
    {
      id: 'step_3',
      opcode: 'CACHE_GET',
      cacheGet: {
        key: 'excel_analysis_step_2',
        fallbackInstruction: {
          id: 'step_3_fallback',
          opcode: 'CALL',
          call: {
            capabilityId: 'service.openai.analyze',
            inputs: { data: 'step_2' },
          },
        },
      },
    },
    {
      id: 'step_4',
      opcode: 'CALL',
      call: {
        capabilityId: 'action.generateReport',
        inputs: {
          analysis: 'step_3',
          template: 'report_template',
        },
      },
    },
    {
      id: 'step_5',
      opcode: 'CALL',
      call: {
        capabilityId: 'action.sendEmail',
        inputs: {
          recipients: 'email_recipients',
          attachment: 'step_4',
        },
      },
    },
    {
      id: 'step_6',
      opcode: 'RETURN',
    },
  ],
  
  parallelExecutionPlan: {
    stages: [
      { id: 'stage_1', instructions: ['step_1'] },
      { id: 'stage_2', instructions: ['step_2'] },
      { id: 'stage_3', instructions: ['step_3'] },  // Can be parallel in future
      { id: 'stage_4', instructions: ['step_4'] },
      { id: 'stage_5', instructions: ['step_5'] },
    ],
  },
  
  metadata: {
    compiledAt: new Date(),
    compiledBy: 'semantic-compiler@12.0',
    estimatedDuration: 5000,  // 5 seconds
    estimatedCost: { cpu: 1.5, memory: 512 },
  },
};
```

---

## ⚡ Layer 5: Runtime (Semantic Virtual Machine)

### SVM Executor

```typescript
// src/runtime/svm-executor.ts

export class SemanticVirtualMachine {
  /**
   * Execute IR bytecode deterministically
   * Most operations are deterministic (no LLM calls except marked)
   */
  async execute(
    bytecode: LLMIRBytecode,
    inputs: Record<string, any>,
    executionContext: ExecutionContext,
  ): Promise<ExecutionResult> {
    const state = new ExecutionState(bytecode, inputs);
    
    for (const instruction of bytecode.instructions) {
      const result = await this.executeInstruction(instruction, state, executionContext);
      state.setResult(instruction.id, result);
    }
    
    return state.getFinalResult();
  }

  /**
   * Execute a single IR instruction
   */
  private async executeInstruction(
    instruction: IRInstruction,
    state: ExecutionState,
    context: ExecutionContext,
  ): Promise<any> {
    switch (instruction.opcode) {
      case 'LOAD':
        return state.load(instruction.load!.source, instruction.load!.key);
      
      case 'CALL':
        return await this.executeCapability(instruction.call!, state, context);
      
      case 'PARALLEL':
        return await this.executeParallel(instruction.parallel!, state, context);
      
      case 'CACHE_GET':
        return await this.executeCacheGet(instruction.cacheGet!, state, context);
      
      case 'CACHE_SET':
        return await this.executeCacheSet(instruction.cacheSet!, state, context);
      
      case 'MERGE':
        return state.merge(instruction.merge!.strategy);
      
      case 'RETURN':
        return state.getFinalResult();
    }
  }

  /**
   * Execute a capability call (mostly deterministic)
   * Only marked LLM calls use LLM
   */
  private async executeCapability(
    call: { capabilityId: string; inputs: Record<string, any> },
    state: ExecutionState,
    context: ExecutionContext,
  ): Promise<any> {
    const capability = context.catalog.getCapability(call.capabilityId);
    
    // Resolve inputs (can reference constants or previous results)
    const resolvedInputs = this.resolveInputs(call.inputs, state);
    
    // Execute capability
    if (capability.isLLMCall) {
      // LLM calls are EXPLICIT
      // All context pre-prepared at compile time
      return await capability.execute(resolvedInputs);
    } else {
      // Deterministic execution
      return await capability.execute(resolvedInputs);
    }
  }

  /**
   * Execute parallel branches
   */
  private async executeParallel(
    parallel: { branches: IRInstruction[][]; mergeStrategy: string },
    state: ExecutionState,
    context: ExecutionContext,
  ): Promise<any> {
    // Run branches in parallel
    const results = await Promise.all(
      parallel.branches.map(branch => this.executeBranch(branch, state, context))
    );
    
    // Merge results based on strategy
    return this.mergeResults(results, parallel.mergeStrategy);
  }

  /**
   * Execute cache get with fallback
   */
  private async executeCacheGet(
    cacheGet: { key: string; fallbackInstruction: IRInstruction },
    state: ExecutionState,
    context: ExecutionContext,
  ): Promise<any> {
    // Try cache first
    const cached = await context.cache.get(cacheGet.key);
    if (cached) return cached;
    
    // Fallback: execute instruction
    return await this.executeInstruction(cacheGet.fallbackInstruction, state, context);
  }

  /**
   * Execute and cache result
   */
  private async executeCacheSet(
    cacheSet: { key: string; ttl: number; instruction: IRInstruction },
    state: ExecutionState,
    context: ExecutionContext,
  ): Promise<any> {
    const result = await this.executeInstruction(cacheSet.instruction, state, context);
    await context.cache.set(cacheSet.key, result, cacheSet.ttl);
    return result;
  }
}

export class ExecutionContext {
  catalog: CapabilityCatalog;
  cache: CacheService;
  logger: LoggerService;
  llmProvider: LLMProvider;
  config: RuntimeConfig;
}

export interface ExecutionResult {
  output: any;
  duration: number;
  cost: any;
  cacheHits: number;
  parallelExecutionTime: number;
}
```

---

## 🔌 Extensibility: CompilableComponent Contract

### How to Add a Plugin

```typescript
// Example: custom-service/dist/index.ts

import { CompilableComponent, Capability, CapabilityParameter } from '@eyeflow/compiler';

@Compilable({ strictMode: true })
export class CustomAnalysisService implements CompilableComponent {
  id = 'service.customAnalysis';
  name = 'Custom Analysis Service';
  version = '1.0.0';
  description = 'Analyze custom data formats';

  capabilities: Capability[] = [
    {
      id: 'service.customAnalysis.process',
      name: 'Process Custom Format',
      description: 'Process and analyze custom data format',
      category: 'service',
      inputs: [
        {
          name: 'data',
          type: 'object',
          required: true,
          schema: { type: 'object', properties: { format: { type: 'string' } } },
        },
      ],
      outputs: [
        {
          name: 'result',
          type: 'object',
          schema: { type: 'object', properties: { insights: { type: 'array' } } },
        },
      ],
      executor: {
        type: 'function',
        functionRef: { module: 'custom-service', functionName: 'processData' },
      },
      estimatedDuration: 1000,
      cacheable: true,
      cacheTTL: 3600,
    },
  ];

  constraints = [];
  requiredContext = [];

  async validate(): Promise<void> {
    // Validate service is accessible
    // Check dependencies are satisfied
    // Verify JSON schemas are valid
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      description: this.description,
      capabilities: this.capabilities,
      constraints: this.constraints,
    };
  }
}

export const customService = new CustomAnalysisService();
```

---

## 📊 Data Classification Examples

```typescript
const workflow = `
  Load "monthly_report.xlsx"  // CONSTANT
  Analyze data                 // COMPILE_TIME_COMPUTED (pre-compute schema)
  Generate summary             // RUNTIME_DYNAMIC (depends on data)
  Send email                   // RUNTIME_DYNAMIC (depends on user approval)
`;

// Classification results:
{
  'filePath': {
    type: 'CONSTANT',
    value: 'monthly_report.xlsx',
    compiledInto: 'IR bytecode',
  },
  
  'excelSchema': {
    type: 'COMPILE_TIME_COMPUTED',
    value: {
      columns: ['Date', 'Salesman', 'Amount'],
      types: ['Date', 'String', 'Number'],
    },
    cachedWith: 24_hour_TTL,
    vectorizedFor: 'RAG',
  },
  
  'analysisResult': {
    type: 'RUNTIME_DYNAMIC',
    fetchedAt: 'execution',
    cachedWith: 1_hour_TTL,
  },
  
  'userApproval': {
    type: 'RUNTIME_DYNAMIC',
    fetchedAt: 'execution',
    notCacheable: true,
  },
}
```

---

## 🎯 Optimization Impact

| Optimization | Latency Reduction | Key Benefit |
|---|---|---|
| **Static Resource Binding** | 5-10x | Pre-load files → vectorize at compile time |
| **Schema Pre-computation** | 2-3x | Validators ready, no schema parsing at runtime |
| **Parallelization** | 3-10x | Independent ops run in parallel |
| **Caching** | 100-1000x | Repeated operations cached |
| **LLM Context Pre-prep** | 2-3x | All context injected, no runtime collection |
| **Combined** | **10-100x** | Sub-millisecond execution for most workflows |

---

## 🚀 Implementation Roadmap

### Phase 1: Foundation (Week 1) ✅ IN PROGRESS
- [ ] Create `CompilableComponent` interface with validation
- [ ] Build `ComponentRegistry` to scan capabilities
- [ ] Generate `CapabilityCatalog` JSON manifest
- [ ] Write 10+ unit tests

### Phase 2: Compiler Frontend & Optimizer (Week 2)
- [ ] Implement NL Parser → Semantic Tree
- [ ] Implement Optimizer with 5 strategies
- [ ] Data classification system
- [ ] Pre-computation of schemas & resources

### Phase 3: IR Generator & Runtime (Week 3)
- [ ] IR Generator (Semantic Tree → Bytecode)
- [ ] SVM Executor (deterministic bytecode execution)
- [ ] Parallel execution engine
- [ ] Result validation & caching

### Phase 4: Performance & Integration (Week 4)
- [ ] Load testing (10K workflows/minute)
- [ ] Optimize hot paths
- [ ] Frontend integration
- [ ] Production templates

---

## 🔑 Key Design Principles

1. **Determinism by Default**: ~95% of execution is deterministic. LLM calls are explicit & pre-contextualized.

2. **Pre-computation**: Anything that can be computed at compile time should be. Results stored in cache with long TTL.

3. **Type Safety**: All capabilities have JSON schemas. Compiler validates types at compile time.

4. **Extensibility**: CompilableComponent interface ensures all plugins can be used by compiler.

5. **Latency Minimization**: Combine static binding + caching + parallelization for sub-millisecond execution.

6. **Observability**: All operations logged with structured context (request ID, duration, cache hits).

---

## 📝 Next Steps

1. Implement Phase 1 foundation
2. Create 50+ unit tests for compiler stages
3. Build example workflows
4. Measure end-to-end latency
5. Optimize hot paths identified in profiling

