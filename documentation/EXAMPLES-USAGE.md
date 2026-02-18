# 🧪 Exemples d'Utilisation - Architecture LLM + Rules

## Quick Start

### 1. Obtenir tous les manifestes des connecteurs

```bash
curl -X GET http://localhost:3000/tasks/manifest/connectors | jq .

# Response
{
  "connectors": [
    {
      "id": "slack",
      "name": "Slack",
      "displayName": "Slack Messaging",
      "version": "1.0.0",
      "description": "Send and receive messages, manage channels, post to boards",
      "capabilities": {
        "canRead": true,
        "canWrite": true,
        "canDelete": false,
        "canSubscribe": true,
        "canExecuteQueries": true,
        "supportsRules": true
      },
      "nodes": [
        {
          "id": "slack_channel",
          "name": "Channel",
          "displayName": "Slack Channel",
          "availableFunctions": [
            {
              "id": "slack_send_message",
              "name": "Send Message",
              "category": "WRITE"
            }
          ]
        }
      ],
      "functions": [...],
      "triggers": [...]
    },
    // ... PostgreSQL, Kafka, HTTP API, FileSystem
  ]
}
```

---

### 2. Obtenir le contexte LLM complet pour un user

```bash
curl -X GET http://localhost:3000/tasks/manifest/llm-context \
  -H "X-User-ID: 550e8400-e29b-41d4-a716-446655440000" | jq .

# Response
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-18T12:00:00.000Z",
  "connectors": [ ... all manifests ... ],
  "nodes": [ ... all nodes with connectorId ... ],
  "functions": [ ... all functions ... ],
  "schemas": [ ... all data schemas ... ],
  "triggers": [ ... all triggers ... ],
  "operators": ["eq", "ne", "gt", "gte", "lt", "lte", "in", "contains", "regex", ...],
  "userConnectors": [],
  "systemCapabilities": {
    "supportedLanguages": ["en", "fr"],
    "maxTaskComplexity": 10,
    "maxMissionsPerTask": 50
  }
}
```

---

### 3. Export JSON for External Services

```bash
curl -X GET http://localhost:3000/tasks/manifest/llm-context/json \
  -H "X-User-ID: 550e8400-e29b-41d4-a716-446655440000" \
  -o llm-context.json

# This gives you a nice formatted JSON file ready for documentation
```

---

## 📋 Cas d'Usage Complets

### Mode 2: Parse Natural Language to Task

#### 1. Compiler une tâche en langage naturel

```bash
curl -X POST http://localhost:3000/tasks/compile \
  -H "X-User-ID: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{
    "userInput": "Send a Slack message to #alerts saying customer 12345 is non-compliant",
    "type": "DIRECT",
    "confidenceThreshold": 0.8,
    "llmModelPreference": "gpt-4"
  }' | jq .

# What happens internally:
# 1. NestJS builds LLM context (all connectors, functions, triggers, etc.)
# 2. Sends to Python LLM: parse this intent + context
# 3. Python returns: send_message to Slack, targets: [#alerts], parameters: [text]
# 4. NestJS validates: Slack exists, #alerts exists, send_message function exists
# 5. Returns: taskId, status=PENDING, intent={...}, confidence=0.92

# Response
{
  "taskId": "550e8400-1234-5678-9abc-def012345678",
  "status": "PENDING",
  "intent": {
    "action": "send_message",
    "confidence": 0.92
  },
  "missionIds": [],
  "estimatedDurationMs": 5000,
  "compiledAt": "2026-02-18T12:00:00.000Z",
  "metadata": {
    "connectorsSuggested": 1,
    "missionCount": 1,
    "validationWarnings": []
  }
}
```

#### 2. Exécuter la tâche compilée

```bash
curl -X POST http://localhost:3000/tasks/:id/execute \
  -H "X-User-ID: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{
    "waitForCompletion": true,
    "completionTimeoutMs": 30000
  }' | jq .

# Response
{
  "taskId": "550e8400-1234-5678-9abc-def012345678",
  "missionIds": ["mission-uuid-1"],
  "status": "EXECUTING",
  "isComplete": false,
  "startedAt": "2026-02-18T12:01:00.000Z"
}
```

