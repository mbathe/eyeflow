# 🚀 LLM Validation & Catalog Integration Guide

**For:** External Developers Contributing Connectors  
**Version:** 1.0.0

---

## Quick Start: Adding Your First Connector

### Step 1: Prepare Your Manifest

```json
{
  "id": "my_awesome_service",
  "name": "My Awesome Service",
  "version": "1.0.0",
  "author": "dev@mycompany.com",
  "status": "stable",
  "description": "Awesome connector for doing amazing things",
  
  "capabilities": [
    {
      "name": "rest_api",
      "version": "1.0.0",
      "required": true
    }
  ],

  "functions": [
    {
      "id": "perform_action",
      "name": "Perform Action",
      "description": "Performs an awesome action",
      "parameters": {
        "type": "object",
        "required": ["input"],
        "properties": {
          "input": { "type": "string" }
        }
      },
      "outputs": {
        "type": "object",
        "properties": {
          "result": { "type": "string" },
          "statusCode": { "type": "integer" }
        }
      }
    }
  ]
}
```

### Step 2: Add Unit Tests

```typescript
// tests/connector.spec.ts
import { describe, it, expect } from '@jest/globals';
import manifest from '../connector-manifest.json';

describe('My Awesome Service Connector', () => {
  it('exports all declared functions', () => {
    const implementation = require('../index');
    for (const func of manifest.functions) {
      expect(implementation[func.id]).toBeDefined();
    }
  });

  it('validates input parameters', () => {
    const { perform_action } = require('../index');
    
    expect(() => perform_action({})).toThrow();
  });

  it('returns correct output schema', () => {
    const { perform_action } = require('../index');
    const result = perform_action({ input: 'test' });
    
    expect(result).toHaveProperty('result');
    expect(result).toHaveProperty('statusCode');
  });
});
```

### Step 3: Validate Locally

```bash
# Schema validation
npm run validate:manifests -- connector-manifest.json

# Run tests
npm test

# Check semver
npm run check:semver

# Build
npm run build
```

### Step 4: Submit PR

```bash
git checkout -b feature/awesome-connector
git add .
git commit -m "feat: Add My Awesome Service connector v1.0.0"
git push origin feature/awesome-connector
# Create PR
```

**All automated checks will run. If they pass, your connector is ready!** ✅

---

## Integration with LLM Validation

### How LLM Uses Your Connector

```
User Input
    ↓
LLM Service (Python) generates workflow
    ↓
LLM Response Validation
    ├─ 1️⃣  Schema Check (llm-workflow-rules.schema.json)
    ├─ 2️⃣  Catalog Verification (checks your manifest)
    ├─ 3️⃣  Sandbox Simulation
    └─ 4️⃣  Confidence Scoring
    ↓
NestJS Compilation
    ├─ Check all referenced actions exist (your functions)
    ├─ Validate parameter types against schemas
    └─ Execute
    ↓
Result
```

### Example: Slack Connector Integration

**Your manifest declares:**

```json
{
  "id": "slack",
  "functions": [
    {
      "id": "send_message",
      "name": "Send Message",
      "parameters": {
        "required": ["channel", "text"],
        "properties": {
          "channel": { "type": "string" },
          "text": { "type": "string", "maxLength": 4000 }
        }
      }
    }
  ]
}
```

**When LLM generates:**

```
workflow_rules: [{
  "actions": [{
    "type": "send_message",
    "payload": {
      "connector": "slack",
      "functionId": "send_message",
      "text": "Hello!"
    }
  }]
}]
```

**Validation checks:**
1. ✅ Schema: Payload is valid JSON
2. ✅ Catalog: slack connector exists
3. ✅ Catalog: send_message function exists in slack
4. ✅ Types: "text" is string (✓), within 4000 chars (✓)
5. ✅ Sandbox: Simulates sending message successfully
6. ✅ Result: Workflow approved for execution

---

## Validation Error Scenarios

### Scenario 1: Unknown Function

**When LLM tries to use:**
```json
{ "connector": "slack", "functionId": "do_something_weird" }
```

**Validation fails:**
```
❌ UNKNOWN_ACTION
   Connector 'slack' has no function 'do_something_weird'
   
   Available functions:
   - send_message
   - list_channels
   - update_message
   
   Suggestion: Use 'send_message' or 'update_message'
```

**Developer responsibility:** Declare all functions in manifest.

---

### Scenario 2: Missing Required Parameter

**Manifest declares:**
```json
"parameters": { "required": ["channel", "text"] }
```

**LLM generates:**
```json
{ "channel": "alerts" }  // Missing "text"
```

**Validation fails:**
```
❌ PARAMETER_MISMATCH
   Function 'send_message' requires: ['channel', 'text']
   Provided: ['channel']
   Missing: ['text']
```

**LLM retries** with complete parameters.

---

### Scenario 3: Beta Manifest

**Your manifest:**
```json
{ "status": "beta" }
```

**Validation accepts but warns:**
```
✅ VALID (with warnings)
⚠️  Connector 'my_service' is in BETA status
    Consider waiting for stable release (1.0.0)
    or enable BETA_FEATURES flag
```

---

## Semantic Versioning Examples

### Your connector evolves:

**v1.0.0 (Initial Release)**
```json
{ "functions": ["send_message", "list_items"] }
```

**v1.1.0 (Minor: New function, backward compatible)**
```json
{ 
  "functions": [
    "send_message",
    "list_items",
    "update_item" // NEW - LLM can now use this
  ]
}
```
✅ **No breaking changes** - proceed with v1.1.0

