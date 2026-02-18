# 🐍 Service Python LLM - Interface & Contrat

## Vue d'ensemble

Le service Python LLM s'exécutera en **parallèle** et sera appelé par le backend TypeScript via HTTP.

```
NestJS Backend (TypeScript)    Python LLM Service
        │                              │
        │──────────────────────────────│
        │  POST /parse-intent         │
        │  (userInput + llmContext)   │
        │                              │
        │◄─────────────────────────────│
        │  LLMIntentParserResponse     │
        │  (intent + targets + params) │
        │                              │
```

---

## 📝 Contrat API

### Endpoint 1: Parse Intent

```bash
POST http://localhost:8001/parse-intent
Content-Type: application/json

{
  "userInput": "Send a Slack message to #alerts saying customer is non-compliant",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "llmContext": {
    "connectors": [...],      # All available connectors
    "functions": [...],       # All available functions
    "schemas": [...],         # All data schemas
    "triggers": [...],        # Available triggers
    "operators": [...]        # Available operators
  },
  "confidenceThreshold": 0.8,
  "llmModel": "gpt-4"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "confidence": 0.92,
  "intent": {
    "description": "Send a Slack message to #alerts",
    "action": "send_message",
    "actionType": "WRITE"
  },
  "targets": [
    {
      "connectorId": "slack",
      "connectorName": "Slack",
      "nodeId": "slack_channel",
      "nodeName": "Channel",
      "functionId": "slack_send_message",
      "functionName": "Send Message"
    }
  ],
  "parameters": [
    {
      "name": "text",
      "value": "customer is non-compliant",
      "type": "string",
      "resolved": true
    },
    {
      "name": "channel",
      "value": "#alerts",
      "type": "string",
      "resolved": true
    }
  ],
  "missions": [
    {
      "connectorId": "slack",
      "nodeId": "slack_channel",
      "functionId": "slack_send_message",
      "parameters": {
        "text": "customer is non-compliant",
        "channel": "#alerts"
      }
    }
  ],
  "validation": {
    "isExecutable": true,
    "issues": [],
    "warnings": []
  },
  "debug": {
    "parsingSteps": [
      "Identified 'Slack' keyword",
      "Found 'send_message' function",
      "Extracted text and channel parameters",
      "Validated types match schema"
    ],
    "matchedFunctions": [...],
    "resolvedSchemas": ["Slack.SlackMessage"]
  }
}
```

---

### Endpoint 2: Build Rule from Description

```bash
POST http://localhost:8001/build-rule
Content-Type: application/json

{
  "description": "Check compliance every time a new customer is created",
  "userId": "550e8400-e29b-41d4-a716...",
  "llmContext": {...}
}
```

**Response:**
```json
{
  "success": true,
  "confidence": 0.88,
  "intent": {...},
  "ruleSuggestions": [
    {
      "description": "Verify new customer against compliance rules",
      "trigger": {
        "type": "ON_CREATE",
        "connectorId": "postgres",
        "nodeId": "postgres_table",
        "filterFields": ["table_name=customers"]
      },
      "condition": {
        "field": "customer.status",
        "operator": "EQ",
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
          "functionId": "send_message",
          "connectorId": "slack",
          "parameters": {
            "channel": "#alerts",
            "text": "Customer {customer_id} failed compliance check"
          }
        }
      ]
    }
  ]
}
```

---

### Endpoint 3: Validate Parsing

```bash
POST http://localhost:8001/validate-intent
Content-Type: application/json

{
  "intent": {...},
  "llmContext": {...},
  "userId": "550e8400-e29b-41d4-a716..."
}
```

**Response:**
```json
{
  "valid": true,
  "issues": [],
  "warnings": [
    "Slack connector is in beta status"
  ],
  "suggestions": [
    "Consider using alternative channel format"
  ]
}
```

---

## 🏗️ Structure Python Recommandée

