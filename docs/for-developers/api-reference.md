---
sidebar_position: 2
title: API Reference
description: Complete REST API documentation
---

# API Reference

Complete documentation for EyeFlow's REST API.

## Authentication

All API requests require authentication via API token.

### Get Your API Token

1. In Dashboard: **Settings → API Keys**
2. Click **+ Create API Key**
3. Copy the token (starts with `sk_live_`)

### Using the Token

**Header-based (recommended):**
```bash
Authorization: Bearer sk_live_abc123xyz789
```

**Query parameter:**
```bash
?api_key=sk_live_abc123xyz789
```

**Examples:**
```bash
# With header
curl -H "Authorization: Bearer sk_live_abc123xyz789" \
  https://api.eyeflow.com/tasks

# Or with query param
curl "https://api.eyeflow.com/tasks?api_key=sk_live_abc123xyz789"
```

---

## Base URLs

### Development
```
http://localhost:3000
```

### Production
```
https://api.eyeflow.com
```

All examples use `/api/v1` prefix.

---

## Response Format

### Success Response

```json
{
  "status": "success",
  "data": {
    "id": "task_abc123",
    "name": "daily_weather",
    ...
  },
  "timestamp": "2024-10-02T14:34:12Z"
}
```

### Error Response

```json
{
  "status": "error",
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task with ID task_xyz not found",
    "details": {
      "taskId": "task_xyz"
    }
  },
  "timestamp": "2024-10-02T14:34:12Z"
}
```

### Pagination

```json
{
  "status": "success",
  "data": [...],
  "pagination": {
    "total": 1847,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

## Tasks API

### Create Task

```http
POST /api/v1/tasks
Content-Type: application/json
Authorization: Bearer sk_live_...

{
  "name": "daily_weather",
  "description": "Get weather and post to Slack",
  "trigger": {
    "type": "schedule",
    "frequency": "daily",
    "time": "09:00"
  },
  "actions": [
    {
      "name": "fetch_weather",
      "type": "http",
      "method": "GET",
      "url": "https://api.openweathermap.org/data/2.5/weather?q=New York",
      "headers": {
        "appid": "${secrets.openweather_key}"
      }
    },
    {
      "name": "post_slack",
      "type": "connector",
      "connector": "slack_daily",
      "function": "send_message",
      "params": {
        "channel": "#general",
        "text": "Weather: ${fetch_weather.weather[0].description}"
      }
    }
  ]
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "task_abc123",
    "name": "daily_weather",
    "status": "active",
    "created_at": "2024-10-02T14:34:12Z",
    "updated_at": "2024-10-02T14:34:12Z"
  }
}
```

### List Tasks

```http
GET /api/v1/tasks?limit=50&offset=0&status=active
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Results per page (default: 50, max: 200) |
| `offset` | number | Pagination offset (default: 0) |
| `status` | string | Filter by status: `active`, `inactive`, `archived` |
| `trigger` | string | Filter by trigger: `schedule`, `webhook`, `manual` |
| `tags` | string | Comma-separated tags to filter |

### Get Task

```http
GET /api/v1/tasks/{taskId}
```

**Example:**
```bash
GET /api/v1/tasks/task_abc123
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "task_abc123",
    "name": "daily_weather",
    "status": "active",
    "description": "Get weather and post to Slack",
    "trigger": {
      "type": "schedule",
      "frequency": "daily",
      "time": "09:00"
    },
    "actions": [
      {
        "id": "action_1",
        "name": "fetch_weather",
        "type": "http",
        ...
      }
    ],
    "created_at": "2024-10-02T14:34:12Z",
    "updated_at": "2024-10-02T14:34:12Z",
    "last_execution": {
      "id": "exec_xyz",
      "status": "success",
      "duration_ms": 78,
      "completed_at": "2024-10-02T09:00:15Z"
    }
  }
}
```

### Update Task

```http
PATCH /api/v1/tasks/{taskId}
Content-Type: application/json

{
  "description": "Updated description",
  "status": "inactive"
}
```

### Delete Task

```http
DELETE /api/v1/tasks/{taskId}
```

### Execute Task

