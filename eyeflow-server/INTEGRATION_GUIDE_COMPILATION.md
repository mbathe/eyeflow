# ⚙️ Integration Guide: Compile & Validate Rules

## Quick Start: 3 Steps

### Step 1: Update Module Imports

```typescript
// src/tasks/tasks.module.ts

import { AgentBrokerService } from './services/agent-broker.service';
import { RuleCompilerService } from './services/rule-compiler.service';
import { CompilationFeedbackService } from './services/compilation-feedback.service';

@Module({
  providers: [
    // ... existing services
    AgentBrokerService,           // NEW
    RuleCompilerService,          // NEW
    CompilationFeedbackService,   // NEW
  ],
})
export class TasksModule {}
```

### Step 2: Inject Into TaskCompilerService

```typescript
// src/tasks/services/task-compiler.service.ts

constructor(
  // ... existing imports
  private readonly ruleCompiler: RuleCompilerService,         // NEW
  private readonly compilationFeedback: CompilationFeedbackService,  // NEW
  private readonly agentBroker: AgentBrokerService,           // NEW
) {}
```

### Step 3: Add Compilation Check

```typescript
async generateEventRuleFromIntentEnhanced(
  userIntent: string,
  availableDocuments?: any[],
  availableNodes?: any[],
): Promise<any> {
  // Step 1: Generate rule from LLM
  const generatedRule = await this.generateFromLLM(userIntent);

  // Step 2: ⭐ NEW: Compile the rule
  const compilationReport = await this.ruleCompiler.compileRule(
    generatedRule,
    availableDocuments,
    availableNodes,
  );

  // Step 3: If compilation failed, give feedback to user and LLM
  if (!compilationReport.isValid) {
    const userMessage = this.compilationFeedback.generateUserFeedback(
      compilationReport,
      userIntent,
    );
    
    const llmFeedback = this.compilationFeedback.generateLLMFeedback(
      compilationReport,
      userIntent,
    );

    return {
      success: false,
      userMessage,
      llmFeedback,
      compilationReport,
    };
  }

  // Step 4: Compilation passed! Save rule
  const savedRule = await this.eventRuleExtendedRepository.save(
    generatedRule,
  );

  return {
    success: true,
    createdRule: savedRule,
    compilationReport,
  };
}
```

---

## Integration Details

### A. Update LLM Context (Show Available Agents)

```typescript
// src/llm-services/llm-context-enricher.service.ts

async enrichContextForComplexRules(): Promise<ContextEnrichedLLMForComplexRules> {
  // ... existing code ...

  // ⭐ NEW: Include available expert agents
  const agentCapabilities = await this.agentBroker.getExpertCapabilities();
  
  return {
    // ... existing context ...
    availableExperts: agentCapabilities,  // NEW
    expertExamples: [
      {
        description: 'Legal review before processing',
        agent: 'legal-review',
        when: 'In condition or action to validate documents',
      },
      {
        description: 'Compliance validation',
        agent: 'compliance-check',
        when: 'To ensure GDPR/HIPAA compliance',
      },
      // ... more examples
    ],
  };
}
```

### B. Update Control

```typescript
// src/tasks/controllers/task-compiler.controller.ts

@Post('/generate-with-compilation')
async generateWithCompilation(
  @Body() request: { description: string; create: boolean },
) {
  try {
    const result = await this.taskCompiler.generateEventRuleFromIntentEnhanced(
      request.description,
    );

    if (!result.success) {
      return {
        status: 'COMPILATION_FAILED',
        userMessage: result.userMessage,  // Send to user
        llmFeedback: result.llmFeedback,  // For LLM retry
        suggestedFixes: result.compilationReport.recommendations,
      };
    }

    return {
      status: 'SUCCESS',
      ruleId: result.createdRule.id,
      message: `Rule created successfully. Compilation verified.`,
    };
  } catch (error) {
    return {
      status: 'ERROR',
      message: error.message,
    };
  }
}
```

### C. Update TypeORM Configuration

For **persistent rule storage**, ensure `EventRuleExtendedEntity` is in your entities:

```typescript
// src/database/database.module.ts

TypeOrmModule.forRoot({
  // ... existing config ...
  entities: [
    // ... existing entities ...
    EventRuleExtendedEntity,  // NEW
  ],
})
```

