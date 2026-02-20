# 🎯 EyeFlow - Quick Reference Card

**Print this or pin it for quick access!**

---

## 🚀 5-Minute Start

```bash
# 1. BUILD
npm run build

# 2. START
npm run start:dev

# 3. TEST
npm run test:validation

# 4. CHECK
curl http://localhost:3000/health
```

---

## 📚 Where to Read?

| I Want To... | Read This | Time |
|-----------|------------|------|
| **Understand everything** | PROJECT-COMPLETE-GUIDE.md | 45 min |
| **Get started NOW** | QUICK-START.md | 10 min |
| **Use the APIs** | API-REFERENCE.md | 30 min |
| **Build a connector** | CONNECTOR-DEVELOPER-GUIDE.md | 40 min |
| **Understand architecture** | ARCHITECTURE-LLM-RULES.md | 30 min |
| **See what was built** | PROJECT-MANIFEST.md | 20 min |
| **Understand governance** | CATALOG-GOVERNANCE.md | 25 min |

---

## 🔴 CRITICAL ENDPOINTS

```bash
# COMPILE (Natural Language → Executable)
POST /tasks/compile
-H "X-User-ID: user123"
-d '{"description": "Send Slack if SQL fails"}'

# EXECUTE (Run a compiled task)
POST /tasks/{taskId}/execute
-H "X-User-ID: user123"

# CREATE RULE (Event-driven monitoring)
POST /tasks/rules
-H "X-User-ID: user123"
-d '{trigger: ..., actions: ...}'

# GET CONTEXT (What can the LLM use?)
GET /tasks/manifest/llm-context
-H "X-User-ID: user123"
```

---

## 🗂️ Project Structure (Simple)

```
PLANNING        → Python LLM Service (Parse intent)
    ↓
COMPILATION     → NestJS (Validate, build DAG, generate IR)
    ↓
EXECUTION       → Runtime (Execute actions, monitor)
```

---

## 🎓 The 3 Layers Explained

| Layer | What | Technology |
|-------|------|-----------|
| **PLANNING** | "Understand what user wants" | Python + LLM |
| **COMPILATION** | "Build executable plan" | NestJS + DAG |
| **EXECUTION** | "Run the plan" | Runtime + SVM |

---

## 📝 How It Works (Step by Step)

```
1. User says: "Send Slack when compliance fails"
                              ↓
2. Python LLM parses it into: {trigger, conditions, actions}
                              ↓
3. NestJS validates it: ✅ Schema OK, ✅ Catalog OK, ✅ Sandbox OK
                              ↓
4. NestJS builds DAG: trigger → condition → action
                              ↓
5. NestJS generates IR (executable plan): Sign it, save to DB
                              ↓
6. Runtime executes it: Runs all steps, collects results
                              ↓
7. User gets: Success/failure + audit trail + metrics
```

---

## 🔧 Main Services

### Compilation Layer
- **TaskCompilerService** - Main orchestrator
- **LLMValidationService** - 6-step validation (NEW!)
- **DAGCompilationService** - Builds DAG
- **ComponentRegistry** - Catalog of connectors

### Execution Layer
- **TaskExecutionService** - Execution orchestrator
- **SemanticVirtualMachine** - Runs the DAG
- **SandboxExecutionService** - Dry-run testing (NEW!)

### Connectors (25+ available)
- **SlackConnector** - Messages
- **PostgreSQLConnector** - Queries
- **HTTPConnector** - APIs
- **KafkaConnector** - Events
- **FileConnector** - Files

---

## 🧪 Testing

```bash
# All tests
npm run test:all

# Validation tests only
npm run test:validation

# Specific file
npm run test -- llm-validation.contract.spec.ts

# With coverage
npm run test -- --coverage
```

---

## 📊 Database Entities (10+)

| Entity | Purpose |
|--------|---------|
| GlobalTaskEntity | Task records |
| EventRuleEntity | Rules (events + actions) |
| LLMProjectEntity | Project versioning |
| ProjectVersionEntity | Version tracking |
| ExecutionMemoryStateEntity | Execution state |
| AuditLogEntity | Audit trail |
| ConnectorEntity | Connector registry |

---

## 🎯 Compilation Flow