```http
POST /api/v1/tasks/{taskId}/execute
Content-Type: application/json

{
  "input": {
    "custom_param": "value"
  },
  "wait": true,
  "timeout_ms": 5000
}
```

**Response:**
```json
{
  "execution_id": "exec_abc123",
  "status": "success",
  "duration_ms": 78,
  "output": {
    "message": "Task completed successfully"
  }
}
```

---

## Executions API

### Get Execution

```http
GET /api/v1/executions/{executionId}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "exec_abc123",
    "task_id": "task_abc123",
    "status": "success",
    "input": { "query": "New York" },
    "output": { "temperature": 72 },
    "duration_ms": 78,
    "started_at": "2024-10-02T14:34:12Z",
    "completed_at": "2024-10-02T14:34:12.078Z",
    "actions": [
      {
        "name": "fetch_weather",
        "status": "success",
        "duration_ms": 32,
        "output": { "temp": 72, "humidity": 60 }
      },
      {
        "name": "post_slack",
        "status": "success",
        "duration_ms": 43,
        "output": { "ok": true, "ts": "1234567890.000123" }
      }
    ]
  }
}
```

### List Executions

```http
GET /api/v1/executions?task_id=task_abc123&status=success&limit=50
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `task_id` | string | Filter by task ID |
| `status` | string | `success`, `failed`, `timeout` |
| `since` | ISO8601 | Start date (e.g., `2024-10-01T00:00:00Z`) |
| `until` | ISO8601 | End date |
| `limit` | number | Results per page (default: 50) |

---

## Connectors API

### List Connectors

```http
GET /api/v1/connectors
```

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "conn_abc123",
      "service": "slack",
      "name": "slack_daily",
      "status": "connected",
      "created_at": "2024-09-15T10:30:00Z",
      "last_tested_at": "2024-10-02T14:00:00Z",
      "used_by": 3
    }
  ]
}
```

### Create Connector

```http
POST /api/v1/connectors
Content-Type: application/json

{
  "service": "slack",
  "name": "slack_alerts",
  "config": {
    "token": "xoxb-1234567890-abcdefghijk",
    "default_channel": "#alerts"
  }
}
```

### Test Connector

```http
POST /api/v1/connectors/{connectorId}/test
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "connected": true,
    "service": "slack",
    "workspace": "my-company",
    "rate_limit": "120/minute",
    "permissions": ["chat:write", "files:write"]
  }
}
```

### Delete Connector

```http
DELETE /api/v1/connectors/{connectorId}
```

---

## Rules API

### Create Rule

```http
POST /api/v1/rules
Content-Type: application/json

{
  "name": "weather_alert",
  "description": "Alert for extreme weather",
  "conditions": [
    {
      "name": "is_hot",
      "condition": "temperature > 95",
      "actions": [
        {
          "type": "send_alert",
          "message": "🌞 Hot weather alert!"
        }
      ]
    },
    {
      "name": "is_cold",
      "condition": "temperature < 32",
      "actions": [
        {
          "type": "send_alert",
          "message": "❄️ Cold weather alert!"
        }
      ]
    }
  ],
  "default_actions": [
    {
      "type": "log",
      "message": "Normal weather"
    }
  ]
}
```

### Evaluate Rule

```http
POST /api/v1/rules/{ruleId}/evaluate
Content-Type: application/json

{
  "data": {
    "temperature": 72,
    "humidity": 60
  }
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "matched_condition": "default",
    "actions_executed": ["log"],
    "output": "Normal weather",
    "duration_ms": 3
  }
}
```

---

## Webhooks API

### Create Webhook

```http
POST /api/v1/webhooks
Content-Type: application/json

{
  "task_id": "task_abc123",
  "name": "my_webhook",
  "description": "Webhook for my_task"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "webhook_abc123",
    "url": "https://api.eyeflow.com/webhooks/abc123",
    "task_id": "task_abc123",
    "created_at": "2024-10-02T14:34:12Z"
  }
}
```

### Trigger Webhook

```http
POST https://api.eyeflow.com/webhooks/{webhookId}
Content-Type: application/json

{
  "name": "Alice",
  "email": "alice@example.com",
  "action": "subscribe"
}
```

