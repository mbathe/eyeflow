# Eyeflow LLM Service

Multi-provider LLM service for generating enterprise workflow rules from natural language intent.
**LLM configuration is centralized in NestJS** - no API keys needed in this service!

## 🎯 Features

- **Multi-LLM Support**: Anthropic Claude, OpenAI GPT-4, and more
- **Centralized Configuration**: LLM config stored securely in NestJS database
- **Intelligent Rule Generation**: Creates production-ready workflow JSON from natural language
- **Batch Processing**: Generate multiple rules efficiently in one request
- **Dynamic Condition Evaluation**: Use LLM reasoning for complex condition expressions
- **Rule Refinement**: Improve rules iteratively based on feedback
- **Context Caching**: Cache aggregated capabilities to reduce API calls
- **Production-Ready**: Retry logic, error handling, comprehensive logging

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd /home/paul/codes/smart_eneo_server-main/eyeflow/eyeflow-llm-service
pip install -r requirements.txt
```

### 2. Configure Environment (Minimal)

```bash
cp .env.example .env
# .env only needs service infrastructure settings
# LLM configuration comes from NestJS!
```

### 3. Ensure NestJS Server is Running & Configured

The LLM service fetches workflow context AND LLM configuration from NestJS:

```bash
cd /home/paul/codes/smart_eneo_server-main/eyeflow/eyeflow-server
npm start
```

**Create or Update LLM Configuration in NestJS:**

```bash
# Create Anthropic config (recommended)
curl -X POST http://localhost:3000/api/llm-config \
  -H "Content-Type: application/json" \
  -H "X-User-ID: system" \
  -d '{
    "provider": "anthropic",
    "model": "claude-3-opus-20240229",
    "temperature": 0.3,
    "maxTokens": 4096,
    "isDefault": true,
    "apiConfig": {
      "apiKey": "sk-ant-your-API-key-here"
    }
  }'

# Or create OpenAI config
curl -X POST http://localhost:3000/api/llm-config \
  -H "Content-Type: application/json" \
  -H "X-User-ID: system" \
  -d '{
    "provider": "openai",
    "model": "gpt-4-turbo",
    "temperature": 0.3,
    "maxTokens": 4096,
    "isDefault": true,
    "apiConfig": {
      "apiKey": "sk-your-openai-key-here",
      "apiUrl": "https://api.openai.com/v1"
    }
  }'

# Verify default config is set
curl http://localhost:3000/api/llm-config/default \
  -H "X-User-ID: system"
```

### 4. Start LLM Service

```bash
# Development with auto-reload
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Production
python main.py
```

Visit: http://localhost:8000/docs (Swagger UI)

## 🏗️ Architecture

### Configuration Flow

```
Your LLM Config (Stored in NestJS)
        ↓
   [LLMConfigFetcher] (Cached 1 hour)
        ↓
   [LLMProviderRegistry] (Creates provider instance)
        ↓
   [FastAPI Service] (Uses provider for generation)
```

### Lifecycle

1. **Startup**: Python service boots → fetches config from NestJS → creates LLM provider
2. **Caching**: Config cached for 1 hour (configurable `CONFIG_FETCH_INTERVAL_MINUTES`)
3. **Runtime**: Generate rules using cached config
4. **Refresh**: Force refresh via `POST /config/refresh` endpoint

### Provider System

```
ILLMProvider (Abstract Base)
├─ AnthropicProvider (Claude 3 Opus) ⭐ Recommended
├─ OpenAIProvider (GPT-4 Turbo)
├─ OllamaProvider (Local Ollama - Coming Soon)
└─ LlamaCppProvider (Local llama.cpp - Coming Soon)
```

## 🔌 API Endpoints

### Health & Info

```bash
GET /health                 # Health check with provider info
GET /providers              # Available LLM providers
GET /cache/status          # Cache age and validity
```

### Rule Generation

```bash
# Single rule from intent
POST /api/rules/generate
{
  "aggregated_context": {...},        # From NestJS /aggregated endpoint
  "user_intent": "Alert when CPU > 80%"
}

# Multiple rules in batch
POST /api/rules/generate-batch
{
  "aggregated_context": {...},
  "intents": ["intent1", "intent2", "intent3"]
}
```

### Condition Evaluation

```bash
POST /api/conditions/evaluate
{
  "condition": "$metrics.cpu > 80 AND $status == running",
  "context": { "metrics": {...}, "status": "running" }
}
```

### Rule Refinement

```bash
POST /api/rules/refine
{
  "current_rules": {...},
  "feedback": "Add retry logic for failures",
  "aggregated_context": {...}
}
```

### Configuration Management

```bash
# Refresh LLM config from NestJS (useful after NestJS config update)
POST /config/refresh

