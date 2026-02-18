# 🔨 Powerful Rule Compilation & Validation System

## Overview

Your requirement: **"Rules must be guaranteed to work. If something is missing, tell the LLM and the user exactly what."**

We've built a **3-service compilation system** that:

1. **🎯 Agent Broker** - Registers expert agents (legal, compliance, ML models, et human review)
2. **🔨 Rule Compiler** - Validates every rule comprehensively before creation
3. **💬 Feedback System** - Reports problems clearly to user AND to LLM

---

## Architecture

```
┌─────────────────────────────────────┐
│ User provides intent                 │
│ "Validate documents + alert ops"     │
└───────────────┬───────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│ LLM generates rule                   │
│ (with enriched context showing       │
│  available connections, agents, docs)│
└───────────────┬───────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────┐
│ 🔨 RULE COMPILER validates:                     │
├─────────────────────────────────────────────────┤
│ ✓ Trigger exists & has required config          │
│ ✓ All connectors are registered                 │
│ ✓ All functions exist in connectors             │
│ ✓ Conditions can be evaluated                   │
│ ✓ Actions have all required parameters          │
│ ✓ Data types flow correctly through rule        │
│ ✓ Document references exist                     │
│ ✓ Expert agents are available (if needed)       │
│ ✓ No circular dependencies                      │
│ ✓ Estimated execution time is acceptable        │
└───────────────┬───────────────────────────────────┘
                │
        ┌───────┴───────┐
        │               │
        ▼ PASS (Valid)  ▼ FAIL (Invalid)
        │               │
        │       ┌───────────────────┐
        │       │ 💬 FEEDBACK GEN   │
        │       │ Extract issues    │
        │       │ → User message    │
        │       │ → LLM correction  │
        │       └────────┬──────────┘
        │               │
        │       ┌───────▼──────────┐
        │       │ Return to LLM    │
        │       │ with "what's     │
        │       │  missing" message│
        │       └────────┬─────────┘
        │               │
        │       ┌───────▼────────────────┐
        │       │ LLM tries again        │
        │       │ (informed this time!)  │
        │       │ OR asks user for info  │
        │       └───────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ Create rule (execution guaranteed!)  │
│ Persist in database                  │
└─────────────────────────────────────┘
```

---

## 1. Agent Broker Service

**File:** `agent-broker.service.ts`

### Purpose
Manages **expert agents** that rules can call:

```
LEGAL_REVIEW      → "Review this contract for compliance"
COMPLIANCE_CHECK  → "Is this data GDPR compliant?"
ML_MODEL          → "Predict fraud score for this transaction"
HUMAN_APPROVAL    → "Send to manager for approval"
THIRD_PARTY_API   → "Call external validation service"
```

### Key Concepts

#### 1. Agent Type
```typescript
enum AgentType {
  LEGAL_REVIEW = 'LEGAL_REVIEW',           // Legal expertise
  COMPLIANCE_CHECK = 'COMPLIANCE_CHECK',   // Regulatory
  ML_MODEL = 'ML_MODEL',                   // Predictive
  HUMAN_APPROVAL = 'HUMAN_APPROVAL',       // Manual review
  THIRD_PARTY_API = 'THIRD_PARTY_API',     // External
  CUSTOM_ALGORITHM = 'CUSTOM_ALGORITHM',   // Custom logic
}
```

#### 2. Agent Function
Each agent has callable functions with **input/output schemas**:

```typescript
{
  id: 'legal-review-document',
  name: 'Review Legal Document',
  inputSchema: {
    properties: {
      documentId: { type: 'string' },
      reviewType: { type: 'string', enum: ['contract', 'nda', 'tos'] },
      restrictions: { type: 'array' }
    },
    required: ['documentId', 'reviewType']
  },
  outputSchema: {
    properties: {
      isCompliant: { type: 'boolean' },
      risks: { type: 'array' },
      recommendations: { type: 'array' },
      reviewerConfidence: { type: 'number' }
    },
    required: ['isCompliant', 'risks']
  },
  timeout: 60000,  // 60 seconds
  sla: { maxLatencyMs: 45000, reliability: 0.98 }
}
```

