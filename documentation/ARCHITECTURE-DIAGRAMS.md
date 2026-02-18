# 🏗️ Architecture Visuelle - LLM + Rules Engine

## Vue d'ensemble complète

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                  REST API LAYER                                         │
│  ┌───────────────────┐  ┌──────────────────┐  ┌─────────────────────┐                 │
│  │ POST /compile     │  │ POST /            │  │ POST /rules         │                 │
│  │ (Parse NL)        │  │ (Create task)     │  │ (Create compliance) │                 │
│  └────────┬──────────┘  └────────┬─────────┘  └────────┬────────────┘                 │
│           │                       │                    │                               │
│           └───────────────────────┼────────────────────┘                               │
│                                   │                                                     │
│  ┌─────────────────────────────────────────────────────────┐                          │
│  │ GET /manifest/connectors                                │                          │
│  │ GET /manifest/llm-context                              │                          │
│  │ GET /manifest/llm-context/json                         │                          │
│  └────────────────┬─────────────────────────────────────────┘                         │
└───────────────────┼─────────────────────────────────────────────────────────────────────┘
                    │
        ┌───────────┴──────────┬─────────────────┐
        │                      │                 │
┌───────▼─────────────────┐   │          ┌──────▼────────────────────┐
│ TASK COMPILER SERVICE   │   │          │ LLM CONTEXT BUILDER       │
│ ────────────────────    │   │          │ ─────────────────────     │
│ - createTask()          │   │          │ - buildContext()          │
│ - compileTask()         │   │          │ - buildRuleContext()      │
│ - executeTask()         │   │          │ - exportContextAsJSON()   │
│ - createEventRule()     │   │          │                           │
│ - getTaskStatus()       │   │          │ + ConnectorRegistry ref   │
│ - getEventRuleStatus()  │   │          │                           │
│                         │   │          └──────┬────────────────────┘
└────────┬────────────────┘   │                 │
         │                    │                 │
         │                    │        ┌────────▼─────────────────┐
         │                    │        │CONNECTOR REGISTRY        │
         │                    │        │────────────────────      │
         │                    │        │ Registered Connectors:   │
         │                    │        │ ✓ Slack (500 LOC)        │
         │                    │        │ ✓ PostgreSQL (500 LOC)   │
         │                    │        │ ✓ HTTP API               │
         │                    │        │ ✓ Kafka (500 LOC)        │
         │                    │        │ ✓ FileSystem             │
         │                    │        │                          │
         │                    │        │ Provides:                │
         │                    │        │ - DataSchemas            │
         │                    │        │ - Functions              │
         │                    │        │ - Nodes                  │
         │                    │        │ - Triggers               │
         │                    │        │ - Operators              │
         │                    │        │ - Capabilities           │
         │                    │        └────────┬─────────────────┘
         │                    │                 │
         │                    └────────┬────────┘
         │                             │
         └──────────────┬──────────────┘
                        │
    ┌───────────────────┴────────────────────┐
    │                                         │
