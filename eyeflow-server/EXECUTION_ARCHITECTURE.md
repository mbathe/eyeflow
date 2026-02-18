# ⚡ Extended Rule Executor Service

**File:** `extended-rule-executor.service.ts` (to create)

## Purpose

After rules pass compilation, actually **execute** them with:

1. **SERVICE_CALL conditions** - Call external services, agents, APIs
2. **CONDITIONAL actions** - If/else logic through action steps
3. **SEQUENTIAL actions** - Execute steps 1 → 2 → 3, passing data
4. **PARALLEL actions** - Execute multiple steps simultaneously
5. **Data flow tracking** - Track $event → $result → $step0 → $step1, etc.

---

## Architecture

```
Event triggers rule:
  Event: { documentId: '123', folder: 'inbox', uploadedAt: '...' }
  
  ┌─────────────────────────────────────────┐
  │ 1. TRIGGER: Extract $event              │
  │    $event = { documentId, folder, ... } │
  └───────────────┬─────────────────────────┘
                  │
                  ▼
  ┌─────────────────────────────────────────┐
  │ 2. CONDITION: Evaluate                  │
  │    Type: SERVICE_CALL                   │
  │    Call: legal-review agent             │
  │    Input: $event.documentId              │
  │    Output: $result = {                  │
  │      isCompliant: false,                │
  │      risks: ['Missing signature'],      │
  │      confidenceScore: 0.95              │
  │    }                                    │
  └───────────────┬─────────────────────────┘
                  │
        ┌─────────┴──────────┐
        │                    │
        ▼ PASS (condition TRUE)
        
  ┌──────────────────────────────────┐
  │ 3. ACTIONS: Execute              │
  │    Mode: CONDITIONAL             │
  │    Steps:                        │
  │                                  │
  │    IF $result.isCompliant === false:
  │                                  │
  │      ┌──────────────────┐        │
  │      │ STEP 0: Post     │        │
  │      │ to Slack         │        │
  │      │ channel: #alerts │        │
  │      │ message: $result │        │
  │      └────────┬─────────┘        │
  │             $step0 = {           │
  │              success: true,      │
  │              ts: '1234567'       │
  │             }                    │
  │                                  │
  │      ┌──────────────────┐        │
  │      │ STEP 1: Email    │        │
  │      │ to: ops@co.com   │        │
  │      │ subject: Alert   │        │
  │      │ body: $result    │        │
  │      └────────┬─────────┘        │
  │             $step1 = {           │
  │              success: true,      │
  │              messageId: '...'    │
  │             }                    │
  │                                  │
  │      ┌──────────────────┐        │
  │      │ STEP 2: Store    │        │
  │      │ to: database     │        │
  │      │ alertId: uuid()  │        │
  │      │ severity: HIGH   │        │
  │      └────────┬─────────┘        │
  │             $step2 = {           │
  │              success: true,      │
  │              recordId: 'abc...'  │
  │             }                    │
  └──────────────────────────────────┘
                  │
                  ▼
  ┌──────────────────────────────────┐
  │ 4. EXECUTION RESULT              │
  │    ✅ Rule executed successfully │
  │    Events created: 3             │
  │    Duration: 2.3s                │
  │    Status: COMPLETED             │
  └──────────────────────────────────┘
```

---

## Core Execution Flow

### Main Execute Method

```typescript
async executeRule(
  rule: EventRuleExtendedEntity,
  event: any,  // The triggering event
): Promise<ExecutionResult> {
  
  const context = new ExecutionContext();
  context.$event = event;
  
  // Step 1: Evaluate trigger condition
  const conditionPassed = await this.evaluateCondition(
    rule.condition,
    context,
  );

  if (!conditionPassed) {
    return {
      executed: false,
      reason: 'Condition not met',
    };
  }

  // Step 2: Execute actions
  const actionResults = await this.executeActions(
    rule.actions,
    context,
  );

  return {
    executed: true,
    duration: context.executionStartTime - Date.now(),
    dataFlowTrace: context.dataFlow,
    actionResults: actionResults,
  };
}
```

### Execution Context (State Management)

