# 🚀 EyeFlow - API Reference & Interactive Guide

**Version:** 3.0  
**Date:** 19 février 2026  
**Status:** ✅ Production Ready  

---

## 📑 Quick Navigation

- [Health Check](#health-check)
- [Task Compilation](#task-compilation) 
- [Task Execution](#task-execution)
- [Rules Management](#rules-management)
- [LLM Sessions](#llm-sessions)
- [Projects & Versioning](#projects--versioning)
- [Context & Manifest](#context--manifest)
- [Connectors](#connectors)
- [Agents](#agents)
- [Actions](#actions)

---

## Health Check

### GET `/health`

**Purpose:** Check server status  
**Response:** Server health status + version

```bash
curl -X GET http://localhost:3000/health
```

**Response:**
```json
{
  "status": "ok",
  "message": "🚀 EyeFlow Server is running!",
  "timestamp": "2026-02-19T12:34:56.000Z",
  "version": "1.0.0"
}
```

### GET `/api`

**Purpose:** Get API information  
**Response:** All available endpoints

```bash
curl -X GET http://localhost:3000/api
```

**Response:**
```json
{
  "name": "EyeFlow API",
  "version": "1.0.0",
  "description": "Universal Action Execution & Monitoring Platform",
  "endpoints": [
    {
      "method": "GET",
      "path": "/health",
      "description": "Server health status"
    },
    {
      "method": "POST",
      "path": "/tasks/compile",
      "description": "Compile task from natural language"
    },
    ...
  ]
}
```

---

## Task Compilation

### POST `/tasks/compile`

**Purpose:** Compile natural language to executable task  
**Headers:** `X-User-ID` (required)  
**Body:** TaskDTO  
**Response:** TaskCompilationResultDto

```bash
curl -X POST http://localhost:3000/tasks/compile \
  -H "X-User-ID: user123" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Envoie un message Slack si une query SQL échoue",
    "llmModel": "gpt-4",
    "temperature": 0.7,
    "maxTokens": 2000
  }'
```

**Request Body Schema:**
```json
{
  "description": "string (required)",     // Natural language intent
  "llmModel": "string (optional)",        // LLM model (default: gpt-4)
  "temperature": "number (0-1)",          // Randomness (default: 0.7)
  "maxTokens": "number",                  // Max tokens (default: 2000)
  "systemPrompt": "string (optional)"     // Custom system prompt
}
```

**Response:**
```json
{
  "taskId": "task_550e8400-e29b-41d4-a716-446655440000",
  "status": "COMPILED",
  "timestamp": "2026-02-19T12:34:56.000Z",
  "compilationMetrics": {
    "parseTime": 1250,
    "validationTime": 350,
    "dagBuildingTime": 150,
    "compilationTime": 200,
    "irGenerationTime": 100,
    "totalTime": 2050
  },
  "validationMetrics": {
    "requestsTotal": 1,
    "requestsSuccessful": 1,
    "requestsFailed": 0,
    "retriesCount": 0,
    "escalationCount": 0,
    "avgLatency": 350
  },
  "executionPlan": {
    "id": "plan_550e8400",
    "nodes": [
      {
        "id": "trigger_1",
        "type": "TRIGGER",
        "source": "sql_query",
        "status": "OK"
      },
      {
        "id": "condition_1",
        "type": "CONDITION",
        "operator": "EQUALS",
        "status": "OK"
      },
      {
        "id": "action_1",
        "type": "ACTION",
        "target": "slack.send_message",
        "status": "OK"
      }
    ],
    "edges": [
      { "from": "trigger_1", "to": "condition_1" },
      { "from": "condition_1", "to": "action_1" }
    ],
    "signature": "sha256:abcd1234..."
  }
}
```

**Response Codes:**
- `200 OK` - Compilation successful
- `400 Bad Request` - Invalid input
- `422 Unprocessable Entity` - Validation failed
- `500 Internal Server Error` - Server error

---

### POST `/tasks`

**Purpose:** Create AND optionally compile task (Mode 2 or Mode 3)  
**Headers:** `X-User-ID` (required)  
**Body:** CreateTaskDto

```bash
curl -X POST http://localhost:3000/tasks \
  -H "X-User-ID: user123" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SQL Failure Alert",
    "description": "Send Slack message when SQL query fails",
    "mode": "MODE_2",
    "autoCompile": true,
    "autoExecute": false
  }'
```

**Request Body Schema:**
```json
{
  "name": "string (required)",
  "description": "string (required)",
  "mode": "MODE_2 | MODE_3 (required)",  // Compilation mode
  "autoCompile": "boolean (default: false)",
  "autoExecute": "boolean (default: false)",
  "parameters": "object (optional)",
  "executionTimeout": "number (ms, default: 30000)"
}
```

**Response:** TaskCompilationResultDto (same as POST /tasks/compile)

---

### GET `/tasks/:id`

**Purpose:** Get task status with full details  
**URL Params:**
- `id` - Task ID

```bash
curl -X GET http://localhost:3000/tasks/task_550e8400 \
  -H "X-User-ID: user123"
```

**Response:**
```json
{
  "id": "task_550e8400",
  "name": "SQL Failure Alert",
  "description": "Send Slack message when SQL query fails",
  "status": "COMPILED",
  "compilationStatus": "SUCCESS",
  "executionStatus": "PENDING",
  "createdAt": "2026-02-19T12:34:56.000Z",
  "compiledAt": "2026-02-19T12:34:58.000Z",
  "executionPlan": {...},
  "metrics": {...},
  "auditLog": [...]
}
```

---

## Task Execution

### POST `/tasks/:id/execute`

**Purpose:** Execute compiled task  
**URL Params:**
- `id` - Task ID

```bash
curl -X POST http://localhost:3000/tasks/task_550e8400/execute \
  -H "X-User-ID: user123" \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": {
      "sqlQuery": "SELECT * FROM users WHERE status = failed"
    },
    "timeout": 30000,
    "retryOnFail": true,
    "maxRetries": 3
  }'
```

**Request Body Schema:**
```json
{
  "parameters": "object (optional)",        // Override task parameters
  "timeout": "number (ms, optional)",       // Execution timeout
  "retryOnFail": "boolean (default: true)",
  "maxRetries": "number (default: 3)",
  "dryRun": "boolean (default: false)"      // Simulate without execution
}
```

**Response:**
```json
{
  "executionId": "exec_550e8400-e29b-41d4",
  "taskId": "task_550e8400",
  "status": "SUCCESS",
  "timestamp": "2026-02-19T12:35:00.000Z",
  "steps": [
    {
      "nodeId": "trigger_1",
      "nodeName": "SQL Query Monitor",
      "type": "TRIGGER",
      "status": "SUCCESS",
      "startTime": "2026-02-19T12:35:00.000Z",
      "endTime": "2026-02-19T12:35:00.010Z",
      "duration": 10,
      "result": {
        "query_executed": true,
        "rows_affected": 5,
        "error": null
      }
    },
    {
      "nodeId": "condition_1",
      "nodeName": "Check Status Failed",
      "type": "CONDITION",
      "status": "SUCCESS",
      "duration": 5,
      "condition_result": true
    },
    {
      "nodeId": "action_1",
      "nodeName": "Send Slack Alert",
      "type": "ACTION",
      "status": "SUCCESS", 
      "duration": 50,
      "result": {
        "message_sent": true,
        "slack_ts": "1708348500.000100",
        "channel": "#alerts"
      }
    }
  ],
  "outputs": {
    "slack_ts": "1708348500.000100",
    "message": "🚨 SQL Query Failed - 5 rows affected"
  },
  "metrics": {
    "totalDuration": 65,
    "successRate": 1.0,
    "stepCount": 3,
    "connectorCalls": 2
  },
  "auditTrail": [
    {
      "timestamp": "2026-02-19T12:35:00.000Z",
      "action": "EXECUTION_START",
      "details": "Started execution of task_550e8400"
    },
    {
      "timestamp": "2026-02-19T12:35:00.010Z",
      "action": "TRIGGER_FIRED",
      "details": "SQL query monitor triggered with result: 5 rows"
    },
    [...]
  ]
}
```

---

## Rules Management

### POST `/tasks/rules`

**Purpose:** Create an event-driven surveillance rule  
**Headers:** `X-User-ID` (required)  
**Body:** CreateEventRuleDto

```bash
curl -X POST http://localhost:3000/tasks/rules \
  -H "X-User-ID: user123" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Compliance Monitor",
    "description": "Monitor compliance checks and alert on failures",
    "trigger": {
      "type": "ON_EVENT",
      "source": "compliance_check_completed"
    },
    "conditions": [
      {
        "type": "EQUALS",
        "field": "status",
        "value": "FAILED"
      }
    ],
    "actions": [
      {
        "type": "SEND_MESSAGE",
        "payload": {
          "connector": "slack",
          "functionId": "send_message",
          "parameters": {
            "channel": "#compliance-alerts",
            "text": "⚠️ Compliance Check Failed",
            "priority": "high"
          }
        }
      },
      {
        "type": "LOG_AUDIT",
        "payload": {
          "connector": "postgres",
          "functionId": "insert_audit",
          "parameters": {
            "table": "compliance_audit",
            "data": {
              "event": "COMPLIANCE_FAILURE",
              "severity": "HIGH"
            }
          }
        }
      }
    ],
    "enabled": true
  }'
```

**Request Body Schema:**
```json
{
  "name": "string (required)",
  "description": "string (optional)",
  "trigger": {
    "type": "ON_EVENT | ON_SCHEDULE | ON_CREATE | ON_UPDATE | etc",
    "source": "string (event source or schedule pattern)",
    "schedule": "string (CRON format, if ON_SCHEDULE)"
  },
  "conditions": [
    {
      "type": "EQUALS | NOT_EQUALS | CONTAINS | GREATER_THAN | LESS_THAN",
      "field": "string",
      "value": "any"
    }
  ],
  "actions": [
    {
      "type": "SEND_MESSAGE | LOG_AUDIT | QUERY_DB | HTTP_CALL",
      "payload": {
        "connector": "string",
        "functionId": "string",
        "parameters": "object"
      }
    }
  ],
  "enabled": "boolean (default: true)",
  "priority": "1-5 (optional)"
}
```

**Response:**
```json
{
  "ruleId": "rule_550e8400",
  "name": "Compliance Monitor",
  "status": "ACTIVE",
  "createdAt": "2026-02-19T12:34:56.000Z",
  "compilationStatus": "SUCCESS",
  "totalExecutions": 0
}
```

---

### GET `/tasks/rules/:id`

**Purpose:** Get rule details  
**URL Params:**
- `id` - Rule ID

```bash
curl -X GET http://localhost:3000/tasks/rules/rule_550e8400 \
  -H "X-User-ID: user123"
```

**Response:**
```json
{
  "ruleId": "rule_550e8400",
  "name": "Compliance Monitor",
  "description": "Monitor compliance checks...",
  "status": "ACTIVE",
  "createdAt": "2026-02-19T12:34:56.000Z",
  "updatedAt": "2026-02-19T12:34:56.000Z",
  "trigger": {...},
  "conditions": [...],
  "actions": [...],
  "executionHistory": [
    {
      "executionId": "exec_xxx",
      "timestamp": "2026-02-19T12:35:00.000Z",
      "status": "SUCCESS",
      "duration": 150
    }
  ],
  "metrics": {
    "totalExecutions": 42,
    "successfulExecutions": 41,
    "failedExecutions": 1,
    "averageDuration": 125
  }
}
```

---

### PUT `/tasks/rules/:id`

**Purpose:** Update rule  

```bash
curl -X PUT http://localhost:3000/tasks/rules/rule_550e8400 \
  -H "X-User-ID: user123" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": false,
    "actions": [...]
  }'
```

**Response:** Updated rule object

---

### DELETE `/tasks/rules/:id`

**Purpose:** Disable/delete rule  

```bash
curl -X DELETE http://localhost:3000/tasks/rules/rule_550e8400 \
  -H "X-User-ID: user123"
```

**Response:**
```json
{
  "success": true,
  "message": "Rule deleted successfully",
  "ruleId": "rule_550e8400"
}
```

---

## LLM Sessions

### POST `/llm-sessions`

**Purpose:** Create new LLM session for multi-turn conversation  
**Headers:** `X-User-ID` (required)

```bash
curl -X POST http://localhost:3000/llm-sessions \
  -H "X-User-ID: user123" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "systemPrompt": "You are an expert task compiler...",
    "temperature": 0.7
  }'
```

**Response:**
```json
{
  "sessionId": "session_550e8400",
  "userId": "user123",
  "model": "gpt-4",
  "createdAt": "2026-02-19T12:34:56.000Z",
  "messageCount": 0,
  "conversationHistory": []
}
```

---

### POST `/llm-sessions/:id/message`

**Purpose:** Send message in LLM session  

```bash
curl -X POST http://localhost:3000/llm-sessions/session_550e8400/message \
  -H "X-User-ID: user123" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Can you modify the Slack action to use a different channel?"
  }'
```

**Response:**
```json
{
  "sessionId": "session_550e8400",
  "message": "Can you modify the Slack action to use a different channel?",
  "response": "I can help with that. To change the Slack channel, I would modify the parameters...",
  "messageCount": 1,
  "generatedTask": {
    "taskId": "task_550e8401",
    "status": "COMPILED",
    "executionPlan": {...}
  }
}
```

---

## Projects & Versioning

### POST `/projects`

**Purpose:** Create new LLM project (with versioning)  
**Headers:** `X-User-ID` (required)

```bash
curl -X POST http://localhost:3000/projects \
  -H "X-User-ID: user123" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Compliance Automation Suite",
    "description": "Automated compliance checks with notifications",
    "namespace": "compliance"
  }'
```

**Response:**
```json
{
  "projectId": "proj_550e8400",
  "name": "Compliance Automation Suite",
  "namespace": "compliance",
  "version": "0.0.1",
  "status": "CREATED",
  "createdAt": "2026-02-19T12:34:56.000Z",
  "compilations": [],
  "versions": []
}
```

---

### POST `/projects/:id/versions`

**Purpose:** Create new project version (locks compilation)  

```bash
curl -X POST http://localhost:3000/projects/proj_550e8400/versions \
  -H "X-User-ID: user123" \
  -H "Content-Type: application/json" \
  -d '{
    "compilationId": "comp_550e8400",
    "description": "Added new compliance check",
    "changelog": "- Added REST API validator"
  }'
```

**Response:**
```json
{
  "versionId": "v_550e8400",
  "projectId": "proj_550e8400",
  "version": "0.1.0",
  "changeType": "MINOR",
  "compilationId": "comp_550e8400",
  "lockedAt": "2026-02-19T12:34:56.000Z",
  "canExecute": true,
  "changelog": "- Added new compliance check"
}
```

---

### GET `/projects/:id`

**Purpose:** Get project details  

```bash
curl -X GET http://localhost:3000/projects/proj_550e8400 \
  -H "X-User-ID: user123"
```

**Response:**
```json
{
  "projectId": "proj_550e8400",
  "name": "Compliance Automation Suite",
  "namespace": "compliance",
  "version": "0.1.0",
  "createdAt": "2026-02-19T12:34:56.000Z",
  "compilations": [
    {
      "id": "comp_550e8400",
      "status": "SUCCESS",
      "createdAt": "2026-02-19T12:34:56.000Z"
    }
  ],
  "versions": [
    {
      "version": "0.0.1",
      "createdAt": "2026-02-19T12:34:56.000Z",
      "status": "ARCHIVED"
    },
    {
      "version": "0.1.0",
      "createdAt": "2026-02-19T12:34:56.000Z",
      "status": "ACTIVE"
    }
  ]
}
```

---

### GET `/projects/:id/versions/:versionId/execute`

**Purpose:** Execute specific project version  

```bash
curl -X POST http://localhost:3000/projects/proj_550e8400/versions/v_550e8400/execute \
  -H "X-User-ID: user123" \
  -d '{
    "parameters": {...}
  }'
```

**Response:** ExecutionResult (same as task execution)

---

## Context & Manifest

### GET `/tasks/manifest/llm-context`

**Purpose:** Get aggregated LLM context (all available capabilities)  
**Query Params:**
- `format` - "json" or "text" (optional, default: "json")

```bash
curl -X GET "http://localhost:3000/tasks/manifest/llm-context?format=json" \
  -H "X-User-ID: user123"
```

**Response:**
```json
{
  "connectors": [
    {
      "id": "slack",
      "version": "1.2.0",
      "status": "stable",
      "description": "Slack integration for messages and notifications",
      "functions": [
        {
          "id": "send_message",
          "parameters": ["channel", "text", "mentions"],
          "description": "Send message to Slack"
        }
      ]
    },
    {
      "id": "postgres",
      "version": "2.0.0",
      "status": "stable",
      "functions": [...]
    }
  ],
  "triggers": [...],
  "conditions": [...],
  "metadata": {
    "totalConnectors": 8,
    "totalFunctions": 45,
    "lastUpdated": "2026-02-19T12:34:56.000Z"
  }
}
```

---

### GET `/tasks/manifest/llm-context/providers`

**Purpose:** Get list of all LLM context providers (modules)  

```bash
curl -X GET http://localhost:3000/tasks/manifest/llm-context/providers \
  -H "X-User-ID: user123"
```

**Response:**
```json
{
  "providers": [
    {
      "providerId": "slack-connector",
      "name": "Slack Module",
      "version": "1.2.0",
      "description": "Provides Slack integration",
      "capabilities": 5,
      "status": "active"
    },
    {
      "providerId": "analytics-module",
      "name": "Analytics Provider",
      "version": "2.0.0",
      "capabilities": 12,
      "status": "active"
    }
  ],
  "totalProviders": 8
}
```

---

### GET `/tasks/manifest/llm-context/provider/:providerId`

**Purpose:** Get provider-specific context  

```bash
curl -X GET http://localhost:3000/tasks/manifest/llm-context/provider/slack-connector \
  -H "X-User-ID: user123"
```

**Response:**
```json
{
  "providerId": "slack-connector",
  "name": "Slack Module",
  "version": "1.2.0",
  "description": "Slack integration for messages and notifications",
  "capabilities": [
    {
      "id": "send_message",
      "description": "Send message to Slack channel",
      "minVersion": "1.0.0",
      "status": "stable"
    },
    {
      "id": "update_message",
      "description": "Update existing message",
      "minVersion": "1.1.0",
      "status": "stable"
    }
  ]
}
```

---

### GET `/tasks/manifest/llm-context/json`

**Purpose:** Export full context as JSON string  

```bash
curl -X GET http://localhost:3000/tasks/manifest/llm-context/json \
  -H "X-User-ID: user123"
```

**Response:**
```json
{
  "contextJSON": "{\"connectors\": [...], \"triggers\": [...], ...}"
}
```

---

## Connectors

### GET `/connectors`

**Purpose:** List all available connectors  

```bash
curl -X GET http://localhost:3000/connectors \
  -H "X-User-ID: user123"
```

**Response:**
```json
{
  "total": 8,
  "connectors": [
    {
      "id": "slack",
      "name": "Slack",
      "version": "1.2.0",
      "description": "Slack messaging platform",
      "status": "stable",
      "functions": 5
    },
    {
      "id": "postgres",
      "name": "PostgreSQL",
      "version": "2.0.0",
      "description": "PostgreSQL database",
      "status": "stable",
      "functions": 12
    }
  ]
}
```

---

### GET `/connectors/:id`

**Purpose:** Get connector details  

```bash
curl -X GET http://localhost:3000/connectors/slack \
  -H "X-User-ID: user123"
```

**Response:**
```json
{
  "id": "slack",
  "name": "Slack",
  "version": "1.2.0",
  "author": "slack-team@company.com",
  "description": "Slack messaging platform",
  "status": "stable",
  "functions": [
    {
      "id": "send_message",
      "name": "Send Message",
      "parameters": {
        "required": ["channel", "text"],
        "optional": ["mentions", "thread_ts"]
      },
      "description": "Send message to Slack channel"
    }
  ],
  "capabilityRequirements": {
    "sendMessages": { "minVersion": "1.0.0" },
    "threadReply": { "minVersion": "1.1.0" }
  }
}
```

---

### POST `/connectors/register`

**Purpose:** Register new connector (external developer)  
**Headers:** `X-User-ID` (required)

```bash
curl -X POST http://localhost:3000/connectors/register \
  -H "X-User-ID: user123" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my_custom_connector",
    "name": "My Custom System",
    "version": "1.0.0",
    "author": "dev@company.com",
    "description": "Custom connector for internal system",
    "functions": [
      {
        "id": "validate_data",
        "name": "Validate Data",
        "parameters": {
          "required": ["data"],
          "optional": ["rules"]
        }
      }
    ],
    "manifest": {
      "id": "my_custom_connector",
      "version": "1.0.0",
      "author": "dev@company.com",
      "status": "stable"
    }
  }'
```

**Response:**
```json
{
  "connectorId": "my_custom_connector",
  "status": "REGISTERED",
  "message": "Connector registered successfully and queued for validation",
  "validationStatus": "PENDING",
  "nextSteps": "Check CI/CD pipeline for validation results"
}
```

---

## Agents

### GET `/agents`

**Purpose:** List all registered agents  

```bash
curl -X GET http://localhost:3000/agents \
  -H "X-User-ID: user123"
```

**Response:**
```json
{
  "total": 3,
  "agents": [
    {
      "id": "agent_550e8400",
      "name": "Compliance Agent",
      "status": "ACTIVE",
      "createdAt": "2026-02-19T12:34:56.000Z",
      "tasksActive": 5,
      "tasksCompleted": 127
    }
  ]
}
```

---

### POST `/agents/register`

**Purpose:** Register new agent  

```bash
curl -X POST http://localhost:3000/agents/register \
  -H "X-User-ID: user123" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Compliance Agent",
    "type": "AUTOMATION",
    "capabilities": ["compliance_check", "alert_notification"],
    "config": {
      "maxConcurrency": 5,
      "timeout": 30000
    }
  }'
```

**Response:**
```json
{
  "agentId": "agent_550e8400",
  "name": "Compliance Agent",
  "status": "REGISTERED",
  "createdAt": "2026-02-19T12:34:56.000Z"
}
```

---

### GET `/agents/:id`

**Purpose:** Get agent details  

```bash
curl -X GET http://localhost:3000/agents/agent_550e8400 \
  -H "X-User-ID: user123"
```

**Response:**
```json
{
  "id": "agent_550e8400",
  "name": "Compliance Agent",
  "status": "ACTIVE",
  "createdAt": "2026-02-19T12:34:56.000Z",
  "capabilities": ["compliance_check", "alert_notification"],
  "metrics": {
    "tasksActive": 5,
    "tasksCompleted": 127,
    "tasksFailed": 2,
    "averageCompletionTime": 1250,
    "successRate": 0.984
  }
}
```

---

## Actions

### GET `/actions`

**Purpose:** List all available actions  

```bash
curl -X GET http://localhost:3000/actions
```

**Response:**
```json
{
  "total": 45,
  "actions": [
    {
      "id": "send_slack_message",
      "name": "Send Slack Message",
      "connector": "slack",
      "parameters": ["channel", "text"],
      "description": "Send message to Slack channel"
    },
    {
      "id": "query_database",
      "name": "Query Database",
      "connector": "postgres",
      "parameters": ["query", "timeout"],
      "description": "Execute SQL query"
    }
  ]
}
```

---

### POST `/actions`

**Purpose:** Create new action  

```bash
curl -X POST http://localhost:3000/actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Send Webhook",
    "connector": "http",
    "parameters": ["url", "method", "body"],
    "description": "Send HTTP request to webhook"
  }'
```

**Response:**
```json
{
  "id": "send_webhook_http",
  "name": "Send Webhook",
  "connector": "http",
  "parameters": ["url", "method", "body"],
  "createdAt": "2026-02-19T12:34:56.000Z",
  "status": "ACTIVE"
}
```

---

### GET `/actions/:id`

**Purpose:** Get action details  

```bash
curl -X GET http://localhost:3000/actions/send_slack_message
```

**Response:**
```json
{
  "id": "send_slack_message",
  "name": "Send Slack Message",
  "connector": "slack",
  "parameters": {
    "required": ["channel", "text"],
    "optional": ["mentions", "thread_ts", "force_reply"]
  },
  "description": "Send message to Slack channel",
  "exampleInput": {
    "channel": "#alerts",
    "text": "Server down!",
    "mentions": ["@team"]
  },
  "exampleOutput": {
    "success": true,
    "message_ts": "1708348500.000100"
  }
}
```

---

## WebSocket Events (Real-time)

### Connect to WebSocket

**Purpose:** Real-time updates for executions, compilations  
**URL:** `ws://localhost:3000/compilation-progress`  
**Headers:** `X-User-ID` (required)

```javascript
// Connect
const ws = new WebSocket('ws://localhost:3000/compilation-progress', {
  headers: { 'X-User-ID': 'user123' }
});

// Listen to events
ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  console.log('Update:', data);
});
```

---

### Event: Compilation Progress

```json
{
  "event": "compilation:progress",
  "taskId": "task_550e8400",
  "stage": "dag_building",
  "progress": 50,
  "message": "Building Directed Acyclic Graph...",
  "timestamp": "2026-02-19T12:35:00.000Z"
}
```

---

### Event: Compilation Complete

```json
{
  "event": "compilation:complete",
  "taskId": "task_550e8400",
  "status": "SUCCESS",
  "totalTime": 2050,
  "executionPlan": {...}
}
```

---

### Event: Execution Progress

```json
{
  "event": "execution:progress",
  "executionId": "exec_550e8400",
  "taskId": "task_550e8400",
  "nodeId": "action_1",
  "nodeName": "Send Slack Message",
  "status": "IN_PROGRESS",
  "progress": 75,
  "timestamp": "2026-02-19T12:35:00.250Z"
}
```

---

### Event: Execution Complete

```json
{
  "event": "execution:complete",
  "executionId": "exec_550e8400",
  "taskId": "task_550e8400",
  "status": "SUCCESS",
  "totalDuration": 1250,
  "outputs": {...}
}
```

---

## Error Handling

### Standard Error Response

All errors follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "additional context",
      "suggestion": "How to fix it"
    },
    "timestamp": "2026-02-19T12:34:56.000Z",
    "requestId": "req_550e8400"
  }
}
```

---

### Common Errors

**400 - Bad Request**
```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Task description is required"
  }
}
```

**401 - Unauthorized**
```json
{
  "error": {
    "code": "MISSING_USER_ID",
    "message": "X-User-ID header is required"
  }
}
```

**404 - Not Found**
```json
{
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task with ID 'task_550e8400' not found",
    "details": {
      "taskId": "task_550e8400"
    }
  }
}
```

**422 - Validation Failed**
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "LLM validation failed: Unknown connector 'slack_pro'",
    "details": {
      "validationStage": "CATALOG_VERIFICATION",
      "failureReason": "Connector not found in registry",
      "suggestion": "Did you mean 'slack'? Available connectors: slack, slack_enterprise"
    }
  }
}
```

**500 - Internal Error**
```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred",
    "details": {
      "errorId": "err_550e8400",
      "supportLink": "https://docs.eyeflow.dev/errors/err_550e8400"
    }
  }
}
```

---

## Rate Limiting

### Headers

All responses include rate limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 89
X-RateLimit-Reset: 1708348500
```

### Limits

- **Global:** 1000 requests/hour per user
- **Compilation:** 50 compilations/hour
- **Execution:** 200 executions/hour
- **Rules:** 100 rules/hour

---

## Authentication

### Headers

All requests except `/health` and `/api` require:

```
X-User-ID: user123
```

**Optional:**
```
X-API-Key: api_key_xxx        # For service-to-service
Authorization: Bearer token   # For future OAuth2
```

---

## Pagination

### Query Parameters

```
?limit=20          # Default: 10, Max: 100
?offset=40         # Default: 0
?sort=createdAt    # Field to sort by
?order=desc        # asc or desc
```

### Response

```json
{
  "data": [...],
  "pagination": {
    "limit": 20,
    "offset": 40,
    "total": 427,
    "hasMore": true
  }
}
```

---

## Testing with cURL

### Complete Example: Compile → Execute

```bash
# 1. Health check
curl http://localhost:3000/health

# 2. Get API info
curl http://localhost:3000/api

# 3. Compile task
COMPILE=$(curl -X POST http://localhost:3000/tasks/compile \
  -H "X-User-ID: user123" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Send Slack message when SQL fails"
  }' | jq -r '.taskId')

echo "Compiled task: $COMPILE"

# 4. Get status
curl http://localhost:3000/tasks/$COMPILE \
  -H "X-User-ID: user123"

# 5. Execute
curl -X POST http://localhost:3000/tasks/$COMPILE/execute \
  -H "X-User-ID: user123" \
  -H "Content-Type: application/json" \
  -d '{"parameters": {}}'
```

---

## Advanced Usage

### Custom System Prompt

```bash
curl -X POST http://localhost:3000/tasks/compile \
  -H "X-User-ID: user123" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Send message",
    "systemPrompt": "You are specialized in compliance tasks. Always include audit logging."
  }'
```

### Dry-run Execution

```bash
curl -X POST http://localhost:3000/tasks/task_xxx/execute \
  -H "X-User-ID: user123" \
  -d '{
    "dryRun": true
  }'
```

Returns simulated results without actual execution.

---

## Documentation Links

- [Full Architecture](./documentation/ARCHITECTURE-LLM-RULES.md)
- [Project Complete Guide](./PROJECT-COMPLETE-GUIDE.md)
- [Catalog Governance](./CATALOG-GOVERNANCE.md)
- [Connector Developer Guide](./CONNECTOR-DEVELOPER-GUIDE.md)

---

**Status:** ✅ Production Ready  
**Last Updated:** 19 février 2026  
**API Version:** 1.0.0