# Invalidate context cache
POST /cache/invalidate
```

## 🤖 LLM Provider Details

### Anthropic Claude 3 Opus (Recommended)

**Advantages:**
- 200K token context window (largest)
- Excellent at complex reasoning
- Best for long system prompts with 40+ capability types
- Structured JSON generation is precise
- Great at following detailed instructions

**Cost:** ~$15/1M input, ~$75/1M output tokens

**NestJS Configuration:**
```json
{
  "provider": "anthropic",
  "model": "claude-3-opus-20240229",
  "temperature": 0.3,
  "maxTokens": 4096,
  "isDefault": true,
  "apiConfig": {
    "apiKey": "sk-ant-..."
  }
}
```

### OpenAI GPT-4 Turbo

**Advantages:**
- Faster response times (lower latency)
- Cheaper than Claude
- Good for creative problem-solving
- Large 128K context window

**Cost:** ~$10/1M input, ~$30/1M output tokens

**NestJS Configuration:**
```json
{
  "provider": "openai",
  "model": "gpt-4-turbo",
  "temperature": 0.3,
  "maxTokens": 4096,
  "isDefault": true,
  "apiConfig": {
    "apiKey": "sk-...",
    "apiUrl": "https://api.openai.com/v1"
  }
}
```

## 📊 Example: Generate Rules

### Request

```bash
curl -X POST http://localhost:8000/api/rules/generate \
  -H "Content-Type: application/json" \
  -d '{
    "user_intent": "Alert team when database memory exceeds 85%",
    "aggregated_context": {
      "condition_types": [...],
      "action_types": [...],
      ...
    }
  }'
```

### Response

```json
{
  "workflow_rules": {
    "workflow_name": "database-memory-alert",
    "trigger": "ON_WORKFLOW_START",
    "rules": [
      {
        "name": "check-memory",
        "condition": "($metrics.db_memory_percent > 85)",
        "then": [
          {
            "action": "SEND_WITH_ESCALATION",
            "params": {...}
          }
        ]
      }
    ]
  },
  "model_used": "claude-3-opus-20240229",
  "tokens_used": 3847,
  "generation_time_ms": 1250
}
```

## 🔄 Configuration Workflow

### First Time Setup

1. **Start NestJS server** - implements `/api/llm-config` endpoints
2. **Create LLM config** via NestJS API (see examples above)
3. **Mark as default** - set `isDefault: true` in config
4. **Start LLM service** - automatically fetches and uses config
5. **Generate rules** - service uses fetched LLM provider

### Switching LLM Providers

1. **Update NestJS config** - create new config or update existing default
2. **Refresh service** - call `POST /config/refresh` or restart service
3. **Service auto-switches** - next request uses new provider

No need to restart Python service or change environment variables!

## 🛠️ Development

### Debug Logging

Enable debug output:
```bash
LOG_LEVEL=DEBUG python main.py
```

### Check Current Configuration

```bash
curl http://localhost:8000/health

# Returns:
{
  "status": "healthy",
  "provider": "anthropic",
  "model": "claude-3-opus-20240229",
  "context_cache_age_minutes": 5
}
```

### Test LLM Configuration

```bash
# Verify NestJS config loads correctly
curl http://localhost:3000/api/llm-config/default \
  -H "X-User-ID: system"

# Should return your configured LLM
```

## 🐛 Troubleshooting

### "No default LLM configuration found"

The LLM service couldn't find a default config in NestJS.

**Fix:**
```bash
# Create config in NestJS
curl -X POST http://localhost:3000/api/llm-config \
  -H "X-User-ID: system" \
  -d '{
    "provider": "anthropic",
    "model": "claude-3-opus-20240229",
    "isDefault": true,
    "apiConfig": {"apiKey": "sk-ant-..."}
  }'

# Refresh service
curl -X POST http://localhost:8000/config/refresh
```

### "Failed to fetch LLM config"

NestJS server not running or not accessible.

**Fix:**
```bash
# Verify NestJS is running
curl http://localhost:3000/health

# Check NestJS URL in .env
cat .env | grep NESTJS_SERVER_URL

# Ensure ports match (default: 3000)
```

### "Invalid API key"

LLM API key in NestJS config is incorrect.

**Fix:**
1. Update NestJS config with correct API key
2. Call `POST /config/refresh` in LLM service
3. Retry generation

## 📈 Production Checklist

- [ ] Set `DEBUG=False` in .env
- [ ] LLM API key securely stored in NestJS (encrypted in DB)
- [ ] Context cache TTL appropriate for your use case
- [ ] Monitor token usage and costs
- [ ] Set up error alerting
- [ ] Configure CORS for NestJS integration
- [ ] Use HTTPS for production NestJS server
- [ ] Regular LLM config backups

## 🎓 Configuration Management Best Practices

1. **Centralized**: All LLM configs in NestJS DB, not scattered across services
2. **Versioned**: Each config has `createdAt`, `updatedAt` timestamps
3. **User-scoped**: Configs isolated by user (via `X-User-ID` header)
4. **Encrypted**: API keys stored encrypted in database
5. **Hot-swappable**: Change providers without restarting services
6. **Audited**: Configuration changes logged

## 📝 URL Summary

```
NestJS Server
├── GET  /api/llm-config              # List all configs (for user)
├── POST /api/llm-config              # Create config
├── GET  /api/llm-config/default      # Get default config
├── GET  /api/llm-config/:id          # Get specific config
├── PUT  /api/llm-config/:id          # Update config
└── POST /api/llm-config/:id/health-check  # Test config

LLM Service
├── GET  /health                      # Service health
├── POST /api/rules/generate          # Generate rules
├── POST /api/rules/generate-batch    # Batch generate
├── POST /api/conditions/evaluate     # Evaluate condition
├── POST /api/rules/refine            # Refine rules
├── POST /config/refresh              # Refresh LLM config from NestJS
└── POST /cache/invalidate            # Invalidate context cache
```

## 📝 License

Part of Eyeflow Enterprise Orchestration Platform