```typescript
class ExecutionContext {
  $event: any;           // Original event data
  $result: any;          // Result from condition evaluation
  $step0: any;           // Result from first action
  $step1: any;           // Result from second action
  $step2: any;           // etc.
  
  dataFlow: DataFlowStep[] = [];  // Track every operation
  executionStartTime: number;
  
  // Get any variable in context
  getVariable(name: string): any {
    if (name === '$event') return this.$event;
    if (name === '$result') return this.$result;
    if (name.startsWith('$step')) {
      const stepNum = parseInt(name.substring(5));
      return this[`$step${stepNum}`];
    }
    throw new Error(`Unknown variable: ${name}`);
  }
  
  // Set step result
  setStepResult(stepNumber: number, result: any): void {
    this[`$step${stepNumber}`] = result;
  }
}
```

---

## Condition Evaluation (6 Types)

### Type 1: SIMPLE Condition

```typescript
// Rule: if amount > 1000

async evaluateSimpleCondition(
  condition: SimpleCondition,
  context: ExecutionContext,
): Promise<boolean> {
  const fieldValue = this.getFieldValue(condition.field, context);
  
  switch (condition.operator) {
    case 'EQ': return fieldValue === condition.value;
    case 'NE': return fieldValue !== condition.value;
    case 'GT': return fieldValue > condition.value;
    case 'LT': return fieldValue < condition.value;
    case 'GTE': return fieldValue >= condition.value;
    case 'LTE': return fieldValue <= condition.value;
    case 'CONTAINS': return fieldValue?.includes(condition.value);
    case 'IN': return condition.value.includes(fieldValue);
    default: throw new Error(`Unknown operator: ${condition.operator}`);
  }
}

// Example execution:
// context.$event = { amount: 1500, customer: 'acme' }
// condition = { field: 'amount', operator: 'GT', value: 1000 }
// Result: TRUE
```

### Type 2: SERVICE_CALL Condition

```typescript
// Rule: Call compliance checker, if it returns isCompliant=false, pass condition

async evaluateServiceCallCondition(
  condition: ServiceCallCondition,
  context: ExecutionContext,
): Promise<boolean> {
  // Build request
  const inputData = this.buildServiceInput(condition, context);
  
  // Call service/agent
  const result = await this.callService(
    condition.service,
    condition.function,
    inputData,
  );
  
  // Store result for downstream actions
  context.$result = result;
  
  // Evaluate expected result
  if (condition.expectedResult) {
    return this.matchesExpected(result, condition.expectedResult);
  }
  
  // Or just check if success
  return result.success ?? true;
}

// Example execution:
// condition = {
//   service: 'agent:legal-review',
//   function: 'reviewDocument',
//   params: { documentId: '$event.documentId' },
//   expectedResult: { isCompliant: true }
// }
// Calls: await legalAgent.reviewDocument({ documentId: '123' })
// Result: context.$result = { isCompliant: false, risks: [...] }
// Returns: FALSE (because isCompliant != true)
```

### Type 3: DATABASE_QUERY Condition

```typescript
// Rule: Query database, if returns matches expected, pass

async evaluateDatabaseQueryCondition(
  condition: DatabaseQueryCondition,
  context: ExecutionContext,
): Promise<boolean> {
  // Replace variables in query
  const query = this.replaceVariables(condition.query, context);
  
  // Execute query
  const result = await this.database.query(query);
  
  // Store result
  context.$result = result;
  
  // Check expectation
  if (condition.expectedCount !== undefined) {
    return result.length === condition.expectedCount;
  }
  
  if (condition.expectedValues !== undefined) {
    return this.resultMatchesValues(result, condition.expectedValues);
  }
  
  // Any results = true
  return result.length > 0;
}

// Example execution:
// condition = {
//   query: 'SELECT COUNT(*) as count FROM invoices WHERE customer_id = ? AND status = ?',
//   params: ['$event.customerId', 'PENDING'],
//   expectedCount: 0  // Should have no pending invoices
// }
// Executes: SELECT COUNT(*) FROM invoices WHERE customer_id = 'cust-123' AND status = 'PENDING'
// Result: { count: 3 }
// Returns: FALSE (count != 0)
```

### Type 4: LLM_ANALYSIS Condition

