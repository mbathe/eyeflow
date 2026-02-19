# Quick Start Guide - Phase 2.0 Integration

## Where We Are

**Phase 2.0 Days 1-3: COMPLETE**
- 5 TypeScript services built
- 5 connectors with full manifests
- 8-step compilation pipeline ready
- 4 comprehensive documentation files
-**Build Status**: 0 TypeScript errors

**Current Milestone**: Ready for Python LLM Service Integration

---

## Quick Integration Checklist

### For Python Developer (Days 4-5)

**Step 1**: Get the LLM Context
```bash
# See what the LLM needs to know
curl http://localhost:3000/tasks/manifest/llm-context/json | jq

# Output: Full system capabilities
# - All 5 connectors with functions
# - All data types
# - All operators
# - All triggers
```

**Step 2**: Use the template in PYTHON-LLM-SERVICE.md`
```bash
# Copy-paste the FastAPI template
# It includes:
# - Complete Pydantic models
# - Response structure
# - Parameter validation
# - Docker setup
```

**Step 3**: Implement 3 endpoints
```python
POST /parse-intent
  Input: {userInput, llmContext, userId}
  Output: {intent, targets, parameters, missions, confidence}

POST /build-rule
  Input: {description, llmContext, userId}
  Output: {triggers, conditions, actions}

POST /validate-intent
  Input: {intent, llmContext, userId}
  Output: {valid, issues, warnings}
```

**Step 4**: Test locally
```bash
# Start your Python service on port 8001
python app.py

# Test parsing
curl -X POST http://localhost:8001/parse-intent \
  -d '{"userInput": "Send Slack message", ...}'
```

**Step 5**: Notify NestJS team to connect
- Switch LLMIntentParserMock` to `LLMIntentParserHttpClient`
- Point to http://localhost:8001`
- Add retry + error handling

---

### For NestJS Developer (Days 6-7)

**Step 1**: Create Mission Generator
```typescript
// services/mission-generator.service.ts
// Input: ParsedIntent from LLM
// Output: Array of Mission objects ready to execute
// Tasks:
// - Substitute parameters from context
// - Handle connector-specific requirements
// - Chain if necessary
```

**Step 2**: Create Query Generator
```typescript
// services/query-generator.service.ts
// Input: Mission object
// Output: Connector-specific query
// Examples:
// - PostgreSQL → SQL statement
// - Slack → API payload
// - HTTP → Request object
// - Kafka → Message format
```

**Step 3**: Update Module Registration
```typescript
// tasks.module.ts - Already done!
// Just add when ready:
// - MissionGeneratorService
// - QueryGeneratorService
```

**Step 4**: Database Migrations
```bash
# Generate migration from TypeORM entities
npm run typeorm migration:generate
npm run typeorm migration:run

# Creates tables:
# - global_task
# - event_rule
# - mission
# - global_task_state
# - audit_log
```

**Step 5**: Integration Testing
```bash
# Test flow: NL → Parse → Compile → Validate → Execute
npm test -- --testPathPattern="tasks.e2e"

# Should work end-to-end after Python service ready
```

---

## File Reference Guide

### Architecture & Decision Making
-**[ARCHITECTURE-LLM-RULES.md](./ARCHITECTURE-LLM-RULES.md)** - Read this first to understand the 4-layer system
-**[ARCHITECTURE-DIAGRAMS.md](./ARCHITECTURE-DIAGRAMS.md)** - Visual diagrams of data flow

### Implementation Details
-**[PYTHON-LLM-SERVICE.md](./PYTHON-LLM-SERVICE.md)** - Python service template (copy-paste ready)
-**[EXAMPLES-USAGE.md](./EXAMPLES-USAGE.md)** - API examples and demo scripts

### Status & Planning
-**[STATUS-DASHBOARD.md](./STATUS-DASHBOARD.md)** - Complete pre-deployment checklist
-**[IMPLEMENTATION-MATRIX.md](./IMPLEMENTATION-MATRIX.md)** - What's done vs. what's pending
-**[PHASE-2-DAY-3-SUMMARY.md](./PHASE-2-DAY-3-SUMMARY.md)** - Day 3 work summary

### Source Code Structure
```
eyeflow-server/src/tasks/
├── services/
│   ├── connector-manifest.types.ts      ← Complete type system (690 LOC)
│   ├── connector-registry.service.ts    ← 5 connectors (500 LOC)
│   ├── llm-intent-parser.abstraction.ts ← Parser interface + Mock (250 LOC)
│   ├── llm-context-builder.service.ts   ← Context assembly (155 LOC)
│   ├── task-validator.service.ts        ← Validation framework (300 LOC)
│   └── task-compiler.service.ts         ← Main orchestrator (ENHANCED)
├── tasks.module.ts                       ← Service registration (UPDATED)
├── tasks.controller.ts                   ← REST endpoints (UPDATED)
├── dto/                                  ← Data validation
├── entities/                             ← TypeORM models
├── enums/                                ← Type definitions
└── types/                                ← Interfaces
```

---

## Immediate Actions

### TODAY (Next 2 hours)
- [ ] Read [ARCHITECTURE-LLM-RULES.md](./ARCHITECTURE-LLM-RULES.md) (15 min)
- [ ] Review [ARCHITECTURE-DIAGRAMS.md](./ARCHITECTURE-DIAGRAMS.md) (10 min)
- [ ] Check [PYTHON-LLM-SERVICE.md](./PYTHON-LLM-SERVICE.md) for template (20 min)
- [ ] Try API call: curl http://localhost:3000/tasks/manifest/llm-context/json`

### THIS WEEK
- [ ] Python: Start FastAPI service (use template)
- [ ] NestJS: Create MissionGeneratorService
- [ ] Run: Integration test with real parsing