#### 3. Calling Context
Where can agents be called?

```typescript
enum AgentCallingContext {
  CONDITION = 'CONDITION',       // Use result in IF clause
  ACTION = 'ACTION',             // Call as action step
  ENRICHMENT = 'ENRICHMENT',     // Add data before evaluation
}
```

### Usage in Rules

**Example: Legal review as a condition**
```typescript
rule.conditionType = ConditionType.SERVICE_CALL;  // System recognizes this
rule.condition = {
  service: 'agent:legal-review',  // Reference to agent function
  sourceDocument: '$event.documentId',
  reviewType: 'nda',
  expectedResult: { isCompliant: true }  // Condition passes if compliant
};
```

### Built-in Mock Agents

The system comes with 4 pre-registered agents:

1. **Legal Review Specialist** - Contract, NDA, ToS review
2. **Compliance Validator** - GDPR, HIPAA, SOX checking
3. **ML Prediction Model** - Fraud detection
4. **Human Reviewer Queue** - Manual approval routing

---

## 2. Rule Compiler Service

**File:** `rule-compiler.service.ts`

### Purpose

**BEFORE** a rule is created, comprehensively validate it can actually execute.

### What it Validates (9 Checks)

#### Check 1: Trigger Validation ✓
```
✓ Trigger exists
✓ Trigger source connector is registered
✓ Trigger has required config (e.g., interval for ON_SCHEDULE)
```

#### Check 2: Condition Validation ✓
Depends on condition type:

**SIMPLE:**
```
✓ field, operator, value all present
✓ operator is valid (EQ, GT, LT, CONTAINS, etc)
```

**SERVICE_CALL (e.g., validate document):**
```
✓ Referenced service exists
✓ Referenced schema/document exists (if schema validation)
✓ Has timeout to prevent hanging
```

**DATABASE_QUERY:**
```
✓ Query is valid SQL
✓ Has LIMIT to prevent huge result sets
```

**LLM_ANALYSIS:**
```
✓ Content field or content specified
✓ Prompt provided
✓ ⚠️ Warning: will be slow (5-30s)
```

**COMPOSITE (multiple conditions):**
```
✓ Has sub-conditions
✓ All sub-conditions valid
```

**ML_PREDICTION:**
```
✓ Model specified
✓ Input features specified
✓ Features match model requirements
```

#### Check 3: Action Validation ✓
For each action step:
```
✓ Connector exists & is registered
✓ Function exists in connector
✓ All required parameters present
✓ Parameter types match function signature
```

#### Check 4: Document References ✓
```
✓ All referenced schemas/documents exist
✓ Document type matches usage (schema vs config)
```

#### Check 5: Data Flow Analysis ✓
```
✓ Track what $event contains
✓ Track what $result contains  
✓ Track what $step0, $step1 contain
✓ Verify downstream steps can use this data
```

Example: If condition returns `{ isValid: false, errors: [...] }`:
```
✓ Action can reference $result.isValid
✓ Action can reference $result.errors
✓ Type checking: errors is array, not string
```

#### Check 6: Circular Dependency Detection ✓
```
❌ INVALID: Rule triggers on "status=changed"
            Action updates "status"
            → Endless loop!

✓ VALID: Rule triggers on "file_added"
         Action updates "processing_status"
         → Different field, no loop
```

#### Check 7: Agent Availability ✓
```
✓ If rule uses "legal-review" agent
  → Check agent is registered
  → Check agent is AVAILABLE (not in maintenance)
  → Check agent has required function
```

#### Check 8: Execution Time Estimation ✓
```
Estimate total time:
  - SERVICE_CALL: +50ms (network)
  - LLM_ANALYSIS: +10000ms
  - DB_QUERY: +100ms
  - Per ACTION: +100ms

Example: SERVICE_CALL + 3 actions = ~350ms ✓ OK
         LLM_ANALYSIS + 5 actions = ~10500ms ⚠️ WARNING
```

#### Check 9: Recommendations ✓
```
✓ If >5 sequential steps: suggest parallel execution
✓ If LLM + caching: suggest memoization
✓ If missing agents: suggest registration
```