```typescript
// Rule: Ask LLM to analyze, if it returns shouldAlert=true, pass

async evaluateLLMAnalysisCondition(
  condition: LLMAnalysisCondition,
  context: ExecutionContext,
): Promise<boolean> {
  // Prepare content for LLM
  const content = this.buildLLMContent(condition, context);
  
  // Call Claude
  const analysis = await this.llmService.analyze(
    content,
    condition.prompt,
    condition.model || 'claude-3-haiku',
  );
  
  // Store analysis result
  context.$result = analysis;
  
  // Check expected result
  if (condition.expectedResult) {
    return this.matchesExpected(analysis, condition.expectedResult);
  }
  
  return analysis.shouldProceed ?? true;
}

// Example execution:
// condition = {
//   content: '$event.documentText',
//   prompt: 'Is this document suspicious? Return { isSuspicious: bool, reasons: [] }',
//   expectedResult: { isSuspicious: false }
// }
// Sends to Claude: "Is this document suspicious?..." (with full text)
// Claude returns: { isSuspicious: true, reasons: ['Contains fake signature'] }
// Result: context.$result = that response
// Returns: FALSE (isSuspicious != false)
```

### Type 5: COMPOSITE Condition

```typescript
// Rule: Multiple conditions with AND/OR/NOT logic

async evaluateCompositeCondition(
  condition: CompositeCondition,
  context: ExecutionContext,
): Promise<boolean> {
  const results = [];
  
  for (const subCondition of condition.conditions) {
    const result = await this.evaluateCondition(subCondition, context);
    results.push(result);
  }
  
  // Apply logic operator
  switch (condition.operator) {
    case 'AND': return results.every(r => r === true);
    case 'OR': return results.some(r => r === true);
    case 'NOT': return !results[0];
    default: throw new Error(`Unknown operator: ${condition.operator}`);
  }
}

// Example execution:
// condition = {
//   operator: 'AND',
//   conditions: [
//     { type: 'SIMPLE', field: 'status', operator: 'EQ', value: 'PENDING' },
//     { type: 'SERVICE_CALL', service: 'compliance-check', ... },
//   ]
// }
// Evaluates both sub-conditions:
//  1. Amount is PENDING? TRUE
//  2. Compliance check passes? FALSE
// Result: TRUE AND FALSE = FALSE
```

### Type 6: ML_PREDICTION Condition

```typescript
// Rule: Use ML model to predict, if prediction > threshold, pass

async evaluateMLPredictionCondition(
  condition: MLPredictionCondition,
  context: ExecutionContext,
): Promise<boolean> {
  // Prepare features for model
  const features = this.buildModelFeatures(condition, context);
  
  // Call ML model
  const prediction = await this.mlService.predict(
    condition.modelId,
    features,
  );
  
  // Store prediction
  context.$result = prediction;
  
  // Check against threshold
  const score = prediction.score ?? prediction.probability;
  
  if (condition.operator === 'GT') {
    return score > condition.threshold;
  }
  if (condition.operator === 'LT') {
    return score < condition.threshold;
  }
  
  throw new Error(`Unknown operator: ${condition.operator}`);
}

// Example execution:
// condition = {
//   modelId: 'fraud-detection-v2',
//   features: {
//     amount: '$event.amount',
//     merchant_category: '$event.category',
//     customer_velocity: 'calculate...',
//   },
//   operator: 'GT',
//   threshold: 0.8,  // Fraud score > 0.8
// }
// Calls: mlService.predict('fraud-detection-v2', { amount: 1500, ... })
// Model returns: { score: 0.92, isFraud: true }
// Result: context.$result = that response
// Returns: TRUE (0.92 > 0.8)
```

---

## Action Execution (3 Modes)

### Mode 1: SEQUENTIAL Execution

