# 🚀 Implementation Roadmap: Powerful Rule Generation

## Overview

Your vision: **"Build an ultra-powerful rule engine, not just simple rules"**

We've designed a **3-layer system** that enables the LLM to generate complex, composable workflows:

1. **Layer 1 (Context Enrichment)** ✅ Created
   - `llm-context-enricher.service.ts` - Enriches LLM context with schemas, examples, patterns

2. **Layer 2 (Data Model)** ✅ Created
   - `event-rule-extended.entity.ts` - Stores complex rules with composed conditions/actions

3. **Layer 3 (Integration)** 📋 Ready to implement
   - Modify `task-compiler.service.ts` to use enriched context and create extended rules

---

## Implementation Steps (Week 1-2)

### Phase 1: Setup (2-4 hours)

#### Step 1.1: Register Services
```typescript
// src/tasks/tasks.module.ts

import { LLMContextEnricherService } from './services/llm-context-enricher.service';
import { EventRuleExtendedEntity } from './entities/event-rule-extended.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    EventRuleEntity,
    EventRuleExtendedEntity,  // 🔷 ADD
    GlobalTaskEntity,
    // ...
  ])],
  providers: [
    LLMContextEnhancedService,
    LLMContextEnricherService,  // 🔷 ADD
    TaskCompilerService,
    // ...
  ],
})
export class TasksModule {}
```

#### Step 1.2: Create Repository for Extended Rules
```typescript
// src/tasks/repositories/event-rule-extended.repository.ts

import { Repository } from 'typeorm';
import { EventRuleExtendedEntity } from '../entities/event-rule-extended.entity';

export interface IEventRuleExtendedRepository
  extends Repository<EventRuleExtendedEntity> {
  // Optional: custom query methods
  findComplexRulesByUserId(
    userId: string,
    minComplexity: 'COMPOSED' | 'ADVANCED',
  ): Promise<EventRuleExtendedEntity[]>;
}
```

#### Step 1.3: Add Database Migration
Run:
```bash
npm run migration:create -- CreateEventRulesExtended
```

Add the SQL from `INTEGRATION_EXAMPLE.md` Part 6 to the migration file.

Apply migration:
```bash
npm run migration:run
```

### Phase 2: Integrate Enrichment (4-6 hours)

#### Step 2.1: Inject Repository & Enricher into TaskCompilerService
```typescript
export class TaskCompilerService {
  constructor(
    // ... existing
    private eventRuleExtendedRepository: Repository<EventRuleExtendedEntity>,
    private contextEnricher: LLMContextEnricherService,  // 🔷 ADD
  ) {}
}
```

#### Step 2.2: Implement `generateEventRuleFromIntentEnhanced`
Copy the code from `INTEGRATION_EXAMPLE.md` Part 3 into `task-compiler.service.ts`.

This is the **key method** that:
- Enriches context with schemas + examples
- Calls LLM with rich context
- Assesses rule complexity
- Creates either simple or extended rules

#### Step 2.3: Add Helper Methods
Copy helper methods from `INTEGRATION_EXAMPLE.md` Parts 4-6:
- `createExtendedEventRule()`
- `assessRuleComplexity()`
- `extractCapabilities()`
- `buildConditionalActionSteps()`
- `getAvailableDocuments()`
- `suggestToEventRuleCreateDto()`

#### Step 2.4: Test Enhanced Generation
```bash
# Terminal 1: Start NestJS
npm run build && npm run start

# Terminal 2: Test endpoint
curl -X POST http://localhost:3000/tasks/rules/generate-from-intent \
  -H "Content-Type: application/json" \
  -H "X-User-ID: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{
    "description": "When invoice uploaded, validate against our schema, alert ops if invalid with the validation errors",
    "create": false
  }' | jq .

# You should see:
# ✅ suggestions with "complexity": "COMPOSED"
# ✅ capabilities: ["SERVICE_CALL", "CONDITIONAL_ACTIONS"]
# ✅ enrichmentInfo showing what documents/patterns were considered
```

### Phase 3: Rule Execution Engine (8-10 hours)

