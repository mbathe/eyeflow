# eyeflow API - Endpoints Documentation

## Base URL
```
http://localhost:3000/api
```

---

## 1. Connectors API

### 1.1 Get Available Connector Types
```
GET /connectors/catalog/available-types
```

**Response:** `200 OK`
```json
{
  "availableTypes": [
    {
      "type": "POSTGRESQL",
      "category": "Databases",
      "description": "PostgreSQL relational database",
      "requiredFields": ["host", "port", "username", "password", "database"],
      "defaultPort": 5432
    },
    {
      "type": "MONGODB",
      "category": "Databases",
      "description": "MongoDB NoSQL database",
      "requiredFields": ["connection_string"],
      "defaultPort": 27017
    },
    // ... 15+ connector types
  ]
}
```

---

### 1.2 Create Connector
```
POST /connectors
Content-Type: application/json
```

**Request Body Examples:**

**PostgreSQL Connector:**
```json
{
  "name": "Production DB",
  "type": "POSTGRESQL",
  "description": "Main production database",
  "auth": {
    "type": "BASIC",
    "credentials": {
      "host": "db.example.com",
      "port": 5432,
      "username": "admin",
      "password": "secret123",
      "database": "myapp",
      "ssl": true
    }
  },
  "config": {
    "timeout": 30000,
    "retryAttempts": 3,
    "retryDelay": 1000
  }
}
```

**MQTT Connector:**
```json
{
  "name": "IoT Hub",
  "type": "MQTT",
  "description": "IoT device data stream",
  "auth": {
    "type": "BASIC",
    "credentials": {
      "broker": "mqtt.example.com",
      "port": 1883,
      "username": "iot_user",
      "password": "iot_pass",
      "topics": ["sensors/+/temperature", "sensors/+/humidity"]
    }
  }
}
```

**Slack Connector:**
```json
{
  "name": "Slack Notifications",
  "type": "SLACK",
  "description": "Send alerts to Slack",
  "auth": {
    "type": "BEARER",
    "credentials": {
      "token": "xoxb-your-bot-token",
      "channel": "C12345678"
    }
  }
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid-here",
  "userId": "user-uuid",
  "name": "Production DB",
  "type": "POSTGRESQL",
  "status": "CONFIGURED",
  "testResults": {
    "success": false,
    "lastTestedAt": null
  },
  "createdAt": "2026-02-18T02:30:00Z",
  "updatedAt": "2026-02-18T02:30:00Z"
}
```

---

### 1.3 List All Connectors
```
GET /connectors
```

**Query Parameters:**
- `type` (optional): Filter by connector type - `POSTGRESQL`, `MONGODB`, `MQTT`, etc.
- `status` (optional): Filter by status - `CONFIGURED`, `TESTING`, `FAILED`, `ACTIVE`

**Response:** `200 OK`
```json
{
  "connectors": [
    {
      "id": "uuid-1",
      "name": "Production DB",
      "type": "POSTGRESQL",
      "status": "ACTIVE",
      "description": "Main production database",
      "createdAt": "2026-02-18T02:30:00Z",
      "lastTestedAt": "2026-02-18T02:35:00Z",
      "lastTestSuccessful": true
    }
  ],
  "total": 1
}
```

---

### 1.4 Get Connector Detail
```
GET /connectors/:id
```

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "name": "Production DB",
  "type": "POSTGRESQL",
  "status": "ACTIVE",
  "description": "Main production database",
  "auth": {
    "type": "BASIC",
    "credentials": {
      "host": "db.example.com",
      "port": 5432,
      "username": "admin",
      "database": "myapp"
      // password is never returned for security
    }
  },
  "config": {
    "timeout": 30000,
    "retryAttempts": 3,
    "retryDelay": 1000
  },
  "testResults": {
    "success": true,
    "latency": 45,
    "lastTestedAt": "2026-02-18T02:35:00Z"
  },
  "statistics": {
    "executions": 156,
    "successCount": 154,
    "failureCount": 2,
    "averageLatency": 52
  },
  "createdAt": "2026-02-18T02:30:00Z",
  "updatedAt": "2026-02-18T02:35:00Z"
}
```

---

### 1.5 Update Connector
```
PUT /connectors/:id
Content-Type: application/json
```

**Request Body:** (same structure as create, all fields optional)
```json
{
  "name": "Updated DB Name",
  "description": "Updated description",
  "config": {
    "timeout": 45000,
    "retryAttempts": 5
  }
}
```

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "name": "Updated DB Name",
  // ... updated fields
}
```