```typescript
// Execute actions one after another, each gets previous output

async executeSequentialActions(
  actions: ActionStep[],
  context: ExecutionContext,
): Promise<any[]> {
  const results = [];
  
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    
    try {
      const result = await this.executeActionStep(action, context);
      
      // Store result for next step
      context.setStepResult(i, result);
      results.push(result);
      
      // Track in data flow
      context.dataFlow.push({
        stepId: i,
        stepName: action.name,
        input: this.getActionInput(action, context),
        output: result,
        duration: result.duration,
        status: 'SUCCESS',
      });
      
    } catch (error) {
      results.push({
        success: false,
        error: error.message,
      });
      
      // Handle retry policy
      if (action.retryPolicy?.retries > 0 && retryCount < action.retryPolicy.retries) {
        retryCount++;
        i--;  // Retry same step
        continue;
      }
      
      // Stop on error if not configured otherwise
      if (action.errorHandling !== 'CONTINUE') {
        throw error;
      }
    }
  }
  
  return results;
}

// Example execution (invoice validation pipeline):
// Actions: [
//   { name: 'Validate schema', connector: 'schema-validator', ... },
//   { name: 'Check with DB', connector: 'postgresql', query: '...' },
//   { name: 'Send to legal', connector: 'agent:legal-review', ... }
// ]
// Execution:
//   STEP 0: context.$step0 = { valid: true, schema: 'invoice-v2' }
//   STEP 1: context.$step1 = { exists: true, lastVersion: '...' }
//   STEP 2: context.$step2 = { isCompliant: true, risks: [] }
```

### Mode 2: CONDITIONAL Execution

```typescript
// Execute different steps based on conditions (if/else)

async executeConditionalActions(
  actions: ActionStep[],
  context: ExecutionContext,
): Promise<any[]> {
  const results = [];
  let stepIndex = 0;
  
  for (const action of actions) {
    // Check condition on this action
    if (action.condition) {
      const conditionMet = await this.evaluateCondition(
        action.condition,
        context,
      );
      
      if (!conditionMet) {
        // Skip this action
        context.dataFlow.push({
          stepId: stepIndex,
          stepName: action.name,
          status: 'SKIPPED',
          reason: 'Condition not met',
        });
        stepIndex++;
        continue;
      }
    }
    
    // Execute this action
    const result = await this.executeActionStep(action, context);
    context.setStepResult(stepIndex, result);
    results.push(result);
    stepIndex++;
  }
  
  return results;
}

// Example execution (alert if document invalid):
// Actions: [
//   {
//     name: 'Post to slack',
//     connector: 'slack',
//     condition: { field: '$result.isValid', operator: 'EQ', value: false },
//     params: { channel: '#alerts', message: 'Document invalid!' }
//   },
//   {
//     name: 'Escalate to legal',
//     connector: 'agent:legal-review',
//     condition: { field: '$step0.success', operator: 'EQ', value: true },
//     params: { documentId: '$event.id', reviewType: 'urgent' }
//   }
// ]
// Execution:
//   Action 0: Check if $result.isValid == false? YES → Execute
//   Action 1: Check if $step0.success == true? YES → Execute
```

### Mode 3: PARALLEL Execution

```typescript
// Execute multiple actions simultaneously

async executeParallelActions(
  actions: ActionStep[],
  context: ExecutionContext,
): Promise<any[]> {
  const promises = actions.map((action, index) =>
    this.executeActionStep(action, context)
      .then(result => {
        context.setStepResult(index, result);
        return result;
      })
      .catch(error => ({
        success: false,
        error: error.message,
      }))
  );
  
  const results = await Promise.all(promises);
  
  // Track in data flow
  results.forEach((result, index) => {
    context.dataFlow.push({
      stepId: index,
      stepName: actions[index].name,
      output: result,
      status: result.success ? 'SUCCESS' : 'FAILED',
    });
  });
  
  return results;
}

// Example execution (notify multiple systems simultaneously):
// Actions: [
//   { name: 'Post Slack', connector: 'slack', params: {...} },
//   { name: 'Send Email', connector: 'email', params: {...} },
//   { name: 'Update DB', connector: 'postgres', params: {...} }
// ]
// Execution: All 3 happen at same time
// Results: Promise.all([slack, email, db])
//   $step0 = { success: true, ts: '...' }
//   $step1 = { success: true, messageId: '...' }
//   $step2 = { success: true, recordId: '...' }
```

---

## Single Action Step Execution

```typescript
async executeActionStep(
  action: ActionStep,
  context: ExecutionContext,
): Promise<any> {
  const startTime = Date.now();
  
  try {
    // Resolve all parameter values ($event, $result, $stepX, etc.)
    const resolvedParams = this.resolveParameterValues(
      action.parameters,
      context,
    );
    
    // Add automatic context
    resolvedParams._context = {
      eventId: context.$event.id,
      timestamp: new Date(),
      ruleName: context.ruleName,
    };
    
    // Call connector function
    const result = await this.connectorRegistry
      .getConnector(action.connector)
      .callFunction(
        action.function,
        resolvedParams,
      );
    
    return {
      success: true,
      result,
      duration: Date.now() - startTime,
    };
    
  } catch (error) {
    // Handle error
    if (action.retryPolicy?.retries > 0) {
      // Retry logic
      return this.retryActionStep(action, context, error);
    }
    
    throw error;
  }
}
```

