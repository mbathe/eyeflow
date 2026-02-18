# 📚 Complete Reference Guide: Powerful Rule Generation

## Quick Navigation

### 🎯 Start Here
- **[SOLUTION_SUMMARY.md](./SOLUTION_SUMMARY.md)** - Executive summary answering your question
- **[POWERFUL_RULES_GUIDE.md](./POWERFUL_RULES_GUIDE.md)** - Architecture & design overview

### 🔧 Implementation
- **[INTEGRATION_EXAMPLE.md](./INTEGRATION_EXAMPLE.md)** - Exact code to add
- **[IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md)** - Step-by-step plan (15-20 days)

### 💾 New Code Files
- **[llm-context-enricher.service.ts](./src/tasks/services/llm-context-enricher.service.ts)** ✅ Created
  - Enriches LLM context with schemas, examples, patterns
  
- **[event-rule-extended.entity.ts](./src/tasks/entities/event-rule-extended.entity.ts)** ✅ Created
  - New database entity for complex rules

---

## Your Use Case: Step by Step

### The Problem
```
You want: "When document added, validate against schema in another doc, 
           then alert ops with validation errors if invalid"

Current system: Can only do "alert when status=X"
❌ Can't validate against schemas
❌ Can't access validation results
❌ Can't do conditional logic
```

### The Solution
```
Three interconnected layers:

Layer 1: Context Enrichment (🔷)
  └─ LLM now knows about:
     • Available schemas (what to validate against)
     • Validation services (how to validate)
     • Complex rule examples
     • Composition patterns

Layer 2: Extended Rule Storage (📋)
  └─ Rules can now express:
     • SERVICE_CALL conditions (call validator)
     • CONDITIONAL actions (if/else logic)
     • Document references (which schemas they use)
     • Composed actions (chained steps)

Layer 3: Execution Engine (🚀)
  └─ Rules can now:
     • Evaluate SERVICE_CALL conditions
     • Execute IF/ELSE actions
     • Pass results between steps ($result.errors)
     • Handle errors & retries
```

---

## What Each File Does

### 1. **llm-context-enricher.service.ts** (NEW) 🔷
**Purpose:** Enrich LLM context before rule generation

**Key Classes:**
- `LLMContextEnricherService` - Main enrichment service
- `ContextEnrichedLLMForComplexRules` - Extended context interface

**What it provides to LLM:**
```typescript
{
  availableDocuments: [
    { id: "schema-invoice", type: "SCHEMA", content: {...} },
    { id: "config-compliance", type: "CONFIG", content: {...} }
  ],
  
  advancedExampleRules: [
    {
      name: "Cross-Document Schema Validation with Alert",
      complexity: "advanced",
      rule: {
        trigger: { type: "ON_CREATE" },
        condition: { type: "SERVICE_CALL", service: "schema_validator" },
        actions: { type: "CONDITIONAL", steps: [...] }
      }
    }
  ],
  
  validationServices: [
    { name: "Schema Validator", endpoint: "/validation/schema-check" }
  ],
  
  compositionPatterns: [
    { name: "Validate Against External Schema", pattern: "..." }
  ]
}
```

**Usage in code:**
```typescript
const enrichedContext = await contextEnricher.enrichContextForComplexRuleGeneration(
  baseContext,
  userId,
  { availableDocuments: [...] }
);

// Send to LLM with full context
const rule = await llmParser.buildRuleFromDescription(description, enrichedContext);
```

---

### 2. **event-rule-extended.entity.ts** (NEW) 📋
**Purpose:** Store complex rules in database

**New Enums:**
- `ConditionType` - SIMPLE, SERVICE_CALL, DATABASE_QUERY, COMPOSITE, LLM_ANALYSIS, etc.
- `ActionExecutionMode` - SEQUENTIAL, CONDITIONAL, PARALLEL

**Key Interfaces:**
- `ActionStep` - Single action with retry/error handling
- `ComposedAction` - Collection of steps with execution mode
- `DocumentReference` - Track which schemas a rule uses

**Key Columns in EventRuleExtendedEntity:**
```sql
complexity: ENUM('SIMPLE', 'COMPOSED', 'ADVANCED')
usedCapabilities: TEXT[]  -- e.g., ['SERVICE_CALL', 'CONDITIONAL_ACTIONS']
conditionType: ENUM(...)
condition: JSONB           -- depends on conditionType
composedAction: JSONB      -- when complexity is not SIMPLE
documentReferences: JSONB[]
generationMetadata: JSONB  -- llmModel, confidence, capabilities
```

**Helper Functions:**
```typescript
isComposedRule(rule)           // Is this a complex rule?
hasDocumentReferences(rule)    // Does it reference schemas?
describeComposedRule(rule)     // Human-readable description
```

---

### 3. **POWERFUL_RULES_GUIDE.md** (NEW) 📖
**Purpose:** Architecture & design documentation

