# 📋 Catalog Governance & Connector Management

**Version:** 1.0.0 | **Last Updated:** February 19, 2026

## Overview

This document defines the formal governance process for managing connectors, actions, and capabilities in the eyeFlow runtime. It ensures:

- ✅ **Compatibility**: New connectors work seamlessly with existing workflows
- ✅ **Quality**: Manifest compliance through JSON Schema + unit tests
- ✅ **Versioning**: Semantic versioning (SemVer) for all capabilities
- ✅ **Deprecation**: Graceful sunsetting of deprecated features
- ✅ **Multi-tenancy**: External developers can contribute connectors safely

---

## 1. Connector Manifest Requirements

### 1.1 Location & Format

```
eyeflow-connectors/
├── [connector-name]/
│   ├── connector-manifest.json    # Required: Connector definition
│   ├── capabilities.json           # Required: Declared capabilities
│   ├── functions/
│   │   ├── function-1.json
│   │   └── function-2.json
│   ├── tests/
│   │   └── connector.spec.ts
│   └── README.md                   # Documentation
```

### 1.2 Manifest JSON Schema

**File:** `schemas/llm-connector-manifest.schema.json`

**Required Fields:**

```jsonschema
{
  "type": "object",
  "required": [
    "id",
    "name",
    "version",
    "author",
    "status",
    "functions",
    "capabilities"
  ],
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z0-9_-]+$" },
    "name": { "type": "string" },
    "version": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+" },
    "author": { "type": "string", "email": true },
    "status": { "enum": ["stable", "beta", "deprecated"] },
    "functions": { "type": "array", "minItems": 1 },
    "capabilities": { "type": "array" },
    "deprecation": {
      "type": "object",
      "properties": {
        "date": { "type": "string", "format": "date" },
        "replacementConnectorId": { "type": "string" },
        "migrationGuide": { "type": "string", "uri": true }
      }
    }
  }
}
```

### 1.3 Example Manifest

```json
{
  "id": "slack",
  "name": "Slack",
  "version": "2.1.0",
  "author": "slack-dev@company.com",
  "status": "stable",
  "description": "Official Slack connector for sending messages, managing channels, and user interactions",
  "documentation": "https://docs.eyeflow.com/connectors/slack",
  
  "capabilities": [
    {
      "name": "messaging",
      "version": "2.0.0",
      "required": true,
      "features": ["send_message", "thread_reply", "emoji_react"]
    },
    {
      "name": "user_management",
      "version": "1.5.0",
      "required": false,
      "features": ["list_users", "get_user", "update_profile"]
    }
  ],

  "functions": [
    {
      "id": "send_message",
      "name": "Send Message",
      "description": "Send a message to a Slack channel",
      "executorType": "ACTION_HANDLER",
      "parameters": {
        "type": "object",
        "required": ["channel", "text"],
        "properties": {
          "channel": { "type": "string" },
          "text": { "type": "string", "maxLength": 4000 },
          "thread_ts": { "type": "string" }
        }
      },
      "outputs": {
        "type": "object",
        "properties": {
          "messageId": { "type": "string" },
          "timestamp": { "type": "string", "format": "date-time" }
        }
      }
    }
  ],

  "metadata": {
    "maintainer": "Platform Team",
    "supportEmail": "support@company.com",
    "sla": {
      "responseTime": "P1D",
      "updateFrequency": "P2W"
    }
  }
}
```

---

## 2. Submission & Validation Process

### 2.1 Pull Request Flow

```
Developer Creates PR
    ↓
GitHub Actions: Schema Validation
    ↓
GitHub Actions: Semver Check
    ↓
GitHub Actions: Capability Compatibility
    ↓
PR Review (Platform Team)
    ↓
Merge to Main
    ↓
Auto-Deploy to Staging
    ↓
Integration Tests
    ↓
Production Deployment
```

### 2.2 Automated Checks (CI/CD)