---

## Data Flow Tracking

```typescript
// As rule executes, track every step's input/output

class DataFlowStep {
  stepId: number;           // 0, 1, 2, etc.
  stepName: string;         // 'Validate with schema'
  stepType: 'TRIGGER' | 'CONDITION' | 'ACTION';
  inputs: {
    name: string;           // '$event', '$result'
    value: any;
    schema?: any;
  }[];
  outputs: {
    name: string;           // '$step0'
    value: any;
    schema?: any;
  }[];
  duration: number;         // ms
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
}

// Final data flow trace:
dataFlowTrace = [
  {
    stepId: 'trigger',
    stepName: 'Trigger: ON_FILE_UPLOAD',
    stepType: 'TRIGGER',
    outputs: [{ name: '$event', value: {id, filename, folder} }],
    status: 'SUCCESS'
  },
  {
    stepId: 'cond',
    stepName: 'Condition: SERVICE_CALL',
    stepType: 'CONDITION',
    inputs: [{ name: '$event', value: {id, filename, folder} }],
    outputs: [{ name: '$result', value: {isValid: false, errors: []} }],
    duration: 850,
    status: 'SUCCESS'
  },
  {
    stepId: 0,
    stepName: 'Post to Slack',
    stepType: 'ACTION',
    inputs: [
      { name: '$result', value: {errors: [...]} },
      { name: '$event', value: {filename} }
    ],
    outputs: [{ name: '$step0', value: {success: true, ts: '123456'} }],
    duration: 200,
    status: 'SUCCESS'
  },
  //... more steps
]
```

---

## Execution Result

```typescript
interface ExecutionResult {
  executed: boolean;           // Did rule execute?
  ruleId: string;
  ruleName: string;
  status: 'COMPLETED' | 'FAILED' | 'PARTIAL' | 'SKIPPED';
  
  reason?: string;             // Why didn't it execute?
  conditionPassed?: boolean;    // Did condition pass?
  actionCount: number;          // How many actions executed?
  successfulActions: number;    // How many succeeded?
  
  duration: number;            // Total ms
  startTime: Date;
  endTime: Date;
  
  dataFlowTrace: DataFlowStep[];  // Complete trace
  actionResults: any[];           // All action outputs
  
  errors: {
    stepIndex: number;
    stepName: string;
    error: string;
    recoverable: boolean;
  }[];
}
```

---

## Integration with Task Executor

```typescript
// In tasks.module.ts
import { ExtendedRuleExecutorService } from './services/extended-rule-executor.service';

providers: [
  // ...
  ExtendedRuleExecutorService,
]

// In rule execution endpoint
async executeRule(@Body() request: { ruleId: string; event: any }) {
  const rule = await this.ruleRepository.findOne(request.ruleId);
  
  if (!rule) {
    return { error: 'Rule not found' };
  }
  
  try {
    const result = await this.ruleExecutor.executeRule(rule, request.event);
    
    // Save execution log
    await this.executionLogRepository.save({
      ruleId: rule.id,
      event: request.event,
      result: result,
      executedAt: new Date(),
    });
    
    return result;
    
  } catch (error) {
    return {
      executed: false,
      error: error.message,
      dataFlowTrace: [],
    };
  }
}
```

---

## Next: Files to Create

1. ✅ `agent-broker.service.ts` - Expert agents registry
2. ✅ `rule-compiler.service.ts` - Compilation validation
3. ✅ `compilation-feedback.service.ts` - User/LLM feedback
4. 👉 **`extended-rule-executor.service.ts`** - Rule execution (THIS FILE)
5. 👉 **`execution-context.ts`** - Context and data flow
6. 👉 **`execution-logger.service.ts`** - Log all executions

This architecture ensures:
- ✅ Complex conditions can be evaluated (6 types)
- ✅ Sequential/concurrent action execution
- ✅ Data flows correctly through steps
- ✅ Full trace of what happened
- ✅ Error handling and retries

Ready to implement?