**Sections:**
1. Problem Statement - Why simple rules aren't enough
2. Solution Architecture - 3-layer design
3. Example: End-to-end flow
4. Key Advantages
5. Next Phase: Confirm & Edit
6. How to Enable

---

### 4. **INTEGRATION_EXAMPLE.md** (NEW) 🔧
**Purpose:** Exact code to add to task-compiler.service.ts

**Contains:**
- Part 1: Import statements
- Part 2: Service injection
- Part 3: Enhanced `generateEventRuleFromIntentEnhanced()` method
- Part 4: New `createExtendedEventRule()` method
- Part 5: Helper methods
- Part 6: Database migration

**Key new method:**
```typescript
async generateEventRuleFromIntentEnhanced(
  userId: string,
  description: string,
  create = false
): Promise<any>
```

This is the core method that:
1. Enriches context
2. Calls LLM with enriched context
3. Assesses rule complexity
4. Creates simple or extended rule

---

### 5. **IMPLEMENTATION_ROADMAP.md** (NEW) 🗺️
**Purpose:** Step-by-step implementation plan

**Phases:**
1. **Phase 1: Setup** (2-4 hours)
   - Register services
   - Create repositories
   - Add database migration

2. **Phase 2: Integrate Enrichment** (4-6 hours)
   - Inject services
   - Implement enhanced method
   - Add helper methods
   - Test basic generation

3. **Phase 3: Rule Execution Engine** (8-10 hours)
   - Create `ExtendedRuleExecutorService`
   - Handle SERVICE_CALL conditions
   - Handle CONDITIONAL actions
   - Handle SEQUENTIAL/PARALLEL

4. **Phase 4: Testing & Validation** (6-8 hours)
   - Unit tests
   - Integration tests
   - Manual test checklist

5. **Phase 5: Draft Mode** (2-3 days)
   - Add DRAFT status
   - Create approval endpoint
   - UI for review before activation

---

### 6. **SOLUTION_SUMMARY.md** (NEW) ✨
**Purpose:** Executive summary answering your question

**Key sections:**
- TL;DR: Yes, we can generate powerful rules
- What we built: 3 layers
- Flow: How it works end-to-end
- Example: Your use case in detail
- Comparison: Before vs After
- Status: What's done vs what's ready

---

## Architecture: The Three Layers

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: LLM CONTEXT ENRICHMENT 🔷                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  LLMContextEnricherService                                  │
│  ├─ Available documents (schemas, configs)                 │
│  ├─ Complex example rules                                  │
│  ├─ Validation services                                    │
│  └─ Composition patterns                                   │
│                                                               │
│  → Sends to LLM with: "Here's what you can do!"           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ LAYER 2: RULE STORAGE 📋                                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  EventRuleExtendedEntity                                    │
│  ├─ Complex conditions (SERVICE_CALL, DATABASE_QUERY)      │
│  ├─ Composed actions (SEQUENTIAL, CONDITIONAL, PARALLEL)   │
│  ├─ Document references (which schemas)                    │
│  ├─ Generation metadata (how it was created)               │
│  └─ Execution safeguards (timeouts, retries)               │
│                                                               │
│  → Stores full rule complexity in database                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ LAYER 3: EXECUTION ENGINE 🚀                                │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ExtendedRuleExecutorService                               │
│  ├─ Evaluate SERVICE_CALL conditions                       │
│  ├─ Execute CONDITIONAL actions (if/else)                  │
│  ├─ Execute SEQUENTIAL actions (chained)                   │
│  ├─ Execute PARALLEL actions                               │
│  └─ Pass $result between steps                             │
│                                                               │
│  → Runs complex rules with full capabilities               │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow: User Request to Execution

```
1. USER REQUEST (Natural Language)
   "When invoice uploaded, validate against schema, 
    alert ops if fails with the errors"
        ↓
2. CONTEXT ENRICHMENT
   LLMContextEnricherService adds:
   ├─ Available schemas (invoice-schema)
   ├─ Example rules (validation + alert pattern)
   ├─ Validation services (schema_validator)
   └─ Composition patterns
        ↓
3. LLM GENERATION
   Claude receives rich context
   → "I can use SERVICE_CALL for validation,
      CONDITIONAL actions for if/else,
      document refs for schema"
   → Generates complex rule
        ↓
4. RULE CREATION
   TaskCompilerService:
   ├─ Receives generated rule
   ├─ Assesses complexity: "COMPOSED"
   ├─ Creates EventRuleExtendedEntity
   ├─ Stores conditionType: "SERVICE_CALL"
   ├─ Stores composedAction with CONDITIONAL mode
   └─ Saves documentReferences
        ↓
5. DATABASE STORAGE
   event_rules_extended table:
   {
     id: "rule-123",
     complexity: "COMPOSED",
     conditionType: "SERVICE_CALL",
     condition: { service: "schema_validator", ... },
     composedAction: { mode: "CONDITIONAL", steps: [...] },
     documentReferences: [{ documentId: "invoice-schema", ... }]
   }
        ↓
6. EVENT TRIGGERS
   User uploads invoice.pdf
        ↓
7. RULE EVALUATION
   ExtendedRuleExecutorService:
   ├─ Evaluate SERVICE_CALL condition
   │  → Call schema validator
   │  → Returns { isValid: false, errors: [...] }
   ├─ Check condition: !isValid? YES
   ├─ Execute CONDITIONAL action
   │  → IF !isValid: send Slack alert
   └─ Pass $result.errors to Slack message
        ↓
8. ACTION EXECUTION
   Slack receives:
   {
     channel: "#ops-alerts",
     message: "Invoice validation FAILED",
     details: ["Missing vendor_id", "Amount exceeds limit"]
   }
        ↓
9. RESULT
   #ops-alerts channel shows:
   "Invoice validation FAILED
    ❌ Missing vendor_id
    ❌ Amount exceeds limit (150000 > 100000)"
```

