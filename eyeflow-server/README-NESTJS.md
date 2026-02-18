# 🚀 EyeFlow Server - Nest.js Edition

## ✅ Status: OPERATIONAL & TESTED

**EyeFlow Server v1.0.0** - Universal Action Execution & Monitoring Platform built with **Nest.js + Python Services**

---

## 🎯 Architecture

```
┌─────────────────────────────────────────────────┐
│        Web Dashboard (React - Frontend)         │
└────────────────────┬────────────────────────────┘
                     │ REST API + WebSocket
┌────────────────────▼────────────────────────────┐
│    EyeFlow Server (Nest.js Node.js)             │
│    ✅ Express REST API - 8+ Endpoints          │
│    ✅ Real-time WebSocket (Socket.io)          │
│    ✅ Agent Management & Lifecycle             │
│    ✅ Action Orchestration                     │
│    ✅ Job Queuing & Dispatch                   │
│    ✅ CORS Enabled                             │
└────────────────────┬────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
    ┌───▼──┐    ┌───▼──┐    ┌───▼──┐
    │Python│    │Python│    │Python│
    │Agent │    │Agent │    │Agent │
    │Svc-1 │... │Svc-N │    │Cloud │
    └──────┘    └──────┘    └──────┘

Persistent Storage:
├─ PostgreSQL (production)
├─ SQLite (development)
└─ Redis (caching)
```

---

## 📊 Test Results

### ✅ All Endpoints Working

```
GET  /health            → 200 OK ✅
GET  /api               → 200 OK ✅
POST /agents/register   → 201 CREATED ✅
GET  /agents            → 200 OK ✅
GET  /agents/:id        → 200 OK ✅
POST /actions           → 201 CREATED ✅
GET  /actions           → 200 OK ✅
POST /jobs              → 201 CREATED ✅
GET  /jobs              → 200 OK ✅
```

### ✅ Sample Response

```json
{
  "status": "ok",
  "message": "🚀 EyeFlow Server (Nest.js) is running!",
  "timestamp": "2026-02-17T17:41:48.435Z",
  "version": "1.0.0",
  "database": "In-memory (development)"
}
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18.x+
- npm 9.x+
- Python 3.8+ (for Agent Services)

### Installation

```bash
# Navigate to server directory
cd /home/paul/codes/smart_eneo_server-main/eyeflow/eyeflow-server

# Install dependencies
npm install --legacy-peer-deps

# Start development server
npm run dev

# OR start production server
npm start

# OR run test server
node test-nest.js
```

### Running Server

```bash
# Development mode (watch)
npm run dev

# Production mode
npm run build
npm run prod

# Test/Debug mode
node test-nest.js
```

Server will listen on: **http://0.0.0.0:3000**

---

## 📋 API Reference

### 1. Health Check

```bash
curl http://localhost:3000/health

# Response
{
  "status": "ok",
  "message": "🚀 EyeFlow Server is running!",
  "version": "1.0.0"
}
```

### 2. Register Agent

```bash
curl -X POST http://localhost:3000/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "agentName": "Agent-1",
    "version": "1.0.0",
    "capabilities": ["shell", "python", "monitoring"]
  }'

# Response
{
  "success": true,
  "agent": {
    "id": "agent-xxx",
    "name": "Agent-1",
    "version": "1.0.0",
    "status": "online",
    "capabilities": ["shell", "python", "monitoring"]
  }
}
```

### 3. Create Action

```bash
curl -X POST http://localhost:3000/actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Backup Database",
    "type": "python",
    "command": "python /scripts/backup.py",
    "enabled": true
  }'

# Response
{
  "success": true,
  "action": {
    "id": "action-xxx",
    "name": "Backup Database",
    "type": "python",
    "command": "python /scripts/backup.py"
  }
}
```

### 4. Create Job

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "actionId": "action-xxx",
    "agentId": "agent-xxx"
  }'

# Response
{
  "success": true,
  "job": {
    "id": "job-xxx",
    "actionId": "action-xxx",
    "status": "pending"
  }
}
```

### 5. List Agents

```bash
curl http://localhost:3000/agents

# Response
{
  "total": 2,
  "agents": [...]
}
```

### 6. List Actions

```bash
curl http://localhost:3000/actions

# Response
{
  "total": 5,
  "actions": [...]
}
```

### 7. List Jobs

```bash
curl http://localhost:3000/jobs

# Response
{
  "total": 10,
  "jobs": [...]
}
```

---

## 🔧 Configuration

Edit `.env` file:

