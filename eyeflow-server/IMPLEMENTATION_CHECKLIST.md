# ✂️ Implementation Checklist: Powerful Rule System

## Phase 1: Core Services (✅ DONE - TODAY)

- [x] Create `agent-broker.service.ts` (330 lines)
  - [x] Enums: AgentType, AgentCallingContext
  - [x] Interfaces: AgentFunction, AgentInfo
  - [x] Service class with methods: register, get, find, list
  - [x] Initialize 4 mock agents (legal, compliance, ML, human)

- [x] Create `rule-compiler.service.ts` (700 lines)
  - [x] Enums: IssueSeverity, IssueType
  - [x] Interfaces: CompilationIssue, DataFlowStep, CompilationReport
  - [x] Main method: compileRule() with 8-step validation
  - [x] Validators for 6 condition types (SIMPLE, SERVICE_CALL, DATABASE_QUERY, LLM_ANALYSIS, COMPOSITE, ML_PREDICTION)
  - [x] Data flow analysis
  - [x] Circular dependency detection
  - [x] Execution time estimation
  - [x] Recommendations generation

- [x] Create `compilation-feedback.service.ts` (600 lines)
  - [x] Interfaces: CompilationFeedback, UserMessage
  - [x] generateUserFeedback() method
  - [x] generateLLMFeedback() method
  - [x] Helper methods for building messages, lists, suggestions

---

## Phase 2: Module Integration (⏳ READY)

### Step 1: Update tasks.module.ts

- [ ] Import new services:
```typescript
import { AgentBrokerService } from './services/agent-broker.service';
import { RuleCompilerService } from './services/rule-compiler.service';
import { CompilationFeedbackService } from './services/compilation-feedback.service';
```

- [ ] Add to providers array:
```typescript
providers: [
  // ... existing
  AgentBrokerService,
  RuleCompilerService,
  CompilationFeedbackService,
]
```

### Step 2: Update TaskCompilerService

- [ ] Inject new services:
```typescript
constructor(
  // ... existing
  private readonly ruleCompiler: RuleCompilerService,
  private readonly compilationFeedback: CompilationFeedbackService,
  private readonly agentBroker: AgentBrokerService,
)
```

- [ ] Modify `generateEventRuleFromIntentEnhanced()`:
  - [ ] After LLM generates rule
  - [ ] Call `this.ruleCompiler.compileRule()`
  - [ ] If not valid: call `compilationFeedback.generateUserFeedback()` + `generateLLMFeedback()`
  - [ ] Return feedback to user and LLM
  - [ ] If valid: persist rule and return success

- [ ] Update LLM context enrichment:
  - [ ] Call `agentBroker.getExpertCapabilities()`
  - [ ] Add to enriched context sent to LLM
  - [ ] Include expert examples and when to use them

### Step 3: Create Database Migration

- [ ] Create migration file:
```bash
npm run migration:create -- --name CreateEventRuleExtended
```

- [ ] Define schema in migration:
```typescript
columns: [
  { name: 'id', type: 'uuid', isPrimary: true },
  { name: 'name', type: 'varchar' },
  { name: 'complexity', type: 'varchar', default: "'SIMPLE'" },
  { name: 'used_capabilities', type: 'jsonb' },
  { name: 'condition_type', type: 'varchar' },
  { name: 'condition', type: 'jsonb' },
  { name: 'actions', type: 'jsonb' },
  { name: 'document_references', type: 'jsonb' },
  { name: 'generation_metadata', type: 'jsonb' },
  { name: 'compilation_verified', type: 'boolean', default: false },
  { name: 'last_validated_at', type: 'timestamp' },
  { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
  { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
]
```

- [ ] Run migration:
```bash
npm run migration:run
```

- [ ] Verify table created:
```bash
npx typeorm query "SELECT * FROM event_rules_extended LIMIT 0"
```

---

## Phase 3: Extended Rule Executor (⏳ NEXT)