---

### Mode 3: Create Compliance Rules

#### 1. Créer une règle de conformité

```bash
curl -X POST http://localhost:3000/tasks/rules \
  -H "X-User-ID: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Check Customer Compliance on Creation",
    "description": "Validate every new customer against compliance rules",
    "sourceConnectorType": "postgres",
    "sourceConnectorId": "prod-db-1",
    
    "condition": {
      "field": "customers.status",
      "operator": "eq",
      "value": "NEW"
    },
    
    "actions": [
      {
        "functionId": "validate_compliance",
        "connectorId": "compliance-checker",
        "parameters": {
          "documentPath": "/conformity/rules.pdf",
          "checkFields": ["email", "phone", "address"]
        }
      },
      {
        "functionId": "slack_send_message",
        "connectorId": "slack",
        "parameters": {
          "channel": "#compliance-alerts",
          "text": "Customer check result: {result}"
        }
      }
    ],
    
    "debounceConfig": {
      "enabled": true,
      "windowMs": 1000,
      "maxTriggersInWindow": 1
    },
    
    "enabled": true
  }' | jq .

# Response
{
  "id": "rule-uuid-456",
  "name": "Check Customer Compliance on Creation",
  "status": "ACTIVE",
  "sourceConnectorType": "postgres",
  "totalTriggers": 0,
  "createdAt": "2026-02-18T12:00:00.000Z",
  "updatedAt": "2026-02-18T12:00:00.000Z"
}
```

#### 2. Vérifier le statut de la règle

```bash
curl -X GET http://localhost:3000/tasks/rules/rule-uuid-456 \
  -H "X-User-ID: 550e8400-e29b-41d4-a716-446655440000" | jq .

# Response
{
  "id": "rule-uuid-456",
  "name": "Check Customer Compliance on Creation",
  "status": "ACTIVE",
  "sourceConnectorType": "postgres",
  "totalTriggers": 5,         # Triggered 5 times since creation
  "lastTriggeredAt": "2026-02-18T12:05:30.000Z",
  "condition": {...},
  "actions": [...]
}
```

---

## 🔌 Integration: Python LLM Service

```python
# The Python service receives this:

POST http://localhost:8001/parse-intent
{
  "userInput": "Send message to #alerts if customer non-compliant",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "llmContext": {
    "connectors": [
      {
        "id": "slack",
        "name": "Slack",
        "nodes": [
          {
            "id": "slack_channel",
            "availableFunctions": [
              {
                "id": "slack_send_message",
                "parameters": [
                  {"name": "text", "type": "string", "required": true},
                  {"name": "channel", "type": "string", "required": true}
                ]
              }
            ]
          }
        ],
        "triggers": [
          {"type": "ON_CREATE", "description": "..."}
        ]
      },
      {
        "id": "postgres",
        "name": "PostgreSQL",
        "nodes": [
          {
            "id": "postgres_table",
            "availableFunctions": [
              {
                "id": "postgres_select",
                "parameters": [...]
              }
            ]
          }
        ]
      }
    ],
    "functions": [...],
    "schemas": [...],
    "operators": ["eq", "ne", "gt", "contains", "regex", ...]
  },
  "confidenceThreshold": 0.8
}

# Python LLM understands:
# - Slack connector exists with send_message function
# - PostgreSQL exists for querying customer data
# - Can create condition: is_compliant == false
# - Can chain: query → evaluate → send message

# Returns:
{
  "success": true,
  "confidence": 0.92,
  "intent": {
    "action": "send_message",
    "actionType": "WRITE"
  },
  "targets": [
    {
      "connectorId": "slack",
      "functionId": "slack_send_message"
    }
  ],
  "parameters": [
    {"name": "text", "value": "Customer is non-compliant", "type": "string"},
    {"name": "channel", "value": "#alerts", "type": "string"}
  ],
  "missions": [
    {
      "connectorId": "slack",
      "functionId": "slack_send_message",
      "parameters": {
        "text": "Customer is non-compliant",
        "channel": "#alerts"
      }
    }
  ],
  "validation": {
    "isExecutable": true,
    "issues": [],
    "warnings": []
  }
}
```