```
Input: "Send Slack message"
  ↓
LLMIntentParserHttpClient.parseIntent()
  ├─ Call Python LLM Service
  └─ Returns: workflow_rules JSON
  ↓
LLMValidationService.parseIntentWithValidation()
  ├─ Retry LLM (3 attempts, backoff)
  ├─ Schema validation (AJV)
  ├─ Catalog verification
  ├─ Response mapping
  ├─ Sandbox simulation
  └─ Return with metrics
  ↓
DAGGeneratorService.generateDAG()
  └─ Build directed acyclic graph
  ↓
DAGCompilationService.compileDAG()
  └─ Optimize, validate, generate IR
  ↓
Output: ExecutionPlan (signed + verified)
```

---

## ⚡ Execution Flow

```
Input: ExecutionPlan
  ↓
ServiceResolutionService (Stage 7)
  └─ Find needed connectors
  ↓
ServicePreloaderService (Stage 8)
  └─ Load connectors
  ↓
SemanticVirtualMachine.executeDAG()
  ├─ For each node:
  │  ├─ Resolve executor
  │  ├─ Call function
  │  └─ Track result
  ↓
ConnectorOrchestration
  ├─ SlackConnector.sendMessage()
  ├─ PostgreSQLConnector.query()
  ├─ HTTPConnector.call()
  └─ etc.
  ↓
AuditLogger
  ├─ Log each step
  └─ Store to database
  ↓
Output: ExecutionResult with audit trail
```

---

## 📈 Performance Targets

| Operation | Time | Status |
|-----------|------|--------|
| Compilation | <3 sec | ✅ |
| Execution | <5 sec | ✅ |
| Validation | <500ms | ✅ |
| Schema check | <50ms | ✅ |
| Catalog lookup | <100ms | ✅ |

---

## 🔍 Validation Pipeline (6 Steps)

```
1. LLM Call + Retry
   • 3 attempts with exponential backoff
   • 100ms, 500ms, 2000ms

2. Schema Validation (AJV)
   • Validate against JSON schema
   • Catch 95% of issues early

3. Catalog Verification
   • Check connector exists
   • Check action/function exists
   • Check capability version compat

4. Response Mapping
   • Convert to structured format
   • Prepare for DAG building

5. Sandbox Simulation
   • Dry-run without side effects
   • Detect execution issues early

6. Metrics Tracking
   • Record all validation metrics
   • Prepare for monitoring
```

---

## 🎨 Connectors Quick Map

| Connector | Use For | Example |
|-----------|---------|---------|
| **slack** | Messages | Alerts, notifications |
| **postgres** | Data | Query, insert, update |
| **http** | APIs | Webhooks, REST calls |
| **kafka** | Events | Publish/subscribe |
| **file** | Files | Read/write local files |
| **email** | Mail | Send emails |
| **s3** | Cloud | Store in S3 |

---

## 🚨 Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `UNKNOWN_CONNECTOR` | Connector not registered | Use registered connector or add new one |
| `VALIDATION_FAILED` | Schema invalid | Check JSON structure |
| `CATALOG_NOT_FOUND` | Action doesn't exist | Check connector docs |
| `LLM_TIMEOUT` | LLM service down | Check Python service running |
| `DATABASE_ERROR` | DB connection failed | Check PostgreSQL running |

---

## 🔐 Security Features

- ✅ User isolation (X-User-ID header)
- ✅ Query signing (ED25519)
- ✅ Audit trail (all actions logged)
- ✅ Rate limiting (1000 req/hour)
- ✅ Input validation (strict schema)
- ✅ Error redaction (no sensitive data)

---

## 📊 Metrics to Monitor

```javascript
// Key metrics to track
llm.validation_requests_total
llm.validation_latency_ms
llm.schema_validation_errors_total
llm.catalog_validation_errors_total
llm.retry_attempts_total
llm.escalations_total
connector.deployment_success_rate
```

---

## 🔄 Retry Logic

```
Failed request (5xx error)
    ↓
Wait 100ms → Retry (attempt 1)
    ↓
Failed again
    ↓
Wait 500ms → Retry (attempt 2)
    ↓
Failed again
    ↓
Wait 2000ms → Retry (attempt 3)
    ↓
Still failed → Escalate to monitoring
```

---

## 🌍 External Developer Workflow