#### Step 3.1: Create Extended Rule Executor
```typescript
// src/tasks/services/extended-rule-executor.service.ts

@Injectable()
export class ExtendedRuleExecutorService {
  /**
   * Execute a complex rule
   */
  async executeComposedRule(
    rule: EventRuleExtendedEntity,
    event: any,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    
    // 1. Evaluate condition (may be SERVICE_CALL, DATABASE_QUERY, etc)
    const conditionResult = await this.evaluateCondition(
      rule.conditionType,
      rule.condition,
      event,
    );
    
    // 2. If condition passes, execute actions
    if (conditionResult) {
      const actionResult = await this.executeComposedActions(
        rule.composedAction || { mode: 'SEQUENTIAL', steps: [] },
        event,
        conditionResult,  // Pass validation results!
        context,
      );
      return actionResult;
    }
    
    return { success: false, reason: 'Condition not met' };
  }

  /**
   * Evaluate complex condition
   */
  private async evaluateCondition(
    type: ConditionType,
    definition: any,
    event: any,
  ): Promise<any> {
    switch (type) {
      case ConditionType.SIMPLE:
        return this.evaluateSimpleCondition(definition, event);
      case ConditionType.SERVICE_CALL:
        return this.evaluateServiceCallCondition(definition, event);
      case ConditionType.DATABASE_QUERY:
        return this.evaluateDatabaseQuery(definition, event);
      case ConditionType.COMPOSITE:
        return this.evaluateCompositeCondition(definition, event);
      // ... others
    }
  }

  /**
   * SERVICE_CALL condition: Call external service
   * e.g., call schema validator
   */
  private async evaluateServiceCallCondition(def: any, event: any): Promise<any> {
    const { service, params, expectedResult } = def;
    
    // Call service (e.g., schema validator)
    const serviceResult = await this.callExternalService(service, params, event);
    
    // Check if result matches expectation
    const matches = this.checkExpectation(serviceResult, expectedResult);
    
    return {
      conditionMet: matches,
      serviceResult,  // Can be used in actions!
    };
  }

  /**
   * Execute composed actions
   */
  private async executeComposedActions(
    composition: ComposedAction,
    event: any,
    conditionResult: any,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    
    switch (composition.mode) {
      case ActionExecutionMode.SEQUENTIAL:
        return this.executeSequential(composition.steps, event, conditionResult);
      case ActionExecutionMode.CONDITIONAL:
        return this.executeConditional(composition.steps, event, conditionResult);
      case ActionExecutionMode.PARALLEL:
        return this.executeParallel(composition.steps, event, conditionResult);
    }
  }

  /**
   * CONDITIONAL actions: IF condition THEN action1, ELSE action2
   */
  private async executeConditional(
    steps: ActionStep[],
    event: any,
    conditionResult: any,
  ): Promise<ExecutionResult> {
    const results = [];

    for (const step of steps) {
      // Check execution condition for this step
      if (step.executionCondition) {
        const shouldExecute = await this.evaluateCondition(
          step.executionCondition.type,
          step.executionCondition.definition,
          { $event: event, $result: conditionResult },
        );

        if (!shouldExecute.conditionMet) {
          results.push({ stepId: step.stepId, skipped: true });
          continue;
        }
      }

      // Execute action
      const result = await this.executeAction(
        step,
        { $event: event, $result: conditionResult, $previousResults: results },
      );
      results.push(result);
    }

    return { success: true, results };
  }

  /**
   * SEQUENTIAL actions: Run step 1, then step 2, etc
   * Pass results between steps ($step0, $step1, etc)
   */
  private async executeSequential(
    steps: ActionStep[],
    event: any,
    conditionResult: any,
  ): Promise<ExecutionResult> {
    const results: any[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      // Build context with access to previous results
      const context = {
        $event: event,
        $result: conditionResult,
        ...Object.fromEntries(
          results.map((r, idx) => [`$step${idx}`, r.output]),
        ),
      };

      const result = await this.executeActionWithRetry(step, context);
      results.push(result);

      // If step failed and no error handling, stop
      if (!result.success && (!step.onError || step.onError.strategy === 'FAIL')) {
        throw new Error(`Action step ${i} failed: ${result.error}`);
      }
    }

    return { success: true, results };
  }

  /**
   * Execute a single action
   */
  private async executeAction(
    step: ActionStep,
    context: Record<string, any>,
  ): Promise<any> {
    // Get connector
    const connector = await this.connectorRegistry.getConnector(step.connector);
    
    // Resolve parameters (replace $event, $result, etc)
    const resolvedParams = this.resolveParameters(step.parameters, context);
    
    // Call function
    return connector[step.function](resolvedParams, context);
  }

  /**
   * Helper: Resolve $event, $result, $step0 references in parameters
   */
  private resolveParameters(params: any, context: Record<string, any>): any {
    // Deep replace $-prefixed keys
    return JSON.parse(
      JSON.stringify(params).replace(/\$\w+/g, (match) => {
        const value = context[match];
        return value ? JSON.stringify(value) : match;
      }),
    );
  }
}
```