---

### 1.6 Test Connector Connection
```
POST /connectors/:id/test
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Connected successfully",
  "latency": 43,
  "connector": {
    "id": "uuid",
    "name": "Production DB",
    "type": "POSTGRESQL"
  },
  "timestamp": "2026-02-18T02:36:00Z"
}
```

**Error Response:** `200 OK`
```json
{
  "success": false,
  "message": "Connection test failed",
  "error": "password authentication failed for user 'admin'",
  "latency": 1200,
  "timestamp": "2026-02-18T02:36:00Z"
}
```

---

### 1.7 Delete Connector (Soft Delete)
```
DELETE /connectors/:id
```

**Response:** `204 No Content` (no body)

---

## 2. LLM Configuration API

### 2.1 Create LLM Configuration
```
POST /llm-config
Content-Type: application/json
```

**Request Body - Local LLM (Ollama):**
```json
{
  "provider": "OLLAMA_LOCAL",
  "model": "LLAMA2_7B",
  "isDefault": true,
  "temperature": 0.7,
  "maxTokens": 2000,
  "topP": 1.0,
  "frequencyPenalty": 0.0,
  "presencePenalty": 0.0,
  "localConfig": {
    "baseUrl": "http://localhost:11434",
    "modelName": "llama2:7b",
    "gpuEnabled": true,
    "cpuThreads": 8
  }
}
```

**Request Body - Cloud API (OpenAI):**
```json
{
  "provider": "OPENAI",
  "model": "GPT4_TURBO",
  "isDefault": false,
  "temperature": 0.7,
  "maxTokens": 4096,
  "topP": 1.0,
  "frequencyPenalty": 0.0,
  "presencePenalty": 0.6,
  "apiConfig": {
    "apiKey": "sk-...",
    "apiUrl": "https://api.openai.com/v1",
    "organization": "org-...",
    "costPer1kTokens": 0.03
  }
}
```

**Request Body - Cloud API (Anthropic):**
```json
{
  "provider": "ANTHROPIC",
  "model": "CLAUDE_35_SONNET",
  "isDefault": false,
  "temperature": 0.7,
  "maxTokens": 4096,
  "apiConfig": {
    "apiKey": "sk-ant-...",
    "apiUrl": "https://api.anthropic.com",
    "costPer1kTokens": 0.003
  }
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "userId": "user-uuid",
  "provider": "OLLAMA_LOCAL",
  "model": "LLAMA2_7B",
  "isDefault": true,
  "temperature": 0.7,
  "maxTokens": 2000,
  "status": "HEALTHY",
  "createdAt": "2026-02-18T02:40:00Z"
}
```

---

### 2.2 List All LLM Configurations
```
GET /llm-config
```

**Query Parameters:**
- `provider` (optional): Filter by provider - `OPENAI`, `ANTHROPIC`, `OLLAMA_LOCAL`, etc.

**Response:** `200 OK`
```json
{
  "configs": [
    {
      "id": "uuid-1",
      "provider": "OLLAMA_LOCAL",
      "model": "LLAMA2_7B",
      "isDefault": true,
      "status": "HEALTHY",
      "lastHealthCheckAt": "2026-02-18T02:38:00Z",
      "temperature": 0.7,
      "maxTokens": 2000
    },
    {
      "id": "uuid-2",
      "provider": "OPENAI",
      "model": "GPT4_TURBO",
      "isDefault": false,
      "status": "HEALTHY",
      "lastHealthCheckAt": "2026-02-18T02:39:00Z"
    }
  ],
  "total": 2,
  "defaultConfigId": "uuid-1"
}
```

---