```
1. Read: CONNECTOR-DEVELOPER-GUIDE.md
2. Create: manifest.json (describes your connector)
3. Implement: Your connector code
4. Test: Unit tests (80%+ coverage)
5. Submit: PR to repository
6. Verify: CI/CD validates automatically
7. Merge: If all checks pass
8. Deploy: Automatically available
```

---

## 📦 Deployment Commands

```bash
# Build
npm run build

# Lint
npm run lint

# Test
npm run test

# Docker
docker build -t eyeflow-server:latest .
docker run -p 3000:3000 eyeflow-server:latest

# Full stack
docker-compose up
```

---

## 🎯 Example curl Commands

```bash
# Health check
curl http://localhost:3000/health

# Compile task
curl -X POST http://localhost:3000/tasks/compile \
  -H "X-User-ID: user123" \
  -H "Content-Type: application/json" \
  -d '{"description": "Send Slack message"}'

# Execute task
curl -X POST http://localhost:3000/tasks/TASK_ID/execute \
  -H "X-User-ID: user123"

# Get context
curl http://localhost:3000/tasks/manifest/llm-context \
  -H "X-User-ID: user123"
```

---

## 📁 File Locations

| What | Where |
|------|-------|
| **REST Controllers** | `src/tasks/controllers/` |
| **Business Logic** | `src/tasks/services/` |
| **Database Models** | `src/tasks/entities/` |
| **Tests** | `src/tasks/__tests__/` |
| **Connectors** | `src/connectors/types/` |
| **Validation** | `src/tasks/services/llm-*.service.ts` |
| **APIs Docs** | `API-REFERENCE.md` |
| **Architecture** | `PROJECT-COMPLETE-GUIDE.md` |

---

## ⏱️ Timeline: How Long Things Take

| Task | Time |
|------|------|
| Read QUICK-START | 10 min |
| Read PROJECT-COMPLETE-GUIDE | 45 min |
| First compilation | 10 min |
| First execution | 5 min |
| Build first connector | 2 hours |
| Full deployment | 30 min |

---

## 🎓 Learning Path

### Day 1: Fundamentals
- [ ] Read README.md (5 min)
- [ ] Read QUICK-START.md (10 min)
- [ ] Run health check (2 min)
- [ ] Read PROJECT-COMPLETE-GUIDE.md (45 min)

### Day 2: API Usage
- [ ] Read API-REFERENCE.md (30 min)
- [ ] Compile first task (10 min)
- [ ] Execute first task (10 min)
- [ ] Create first rule (15 min)

### Day 3: Deep Dive
- [ ] Read ARCHITECTURE-LLM-RULES.md (30 min)
- [ ] Explore src/tasks/ (30 min)
- [ ] Run tests (10 min)
- [ ] Track execution in debugger (30 min)

### Day 4: Contributing
- [ ] Read CONNECTOR-DEVELOPER-GUIDE.md (40 min)
- [ ] Create sample connector (2 hours)
- [ ] Submit PR (30 min)

---

## ✅ Production Checklist

- [ ] TypeScript compilation: 0 errors
- [ ] Tests: All passing (npm run test:all)
- [ ] Linting: 0 warnings
- [ ] Environment variables: Configured
- [ ] Database: Migrated
- [ ] Redis: Running
- [ ] Kafka: Running
- [ ] Python LLM Service: Running
- [ ] Docker images: Built & tagged
- [ ] Health checks: Passing
- [ ] Smoke tests: Done

---

## 🆘 Help & Support

| Need | DO THIS |
|------|---------|
| **Quick intro** | Read QUICK-START.md |
| **Full walkthrough** | Read PROJECT-COMPLETE-GUIDE.md |
| **API examples** | Read API-REFERENCE.md |
| **Build connector** | Read CONNECTOR-DEVELOPER-GUIDE.md |
| **Understand design** | Read ARCHITECTURE-LLM-RULES.md |
| **See full inventory** | Read PROJECT-MANIFEST.md |
| **Governance rules** | Read CATALOG-GOVERNANCE.md |

---

## 🚀 You're Ready!

**Next Steps:**
1. Print this card
2. Read PROJECT-COMPLETE-GUIDE.md
3. Run your first compilation
4. Explore the codebase
5. Build your first feature

---

**Good luck! 🎉**

*EyeFlow - Semantic Compilation Platform*  
*Version 3.0 - February 19, 2026*
