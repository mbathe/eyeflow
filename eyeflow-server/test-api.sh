#!/bin/bash

# eyeflow API Test Script
# This script tests all key endpoints

BASE_URL="http://localhost:3000/api"
USER_ID="550e8400-e29b-41d4-a716-446655440000"
CONTENT_TYPE="Content-Type: application/json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "============================================"
echo "eyeflow API Test Suite"
echo "============================================"
echo ""

# Helper function to make requests
make_request() {
    local method=$1
    local endpoint=$2
    local data=$3
    
    echo -e "${YELLOW}${method} ${endpoint}${NC}"
    
    if [ -z "$data" ]; then
        curl -s -X "$method" \
            "$BASE_URL$endpoint" \
            -H "X-User-ID: $USER_ID" \
            -H "$CONTENT_TYPE"
    else
        curl -s -X "$method" \
            "$BASE_URL$endpoint" \
            -H "X-User-ID: $USER_ID" \
            -H "$CONTENT_TYPE" \
            -d "$data"
    fi
    
    echo -e "\n"
}

# Test 1: Get Available Connector Types
echo -e "${GREEN}TEST 1: Get Available Connector Types${NC}"
RESPONSE=$(make_request "GET" "/connectors/catalog/available-types")
echo "$RESPONSE" | python3 -m json.tool || echo "$RESPONSE"
echo "---"

# Test 2: Create PostgreSQL Connector
echo -e "${GREEN}TEST 2: Create PostgreSQL Connector${NC}"
PG_CONNECTOR=$(cat <<'EOF'
{
  "name": "Test PostgreSQL",
  "type": "POSTGRESQL",
  "description": "Test database connection",
  "auth": {
    "type": "BASIC",
    "credentials": {
      "host": "localhost",
      "port": 5432,
      "username": "eyeflow",
      "password": "eyeflow123",
      "database": "eyeflow_db",
      "ssl": false
    }
  },
  "config": {
    "timeout": 30000,
    "retryAttempts": 3,
    "retryDelay": 1000
  }
}
EOF
)
RESPONSE=$(make_request "POST" "/connectors" "$PG_CONNECTOR")
echo "$RESPONSE" | python3 -m json.tool || echo "$RESPONSE"
PG_CONNECTOR_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('id', ''))" 2>/dev/null)
echo "Connector ID: $PG_CONNECTOR_ID"
echo "---"

# Test 3: Create MQTT Connector
echo -e "${GREEN}TEST 3: Create MQTT Connector${NC}"
MQTT_CONNECTOR=$(cat <<'EOF'
{
  "name": "IoT Broker",
  "type": "MQTT",
  "description": "MQTT IoT data stream",
  "auth": {
    "type": "BASIC",
    "credentials": {
      "broker": "test.mosquitto.org",
      "port": 1883,
      "username": "test",
      "password": "test",
      "topics": ["sensors/+/temperature"]
    }
  }
}
EOF
)
RESPONSE=$(make_request "POST" "/connectors" "$MQTT_CONNECTOR")
echo "$RESPONSE" | python3 -m json.tool || echo "$RESPONSE"
MQTT_CONNECTOR_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('id', ''))" 2>/dev/null)
echo "Connector ID: $MQTT_CONNECTOR_ID"
echo "---"

# Test 4: List Connectors
echo -e "${GREEN}TEST 4: List All Connectors${NC}"
RESPONSE=$(make_request "GET" "/connectors")
echo "$RESPONSE" | python3 -m json.tool || echo "$RESPONSE"
echo "---"

# Test 5: Get Connector Detail
if [ ! -z "$PG_CONNECTOR_ID" ]; then
    echo -e "${GREEN}TEST 5: Get PostgreSQL Connector Detail${NC}"
    RESPONSE=$(make_request "GET" "/connectors/$PG_CONNECTOR_ID")
    echo "$RESPONSE" | python3 -m json.tool || echo "$RESPONSE"
    echo "---"
fi

# Test 6: Test PostgreSQL Connection
if [ ! -z "$PG_CONNECTOR_ID" ]; then
    echo -e "${GREEN}TEST 6: Test PostgreSQL Connection${NC}"
    RESPONSE=$(make_request "POST" "/connectors/$PG_CONNECTOR_ID/test")
    echo "$RESPONSE" | python3 -m json.tool || echo "$RESPONSE"
    echo "---"