**All checks must pass before merge:**

| Check | Script | Requirement |
|-------|--------|-------------|
| Schema Validation | `validate-connector-manifests.sh` | MUST |
| Semver Format | `check-semver.ts` | MUST |
| Unit Tests | `npm test` | MUST |
| Function Signature | `validate-function-signatures.ts` | MUST |
| Deprecation Policy | `validate-deprecation.ts` | MUST |
| Type Coverage | `typecov check` | 90%+ |

### 2.3 Manual Review Checklist

**PR Reviewers must verify:**

- [ ] Manifest follows naming conventions
- [ ] Functions have clear documentation & examples
- [ ] Error handling is comprehensive
- [ ] Rate limits documented
- [ ] OAuth/Auth properly handled
- [ ] No hardcoded credentials/secrets
- [ ] Backward compatibility maintained (if updating)
- [ ] Migration guide provided (if major version bump)

---

## 3. Semantic Versioning Policy

### 3.1 Version Format

```
MAJOR.MINOR.PATCH[-PRERELEASE]
  ↓      ↓      ↓
  |      |      └─ Bug fixes, no API changes
  |      └────────── New features, backward compatible
  └───────────────── Breaking changes
```

### 3.2 Version Rules

**MAJOR Bump (Breaking):**
- Removed functions
- Parameter signature changed
- Incompatible output format
- Capability dependency change

**MINOR Bump (Backward Compatible):**
- New functions
- New parameters (with defaults)
- Enhanced documentation
- Performance improvements

**PATCH Bump:**
- Bug fixes
- Internal refactoring
- Minor documentation updates

### 3.3 Pre-release Versions

```
1.2.0-alpha.1    # Early development
1.2.0-beta.2     # Feature complete, testing
1.2.0-rc.1       # Release candidate
1.2.0            # GA Release
```

---

## 4. Capability Versioning

### 4.1 Capability Declaration

```json
{
  "capabilities": [
    {
      "name": "graphql",
      "version": "2.0.0",
      "required": true,
      "satisfiedBy": [
        "graphql@>=2.0.0",
        "apollo-server@>=3.0.0"
      ]
    }
  ]
}
```

### 4.2 Compatibility Matrix

| Runtime | graphql-1.x | graphql-2.x | graphql-3.x |
|---------|------------|------------|------------|
| v1.0    | ✓          | ✗          | ✗          |
| v2.0    | ✓ (compat) | ✓          | ✗          |
| v3.0    | ✗          | ✓ (compat) | ✓          |

---

## 5. Deprecation Policy

### 5.1 Deprecation Timeline

1. **Month 0**: Announce deprecation (documentation, changelog)
2. **Month 1-3**: Mark as "deprecated" in catalog
3. **Month 4+**: Remove from new submissions
4. **Month 6**: Archive from runtime (read-only)
5. **Month 12**: Full removal

### 5.2 Deprecation Manifest

```json
{
  "id": "old_connector",
  "version": "1.0.0",
  "status": "deprecated",
  
  "deprecation": {
    "date": "2026-02-19",
    "endOfLife": "2027-02-19",
    "replacementConnectorId": "new_connector",
    "reason": "Merged into new_connector with better performance",
    "migrationGuide": "https://docs.eyeflow.com/migrate/old-to-new"
  }
}
```

### 5.3 Deprecation Warnings

LLM validation will warn:

```
⚠️  Connector 'old_connector' deprecated since 2026-02-19
    Replacement: 'new_connector' (suggested)
    End of Life: 2027-02-19
    Migration: https://docs.eyeflow.com/...
```

---

## 6. Catalog Integration Tests

### 6.1 Test Template

