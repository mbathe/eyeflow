# 🚀 Powerful Rule Generation with LLM Context Enrichment

## Problem Statement

**Initial Goal:** Build an "ultra-powerful" rule engine that goes beyond simple trigger→action patterns.

**User Case:** 
```
Situation: A document is added to a folder
Decision: Check if it respects a schema stored in ANOTHER document  
Action: If valid → file processed; If invalid → alert ops team on Slack
AND include validation details in the message
```

This **cannot** be expressed with simple EventRuleEntity:
```typescript
// Limited!
condition: { field: "status", operator: "EQ", value: "valid" }
actions: ["slack_post_file"]  // No access to validation results!
```

## Solution Architecture

The system has 3 interconnected layers:

### Layer 1: LLM Context Enrichment 🔷
**File:** `llm-context-enricher.service.ts`

**What it does:**
- Collects available schemas/documents from the system
- Provides complex rule examples (validation, chaining, conditional logic)
- Lists available validation services and their capabilities
- Shows composition patterns to guide LLM generation

**Example context sent to Python LLM service:**
```json
{
  "availableDocuments": [
    {
      "id": "schema-invoice-validation",
      "type": "SCHEMA",
      "contentPreview": "{\"type\": \"object\", \"properties\": {...}}"
    }
  ],
  "advancedExampleRules": [
    {
      "name": "Cross-Document Schema Validation with Alert",
      "complexity": "advanced",
      "rule": {
        "trigger": { "type": "ON_CREATE", "source": "file_storage" },
        "condition": {
          "type": "SERVICE_CALL",
          "service": "schema_validator",
          "schemaRef": "doc:schema-invoice-validation"
        },
        "actions": {
          "type": "CONDITIONAL",
          "steps": [
            { "if": "validation.isValid", "then": "UPDATE_STATUS" },
            { "else": "ALERT_SLACK_WITH_DETAILS" }
          ]
        }
      }
    }
  ],
  "validationServices": [
    {
      "name": "Schema Validator",
      "endpoint": "POST /validation/schema-check",
      "capability": "SCHEMA_VALIDATION"
    }
  ]
}
```

### Layer 2: Extended Rule Entity 📋
**File:** `event-rule-extended.entity.ts`

**Now supports:**

1. **Complex Conditions:**
   ```typescript
   ConditionType.SERVICE_CALL  // Call external service for validation
   ConditionType.DATABASE_QUERY // Query DB for decision
   ConditionType.COMPOSITE     // Multiple conditions with AND/OR logic
   ConditionType.LLM_ANALYSIS  // Use LLM to analyze data
   ```

2. **Composed Actions:**
   ```typescript
   ActionExecutionMode.SEQUENTIAL   // Chained: step 1 → step 2 → step 3
   ActionExecutionMode.CONDITIONAL  // IF condition: do action A, ELSE: do action B
   ActionExecutionMode.PARALLEL     // Run multiple actions simultaneously
   ```

3. **Document References:**
   ```typescript
   documentReferences: [
     {
       documentId: "schema-invoice-validation",
       usedFor: "SCHEMA_VALIDATION"
     }
   ]
   ```

### Layer 3: Enhanced LLM Generation Flow 🧠
**File:** `task-compiler.service.ts` (enhanced)

**Steps:**
1. User provides intent: "Alert ops on Slack if document doesn't match validation schema"
2. System enriches context with available documents + examples
3. Python LLM generates **complex rule** instead of simple one
4. NestJS resolves references to actual schemas/services
5. Rule persisted with full composition metadata

---

## Example: End-to-End Flow

### Input (User Request)
```bash
POST /tasks/rules/generate-from-intent
{
  "description": "When a new invoice is uploaded, validate it against our invoice schema, and if it's invalid, alert the ops team on Slack with the validation errors and don't process it further",
  "create": true
}
```

### Behind the Scenes

#### Step 1: Enrich Context for LLM
```typescript
// task-compiler.service.ts
async generateEventRuleFromIntent(userId: string, description: string) {
  // Get base context with all connectors/functions
  const baseContext = await this.llmContextEnhanced.getContext();
  
  // 🔷 NEW: Enrich with schemas, examples, composition patterns
  const enrichedContext = await this.contextEnricher.enrichContextForComplexRuleGeneration(
    baseContext,
    userId,
    {
      availableDocuments: [
        { id: "schema-invoice", type: "SCHEMA", ... },
        { id: "config-compliance", type: "CONFIG", ... }
      ]
    }
  );
  
  // Send to Python LLM with full context
  const generatedRule = await this.llmParser.buildRuleFromDescription(
    description,
    enrichedContext  // 🔷 Rich context!
  );
  
  return generatedRule;
}
```