fi

# Test 7: Create LLM Config (Local)
echo -e "${GREEN}TEST 7: Create Local LLM Config (Ollama)${NC}"
LOCAL_LLM=$(cat <<'EOF'
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
    "gpuEnabled": false,
    "cpuThreads": 4
  }
}
EOF
)
RESPONSE=$(make_request "POST" "/llm-config" "$LOCAL_LLM")
echo "$RESPONSE" | python3 -m json.tool || echo "$RESPONSE"
LOCAL_LLM_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('id', ''))" 2>/dev/null)
echo "LLM Config ID: $LOCAL_LLM_ID"
echo "---"

# Test 8: Create LLM Config (Cloud - Mock)
echo -e "${GREEN}TEST 8: Create Cloud LLM Config (OpenAI Mock)${NC}"
CLOUD_LLM=$(cat <<'EOF'
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
    "apiKey": "sk-test-key-for-testing",
    "apiUrl": "https://api.openai.com/v1",
    "organization": "org-test",
    "costPer1kTokens": 0.03
  }
}
EOF
)
RESPONSE=$(make_request "POST" "/llm-config" "$CLOUD_LLM")
echo "$RESPONSE" | python3 -m json.tool || echo "$RESPONSE"
CLOUD_LLM_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('id', ''))" 2>/dev/null)
echo "LLM Config ID: $CLOUD_LLM_ID"
echo "---"

# Test 9: List LLM Configs
echo -e "${GREEN}TEST 9: List All LLM Configs${NC}"
RESPONSE=$(make_request "GET" "/llm-config")
echo "$RESPONSE" | python3 -m json.tool || echo "$RESPONSE"
echo "---"

# Test 10: Get LLM Config Detail
if [ ! -z "$LOCAL_LLM_ID" ]; then
    echo -e "${GREEN}TEST 10: Get Local LLM Config Detail${NC}"
    RESPONSE=$(make_request "GET" "/llm-config/$LOCAL_LLM_ID")
    echo "$RESPONSE" | python3 -m json.tool || echo "$RESPONSE"
    echo "---"
fi

# Test 11: Update Connector
if [ ! -z "$PG_CONNECTOR_ID" ]; then
    echo -e "${GREEN}TEST 11: Update PostgreSQL Connector${NC}"
    UPDATE_DATA=$(cat <<'EOF'
{
  "name": "Test PostgreSQL Updated",
  "description": "Updated description"
}
EOF
    )
    RESPONSE=$(make_request "PUT" "/connectors/$PG_CONNECTOR_ID" "$UPDATE_DATA")
    echo "$RESPONSE" | python3 -m json.tool || echo "$RESPONSE"
    echo "---"
fi

# Test 12: Update LLM Config
if [ ! -z "$LOCAL_LLM_ID" ]; then
    echo -e "${GREEN}TEST 12: Update LLM Config${NC}"
    UPDATE_LLM=$(cat <<'EOF'
{
  "temperature": 0.5,
  "maxTokens": 3000
}
EOF
    )
    RESPONSE=$(make_request "PUT" "/llm-config/$LOCAL_LLM_ID" "$UPDATE_LLM")
    echo "$RESPONSE" | python3 -m json.tool || echo "$RESPONSE"
    echo "---"
fi

# Test 13: Health Check LLM Config
if [ ! -z "$LOCAL_LLM_ID" ]; then
    echo -e "${GREEN}TEST 13: LLM Health Check${NC}"
    RESPONSE=$(make_request "POST" "/llm-config/$LOCAL_LLM_ID/health-check")
    echo "$RESPONSE" | python3 -m json.tool || echo "$RESPONSE"
    echo "---"
fi

# Test 14: Set Default LLM Config
if [ ! -z "$CLOUD_LLM_ID" ]; then
    echo -e "${GREEN}TEST 14: Set Cloud LLM as Default${NC}"
    RESPONSE=$(make_request "PATCH" "/llm-config/$CLOUD_LLM_ID/set-default")
    echo "$RESPONSE" | python3 -m json.tool || echo "$RESPONSE"
    echo "---"
fi

echo -e "${GREEN}Test suite completed!${NC}"