#### Step 3.2: Hook into Rule Processing
```typescript
// src/kafka/cdc-event-processor.service.ts or rule-engine.service.ts

@Injectable()
export class RuleEngineService {
  async processEvent(event: any): Promise<void> {
    // Get all active rules for this event type
    const rules = await this.getRulesForEvent(event);

    for (const rule of rules) {
      try {
        // Check if rule is simple or complex
        if (rule instanceof EventRuleExtendedEntity && isComposedRule(rule)) {
          // Use extended executor
          await this.extendedRuleExecutor.executeComposedRule(rule, event, {});
        } else {
          // Use simple executor (existing logic)
          await this.simpleRuleExecutor.executeRule(rule, event);
        }
      } catch (error) {
        this.logger.error(`Rule ${rule.id} execution failed: ${error}`);
      }
    }
  }
}
```

### Phase 4: Testing & Validation (6-8 hours)

#### Step 4.1: Unit Tests
```typescript
// src/tasks/services/__tests__/extended-rule-executor.spec.ts

describe('ExtendedRuleExecutorService', () => {
  let service: ExtendedRuleExecutorService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ExtendedRuleExecutorService],
    }).compile();
    service = module.get(ExtendedRuleExecutorService);
  });

  describe('SERVICE_CALL condition', () => {
    it('should evaluate schema validation and return errors', async () => {
      const rule = createMockComposedRule({
        conditionType: ConditionType.SERVICE_CALL,
        condition: {
          service: 'schema_validator',
          params: { schemaRef: 'doc:invoice-schema' },
        },
      });

      const event = { id: 'doc-123', name: 'invoice.pdf' };
      const result = await service.executeComposedRule(rule, event, {});

      expect(result.success).toBe(false);
      expect(result.reason).toContain('validation');
    });
  });

  describe('CONDITIONAL actions', () => {
    it('should execute THEN action if condition true', async () => {
      const rule = createMockComposedRule({
        composedAction: {
          mode: ActionExecutionMode.CONDITIONAL,
          steps: [
            {
              stepId: 'slack-alert',
              connector: 'slack',
              function: 'send_message',
              parameters: { message: 'Validation failed' },
              executionCondition: {
                type: ConditionType.SIMPLE,
                definition: { field: '$result.conditionMet', operator: 'EQ', value: false },
              },
            },
          ],
        },
      });

      const result = await service.executeComposedRule(rule, {}, {});
      expect(result.results[0].success).toBe(true);
    });
  });
});
```

#### Step 4.2: Integration Tests
```bash
# Test full flow
npm run test:e2e -- tasks/rules/generate-from-intent
```

#### Step 4.3: Manual Testing Checklist
```
[ ] Generate simple rule (create=false) → see suggestions
[ ] Create simple rule (create=true) → verify in database
[ ] Generate complex rule with SERVICE_CALL → see "complexity: COMPOSED"
[ ] Create complex rule → verify capabilities stored
[ ] Trigger event → rule executes with conditional actions
[ ] Verify conditional logic works (if/else)
[ ] Verify $result.errors accessible in Slack message
[ ] Check that Slack receives validation details
```

---

## Testing the Full Stack

### Test 1: Simple vs Complex Rules
```bash
# Simple rule (what we have now)
curl -X POST http://localhost:3000/tasks/rules/generate-from-intent \
  -H "X-User-ID: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{
    "description": "Alert me when status is ACTIVE",
    "create": false
  }' | jq '.suggestions[0].complexity'
# Expected: "SIMPLE"

# Complex rule (new capability!)
curl -X POST http://localhost:3000/tasks/rules/generate-from-intent \
  -H "X-User-ID: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{
    "description": "Validate document against schema, then alert ops if invalid with validation errors",
    "create": false
  }' | jq '.suggestions[0].complexity'
# Expected: "COMPOSED" or "ADVANCED"
```

### Test 2: Context Enrichment Effect
```bash
# Compare LLM responses with and without enrichment
# (You would need to temporarily disable enrichment to see the difference)

WITHOUT enrichment:
- LLM generates generic alerts
- No SERVICE_CALL conditions
- No conditional actions
- No document references

WITH enrichment:
- LLM knows about available schemas
- Suggests SERVICE_CALL to validator service
- Generates CONDITIONAL actions (if valid/invalid)
- References specific documents
```

### Test 3: Rule Execution
```bash
# Create a composed rule
rule_id=$(curl -X POST ... "create": true | jq -r '.createdRule.id')

# Trigger event that matches rule
curl -X POST http://localhost:3000/events \
  -d '{
    "type": "file_added",
    "folder": "invoices",
    "documentId": "doc-123",
    "documentName": "invoice.pdf"
  }'

# Expected result:
# 1. Rule triggers
# 2. SERVICE_CALL condition executes (validates against schema)
# 3. Condition fails (invalid invoice)
# 4. CONDITIONAL action executes (if invalid → alert Slack)
# 5. Slack message includes $result.validationErrors
```