### NEXT WEEK
- [ ] Database migrations
- [ ] Performance optimization
- [ ] Load testing with concurrent rules

---

## Key Concepts You Need to Know

### 1. Connector Registry
The system now knows about all available connectors automatically. Each connector has:
-**Functions**: What it can do (send_message, insert, query, etc.)
-**Nodes**: Resources it manages (channels, tables, topics, etc.)
-**Triggers**: When it can be triggered (ON_CREATE, ON_SCHEDULE, etc.)
-**Operators**: How to condition on it (EQ, CONTAINS, REGEX, etc.)

### 2. LLM Context
When calling Python LLM, it receives complete system manifest:
```json
{
  "connectors": [{name, functions, triggers, nodes, ...}],
  "dataTypes": ["STRING", "NUMBER", ...],
  "operators": ["EQ", "GT", ...],
  "userPermissions": ["read_slack", ...]
}
```

### 3. Validation Pipeline (5 levels)
Before executing ANY task:
1. Connector exists? ✓
2. Function exists? ✓
3. Types match? ✓
4. Permissions OK? ✓
5. Dependencies satisfied? ✓

→ Then execute with confidence

### 4. Event Rules (Mode 3)
Compliance rules that automatically:
- Listen for events (ON_CREATE, ON_UPDATE, etc.)
- Evaluate conditions (if status = RED)
- Execute actions (send alert)
- Log everything for audit
- Handle debounce (don't spam)

---

## What's Already Built

### You DON'T Need to Build
- [x] Connector registry with manifests
- [x] 5 example connectors (Slack, PostgreSQL, HTTP, Kafka, FileSystem)
- [x] LLM context builder
- [x] Task validator (5-level checking)
- [x] Compilation orchestrator
- [x] REST controller with 9 endpoints
- [x] Type system with 15+ data types
- [x] Database entities (ready for migration)
- [x] Audit logging framework

### ⏳ You NEED to Build
- [ ] Python LLM service (FastAPI)
- [ ] Connect Python to NestJS
- [ ] Mission generator
- [ ] Query generator
- [ ] Mission dispatcher
- [ ] Database migrations
- [ ] Integration tests

---

## Learning Path

### If you're new to this system
1. Start: [ARCHITECTURE-LLM-RULES.md](./ARCHITECTURE-LLM-RULES.md)
2. Then: [ARCHITECTURE-DIAGRAMS.md](./ARCHITECTURE-DIAGRAMS.md)
3. Then: [EXAMPLES-USAGE.md](./EXAMPLES-USAGE.md)
4. Then: Specific component documentation

### If you're implementing Python service
1. Start: [PYTHON-LLM-SERVICE.md](./PYTHON-LLM-SERVICE.md)
2. Copy: FastAPI template provided
3. Implement: 3 endpoints (parse-intent, build-rule, validate-intent)
4. Test: Locally on port 8001

### If you're implementing NestJS components
1. Check: [IMPLEMENTATION-MATRIX.md](./IMPLEMENTATION-MATRIX.md) - What's pending
2. Look: Service patterns in existing code
3. Implement: MissionGeneratorService, QueryGeneratorService
4. Test: With mock data first, then integration

---

## Troubleshooting

### "Build fails with TypeScript errors"
→ This shouldn't happen, we verified 0 errors. Try:
```bash
cd eyeflow-server
npm run build
```

### "Python service won't connect"
→ Check in task-compiler.service.ts around line ~150:
- Python service must be running on http://localhost:8001`
- Must respond with LLMIntentParserResponse` format
- Add logging to see actual response

### "Task validation keeps failing"
→ Debug with validation levels:
1. Check connector exists: GET /tasks/manifest/connectors`
2. Check function exists in that connector
3. Check parameter types match
4. Check you have permissions
5. Check dependencies (if any)

### "Manifest endpoints return empty"
→ ConnectorRegistryService is registered? Check tasks.module.ts`:
```typescript
providers: [ConnectorRegistryService, ...]
```

---

## Getting Help

**Questions about Architecture?**
→ Read ARCHITECTURE-LLM-RULES.md` section on your topic

**How do I implement X?**
→ Check EXAMPLES-USAGE.md` for API examples

**What's the timeline?**
→ See STATUS-DASHBOARD.md` pre-deployment checklist

**What's already done?**
→ See IMPLEMENTATION-MATRIX.md` for complete inventory

---

## Deployment Readiness

### Current State
 Code: Production-ready (0 TypeScript errors)
 Architecture: Reviewed and approved
 Documentation: Comprehensive
 Types: Complete and type-safe
⏳ Python Service: Waiting for implementation
⏳ Database: Waiting for migrations

### What's Blocking Production
1. Python LLM service must be implemented
2. Database schema must be created
3. Integration tests must pass
4. Load testing must complete
5. Security review must pass

---

## Ready to Build!

You have:
-  Complete type system
-  Complete architecture
-  Complete documentation
-  Complete examples
-  Complete templates

**Next step**: Start the Python service! 

---

**Questions? Check the docs!**

- Architecture: [ARCHITECTURE-LLM-RULES.md](./ARCHITECTURE-LLM-RULES.md)
- Python Template: [PYTHON-LLM-SERVICE.md](./PYTHON-LLM-SERVICE.md)
- API Examples: [EXAMPLES-USAGE.md](./EXAMPLES-USAGE.md)
- Visual Diagrams: [ARCHITECTURE-DIAGRAMS.md](./ARCHITECTURE-DIAGRAMS.md)
- Progress Tracking: [IMPLEMENTATION-MATRIX.md](./IMPLEMENTATION-MATRIX.md)

**Last Updated**: 2026-02-18  
**Build Status**: Successful (0 errors)  
**Next Milestone**: Python LLM Service (Days 4-5)