#### Step 2: LLM Generates Complex Rule (Python Service)
```python
# eyeflow-llm-service/main.py

@app.post("/api/rules/generate")
async def generate_rules(request: GenerateRulesRequest):
    
    # 🔷 LLM now sees:
    # - Available schemas and their contents
    # - Examples of complex rules (validation + conditional + chaining)
    # - Validation services available
    # - Composition patterns
    
    prompt = f"""
    User request: {request.user_intent}
    
    Available schemas in system:
    {json.dumps(request.aggregated_context['availableDocuments'])}
    
    Example of complex rule (for reference):
    {json.dumps(request.aggregated_context['advancedExampleRules'][0])}
    
    Generate a rule following this pattern if relevant.
    """
    
    response = llm.generate(prompt)
    
    # Response now includes service calls, conditional actions, etc.
    return {
      "workflow_rules": {
        "rules": [
          {
            "name": "Validate Invoice and Alert",
            "trigger": {
              "type": "ON_CREATE",
              "source": "file_storage",
              "filters": {"folder": "invoices"}
            },
            "conditions": [
              {
                "type": "SERVICE_CALL",
                "service": "schema_validator",
                "params": {
                  "documentId": "$event.id",
                  "schemaRef": "doc:schema-invoice-validation"
                },
                "expectedResult": {"field": "isValid", "operator": "EQ", "value": false}
              }
            ],
            "actions": [
              {
                "type": "CONDITIONAL",
                "steps": [
                  {
                    "condition": "$result.validationService.isValid",
                    "ifTrue": [
                      {
                        "connector": "file_storage",
                        "function": "mark_as_processed",
                        "params": {"documentId": "$event.id", "status": "APPROVED"}
                      }
                    ],
                    "ifFalse": [
                      {
                        "connector": "slack",
                        "function": "send_message",
                        "params": {
                          "channel": "#ops-alerts",
                          "message": f"Invoice {event.name} validation failed",
                          "details": "$result.validationService.errors"
                        }
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    }
```

#### Step 3: NestJS Converts to EventRuleExtendedEntity
```typescript
// task-compiler.service.ts

async createExtendedEventRule(
  userId: string,
  llmSuggestion: any,
  globalTaskId: string
): Promise<EventRuleExtendedEntity> {
  
  const rule = new EventRuleExtendedEntity();
  rule.userId = userId;
  rule.globalTaskId = globalTaskId;
  rule.name = llmSuggestion.name;
  rule.description = llmSuggestion.description;
  
  // 🔷 Mark as complex
  rule.complexity = 'COMPOSED';
  rule.usedCapabilities = ['SERVICE_CALL', 'CONDITIONAL_ACTION'];
  
  // 🔷 Store trigger
  rule.trigger = llmSuggestion.trigger;
  
  // 🔷 Store complex condition (SERVICE_CALL to validate schema)
  rule.conditionType = ConditionType.SERVICE_CALL;
  rule.condition = {
    service: "schema_validator",
    params: {
      documentId: "$event.id",
      schemaRef: "doc:schema-invoice-validation"
    }
  };
  
  // 🔷 Store composed actions (CONDITIONAL: if valid do X, else do Y)
  rule.composedAction = {
    mode: ActionExecutionMode.CONDITIONAL,
    steps: [
      {
        stepId: "step-0",
        stepIndex: 0,
        connector: "slack",
        function: "send_message",
        parameters: {
          channel: "#ops-alerts",
          message: "Invoice validation FAILED",
          details: "$result.validationService.errors"  // Reference to validation result!
        },
        executionCondition: {
          type: ConditionType.SIMPLE,
          definition: { 
            field: "$result.validationService.isValid", 
            operator: "EQ", 
            value: false 
          }
        }
      }
    ]
  };
  
  // 🔷 Track document references
  rule.documentReferences = [
    {
      documentId: "schema-invoice-validation",
      usedFor: "SCHEMA_VALIDATION"
    }
  ];
  
  // 🔷 Metadata showing how rule was generated
  rule.generationMetadata = {
    generatedByLLM: true,
    llmModel: "claude-3-haiku",
    llmConfidence: 0.92,
    generatedAt: new Date().toISOString(),
    userIntent: description,
    capabilities: {
      supportsServiceCalls: true,
      supportsDatabaseQueries: false,
      supportsChaining: true,
      supportsConditionalActions: true
    }
  };
  
  return this.eventRuleExtendedRepository.save(rule);
}
```