---

## How to Start Implementation

### Quick Start (If you want to dive in):
1. Read **SOLUTION_SUMMARY.md**
2. Review **POWERFUL_RULES_GUIDE.md**
3. Follow **IMPLEMENTATION_ROADMAP.md** Phase 1
4. Copy code from **INTEGRATION_EXAMPLE.md**

### Recommended Start (For careful planning):
1. Read all guide files
2. Understand the 3 layers
3. Plan database migrations
4. Schedule implementation phases
5. Set up testing strategy

### Conservative Start (If unsure):
1. Create context enricher (Phase 1)
2. Test that context enrichment works
3. Don't use extended rules yet
4. Verify LLM receives rich context
5. Then proceed to Phase 2

---

## Key Concepts Explained

### SERVICE_CALL Condition
```
What: Call external service during rule evaluation
Why: Validate documents, check compliance, query services
Example: Call schema_validator to validate invoice

In rule:
{
  conditionType: "SERVICE_CALL",
  condition: {
    service: "schema_validator",
    params: { documentId: "$event.id", schemaRef: "doc:invoice-schema" }
  }
}
```

### CONDITIONAL Actions
```
What: IF condition THEN action1, ELSE action2
Why: Different behavior based on validation result
Example: IF valid → process, ELSE → alert

In rule:
{
  mode: "CONDITIONAL",
  steps: [
    {
      executionCondition: { field: "$result.isValid", value: false },
      action: { connector: "slack", function: "send_message" }
    }
  ]
}
```

### Document References
```
What: Track which schemas/documents a rule depends on
Why: Impact analysis, audit trail, documentation
Example: This rule validates against invoice-schema

In rule:
{
  documentReferences: [
    { documentId: "invoice-schema", usedFor: "SCHEMA_VALIDATION" }
  ]
}
```

### $result Variable
```
What: Contains results from conditions (available in actions)
Why: Pass validation errors, SQL results, etc. to actions
Example: Send validation errors in Slack message

Usage:
{
  connector: "slack",
  function: "send_message",
  params: {
    message: "Validation failed: $result.errors"  // ← Access here!
  }
}
```

---

## Files to Create/Modify Summary

| File | Status | Purpose |
|------|--------|---------|
| llm-context-enricher.service.ts | ✅ Done | Context enrichment |
| event-rule-extended.entity.ts | ✅ Done | Complex rule storage |
| task-compiler.service.ts | 📝 Ready | Add enhanced method |
| tasks.module.ts | 📝 Ready | Register services |
| extended-rule-executor.service.ts | 🆕 Needed | Execution engine |
| *-migration.ts | 🆕 Needed | Database schema |

---

## Success Metrics

After implementation:
- ✅ Can generate rules with SERVICE_CALL conditions
- ✅ Can generate rules with CONDITIONAL actions
- ✅ Rules track document references
- ✅ Rules execute with full composition
- ✅ $result available in actions
- ✅ Validation errors in Slack messages
- ✅ Draft mode for approval

---

## Questions?

Each file has detailed comments and examples.

- **"How does context enrichment work?"** → POWERFUL_RULES_GUIDE.md
- **"Show me the exact code to add"** → INTEGRATION_EXAMPLE.md
- **"What's the implementation timeline?"** → IMPLEMENTATION_ROADMAP.md
- **"Does this solve my use case?"** → SOLUTION_SUMMARY.md

---

## Next Actions

Choose one:

**🚀 Option A: Start Building**
- Phase 1 takes 2-4 hours
- Get context enrichment working immediately
- See how LLM response changes

**📚 Option B: Study & Plan**
- Read all documentation
- Finalize design
- Plan testing strategy
- Schedule developer time

**❓ Option C: Ask Questions**
- Review the guides
- Identify unclear parts
- Discuss approach

Which sounds best for your team?