### 2.3 Get LLM Configuration Detail
```
GET /llm-config/:id
```

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "provider": "OPENAI",
  "model": "GPT4_TURBO",
  "isDefault": false,
  "temperature": 0.7,
  "maxTokens": 4096,
  "topP": 1.0,
  "frequencyPenalty": 0.0,
  "presencePenalty": 0.6,
  "status": "HEALTHY",
  "lastHealthCheckAt": "2026-02-18T02:38:30Z",
  "lastHealthCheckSuccessful": true,
  "healthCheckLatency": 234,
  "statistics": {
    "totalInferences": 156,
    "successfulInferences": 154,
    "failedInferences": 2,
    "totalTokensUsed": 245000,
    "estimatedCost": 7.35,
    "averageLatency": 1200
  },
  "createdAt": "2026-02-18T02:40:00Z",
  "updatedAt": "2026-02-18T02:38:30Z"
}
```

---

### 2.4 Update LLM Configuration
```
PUT /llm-config/:id
Content-Type: application/json
```

**Request Body:** (all fields optional)
```json
{
  "temperature": 0.5,
  "maxTokens": 3000,
  "isDefault": true,
  "apiConfig": {
    "apiKey": "sk-new-key..."
  }
}
```

**Response:** `200 OK` (updated config)

---

### 2.5 Health Check
```
POST /llm-config/:id/health-check
```

**Response:** `200 OK`
```json
{
  "status": "healthy",
  "model": "GPT4_TURBO",
  "provider": "OPENAI",
  "latency": 432,
  "timestamp": "2026-02-18T02:41:00Z",
  "details": {
    "apiAccessible": true,
    "authValid": true,
    "quotaRemaining": "95%"
  }
}
```

**Error Response:** `200 OK`
```json
{
  "status": "unhealthy",
  "model": "GPT4_TURBO",
  "provider": "OPENAI",
  "error": "Authentication failed: Invalid API key",
  "latency": 1200,
  "timestamp": "2026-02-18T02:41:00Z"
}
```

---

### 2.6 Set Default Configuration
```
PATCH /llm-config/:id/set-default
```

**Response:** `200 OK`
```json
{
  "message": "Configuration set as default",
  "config": {
    "id": "uuid",
    "provider": "OPENAI",
    "model": "GPT4_TURBO",
    "isDefault": true
  }
}
```

---

### 2.7 Delete LLM Configuration
```
DELETE /llm-config/:id
```

**Response:** `204 No Content`

---

## Error Responses

All errors follow this format:

```json
{
  "statusCode": 400,
  "message": "Error message here",
  "error": "BadRequest"
}
```

**Common Status Codes:**
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Missing/invalid authentication
- `403 Forbidden` - Not authorized for this resource
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource already exists
- `500 Internal Server Error` - Server error

---

## Authentication

All endpoints require user identification. Pass userId via:
- Header: `X-User-ID: user-uuid`
- Or JWT token in Authorization header

**Example:**
```bash
curl -X GET http://localhost:3000/api/connectors \
  -H "X-User-ID: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json"
```

---

## Rate Limiting

- 100 requests per minute per user
- 10 connector test requests per minute
- 5 health checks per minute

---

## Supported Connector Types

| Type | Category | Default Port | Use Case |
|------|----------|--------------|----------|
| POSTGRESQL | Databases | 5432 | Relational DB |
| MONGODB | Databases | 27017 | NoSQL DB |
| MYSQL | Databases | 3306 | Relational DB |
| DYNAMODB | Databases | - | AWS DynamoDB |
| FIRESTORE | Databases | - | Firebase |
| MQTT | IoT | 1883 | IoT data streams |
| KAFKA | IoT | 9092 | Event streaming |
| INFLUXDB | IoT | 8086 | Time series DB |
| SLACK | Communication | - | Slack notifications |
| TEAMS | Communication | - | MS Teams notifications |
| WHATSAPP | Communication | - | WhatsApp messaging |
| SMTP | Communication | 587 | Email notifications |
| S3 | Files | - | AWS S3 storage |
| GOOGLE_DRIVE | Files | - | Google Drive |
| DROPBOX | Files | - | Dropbox storage |
| SHOPIFY | Business | - | Shopify store |
| STRIPE | Business | - | Payment processing |
| HUBSPOT | Business | - | CRM |
| REST_API | Custom | - | Generic REST API |
| GRAPHQL | Custom | - | GraphQL API |

---

## Supported LLM Providers

| Provider | Model | Type | Cost/1k Tokens |
|----------|-------|------|-----------------|
| OpenAI | GPT-4 Turbo | Cloud | $0.03 |
| OpenAI | GPT-3.5 Turbo | Cloud | $0.0005 |
| Anthropic | Claude 3.5 Sonnet | Cloud | $0.003 |
| Anthropic | Claude 3 Opus | Cloud | $0.015 |
| Azure OpenAI | GPT-4 Turbo | Cloud | $0.03 |
| Ollama | Llama 2 7B | Local | Free |
| Ollama | Llama 2 13B | Local | Free |
| Ollama | Mistral 7B | Local | Free |
| llama.cpp | Any GGUF model | Local | Free |