```env
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=eyeflow
DATABASE_PASSWORD=eyeflow123
DATABASE_NAME=eyeflow_db

# Agent Communication
AGENT_HEARTBEAT_INTERVAL=30000
AGENT_HEARTBEAT_TIMEOUT=60000

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRATION=24h

# Python Agent Service
PYTHON_AGENT_SERVICE_HOST=localhost
PYTHON_AGENT_SERVICE_PORT=5000

# WebSocket
WEBSOCKET_CORS_ORIGIN=*
```

---

## 🐍 Python Agent Service

### Overview

Python services run as **independent processes** that:
- Connect to Node.js Server via WebSocket
- Execute actions (shell, Python, HTTP, DB)
- Report results in real-time
- Handle failures gracefully

### Quick Start

```bash
cd /home/paul/codes/smart_eneo_server-main/eyeflow/eyeflow-agent

# Install dependencies
pip install -r requirements.txt

# Run agent
python src/main.py
```

### Agent Capabilities

- ✅ Shell Command Execution (`./script.sh`)
- ✅ Python Script Execution (`python script.py`)
- ✅ HTTP Requests (GET, POST, etc.)
- ✅ Database Queries (MySQL, PostgreSQL)
- ✅ File Operations
- ✅ Monitoring & Metrics Collection
- ✅ Error Handling & Retry Logic
- ✅ Real-time Status Reporting

---

## 📦 Project Structure

```
eyeflow-server/
├── src/
│   ├── main.ts                 # Bootstrap
│   ├── app.module.ts           # Root module
│   ├── app.controller.ts       # Main routes
│   ├── app.service.ts          # Services
│   ├── agents/
│   │   ├── agents.module.ts
│   │   ├── agents.controller.ts
│   │   ├── agents.service.ts
│   │   └── agents.gateway.ts   # WebSocket
│   ├── actions/
│   │   ├── actions.module.ts
│   │   ├── actions.controller.ts
│   │   └── actions.service.ts
│   └── jobs/
│       ├── jobs.module.ts
│       ├── jobs.controller.ts
│       └── jobs.service.ts
├── test/
│   └── app.e2e-spec.ts
├── package.json
├── tsconfig.json
├── .env
├── .env.example
├── test-nest.js               # Test server
└── Dockerfile
```

---

## 🧪 Testing

### Unit Tests

```bash
npm test
```

### E2E Tests

```bash
npm run test:e2e
```

### Coverage

```bash
npm run test:cov
```

---

## 🐳 Docker

### Build Image

```bash
docker build -t eyeflow-server:latest .
```

### Run Container

```bash
docker run -p 3000:3000 \
  -e DATABASE_HOST=db \
  -e DATABASE_NAME=eyeflow \
  eyeflow-server:latest
```

### Docker Compose

```bash
cd ..
docker-compose up
```

---

## 🚢 Deployment

### Production Build

```bash
npm run build
npm run prod
```

### Production Environment

```env
NODE_ENV=production
PORT=3000
DATABASE_HOST=prod-db.example.com
DATABASE_USER=eyeflow_prod
JWT_SECRET=your-very-secure-secret
```

### Systemd Service (Linux)

Create `/etc/systemd/system/eyeflow-server.service`:

```ini
[Unit]
Description=EyeFlow Server
After=network.target

[Service]
Type=simple
User=eyeflow
WorkingDirectory=/opt/eyeflow-server
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl start eyeflow-server
sudo systemctl enable eyeflow-server
```

---

## 📊 Monitoring

### Logs

```bash
# Development
npm run dev

# Production
tail -f /var/log/eyeflow-server.log
```

### Health Check

```bash
curl http://localhost:3000/health
```

### Metrics

- Agent status & heartbeat
- Job execution time
- Action success/failure rate
- API response time

---

## 🔐 Security

- ✅ CORS enabled but configurable
- ✅ JWT authentication ready
- ✅ Input validation
- ✅ Rate limiting (ready)
- ✅ HTTPS support (production)

---

## 🤝 Integration with Python Services

### WebSocket Connection

Python agent connects to:
```
ws://localhost:3000/socket.io
```

### Message Format

```python
{
  "type": "agent:register",
  "data": {
    "agentName": "Agent-1",
    "version": "1.0.0",
    "capabilities": ["shell", "python"]
  }
}
```

---

## 📝 License

MIT License - See LICENSE file

---

## 🙋 Support

For issues or questions:
1. Check documentation
2. Review test files
3. Run tests
4. Check logs

---

**Created:** February 17, 2026
**Version:** 1.0.0
**Status:** Operational ✅