### Create ExtendedRuleExecutorService

- [ ] Create file: `extended-rule-executor.service.ts`
- [ ] Main method: `executeRule(rule, event): Promise<ExecutionResult>`
- [ ] Implement condition evaluators (6 types):
  - [ ] SIMPLE condition (field/operator/value)
  - [ ] SERVICE_CALL condition (call agent/service)
  - [ ] DATABASE_QUERY condition (execute SQL)
  - [ ] LLM_ANALYSIS condition (call Claude)
  - [ ] COMPOSITE condition (AND/OR/NOT)
  - [ ] ML_PREDICTION condition (call model)

- [ ] Implement action executors (3 modes):
  - [ ] SEQUENTIAL (step 1 → 2 → 3)
  - [ ] CONDITIONAL (if/else execution)
  - [ ] PARALLEL (Promise.all)

- [ ] Execution context:
  - [ ] Track $event, $result, $step0, $step1, etc.
  - [ ] Resolve parameter values with context
  - [ ] Pass data between steps

- [ ] Data flow tracking:
  - [ ] Log every step's inputs/outputs
  - [ ] Generate execution trace
  - [ ] Include timing information

- [ ] Error handling:
  - [ ] Catch errors in conditions
  - [ ] Retry logic for actions
  - [ ] Fallback on failure

- [ ] Register in tasks.module.ts:
```typescript
providers: [
  // ... existing
  ExtendedRuleExecutorService,
]
```

### Create ExecutionLogService

- [ ] Create file: `execution-log.service.ts`
- [ ] Log each rule execution:
  - [ ] Rule ID, name, trigger event
  - [ ] Condition result
  - [ ] Actions executed
  - [ ] Data flow trace
  - [ ] Errors (if any)
  - [ ] Duration

- [ ] Query execution history:
  - [ ] By rule ID
  - [ ] By date range
  - [ ] By status (success/failure)

- [ ] Create ExecutionLog entity:
```typescript
@Entity('execution_logs')
export class ExecutionLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column()
  ruleId: string;
  
  @Column()
  ruleName: string;
  
  @Column('jsonb')
  event: any;
  
  @Column()
  conditionPassed: boolean;
  
  @Column()
  actionCount: number;
  
  @Column()
  successfulActions: number;
  
  @Column('jsonb')
  dataFlowTrace: any[];
  
  @Column('jsonb')
  errors?: any[];
  
  @Column()
  duration: number;  // ms
  
  @CreateDateColumn()
  executedAt: Date;
}
```

---

## Phase 4: Testing (⏳ AFTER EXECUTOR)

### Unit Tests

- [ ] Test AgentBrokerService:
  - [ ] Register agent
  - [ ] Get agent
  - [ ] Find by expertise
  - [ ] Get capabilities

- [ ] Test RuleCompilerService:
  - [ ] Validate SIMPLE condition ✓
  - [ ] Validate SIMPLE condition fails when field missing ✗
  - [ ] Validate SERVICE_CALL condition
  - [ ] Validate when connector not found
  - [ ] Validate when agent not registered
  - [ ] Validate when document not found
  - [ ] Detect circular dependencies
  - [ ] Estimate execution time

- [ ] Test CompilationFeedbackService:
  - [ ] Generate user feedback on error
  - [ ] Generate LLM feedback
  - [ ] Include correct problem descriptions
  - [ ] Include correct missing requirements

- [ ] Test ExtendedRuleExecutorService:
  - [ ] Execute SIMPLE condition (true/false)
  - [ ] Execute SERVICE_CALL condition
  - [ ] Execute SEQUENTIAL actions
  - [ ] Execute CONDITIONAL actions
  - [ ] Execute PARALLEL actions
  - [ ] Track data flow

### Integration Tests