```typescript
describe('Slack Connector Integration', () => {
  it('should export all declared functions', () => {
    const manifest = require('./connector-manifest.json');
    const implementation = require('./index');

    for (const func of manifest.functions) {
      expect(implementation[func.id]).toBeDefined();
    }
  });

  it('should validate input parameters', () => {
    const { send_message } = require('./index');
    
    expect(() => {
      send_message({ /* missing required params */ });
    }).toThrow(ValidationError);
  });

  it('should match output schema', () => {
    const manifest = require('./connector-manifest.json');
    const { send_message } = require('./index');
    
    const result = send_message({ channel: 'test', text: 'hi' });
    const schema = manifest.functions[0].outputs;
    
    expect(ajv.validate(schema, result)).toBe(true);
  });
});
```

### 6.2 Running Tests

```bash
# Validate single connector
npm run test:connector -- slack

# Validate all connectors
npm run test:connectors

# Contract testing with LLM service
npm run test:lnm-integration
```

---

## 7. Unknown Connector Safe Mode

### 7.1 Configuration

```bash
export CATALOG_UNKNOWN_SAFE_MODE=true
```

**Effect:** When enabled, unknown connectors are allowed with warnings instead of failures.

**Use Cases:**
- Developing new connectors before they're in the catalog
- Testing workflows with future connectors
- Sandbox/non-production environments

### 7.2 Warnings Generated

```
⚠️  [SAFE_MODE] Unknown connector: future_payment_service
    This connector is not yet in the catalog.
    Add to catalog before production deployments.
```

---

## 8. Observability & Metrics

### 8.1 Tracked Metrics

```metrics
# Validation metrics
llm.proposals_accepted_total
llm.proposals_rejected_total
llm.catalog_validation_latency_ms
llm.unknown_safe_mode_warnings_total
llm.escalations_total

# Connector metrics
connector.deployment_success_rate
connector.compatibility_issues_count
connector.version_distribution{version,status}
```

### 8.2 Alerting

**Alert Triggers:**

| Condition | Severity | Action |
|-----------|----------|--------|
| Validation errors >10/min | WARNING | Log alert |
| Unknown references >5% | INFO | Dashboard only |
| Deprecation adoption <50% | WARNING | Notify team |
| Breaking change detected | CRITICAL | Block deployment |

---

## 9. Multiple Developer Collaboration

### 9.1 External Developer Workflow

```
1. Developer forks eyeflow-connectors
2. Adds connector in separate branch
3. Submits PR with:
   - connector-manifest.json
   - unit tests (>80% coverage)
   - README with examples
   - Integration test for LLM validation
4. GitHub Actions runs validation
5. Platform team reviews (24h SLA)
6. Merge + auto-deploy to staging
7. Production deployment (after 48h staging)
```

### 9.2 Third-Party Connector Template

```bash
git clone https://github.com/eyeflow/connector-template.git my-connector
cd my-connector

# Edit manifest.json
npm run lint:manifest
npm run test
npm run build

# Submit PR
```

---

## 10. Troubleshooting & FAQ

### Q: How do I add a new function to my connector?

**A:** Update `manifest.json` ( bump MINOR version), add function definition, update tests, submit PR.

### Q: What if my connector is incompatible with new LLM?

**A:** Use `capabilities` to declare dependencies. LLM validation will check compatibility automatically.

### Q: Can I deprecate a specific function (not whole connector)?

**A:** Yes, add `deprecation` field to function object in manifest. Warnings will be scoped to that function.

### Q: How do I handle rate limiting?

**A:** Document in `metadata.rateLimit`. LLM validation will warn if not declared.

```json
{
  "metadata": {
    "rateLimit": {
      "requests": 100,
      "window": "PT1M",
      "message": "Slack allows 100 API calls per minute"
    }
  }
}
```

---

## 11. Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-19 | Initial governance policy |
| 1.1.0 | TBD | Add capability pinning |
| 2.0.0 | TBD | Multi-tenancy isolation |

---

**Document Maintainer:** Platform Architecture Team  
**Review Cycle:** Quarterly  
**Next Review:** May 2026