**Or use migration approach:**
```bash
# Create migration
npm run migration:create -- --name CreateEventRuleExtended

# Contents:
export class CreateEventRuleExtended1234567890 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'event_rules_extended',
      columns: [
        { name: 'id', type: 'uuid', isPrimary: true },
        { name: 'name', type: 'varchar' },
        { name: 'complexity', type: 'varchar', default: "'SIMPLE'" },
        { name: 'used_capabilities', type: 'jsonb', default: "'[]'" },
        { name: 'condition_type', type: 'varchar' },
        { name: 'condition', type: 'jsonb' },
        { name: 'actions', type: 'jsonb' },
        { name: 'document_references', type: 'jsonb' },
        { name: 'generation_metadata', type: 'jsonb' },
        // ... more columns
        { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
      ],
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('event_rules_extended');
  }
}

# Run migration
npm run migration:run
```

---

## Complete Integration Example

### Full TaskCompilerService Update

```typescript
import { Injectable } from '@nestjs/common';
import { RuleCompilerService } from './rule-compiler.service';
import { CompilationFeedbackService } from './compilation-feedback.service';
import { AgentBrokerService } from './agent-broker.service';
import { EventRuleExtendedEntity } from '../entities/event-rule-extended.entity';

@Injectable()
export class TaskCompilerService {
  constructor(
    private readonly pythonLLMService: any,  // Existing
    private readonly eventRuleExtendedRepository: any,  // Existing
    private readonly ruleCompiler: RuleCompilerService,  // NEW
    private readonly compilationFeedback: CompilationFeedbackService,  // NEW
    private readonly agentBroker: AgentBrokerService,  // NEW
  ) {}

  async generateEventRuleFromIntentEnhanced(
    userIntent: string,
    availableDocuments?: any[],
    availableNodes?: any[],
  ): Promise<any> {
    try {
      // STEP 1: Enriched context including agent capabilities
      const agentCapabilities = await this.agentBroker.getExpertCapabilities();
      const enrichedContext = await this.buildEnrichedContext(
        userIntent,
        agentCapabilities,  // NEW: Pass available agents
      );

      // STEP 2: Generate rule from LLM
      const generatedRule = await this.pythonLLMService.generateRule(
        userIntent,
        enrichedContext,
      );

      // Transform to EventRuleExtendedEntity
      const extendedRule = this.transformToExtendedEntity(generatedRule);

      // STEP 3: ⭐ CRITICAL: Compile and validate rule
      const compilationReport = await this.ruleCompiler.compileRule(
        extendedRule,
        availableDocuments,
        availableNodes,
      );

      // STEP 4: If compilation failed
      if (!compilationReport.isValid) {
        const userMessage = this.compilationFeedback.generateUserFeedback(
          compilationReport,
          userIntent,
        );

        const llmFeedback = this.compilationFeedback.generateLLMFeedback(
          compilationReport,
          userIntent,
          await this.getAvailableConnectors(),  // For LLM context
        );

        return {
          success: false,
          error: 'COMPILATION_FAILED',
          userMessage: userMessage,
          llmFeedback: llmFeedback,
          compilationReport: compilationReport,
          
          // Let LLM auto-retry or ask user
          suggestedAction:
            compilationReport.missingRequirements.documents.length > 0
              ? 'ASK_USER_FOR_DOCUMENTS'
              : compilationReport.missingRequirements.agents.length > 0
                ? 'INFORM_USER_REGISTER_AGENTS'
                : 'LLM_RETRY_WITH_CONSTRAINTS',
        };
      }

      // STEP 5: Compilation passed! Persist rule
      extendedRule.status = 'ACTIVE';
      extendedRule.compilationVerified = true;
      extendedRule.lastValidatedAt = new Date();

      const savedRule = await this.eventRuleExtendedRepository.save(
        extendedRule,
      );

      return {
        success: true,
        createdRule: savedRule,
        compilationReport: compilationReport,
        executionGuarantee:
          '✅ This rule is guaranteed to execute with available connectors and agents',
      };
    } catch (error) {
      return {
        success: false,
        error: 'GENERATION_ERROR',
        message: error.message,
      };
    }
  }

  private async buildEnrichedContext(
    userIntent: string,
    agentCapabilities: any[],
  ): Promise<any> {
    return {
      userIntent,
      availableConnectors: await this.getAvailableConnectors(),
      availableAgents: agentCapabilities,  // NEW: Include agents available
      schemas: await this.getAvailableSchemas(),
      examples: this.getComplexRuleExamples(),
      validationRules: this.getValidationRules(),
    };
  }

  private transformToExtendedEntity(generatedRule: any): EventRuleExtendedEntity {
    const extended = new EventRuleExtendedEntity();
    // ... transformation logic
    return extended;
  }

  private async getAvailableConnectors(): Promise<any[]> {
    // Return list of registered connectors
    return [];
  }

  private async getAvailableSchemas(): Promise<any[]> {
    // Return list of available schemas for validation
    return [];
  }

  private getComplexRuleExamples(): any[] {
    // Return examples of what's possible
    return [];
  }

  private getValidationRules(): any {
    // Return what makes a valid rule
    return {};
  }
}
```