- [ ] Full E2E flow:
  - [ ] User provides intent
  - [ ] LLM generates rule
  - [ ] Compiler validates rule
  - [ ] Rule persisted
  - [ ] Rule can be retrieved
  - [ ] Rule executes correctly

- [ ] Failure scenarios:
  - [ ] LLM generates rule with missing connector
  - [ ] Compiler rejects rule
  - [ ] Feedback provided to LLM
  - [ ] LLM tries again with constraints

- [ ] Complex scenarios:
  - [ ] Cross-document validation
  - [ ] Multiple conditional actions
  - [ ] Parallel executions
  - [ ] Error handling and retries

---

## Phase 5: API Endpoints (⏳ AFTER TESTING)

### Create/Update Endpoints

- [ ] `POST /tasks/rules/generate-with-compilation`
  - Input: { description: string, create: boolean }
  - Output: 
    - If valid: { success: true, ruleId, createdRule }
    - If invalid: { success: false, userMessage, llmFeedback, suggestions }

- [ ] `POST /tasks/rules/:ruleId/execute`
  - Input: { event: any }
  - Output: { executed: true, dataFlowTrace, actionResults, duration }

- [ ] `GET /tasks/rules/:ruleId/compilation-report`
  - Output: Last compilation report (if available)

- [ ] `GET /tasks/executions`
  - Query: { ruleId?, startDate?, endDate?, status? }
  - Output: List of execution logs

- [ ] `GET /tasks/executions/:executionId`
  - Output: Detailed execution log with data flow trace

---

## Phase 6: UI Integration (⏳ FINAL)

### Dashboard Enhancements

- [ ] Show compilation report:
  - [ ] List issues (if any)
  - [ ] Show missing requirements
  - [ ] Display recommendations
  - [ ] Show data flow diagram

- [ ] Execution history:
  - [ ] List past executions
  - [ ] Filter by status
  - [ ] Show data flow for each execution
  - [ ] Display errors with suggestions

- [ ] Draft mode:
  - [ ] Generate rule in DRAFT status
  - [ ] Show compilation report
  - [ ] Allow user to fix issues
  - [ ] Approve to activate

---

## Testing Scenarios

### Scenario 1: Simple Valid Rule ✓

```bash
POST /tasks/rules/generate-with-compilation
{
  "description": "Alert ops when file fails validation",
  "create": true
}

Expected Response:
{
  "success": true,
  "createdRule": { "id": "rule-123", "name": "..." },
  "compilationReport": {
    "isValid": true,
    "errorCount": 0,
    "estimatedExecutionTime": 250
  }
}
```

### Scenario 2: Invalid Rule (Missing Connector) ✗

```bash
POST /tasks/rules/generate-with-compilation
{
  "description": "Call non-existent-service when event occurs",
  "create": true
}

Expected Response:
{
  "success": false,
  "userMessage": {
    "title": "❌ Rule cannot execute",
    "message": "Missing connector: 'non-existent-service'",
    "actionItems": [
      {
        "action": "Register the connector first",
        "priority": "HIGH",
        "effort": "MEDIUM"
      }
    ]
  },
  "llmFeedback": {
    "summary": "Rule compilation FAILED. Connector not found.",
    "missing": {
      "missingConnectors": ["non-existent-service"]
    },
    "suggestions": [
      "Ask user to register the connector",
      "Suggest alternative using available connectors"
    ]
  }
}
```

### Scenario 3: Invalid Rule (Missing Agent) ✗

```bash
POST /tasks/rules/generate-with-compilation
{
  "description": "Review contract using legal-review agent",
  "create": true
}

Expected Response:
{
  "success": false,
  "userMessage": {
    "title": "❌ Expert agent not available",
    "message": "The 'legal-review' agent is not registered",
    "actionItems": [
      {
        "action": "Register a legal document review agent",
        "priority": "HIGH",
        "effort": "HIGH"
      }
    ]
  },
  "llmFeedback": {
    "summary": "Rule needs 'legal-review' agent which is not available.",
    "missing": {
      "missingAgents": ["legal-review"]
    },
    "suggestions": [
      "Ask user if they want to register an agent",
      "Suggest alternative validation methods",
      "Offer to generate simpler rule"
    ]
  }
}
```