┌───▼─────────────────────────────────────┐ │  ┌──────────────────────────────┐
│ LLM INTENT PARSER (Abstraction)         │ │  │ TASK VALIDATOR SERVICE       │
│ ──────────────────────────────────────  │ │  │ ──────────────────────────   │
│                                          │ │  │ - validateIntent()           │
│ abstract parseIntent(                   │ │  │ - validateCompilation()      │
│   userInput,                            │ │  │ - validateRule()             │
│   llmContext,                           │ │  │                              │
│   userId                                │ │  │ Checks:                      │
│ ): LLMIntentParserResponse              │ │  │ ✓ Connectors exist           │
│                                          │ │  │ ✓ Functions exist            │
│ abstract buildRuleFromDescription(...) │ │  │ ✓ Types match                │
│                                          │ │  │ ✓ Permissions OK             │
│ abstract validateTaskExecution(...)    │ │  │ ✓ Dependencies satisfied     │
│                                          │ │  │ ✓ No deprecated connectors   │
│ Mock Implementation:                   │ │  └──────────────────────────────┘
│ ☐ Stub version (for local testing)    │ │
│                                       │ │
│ HTTP Client Implementation:           │ │
│ ☐ Calls Python LLM service          │ │
│   (POST http://localhost:8001)       │ │
└───────────────────────────────────────┘ │
                                           │
            ┌──────────────────────────────┘
            │
    ┌───────▼────────────────────────────────────────────┐
    │        DATABASE LAYER (TypeORM)                    │
    │ ───────────────────────────────────────────────   │
    │                                                    │
    │  Entities:                                         │
    │  ✓ GlobalTaskEntity       (Tasks to execute)      │
    │  ✓ EventRuleEntity         (Compliance rules)     │
    │  ✓ MissionEntity           (Executable units)     │
    │  ✓ GlobalTaskStateEntity   (State machine)        │
    │  ✓ AuditLogEntity          (Compliance logs)      │
    │                                                    │
    │  Types:                                            │
    │  ✓ 12 Enums (Status, Operators, Conditions)       │
    │  ✓ 6 Interfaces (Parsed intent, Proof, etc)       │
    └────────────────────────────────────────────────────┘
```

---

## Flux de Données: Mode 2 (Direct)

```
USER INTERACTION
│
├─ Input: "Send alert to Slack if status is RED"
│
▼
POST /tasks/compile
│
├─ Header: X-User-ID: uuid
├─ Body: {userInput, type, llmModelPreference, confidenceThreshold}
│
▼
NESTJS BACKEND (TaskCompilerService)
│
├─ Step 1: Build LLM Context
│  ├─ Get all connectors from registry
│  ├─ Get all functions from each connector
│  ├─ Get all triggers, operators, schemas
│  └─ Return complete LLMContext object
│
├─ Step 2: Validate Compilation Context
│  ├─ Check connectors available
│  └─ Check functions available
│
├─ Step 3: Call LLM Parser
│  ├─ POST to Python service:
│  │  {userInput, llmContext, userId, confidenceThreshold}
│  └─ Get: LLMIntentParserResponse
│
├─ Step 4: Check Confidence
│  ├─ confidence = 0.92
│  └─ threshold = 0.8 ✓ PASS
│
├─ Step 5: Validate Intent
│  ├─ Slack connector exists? ✓
│  ├─ send_message function exists? ✓
│  ├─ Parameter types match? ✓
│  ├─ User has permissions? ✓
│  └─ Return: ValidationResult {valid: true}
│
├─ Step 6: Create Task in Database
│  ├─ taskId = uuid
│  ├─ status = PENDING
│  ├─ intent = {action, confidence}
│  └─ Save to GlobalTaskEntity
│
▼
RESPONSE TO USER
{
  "taskId": "550e8400-...",
  "status": "PENDING",
  "intent": {
    "action": "send_alert",
    "confidence": 0.92
  },
  "compiledAt": "2026-02-18T12:00:00Z"
}
│
├─ (Later) POST /tasks/:id/execute
└─ → Mission dispatched to NexusNode
```

---

## Flux de Données: Mode 3 (Compliance Rules)

```
USER CREATES RULE
│
Input: "Check compliance when new customer created"
│
▼
POST /tasks/rules
│
├─ Headers: X-User-ID: uuid
├─ Body: {name, sourceConnectorType, trigger, condition, actions, debounce}
│
▼
NESTJS BACKEND (TaskCompilerService.createEventRule)
│
├─ Step 1: Build Rule Context
│  ├─ Get connectors focused on triggers/conditions
│  └─ Prepare LLMContext
│
├─ Step 2: Validate Rule Structure
│  ├─ Trigger type exists? ✓ ON_CREATE
│  ├─ All actions are valid? ✓
│  └─ Conditions are executable? ✓
│
├─ Step 3: Create Rule in Database
│  ├─ ruleId = uuid
│  ├─ status = ACTIVE
│  ├─ totalTriggers = 0
│  └─ Save to EventRuleEntity
│
├─ Step 4: Create Audit Log
│  ├─ action = "CREATE_RULE"
│  ├─ metadata = {name, trigger, actionCount}
│  └─ Save to AuditLogEntity
│
▼
RESPONSE TO USER
{
  "id": "rule-uuid",
  "name": "Check compliance when new customer created",
  "status": "ACTIVE",
  "totalTriggers": 0,
  "createdAt": "2026-02-18T12:00:00Z"
}

▼
SYSTEM RUNNING (Event Stream Monitoring)
│
├─ PostgreSQL emits: ON_CREATE on customers table
│
├─ Event reaches Rule Engine
│  ├─ Match trigger: ON_CREATE ✓
│  ├─ Check debounce: window=1000ms, maxTriggers=1 ✓
│  ├─ Evaluate condition: field=status, operator=eq, value=NEW ✓
│  └─ Execute actions:
│      ├─ Action 1: Call compliance-checker.validate()
│      ├─ Get result: {compliant: false, issues: [...]}
│      └─ Action 2: Send Slack message
│          └─ Posted: "Customer check failed: ..."
│
├─ Rule Statistics Updated
│  ├─ totalTriggers = 1
│  └─ lastTriggeredAt = 2026-02-18T12:05:30Z
│
└─ User can check: GET /tasks/rules/:id
   └─ See: totalTriggers: 1, status: ACTIVE
```

---

## Composants & Responsabilités

### TaskCompilerService
**Responsible for:**
- ✅ Orchestrating the entire compilation flow
- ✅ Building LLM context
- ✅ Calling LLM parser
- ✅ Validating before execution
- ✅ Creating tasks and rules
- ✅ Managing state transitions

### ConnectorRegistry
**Responsible for:**
- ✅ Registering all available connectors
- ✅ Providing manifests on demand
- ✅ Exposing functions, nodes, triggers
- ✅ Central source of truth for capabilities

### LLMContextBuilder
**Responsible for:**
- ✅ Assembling manifests into LLM context
- ✅ Building specialized contexts (rule, minimal)
- ✅ Exporting as JSON for documentation
- ✅ Filtering by user permissions (future)

### LLMIntentParser (Abstract)
**Responsible for:**
- ✅ Defining interface for LLM service
- ✅ Mock implementation for testing
- ✅ HTTP client for production
- ✅ Response typing

### TaskValidator
**Responsible for:**
- ✅ Validating intent executability
- ✅ Checking all references exist
- ✅ Type compatibility checking
- ✅ Permission validation
- ✅ Generating helpful error messages

---

## Information Flow Diagram

```
                                          ┌─ User Language
                                          │ "Alert if non-compliant"
                                          │
                                          ▼
                                    ┌──────────────┐
                                    │ HTTP Request │
                                    │ X-User-ID    │
                                    └──────┬───────┘
                                           │
                   ┌───────────────────────┼───────────────────────┐
                   │                       │                       │
                   ▼                       ▼                       ▼
            ┌─────────────┐         ┌──────────────┐        ┌─────────────┐
            │  Build LLM  │         │  Validate    │        │ Get Task    │
            │  Context    │         │ Compilation  │        │ Status      │
            └──────┬──────┘         └──────┬───────┘        └──────┬──────┘
                   │                       │                       │
                   │                       │                       │
                   ├──────────────────────┼──────────────────────┤
                   │                      │                      │
                   ▼                      ▼                      ▼
              Connectors            ✓ Schemas          Database Query
              Functions             ✓ Functions             │
              Schemas               ✓ Triggers             │
              Triggers                                      ▼
              Operators             └─────────────────────┐ │
                                                          │ │
                   ▼                                       │ │
            ┌────────────────┐                            │ │
            │ LLM Context    │                            │ │
            │ (Complete)     │                            │ │
            └────────┬───────┘                            │ │
                     │                                    │ │
                     ▼                                    │ │
            ┌────────────────────────┐                   │ │
            │ Call Python LLM        │                   │ │
            │ POST /parse-intent     │                   │ │
            │ + Full Context         │                   │ │
            └────────┬────────────────┘                  │ │
                     │                                   │ │
                     ▼                                   │ │
            {intent, targets,                           │ │
             parameters, missions,                      │ │
             confidence: 0.92}                          │ │
                     │                                  │ │
                     ▼                                  │ │
            ┌────────────────────┐                     │ │
            │ Validate Intent    │                     │ │
            │ ✓ Connectors       │                     │ │
            │ ✓ Functions        │                     │ │
            │ ✓ Types            │                     │ │
            │ ✓ Permissions      │                     │ │
            └────────┬────────────┘                    │ │
                     │                                 │ │
                     ▼                                 │ │
            {valid: true,                              │ │
             issues: [],                               │ │
             warnings: []}                             │ │
                     │                                 │ │
                     ▼                                 │ │
            ┌───────────────────┐                     │ │
            │ Create Task in DB │                     │ │
            │ - GlobalTask      │                     │ │
            │ - AuditLog        │                     │ │
            │ - State           │                     │ │
            └────────┬──────────┘                     │ │
                     │                                │ │
                     ├────────────────────────────────┘ │
                     │                                  │
                     ▼                                  ▼
            Response ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ User
            {taskId, status, intent, confidence}   + Status Details
```

---

## Tekniske Detaljer

### Types utilisés
- **DataType**: STRING, NUMBER, BOOLEAN, DATE, OBJECT, ARRAY, UUID, EMAIL, JSON, etc.
- **ConditionOperator**: EQ, NE, GT, LT, CONTAINS, REGEX, BETWEEN, etc.
- **TriggerType**: ON_CREATE, ON_UPDATE, ON_DELETE, ON_SCHEDULE, ON_WEBHOOK, etc.
- **FunctionCategory**: READ, WRITE, DELETE, EXECUTE, QUERY, TRANSFORM

### Validations
1. **Connector Validation**: Does referenced connector exist?
2. **Function Validation**: Does referenced function exist on connector?
3. **Type Validation**: Do parameter types match function signature?
4. **Permission Validation**: Does user have access?
5. **Dependency Validation**: Are all dependencies satisfied?

### Performance Optimizations (Future)
- Context caching per user
- Incremental manifest updates
- Function indexing for fast lookup
- Parallel operator evaluation

---

## 🎯 Key Takeaways

1. **Complete Separation of Concerns**: TypeScript handles API/DB, Python handles AI
2. **Type-Safe Throughout**: Every parameter validated before execution
3. **Extensible by Design**: New connectors don't touch core code
4. **Compliance-Ready**: Rules engine built for regulatory requirements
5. **Production-Grade**: Full audit logging, error handling, validation

This architecture is ready for integration with real LLM services and production deployment! 🚀