**v2.0.0 (Major: Remove function)**
```json
{ 
  "functions": ["send_message", "update_item"]  // list_items removed
}
```
⚠️ **BREAKING** - must increment to v2.0.0

Existing workflows using `list_items` will fail. Deployed projects must explicitly opt-in to v2.0.0.

---

## Deprecation Example

### Your old connector needs retirement:

**Step 1: Mark as deprecated in manifest**

```json
{
  "id": "old_service",
  "version": "1.5.0",
  "status": "deprecated",
  
  "deprecation": {
    "date": "2026-02-19",
    "endOfLife": "2027-02-19",
    "replacementConnectorId": "new_service",
    "reason": "Consolidated with new_service for better performance",
    "migrationGuide": "https://docs.eyeflow.com/migrate/old-to-new"
  }
}
```

**Step 2: LLM validation warns users**

```
⚠️  DEPRECATION WARNING
    Connector 'old_service' is deprecated since 2026-02-19
    
    Replacement: 'new_service' (recommended)
    End of Life: 2027-02-19
    
    Migration Guide: https://docs.eyeflow.com/migrate/old-to-new
```

**Step 3: Gradual migration**

- Month 1-3: Warn on new workflows
- Month 4-6: Can optionally block new use
- Month 6+: Archive (read-only)
- Month 12+: Remove from runtime

---

## Testing Your Connector with LLM

### Integration Test Template

```typescript
import { LLMValidationService } from '@tasks/llm-validation.service';

describe('Slack Connector with LLM', () => {
  it('should handle send_message from LLM workflow', async () => {
    const mockLLMResponse = {
      workflow_rules: {
        rules: [{
          actions: [{
            type: 'send_message',
            payload: {
              connector: 'slack',
              functionId: 'send_message',
              channel: 'alerts',
              text: 'Test notification'
            }
          }]
        }],
        confidence: 0.95
      }
    };

    const validationService = new LLMValidationService();
    const result = await validationService.parseIntentWithValidation(
      () => Promise.resolve({ response: mockLLMResponse, statusCode: 200 }),
      llmContext,
      'workflow-1'
    );

    expect(result.validationPassed).toBe(true);
    expect(result.intent.missions[0].functionId).toBe('send_message');
  });
});
```

**Run with:**
```bash
npm test -- --testPathPattern="connector.*integration"
```

---

## Catalog Safe Mode for Development

### During Development

```bash
export CATALOG_UNKNOWN_SAFE_MODE=true
npm run dev
```

**Effect:** Your connector doesn't need to be in the catalog yet to test LLM workflows.

### When Ready for Production

```bash
export CATALOG_UNKNOWN_SAFE_MODE=false
# Ensure your manifest is in the catalog
```

---

## Troubleshooting Validation Failures

### ❌ Failed: Schema validation

**Problem:** Manifest JSON doesn't match schema

**Solution:**
```bash
npm run validate:manifests -- connector-manifest.json

# Shows exact schema violations
❌ property "id" must match pattern "^[a-z0-9_-]+$"
   Value: "My-Awesome_123"  # Contains uppercase
```

**Fix:**
```json
{ "id": "my-awesome-123" }
```

---

### ❌ Failed: Missing function implementation

**Problem:** Manifest declares function but code doesn't export it

**Solution:**
```bash
npm test

// Error:
// ✗ exports all declared functions
// Expected 'my_function' to be a function, got undefined
```

**Check:**
```typescript
// ✓ Correct: export all functions
export async function my_function(params) { ... }

// ✗ Wrong: not exported
async function my_function(params) { ... }
```

---

### ❌ Failed: Invalid semver

**Problem:** Version format incorrect

**Solution:**
```bash
npm run check:semver

// ✗ Invalid semver: "1.0"
// ✓ Valid semver: "1.0.0"
```

---

### ❌ Failed: Unit test coverage

**Problem:** <80% function coverage

**Solution:**
```bash
npm test -- --coverage

// Add tests for uncovered functions
```

---

## Pre-Submission Checklist

Before submitting your PR, verify:

- [ ] Manifest is valid JSON
- [ ] `id` matches pattern `^[a-z0-9_-]+$`
- [ ] `version` is valid SemVer (X.Y.Z)
- [ ] `author` email is valid
- [ ] All declared functions exist in code
- [ ] All functions have unit tests
- [ ] Test coverage >80%
- [ ] No hardcoded credentials/API keys
- [ ] Functions handle errors gracefully
- [ ] Output matches declared schema
- [ ] Rate limits documented (if applicable)
- [ ] README has usage examples
- [ ] Backward compatible (if updating)

**Run full validation:**

```bash
npm run pre-submit-check
```

---

## CI/CD Pipeline

When you submit PR, GitHub Actions will:

1. ✅ Schema validation (2 min)
2. ✅ Semver check (1 min)
3. ✅ Run unit tests (5 min)
4. ✅ Test coverage check (1 min)
5. ✅ Integration test with LLM service (10 min)
6. ✅ Security scan (5 min)

**Total:** ~24 minutes

If any check fails, the PR will block with detailed errors. Fix and push again.

---

## Support & Questions

- 📖 **Documentation:** https://docs.eyeflow.com/connectors
- 💬 **Community:** https://discussions.eyeflow.com
- 🐛 **Issues:** https://github.com/eyeflow/connectors/issues
- ✉️ **Email:** connectors@company.com

---

**Welcome to the eyeFlow connector ecosystem! 🎉**