```python
# main.py - FastAPI Server
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import logging

app = FastAPI(title="Eyeflow LLM Parser", version="1.0.0")

# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class Parameter(BaseModel):
    name: str
    value: Any
    type: str
    resolved: bool

class Intent(BaseModel):
    description: str
    action: str
    actionType: str  # 'READ' | 'WRITE' | 'DELETE' | 'EXECUTE'

class Target(BaseModel):
    connectorId: str
    connectorName: str
    nodeId: Optional[str]
    nodeName: Optional[str]
    functionId: str
    functionName: str

class Mission(BaseModel):
    connectorId: str
    nodeId: Optional[str]
    functionId: str
    parameters: Dict[str, Any]
    metadata: Optional[Dict[str, Any]]

class Validation(BaseModel):
    isExecutable: bool
    issues: List[str]
    warnings: List[str]

class LLMIntentParserResponse(BaseModel):
    success: bool
    confidence: float  # 0-1
    intent: Intent
    targets: List[Target]
    parameters: List[Parameter]
    missions: List[Mission]
    validation: Validation
    ruleSuggestions: Optional[List[Dict[str, Any]]]
    debug: Optional[Dict[str, Any]]

class ParseIntentRequest(BaseModel):
    userInput: str
    userId: str
    llmContext: Dict[str, Any]
    confidenceThreshold: float = 0.7
    llmModel: str = "gpt-4"

# ============================================================================
# CORE LLM LOGIC
# ============================================================================

class LLMIntentParser:
    """Main LLM parsing logic"""
    
    def __init__(self, model_name: str = "gpt-4"):
        self.model_name = model_name
        self.logger = logging.getLogger(__name__)
    
    def parse_intent(
        self,
        user_input: str,
        llm_context: Dict[str, Any],
        confidence_threshold: float
    ) -> LLMIntentParserResponse:
        """
        Parse natural language input to extract:
        1. Intent (what user wants to do)
        2. Targets (which connectors/functions)
        3. Parameters (with proper types)
        4. Missions (executable units)
        """
        
        try:
            # Step 1: Analyze user input
            analysis = self._analyze_input(user_input)
            
            # Step 2: Match against available functions
            matched_functions = self._find_functions(analysis, llm_context)
            
            if not matched_functions:
                return LLMIntentParserResponse(
                    success=False,
                    confidence=0.0,
                    intent=Intent(description="No match", action="UNKNOWN", actionType="READ"),
                    targets=[],
                    parameters=[],
                    missions=[],
                    validation=Validation(
                        isExecutable=False,
                        issues=["Could not find matching function"],
                        warnings=[]
                    )
                )
            
            # Step 3: Map parameters to types using schemas
            parameters = self._extract_parameters(user_input, matched_functions, llm_context)
            
            # Step 4: Build missions
            missions = self._build_missions(matched_functions, parameters)
            
            # Step 5: Calculate confidence
            confidence = self._calculate_confidence(analysis, matched_functions, parameters)
            
            # Step 6: Validate executability
            is_executable = confidence >= confidence_threshold
            
            return LLMIntentParserResponse(
                success=is_executable,
                confidence=confidence,
                intent=Intent(
                    description=analysis.get("description", ""),
                    action=analysis.get("action", ""),
                    actionType=matched_functions[0].get("category", "READ")
                ),
                targets=[
                    Target(
                        connectorId=fn["connectorId"],
                        connectorName=fn["connectorName"],
                        nodeId=fn.get("nodeId"),
                        nodeName=fn.get("nodeName"),
                        functionId=fn["id"],
                        functionName=fn["name"]
                    )
                    for fn in matched_functions
                ],
                parameters=parameters,
                missions=missions,
                validation=Validation(
                    isExecutable=is_executable,
                    issues=[],
                    warnings=[]
                ),
                debug={
                    "parsingSteps": analysis.get("steps", []),
                    "matchedFunctions": [fn["id"] for fn in matched_functions]
                }
            )
        
        except Exception as e:
            self.logger.error(f"Parsing failed: {str(e)}")
            return LLMIntentParserResponse(
                success=False,
                confidence=0.0,
                intent=Intent(description="Error", action="ERROR", actionType="READ"),
                targets=[],
                parameters=[],
                missions=[],
                validation=Validation(
                    isExecutable=False,
                    issues=[str(e)],
                    warnings=[]
                )
            )
    
    def _analyze_input(self, user_input: str) -> Dict[str, Any]:
        """
        Use LLM (GPT-4) to understand what user wants
        """
        # TODO: Call OpenAI API
        return {
            "description": user_input,
            "action": "send_message",
            "keywords": ["slack", "message"],
            "steps": ["Identified Slack", "Found send_message function"]
        }
    
    def _find_functions(self, analysis: Dict, llm_context: Dict) -> List[Dict]:
        """
        Use structured search to find matching functions from context
        """
        # Match keywords against available functions
        functions = llm_context.get("functions", [])
        matched = []
        
        for keyword in analysis.get("keywords", []):
            for func_entry in functions:
                func = func_entry["function"]
                if keyword.lower() in func["name"].lower():
                    matched.append({
                        **func,
                        "connectorId": func_entry["connectorId"],
                        "connectorName": self._get_connector_name(func_entry["connectorId"], llm_context)
                    })
        
        return matched[:1]  # Return best match
    
    def _extract_parameters(self, user_input: str, functions: List[Dict], llm_context: Dict) -> List[Parameter]:
        """
        Extract parameters from user input and validate types
        """
        parameters = []
        
        for func in functions:
            expected_params = func.get("parameters", [])
            
            for param_def in expected_params:
                # TODO: Extract value from user_input
                value = self._extract_value_for_param(param_def["name"], user_input)
                
                parameters.append(Parameter(
                    name=param_def["name"],
                    value=value,
                    type=param_def.get("type", "string"),
                    resolved=value is not None
                ))
        
        return parameters
    
    def _build_missions(self, functions: List[Dict], parameters: List[Parameter]) -> List[Mission]:
        """
        Build executable missions from functions and parameters
        """
        missions = []
        
        for func in functions:
            params_dict = {p.name: p.value for p in parameters if p.resolved}
            
            missions.append(Mission(
                connectorId=func["connectorId"],
                nodeId=func.get("nodeId"),
                functionId=func["id"],
                parameters=params_dict
            ))
        
        return missions
    
    def _calculate_confidence(self, analysis: Dict, functions: List[Dict], parameters: List[Parameter]) -> float:
        """
        Calculate confidence score (0-1)
        Based on: keyword match, parameter resolution, function availability
        """
        if not functions:
            return 0.0
        
        resolved_params = sum(1 for p in parameters if p.resolved)
        total_params = len(parameters) or 1
        param_score = resolved_params / total_params
        
        # Combined score
        confidence = 0.5 * (1.0) + 0.5 * param_score  # Simplified
        return min(1.0, max(0.0, confidence))
    
    def _get_connector_name(self, connector_id: str, llm_context: Dict) -> str:
        """Get display name for connector"""
        for conn in llm_context.get("connectors", []):
            if conn["id"] == connector_id:
                return conn["name"]
        return connector_id
    
    def _extract_value_for_param(self, param_name: str, user_input: str) -> Optional[str]:
        """Try to extract parameter value from user input"""
        # Simplified - in production use NLP
        if "channel" in param_name.lower():
            if "#" in user_input:
                return user_input.split("#")[1].split()[0]
        if "text" in param_name.lower():
            return user_input
        return None

# ============================================================================
# API ENDPOINTS
# ============================================================================

parser = LLMIntentParser()

@app.post("/parse-intent")
async def parse_intent(request: ParseIntentRequest) -> LLMIntentParserResponse:
    """Parse natural language to extract intent"""
    response = parser.parse_intent(
        request.userInput,
        request.llmContext,
        request.confidenceThreshold
    )
    return response

@app.post("/build-rule")
async def build_rule(
    description: str,
    userId: str,
    llmContext: Dict[str, Any]
) -> LLMIntentParserResponse:
    """Build rule from description"""
    # Similar to parse_intent but specialized for rules
    return parser.parse_intent(description, llmContext, 0.7)

@app.post("/validate-intent")
async def validate_intent(
    intent: Dict[str, Any],
    llmContext: Dict[str, Any],
    userId: str
) -> Dict[str, Any]:
    """Validate if intent is executable"""
    # Check all targets exist, types match, etc.
    return {
        "valid": True,
        "issues": [],
        "warnings": []
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "LLM Parser"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
```