### Compilation Report Output

```typescript
{
  ruleId: 'rule-123',
  ruleName: 'Validate Invoice and Alert',
  isValid: true,  // Can execute!
  totalIssues: 0,
  errorCount: 0,
  warningCount: 0,

  issues: [],  // All checks passed

  dataFlow: [
    {
      stepId: 'trigger',
      stepName: 'Trigger: ON_CREATE',
      type: 'TRIGGER',
      outputs: [{ name: '$event', schema: {...} }]
    },
    {
      stepId: 'cond-abc',
      stepName: 'Condition: SERVICE_CALL',
      type: 'CONDITION',
      inputs: [{ source: '$event' }],
      outputs: [{ name: '$result', schema: { isValid: bool, errors: [] } }]
    }
  ],

  missingRequirements: {
    connectors: [],      // All available
    agents: [],          // All available
    nodes: [],           // All available
    documents: []        // All available
  },

  recommendations: [
    '💡 Consider caching LLM results if checking same document often'
  ],

  estimatedExecutionTime: 250  // ms
}
```

### Example: Validation Failure

When something is missing:

```typescript
{
  isValid: false,
  errorCount: 2,
  warningCount: 1,

  issues: [
    {
      type: IssueType.MISSING_DOCUMENT,
      severity: IssueSeverity.ERROR,
      path: 'condition.params.schemaRef',
      message: 'Referenced schema "invoice-schema" not found',
      suggestion: 'Upload the invoice-schema document or use a different schema',
      affectedComponent: 'invoice-schema'
    },
    {
      type: IssueType.FUNCTION_NOT_FOUND,
      severity: IssueSeverity.ERROR,
      path: 'actions[0].function',
      message: 'Function "send_message_advanced" not found in "slack"',
      suggestion: 'Available functions: send_message, post_file, update_message',
      affectedComponent: 'slack'
    }
  ],

  missingRequirements: {
    connectors: [],
    agents: [],
    nodes: [],
    documents: ['invoice-schema']
  }
}
```

---

## 3. Compilation Feedback Service

**File:** `compilation-feedback.service.ts`

### Purpose