---

## 🧪 Testing avec cURL

### Setup

```bash
#!/bin/bash

API_URL="http://localhost:3000"
USER_ID="550e8400-e29b-41d4-a716-446655440000"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
```

### Test 1: Get all manifests

```bash
echo -e "${BLUE}Getting all connector manifests...${NC}"
curl -s -X GET $API_URL/tasks/manifest/connectors | jq '.connectors | map(.id)'
# Output: [ "slack", "postgres", "http_api", "kafka", "filesystem" ]
```

### Test 2: Get LLM context

```bash
echo -e "${BLUE}Getting LLM context...${NC}"
curl -s -X GET $API_URL/tasks/manifest/llm-context \
  -H "X-User-ID: $USER_ID" | jq '.connectors | length'
# Output: 5 (all connectors available)
```

### Test 3: Parse intent

```bash
echo -e "${BLUE}Parsing: 'Send a Slack message'...${NC}"
curl -s -X POST $API_URL/tasks/compile \
  -H "X-User-ID: $USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "userInput": "Send a Slack message to #alerts",
    "type": "DIRECT",
    "confidenceThreshold": 0.7
  }' | jq '.intent'

# Output:
# {
#   "action": "send_message",
#   "confidence": 0.92
# }
```

### Test 4: Create compliance rule

```bash
echo -e "${BLUE}Creating compliance rule...${NC}"
curl -s -X POST $API_URL/tasks/rules \
  -H "X-User-ID: $USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Compliance Rule",
    "sourceConnectorType": "postgres",
    "condition": {"field": "id", "operator": "gt", "value": 0},
    "actions": [
      {
        "functionId": "slack_send_message",
        "connectorId": "slack",
        "parameters": {"text": "Test"}
      }
    ]
  }' | jq '.status'

# Output: "ACTIVE"
```

---

## 🚀 Full Demo Script

```bash
#!/bin/bash

API="http://localhost:3000"
USER="550e8400-e29b-41d4-a716-446655440000"

echo "=== DEMO: Full LLM + Rules System ==="
echo ""

# 1. Show What's Available
echo "1️⃣ Showing all available connectors..."
curl -s $API/tasks/manifest/connectors | jq '.connectors[] | {id, name, capabilities}'

echo ""
echo "2️⃣ Showing LLM context for user..."
curl -s -H "X-User-ID: $USER" $API/tasks/manifest/llm-context | jq '.connectors | length'
echo "✅ LLM has access to $(curl -s -H "X-User-ID: $USER" $API/tasks/manifest/llm-context | jq '.functions | length') functions"

echo ""
echo "3️⃣ Parsing natural language: 'Send alert to Slack'..."
TASK_JSON=$(curl -s -X POST $API/tasks/compile \
  -H "X-User-ID: $USER" \
  -H "Content-Type: application/json" \
  -d '{
    "userInput": "Send a Slack message to #alerts",
    "type": "DIRECT",
    "confidenceThreshold": 0.7
  }')

echo $TASK_JSON | jq '{taskId, status, intent}'

echo ""
echo "4️⃣ Creating compliance rule..."
curl -s -X POST $API/tasks/rules \
  -H "X-User-ID: $USER" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Auto Compliance Check",
    "sourceConnectorType": "postgres",
    "condition": {"field": "status", "operator": "eq", "value": "PENDING"},
    "actions": [{
      "connectorId": "slack",
      "functionId": "slack_send_message",
      "parameters": {"text": "Review required"}
    }]
  }' | jq '{id, name, status}'

echo ""
echo "✅ Demo complete!"
```

---

## 📝 Your Checklist

- ✅ Connectors registered with full manifests
- ✅ LLM context builder creates rich context
- ✅ Task validator checks everything before execution
- ✅ Endpoints expose manifests for documentation
- ✅ Python LLM service interface defined (waiting for implementation)
- ✅ Rules engine ready for compliance tasks
- ✅ Audit logging enabled
- ✅ 0 TypeScript errors

**Next: Implement Python LLM service and connect it!**