---

## Testing the Integration

### Test Case 1: Rule Passes Compilation

```typescript
const result = await taskCompiler.generateEventRuleFromIntentEnhanced(
  'Alert ops when file fails validation'
);

expect(result.success).toBe(true);
expect(result.createdRule).toBeDefined();
expect(result.compilationReport.isValid).toBe(true);
```

### Test Case 2: Rule Fails Compilation (Missing Connector)

```typescript
const result = await taskCompiler.generateEventRuleFromIntentEnhanced(
  'Call non-existent-service when event occurs'
);

expect(result.success).toBe(false);
expect(result.error).toBe('COMPILATION_FAILED');
expect(result.userMessage).toBeDefined();
expect(result.llmFeedback).toBeDefined();
expect(result.compilationReport.missingRequirements.connectors.length).toBeGreaterThan(0);
```

### Test Case 3: Rule Fails Compilation (Missing Agent)

```typescript
const result = await taskCompiler.generateEventRuleFromIntentEnhanced(
  'Review contract using legal-review agent (not registered)'
);

expect(result.success).toBe(false);
expect(result.compilationReport.missingRequirements.agents).toContain('legal-review');
expect(result.userMessage.actionItems).toBeDefined();
```

### Test Case 4: Rule Has Circular Dependency

```typescript
const rule = new EventRuleExtendedEntity();
rule.trigger = { type: 'ON_CREATE', source: 'documents' };
rule.condition = { type: 'SIMPLE', field: 'status', operator: 'EQ', value: 'pending' };
rule.actions = [
  {
    connector: 'events',
    function: 'emit',
    parameters: { eventType: 'CREATE', documentId: '$event.id' }  // Creates new event!
  }
];

const report = await ruleCompiler.compileRule(rule);

expect(report.isValid).toBe(false);
expect(report.issues.some(i => i.type === IssueType.CIRCULAR_DEPENDENCY_DETECTED)).toBe(true);
```

---

## Execution Flow (Next Phase)

After compilation passes, rules can actually execute. **Next file to create:**

`extended-rule-executor.service.ts` - Executes rules with:
- SERVICE_CALL conditions (evaluate complex conditions)
- CONDITIONAL actions (if/else execution)
- SEQUENTIAL/PARALLEL actions (step orchestration)
- Data flow through steps

This will handle the actual _runtime_ execution of rules that passed compilation.

---

## Troubleshooting

### Issue: Rule compilation fails with "Connector not found"

**Solution:**
1. Check connector is registered: `connectorRegistry.get('connector-name')`
2. Verify connector is ACTIVE (not disabled)
3. Ensure function exists: `connector.functions.find(f => f.id === 'function-name')`

### Issue: Service not injected into controller

**Solution:**
1. Register service in module: `providers: [ServiceName]`
2. Add export if crossing module boundaries
3. Inject in constructor

### Issue: LLM keeps generating invalid rules

**Solution:**
1. Review LLM context - is it showing available agents?
2. Check if `generateLLMFeedback()` output is being sent back to LLM
3. Consider adding constraint in LLM prompt: "Only use these connectors: [list]"

---

## Quick Reference: File Locations

```
eyeflow-server/src/tasks/
  ├── services/
  │   ├── agent-broker.service.ts           ← Expert agents registry
  │   ├── rule-compiler.service.ts          ← 9-point validation
  │   ├── compilation-feedback.service.ts   ← User + LLM feedback
  │   ├── task-compiler.service.ts          ← UPDATE: Add compilation check
  │   └── llm-context-enricher.service.ts   ← UPDATE: Add agent capabilities
  ├── entities/
  │   ├── event-rule.entity.ts              ← Simple rules (existing)
  │   └── event-rule-extended.entity.ts     ← Complex rules (NEW)
  ├── controllers/
  │   └── task-compiler.controller.ts       ← UPDATE: Add compilation endpoint
  ├── dtos/
  │   └── compilation-feedback.dto.ts       ← Response types
  └── tasks.module.ts                       ← UPDATE: Register new services

Documentation:
  ├── COMPILATION_SYSTEM.md                 ← This system overview
  └── INTEGRATION_GUIDE.md                  ← (You are here)
```

---

## Next Steps

1. ✅ Create the 3 new services (already done)
2. 👉 **UPDATE** TaskCompilerService with compilation check
3. 👉 **CREATE** ExtendedRuleExecutorService for execution
4. 👉 **UPDATE** Database with EventRuleExtendedEntity
5. 👉 **CREATE** Unit tests for compilation
6. 👉 **CREATE** Integration tests for full flow

Ready to integrate?
