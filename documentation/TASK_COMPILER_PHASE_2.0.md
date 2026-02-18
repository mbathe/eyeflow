# 🧠 TASK COMPILER - Phase 2.0 Complete Implementation Guide

**Date:** 18 février 2026  
**Phase:** 2.0 - Foundation  
**Duration:** ~10 days  
**Status:** Ready to implement

---

## Table of Contents

1. [Conceptual Overview](#conceptual-overview)
2. [Entity Schemas](#entity-schemas)
3. [DTOs & API Contracts](#dtos--api-contracts)
4. [Service Architecture](#service-architecture)
5. [Concrete Examples](#concrete-examples)
6. [Key Decisions](#key-decisions)
7. [Implementation Checklist](#implementation-checklist)

---

## Conceptual Overview

### The Two Modes at a Glance

#### **Mode 2: Direct Execution (On-Demand)**
User requests action **now** → System executes **immediately** → Returns proof in seconds to minutes

```
User: "Back up database now with daily schedule every 2 AM, 
       include logs and send report to admin@company.com"

        ↓ [PARSE]
        
Intent: {
  action: "backup_database",
  parameters: {
    schedule: "daily_02:00",
    includeLogsDirectory: true,
    reportRecipient: "admin@company.com"
  },
  confidence: 0.92,
  mode: DIRECT
}

        ↓ [COMPILE]
        
GlobalTask DIRECT: {
  id: "task-uuid1",
  type: DIRECT,
  status: PENDING,
  targetConnectorIds: ["postgres-connector-uuid"]
}

        ↓ [GENERATE MISSIONS]
        
Missions: [
  {
    id: "mission-uuid1",
    actions: [
      { type: "database_backup", params: {...}, order: 1 },
      { type: "send_email", params: {...}, order: 2 }
    ],
    status: PENDING_EXECUTION
  }
]

        ↓ [DISPATCH & EXECUTE]
        
• Find best NexusNode for database_backup capability
• Set Dead Man's Switch timer (30s)
• Deploy mission
• Wait for execution proof
• Verify cryptographic signature
• Collect AuditLog

        ↓ [RETURN RESULT]
        
{
  status: "COMPLETED",
  completedAt: "2026-02-18T14:32:45Z",
  proof: {...execution details...},
  cryptographicSignature: "valid ✓",
  auditLog: {...}
}
```

---

#### **Mode 3: Continuous Monitoring (Surveillance)**
User defines rule **once** → System monitors **forever** → Triggers actions **when condition met**

```
User: "Monitor heart rate sensor in ICU. If BPM > 120 AND < 60 for more than 
       30 seconds, alert doctor, log event, and create incident ticket"

        ↓ [PARSE]

Intent: {
  mode: MONITORING,
  action: "monitor_heart_rate",
  trigger: {
    field: "bpm",
    operator: "range",
    value: [120, 60]  // > 120 OR < 60
    duration: 30000ms
  },
  actions: ["alert_doctor", "log_event", "create_ticket"]
}

        ↓ [CREATE RULE]

EventRuleEntity: {
  id: "rule-uuid1",
  name: "Monitor ICU Heart Rate",
  sourceConnectorType: "SENSOR_HEART_RATE",
  condition: {
    field: "bpm",
    operator: "range",
    value: [120, 60],
    duration: 30000ms
  },
  actions: ["alert_doctor", "log_event", "create_ticket"],
  status: ACTIVE
}

GlobalTask MONITORING: {
  id: "task-uuid2",
  type: MONITORING,
  linkedEventRuleId: "rule-uuid1",
  status: ACTIVE
}

        ↓ [CONTINUOUS MONITORING BEGINS]

Every N seconds (depends on connector):

00:00 - BPM=110 → Match? NO → state=NORMAL (no action)
00:05 - BPM=125 → Match? YES!
        └─ State changed (NORMAL → CRITICAL)
        └─ ⭐ TRIGGER ACTIONS ⭐
           └─ Create missions for: alert_doctor, log_event, create_ticket
           └─ Deploy missions
           └─ Collect proofs
           └─ Create AuditLog with signatures
           └─ Start debounce window (default 5min)

00:06 - BPM=128 → Match? YES, but same state
        └─ Within debounce window
        └─ NO ACTION (prevent alert spam)

00:07 - BPM=115 → Match? NO
        └─ State changed (CRITICAL → NORMAL)
        └─ ⭐ TRIGGER ACTIONS ⭐
           └─ Create recovery mission
           └─ Reset debounce window

        ↓ [CONTINUES UNTIL USER STOPS]

LOOP repeats forever until:
  User: "Stop monitoring heart rate" 
  → EventRule.status = STOPPED
  → System stops checking
```

---

## Entity Schemas

### GlobalTaskEntity

**Purpose:** Unified task representation for both DIRECT and MONITORING modes

```typescript
@Entity('global_tasks')
@Index(['userId', 'type'])
@Index(['userId', 'status'])
export class GlobalTaskEntity {
  
  // ==========================================
  // PRIMARY IDENTIFIERS
  // ==========================================
  
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column({ type: 'uuid' })
  userId: string;                          // Multi-tenant isolation (from X-User-ID header)
  
  
  // ==========================================
  // CORE FIELDS
  // ==========================================
  
  @Column({
    type: 'enum',
    enum: ['DIRECT', 'MONITORING']
  })
  type: 'DIRECT' | 'MONITORING';          // Which mode invoked this task
  
  @Column({
    type: 'enum',
    enum: ['PENDING', 'EXECUTING', 'COMPLETED', 'FAILED', 'ACTIVE', 'STOPPED', 'ERROR']
  })
  status: string;                          // State machine:
                                           // DIRECT:     PENDING → EXECUTING → COMPLETED/FAILED
                                           // MONITORING: PENDING → ACTIVE (→ STOPPED by user)
  
  
  // ==========================================
  // INTENT PARSING
  // ==========================================
  
  @Column({ type: 'text' })
  originalUserInput: string;               // "Backup database with daily 2 AM schedule..."
  
  @Column({ type: 'jsonb' })
  intent: {
    action: string;                        // "backup_database"
    parameters: Record<string, any>;       // {schedule: "daily_02:00", recipients: [...]}
    confidence: number;                    // 0 to 1
    parsingModel: string;                  // "gpt-4-turbo" or "claude-3-sonnet"
    parsingCompletedAt: Date;
  };
  
  
  // ==========================================
  // MODE 2 SPECIFIC (DIRECT EXECUTION)
  // ==========================================
  
  @Column({ type: 'uuid', array: true, nullable: true })
  targetConnectorIds?: string[];           // Which connectors to use
  
  @Column({ type: 'uuid', array: true, nullable: true })
  missionIds?: string[];                   // Missions generated from this task
  
  
  // ==========================================
  // MODE 3 SPECIFIC (CONTINUOUS MONITORING)
  // ==========================================
  
  @Column({ type: 'uuid', nullable: true })
  linkedEventRuleId?: string;              // FK to EventRuleEntity (this task created this rule)
  
  
  // ==========================================
  // TRACKING & TIMING
  // ==========================================
  
  @CreateDateColumn()
  createdAt: Date;
  
  @Column({ type: 'timestamp', nullable: true })
  startedExecutingAt?: Date;
  
  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;
  
  @Column({ type: 'timestamp', nullable: true })
  stoppedAt?: Date;                        // When user stopped surveillance (Mode 3 only)
  
  
  // ==========================================
  // RESILIENCE & SAFETY
  // ==========================================
  
  @Column({ type: 'integer', default: 0 })
  retryAttempts: number;
  
  @Column({ type: 'timestamp', nullable: true })
  nextRetryAt?: Date;
  
  @Column({ type: 'jsonb', nullable: true })
  lastError?: {
    code: string;
    message: string;
    timestamp: Date;
  };
}
```

---

### EventRuleEntity

**Purpose:** Defines surveillance rules for Mode 3 (Continuous Monitoring)

```typescript
@Entity('event_rules')
@Index(['userId', 'status'])
@Index(['sourceConnectorType', 'status'])
export class EventRuleEntity {
  
  // ==========================================
  // PRIMARY IDENTIFIERS
  // ==========================================
  
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column({ type: 'uuid' })
  userId: string;
  
  @Column({ type: 'uuid' })
  globalTaskId: string;                    // FK to GlobalTaskEntity that created this
  
  
  // ==========================================
  // DESCRIPTION
  // ==========================================
  
  @Column({ type: 'varchar', length: 255 })
  name: string;                            // "Monitor ICU Heart Rate"
  
  @Column({ type: 'text', nullable: true })
  description?: string;
  
  
  // ==========================================
  // DATA SOURCE
  // ==========================================
  
  @Column({ type: 'varchar', length: 100 })
  sourceConnectorType: string;             // "SENSOR_HEART_RATE", "POSTGRESQL", "KAFKA_TOPIC", etc
  
  @Column({ type: 'uuid', nullable: true })
  sourceConnectorId?: string;              // Optional: specific connector instance
  
  
  // ==========================================
  // CONDITION DEFINITION (The "IF" clause)
  // ==========================================
  
  @Column({ type: 'jsonb' })
  condition: {
    field: string;                         // "bpm" or "employee.salary" or "order.status"
    
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 
              'range' | 'in' | 'nin' | 'contains' | 'regex' | 
              'startsWith' | 'endsWith' | 'between';
    
    value: any;                            // 120 for "gt", [60,120] for "range"
    
    duration?: number;                     // milliseconds - "condition must be true for 30s"
    
    allEventsInDuration?: boolean;         // true: ALL events must match
                                           // false: just the final event must match
  };
  
  
  // ==========================================
  // ACTIONS (The "THEN" clause)
  // ==========================================
  
  @Column({ type: 'text', array: true })
  actions: string[];                       // ["alert_doctor", "log_event", "create_ticket"]
  
  
  // ==========================================
  // DEBOUNCE CONFIGURATION (Prevent spam)
  // ==========================================
  
  @Column({ type: 'jsonb' })
  debounceConfig: {
    enabled: boolean;                      // true = don't spam same alert
    
    strategy: 'immediate' | 'debounce' | 'throttle';
    // • immediate: trigger on every match (no debounce)
    // • debounce: wait N ms, then trigger once
    // • throttle: max 1 trigger per N ms
    
    minIntervalMs?: number;                // Min time between triggers (default 300000ms = 5 min)
    
    maxActionsPerHour?: number;            // Rate limit (default 20)
  };
  
  
  // ==========================================
  // STATUS & LIFECYCLE
  // ==========================================
  
  @Column({
    type: 'enum',
    enum: ['ACTIVE', 'PAUSED', 'STOPPED', 'ERROR']
  })
  status: string;
  
  
  // ==========================================
  // STATISTICS & TRACKING
  // ==========================================
  
  @CreateDateColumn()
  createdAt: Date;
  
  @Column({ type: 'integer', default: 0 })
  totalTriggers: number;                   // How many times has this rule triggered?
  
  @Column({ type: 'timestamp', nullable: true })
  lastTriggeredAt?: Date;
  
  @Column({ type: 'timestamp', nullable: true })
  nextScheduledCheckAt?: Date;
}
```

---

### MissionEntity

**Purpose:** Executable unit of work created from GlobalTask

```typescript
@Entity('missions')
@Index(['userId', 'status'])
@Index(['globalTaskId'])
@Index(['targetNodeId'])
export class MissionEntity {
  
  // ==========================================
  // PRIMARY IDENTIFIERS
  // ==========================================
  
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column({ type: 'uuid' })
  userId: string;
  
  
  // ==========================================
  // RELATIONSHIPS
  // ==========================================
  
  @Column({ type: 'uuid' })
  globalTaskId: string;                    // FK: Which GlobalTask created me?
  
  @Column({ type: 'uuid', nullable: true })
  eventRuleId?: string;                    // FK: If triggered by EventRule, which one?
  
  
  // ==========================================
  // EXECUTION STATUS
  // ==========================================
  
  @Column({
    type: 'enum',
    enum: ['PENDING_EXECUTION', 'EXECUTING', 'COMPLETED', 'FAILED', 'FAILOVER_IN_PROGRESS']
  })
  status: string;
  
  
  // ==========================================
  // ACTIONS (What to do)
  // ==========================================
  
  @Column({ type: 'jsonb' })
  actions: Array<{
    id: string;                            // UUID for tracking individual actions
    type: string;                          // "database_backup", "send_email", "create_sap_form"
    params: Record<string, any>;           // Action-specific parameters
    order: number;                         // Execution order (1, 2, 3, ...)
    status: 'pending' | 'executing' | 'completed' | 'failed';
    result?: any;                          // Return value from action
    error?: {
      code: string;
      message: string;
    };
  }>;
  
  
  // ==========================================
  // NODE ASSIGNMENT (With failover)
  // ==========================================
  
  @Column({ type: 'uuid' })
  targetNodeId: string;                    // Primary NexusNode (main executor)
  
  @Column({ type: 'uuid', array: true, default: [] })
  backupNodeIds: string[];                 // Failover candidates (sorted by capability match)
  
  @Column({ type: 'uuid', nullable: true })
  executedByNodeId?: string;               // Actual node that executed (if different from target)
  
  @Column({ type: 'integer', default: 0 })
  failoverAttempt: number;                 // Track how many failovers occurred
  
  
  // ==========================================
  // EXECUTION PROOF & CRYPTOGRAPHY (Safety)
  // ==========================================
  
  @Column({ type: 'jsonb', nullable: true })
  executionProofCollected?: {
    proof: Record<string, any>;            // {action, result, timestamp, screenshots?}
    
    // 🔐 Cryptographic signing
    cryptographicSignature: string;        // Hex-encoded RSA/ECDSA signature
    signedByNodeId: string;                // Which node's key signed this?
    algorithmUsed: string;                 // "ECDSA-P256" or "RSA-2048"
    signatureTimestamp: Date;
    
    // Verification
    verificationStatus: 'valid' | 'invalid' | 'pending';
    verificationError?: string;
  };
  
  
  // ==========================================
  // TIMING
  // ==========================================
  
  @CreateDateColumn()
  createdAt: Date;
  
  @Column({ type: 'timestamp', nullable: true })
  startedAt?: Date;
  
  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;
  
  @Column({ type: 'integer', nullable: true })
  estimatedDurationMs?: number;            // For UX: "Will take ~2 minutes"
}
```

---

### GlobalTaskStateEntity

**Purpose:** Tracks condition state for Mode 3 (prevents alert spam via debounce)

```typescript
@Entity('global_task_states')
@Index(['userId', 'globalTaskId'])
@Unique(['globalTaskId'])  // One state per task
export class GlobalTaskStateEntity {
  
  // ==========================================
  // PRIMARY IDENTIFIERS
  // ==========================================
  
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column({ type: 'uuid' })
  userId: string;
  
  
  // ==========================================
  // WHICH TASK WE'RE TRACKING
  // ==========================================
  
  @Column({ type: 'uuid' })
  globalTaskId: string;                    // FK: Which GlobalTask's state am I tracking?
  
  
  // ==========================================
  // STATE MACHINE
  // ==========================================
  
  @Column({
    type: 'enum',
    enum: ['NORMAL', 'WARNING', 'CRITICAL', 'RESOLVED']
  })
  currentState: string;
  
  @Column({ type: 'varchar', length: 50, nullable: true })
  previousState?: string;
  
  @UpdateDateColumn()
  stateChangedAt: Date;
  
  
  // ==========================================
  // EVENT CONTEXT
  // ==========================================
  
  @Column({ type: 'jsonb' })
  lastEventData: Record<string, any>;      // The event that caused state change
  
  
  // ==========================================
  // DEBOUNCE TRACKING (Prevent spam)
  // ==========================================
  
  @Column({ type: 'timestamp' })
  lastTriggerTime: Date;                   // When was action last triggered?
  
  @Column({ type: 'integer', default: 0 })
  consecutiveMatches: number;              // How many events matched in current state?
  
  
  // ==========================================
  // SAFETY LIMITS
  // ==========================================
  
  @Column({ type: 'integer', default: 0 })
  actionsTriggeredInCurrentState: number;
  
  @Column({ type: 'integer', default: 100 })
  maxActionsPerStateAllowed: number;       // Failsafe: never trigger > 100 actions in one state
}
```

---

### AuditLogEntity

**Purpose:** Compliance & non-repudiation - every action is logged and cryptographically signed

```typescript
@Entity('audit_logs')
@Index(['userId', 'timestamp'])
@Index(['missionId'])
@Index(['globalTaskId'])
export class AuditLogEntity {
  
  // ==========================================
  // PRIMARY IDENTIFIERS
  // ==========================================
  
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column({ type: 'uuid' })
  userId: string;
  
  
  // ==========================================
  // WHAT HAPPENED
  // ==========================================
  
  @Column({ type: 'uuid' })
  missionId: string;
  
  @Column({ type: 'uuid', nullable: true })
  globalTaskId?: string;
  
  @Column({ type: 'uuid', nullable: true })
  eventRuleId?: string;
  
  @Column({ type: 'varchar', length: 100 })
  action: string;                          // "database_backup", "send_alert", etc
  
  @Column({
    type: 'enum',
    enum: ['success', 'failed', 'failover', 'warning']
  })
  result: string;
  
  
  // ==========================================
  // EXECUTION PROOF (from NexusNode)
  // ==========================================
  
  @Column({ type: 'jsonb' })
  executionProof: Record<string, any>;     // Raw proof data from node
  
  
  // ==========================================
  // 🔐 CRYPTOGRAPHIC SIGNING (Compliance)
  // ==========================================
  
  @Column({ type: 'text' })
  cryptographicSignature: string;          // Hex-encoded signature (256+ characters)
  
  @Column({ type: 'uuid' })
  signedByNodeId: string;                  // Which node's private key signed this?
  
  @Column({ type: 'text' })
  nodeCertificatePem: string;              // Node's public certificate (for verification)
  
  @Column({ type: 'varchar', length: 50 })
  signatureAlgorithm: string;              // "ECDSA-P256", "RSA-2048", etc
  
  @Column({ type: 'timestamp' })
  signatureTimestamp: Date;                // When was it signed?
  
  @Column({
    type: 'enum',
    enum: ['valid', 'invalid', 'pending']
  })
  verificationStatus: string;              // Did signature check out?
  
  @Column({ type: 'text', nullable: true })
  verificationError?: string;              // If invalid, why?
  
  
  // ==========================================
  // WHEN
  // ==========================================
  
  @CreateDateColumn()
  timestamp: Date;
  
  
  // ==========================================
  // CONTEXT
  // ==========================================
  
  @Column({ type: 'text', nullable: true })
  notes?: string;                          // Additional context/comments
}
```

---

## DTOs & API Contracts

### CompileTaskDto
**Endpoint:** `POST /tasks/compile`  
**Purpose:** Parse user intent without executing

```typescript
export class CompileTaskDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  userInput: string;
  
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  connectorIds?: string[];  // Hint: which connectors to use
}

// Response (200 OK):
{
  "status": "parsed",
  "intent": {
    "action": "backup_database",
    "parameters": {
      "schedule": "daily_02:00",
      "includeLogsDirectory": true,
      "reportRecipient": "admin@company.com"
    },
    "confidence": 0.92,
    "parsingModel": "gpt-4-turbo"
  },
  "detectedMode": "DIRECT",
  "previewMissions": [
    {
      "actionType": "database_backup",
      "params": {...},
      "estimatedDurationMs": 120000
    },
    {
      "actionType": "send_email",
      "params": {...},
      "estimatedDurationMs": 5000
    }
  ]
}

// Response (400 Bad Request - parsing failed):
{
  "error": "Could not parse intent",
  "suggestion": "Try being more specific: 'Backup database to S3 every day at 2 AM'"
}
```

---

### CreateTaskDto
**Endpoint:** `POST /tasks`  
**Purpose:** Create and execute task (Mode 2) or create surveillance rule (Mode 3)

```typescript
export class CreateTaskDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  userInput: string;
  
  @IsEnum(['DIRECT', 'MONITORING'])
  mode: 'DIRECT' | 'MONITORING';
  
  @IsArray()
  @ArrayMinSize(1)
  connectorIds: string[];
  
  @IsOptional()
  @IsObject()
  parameters?: Record<string, any>;  // Override parsed parameters?
}

// Response (200 OK) - Mode 2 (Direct):
{
  "taskId": "task-uuid-1",
  "type": "DIRECT",
  "status": "EXECUTING",
  "missionIds": ["mission-uuid-1", "mission-uuid-2"],
  "estimatedCompletionTime": "2 minutes",
  "statusCheckUrl": "/tasks/task-uuid-1"
}

// Response (200 OK) - Mode 3 (Monitoring):
{
  "taskId": "task-uuid-2",
  "type": "MONITORING",
  "status": "ACTIVE",
  "ruleId": "rule-uuid-1",
  "ruleName": "Monitor ICU Heart Rate",
  "condition": {
    "field": "bpm",
    "operator": "range",
    "value": [120, 60]
  },
  "nextCheckAt": "in 5 seconds",
  "statusCheckUrl": "/tasks/task-uuid-2",
  "stopUrl": "DELETE /tasks/task-uuid-2"
}
```

---

### ExecuteTaskDto
**Endpoint:** `POST /tasks/:taskId/execute`  
**Purpose:** Explicitly trigger execution now (for Mode 2 tasks in PENDING state)

```typescript
export class ExecuteTaskDto {
  @IsOptional()
  @IsBoolean()
  async?: boolean;  // false = wait for result (blocking)
                    // true = return immediately (fire and forget)
}

// Response (200 OK) - Sync (async=false or missing):
{
  "taskId": "task-uuid-1",
  "executionStatus": "COMPLETED",
  "completedAt": "2026-02-18T14:35:22Z",
  "missions": [
    {
      "missionId": "mission-uuid-1",
      "status": "COMPLETED",
      "executedByNodeId": "node-uuid-5",
      "proof": {
        "action": "database_backup",
        "result": "Backup file: /backups/db_20260218_143500.tar.gz",
        "timestamp": "2026-02-18T14:35:20Z"
      },
      "cryptographicSignature": "a1b2c3d4e5f6...",
      "signatureValid": true
    },
    {
      "missionId": "mission-uuid-2",
      "status": "COMPLETED",
      "proof": {
        "action": "send_email",
        "result": "Email sent to admin@company.com",
        "deliveryProof": "Message ID from Sendgrid: sg12345678"
      }
    }
  ],
  "auditLog": [
    {
      "logId": "audit-uuid-1",
      "timestamp": "2026-02-18T14:35:20Z",
      "action": "database_backup",
      "result": "success",
      "signatureValid": true
    }
  ]
}

// Response (202 Accepted) - Async (async=true):
{
  "taskId": "task-uuid-1",
  "status": "EXECUTING",
  "message": "Task execution started in background",
  "pollUrl": "/tasks/task-uuid-1/status",
  "estimatedCompletion": "2026-02-18T14:35:20Z"
}
```

---

### CreateRuleDto
**Endpoint:** `POST /rules`  
**Purpose:** Create surveillance rule (Mode 3)

```typescript
export class CreateRuleDto {
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  userInput: string;
  
  @IsString()
  connectorId: string;  // Which data source to monitor
}

// Response (201 Created):
{
  "ruleId": "rule-uuid-1",
  "globalTaskId": "task-uuid-2",
  "status": "ACTIVE",
  "name": "Monitor ICU Heart Rate",
  "condition": {
    "field": "bpm",
    "operator": "range",
    "value": [120, 60],
    "duration": 30000
  },
  "actions": ["alert_doctor", "log_event", "create_ticket"],
  "debounceConfig": {
    "minIntervalMs": 300000,
    "maxActionsPerHour": 20
  },
  "nextCheckAt": "2026-02-18T14:32:35Z",
  "statistics": {
    "totalTriggers": 0,
    "lastTriggeredAt": null
  }
}
```

---

### GetTaskDto (Response)
**Endpoint:** `GET /tasks/:taskId`  
**Purpose:** Get task status and details

```typescript
// Response (200 OK) - Mode 2 (COMPLETED):
{
  "taskId": "task-uuid-1",
  "type": "DIRECT",
  "status": "COMPLETED",
  "originalUserInput": "Back up database now...",
  "intent": {...},
  "missionIds": ["mission-uuid-1", "mission-uuid-2"],
  "createdAt": "2026-02-18T14:32:00Z",
  "completedAt": "2026-02-18T14:35:22Z",
  "durationMs": 202000,
  "results": {
    "missions": [...],
    "auditLogs": [...]
  }
}

// Response (200 OK) - Mode 3 (ACTIVE surveillance):
{
  "taskId": "task-uuid-2",
  "type": "MONITORING",
  "status": "ACTIVE",
  "linkedEventRuleId": "rule-uuid-1",
  "originalUserInput": "Monitor heart rate...",
  "createdAt": "2026-02-18T14:32:00Z",
  "stoppedAt": null,
  "rule": {
    "name": "Monitor ICU Heart Rate",
    "condition": {...},
    "actions": [...]
  },
  "statistics": {
    "totalTrigersToDate": 5,
    "lastTriggeredAt": "2026-02-18T14:40:15Z",
    "averageTimeBetweenTriggers": 120000
  }
}
```

---

### StopRuleDto
**Endpoint:** `DELETE /tasks/:taskId` (for Mode 3) or `POST /tasks/:taskId/stop`  
**Purpose:** Stop surveillance rule

```typescript
// Request (no body needed)

// Response (200 OK):
{
  "taskId": "task-uuid-2",
  "status": "STOPPED",
  "stoppedAt": "2026-02-18T14:50:00Z",
  "finalStatistics": {
    "totalTriggers": 5,
    "activeDurationMs": 1080000
  }
}
```

---

## Service Architecture

### TaskCompilerService (Main Orchestrator)

```typescript
@Injectable()
export class TaskCompilerService {
  
  constructor(
    private llmIntentParser: LlmIntentParserService,
    private queryGenerator: QueryGeneratorService,
    private missionGenerator: MissionGeneratorService,
    private missionDispatcher: MissionDispatcherService,
    private eventRuleService: EventRuleService,
    private taskRepository: Repository<GlobalTaskEntity>,
    private stateRepository: Repository<GlobalTaskStateEntity>,
    private auditService: AuditLogService,
  ) {}
  
  // ==========================================
  // MAIN ENTRY POINTS
  // ==========================================
  
  /**
   * Step 1: Parse user input into intent
   * Does NOT execute, just returns structure
   */
  async parseIntent(userInput: string): Promise<{
    action: string;
    parameters: Record<string, any>;
    confidence: number;
    detectedMode: 'DIRECT' | 'MONITORING';
  }> {
    return this.llmIntentParser.parse(userInput);
  }
  
  /**
   * Step 2: Create GlobalTask + generate missions for Mode 2
   * Executes immediately
   */
  async executeDirectMode(
    userId: string,
    userInput: string,
    connectorIds: string[]
  ): Promise<GlobalTaskEntity> {
    
    // Parse intent
    const intent = await this.parseIntent(userInput);
    
    // Create GlobalTask (DIRECT)
    const task = await this.taskRepository.save({
      userId,
      type: 'DIRECT',
      status: 'PENDING',
      originalUserInput: userInput,
      intent,
      targetConnectorIds: connectorIds,
    });
    
    // Generate missions
    const missions = await this.missionGenerator.generateMissions(
      task,
      intent
    );
    
    // Dispatch missions (will execute on NexusNodes)
    for (const mission of missions) {
      await this.missionDispatcher.dispatch(mission);
    }
    
    // Wait for completion (or timeout)
    await this.waitForMissionCompletion(missions);
    
    // Mark task complete
    task.status = 'COMPLETED';
    task.completedAt = new Date();
    await this.taskRepository.save(task);
    
    return task;
  }
  
  /**
   * Step 3: Create EventRule for Mode 3
   * Does NOT execute, starts continuous monitoring
   */
  async createSurveillanceRule(
    userId: string,
    userInput: string,
    connectorId: string
  ): Promise<EventRuleEntity> {
    
    // Parse intent
    const intent = await this.parseIntent(userInput);
    
    // Create GlobalTask (MONITORING)
    const task = await this.taskRepository.save({
      userId,
      type: 'MONITORING',
      status: 'ACTIVE',
      originalUserInput: userInput,
      intent,
    });
    
    // Create EventRule
    const rule = await this.eventRuleService.create({
      userId,
      globalTaskId: task.id,
      name: intent.action,
      sourceConnectorId: connectorId,
      condition: intent.condition,
      actions: intent.actions,
    });
    
    // Link task to rule
    task.linkedEventRuleId = rule.id;
    await this.taskRepository.save(task);
    
    // Create initial state tracker
    await this.stateRepository.save({
      userId,
      globalTaskId: task.id,
      currentState: 'NORMAL',
      lastEventData: {},
      lastTriggerTime: new Date(),
    });
    
    // Register rule in event sensor (starts monitoring)
    await this.eventSensorService.registerRule(rule);
    
    return rule;
  }
  
  /**
   * Called by EventSensorService when condition matches
   */
  async handleRuleMatch(rule: EventRuleEntity, event: any): Promise<Mission[]> {
    
    // Get current task state
    const taskState = await this.stateRepository.findOne({
      where: { globalTaskId: rule.globalTaskId }
    });
    
    const newState = this.evaluateCondition(event, rule.condition, taskState);
    
    // Only trigger if state CHANGED (debounce)
    if (newState !== taskState.currentState) {
      
      // Check debounce window
      const timeSinceLastTrigger = Date.now() - taskState.lastTriggerTime.getTime();
      if (timeSinceLastTrigger < rule.debounceConfig.minIntervalMs) {
        // Within debounce window, skip
        return [];
      }
      
      // State changed AND debounce expired → TRIGGER!
      const missions = await this.missionGenerator.generateMissions(
        { ...taskState, id: rule.globalTaskId },
        { actions: rule.actions, parameters: event }
      );
      
      // Update state
      taskState.currentState = newState;
      taskState.previousState = taskState.currentState;
      taskState.stateChangedAt = new Date();
      taskState.lastTriggerTime = new Date();
      taskState.lastEventData = event;
      await this.stateRepository.save(taskState);
      
      // Dispatch missions
      for (const mission of missions) {
        await this.missionDispatcher.dispatch(mission);
      }
      
      return missions;
    }
    
    return [];  // No trigger
  }
  
  /**
   * Stop surveillance rule
   */
  async stopRule(userId: string, ruleId: string): Promise<void> {
    const rule = await this.eventRuleService.findOne(ruleId, userId);
    rule.status = 'STOPPED';
    await this.eventRuleService.save(rule);
    
    // Unregister from sensors
    await this.eventSensorService.unregisterRule(ruleId);
    
    // Update GlobalTask status
    const task = await this.taskRepository.findOne({
      where: { linkedEventRuleId: ruleId }
    });
    task.status = 'STOPPED';
    task.stoppedAt = new Date();
    await this.taskRepository.save(task);
  }
  
  // ==========================================
  // HELPER METHODS
  // ==========================================
  
  private evaluateCondition(event: any, condition: any, state: any): string {
    const value = this.getFieldValue(event, condition.field);
    const matches = this.checkCondition(value, condition.operator, condition.value);
    
    return matches ? 'CRITICAL' : 'NORMAL';
  }
  
  private checkCondition(value: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'eq': return value === expected;
      case 'gt': return value > expected;
      case 'gte': return value >= expected;
      case 'lt': return value < expected;
      case 'lte': return value <= expected;
      case 'range': return (expected[0] && value > expected[0]) || 
                           (expected[1] && value < expected[1]);
      case 'in': return expected.includes(value);
      case 'contains': return String(value).includes(expected);
      case 'regex': return new RegExp(expected).test(String(value));
      default: return false;
    }
  }
  
  private getFieldValue(obj: any, path: string): any {
    // Support nested paths like "employee.salary" → obj.employee.salary
    return path.split('.').reduce((val, key) => val?.[key], obj);
  }
  
  private async waitForMissionCompletion(missions: MissionEntity[]): Promise<void> {
    // Poll until all missions complete or timeout
    const timeout = 5 * 60 * 1000;  // 5 minutes
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const allComplete = missions.every(m => 
        m.status === 'COMPLETED' || m.status === 'FAILED'
      );
      
      if (allComplete) return;
      
      await new Promise(resolve => setTimeout(resolve, 1000));  // Check every 1s
    }
    
    throw new Error('Mission execution timeout');
  }
}
```

---

## Concrete Examples

### Example 1: Mode 2 (Direct Execution)

```
USER INPUT:
"Back up database now and send report to admin@company.com"

STEP 1: parseIntent()
  LLM analyzes:
  → action: "backup_database"
  → parameters: { recipient: "admin@company.com" }
  → mode: "DIRECT" (one-time request)
  → confidence: 0.95

STEP 2: executeDirectMode()
  Create GlobalTaskEntity:
  {
    id: "gtask-abc123",
    type: "DIRECT",
    status: "PENDING",
    originalUserInput: "Back up database now...",
    intent: {...},
    targetConnectorIds: ["connector-postgres-1"]
  }

  Generate Missions:
  → Mission 1: backup_database action
  → Mission 2: send_email action (sends report)

  Both missions created with status PENDING_EXECUTION

STEP 3: Dispatch
  Mission 1 → Node A (has database_backup capability)
  Mission 2 → Node B (has send_email capability)
  Set Dead Man's Switch timers (30s each)

STEP 4: Execute
  Node A:
    • Backup DB to /backups/db_20260218_143500.sql
    • Signs proof with private key
    • Sends: {proof, signature}
  
  Node B:
    • Send email with backup report attachment
    • Signs proof with private key
    • Sends: {proof, signature}

STEP 5: Collect & Verify
  Server receives both proofs
  Verifies signatures with node public certs
  Creates AuditLogEntity entries with verified signatures

STEP 6: Return Complete
  {
    status: "COMPLETED",
    missions: [
      {
        id: "mission-1",
        action: "backup_database",
        proof: {
          file: "/backups/db_20260218_143500.sql",
          size: "2.5GB"
        },
        signatureValid: true ✓
      },
      {
        id: "mission-2",
        action: "send_email",
        proof: {
          recipient: "admin@company.com",
          deliveryId: "sg12345678"
        },
        signatureValid: true ✓
      }
    ]
  }

API Response to User:
  HTTP 200 OK
  {
    "status": "COMPLETED",
    "completedAt": "2026-02-18T14:35:22Z",
    "missions": [...]
  }
```

---

### Example 2: Mode 3 (Continuous Monitoring)

```
USER INPUT:
"Monitor heart rate sensor. If BPM > 120 OR < 60 for more than 30 seconds,
alert doctor and create incident ticket"

STEP 1: parseIntent()
  LLM analyzes:
  → action: "monitor_heart_rate"
  → trigger: { field: "bpm", operator: "range", value: [120, 60], duration: 30000 }
  → actions: ["alert_doctor", "create_incident"]
  → mode: "MONITORING" (ongoing rule)
  → confidence: 0.98

STEP 2: createSurveillanceRule()
  Create GlobalTaskEntity:
  {
    id: "gtask-xyz789",
    type: "MONITORING",
    status: "ACTIVE",
    linkedEventRuleId: "rule-hr-monitor"
  }

  Create EventRuleEntity:
  {
    id: "rule-hr-monitor",
    name: "Monitor Heart Rate",
    sourceConnectorType: "SENSOR_HEART_RATE",
    condition: {
      field: "bpm",
      operator: "range",
      value: [120, 60],
      duration: 30000  // milliseconds
    },
    actions: ["alert_doctor", "create_incident"],
    debounceConfig: {
      minIntervalMs: 300000  // 5 min between alerts
    },
    status: "ACTIVE"
  }

  Create GlobalTaskStateEntity:
  {
    globalTaskId: "gtask-xyz789",
    currentState: "NORMAL",
    lastTriggerTime: now()
  }

  System NOW STARTS MONITORING

STEP 3: Continuous polling
  Every 5 seconds, query heart rate sensor

  t=00:00 → BPM=110 → Match? NO → state=NORMAL → No action
  t=00:05 → BPM=110 → Match? NO → state=NORMAL → No action
  t=00:10 → BPM=125 → Match? YES!
    └─→ State changed (NORMAL → CRITICAL)
    └─→ Check debounce: last trigger was 5s ago, debounce is 5min → OK
    └─→ ⭐ GENERATE MISSIONS ⭐
        • Mission 1: alert_doctor
        • Mission 2: create_incident
    └─→ Dispatch missions to nodes
    └─→ Update state: lastTriggerTime = t(00:10), actionsTriggered++

  t=00:11 → BPM=127 → Match? YES, state=CRITICAL (same!)
    └─→ Within debounce window (only 1 second since trigger)
    └─→ No action (avoid spam)

  t=00:12 → BPM=128 → Match? YES, state=CRITICAL (same!)
    └─→ Within debounce window
    └─→ No action

  t=00:15 → BPM=115 → Match? NO
    └─→ State changed (CRITICAL → NORMAL)
    └─→ Check debounce: last trigger was 5 seconds ago, debounce expired? No (still < 5min)
    └─→ Depends on strategy: "debounce" means wait, so NO ACTION yet

  t=05:10 → BPM=110 → Match? NO, state=NORMAL (same!)
    └─→ Still no action (already normal)

  ... LOOP CONTINUES FOREVER ...

  WHEN USER STOPS:
  User: "Stop monitoring heart rate"
  
  DELETE /tasks/gtask-xyz789
  
  System:
    1. Mark rule as STOPPED
    2. Unregister from sensor
    3. Stop polling
    4. Final statistics: "Monitored for 30 min, triggered 3 times"

API Response to User:
  HTTP 201 Created
  {
    "taskId": "gtask-xyz789",
    "type": "MONITORING",
    "status": "ACTIVE",
    "ruleId": "rule-hr-monitor",
    "nextCheckAt": "in 5 seconds",
    "statistics": {
      "totalTriggers": 0  // Not triggered yet
    }
  }
```

---

## Key Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| **Parse with LLM?** | YES - GPT-4-turbo | Best understanding of natural language across domains |
| **Cache LLM results?** | YES - 24h TTL | Reduce API costs |
| **Async execution?** | Both options (user choice) | Different needs: immediate vs background |
| **Debounce at state level?** | YES | More flexible per-task configuration |
| **Store all proofs forever?** | YES - archive to S3 after 30d | Compliance requirement |
| **Support complex conditions (AND/OR)?** | YES | Users need logical operators |
| **Signature algorithm?** | ECDSA-P256 | Fast, secure, modern |
| **Max failure retries?** | 3 attempts | Balances resilience vs overhead |
| **Timeout for Mode 2?** | 5 minutes | Reasonable for most operations |
| **Debounce default?** | 5 minutes | Prevents alert fatigue |

---

## Implementation Checklist

### Day 1-2: Types & Entities

- [ ] Create `/src/tasks/types/standard-event.ts` - Universal event format
- [ ] Create `/src/tasks/types/task.types.ts` - Enums & interfaces
- [ ] Create `/src/tasks/entities/global-task.entity.ts`
- [ ] Create `/src/tasks/entities/event-rule.entity.ts`
- [ ] Create `/src/tasks/entities/mission.entity.ts`
- [ ] Create `/src/tasks/entities/task-state.entity.ts`
- [ ] Create `/src/tasks/entities/audit-log.entity.ts`
- [ ] Register all entities in TypeORM (`app.module.ts`)
- [ ] Run migrations: `npm run migration:generate`

### Day 3-4: DTOs & Services

- [ ] Create `/src/tasks/dto/` directory with all DTOs
- [ ] Create `TaskCompilerService` (main orchestrator)
- [ ] Create `LlmIntentParserService` (LLM integration)
- [ ] Create `QueryGeneratorService` (intent → SQL)
- [ ] Create `MissionGeneratorService` (task → missions)
- [ ] Create `MissionDispatcherService` (route → nodes)

### Day 5: API Endpoints

- [ ] Create `TasksController` with all endpoints
  - `POST /tasks/compile`
  - `POST /tasks`
  - `GET /tasks/:id`
  - `POST /tasks/:id/execute`
  - `POST /tasks/:id/stop`
- [ ] Add Swagger documentation
- [ ] Add request/response validation

### Day 6-7: Testing

- [ ] Unit tests for all services
- [ ] E2E test: Mode 2 workflow (parse → create → execute)
- [ ] E2E test: Mode 3 workflow (parse → create rule)
- [ ] Mock NexusNode responses for local testing

### Day 8-10: Safety & Polish

- [ ] Implement debounce/stateful tracking
- [ ] Implement signature verification
- [ ] Error handling & retries
- [ ] Logging & monitoring
- [ ] Load testing

---

**Status:** Ready to implement  
**Next:** Begin Day 1 with entity creation