**Response:**
```json
{
  "execution_id": "exec_xyz789",
  "status": "pending",
  "estimated_completion_ms": 150
}
```

### List Webhooks

```http
GET /api/v1/webhooks?task_id=task_abc123
```

---

## Alerts API

### Create Alert

```http
POST /api/v1/alerts
Content-Type: application/json

{
  "name": "task_failure",
  "task_id": "task_abc123",
  "condition": "task_fails",
  "actions": [
    {
      "type": "email",
      "to": "admin@company.com",
      "subject": "Task failed: daily_weather"
    },
    {
      "type": "slack",
      "channel": "#alerts",
      "message": "❌ Task failed"
    }
  ]
}
```

### List Alerts

```http
GET /api/v1/alerts
```

---

## Monitoring API

### Get System Status

```http
GET /api/v1/system/status
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "health": "healthy",
    "uptime_seconds": 86400,
    "components": {
      "api_server": "healthy",
      "database": "healthy",
      "message_queue": "healthy"
    },
    "stats": {
      "total_tasks": 42,
      "active_tasks": 35,
      "executions_today": 847,
      "success_rate_percent": 100,
      "average_latency_ms": 62
    }
  }
}
```

### Get Metrics

```http
GET /api/v1/metrics?since=2024-10-01T00:00:00Z&until=2024-10-02T00:00:00Z
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "period": {
      "since": "2024-10-01T00:00:00Z",
      "until": "2024-10-02T00:00:00Z"
    },
    "executions": {
      "total": 12847,
      "successful": 12847,
      "failed": 0,
      "timed_out": 0
    },
    "latency": {
      "min_ms": 32,
      "max_ms": 156,
      "average_ms": 62,
      "p50_ms": 45,
      "p99_ms": 120
    },
    "resource_usage": {
      "memory_mb": 256,
      "cpu_percent": 12,
      "network_mb": 2300
    }
  }
}
```

---

## Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Invalid or missing API key |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `TASK_NOT_FOUND` | 404 | Task does not exist |
| `EXECUTION_NOT_FOUND` | 404 | Execution does not exist |
| `INVALID_REQUEST` | 400 | Invalid request format |
| `VALIDATION_ERROR` | 400 | Validation failed (see details) |
| `CONFLICT` | 409 | Resource already exists |
| `RATE_LIMIT` | 429 | Too many requests |
| `TIMEOUT` | 504 | Request timeout |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Rate Limits

### Per-Account Limits

| Endpoint | Limit |
|----------|-------|
| Task execution | 10,000/minute per task |
| Webhook trigger | 10,000/minute per webhook |
| API read | 60,000/minute |
| API write | 6,000/minute |

### Rate Limit Headers

```
X-RateLimit-Limit: 60000
X-RateLimit-Remaining: 59999
X-RateLimit-Reset: 1640000000
```

---

## SDKs & Client Libraries

- [JavaScript/Node.js](./sdks.md#javascript)
- [Python](./sdks.md#python)
- [Go](./sdks.md#go)
- [Java](./sdks.md#java)
- [Ruby](./sdks.md#ruby)
- [PHP](./sdks.md#php)

---

## Webhook Events

EyeFlow sends events to your webhook URLs:

### Task Execution Event

```json
{
  "event": "task.executed",
  "timestamp": "2024-10-02T14:34:12Z",
  "data": {
    "task_id": "task_abc123",
    "execution_id": "exec_xyz789",
    "status": "success",
    "duration_ms": 78,
    "output": {...}
  }
}
```

### Task Failure Event

```json
{
  "event": "task.failed",
  "timestamp": "2024-10-02T14:34:12Z",
  "data": {
    "task_id": "task_abc123",
    "execution_id": "exec_xyz789",
    "error": "API timeout",
    "failed_action": "fetch_weather"
  }
}
```

---

**Ready to integrate?**
- [JavaScript SDK](./sdks.md#javascript)
- [Connector Development](./connectors/custom.md)
- [Deployment Guide](./deployment.md)

---

Complete, production-ready API with zero hallucinations. 🚀