---

## Next: Confirm & Edit Mode

After Phase 1-4 are complete, add safety layer:

### Step 1: Add DRAFT status
```typescript
export enum EventRuleStatus {
  DRAFT = 'DRAFT',        // 🔷 NEW: Awaiting user approval
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  // ...
}
```

### Step 2: Modify generation to return DRAFT
```typescript
// When create=true, return rule in DRAFT status
extendedRule.status = EventRuleStatus.DRAFT;

// Return with preview + ask for confirmation
return {
  success: true,
  ruleId: savedRule.id,
  status: 'DRAFT',
  preview: generateRulePreview(savedRule),
  message: 'Rule ready for review. Click approve to activate.',
};
```

### Step 3: Add approval endpoint
```typescript
@Post('/rules/:ruleId/approve')
async approveRule(
  @Param('ruleId') ruleId: string,
  @Headers('X-User-ID') userId: string,
): Promise<any> {
  const rule = await this.eventRuleExtendedRepository.findOne({
    where: { id: ruleId, userId },
  });

  if (rule.status !== EventRuleStatus.DRAFT) {
    throw new BadRequestException('Rule must be in DRAFT status');
  }

  rule.status = EventRuleStatus.ACTIVE;
  await this.eventRuleExtendedRepository.save(rule);

  return { success: true, ruleId, status: 'ACTIVE' };
}
```

---

## Success Criteria

✅ **Phase 1:** 
- Services injected and database ready
- Can call `generateEventRuleFromIntentEnhanced()`

✅ **Phase 2:**
- Simple rules still work
- Complex rules marked as `COMPOSED` or `ADVANCED`
- Capabilities extracted and stored

✅ **Phase 3:**
- Rules with SERVICE_CALL conditions execute
- CONDITIONAL actions work (if/else)
- $result values accessible in actions

✅ **Phase 4:**
- All manual tests pass
- Documents properly referenced
- Slack receives validation details

✅ **Phase 5 (Draft Mode):**
- Rules can be created as DRAFT
- User can review before approval
- Approval converts DRAFT → ACTIVE

---

## Timeline (Realistic)

- **Week 1:**
  - Phase 1 Setup: 1-2 days
  - Phase 2 Integration: 2-3 days
  
- **Week 2:**
  - Phase 3 Execution Engine: 3-4 days
  - Phase 4 Testing: 2 days
  
- **Week 3:**
  - Phase 5 Draft Mode: 1-2 days
  - Production hardening: 2-3 days

**Total: 15-20 engineer-days (3-4 weeks with one developer)**

---

## Questions to Address

1. **Where do documents/schemas come from?**
   - Need DocumentService that returns available schemas
   - Implement `getAvailableDocuments()` to fetch from DB

2. **How does SERVICE_CALL validation work?**
   - Need validation service endpoint (e.g., `/validation/schema-check`)
   - Takes documentId + schemaRef, returns `{ isValid, errors }`

3. **How are service results passed to actions?**
   - Use `$result.field` in action parameters
   - Resolver replaces at execution time

4. **Error handling?**
   - Add retry logic, timeouts, compensation actions
   - Already outlined in EventRuleExtendedEntity

---

## Success Story (After Implementation)

**Before:**
```
User: "Alert me when status changes"
System: Generates simple trigger → action
Rule can only: Check one field, send one message
```

**After:**
```
User: "Alert ops on Slack if document doesn't match validation schema, include error details"
System: Generates complex rule with SERVICE_CALL + CONDITIONAL + document reference
Rule can: Call validator service, conditionally alert, include validation errors, retry on failure
Result: "Invoice failed validation: missing required field 'vendor_id'"
```

---

## Files to Create/Modify

### Create (3 files) ✅
- [x] `llm-context-enricher.service.ts` - Context enrichment
- [x] `event-rule-extended.entity.ts` - Complex rule entity
- [x] `POWERFUL_RULES_GUIDE.md` - Architecture docs

### Modify (3 files) 📝
- [ ] `task-compiler.service.ts` - Add `generateEventRuleFromIntentEnhanced()` + helpers
- [ ] `tasks.module.ts` - Register new services/repositories
- [ ] `tasks.controller.ts` - Optional: add new endpoints if needed

### Create New (2 files) 🆕
- [ ] `extended-rule-executor.service.ts` - Execute complex rules
- [ ] Database migration for `event_rules_extended` table

---

Ready to start implementation? 🚀