---

## 🔌 Docker Compose Setup

```yaml
version: '3.9'

services:
  eyeflow-server:
    build: ./eyeflow-server
    ports:
      - "3000:3000"
    environment:
      - LLM_SERVICE_URL=http://llm-parser:8001
    depends_on:
      - llm-parser
      - postgres

  llm-parser:
    build: ./llm-parser  # Python service
    ports:
      - "8001:8001"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - LLM_MODEL=gpt-4
    volumes:
      - ./llm-parser:/app

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_PASSWORD=postgres
```

---

## 🚀 Déploiement

### 1. Créer le service Python

```bash
mkdir -p ~/codes/smart_eneo_server-main/eyeflow/llm-parser
cd ~/codes/smart_eneo_server-main/eyeflow/llm-parser

# Create directory structure
mkdir -p app tests
touch app/__init__.py app/main.py requirements.txt Dockerfile
```

### 2. `requirements.txt`

```
fastapi==0.104.1
uvicorn==0.24.0
pydantic==2.5.0
openai==1.3.0
python-dotenv==1.0.0
```

### 3. `Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

### 4. Run

```bash
docker-compose up llm-parser
```

---

## 🧪 Testing

```python
# test_llm_parser.py
import pytest
from app.main import LLMIntentParser

def test_parse_slack_message():
    parser = LLMIntentParser()
    
    response = parser.parse_intent(
        user_input="Send a Slack message to #alerts",
        llm_context={
            "connectors": [...],
            "functions": [...]
        },
        confidence_threshold=0.7
    )
    
    assert response.success == True
    assert response.confidence > 0.7
    assert len(response.missions) > 0
    assert response.missions[0]["functionId"] == "slack_send_message"
```

---

**Next: Connecter le service Python au backend TypeScript!** ✅