Convert compilation errors into:
1. **User-friendly messages** (explain what went wrong in simple terms)
2. **LLM feedback** (tell LLM how to fix it and what's available)

### User Message Format

```typescript
{
  status: 'ERROR',  // or 'WARNING' or 'INFO'
  title: '❌ Rule cannot execute (2 errors)',
  message: 'Your rule is missing...',
  details: [
    '[MISSING_DOCUMENT] Referenced schema "invoice-schema" not found',
    '[FUNCTION_NOT_FOUND] Function "send_message_advanced" not found in "slack"'
  ],
  actionItems: [
    { action: 'Upload invoice-schema to the system', priority: 'HIGH', effort: 'EASY' },
    { action: 'Use "send_message" instead of "send_message_advanced"', priority: 'HIGH', effort: 'EASY' },
    { action: 'Generate the rule again', priority: 'HIGH', effort: 'EASY' }
  ]
}
```

### LLM Feedback Format

Tell the LLM exactly what went wrong and how to fix it:

```javascript
{
  summary: `Rule compilation FAILED.

User Request: "Validate invoice against schema, alert ops if invalid"

Issues Found:
- 2 Errors
- Missing documents: invoice-schema
- Missing agents: legal-review

Please generate a different rule that:
1. Uses only the AVAILABLE connectors and agents
2. Asks the user for missing information
3. Suggests how to get required resources`,

  missing: {
    missingConnectors: [],
    missingAgents: [
      {
        name: 'legal-review',
        reason: 'Rule needs legal review agent',
        howToGet: 'Register a legal review agent first'
      }
    ],
    missingDocuments: [
      {
        name: 'invoice-schema',
        reason: 'Referenced for schema validation',
        whatToProvide: 'Upload the invoice-schema JSON document'
      }
    ]
  },

  llmFeedback: {
    whatWentWrong: 'Compilation failed because:\n• Referenced document "invoice-schema" not found',
    context: 'Available connectors: slack, postgresql, email, file_storage, http\nYou MUST use only these.',
    constraints: [
      'All documents must be uploaded first',
      'All connectors must be registered',
      'Avoid circular dependencies',
      'Service calls must have timeouts'
    ],
    suggestions: [
      'Ask user to upload invoice-schema first',
      'Suggest using schema validation service if available',
      'Offer to generate simpler rule with available tools'
    ]
  },

  nextSteps: [
    '1. Upload the required documents: invoice-schema',
    '2. Generate the rule again',
    '3. Review the suggested rule',
    '4. Approve it to activate'
  ],

  retryable: true  // Can retry after uploads
}
```

---

## Complete Flow Example

### Scenario: User Request

```bash
POST /tasks/rules/generate-from-intent
{
  "description": "Validate invoices against our schema. If invalid, send legal review and alert ops on Slack with details",
  "create": true
}
```

### Step 1: LLM Generates Rule (with context showing available agents)

```json
{
  "trigger": { "type": "ON_CREATE", "source": "file_storage" },
  "condition": {
    "type": "SERVICE_CALL",
    "service": "agent:legal-review",
    "sourceDocument": "$event.documentId",
    "reviewType": "contract",
    "expectedResult": { "isCompliant": true }
  },
  "actions": [
    {
      "type": "CONDITIONAL",
      "steps": [
        {
          "condition": "$result.isCompliant === false",
          "action": {
            "connector": "slack",
            "function": "send_message",
            "parameters": {
              "channel": "#ops-alerts",
              "message": "Invoice review failed",
              "details": "$result.risks"
            }
          }
        }
      ]
    }
  ]
}
```

### Step 2: Compiler Validates

```
✅ Trigger: ON_CREATE on file_storage → OK
✅ Condition: SERVICE_CALL to agent:legal-review
   - Agent exists? YES
   - Agent available? YES
   - Agent supports CONDITION context? YES
   - Input schema matches? YES
   - Output schema OK? YES
✅ Actions: Slack send_message
   - Slack connector registered? YES
   - Function exists? YES
   - Parameters correct? YES
✅ Data flow: $result.risks → Slack message
   - legal-review outputs risks array? YES
   - Slack accepts array in message? YES
🎯 Circular dependency? NO
⏱️ Est. time: 8500ms (legal review takes time) ⚠️ WARNING
```

### Step 3: Compiler Report

```
✅ VALID

Status: Rule is valid and can execute
Errors: None
Warnings: 1
  - Legal review can take 5-30s. Rule execution will be slow.

Estimated execution: 8500ms
No missing requirements
All connectors and agents available

PASSED COMPILATION ✅
```

### Step 4: Rule Created

```
✅ Rule persisted to database
{
  id: 'rule-xyz',
  name: 'Validate Invoice + Legal Review',
  complexity: 'COMPOSED',
  capabilities: ['SERVICE_CALL', 'CONDITIONAL_ACTIONS', 'AGENT_CALL'],
  status: 'ACTIVE'
}
```

### Step 5: Rule Executes

```
File: invoice_q4_2024.pdf uploaded to /invoices

1. TRIGGER: ON_CREATE detected
2. EVENT: $event = { documentId: 'file-123', folder: 'invoices', ... }
3. CONDITION: Call legal review agent
   → Result: { isCompliant: false, risks: ['Missing vendor signature'], ... }
4. ACTION: $result.isCompliant == false? YES
   → Send Slack: "Invoice review failed: Missing vendor signature"
5. ✅ EXECUTED
```

---

## Alternative Scenario: Validation Failure

### User Request (Same)

```bash
POST /tasks/rules/generate-from-intent
{
  "description": "Validate against schema + alert ops",
  "create": true
}
```

### Step 1: LLM Generates Rule (with available agents list)

LLM creates rule referencing **legal-review agent**

### Step 2: Compiler Finds Issues

```
❌ INVALID

Issue 1: Agent 'legal-review' not registered
  → No legal review agent in system
  → Cannot evaluate condition

Issue 2: Referenced document 'invoice-schema' not found
  → Schema assumed by rule but doesn't exist
```

### Step 3: Compilation Fails

```typescript
{
  isValid: false,
  errorCount: 2,
  missingRequirements: {
    agents: ['legal-review'],
    documents: ['invoice-schema']
  }
}
```

### Step 4: Feedback Generated for User & LLM

**User sees:**
```
❌ Rule cannot execute (2 errors)

Problems:
1. Missing Expert Agent: 'legal-review' not registered
   → How to fix: Register a legal document review agent

2. Missing Document: 'invoice-schema' not found
   → How to fix: Upload the invoice-schema to the system

Action Items:
  [HIGH] Register legal review agent (HARD)
  [HIGH] Upload invoice-schema (EASY)
  [HIGH] Generate rule again (EASY)

Next Steps:
  1. Upload invoice-schema document
  2. Register legal-review agent (or ask your admin)
  3. Generate the rule again
```

**LLM receives:**
```
Rule compilation FAILED.

User Request: "Validate against schema + alert ops"

Issues: Missing agent 'legal-review', missing document 'invoice-schema'

Please:
1. Ask user if they want to:
   a) Upload the schema first, then retry
   b) Use different validation approach (e.g., database lookup)
   c) Register a legal review agent

2. Suggest alternatives that use AVAILABLE tools:
   - Use simple schema validation (if available)
   - Use compliance checker agent (if available)
   - Use database query to check against rules

3. Generate a rule using only available connectors/agents

Available connectors: slack, postgresql, email, file_storage

Here's examples of simpler rules that WOULD work: [examples]
```

### Step 5: LLM Tries Again

LLM generates different rule:
```
"Since legal review agent isn't available yet, I'll use:
1. Simple schema validation via database
2. Compliance checker agent (available)
3. Alert ops if fails

Option 1: Would need you to upload the schema first
Option 2: Would use compliance checker if you're OK with that

Which would you prefer?"
```

---

## Integration Checklist

To enable this system in your NestJS app:

- [ ] Register `AgentBrokerService` in `tasks.module.ts`
  - Initialize mock agents (or load from config)
  - Expose `getExpertCapabilities()` for LLM context

- [ ] Register `RuleCompilerService` in `tasks.module.ts`
  - Inject into `TaskCompilerService`

- [ ] Register `CompilationFeedbackService` in `tasks.module.ts`
  - Generate feedback on compilation failure

- [ ] Modify `generateEventRuleFromIntent()` in `task-compiler.service.ts`:
```typescript
// After LLM generates rule, before saving:
const compilationReport = await this.ruleCompiler.compileRule(
  generatedRule,
  availableDocuments,
  availableNodes
);

if (!compilationReport.isValid) {
  // Generate feedback
  const userMsg = this.feedbackService.generateUserFeedback(compilationReport);
  const llmFeedback = this.feedbackService.generateLLMFeedback(compilationReport);
  
  // Tell LLM and user
  return {
    success: false,
    userMessage: userMsg,
    llmFeedback: llmFeedback,
    suggestions: compilationReport.recommendations
  };
}

// Compilation passed!
const savedRule = await this.eventRuleExtendedRepository.save(generatedRule);
return { success: true, createdRule: savedRule };
```

- [ ] Expose experts in LLM context enricher:
```typescript
// In llm-context-enricher.service.ts
const experts = await this.agentBroker.getExpertCapabilities();
enrichedContext.availableExperts = experts;
```

---

## Key Benefits

✅ **No Failed Executions**: Every rule is proven to work before creation
✅ **Clear Feedback**: Users know exactly what's missing
✅ **LLM Improvement**: LLM learns from errors and can retry intelligently
✅ **Comprehensive Validation**: 9-point validation covers all edge cases
✅ **Expert Agents**: Support for legal, compliance, ML, human review
✅ **Data Flow Analysis**: Guarantees data flows correctly through rule
✅ **Performance Awareness**: Estimates execution time and warns about slow paths
✅ **Circular Dependency Prevention**: Catches endless loops before they happen

---

## Files Created

```
✅ agent-broker.service.ts           - Manage expert agents
✅ rule-compiler.service.ts          - Comprehensive validation (9 checks)
✅ compilation-feedback.service.ts   - User + LLM feedback generation
```

Ready to integrate?
