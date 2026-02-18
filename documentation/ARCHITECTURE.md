# 🏗️ EYEFLOW ARCHITECTURE - Complete Design Document

**Date:** 18 février 2026  
**Version:** 1.2 - Three-Mode Architecture (Event-Driven + Direct + Monitoring)  
**Status:** Design Complete with Task Compiler & Surveillance Rules - Ready for Phase 2 Implementation

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Vision & Principles](#vision--principles)
3. [9-Layer Architecture](#9-layer-architecture)
4. [Data Flows](#data-flows)
5. [Component Details](#component-details)
6. [Integration with Existing Code](#integration-with-existing-code)
7. [Implementation Roadmap](#implementation-roadmap)
8. [Design Decisions](#design-decisions)

---

## Executive Summary

### What is EyeFlow?

EyeFlow is a **universal intelligent automation platform** with three operation modes:

**Mode 1: Event-Driven (Reactive)**
- Automatically detects changes from any data source (100+ connectors)
- Normalizes events into a universal format
- Interprets business rules using LLM (natural language)
- Routes missions to distributed execution nodes
- Audits everything for compliance

**Mode 2: Direct Execution (Proactive - Now)**
- User requests an action in natural language via chat
- System compiles request → Generates missions → Executes immediately
- Example: "Backup database now" / "Create SAP form for product 123"

**Mode 3: Continuous Monitoring (Proactive - Ongoing)** ⭐ NEW
- User defines a surveillance rule in natural language
- System monitors data sources continuously for that condition
- When condition is met, automatically executes associated actions
- Example: "Monitor heart rate sensor, if > 120 BPM, alert doctor and log to system"

### The Core Problem We Solve

```
BEFORE (Manual):
- Need to constantly check things manually
- Need to remember to execute actions
- Forget things, errors happen
Result: Inefficient, unreliable, no audit trail

AFTER (EyeFlow - Direct):
User: "Do this now"
System: Executes → Complete audit trail ✓

AFTER (EyeFlow - Monitoring):
User: "If X happens, do Y automatically"
System: Monitors continuously → Acts when needed → Full audit ✓
```

### Key Innovations

- **Dual-Mode Chatbot** (Direct actions + Continuous monitoring)
- **Declarative Surveillance** (Define rules in natural language)
- **Automatic Monitoring** (Watch infinite data sources in real-time)
- **LLM-powered action generation** (Actions created based on user intent)
- **Smart Node Assignment** (Actions → Best node based on capabilities)
- **Universal normalization** (Any source looks the same to the system)
- **Event Sensor Framework** (Users create their own connectors)
- **Distributed execution** (NexusNodes can run anywhere)

---

## Vision & Principles

### The NEXUS FLOW Abstraction

```
THREE OPERATION MODES:

┌─────────────────────────────────────────────────────────────┐
│ MODE 1: EVENT-DRIVEN (Automatic Monitoring)                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Real events in connectors                                 │
│      ↓                                                      │
│  Sensor → Normalize → Match rules → Create missions        │
│      ↓                                                      │
│  Smart Dispatcher → NexusNodes → Execute → Audit & Report  │
│                                                             │
│  Example: "IF product.expiry < 30 days → notify warehouse" │
│           (Always running in background)                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ MODE 2: DIRECT EXECUTION (On-Demand Actions)               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  👤 User Chat Interface                                     │
│  "Create backup now" or "Check database status"            │
│      ↓                                                      │
│  🧠 Task Compiler                                           │
│  • Parse intent                                            │
│  • Generate immediate missions                            │
│      ↓                                                      │
│  🚀 Execute Now                                             │
│  • Dispatch to nodes                                       │
│  • Collect proof                                           │
│  • Return results immediately                              │
│      ↓                                                      │
│  📑 Report                                                  │
│                                                             │
│  Example: "Backup database" → Done in 30 seconds          │
│           (One-time execution)                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ MODE 3: CONTINUOUS MONITORING (Surveillance Rules) ⭐ NEW  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  👤 User Chat Interface                                     │
│  "Monitor heart rate, if > 120, alert doctor               │
│   and log to system"                                       │
│      ↓                                                      │
│  🧠 Task Compiler                                           │
│  • Parse intent                                            │
│  • Create Surveillance Rule                               │
│  • Configure data source (Heart Rate sensor)              │
│  • Configure condition (> 120)                            │
│  • Configure actions (alert, log)                         │
│      ↓                                                      │
│  💾 Save EventRule to DB                                    │
│  (Stays active until stopped)                              │
│      ↓                                                      │
│  📡 Continuous Monitoring                                   │
│  • Listen to heart rate sensor                            │
│  • Check condition continuously                           │
│  • When > 120:                                             │
│    └─→ Normalize event                                     │
│    └─→ Match rule                                          │
│    └─→ Generate missions                                  │
│    └─→ Execute actions (alert, log)                       │
│    └─→ Audit trail                                         │
│      ↓                                                      │
│  📑 Automated Reports (per trigger)                         │
│                                                             │
│  Example: "Monitor continuously" → Acts on every event    │
│           (Ongoing, reactive)                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘

UNIFIED FLOW FOR ALL MODES:
All three eventually converge to same execution pipeline:
Event → Normalize → Match → Actions → Dispatcher → Nodes → Report
```

### Design Principles

#### 1. **Separation of Concerns**
Each layer handles one responsibility:
- **Capture** ≠ **Normalize** ≠ **Interpret** ≠ **Execute** ≠ **Report**

#### 2. **Abstraction Layers**
Low ↔ High abstraction:
```
Raw events → StandardEvent → Business rules → Missions → Results
```

#### 3. **Multi-Tenancy**
```
Every entity has userId
Security: X-User-ID header isolation
Data: Automatic user-based filtering
```

#### 4. **Extensibility**
Users can extend without modifying core:
- Custom sensors (Event Sensor Framework)
- Custom rules (EventRules with LLM interpretation)
- Custom nodes (NexusNode network)

#### 5. **Auditability**
Complete chain of custody:
```
Event detected → Rule evaluated (with reasoning) → Decision made 
  → Action executed (with proof) → Human understands entire flow
```

#### 6. **Resilience**
```
Kafka: at-least-once delivery (deduplication in code)
LLM: Cache results + graceful fallback
Dispatch: Retry with exponential backoff
DB: Everything persisted (no in-memory losses)
```

---

## 9-Layer Architecture

### LAYER 0.5: Task Configuration & Compiler (Chatbot Entry Point)

**Status:** ❌ 0% - Design Only (Ready to Build)

**Responsibility:** Convert chatbot input into automated end-to-end tasks

```
┌─────────────────────────────────────────────────────────────────┐
│  TASK COMPILER & CONFIGURATION LAYER (Chatbot Interface)       │
│                    [Phase 2 Part 0 - To Build FIRST]           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  USER INTERACTION FLOW:                                         │
│                                                                 │
│  1️⃣ User opens chat interface                                   │
│                                                                 │
│  2️⃣ User selects data SOURCES (Connectors):                     │
│     ┌────────────────────────────┐                              │
│     │ ☑️ PostgreSQL (Inventory)   │                              │
│     │ ☑️ Kafka (Events)           │                              │
│     │ ☐ S3 (Backups)             │                              │
│     │ ☐ Slack (Notifications)    │                              │
│     └────────────────────────────┘                              │
│                                                                 │
│  3️⃣ User selects EXECUTION TARGETS (NexusNodes):                │
│     ┌────────────────────────────┐                              │
│     │ ☑️ SAP Integration Node     │                              │
│     │ ☑️ Notification Hub Node    │                              │
│     │ ☐ MainFrame Node           │                              │
│     │ ☐ Ghost Control Node       │                              │
│     └────────────────────────────┘                              │
│                                                                 │
│  4️⃣ User types request in natural language:                     │
│     ┌────────────────────────────────────────────────┐          │
│     │ "Check all medical products expiring within    │          │
│     │  30 days from inventory. For each product:     │          │
│     │  1. Create return form in SAP                  │          │
│     │  2. Send notification to warehouse manager    │          │
│     │  3. Log to audit trail"                        │          │
│     └────────────────────────────────────────────────┘          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ TASK COMPILER SERVICE PROCESSES:                                │
│                                                                 │
│ INPUT: GlobalTaskRequest {                                      │
│   userId: UUID,                                                 │
│   description: string,        ← Natural language               │
│   selectedConnectors: UUID[],                                   │
│   selectedNodes: UUID[],                                        │
│   priority: 0-3              ← 0=critical                      │
│ }                                                               │
│                                                                 │
│ STEP 1: NLU Intent Detection                                   │
│ ──────────────────────────────                                 │
│ LLM Task: Parse user request to identify:                      │
│ ├─ Primary intent ("Extract & Apply")                          │
│ ├─ Conditions ("products expiring < 30 days")                  │
│ ├─ Actions to perform ("create form", "send notif")            │
│ └─ Expected data structures                                    │
│                                                                 │
│ LLM Response:                                                   │
│ {                                                               │
│   "intent": "data_extraction_with_actions",                    │
│   "source": "PostgreSQL",                                       │
│   "entity": "products",                                         │
│   "filter": {                                                   │
│     "field": "expiry_date",                                    │
│     "operator": "<",                                            │
│     "value": "NOW() + 30 days"                                  │
│   },                                                            │
│   "foreach_actions": [                                          │
│     {                                                           │
│       "action": "create_sap_form",                             │
│       "inputs": ["productId", "productName", "expiryDate"]    │
│     },                                                          │
│     {                                                           │
│       "action": "send_notification",                           │
│       "inputs": ["warehouseManagerId", "productDetails"]      │
│     },                                                          │
│     {                                                           │
│       "action": "log_audit",                                   │
│       "inputs": ["taskId", "action", "result"]                │
│     }                                                           │
│   ]                                                             │
│ }                                                               │
│                                                                 │
│ STEP 2: Query Generation                                       │
│ ──────────────────────────                                     │
│ Generate SQL/query for selected connectors:                    │
│                                                                 │
│ FOR PostgreSQL:                                                │
│ SELECT * FROM products                                         │
│ WHERE expiry_date < CURRENT_DATE + INTERVAL '30 days'         │
│ AND status = 'active'                                          │
│ AND user_id = '{userId}'                                       │
│                                                                 │
│ STEP 3: Create Artificial Events                               │
│ ─────────────────────────────────                              │
│ Create StandardEvent for EACH row returned:                    │
│                                                                 │
│ FOR each product (id=123, name="Medical Kit X", ...):         │
│   Product 123 → StandardEvent {                                │
│     operation: 'EXTRACT',                                      │
│     entity: {type: 'product', id: 123},                        │
│     after: {id, name, expiry_date, ...},                       │
│     extractedContext: {                                        │
│       productId: 123,                                          │
│       productName: "Medical Kit X",                            │
│       expiryDate: "2026-02-28",                                │
│       daysUntilExpiry: 10                                      │
│     }                                                          │
│   }                                                             │
│                                                                 │
│ STEP 4: Generate Actions from Task Intent                      │
│ ──────────────────────────────────────                         │
│ For each StandardEvent, create ActionSet:                      │
│                                                                 │
│ ActionSet for Product 123:                                     │
│ ├─ Action 1: "create_sap_return_form"                          │
│ │  inputs: {productId: 123, expiryDate: "2026-02-28"}         │
│ │  llmModel: "gpt-4"  (selected by system)                    │
│ │  targetNode: "SAP Integration Node" ✓ (user selected)       │
│ │                                                              │
│ ├─ Action 2: "send_warehouse_notification"                    │
│ │  inputs: {managerId: "xyz", productId: 123}                 │
│ │  llmModel: "gpt-4"  (for personalization)                   │
│ │  targetNode: "Notification Hub Node" ✓ (user selected)      │
│ │                                                              │
│ └─ Action 3: "log_to_audit_trail"                              │
│    inputs: {taskId, action, success, timestamp}               │
│    llmModel: "local"  (deterministic, no LLM needed)           │
│    targetNode: "Database Node" (system-assigned)              │
│                                                                 │
│ STEP 5: Create GlobalTask Entity                               │
│ ──────────────────────────────                                 │
│ Store everything in DB:                                        │
│                                                                 │
│ GlobalTaskEntity {                                              │
│   id: UUID,                                                     │
│   userId: UUID,                                                │
│   description: "Check medical...",                             │
│   status: 'PENDING',                                           │
│                                                                 │
│   parsedIntent: {...},        ← From Step 1                    │
│   generatedQuery: "SELECT...",                ← From Step 2   │
│                                                                 │
│   sourceConnectors: [          ← User selected                │
│     'postgresql-inventory-uuid'                                │
│   ],                                                            │
│                                                                 │
│   targetNodes: [               ← User selected                 │
│     'sap-node-uuid',                                           │
│     'notification-node-uuid'                                   │
│   ],                                                            │
│                                                                 │
│   autogenEvents: [...],        ← Step 3 events                │
│                                                                 │
│   generatedMissions: [                                         │
│     {                                                          │
│       eventId: "evt-123",                                      │
│       actions: [                                               │
│         {type: 'create_sap_form', node: 'sap', llm: 'gpt-4'} │
│         {type: 'send_notif', node: 'notif', llm: 'gpt-4'}    │
│         {type: 'audit_log', node: 'db', llm: 'local'}        │
│       ],                                                       │
│       status: 'READY_FOR_EXECUTION'                           │
│     }                                                          │
│   ],                                                           │
│                                                                 │
│   createdAt: timestamp,                                        │
│   startedAt: null,                                             │
│   completedAt: null                                            │
│ }                                                              │
│                                                                 │
│ STEP 6: Generate Missions from Actions                         │
│ ──────────────────────────────────────                         │
│ For each ActionSet, create MissionEntity:                      │
│                                                                 │
│ Mission 1 (Product 123 - Action 1):                            │
│ {                                                              │
│   globalTaskId: task-uuid,                                     │
│   eventId: evt-123,                                            │
│   actions: ["create_sap_return_form"],                        │
│   hashedActions: "abc123",  ← For batching similar tasks      │
│   targetNode: "sap-node-uuid",                                 │
│   llmConfig: "gpt-4",                                          │
│   status: 'PENDING'                                            │
│ }                                                              │
│                                                                 │
│ Mission 1b (Product 123 - Action 2):                           │
│ {                                                              │
│   globalTaskId: task-uuid,                                     │
│   eventId: evt-123,                                            │
│   actions: ["send_warehouse_notification"],                   │
│   targetNode: "notification-node-uuid",                        │
│   llmConfig: "gpt-4",                                          │
│   status: 'PENDING'                                            │
│ }                                                              │
│ ... (similar for each product × each action)                   │
│                                                                 │
│ STEP 7: Group & Optimize Missions                              │
│ ────────────────────────────────                               │
│ • Batch similar actions to same node                           │
│ • Parallelize independent missions                             │
│ • Respect dependency order                                     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ GlobalTaskEntity (Database Model):                             │
│                                                                 │
│ @Entity('global_tasks')                                        │
│ export class GlobalTaskEntity {                                │
│   @PrimaryGeneratedColumn('uuid')                              │
│   id: string;                                                  │
│                                                                 │
│   @Column({ type: 'uuid' })                                    │
│   userId: string;              ← Multi-tenancy                │
│                                                                 │
│   @Column({ type: 'text' })                                    │
│   description: string;         ← Original user request         │
│                                                                 │
│   @Column({ type: 'enum', enum: GlobalTaskType })            │
│   type: GlobalTaskType;        ← DIRECT | MONITORING          │
│   // DIRECT: Execute immediately (Mode 2)                     │
│   // MONITORING: Create surveillance rule (Mode 3)             │
│                                                                 │
│   @Column({ type: 'enum', enum: GlobalTaskStatus })           │
│   status: GlobalTaskStatus;    ← PENDING/EXECUTING/DONE/ERROR │
│   // For DIRECT: PENDING → EXECUTING → COMPLETED/FAILED      │
│   // For MONITORING: PENDING → ACTIVE → COMPLETED/STOPPED    │
│                                                                 │
│   @Column({ type: 'uuid', nullable: true })                    │
│   linkedEventRuleId?: string;  ← If MONITORING, link to rule  │
│                                                                 │
│   @Column({ type: 'uuid', array: true })                       │
│   selectedConnectors: string[];  ← Connectors user picked     │
│                                                                 │
│   @Column({ type: 'uuid', array: true })                       │
│   selectedNodes: string[];       ← Nodes user picked          │
│   // For DIRECT: Nodes to execute on                          │
│   // For MONITORING: Nodes to use when condition met          │
│                                                                 │
│   @Column({ type: 'jsonb' })                                   │
│   parsedIntent: {                                              │
│     intent: string;    ← 'direct_action'|'continuous_monitoring'
│     entities: Record<string, any>;                             │
│     actions: string[];                                         │
│     condition?: {       ← For MONITORING only                  │
│       source: string;   ← "heart_rate_sensor"                  │
│       operator: string; ← ">", "<", "==", etc                 │
│       value: number|string;                                    │
│     };                                                          │
│   };                                                            │
│                                                                 │
│   @Column({ type: 'text' })                                    │
│   generatedQuery?: string;     ← For DIRECT execution only    │
│                                                                 │
│   @Column({ type: 'uuid', array: true })                       │
│   generatedEventIds?: string[]; ← Artificial events (DIRECT)  │
│                                                                 │
│   @Column({ type: 'uuid', array: true })                       │
│   generatedMissionIds?: string[]; ← Missions created (DIRECT) │
│                                                                 │
│   @Column({ type: 'integer' })                                 │
│   priority: 0 | 1 | 2 | 3;    ← Task priority                │
│                                                                 │
│   @Column({ type: 'timestamp', nullable: true })              │
│   startedAt: Date;                                             │
│                                                                 │
│   @Column({ type: 'timestamp', nullable: true })              │
│   completedAt: Date;                                           │
│                                                                 │
│   @Column({ type: 'integer', nullable: true })                │
│   totalDuration: number;       ← End-to-end time             │
│                                                                 │
│   @Column({ type: 'jsonb', nullable: true })                   │
│   summary: {                                                    │
│     eventsProcessed: number;                                   │
│     missionsCreated: number;                                   │
│     missionsSucceeded: number;                                 │
│     missionsFailed: number;                                    │
│   };                                                            │
│                                                                 │
│   @CreateDateColumn()                                          │
│   createdAt: Date;                                             │
│ }                                                              │
│                                                                 │
│ export enum GlobalTaskType {                                   │
│   DIRECT = 'direct',           ← Execute immediately (Mode 2)  │
│   MONITORING = 'monitoring'    ← Create surveillance (Mode 3)  │
│ }                                                              │
│                                                                 │
│ export enum GlobalTaskStatus {                                 │
│   PENDING = 'pending',         ← Waiting for execution        │
│   EXECUTING = 'executing',     ← In progress                  │
│   COMPLETED = 'completed',     ← All missions done            │
│   PARTIAL = 'partial',         ← Some missions failed         │
│   FAILED = 'failed',           ← Task failed                  │
│   ACTIVE = 'active',           ← Surveillance running (TYPE=MONITORING)
│   STOPPED = 'stopped'          ← Surveillance stopped         │
│ }                                                              │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ API Endpoints:                                                  │
│                                                                 │
│ POST   /tasks/compile                                           │
│   Input: {description, selectedConnectors, selectedNodes, type}│
│   Output: GlobalTask with preview of generated actions        │
│                                                                 │
│ POST   /tasks/:id/execute                                      │
│   For DIRECT tasks: Start execution immediately               │
│   For MONITORING tasks: Activate surveillance rule             │
│                                                                 │
│ GET    /tasks/:id                                              │
│   Get task details + current status                           │
│                                                                 │
│ GET    /tasks/:id/preview                                      │
│   For DIRECT: Show what will be executed                       │
│   For MONITORING: Show rule preview + test query              │
│                                                                 │
│ GET    /tasks/:id/progress                                     │
│   For DIRECT: Real-time execution progress                     │
│   For MONITORING: Showing when rule matches (event stream)    │
│                                                                 │
│ GET    /tasks/:id/report                                       │
│   For DIRECT: Final report after execution                     │
│   For MONITORING: Aggregate report of all triggers             │
│                                                                 │
│ POST   /tasks/:id/stop                                          │
│   For MONITORING tasks: Stop the surveillance                  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Output: GlobalTask ready for execution or monitoring           │
│ Next step: Execute immediately (DIRECT) or Activate (MONITORING)
│                                                                 │
└─────────────────────────────────────────────────────────────────┘                                           │
│                                                                 │
│   @Column({ type: 'integer', nullable: true })                │
│   totalDuration: number;       ← End-to-end time             │
│                                                                 │
│   @Column({ type: 'jsonb', nullable: true })                   │
│   summary: {                                                    │
│     eventsProcessed: number;                                   │
│     missionsCreated: number;                                   │
│     missionsSucceeded: number;                                 │
│     missionsFailed: number;                                    │
│   };                                                            │
│                                                                 │
│   @CreateDateColumn()                                          │
│   createdAt: Date;                                             │
│ }                                                              │
│                                                                 │
│ export enum GlobalTaskStatus {                                 │
│   PENDING = 'pending',         ← Waiting for execution        │
│   EXECUTING = 'executing',     ← In progress                  │
│   COMPLETED = 'completed',     ← All missions done            │
│   PARTIAL = 'partial',         ← Some missions failed         │
│   FAILED = 'failed',           ← Task failed                  │
│ }                                                              │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ API Endpoints:                                                  │
│                                                                 │
│ POST   /tasks/compile                                           │
│   Input: {description, selectedConnectors, selectedNodes}     │
│   Output: GlobalTask with preview of generated actions        │
│                                                                 │
│ POST   /tasks/:id/execute                                      │
│   Start execution of all generated missions                    │
│                                                                 │
│ GET    /tasks/:id                                              │
│   Get task details + current execution status                 │
│                                                                 │
│ GET    /tasks/:id/preview                                      │
│   Show what will be executed (before user clicks "execute")   │
│                                                                 │
│ GET    /tasks/:id/progress                                     │
│   Real-time progress (WebSocket friendly)                      │
│                                                                 │
│ GET    /tasks/:id/report                                       │
│   Final report (PDF) with all results                         │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Output: GlobalTask with all generated missions ready          │
│ Next step: Execute all missions in parallel/sequence           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### LEVEL 0: FOUNDATION (Data Universe)

The external world - everything that generates data:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA UNIVERSE (External)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Databases           Files              Systems       IoT       │
│  ├─ PostgreSQL       ├─ Local FS        ├─ SAP        ├─ MQTT   │
│  ├─ MySQL            ├─ S3              ├─ Mainframe  ├─ Kafka  │
│  ├─ MongoDB          ├─ Google Drive    ├─ Legacy     ├─ Custom │
│  ├─ DynamoDB         └─ Dropbox         └─ Custom     └─ Sensors│
│  └─ Firestore                                                   │
│                                                                 │
│  Cloud APIs          Events             Communication           │
│  ├─ REST APIs        ├─ Webhooks        ├─ Slack              │
│  ├─ GraphQL          ├─ Polling         ├─ Teams              │
│  └─ SOAP             └─ Server Events   ├─ Email              │
│                                         └─ SMS                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### LEVEL 1: Universal Connector Layer

**Status:** ✅ 85% Complete

**Responsibility:** Abstract any data source into a unified interface

```
┌─────────────────────────────────────────────────────────────────┐
│         UNIVERSAL CONNECTOR LAYER (22 Types)                    │
│                    [Phase 1 - ✅ DONE]                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  DATABASES (5)                COMMUNICATION (4)                │
│  ├─ PostgreSQL                ├─ Slack                         │
│  ├─ MySQL                     ├─ Teams                         │
│  ├─ MongoDB                   ├─ SMTP                          │
│  ├─ DynamoDB                  └─ WhatsApp                      │
│  └─ Firestore                                                  │
│                                                                 │
│  FILE SYSTEMS (4)             BUSINESS (3)                     │
│  ├─ LOCAL_FILE                ├─ Shopify                       │
│  ├─ S3                        ├─ Stripe                        │
│  ├─ GOOGLE_DRIVE              └─ HubSpot                       │
│  └─ DROPBOX                                                    │
│                                                                 │
│  IoT & PROTOCOLS (3)          WEBHOOKS & CUSTOM (3)            │
│  ├─ MQTT                      ├─ REST_API                      │
│  ├─ KAFKA                     ├─ GRAPHQL                       │
│  └─ INFLUXDB                  └─ WEBHOOK                       │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Responsibilities:                                               │
│ ├─ Authentication & secrets management (AES-256-CBC)          │
│ ├─ Connection pooling & retry logic                           │
│ ├─ Rate limiting & timeouts                                   │
│ ├─ Connection health checks                                   │
│ ├─ Multi-tenancy isolation (userId)                           │
│ └─ Credential encryption at rest                              │
│                                                                 │
│ Key Components:                                                 │
│ ├─ ConnectorEntity (DB persistence ✅)                        │
│ ├─ 22 ConnectorConfig types (✅)                              │
│ ├─ ConnectorsService (CRUD + encrypt ✅)                      │
│ ├─ ConnectorsController (REST API ✅)                         │
│ └─ Encryption helpers (AES-256-CBC ✅)                        │
│                                                                 │
│ Output: "Connector ready to use"                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Files:**
- `src/connectors/connector.entity.ts`
- `src/connectors/connector.types.ts` (22 types)
- `src/connectors/connectors.service.ts`
- `src/connectors/connectors.controller.ts`

**Existing Implementation:** ✅
- ConnectorEntity with TypeORM
- All 22 types defined
- Full CRUD operations
- AES-256-CBC encryption
- Multi-tenant isolation

---

### LEVEL 2: Event Sensor Framework (ESF)

**Status:** ❌ 0% - Design Only (Ready to Build)

**Responsibility:** Capture events from any source

```
┌─────────────────────────────────────────────────────────────────┐
│     EVENT SENSOR FRAMEWORK (ESF) - Multi-Source Listeners       │
│                    [Phase 2 Part 1 - To Build]                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  BUILT-IN SENSORS (provided by EyeFlow):                        │
│  ├─ KafkaCdcSensor         (Debezium CDC from any DB)          │
│  ├─ FileSystemSensor       (inotify on Linux, FSEvents Mac)    │
│  ├─ S3EventSensor          (AWS S3 bucket notifications)       │
│  ├─ WebhookIngestSensor    (POST /webhook ingestion)           │
│  ├─ PollingRestSensor      (API polling + state comparison)    │
│  └─ DirectConnectorSensors (Various direct APIs)               │
│                                                                 │
│  CUSTOM SENSORS (user-created):                                 │
│  ├─ SapRfcSensor           (SAP RFC calls)                      │
│  ├─ BlockchainSensor       (Smart contract logs)               │
│  ├─ LdapDirectorySensor    (Active Directory changes)          │
│  ├─ MainframeHookSensor    (CICS/IMS events)                   │
│  ├─ CustomHttpSensor       (Proprietary APIs)                  │
│  └─ User's own sensors     (Unlimited extensions)              │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Core Interface (IEventSensor):                                   │
│                                                                 │
│ • getName(): string                                             │
│   └─ Sensor identifier ("kafka-cdc", "sap-rfc", etc)           │
│                                                                 │
│ • getConnectorType(): ConnectorType                            │
│   └─ Which connector type this sensor works with              │
│                                                                 │
│ • getVersion(): string                                          │
│   └─ Semantic versioning                                       │
│                                                                 │
│ • initialize(config): Promise<void>                            │
│   └─ Setup: authenticate, connect, prepare                    │
│                                                                 │
│ • start(): Promise<void>                                        │
│   └─ Begin listening for events                                │
│                                                                 │
│ • stop(): Promise<void>                                         │
│   └─ Stop listening gracefully                                 │
│                                                                 │
│ • health(): Promise<SensorHealthStatus>                        │
│   └─ Return: {status, lastEventAt, eventsProcessed, errors}   │
│                                                                 │
│ • on(event: 'data'|'error', callback): void                   │
│   └─ Event emission (StandardEvent or Error)                  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Sensor Configuration (SensorConfig):                             │
│                                                                 │
│ {                                                               │
│   connectorId: UUID,                ← Which connector to use   │
│   connectorConfig: {...},           ← Connector credentials    │
│   pollInterval?: number,            ← For polling sensors      │
│   topics?: string[],                ← For Kafka/MQTT           │
│   watchPath?: string,               ← For filesystem           │
│   webhookPath?: string,             ← For webhook listeners    │
│   [key: string]: any                ← Custom per sensor        │
│ }                                                               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Sensor Registry Service:                                         │
│                                                                 │
│ • listAvailable()                                               │
│   └─ Get all sensors (built-in + custom)                       │
│                                                                 │
│ • register(name, sensor)                                        │
│   └─ Add custom sensor                                         │
│                                                                 │
│ • instantiate(name, config)                                    │
│   └─ Create sensor instance + validate config                 │
│                                                                 │
│ • getSchema(name)                                               │
│   └─ Configuration schema for UX                               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Output: Raw events (format varies by sensor)                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Files to Create:**
- `src/sensors/sensor.interface.ts` (Core interface)
- `src/sensors/sensor-registry.service.ts` (Discovery & instantiation)
- `src/sensors/sensor.types.ts` (Types)
- `src/sensors/built-in/`
  - `kafka-cdc.sensor.ts`
  - `filesystem.sensor.ts`
  - `s3-event.sensor.ts`
  - `webhook.sensor.ts`
  - `polling-rest.sensor.ts`
- `src/sensors/sensors.controller.ts` (API endpoints)
- `src/sensors/sensors.module.ts`

**Example Endpoints:**
```
GET    /sensors/available              List all sensors
GET    /sensors/sensor/:name/schema    Get config schema
POST   /sensors/register               Register custom sensor
POST   /sensors/activate/:connectorId  Activate sensor
GET    /sensors/instance/:id/status    Health check
POST   /sensors/instance/:id/stop      Stop sensor
```

---

### LEVEL 3: Event Normalization Layer

**Status:** ❌ 0% - Design Only (Ready to Build)

**Responsibility:** Transform raw events into unified StandardEvent format

```
┌─────────────────────────────────────────────────────────────────┐
│       UNIVERSAL EVENT NORMALIZER (StandardEvent Format)         │
│                    [Phase 2 Part 2 - To Build]                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Input: Raw events from ANY source                              │
│  ├─ Debezium CDC format ({op, before, after, source, ...})    │
│  ├─ S3 event format ({Records: [{s3: {...}}]})                │
│  ├─ File system inotify ({path, mask, stats})                  │
│  ├─ Custom webhook payload (user-defined shape)               │
│  ├─ REST API comparison ({old, new, changed_fields})          │
│  └─ IoT sensor readings (device-specific)                      │
│                                                                 │
│  Problem: Each source has different structure                  │
│  Solution: StandardEvent - universal contract                  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ StandardEvent: The Universal Contract                            │
│                                                                 │
│ export interface StandardEvent {                                │
│   // Metadata                                                   │
│   id: string;                        ← UUID, unique globally   │
│   timestamp: number;                 ← Unix milliseconds       │
│   sourceConnectorId: string;         ← Which connector         │
│   sourceType: string;                ← Type of sensor          │
│                                                                 │
│   // Entity being changed                                      │
│   entity: {                                                     │
│     type: string;                   ← "product"|"user"|"order" │
│     id: string | number;            ← Entity identifier        │
│     table?: string;                 ← DB table (if applicable) │
│     collection?: string;            ← Mongo (if applicable)    │
│     bucket?: string;                ← S3 (if applicable)       │
│   };                                                            │
│                                                                 │
│   // What happened                                              │
│   operation: 'CREATE'|'UPDATE'|'DELETE'|'READ'|'SYNC';        │
│                                                                 │
│   // The data                                                   │
│   before?: Record<string, any>;     ← Previous state           │
│   after?: Record<string, any>;      ← Current state            │
│   changes?: {                        ← Which fields changed     │
│     [fieldName: string]: {old, new}                             │
│   };                                                            │
│                                                                 │
│   // Additional context                                        │
│   context: {                                                    │
│     userId?: string;                ← Who triggered it         │
│     sessionId?: string;             ← Request tracking         │
│     ipAddress?: string;             ← Source IP               │
│     source?: string;                ← "SAP"|"API"|"Mobile"    │
│     [key: string]: any;             ← Custom per-sensor       │
│   };                                                            │
│                                                                 │
│   // Confidence & tagging                                      │
│   confidence?: number;              ← 0-1, how sure we are    │
│   tags?: string[];                  ← Keywords for filtering  │
│ }                                                               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Normalizers (One per Sensor Type):                              │
│                                                                 │
│ export interface EventNormalizer {                              │
│   normalize(rawEvent: any): StandardEvent;                      │
│   supports(sourceType: string): boolean;                        │
│ }                                                               │
│                                                                 │
│ Implementations:                                                │
│ ├─ KafkaCdcNormalizer                                           │
│ ├─ S3EventNormalizer                                            │
│ ├─ FileSystemNormalizer                                         │
│ ├─ WebhookEventNormalizer                                       │
│ ├─ PollingRestNormalizer                                        │
│ └─ Custom normalizers                                           │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Output: Normalized StandardEvent (always same format)          │
│ Now ready for LLM interpretation!                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**The Genius of StandardEvent:**

```
Sensor A emits: {op: 'U', before: {...}, after: {...}}
Sensor B emits: {action: 'update', oldData: {...}, newData: {...}}
Sensor C emits: {eventType: 'modify', prevState: {...}, state: {...}}

All normalize to:
StandardEvent {
  operation: 'UPDATE',
  before: {...},
  after: {...}
}

Now LLM always sees the same shape!
```

**Files to Create:**
- `src/events/standard-event.ts` (Type definition)
- `src/events/event-normalizer.interface.ts`
- `src/events/normalizers/`
  - `kafka-cdc.normalizer.ts`
  - `s3-event.normalizer.ts`
  - `filesystem.normalizer.ts`
  - `webhook.normalizer.ts`
  - `polling-rest.normalizer.ts`
- `src/events/normalizer.factory.ts`
- `src/events/normalizer-registry.service.ts`

---

### LEVEL 4: Intelligent Rule Engine (LLM-Powered)

**Status:** ❌ 0% - Design Only (Ready to Build)

**Responsibility:** Interpret business rules and match events intelligently

```
┌─────────────────────────────────────────────────────────────────┐
│    LLM-POWERED EVENT RULE MATCHER (Business Logic Interpreter)  │
│                    [Phase 2 Part 3 - To Build]                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ THE BREAKTHROUGH: Rules written in natural language!            │
│                                                                 │
│ Instead of:                    Use:                             │
│  {                              "Monitor all medical products   │
│    if: {                         that expire within 30 days.     │
│      table: "products",          AND if temperature monitoring   │
│      operation: "UPDATE",        indicates cold chain break.     │
│      column: "expiryDate",       Send notification if either     │
│      value: < 30days             condition is true."             │
│    }                                                             │
│  }                                                               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ EventRuleEntity (Stored in Database):                            │
│                                                                 │
│ @Entity('event_rules')                                           │
│ export class EventRuleEntity {                                   │
│   @PrimaryGeneratedColumn('uuid')                               │
│   id: string;                       ← Unique identifier         │
│                                                                 │
│   @Column({ type: 'uuid' })                                     │
│   userId: string;                   ← Multi-tenant isolation    │
│                                                                 │
│   @Column()                                                     │
│   name: string;                     ← "Monitor medical expiry"  │
│                                                                 │
│   @Column({ type: 'text' })                                     │
│   definition: string;               ← Natural language rule!    │
│                                                                 │
│   @Column({ type: 'simple-array' })                             │
│   sourceConnectors: string[];       ← Which connectors to listen│
│                                                                 │
│   @Column({ type: 'jsonb' })                                    │
│   llmConfig: {                                                  │
│     model: 'gpt-4' | 'claude' | 'local';                       │
│     temperature?: number;                                       │
│     systemPrompt?: string;                                      │
│     examples?: Array<{input, output}>;  ← Few-shot learning    │
│   };                                                            │
│                                                                 │
│   @Column({ type: 'text', array: true })                        │
│   actions: string[];                ← What to do when matched  │
│                                                                 │
│   @Column()                                                     │
│   isActive: boolean;                ← Enable/disable           │
│                                                                 │
│   @Column({ type: 'jsonb', nullable: true })                    │
│   lastInterpretation?: {                                        │
│     timestamp: Date;                                            │
│     interpretation: Record<string, any>;  ← Cached result      │
│     hash: string;                   ← Hash for cache key        │
│   };                                                            │
│                                                                 │
│   @Column({ type: 'timestamp', nullable: true })               │
│   lastTriggeredAt: Date;            ← For analytics            │
│                                                                 │
│   @CreateDateColumn()                                           │
│   createdAt: Date;                                              │
│                                                                 │
│   @UpdateDateColumn()                                           │
│   updatedAt: Date;                                              │
│ }                                                               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Matching Process (LLM Matcher Service):                          │
│                                                                 │
│ 1. Load all active EventRules from DB                           │
│ 2. For EACH rule:                                               │
│    a. Cache check (redis/memory)                                │
│    b. IF cached → return result                                 │
│    c. Build semantic prompt:                                    │
│       {                                                         │
│         rule: "Monitor medical products expiring < 30 days..."  │
│         event: StandardEvent { entity, operation, after, ... }  │
│         question: "Does this event match this rule?"            │
│       }                                                         │
│    d. Call LLM service:                                         │
│       model = rule.llmConfig.model                              │
│       temperature = rule.llmConfig.temperature                  │
│       systemPrompt = rule.llmConfig.systemPrompt                │
│       (with examples for few-shot learning)                     │
│    e. Parse JSON response:                                      │
│       {                                                         │
│         "matches": true,                                        │
│         "confidence": 0.92,                                     │
│         "reasoning": "Product 123 expires 2026-02-28...",      │
│         "extractedContext": {                                   │
│           "productId": 123,                                     │
│           "expiryDate": "2026-02-28",                           │
│           "daysUntilExpiry": 10,                                │
│           "severity": "high"                                    │
│         }                                                       │
│       }                                                         │
│    f. Cache result (60s TTL)                                    │
│    g. Log confidence + reasoning                                │
│                                                                 │
│ 3. Filter matches:                                              │
│    - Keep: confidence > threshold (default 0.7)                 │
│    - Discard: confidence < threshold                            │
│                                                                 │
│ 4. Return list of matching rules + contexts                     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Output: MatchResult for each active rule                        │
│ {                                                               │
│   matches: boolean,                                             │
│   confidence: number,                                           │
│   reasoning: string,                                            │
│   extractedContext: Record<string, any>                         │
│ }                                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**AI/LLM Strategy:**

```
System Prompt Template:
────────────────────────
"You are an intelligent business rule matcher. Given an event 
and a business rule (both in natural language), determine if 
the event matches the rule.

Consider:
- Data types and field values
- Temporal aspects (timestamps, durations)
- Business context
- Edge cases
- Null/missing values

Respond ONLY with valid JSON (no markdown, no explanation):
{
  \"matches\": boolean,
  \"confidence\": number (0-1),
  \"reasoning\": string,
  \"extractedContext\": {
    // Relevant fields for action execution
  }
}"

Example Few-Shot Learning:
──────────────────────────
Input:
  Rule: "Monitor products that expire within 30 days"
  Event: {
    entity: {type: 'product', id: 123},
    operation: 'UPDATE',
    after: {expiryDate: '2026-02-28', quantity: 50}
  }

Expected Output:
{
  "matches": true,
  "confidence": 0.95,
  "reasoning": "Product 123 expiration date 2026-02-28 is 10 days 
               from now, which is within the 30-day threshold.",
  "extractedContext": {
    "productId": 123,
    "expiryDate": "2026-02-28",
    "daysUntilExpiry": 10
  }
}
```

**Files to Create:**
- `src/event-rules/event-rule.entity.ts`
- `src/event-rules/event-rule.dto.ts`
- `src/event-rules/event-rule.types.ts`
- `src/event-rules/event-rules.service.ts` (CRUD)
- `src/event-rules/event-rules.controller.ts` (API)
- `src/event-rules/event-matcher/`
  - `llm-matcher.service.ts` (Core LLM logic)
  - `matcher-cache.service.ts` (Redis/memory cache)
  - `matcher.types.ts`
- `src/event-rules/event-rules.module.ts`

**API Endpoints:**
```
POST   /event-rules              Create rule
GET    /event-rules              List rules
GET    /event-rules/:id          Get rule
PUT    /event-rules/:id          Update rule
DELETE /event-rules/:id          Delete rule
GET    /event-rules/:id/status   Rule stats
```

---

### LEVEL 5: Mission Creation & Persistence

**Status:** ❌ 0% - Design Only (Ready to Build)

**Responsibility:** Create missions and store them in database

```
┌─────────────────────────────────────────────────────────────────┐
│        MISSION GENERATION & PERSISTENCE LAYER                   │
│                    [Phase 2 Part 4 - To Build]                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ When an event matches a rule (confidence > threshold):          │
│                                                                 │
│ MissionEntity (Database Persistence):                           │
│                                                                 │
│ @Entity('missions')                                             │
│ export class MissionEntity {                                    │
│   @PrimaryGeneratedColumn('uuid')                               │
│   id: string;                       ← Unique mission ID         │
│                                                                 │
│   @Column({ type: 'uuid' })                                     │
│   userId: string;                   ← Data isolation            │
│                                                                 │
│   @Column({ type: 'uuid' })                                     │
│   eventRuleId: string;              ← Which rule triggered     │
│                                                                 │
│   @Column({ type: 'uuid' })                                     │
│   eventId: string;                  ← Which event matched      │
│                                                                 │
│   @Column({ type: 'jsonb' })                                    │
│   sourceData: StandardEvent;        ← Full event context       │
│                                                                 │
│   @Column({ type: 'jsonb' })                                    │
│   extractedContext: Record<string, any>;  ← LLM-extracted data │
│   // {                                                          │
│   //   productId: 123,                                          │
│   //   expiryDate: "2026-02-28",                               │
│   //   daysUntilExpiry: 10,                                    │
│   //   severity: "high"                                        │
│   // }                                                          │
│                                                                 │
│   @Column({ type: 'text', array: true })                        │
│   actions: string[];                ← Actions to execute       │
│   // [                                                          │
│   //   "notify_warehouse_manager",                              │
│   //   "create_sap_return_form",                                │
│   //   "log_compliance_audit"                                   │
│   // ]                                                          │
│                                                                 │
│   @Column({ type: 'enum', enum: MissionStatus })               │
│   status: MissionStatus;            ← Current status           │
│                                                                 │
│   @Column({ type: 'uuid', nullable: true })                    │
│   targetNodeId?: string;            ← Which NexusNode executing│
│                                                                 │
│   @Column({ type: 'timestamp', nullable: true })               │
│   dispatchedAt?: Date;              ← When sent to node        │
│                                                                 │
│   @Column({ type: 'timestamp', nullable: true })               │
│   completedAt?: Date;               ← When execution finished  │
│                                                                 │
│   @Column({ type: 'jsonb', nullable: true })                   │
│   result?: {                        ← Execution proof          │
│     success: boolean;                                          │
│     screenshot?: string;  // base64                             │
│     logs?: string[];      // execution logs                      │
│     artifacts?: any[];    // Any output files                    │
│   };                                                            │
│                                                                 │
│   @Column({ type: 'text', nullable: true })                    │
│   error?: string;                   ← Error message if failed  │
│                                                                 │
│   @Column({ type: 'integer' })                                 │
│   priority: 0 | 1 | 2 | 3;         ← 0=critical, 3=low        │
│                                                                 │
│   @CreateDateColumn()                                           │
│   createdAt: Date;                                              │
│                                                                 │
│   @UpdateDateColumn()                                           │
│   updatedAt: Date;                                              │
│ }                                                               │
│                                                                 │
│ export enum MissionStatus {                                     │
│   PENDING = 'pending',         ← Created, waiting dispatch     │
│   DISPATCHED = 'dispatched',   ← Sent to NexusNode            │
│   EXECUTING = 'executing',     ← Node is running actions      │
│   COMPLETED = 'completed',     ← Success!                      │
│   FAILED = 'failed',           ← Error occurred               │
│   TIMEOUT = 'timeout',         ← Deadline passed              │
│   CANCELLED = 'cancelled'      ← User cancelled               │
│ }                                                               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ AuditLogEntity (Complete History):                              │
│                                                                 │
│ @Entity('audit_logs')                                           │
│ export class AuditLogEntity {                                   │
│   @PrimaryGeneratedColumn('uuid')                               │
│   id: string;                                                   │
│                                                                 │
│   @Column({ type: 'uuid' })                                     │
│   userId: string;                   ← Who triggered            │
│                                                                 │
│   @Column({ type: 'uuid' })                                     │
│   eventId: string;                  ← Which event              │
│                                                                 │
│   @Column({ type: 'uuid' })                                     │
│   ruleId: string;                   ← Which rule evaluated     │
│                                                                 │
│   @Column({ type: 'uuid' })                                     │
│   missionId: string;                ← Generated mission        │
│                                                                 │
│   @Column({ type: 'boolean' })                                 │
│   matched: boolean;                 ← Did rule match?          │
│                                                                 │
│   @Column({ type: 'float' })                                   │
│   matchConfidence: number;          ← LLM confidence (0-1)     │
│                                                                 │
│   @Column({ type: 'text' })                                    │
│   matchReasoning: string;           ← Why did it match?        │
│                                                                 │
│   @Column({ type: 'uuid' })                                    │
│   targetNodeId: string;             ← Which node executed      │
│                                                                 │
│   @Column({ type: 'boolean' })                                 │
│   executionSuccess: boolean;        ← Did it succeed?          │
│                                                                 │
│   @Column({ type: 'text', nullable: true })                    │
│   executionError?: string;          ← Error if failed          │
│                                                                 │
│   @Column({ type: 'integer' })                                 │
│   executionDurationMs: number;      ← How long did it take     │
│                                                                 │
│   @CreateDateColumn()                                           │
│   timestamp: Date;                  ← When it happened         │
│ }                                                               │
│                                                                 │
│ = Complete chain: Event → Rule → Match → Mission → Execution   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Output: Mission entities persisted in database                 │
│ Ready for dispatching to execution layer                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Files to Create:**
- `src/missions/mission.entity.ts`
- `src/missions/mission.types.ts`
- `src/missions/mission.dto.ts`
- `src/missions/missions.service.ts` (CRUD + queries)
- `src/missions/missions.controller.ts` (API)
- `src/missions/missions.module.ts`
- `src/audit-logs/audit-log.entity.ts`
- `src/audit-logs/audit-logs.service.ts`

**API Endpoints:**
```
GET    /missions                 List missions
GET    /missions/:id             Get mission details
GET    /missions?status=pending  Filter by status
POST   /missions/:id/cancel      Cancel mission
GET    /missions/:id/proof       Get execution proof
```

---

### LEVEL 6: Intelligent Dispatcher

**Status:** ❌ 0% - Design Only (Ready to Build)

**Responsibility:** Route missions to appropriate NexusNodes

```
┌─────────────────────────────────────────────────────────────────┐
│        MISSION DISPATCHER (Smart Routing)                       │
│                    [Phase 2 Part 5 - To Build]                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Input: MissionEntity with actions list                          │
│ {"actions": ["notify_user", "create_sap_form", "upload_s3"]}   │
│                                                                 │
│ Problem: Which NexusNode should execute this?                  │
│                                                                 │
│ Intelligent Decision Logic:                                     │
│                                                                 │
│ 1. Parse REQUIRED capabilities                                  │
│    ├─ notify_user → capability: "mobile_notification"          │
│    ├─ create_sap_form → capability: "ghost_control" + "sap"   │
│    └─ upload_s3 → capability: "cloud_api" + "s3"              │
│                                                                 │
│ 2. Query NexusNode Registry                                     │
│    ├─ Node A: {capabilities: [ghost_control, sap_integration]} │
│    ├─ Node B: {capabilities: [mobile_notification, s3_upload]} │
│    ├─ Node C: {capabilities: [email_smtp, slack_webhook]}      │
│    └─ Node D: {capabilities: [file_operations, blockchain]}    │
│                                                                 │
│ 3. Find intersection (nodes that can do ALL required tasks)    │
│    ├─ Found: Node B matches all requirements                   │
│                                                                 │
│ 4. Choose best node (if multiple match)                         │
│    Decision factors:                                            │
│    ├─ Current load / queue length                              │
│    ├─ Historical success rate                                  │
│    ├─ Geographic location (if relevant)                        │
│    ├─ Health status                                            │
│    └─ Latency from server                                      │
│                                                                 │
│ NexusNode Capability Model:                                     │
│                                                                 │
│ NodeEntity {                                                    │
│   id: UUID,                                                     │
│   name: string,                     ← "Office-SAP-Node"        │
│   location?: string,                ← Geographic region        │
│   status: 'online'|'offline'|'degraded',                       │
│   lastHeartbeat: Date,                                          │
│   capabilities: [                   ← What this node can do    │
│     'ghost_control',                                            │
│     'sap_integration',                                          │
│     'windows_automation',                                       │
│     'mobile_notification'                                       │
│   ],                                                            │
│   currentLoad: number,              ← Pending missions count   │
│   successRate: number,              ← 0-1, historical success  │
│   averageLatency: number,           ← ms, response time        │
│   maxConcurrent: number,            ← Parallel execution limit │
│ }                                                               │
│                                                                 │
│ 5. Update Mission entity                                        │
│    ├─ mission.status = 'DISPATCHED'                             │
│    ├─ mission.targetNodeId = 'node-b-uuid'                     │
│    ├─ mission.dispatchedAt = now()                              │
│    └─ mission → save to DB                                      │
│                                                                 │
│ 6. Send to NexusNode                                            │
│    Via: gRPC (fast) with WebSocket fallback                    │
│    Payload: Complete MissionProto with all context             │
│    Timeout: Set deadline based on mission priority             │
│    Retry: Exponential backoff (3 attempts)                     │
│                                                                 │
│ 7. Begin tracking                                               │
│    ├─ Start timeout timer                                       │
│    ├─ Listen for execution updates                              │
│    ├─ Handle heartbeat signals                                  │
│    └─ Deal with node failures                                   │
│                                                                 │
│ Output: Mission dispatched and tracked                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Files to Create:**
- `src/mission-dispatcher/mission-dispatcher.service.ts`
- `src/mission-dispatcher/nexus-node-registry.service.ts`
- `src/mission-dispatcher/capability-matcher.service.ts`
- `src/nexus-nodes/nexus-node.entity.ts`
- `src/nexus-nodes/nexus-nodes.service.ts`
- `src/nexus-nodes/nexus-nodes.controller.ts`

---

### LEVEL 7: Execution Layer (NexusNodes)

**Status:** ❌ 0% - Architecture Only (Phase 3 - To Build)

**Responsibility:** Execute missions and collect proof

```
┌─────────────────────────────────────────────────────────────────┐
│         NEXUS NODE NETWORK (Execution Agents)                   │
│                    [Phase 3 - To Build]                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Decentralized execution nodes (can run anywhere):               │
│                                                                 │
│ ├─ On-Premises Nodes                                            │
│ │  ├─ SAP Integration Node (RFC calls, dialog automation)       │
│ │  ├─ Mainframe Node (CICS, IMS, batch jobs)                   │
│ │  └─ Local Services Node (LAN resources)                      │
│ │                                                              │
│ ├─ Cloud Nodes                                                  │
│ │  ├─ Ghost Control Node (Windows RDP automation)              │
│ │  ├─ Production Automation Node (scripting, APIs)             │
│ │  └─ Data Processing Node (large file operations)             │
│ │                                                              │
│ ├─ Edge Nodes                                                   │
│ │  ├─ Mobile Node (Push notifications, device control)         │
│ │  ├─ IoT Node (Sensor readings, device interaction)           │
│ │  └─ Local Gateway Node (Edge processing)                     │
│ │                                                              │
│ └─ Embedded Nodes (Custom hardware)                             │
│    └─ Any device that implements NexusNode protocol            │
│                                                                 │
│ Per-Node Capabilities (What each node CAN do):                  │
│                                                                 │
│ Ghost Control:                                                  │
│ ├─ Open RDP session to Windows machine                          │
│ ├─ Automated mouse clicks, keyboard input                      │
│ ├─ Screenshot capture at each step                             │
│ ├─ SAP GUI navigation and validation                            │
│ └─ Application testing automation                              │
│                                                                 │
│ File Operations:                                                │
│ ├─ Local filesystem (create, read, write, delete)              │
│ ├─ NFS/SMB mounts                                               │
│ ├─ SFTP operations                                              │
│ ├─ S3 upload/download                                           │
│ ├─ Google Drive integration                                     │
│ └─ FTP/FTPS operations                                          │
│                                                                 │
│ Cloud APIs:                                                     │
│ ├─ AWS (S3, SQS, SNS, Lambda)                                  │
│ ├─ Azure (Blob, Queue, Functions)                              │
│ ├─ Google Cloud (Storage, Pub/Sub)                             │
│ └─ Custom HTTP requests                                        │
│                                                                 │
│ Communications:                                                 │
│ ├─ Slack messaging                                              │
│ ├─ Teams notifications                                          │
│ ├─ Email (SMTP)                                                 │
│ ├─ SMS (Twilio, Vonage)                                         │
│ ├─ WhatsApp Business API                                        │
│ └─ WebHook calls                                                │
│                                                                 │
│ IoT & Smart Devices:                                            │
│ ├─ MQTT publish/subscribe                                       │
│ ├─ CoAP operations                                              │
│ ├─ Zigbee/BLE control                                           │
│ └─ Custom IoT protocols                                         │
│                                                                 │
│ Data Operations:                                                │
│ ├─ Database queries (SQL)                                       │
│ ├─ Data transformation (Python/Node.js scripts)                │
│ ├─ ETL processes                                                │
│ └─ Real-time analytics                                         │
│                                                                 │
│ Custom Logic:                                                   │
│ ├─ Python script execution                                      │
│ ├─ Node.js scripts                                              │
│ ├─ Shell commands                                               │
│ └─ Custom binary execution                                      │
│                                                                 │
│ NexusNode Architecture:                                         │
│                                                                 │
│ nexus-node-core/                                                │
│ ├─ grpc-server.ts          (Listen for missions)               │
│ ├─ websocket-server.ts     (Fallback communication)            │
│ ├─ mission-executor.ts     (Run missions)                      │
│ ├─ proof-collector.ts      (Capture screenshots, logs)         │
│ ├─ heartbeat.ts            (Report health)                     │
│ │                                                              │
│ ├─ actions/                (What it can do)                    │
│ │  ├─ ghost-control/       (Windows automation)                │
│ │  ├─ file-operations/     (FS access)                         │
│ │  ├─ notifications/       (Slack, Teams, etc)                 │
│ │  ├─ cloud-apis/          (S3, Azure, etc)                    │
│ │  ├─ database/            (SQL queries)                       │
│ │  └─ custom-scripts/      (User scripts)                      │
│ │                                                              │
│ └─ proof/                  (Evidence collection)                │
│    ├─ screenshot.ts        (Windows + headless browsers)       │
│    ├─ video-recorder.ts    (Optional: record actions)          │
│    └─ log-stream.ts        (Collect stdout/stderr)             │
│                                                                 │
│ Execution Protocol:                                             │
│                                                                 │
│ 1. Receive Mission via gRPC                                    │
│    {                                                            │
│      id: "mission-xyz",                                         │
│      actions: ["create_sap_form", "send_notification"],        │
│      extractedContext: {productId: 123, ...},                  │
│      deadline: 1708372800000                                    │
│    }                                                            │
│                                                                 │
│ 2. Parse actions and execute sequentially (or parallel)        │
│    - Authorization check                                       │
│    - Resource allocation                                       │
│    - Stream updates: START → IN_PROGRESS → STEP_1 → STEP_2... │
│                                                                 │
│ 3. Collect proof at each step                                  │
│    - Screenshot before/after                                   │
│    - Input parameters                                          │
│    - Output results                                            │
│    - Timestamps                                                │
│    - User confirmations (if needed)                            │
│                                                                 │
│ 4. Handle failures                                              │
│    - Retry logic                                                │
│    - Partial success                                            │
│    - Graceful degradation                                       │
│    - Error escalation                                           │
│                                                                 │
│ 5. Send final ExecutionProof back                              │
│    {                                                            │
│      missionId: "mission-xyz",                                 │
│      status: "COMPLETED",                                      │
│      success: true,                                             │
│      actions: [                                                 │
│        {                                                        │
│          name: "create_sap_form",                              │
│          success: true,                                         │
│          screenshot: "base64-image-data",                      │
│          logs: ["Form opened", "Data filled", "Submitted"],    │
│          result: {formNumber: "PO-123456"}                     │
│        }                                                        │
│      ],                                                         │
│      totalDuration: 45000,  // ms                              │
│      completedAt: 1708372845000                                │
│    }                                                            │
│                                                                 │
│ Output: ExecutionProof with complete history                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**NexusNode Communication Protocol:**

```
gRPC (Recommended):
├─ Fast (protobuf serialization)
├─ Bidirectional streams (real-time updates)
├─ Connection pooling
└─ Automatic reconnection

WebSocket (Fallback):
├─ Works through firewalls
├─ JSON payload
├─ Automatic heartbeat
└─ Browser-compatible
```

**Files to Create (Phase 3):**
- Complete NexusNode implementation (separate repo or service)
- gRPC proto definitions
- Action handlers for each capability
- Proof collection system
- Error handling and retry logic

---

### LEVEL 8: Audit & Reporting Layer

**Status:** ✅ 50% - Schema defined (Ready for Report Generation)

**Responsibility:** Create audit trail and generate reports

```
┌─────────────────────────────────────────────────────────────────┐
│      AUDIT TRAIL & REPORT ENGINE                               │
│                    [Phase 4 - To Build]                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Complete History Captured:                                      │
│                                                                 │
│ Timeline from AuditLogEntity:                                   │
│                                                                 │
│ T0: Event detected from connector                              │
│     └─ timestamp, source, raw data                             │
│                                                                 │
│ T1: Rule evaluated by LLM                                      │
│     ├─ rule ID questioned                                      │
│     ├─ LLM result (matches, confidence, reasoning)             │
│     └─ extracted context                                       │
│                                                                 │
│ T2: Mission created                                             │
│     ├─ mission ID assigned                                     │
│     ├─ actions list compiled                                   │
│     └─ stored in database                                      │
│                                                                 │
│ T3: Dispatch decision                                           │
│     ├─ node selected (with reasoning)                          │
│     ├─ capability matching                                     │
│     └─ sent to NexusNode                                        │
│                                                                 │
│ T4: Execution trace                                             │
│     ├─ every action attempted                                  │
│     ├─ screenshots captured                                    │
│     ├─ timing measurements                                     │
│     └─ success/failure recorded                                │
│                                                                 │
│ T5: Final result                                                │
│     ├─ success/fail determination                              │
│     ├─ artifacts collected                                     │
│     ├─ compliance logged                                       │
│     └─ manual approval (if needed)                             │
│                                                                 │
│ Report Generation (Report Engine Service):                      │
│                                                                 │
│ 1. Query AuditLog entities                                      │
│    WHERE eventId = ? AND missionId = ?                         │
│                                                                 │
│ 2. Synthesize narrative (using LLM: "What happened?")          │
│    Input: Raw audit entries                                    │
│    LLM: "Summarize this workflow in business terms"            │
│    Output: Natural language summary                            │
│                                                                 │
│ 3. Structure report data                                        │
│    {                                                            │
│      title: "Inventory Update Report",                         │
│      timestamp: "2026-02-18 14:32:00 UTC",                    │
│      summary: "Product PO-123 expiration updated...",          │
│      timeline: [                                                │
│        {time, action, status, proof}                           │
│      ],                                                         │
│      artifacts: [                                               │
│        {type: 'screenshot', data: base64, timestamp}           │
│      ],                                                         │
│      compliance: {                                              │
│        rule_complied: true,                                    │
│        audit_trail_complete: true,                             │
│        approval_chain: "auto → manager_confirmed"              │
│      }                                                          │
│    }                                                            │
│                                                                 │
│ 4. Render with Typst template                                   │
│    Template: typst/mission-report.typst                        │
│    - Company logo                                               │
│    - Title & timestamp                                          │
│    - Executive summary                                          │
│    - Detailed timeline                                          │
│    - Screenshots (annotated)                                    │
│    - Compliance attestation                                     │
│    - Digital signature                                          │
│                                                                 │
│ 5. Generate PDF                                                 │
│    Tool: Typst CLI → PDF                                       │
│    Output: production-ready PDF                                │
│                                                                 │
│ 6. Archive & sign                                               │
│    - Store PDF in database (encrypted)                         │
│    - Generate SHA256 hash                                      │
│    - Sign with organization key                                │
│    - Store in compliance archive                               │
│                                                                 │
│ Output: Audit-ready PDF report                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Report Accessibility:**

```
GET    /reports/:missionId            Get PDF for mission
GET    /reports?dateRange=...         Search reports
GET    /reports/export?format=csv     Export audit log
GET    /audit-log/:eventId            Raw audit trail
```

**Files to Create:**
- `src/reports/report.service.ts` (Generation logic)
- `src/reports/report.types.ts`
- `src/reports/reports.controller.ts`
- `templates/mission-report.typst` (Report template)
- `src/reports/compliance-archive.service.ts`

---

### LEVEL 9: User Interface Layer

**Status:** ❌ 0% - Architecture Only (Phase 5 - To Build)

**Responsibility:** User interaction and visibility

```
┌─────────────────────────────────────────────────────────────────┐
│      INTERACTION LAYER (Conversation + Dashboard)               │
│                    [Phase 5 - To Build]                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ CONVERSATION INTERFACE                                          │
│                                                                 │
│ User: "Monitor all medical products that expire within 30 days"│
│ System:                                                          │
│   1. Parse intent: "create_surveillance_rule"                  │
│   2. Extract entities:                                          │
│      - object: "medical products"                              │
│      - condition: "expire within 30 days"                      │
│   3. Generate EventRule:                                        │
│      name: "Monitor medical products expiry (30 days)"         │
│      sourceConnectors: [postgres-inventory-connector]          │
│      definition: "Monitor all products in product table        │
│                   where expiry_date < current_date + 30 days"  │
│      actions: ["notify_inventory_manager"]                     │
│   4. Show confirmation:                                         │
│      "I will monitor medical products and notify when they're  │
│       expiring within 30 days. Is this correct?"                │
│   5. User confirms / refines                                    │
│   6. System creates rule in DB and activates                   │
│                                                                 │
│ DASHBOARD INTERFACE                                             │
│                                                                 │
│ Components:                                                     │
│ ├─ Active Rules Panel                                           │
│ │  └─ List all active rules with:                             │
│ │     - Rule name                                              │
│ │     - Last triggered time                                    │
│ │     - Total triggers (stat)                                  │
│ │     - Enable/disable toggle                                  │
│ │     - Edit rule (quick edit)                                 │
│ │                                                              │
│ ├─ Recent Missions Panel                                        │
│ │  └─ List recent missions:                                   │
│ │     - Mission ID                                             │
│ │     - Status (pending/executing/completed/failed)            │
│ │     - Source event                                           │
│ │     - Target node                                            │
│ │     - Timeline (when created → dispatched → completed)      │
│ │     - Download proof/report button                           │
│ │                                                              │
│ ├─ Event Sources Panel                                          │
│ │  └─ Active sensors:                                          │
│ │     - Sensor name                                            │
│ │     - Status (healthy/degraded/unhealthy)                   │
│ │     - Events/min (throughput)                                │
│ │     - Last event received                                    │
│ │     - Error rate                                             │
│ │                                                              │
│ ├─ NexusNode Status Panel                                       │
│ │  └─ Registered nodes:                                        │
│ │     - Node name + location                                   │
│ │     - Status (online/offline/degraded)                      │
│ │     - Capabilities (tags)                                    │
│ │     - Current load (queue)                                   │
│ │     - Average response time                                  │
│ │     - Success rate (%)                                       │
│ │                                                              │
│ ├─ Audit Reports Panel                                          │
│ │  └─ Searchable history:                                      │
│ │     - Date range filter                                      │
│ │     - User filter                                            │
│ │     - Rule filter                                            │
│ │     - Status filter                                          │
│ │     - View → Download PDF                                    │
│ │                                                              │
│ └─ Analytics Panel                                              │
│    └─ Metrics:                                                  │
│       - Total rules created                                    │
│       - Events processed (7d, 30d, all-time)                   │
│       - Mission success rate (%)                               │
│       - Top triggered rules                                    │
│       - Average execution time                                 │
│       - NexusNode utilization                                  │
│                                                                 │
│ Output: User control + visibility                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Tech Stack (Proposed):**
- React/Vue for frontend
- Real-time updates (WebSocket)
- Drag-and-drop rule builder
- Timeline visualization
- Report viewer (PDF.js)

**Files to Create (Phase 5):**
- React components
- API client
- State management
- Real-time event streaming UI

---

## Data Flows

### Flow 0A: Direct Execution (Mode 2 - Execute Immediately)

```
🎯 USER WANTS TO DO SOMETHING NOW

1️⃣ CHATBOT INTERFACE
   User: "Create backup of database now"
   OR: "Check all medical products & create return forms"
   
   User selects:
   ├─ Data Source(s): PostgreSQL connector
   └─ Execution Target(s): Database Node, SAP Node

2️⃣ TASK COMPILATION - INTENT PARSING
   TaskCompilerService.parse()
   LLM analyzes user request:
   {
     intent: "extract_and_perform_actions",
     source_entity: "products",
     extraction_criteria: {
       field: "expiry_date",
       operator: "<=",
       value: "CURRENT_DATE + 30 days"
     },
     foreach_actions: [
       "create_sap_return_form",
       "send_warehouse_notification",
       "log_to_compliance_audit"
     ]
   }

3️⃣ QUERY GENERATION
   FOR PostgreSQL connector:
   SELECT * FROM products 
   WHERE expiry_date <= CURRENT_DATE + INTERVAL '30 days'
   AND status = 'active'
   AND user_id = '{userId}'

4️⃣ EXECUTE QUERY ON CONNECTOR
   PostgreSQL returns 5 products:
   ├─ Product 123: Medical Kit X, expires 2026-02-28 (10 days)
   ├─ Product 456: Bandage Pack, expires 2026-02-26 (8 days)
   ├─ Product 789: Syringes, expires 2026-03-10 (20 days)
   ├─ Product 101: Masks, expires 2026-03-01 (11 days)
   └─ Product 112: Gloves, expires 2026-02-20 (2 days)

5️⃣ CREATE ARTIFICIAL EVENTS
   For EACH product, create StandardEvent:
   
   Event 1 (Product 123):
   {
     id: 'evt-task-123-1',
     timestamp: now(),
     sourceConnectorId: 'postgres-inventory-uuid',
     operation: 'EXTRACT',
     entity: {type: 'product', id: 123},
     after: {id: 123, name: 'Medical Kit X', expiry_date: '2026-02-28'},
     extractedContext: {
       productId: 123,
       productName: 'Medical Kit X',
       expiryDate: '2026-02-28',
       daysUntilExpiry: 10
     }
   }
   
   ... (similar for products 456, 789, 101, 112)

6️⃣ GENERATE ACTIONS FOR EACH EVENT
   For Event 1 (Product 123):
   
   ActionSet 1.1: create_sap_return_form
   ├─ Input: {productId: 123, expiryDate: '2026-02-28'}
   ├─ LLM Model: "gpt-4" (for semantic understanding)
   ├─ Target Node: SAP Integration Node ✓ (User selected)
   └─ Context: "Product 123 expiring - create return"
   
   ActionSet 1.2: send_warehouse_notification
   ├─ Input: {productId: 123, managerId: 'mgr-001'}
   ├─ LLM Model: "gpt-4" (for personalized messaging)
   ├─ Target Node: Notification Hub Node ✓ (User selected)
   └─ Context: "Notify manager about expiring product"
   
   ActionSet 1.3: log_to_compliance_audit
   ├─ Input: {taskId, action, result, timestamp}
   ├─ LLM Model: "local" (deterministic)
   ├─ Target Node: Database Node (auto-assigned)
   └─ Context: "Compliance trail"

7️⃣ CREATE GLOBAL TASK ENTITY
   GlobalTask:
   {
     id: 'task-abc-123',
     userId: 'user-xyz',
     description: 'Monitor medical products...',
     status: 'PENDING',
     
     selectedConnectors: ['postgres-inventory-uuid'],
     selectedNodes: ['sap-node-uuid', 'notif-node-uuid'],
     
     generatedEventIds: [
       'evt-task-123-1', 'evt-task-123-2', ... (5 total)
     ],
     
     generatedMissionIds: [
       'mission-task-123-1-action1',  ← Product 123, Action 1
       'mission-task-123-1-action2',  ← Product 123, Action 2
       'mission-task-123-1-action3',  ← Product 123, Action 3
       'mission-task-123-2-action1',  ← Product 456, Action 1
       ... (5 products × 3 actions = 15 missions total)
     ]
   }

8️⃣ GENERATE MISSIONS
   Create MissionEntity for EACH action:
   
   Mission 1: Product 123, Create SAP Form
   {
     id: 'mission-task-123-1-action1',
     globalTaskId: 'task-abc-123',
     eventId: 'evt-task-123-1',
     actions: ['create_sap_return_form'],
     extractedContext: {
       productId: 123, expiryDate: '2026-02-28'
     },
     targetNodeId: 'sap-node-uuid',
     llmConfig: {model: 'gpt-4', temperature: 0.3},
     status: 'PENDING'
   }
   
   Mission 2: Product 123, Send Notification
   {
     id: 'mission-task-123-1-action2',
     globalTaskId: 'task-abc-123',
     eventId: 'evt-task-123-1',
     actions: ['send_warehouse_notification'],
     extractedContext: {...},
     targetNodeId: 'notif-node-uuid',
     llmConfig: {model: 'gpt-4', temperature: 0.5},
     status: 'PENDING'
   }
   
   ... (repeat for all 15 combinations)

9️⃣ SHOW USER PREVIEW
   API Response to frontend:
   {
     result: 'success',
     globalTask: {
       id: 'task-abc-123',
       summary: "5 products found, 15 actions will be executed"
     },
     preview: [
       {
         product: 123,
         productName: 'Medical Kit X',
         daysToExpiry: 10,
         actions: [
           'Create SAP return form',
           'Send notification to manager',
           'Log compliance audit'
         ],
         targetNodes: ['SAP Node', 'Notification Node']
       },
       ... (for each product)
     ],
     estimatedTime: "2-3 minutes",
     readyToExecute: true
   }

🔴 USER CONFIRMS & EXECUTES

🔟 TRIGGER EXECUTION
   User clicks: "Execute Task"
   
   GlobalTask.status = 'EXECUTING'
   GlobalTask.startedAt = now()
   
   Dispatch all 15 missions in parallel (or batched):

1️⃣1️⃣ PARALLEL EXECUTION ON NODES
   
   SAP Node receives missions 1, 6, 11 (create SAP forms):
   ├─ Mission 1: Product 123 → SAP GUI → Form PO-2026-999 ✓
   ├─ Mission 6: Product 456 → SAP GUI → Form PO-2026-1000 ✓
   └─ Mission 11: Product 789 → SAP GUI → Form PO-2026-1001 ✓
   
   Notification Node receives missions 2, 7, 12 (notifications):
   ├─ Mission 2: Send to manager (Product 123) ✓
   ├─ Mission 7: Send to manager (Product 456) ✓
   └─ Mission 12: Send to manager (Product 789) ✓
   
   ... (payload for other products)

1️⃣2️⃣ STREAM PROGRESS UPDATES
   WebSocket to frontend:
   {
     taskId: 'task-abc-123',
     progress: {
       total: 15,
       completed: 8,
       failed: 0,
       inProgress: 7
     },
     updates: [
       {mission: 1, status: 'COMPLETED', result: 'PO-2026-999'},
       {mission: 2, status: 'COMPLETED', message: 'Notified'},
       ...
     ]
   }

1️⃣3️⃣ COLLECT EXECUTION PROOFS
   From each NexusNode:
   ├─ Screenshots (SAP form creation)
   ├─ Timestamps
   ├─ Action logs
   └─ Result artifacts

1️⃣4️⃣ AUDIT TRAIL LOGGING
   For EACH mission completion:
   AuditLog {
     globalTaskId: 'task-abc-123',
     missionId: 'mission-task-123-1-action1',
     eventId: 'evt-task-123-1',
     action: 'create_sap_return_form',
     nodeId: 'sap-node-uuid',
     success: true,
     result: {formNumber: 'PO-2026-999'},
     duration: 2500,  // ms
     timestamp: now()
   }

1️⃣5️⃣ TASK COMPLETION
   GlobalTask.status = 'COMPLETED'
   GlobalTask.completedAt = now()
   GlobalTask.summary = {
     eventsProcessed: 5,
     missionsCreated: 15,
     missionsSucceeded: 15,
     missionsFailed: 0,
     totalTime: 142000  // ms
   }

1️⃣6️⃣ GENERATE COMPREHENSIVE REPORT
   ReportService:
   ├─ Query all AuditLogs for task
   ├─ LLM: "Summarize what happened"
   ├─ Render with Typst template
   ├─ Include screenshots
   ├─ Sign archive
   └─ Generate PDF
   
   Report: "Task Summary - Medical Product Expiry Management"
   ├─ 5 products found expiring within 30 days
   ├─ 5 SAP return forms created
   ├─ 5 warehouse managers notified
   ├─ 15 audit entries logged
   ├─ Total duration: 2min 22sec
   └─ Status: SUCCESS ✅

1️⃣7️⃣ DELIVER RESULTS TO USER
   API: GET /tasks/task-abc-123/report
   
   User receives:
   ├─ PDF report (downloadable)
   ├─ Summary dashboard (web)
   ├─ Real-time progress (WebSocket feed)
   └─ Detailed audit trail (searchable)
   
   "All tasks completed successfully! 
    5 products processed, 5 SAP forms created, 5 managers notified.
    Download full report or view audit trail."

```

---

### Flow 0B: Continuous Monitoring (Mode 3 - Surveillance Rules)

```
👁️ USER WANTS TO SET UP AUTOMATIC MONITORING

1️⃣ CHATBOT INTERFACE
   User: "Monitor heart rate sensor. If beats per minute > 120,
           alert doctor and log to compliance system."
   
   User selects:
   ├─ Data Source: Heart Rate IoT Sensor (MQTT connector)
   └─ Execution Targets: Notification Node, Database Node

2️⃣ TASK COMPILATION - PARSE SURVEILLANCE INTENT
   TaskCompilerService.parse()
   LLM analyzes request and detects it's a monitoring rule:
   {
     taskType: "MONITORING",
     intent: "continuous_surveillance",
     source_entity: "heart_rate_readings",
     extraction_criteria: null,  ← No extraction, just monitor
     condition: {
       field: "bpm",
       operator: ">",
       threshold: 120
     },
     trigger_actions: [
       "alert_doctor",
       "log_compliance"
     ]
   }

3️⃣ CREATE GLOBAL TASK (TYPE=MONITORING)
   GlobalTask {
     id: 'task-heart-monitor-xyz',
     userId: 'user-123',
     type: 'MONITORING',  ← ⭐ IMPORTANT: Surveillance, not direct
     description: 'Monitor heart rate sensor...',
     status: 'PENDING',
     
     selectedConnectors: ['mqtt-heart-rate-uuid'],
     selectedNodes: ['notification-node-uuid', 'db-node-uuid'],
     
     parsedIntent: {
       intent: 'continuous_surveillance',
       condition: {field: 'bpm', operator: '>', value: 120}
     },
     
     generatedQuery: null,  ← No query for monitoring
     generatedEventIds: [],  ← No artificial events yet
     generatedMissionIds: []  ← Missions created on each condition match
   }

4️⃣ SHOW USER PREVIEW
   API Response to frontend:
   {
     result: 'success',
     globalTask: {
       id: 'task-heart-monitor-xyz',
       type: 'MONITORING',
       summary: "Surveillance rule ready to activate"
     },
     preview: {
       description: "Monitor heart rate sensor continuously",
       condition: "IF bpm > 120 THEN",
       actions: [
         'Send alert to doctor',
         'Log to compliance system'
       ],
       dataSource: "Heart Rate Sensor (MQTT)",
       targetNodes: ['Notification Node', 'Database Node'],
       estimatedLatency: "< 1 second from detection to action"
     },
     readyToExecute: true
   }

🔵 USER CONFIRMS & ACTIVATES

5️⃣ USER CLICKS "ACTIVATE SURVEILLANCE"
   API: POST /tasks/task-heart-monitor-xyz/execute
   
   GlobalTask.status = 'ACTIVE'
   GlobalTask.startedAt = now()
   
   System does:
   ├─ Create EventRuleEntity based on condition
   ├─ Activate sensor listeners
   ├─ Link rule to task for tracking
   └─ Begin continuous monitoring

6️⃣ SYSTEM MONITORS IN REAL-TIME
   
   Heart Rate Sensor emits readings:
   Reading 1: {timestamp: T1, bpm: 95, reading_id: 'r1'}
     └─ Check condition: 95 > 120? NO → Skip
   
   Reading 2: {timestamp: T2, bpm: 118, reading_id: 'r2'}
     └─ Check condition: 118 > 120? NO → Skip
   
   Reading 3: {timestamp: T3, bpm: 125, reading_id: 'r3'}
     └─ Check condition: 125 > 120? YES → ⚠️ CONDITION MET!
     
     Create StandardEvent:
     {
       id: 'evt-heart-alert-r3',
       timestamp: T3,
       sourceConnectorId: 'mqtt-heart-rate-uuid',
       operation: 'CONDITION_MET',
       entity: {type: 'heart_rate_reading', id: 'r3'},
       after: {timestamp: T3, bpm: 125},
       extractedContext: {
         currentBPM: 125,
         threshold: 120,
         deviation: '+5 BPM above threshold',
         severity: 'elevated'
       }
     }

7️⃣ CREATE MISSIONS FROM RULE
   For this ONE event, generate missions:
   
   Mission 1: Alert Doctor
   {
     id: 'mission-alert-doctor-r3',
     globalTaskId: 'task-heart-monitor-xyz',
     eventId: 'evt-heart-alert-r3',
     actions: ['alert_doctor'],
     extractedContext: {currentBPM: 125, threshold: 120},
     targetNodeId: 'notification-node-uuid',
     llmConfig: {model: 'gpt-4', temperature: 0.3},
     status: 'PENDING'
   }
   
   Mission 2: Log Compliance
   {
     id: 'mission-log-compliance-r3',
     globalTaskId: 'task-heart-monitor-xyz',
     eventId: 'evt-heart-alert-r3',
     actions: ['log_compliance'],
     targetNodeId: 'db-node-uuid',
     llmConfig: {model: 'local'},
     status: 'PENDING'
   }

8️⃣ DISPATCH & EXECUTE
   Notification Node:
   └─ Send alert to doctor: "Patient's heart rate elevated to 125 BPM"
   
   Database Node:
   └─ Log compliance record: {alert_type: 'elevated_bpm', bpm: 125, timestamp}

9️⃣ AUDIT & LOG
   AuditLog entry created:
   {
     globalTaskId: 'task-heart-monitor-xyz',
     eventId: 'evt-heart-alert-r3',
     missionId: 'mission-alert-doctor-r3',
     triggered: true,
     timestamp: T3,
     condition: 'bpm > 120',
     conditionMet: 'bpm=125'
   }

🔟 CONTINUE MONITORING
   System keeps monitoring, waiting for next condition:
   
   Reading 4: {timestamp: T4, bpm: 118, reading_id: 'r4'}
     └─ Check condition: 118 > 120? NO → Continue monitoring
   
   Reading 5: {timestamp: T5, bpm: 160, reading_id: 'r5'}
     └─ Check condition: 160 > 120? YES → ⚠️ CONDITION MET AGAIN!
     └─ Create new missions + execute
     └─ Log another audit entry
   
   ... (keeps running indefinitely until user stops it)

1️⃣1️⃣ USER VIEWS MONITORING DASHBOARD
   API: GET /tasks/task-heart-monitor-xyz
   
   Response: {
     task: {
       id: 'task-heart-monitor-xyz',
       type: 'MONITORING',
       status: 'ACTIVE',
       
       stats: {
         timeActive: '2 hours 15 minutes',
         totalReadingsProcessed: 1847,
         conditionMatches: 12,
         actionsTriggered: 24  ← (2 actions × 12 matches)
       },
       
       recentTriggers: [
         {timestamp: '14:32:15', bpm: 125, actions: ['alert', 'log']},
         {timestamp: '14:28:42', bpm: 135, actions: ['alert', 'log']},
         {timestamp: '14:22:03', bpm: 128, actions: ['alert', 'log']},
         ... (historical)
       ]
     }
   }

1️⃣2️⃣ USER CAN STOP MONITORING
   API: POST /tasks/task-heart-monitor-xyz/stop
   
   GlobalTask.status = 'STOPPED'
   GlobalTask.completedAt = now()
   EventRule deactivated
   Sensor listeners removed
   
   Final Report Generated:
   "Heart Rate Surveillance Report"
   ├─ Monitoring duration: 2h 15min
   ├─ Total readings processed: 1847
   ├─ Condition triggered: 12 times
   ├─ Doctor alerted: 12 times
   ├─ Compliance entries logged: 12
   └─ Average response time: 250ms

```

---

### Flow 1: Event-Driven Mode (Real Events from Continuous Sources)

```
This is the traditional reactive mode where:
- Real events occur continuously from sources
- Rules are evaluated automatically
- Actions execute when conditions match
- No user initiation needed

Example: Traditional EventRules active in background
```

---

### Flow 2: Complete Event Lifecycle (Event-Driven Details)
````

```
1️⃣ DETECTION
   PostgreSQL products table:
   UPDATE products SET expiryDate = '2026-02-28' WHERE id = 123

2️⃣ CDC CAPTURE
   Debezium → Kafka
   Topic: cdc.postgresql.inventory.products
   Payload: {
     op: 'U',
     before: {id: 123, expiryDate: '2026-03-15', ...},
     after: {id: 123, expiryDate: '2026-02-28', ...},
     ts_ms: 1708358400000,
     source: {table: 'products', schema: 'inventory', ...}
   }

3️⃣ SENSOR LISTENING
   KafkaCdcSensor.on('data', callback)
   Receives raw Debezium event

4️⃣ NORMALIZATION
   KafkaCdcNormalizer.normalize(debeziumEvent)
   ↓
   StandardEvent {
     id: 'evt-xyz-123',
     timestamp: 1708358400000,
     sourceConnectorId: 'kafka-cdc-conn-1',
     sourceType: 'kafka_cdc',
     
     entity: {
       type: 'database_record',
       id: 'lsn-12345',
       table: 'products',
       schema: 'inventory'
     },
     
     operation: 'UPDATE',
     before: {id: 123, expiryDate: '2026-03-15', name: 'Medical Kit X'},
     after: {id: 123, expiryDate: '2026-02-28', name: 'Medical Kit X'},
     
     changes: {
       expiryDate: {old: '2026-03-15', new: '2026-02-28'}
     },
     
     context: {
       database: 'inventory',
       schema: 'public',
       transactionId: 'txn-456',
       sourceConnectorId: 'kafka-cdc-conn-1'
     },
     
     confidence: 0.95,
     tags: ['database', 'products', 'inventory']
   }

5️⃣ DEDUPLICATION
   EventDeduplicator checks if seen before
   Key: 'products-txn-456-lsn-12345'
   ✓ New event, proceed

6️⃣ LLM RULE MATCHING
   Load all EventRules for userId
   ├─ Rule 1: "Monitor products that expire within 30 days"
   ├─ Rule 2: "Alert on stock below minimum"
   └─ Rule 3: "Track temperature sensor anomalies"
   
   For Rule 1: Call LLM
   Prompt: {
     rule: "Monitor products that expire within 30 days",
     event: StandardEvent {...},
     question: "Does event match rule?"
   }
   
   LLM Response:
   {
     matches: true,
     confidence: 0.92,
     reasoning: "Product 123 expiration changed from 2026-03-15 
                 (17 days) to 2026-02-28 (10 days). Both dates 
                 are within 30-day threshold. Rule matches.",
     extractedContext: {
       productId: 123,
       newExpiryDate: '2026-02-28',
       daysUntilExpiry: 10,
       severity: 'high'
     }
   }
   
   Cache result for 60s

7️⃣ MISSION CREATION
   Create MissionEntity:
   {
     id: 'mission-abc-789',
     userId: 'warehouse-mgr-uuid',
     eventRuleId: 'rule-1-uuid',
     eventId: 'evt-xyz-123',
     sourceData: StandardEvent {...},
     extractedContext: {
       productId: 123,
       newExpiryDate: '2026-02-28',
       daysUntilExpiry: 10,
       severity: 'high'
     },
     actions: [
       'notify_warehouse_manager',
       'create_sap_return_form',
       'log_compliance_audit'
     ],
     status: 'PENDING',
     priority: 1,  // high
     createdAt: now()
   }
   Save to DB

8️⃣ INTELLIGENT DISPATCH
   MissionDispatcher.dispatch(mission)
   
   Analyze required capabilities:
   ├─ notify_warehouse_manager → mobile_notification
   ├─ create_sap_return_form → ghost_control + sap_integration
   └─ log_compliance_audit → database_write
   
   Query NexusNode registry:
   ├─ Node A: [ghost_control, sap_integration] ← MATCH!
   ├─ Node B: [mobile_notification, s3_upload]
   └─ Node C: [email_smtp, slack_webhook]
   
   Select Node A (all capabilities present)
   
   Update mission:
   └─ mission.targetNodeId = 'node-a-uuid'
   └─ mission.status = 'DISPATCHED'
   └─ mission.dispatchedAt = now()
   Save to DB

9️⃣ GRPC TRANSMISSION
   Send via gRPC to Node A:
   MissionProto {
     id: 'mission-abc-789',
     actions: ['notify...', 'create_sap_form...', 'log...'],
     extractedContext: {...},
     deadline: timestamp
   }

🔟 NODE EXECUTION
   NexusNode A receives mission
   
   Action 1: notify_warehouse_manager
   ├─ Connect to mobile notification service
   ├─ Send push: "Medical Kit X expiring in 10 days"
   ├─ Capture proof (timestamp, delivery status)
   ✓ Success
   
   Action 2: create_sap_return_form
   ├─ Open RDP to SAP workstation
   ├─ Navigate to MM02 transaction
   ├─ Enter product details (123)
   ├─ Create return form
   ├─ Capture screenshot
   ├─ Validate form number: PO-2026-999
   ✓ Success
   
   Action 3: log_compliance_audit
   ├─ Connect to PostgreSQL
   ├─ INSERT into compliance_log
   ├─ Data: mission_id, action, timestamp, success
   ✓ Success
   
   Send ExecutionProof back:
   {
     missionId: 'mission-abc-789',
     status: 'COMPLETED',
     success: true,
     actions: [
       {
         name: 'notify_warehouse_manager',
         success: true,
         result: {deliveryStatus: 'sent'}
       },
       {
         name: 'create_sap_return_form',
         success: true,
         screenshot: 'base64-image',
         result: {formNumber: 'PO-2026-999'}
       },
       {
         name: 'log_compliance_audit',
         success: true,
         result: {recordId: 'audit-12345'}
       }
     ],
     totalDuration: 45000,
     completedAt: timestamp
   }

1️⃣1️⃣ AUDIT LOGGING
   Create AuditLogEntity:
   {
     eventId: 'evt-xyz-123',
     ruleId: 'rule-1-uuid',
     missionId: 'mission-abc-789',
     matched: true,
     matchConfidence: 0.92,
     matchReasoning: "Product 123 expiration within 30-day...",
     targetNodeId: 'node-a-uuid',
     executionSuccess: true,
     executionDurationMs: 45000,
     timestamp: new Date()
   }
   Save to DB

1️⃣2️⃣ REPORT GENERATION
   User requests: GET /reports/mission-abc-789
   
   ReportService:
   ├─ Query AuditLog for mission-abc-789
   ├─ Call LLM: "Summarize what happened in business terms"
   ├─ Build report data structure
   ├─ Render Typst template
   ├─ Generate PDF
   ├─ Save to archive (encrypted)
   └─ Return PDF download link
   
   Report contents:
   ├─ Title: "Inventory Update Report"
   ├─ Summary: "Medical product PO-123 expiration date updated..."
   ├─ Timeline:
   │  └─ 14:32:00 - Event detected
   │  └─ 14:32:15 - Rule matched (92% confidence)
   │  └─ 14:32:20 - Mission created
   │  └─ 14:32:25 - Dispatched to Warehouse Node A
   │  └─ 14:33:10 - Warehouse manager notified
   │  └─ 14:33:45 - SAP form created (PO-2026-999)
   │  └─ 14:34:10 - Audit logged
   ├─ Artifacts: Screenshots, timestamps
   ├─ Compliance: "All steps completed successfully"
   └─ Signature: "System verified - Digital signature"

1️⃣3️⃣ DASHBOARD UPDATE
   Real-time updates via WebSocket:
   ├─ Mission status changes
   ├─ Rule trigger count increments
   ├─ NexusNode load updates
   └─ User sees live progress
```

---

## Component Details

### Existing Components (Phase 1 - ✅ Complete)

#### ConnectorEntity
```
┌────────────────────────────────┐
│ ConnectorEntity (₁ of 22)       │
├────────────────────────────────┤
│ id: UUID (PK)                  │
│ userId: UUID (FK)              │
│ name: string                   │
│ type: ConnectorType enum       │
│ status: ConnectorStatus enum   │
│ authType: AuthType enum        │
│ encryptedCredentials: string   │
│ config: JSON (no secrets)      │
│ timeout: number                │
│ retryCount: number             │
│ retryDelay: number             │
│ rateLimit: number              │
│ createdAt: timestamp           │
│ updatedAt: timestamp           │
│ deletedAt: timestamp (soft del)│
└────────────────────────────────┘
```

**Integration with new layers:** Each sensor uses a ConnectorEntity to authenticate to data sources.

### To Build - Core Entities

#### StandardEvent (Level 3)
Universal format that ALL sensors must produce

#### EventRuleEntity (Level 4)
Business rules stored in DB

#### MissionEntity (Level 5)
Mission instances to track

#### AuditLogEntity (Level 5)
Complete audit trail

#### NexusNodeEntity (Level 6)
Registry of execution nodes

---

## Integration with Existing Code

### How Current Kafka System Fits

**Current Code:**
```
KafkaConsumerService
  └─ subscribes to cdc.* topics
      └─ CDCEventProcessorService
          └─ normalizeEvent()
          └─ findMatchingRules() (in-memory!)
          └─ createMissionFromEvent() (never persisted!)
```

**With New Architecture:**
```
KafkaCdcSensor (new, implements IEventSensor)
  └─ Listens to Kafka
      └─ Emits KafkaRawEvent
          └─ KafkaCdcNormalizer (new)
              └─ Produces StandardEvent
                  └─ EventDeduplicator (new)
                      └─ UniversalEventProcessor (new)
                          └─ LLM Matcher (new, queries DB)
                              └─ MissionDispatcher (new)
                                  └─ Saves MissionEntity (new)
                                      └─ Sends to NexusNode (new)

// OLD CODE BECOMES SPECIALIZED SENSOR IMPLEMENTATION!
KafkaConsumerService → KafkaCdcSensor
CDCEventProcessorService → Helper functions in LLM Matcher
```

**Key Point:** Existing Kafka logic becomes ONE specialized sensor implementation!

---

## Implementation Roadmap

### Phase 1 (✅ COMPLETE)
- [x] Universal Connector Layer (22 types)
- [x] Connector encryption
- [x] Multi-tenancy setup
- [x] Connection testing

### Phase 2 (⏳ NEXT - 10 weeks estimated)

#### Phase 2.0: Task Compiler (BUILD FIRST!) ⭐ FOUNDATION
**Why First:** Everything else depends on this - it's the chatbot entry point
- [ ] GlobalTaskEntity + CRUD
- [ ] TaskCompilerService (Intent parsing via LLM)
- [ ] Query generator (SQL for each connector)
- [ ] Event factory (Create artificial StandardEvents)
- [ ] Mission generator (Create missions from events)
- [ ] Batch optimizer (Group similar actions)
- [ ] API endpoints (task/compile, task/preview, task/execute)
- [ ] **Duration: 2 weeks**

#### Phase 2.1: Event Sensor Framework (ESF)
**Depends On:** (Can start in parallel)
- [ ] Sensor interface + registry
- [ ] KafkaCdcSensor implementation
- [ ] Built-in sensors (FileSystem, S3, Webhook, Polling)
- [ ] Sensor management API
- [ ] **Duration: 2 weeks**

#### Phase 2.2: Event Normalization
- [ ] StandardEvent type definition
- [ ] Per-sensor normalizers
- [ ] Normalizer factory + registry
- [ ] Event deduplication
- [ ] **Duration: 1.5 weeks**

#### Phase 2.3: LLM Rule Matching
- [ ] EventRuleEntity + CRUD
- [ ] LLM Matcher service
- [ ] Result caching
- [ ] Confidence threshold logic
- [ ] Multi-LLM routing (gpt-4, claude, local)
- [ ] **Duration: 2 weeks**

#### Phase 2.4: Mission Persistence & Dispatching
- [ ] MissionEntity + CRUD
- [ ] AuditLogEntity
- [ ] Mission dispatcher
- [ ] NexusNode registry
- [ ] Capability matcher
- [ ] **Duration: 2.5 weeks**

### Phase 3 (⏳ LATER - 6 weeks estimated)
- [ ] Level 6: NexusNode Framework
  - [ ] gRPC protocol definition
  - [ ] Node core server
  - [ ] Ghost Control implementation
  - [ ] Action handlers
  - [ ] Proof collection

### Phase 4 (⏳ LATER - 2 weeks estimated)
- [ ] Level 8: Report Engine
  - [ ] Report generation service
  - [ ] Typst template
  - [ ] PDF rendering
  - [ ] Compliance archive

### Phase 5 (⏳ LATER - 4 weeks estimated)
- [ ] Level 9: User Interface
  - [ ] Conversation AI interface
  - [ ] Dashboard components
  - [ ] Real-time updates
  - [ ] Analytics visualization

### Implementation Strategy

**Sequential order recommended:**
1. **Build Phase 2.0 first** (Task Compiler) → You can test chatbot flows end-to-end
2. **Phase 2.1-2.4 can run in parallel** → Event capture, normalization, matching, dispatch
3. **Then Phase 3** → Deploy execution nodes
4. **Then Phase 4** → Add reporting
5. **Finally Phase 5** → Polish UI

**Why this order?**
- Task Compiler is the user-facing entry point
- Building it first validates the entire architecture
- Once working, all other layers are isolated components
- Can demo to users much earlier
  - [ ] Analytics visualization

---

## TECHNICAL SAFEGUARDS & RESILIENCE

These three critical safeguards ensure production-grade reliability and compliance:

---

### 1. Debounce & Stateful Tracking (Mode 3 Prevention)

**Problem:**
- In Mode 3 (Continuous Monitoring), a single condition sustained over time triggers actions repeatedly
- Example: Heart rate stays at 125 BPM for 10 seconds → Alerts doctor 10 times (if events per second)
- This causes alert fatigue and infinite mission creation
- System would generate 100s of duplicate missions

**Solution:** Implement Stateful Condition Tracking

```
GlobalTaskStateEntity (New):
├─ Pattern: Track condition state per GlobalTask
├─ Stores: Last condition state + last state change time
└─ Logic: Only trigger action on STATE CHANGE, not on state persistence

Example (Heart Rate Monitoring):

Reading 1: bpm=118 → State=NORMAL      (No action)
Reading 2: bpm=125 → State=CRITICAL    (ACTION TRIGGERED! ✓)
Reading 3: bpm=128 → State=CRITICAL    (Already critical, no action)
Reading 4: bpm=127 → State=CRITICAL    (Already critical, no action)
Reading 5: bpm=118 → State=NORMAL      (ACTION TRIGGERED! - condition resolved ✓)
Reading 6: bpm=115 → State=NORMAL      (Already normal, no action)
Reading 7: bpm=130 → State=CRITICAL    (ACTION TRIGGERED again! ✓)
```

**Implementation:**

```typescript
@Entity('global_task_states')
export class GlobalTaskStateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column({ type: 'uuid' })
  globalTaskId: string;     ← Links to GlobalTask
  
  @Column({ type: 'uuid' })
  userId: string;
  
  @Column({ type: 'enum', enum: ConditionState })
  currentState: ConditionState;
  // States: NORMAL | WARNING | CRITICAL | RESOLVED
  
  @Column({ type: 'timestamp' })
  stateChangedAt: Date;     ← Last state transition
  
  @Column({ type: 'jsonb', nullable: true })
  lastEventData: Record<string, any>;  ← Event that caused state
  
  @Column({ type: 'integer', default: 1 })
  consecutiveMatches: number;  ← For logging frequency
  
  @Column({ type: 'integer', default: 0 })
  actionsTriggerredInCurrentState: number;
}

export enum ConditionState {
  NORMAL = 'normal',         ← Condition not met
  WARNING = 'warning',       ← Threshold crossed (early alert)
  CRITICAL = 'critical',     ← Main threshold met
  RESOLVED = 'resolved'      ← Returned to normal after alert
}
```

**Debounce Configuration (Per-Task):**

```typescript
// In GlobalTaskEntity, add debounce config:

@Column({ type: 'jsonb' })
debounceConfig: {
  enabled: boolean;
  strategy: 'immediate' | 'debounce' | 'throttle';
  debounceMs?: number;       ← Wait N ms before first action
  cooldownMs?: number;       ← Min time between duplicate actions
  maxActionsPerMinute?: number;  ← Rate limit
};

// Example config:
{
  enabled: true,
  strategy: 'debounce',
  debounceMs: 500,          ← Wait 500ms before alerting
  cooldownMs: 60000,        ← Don't alert again for 1 min
  maxActionsPerMinute: 5    ← Max 5 alerts per minute
}
```

**API Endpoint:**

```
GET    /tasks/:id/state
  Returns: currentState, stateChangedAt, consecutiveMatches

POST   /tasks/:id/reset-state
  Manually reset state (for testing)
```

---

### 2. Dead Man's Switch & Node Failover

**Problem:**
- A critical NexusNode (e.g., Hospital System) executing vital missions suddenly crashes
- All in-progress missions on that node are lost
- No automatic recovery
- Patients don't get alerts, forms don't get created

**Solution:** Multi-Node Capability Routing with Automatic Failover

```
MissionDispatcherService Enhancement:

When dispatching mission to Node A:

1. Check: Does Node A have required capabilities?
     YES → Route to A ✓

2. Also check: What other nodes have same capabilities?
     ├─ Node B: Can do same tasks ← BACKUP CANDIDATE
     └─ Node C: Can do same tasks ← SECONDARY BACKUP

3. Assign backup nodes to mission:
     MissionEntity {
       targetNodeId: 'node-a-uuid',           ← Primary
       backupNodeIds: ['node-b-uuid', 'node-c-uuid'],
       failoverStrategy: 'immediate'|'exponential-retry'
     }

4. During execution, stream heartbeat:
     gRPC: Every 5 seconds → "Mission still running on Node A"

5. If no heartbeat for 30 seconds:
     ├─ Attempt reconnect to Node A (2 attempts)
     ├─ If still unresponsive → Status = ORPHANED
     ├─ Trigger failover: Send mission to Node B
     ├─ Update MissionEntity.status = 'FAILOVER_IN_PROGRESS'
     └─ Log in AuditLog: "Mission rerouted from A to B due to timeout"

6. If Node B succeeds:
     ├─ Update MissionEntity.executedByNode = 'node-b-uuid'
     ├─ Status = COMPLETED
     └─ AuditLog: "Mission completed by backup node B"

7. If Node B also fails:
     ├─ Try Node C
     ├─ If all fail: Status = FAILED_ALL_NODES
     └─ Escalate to admin alert
```

**Implementation:**

```typescript
@Entity('missions')
export class MissionEntity {
  // ... existing fields ...
  
  @Column({ type: 'uuid' })
  targetNodeId: string;        ← Primary node
  
  @Column({ type: 'uuid', array: true })
  backupNodeIds: string[];     ← Failover candidates (sorted by capability match)
  
  @Column({ type: 'enum', enum: FailoverStrategy })
  failoverStrategy: FailoverStrategy;
  
  @Column({ type: 'integer', default: 0 })
  failoverAttempt: number;     ← Track failover count
  
  @Column({ type: 'jsonb', nullable: true })
  executionNodeHistory: Array<{
    nodeId: string;
    status: 'pending'|'executing'|'failed'|'succeeded';
    startedAt: Date;
    failedAt?: Date;
    failureReason?: string;
  }>;
}

export enum FailoverStrategy {
  IMMEDIATE = 'immediate',             ← Fail over right away
  EXPONENTIAL_RETRY = 'exponential',   ← Retry with backoff first
  MANUAL = 'manual'                    ← Require admin approval
}

// MissionDispatcherService:
async dispatchMissionWithFailover(mission: MissionEntity) {
  const primaryNode = await this.nodeRegistry.get(mission.targetNodeId);
  
  // Get all nodes with required capabilities
  mission.backupNodeIds = await this.capabilityMatcher.findBackupNodes(
    mission.actions,
    primaryNode.id
  );
  
  // Try primary first
  try {
    await this.executeOnNode(mission, primaryNode, timeout: 30000);
    mission.status = 'COMPLETED';
  } catch (error) {
    if (error.code === 'TIMEOUT' || error.code === 'CONNECTION_LOST') {
      // Trigger failover
      await this.failoverToBackupNode(mission);
    }
  }
}

async failoverToBackupNode(mission: MissionEntity) {
  mission.failoverAttempt++;
  const backupNode = mission.backupNodeIds[mission.failoverAttempt - 1];
  
  if (!backupNode) {
    mission.status = 'FAILED_ALL_NODES';
    await this.escalateToAdmin(mission);
    return;
  }
  
  const nodeEntity = await this.nodeRegistry.get(backupNode);
  
  // Log failover attempt
  await this.auditLog.create({
    missionId: mission.id,
    failoverAttempt: mission.failoverAttempt,
    fromNodeId: mission.targetNodeId,
    toNodeId: backupNode,
    reason: 'PRIMARY_NODE_TIMEOUT'
  });
  
  mission.status = 'FAILOVER_IN_PROGRESS';
  mission.targetNodeId = backupNode;
  
  try {
    await this.executeOnNode(mission, nodeEntity, timeout: 30000);
    mission.status = 'COMPLETED';
  } catch (error) {
    // Recursively try next backup
    await this.failoverToBackupNode(mission);
  }
}
```

**NexusNode Heartbeat Protocol:**

```
During mission execution:

Node → Server (Every 5 seconds):
{
  type: 'HEARTBEAT',
  missionId: 'mission-xyz',
  status: 'executing',
  progress: 0.45,  ← 45% complete
  timestamp: now()
}

Server tracks:
- Last heartbeat time
- If > 30s gap: Mark as OFFLINE
- Trigger failover

Node can also send:
{
  type: 'PROGRESS_UPDATE',
  missionId: 'mission-xyz',
  currentAction: 3,
  totalActions: 5,
  screenshot: 'base64-data',  ← Partial proof
  timestamp: now()
}
```

---

### 3. Zero-Trust Audit Trail (Cryptographic Signing)

**Problem:**
- In medical/regulated industries, audit trails can be questioned or modified
- "Did the doctor really get alerted?" - External audit needs proof
- AuditLog could theoretically be modified by server after action completes
- Compliance requirements demand non-repudiation

**Solution:** Cryptographic Signing at Source (NexusNode)

```
Zero-Trust Principle:
├─ Node executes action
├─ Node creates execution proof (screenshots, logs, results)
├─ Node signs proof with its private key
├─ Node sends to Server: {proof, signature}
├─ Server cannot modify proof (signature would break)
├─ External auditor can verify: "Did Node X really execute this?"

Example Flow:

Mission: "Alert doctor at 125 BPM"

1. Notification Node executes alert
2. Proof collected:
   {
     missionId: 'mission-xyz',
     action: 'send_alert',
     recipient: 'doctor@hospital.com',
     message: 'Patient alert: BPM=125',
     sentAt: '2026-02-18T14:32:45Z',
     deliveryStatus: 'sent',
     deliveryProof: 'Message ID from Twilio: SM12345678'
   }

3. Node signs proof:
   signature = SIGN(proof_json, node_private_key)

4. Node sends to Server:
   {
     proof: {...},
     signature: 'hex-encoded-signature',
     nodePublicKey: 'node-certificate.pem'
   }

5. Server verifies:
   VERIFY(proof_json, signature, nodePublicKey) → TRUE ✓
   (Server cannot forge signature without private key)

6. Server stores in AuditLog:
   {
     missionId: 'mission-xyz',
     executionProof: {...},
     cryptographicSignature: 'hex-signature',
     signedByNodeId: 'notification-node-uuid',
     nodeCertificate: 'pem-cert',
     verifiedAt: '2026-02-18T14:32:50Z',
     signatureAlgorithm: 'ECDSA-P256'
   }

7. External audit (6 months later):
   auditor = VERIFY(proof_json, stored_signature, stored_cert)
   if auditor:
     print("Proof verified! Node signed this on 2026-02-18T14:32:45Z")
     print("Proof has NOT been modified since execution")
   else:
     print("SIGNATURE INVALID - Proof was tampered with!")
```

**Implementation:**

```typescript
// 1. NexusNode should have public/private key pair:

@Entity('nexus_nodes')
export class NexusNodeEntity {
  // ... existing fields ...
  
  @Column({ type: 'text' })
  publicKeyPem: string;        ← PEM format, can be shared
  
  @Column({ type: 'text', select: false })
  privateKeyPem: string;       ← NEVER sent, only on node
  
  @Column({ type: 'enum' })
  keyAlgorithm: 'RSA-2048'|'ECDSA-P256'|'EdDSA';  ← Default: ECDSA-P256 (fast, secure)
  
  @Column({ type: 'timestamp' })
  keyGeneratedAt: Date;
  
  @Column({ type: 'timestamp', nullable: true })
  keyRotatedAt?: Date;         ← Security: rotate annually
}

// 2. Node signs execution proof:

// In NexusNode (Node-side code):
async completeAction(action: Action, result: any) {
  const proof = {
    missionId: this.currentMission.id,
    action: action.name,
    result: result,
    timestamp: new Date().toISOString(),
    nodeId: this.nodeId
  };
  
  const proofJson = JSON.stringify(proof);
  const hash = crypto.createHash('sha256').update(proofJson).digest();
  
  // Sign with node's private key
  const signature = crypto
    .sign('sha256', hash, {
      key: this.privateKey,
      format: 'pem',
      type: 'pkcs8'
    })
    .toString('hex');
  
  return {
    proof,
    signature,
    nodeId: this.nodeId,
    algorithm: 'ECDSA-P256'
  };
}

// 3. Server verifies and stores:

@Entity('audit_logs')
export class AuditLogEntity {
  // ... existing fields ...
  
  @Column({ type: 'jsonb' })
  executionProof: Record<string, any>;  ← Proof data
  
  @Column({ type: 'text' })
  cryptographicSignature: string;       ← Hex-encoded signature
  
  @Column({ type: 'text' })
  signedByNodeId: string;               ← Which node signed
  
  @Column({ type: 'text' })
  nodeCertificatePem: string;           ← For verification
  
  @Column({ type: 'enum' })
  signatureAlgorithm: string;           ← 'ECDSA-P256', etc
  
  @Column({ type: 'timestamp' })
  verifiedAt: Date;                     ← When signature was verified
  
  @Column({ type: 'boolean' })
  signatureValid: boolean;              ← Verification result
  
  @Column({ type: 'text', nullable: true })
  verificationError?: string;           ← If verification failed
}

// 4. Verification service:

export class CryptoVerificationService {
  async verifyExecutionProof(
    proof: any,
    signature: string,
    nodeId: string
  ): Promise<{valid: boolean; error?: string}> {
    try {
      const node = await this.nodeRepository.findOne(nodeId);
      if (!node) return {valid: false, error: 'Node not found'};
      
      const proofJson = JSON.stringify(proof);
      const hash = crypto.createHash('sha256').update(proofJson).digest();
      
      const verified = crypto.verify(
        'sha256',
        hash,
        {
          key: node.publicKeyPem,
          format: 'pem'
        },
        Buffer.from(signature, 'hex')
      );
      
      return {
        valid: verified,
        error: verified ? undefined : 'Signature verification failed'
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
  
  async generateAuditReport(missionId: string) {
    const logs = await this.auditLogRepository.find({
      where: {missionId},
      order: {timestamp: 'ASC'}
    });
    
    const report = [];
    for (const log of logs) {
      const verification = await this.verifyExecutionProof(
        log.executionProof,
        log.cryptographicSignature,
        log.signedByNodeId
      );
      
      report.push({
        timestamp: log.timestamp,
        action: log.executionProof.action,
        executor: log.signedByNodeId,
        proofValid: verification.valid,
        proof: log.executionProof,
        signature: log.cryptographicSignature
      });
    }
    
    return report;
  }
}

// 5. API Endpoint for verification:

@Controller('audit')
export class AuditController {
  @Get('/:missionId/verify')
  async verifyMission(@Param('missionId') missionId: string) {
    const report = await this.cryptoService.generateAuditReport(missionId);
    
    const allValid = report.every(r => r.proofValid);
    
    return {
      missionId,
      allProofsValid: allValid,
      proofCount: report.length,
      details: report,
      verdict: allValid 
        ? "Mission execution is verified and tamper-proof"
        : "WARNING: Some proofs failed verification!"
    };
  }
}
```

**Compliance & External Audit:**

```
Medical Auditor Verification (6 months later):

$ eyeflow-audit verify-mission mission-xyz

Reading from database:
├─ Proof: {action: 'send_alert', timestamp: '2026-02-18T14:32:45Z'}
├─ Signature: 'a1b2c3d4e5f6...'
├─ Node Certificate: (certificate for Notification Node)

Verifying signature...
├─ Load node certificate
├─ Recreate proof hash
├─ Verify signature against hash
└─ Result: ✓ VALID

Output:
"Mission executed by Notification Node (certified)
 Action: send_alert (to doctor@hospital.com)
 Timestamp: 2026-02-18 14:32:45 UTC
 Proof: Cryptographically verified - NOT MODIFIED since execution
 Status: AUDIT-COMPLIANT ✓"
```

---

## Design Decisions

### 0. Why Three-Mode Architecture (Event-Driven + Direct + Monitoring)?

**Problem:** 
- Pure event-driven systems are reactive only (missing proactive scenarios)
- One-time actions (Mode 2) need different handling than continuous rules (Mode 3)
- Users want flexibility: "Do this NOW" OR "Do this IF condition"
- Need unified architecture handling all use cases

**Solution:** Implement three complementary modes in same architecture

**The Three Modes:**

```
Mode 1 (Event-Driven):
  Real events → Sensor → Normalize → Match EventRules → Execute
  (Passive background monitoring - always running)
  
Mode 2 (Direct Execution):
  User: "Do this now" → Compile → Generate missions → Execute immediately
  (Active one-time execution)
  
Mode 3 (Continuous Monitoring):
  User: "If X happens, do Y" → Create surveillance rule → Monitor forever
  (Active ongoing conditions - created by user, continues until stopped)
```

**Why This Works:**
- Same underlying infrastructure (Event → Normalize → Match → Execute)
- Task Compiler handles all user intentions (both direct & surveillance)
- Event-driven runs passively in background
- Direct executions are fast & predictable
- Surveillance rules are user-defined and persistent
- GlobalTaskType (DIRECT|MONITORING) controls behavior
- Audit trail captures all three modes identically
- Users get complete flexibility

**Example Comparison:**
```
Event-Driven: 
  System admin: "Always run rule X in background"
  → Creates at system level, never stops
  
Direct Execution:
  User: "Backup my database RIGHT NOW"
  → One-time, completes in minutes, returns result
  
Continuous Monitoring:
  User: "Alert me when CPU > 80%"
  → Creates own rule, persists until they delete it
```

### 1. Why Task Compiler Layer (0.5)?

**Problem:**
- Without it, all user requests go through event system
- Event system optimized for real-time continuous streaming
- Natural language requests need special handling
- Can't batch queries efficiently if going through event pipeline
- Can't show preview before execution

**Solution:** Create dedicated Task Compiler layer

**What Task Compiler Does:**
```
User Text (DECISION POINT)
  ↓
"Do this NOW" OR "Monitor if X"?
  ├─ Mode 2 (DIRECT):
  │  └─ Parse intent → Generate query → Execute query 
  │     → Create artificial events → Create missions → Execute immediately
  │
  └─ Mode 3 (MONITORING):
     └─ Parse intent → Extract condition → Create EventRule → Save to DB 
        → Activate monitoring (system listens forever)
```

**Why This Works:**
- Separates "user request compilation" from "event processing"
- Can optimize for batch operations (Mode 2)
- Can create persistent rules (Mode 3)
- Can show preview before execution
- Can parallelize all generated missions
- Unified natural language interface for both modes

### 2. Why GlobalTaskType (DIRECT vs MONITORING)?

**Problem:**
- Same GlobalTask entity can represent two different workflows
- Need to handle them differently during execution
- Need different status values (COMPLETED vs ACTIVE)
- Need different API endpoints behavior

**Solution:** Explicit type field with different handling paths

```
GlobalTaskType validation at compile time:

IF type == DIRECT:
  ├─ Require no "condition" field (just "actions")
  ├─ Generate query & execute immediately
  ├─ Status: PENDING → EXECUTING → COMPLETED/FAILED
  ├─ One-time execution
  └─ Can be deleted after completion
  
IF type == MONITORING:
  ├─ Require "condition" field
  ├─ Create EventRuleEntity
  ├─ Status: PENDING → ACTIVE (← Different!) → STOPPED
  ├─ Continuous execution (keeps running)
  └─ Must be explicitly stopped by user
```

**Why This Works:**
- Clear intent separation
- Different business logic paths
- Easier testing and debugging
- Clear API semantics

### 3. Why StandardEvent (Universal Format)?

**Problem:** Different sources emit different formats
- Debezium: `{op, before, after, source, ...}`
- S3: `{Records: [{s3: ...}]}`
- Files: `{path, mask, stats}`
- REST: `{old, new}`
- Task Compiler (artificial): `{query_result, row_index, ...}`
- IoT sensors: `{deviceId, value, timestamp}`

**Solution:** Universal contract that normalizers transform INTO

**Why This Works:**
- LLM always sees same structure (easier to interpret)
- Easy to cache & deduplicate
- Simple to document
- Extensible via context field
- Works for both real and artificial events


### 3. Why LLM for Rule Interpretation?

**Problem:** Static rules are rigid, can't handle nuance

**Solution:** Let LLM interpret natural language rules

**Why This Works:**
- Rules are human-readable
- Business people can write them
- LLM can understand context
- Reasoning is captured for audit
- Same LLM used in Task Compiler (DRY principle)

### 4. Why Multi-LLM Routing?

**Problem:** Different actions need different models
- Sensitive decisions → gpt-4 (safest)
- Description generation → claude (best at writing)
- Deterministic operations → local model (no latency)

**Solution:** Route by action type

**Why This Works:**
- Optimize cost vs quality
- Meet compliance requirements
- Handle offline scenarios
- Cacheable result patterns

### 5. Why Separate Sensors?

**Problem:** Monolithic code can't scale to 100+ sources

**Solution:** Plugin architecture (IEventSensor interface)

**Why This Works:**
- Users can add custom sensors
- Each sensor isolated
- Easy to test
- No core changes needed

### 6. Why NexusNodes?

**Problem:** Can't execute everywhere from one server

**Solution:** Distributed execution agents

**Why This Works:**
- Can run on-prem or cloud
- Can handle Ghost Control locally
- Can access restricted resources
- Can be capacity-scaled independently

### 7. Why Complete Audit Trail?

**Problem:** No visibility into why something happened

**Solution:** Log every step with reasoning

**Why This Works:**
- Compliance audits
- Debugging failures
- Understanding LLM decisions
- Building trust with both event-driven and chatbot-driven tasks
- Debugging failures
- Understanding LLM decisions
- Building trust

---

## Conclusion

This architecture represents a **complete, extensible, intelligent automation platform** with three complementary operation modes:

### Mode 1: Event-Driven (Automatic Background Monitoring)
- Real events detected from 100+ data sources
- Continuously normalized to StandardEvent format
- Intelligently interpreted by LLM-powered rules
- Missions generated and routed to right NexusNode
- Full audit trail captures everything
- Runs passively in background forever
- **Example:** "Monitor products table for changes"

### Mode 2: Direct Execution (On-Demand Actions)
- User requests action in natural language via chat
- Task Compiler parses intent in seconds
- System auto-generates all required missions
- Executes immediately on selected nodes
- Returns results and reports instantly
- One-time execution, completes in minutes
- **Example:** "Backup database now" → Done in 30 seconds

### Mode 3: Continuous Monitoring (User-Defined Surveillance)
- User creates surveillance rule in natural language
- System monitors data sources for matching conditions
- When condition met, automatically executes actions
- Continues indefinitely until user stops
- Full event-triggered execution per match
- **Example:** "If heart rate > 120, alert doctor" → Always listening

### Key Capabilities

- **Unified Automation Platform** (All three modes in one system)
- **Natural Language Programming** (Users describe intent, not code)
- **Autonomous Orchestration** (System handles all complexity)
- **Multi-LLM Routing** (Best model for each action type)
- **Complete Audit Trail** (Every action logged for compliance)
- **Distributed Execution** (NexusNodes run anywhere)
- **Smart Capability Matching** (Right node for right job)
- **Professional Reporting** (PDF with full proof trail)
- **Data Source Agnostic** (Any connector works seamlessly)
- **Infinite Scalability** (Add sensors, nodes, rules without limits)

The design prioritizes:
- **User Empowerment:** Natural language is the interface
- **Architectural Elegance:** Three modes, one unified pipeline
- **Complete Visibility:** Audit trail captures all execution
- **Enterprise Grade:** Compliance-ready from the ground up
- **Operational Flexibility:** React OR act OR monitor - your choice
- **Developer Friendly:** Clear layers, testable components

### Workflow Summary

```
ANY user request → Task Compiler → GlobalTaskType decision
                        ↓
                ┌───────┴────────┐
                ↓                ↓
            DIRECT           MONITORING
            (Mode 2)          (Mode 3)
                ↓                ↓
          Execute Now        Create Rule
            (mins)         (runs forever)
                ↓                ↓
        Return result       Automatically trigger
        & PDF report        when condition met
                ↓                ↓
            DONE!          Keep listening...
```

### Implementation Priority

**Build Order:**
1. ✅ Phase 1: Connectors (DONE) - Foundation for all modes
2. ⏳ Phase 2.0: Task Compiler (BUILD FIRST) - Enables Modes 2 & 3
   - Includes safety foundation: Stateful tracking, key generation
3. ⏳ Phase 2.1-2.4: Event infrastructure + Failover (parallel)
   - Event capture → Normalization → Matching → Dispatch with failover
   - Includes Dead Man's Switch service for node resilience
   - Includes cryptographic proof signing
4. ⏳ Phase 3: NexusNode execution - Powers execution for all modes
5. ⏳ Phase 4: Reporting engine - Unified reports for all modes (with audit verification)
6. ⏳ Phase 5: UI polish - Beautiful interface for all modes

Why Task Compiler first? 
- It's the user-facing entry point for Modes 2 & 3
- Validates entire architecture immediately
- Lets users start automating within weeks
- Doesn't require NexusNodes to demo/test
- Can generate reports even without execution
- Early integration of safety safeguards ensures compliance from day one

---

**Document End**

Version: 1.3 | Date: 18 février 2026 | Status: Production-Ready Architecture with Safety Safeguards

**Major Addition in v1.3:** 
- TECHNICAL SAFEGUARDS & RESILIENCE section with three critical production patterns:
  1. Debounce & Stateful Tracking (prevents alert fatigue in Mode 3)
  2. Dead Man's Switch Failover (automatic node recovery for critical operations)
  3. Zero-Trust Cryptographic Audit (cryptographic signing for compliance & non-repudiation)
- Updated implementation roadmap to integrate safety layer in Phase 2.0-2.2
- StandardEvent normalization, LLM rule matching, and mission execution now include resilience guarantees

Version: 1.2 | Date: 18 février 2026 | Status: Three-Mode Architecture Complete

**Major Addition in v1.2:** Mode 3 (Continuous Monitoring) with detailed surveillance workflows and GlobalTaskType distinction

Version: 1.1 | Date: 18 février 2026 | Status: Design Complete with Dual-Mode Architecture - Ready for Phase 2 Implementation

**Key Addition:** Layer 0.5 Task Compiler for chatbot-driven end-to-end automation
