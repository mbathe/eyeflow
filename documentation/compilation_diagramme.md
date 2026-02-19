graph TB
    subgraph Input["🔵 INPUT (Layer 3 + Layer 2)"]
        OptPlan["OptimizationPlan<br/>- Classifications<br/>- ResourceBindings<br/>- Schemas<br/>- ParallelOpportunities<br/>- LLMContexts"]
        SemanticTree["SemanticTree<br/>- Operations<br/>- Variables<br/>- Dependencies"]
    end

    subgraph "Stage 1: Constant Folding"
        CF["ConstantFoldingService<br/>INPUT: Classifications<br/>OUTPUT: READ/TRANSFORM Instructions"]
    end

    subgraph "Stage 2: Resource Reification"
        RR["ResourceReificationService<br/>INPUT: ResourceBindings + Stage1 Output<br/>OUTPUT: ResourceHandle[] + LOAD_RESOURCE"]
    end

    subgraph "Stage 3: Validation Injection"
        VI["ValidationInjectorService<br/>INPUT: Schemas + All prev Instructions<br/>OUTPUT: VALIDATE Instructions"]
    end

    subgraph "Stage 4: Parallelization Codegen"
        PC["ParallelizationCodeGenService<br/>INPUT: ParallelOpportunities<br/>OUTPUT: PARALLEL_SPAWN/BARRIER + Groups"]
    end

    subgraph "Stage 5: Semantic Context"
        SCB["SemanticContextBindingService<br/>INPUT: LLMContexts + SemanticTree<br/>OUTPUT: SemanticsData + Embeddings"]
    end

    subgraph "Stage 6: IR Optimization"
        IRO["IROptimizerService<br/>INPUT: All Instructions<br/>OUTPUT: DependencyGraph + Topological Order"]
    end

    subgraph Output["🟢 OUTPUT (Layer 5 Input)"]
        LLMIROut["LLMIntermediateRepresentation<br/>- instructions[] (atomic bytecode)<br/>- dependencyGraph (DAG)<br/>- instructionOrder[] (toposorted)<br/>- resourceTable[]<br/>- parallelizationGroups[]<br/>- schemas[]<br/>- semanticContext{}"]
    end

    OptPlan --> CF
    SemanticTree --> SCB
    CF --> RR
    RR --> VI
    VI --> PC
    PC --> IRO
    SCB --> IRO
    IRO --> LLMIROut

    style CF fill:#e1f5ff
    style RR fill:#e1f5ff
    style VI fill:#e1f5ff
    style PC fill:#e1f5ff
    style SCB fill:#e1f5ff
    style IRO fill:#fff3e0
    style LLMIROut fill:#c8e6c9