#### Step 4: Rule Engine Executes Complex Logic
```typescript
// When file added to "invoices" folder (trigger)

// ✅ Step 1: Evaluate condition (SERVICE_CALL)
const validationResult = await callExternalService(
  "POST /validation/schema-check",
  {
    documentId: event.id,
    schemaRef: "doc:schema-invoice-validation"
  }
);

// ✅ Step 2: Evaluate action conditions
if (!validationResult.isValid) {
  // ✅ Step 3: Execute conditional action
  await slackConnector.send_message({
    channel: "#ops-alerts",
    message: `Invoice ${event.name} validation FAILED`,
    details: validationResult.errors  // ← Errors from validation!
  });
} else {
  // ✅ Alternative: Mark as approved
  await fileStorageConnector.mark_as_processed({
    documentId: event.id,
    status: "APPROVED"
  });
}
```

---

## Key Advantages

### For LLM (Now Empowered! 💪)
- ✅ Sees examples of complex rules it can generate
- ✅ Knows what validation services exist
- ✅ Understands composition patterns (chaining, conditional, parallel)
- ✅ Can reference schemas/documents from the system
- ✅ Can generate rules with error handling and retries

### For System
- ✅ Rules can now be **powerful and dynamic**
- ✅ Cross-document validation becomes possible
- ✅ Multi-step workflows can be expressed
- ✅ Conditional logic based on service results
- ✅ Still backwards compatible with simple rules

### For End Users
- ✅ Describe sophisticated business logic in natural language
- ✅ System automatically generates structured rule
- ✅ LLM understands the full context and generates appropriate rules
- ✅ Confidence scores reflect rule complexity

---

## Next Phase: Confirm & Edit (Draft Mode)

**Goal:** Add safety layer before persisting generated rules.

**Flow:**
1. User generates rule with `create=false` → gets suggestions + preview
2. User reviews in a UI → sees:
   - Rule structure diagram
   - What services will be called
   - Document references used
   - Example execution trace
3. User can edit/refine (pick different schema, adjust thresholds, etc.)
4. User confirms → `create=true` → rule persists

**Implementation:**
- Add `DRAFT` status to EventRuleStatus
- Endpoint: `POST /tasks/rules/{ruleId}/approve` to move from DRAFT → ACTIVE
- UI shows side-by-side: "What you asked" vs "What we generated"

---

## How to Enable This (Steps)

### 1. Register LLMContextEnricherService
```typescript
// tasks.module.ts
import { LLMContextEnricherService } from './services/llm-context-enricher.service';

@Module({
  providers: [
    LLMContextEnhancedService,
    LLMContextEnricherService,  // 🔷 Add this
    // ... rest
  ],
})
export class TasksModule {}
```

### 2. Use in Task Compiler
```typescript
// task-compiler.service.ts
constructor(
  private llmContextEnhanced: LLMContextEnhancedService,
  private contextEnricher: LLMContextEnricherService,  // 🔷 Inject
  // ... rest
) {}

async generateEventRuleFromIntent(userId: string, description: string) {
  const baseContext = await this.llmContextEnhanced.getContext();
  
  // 🔷 Enrich!
  const enrichedContext = await this.contextEnricher
    .enrichContextForComplexRuleGeneration(baseContext, userId);
  
  const rule = await this.llmParser
    .buildRuleFromDescription(description, enrichedContext);
  
  // ... rest
}
```

### 3. Create Rule Execution Engine
Need a new service to handle CONDITIONAL | CHAINED | PARALLEL actions:
```typescript
class ExtendedRuleExecutor {
  async executeComposedRule(rule: EventRuleExtendedEntity, event: any) {
    // 1. Evaluate complex condition (SERVICE_CALL, DATABASE_QUERY, etc.)
    const conditionResult = await this.evaluateCondition(rule.condition);
    
    // 2. If passes, execute composed actions
    if (conditionResult) {
      if (rule.composedAction.mode === 'CONDITIONAL') {
        // ... handle conditional
      } else if (rule.composedAction.mode === 'CHAINED') {
        // ... handle sequential
      }
    }
  }
}
```

---

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| Rule Complexity | Simple: field op value → function | **Composed: SERVICE_CALL → CONDITIONAL_ACTION → CHAINED** |
| LLM Context | Minimal (just connector list) | **Rich: schemas + examples + patterns + services** |
| Use Cases | Basic alerts | **Cross-doc validation, multi-step workflows, conditional pipelines** |
| Storage | EventRuleEntity (simple) | **EventRuleExtendedEntity (complex-capable)** |
| User Experience | "Alert on status change" | **"Validate document against schema, then alert with details"** |

The system is now ready for **powerful, AI-generated, composable workflows** 🚀