### Scenario 4: Execution

```bash
POST /tasks/rules/rule-123/execute
{
  "event": {
    "documentId": "doc-456",
    "fileName": "invoice.pdf",
    "uploadedAt": "2024-01-15T10:30:00Z"
  }
}

Expected Response:
{
  "executed": true,
  "status": "COMPLETED",
  "duration": 850,
  "conditionPassed": true,
  "actionCount": 2,
  "successfulActions": 2,
  "dataFlowTrace": [
    {
      "stepId": "trigger",
      "stepName": "Trigger: ON_CREATE",
      "outputs": [{ "name": "$event", "value": {...} }]
    },
    {
      "stepId": "cond",
      "stepName": "Condition: SERVICE_CALL",
      "inputs": [{ "name": "$event", "value": {...} }],
      "outputs": [{ "name": "$result", "value": {isValid: false, ...} }],
      "duration": 450
    },
    {
      "stepId": 0,
      "stepName": "Action: Post to Slack",
      "inputs": [{ "name": "$result", "value": {...} }],
      "outputs": [{ "name": "$step0", "value": {success: true, ...} }],
      "duration": 200
    }
  ]
}
```

---

## Summary Timeline

**Phase 1: Core Services** (TODAY) ✅
- 3 new services created (agent-broker, compiler, feedback)
- 330 + 700 + 600 = 1630 lines of code
- ~4 hours work

**Phase 2: Integration** (1-2 days)
- Update module and services
- Database migration
- Basic testing
- ~6-8 hours work

**Phase 3: Executor** (2-3 days)
- ExtendedRuleExecutorService
- ExecutionLogService
- Complex condition/action handling
- ~12-15 hours work

**Phase 4: Testing** (1-2 days)
- Unit tests for all services
- Integration tests
- E2E tests
- ~8-10 hours work

**Phase 5: API** (1 day)
- Create endpoints
- Response formatting
- Error handling
- ~4-6 hours work

**Phase 6: UI** (2-3 days)
- Dashboard integration
- Compilation report display
- Execution history view
- Draft mode
- ~12-16 hours work

**Total Estimated: 3-4 weeks**

---

## Validation Milestones

### Milestone 1: Compilation Works ✅
- [ ] Compiler validates simple rule ✓
- [ ] Compiler rejects rule with missing connector ✓
- [ ] Compiler detects circular dependencies ✓
- [ ] Feedback system generates user/LLM messages ✓

### Milestone 2: Rules Persist
- [ ] Rules saved to database ✓
- [ ] Complex rules with metadata ✓
- [ ] Compilation report stored ✓

### Milestone 3: Rules Execute
- [ ] Simple conditions evaluate correctly ✓
- [ ] SERVICE_CALL conditions work ✓
- [ ] Sequential actions execute ✓
- [ ] Data flows correctly ($result, $stepN) ✓

### Milestone 4: Full E2E Works
- [ ] User intent → LLM → Compiler ✓
- [ ] Pass compilation → Rule created ✓
- [ ] Fail compilation → Feedback to LLM ✓
- [ ] Rules execute with correct results ✓

---

## Commands for Implementation

```bash
# Install/verify dependencies
npm install

# Create migration
npm run migration:create -- --name CreateEventRuleExtended

# Run migrations
npm run migration:run

# Run tests
npm test

# Start server
npm run start

# Watch mode for development
npm run start:dev
```

---

## Next Immediate Action

**→ Start Phase 2: Module Integration**

1. Update `tasks.module.ts` to import and register 3 new services
2. Update `task-compiler.service.ts` to add compilation check
3. Create database migration for `event_rules_extended`
4. Run migration and test database connectivity

Ready?
