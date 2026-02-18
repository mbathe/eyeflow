# 🚀 EyeFlow

**Universal Action Execution & Monitoring Platform**

> Execute and monitor any action on any PC/Server in real-time with complete auditability.

**Version:** 1.0.0 | **Status:** ✅ Production Ready | **Framework:** Nest.js + Python

---

## 📦 Project Structure

```
eyeflow/
├── eyeflow-server/              ← Nest.js Backend (REST + WebSocket)
│   ├── src/
│   │   ├── main.ts              ← Entrypoint
│   │   ├── app.module.ts        ← Root module
│   │   ├── agents/              ← Agent management
│   │   ├── actions/             ← Action orchestration
│   │   ├── jobs/                ← Job queuing
│   │   └── common/              ← Shared utilities
│   ├── test/                    ← E2E tests
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env
│   ├── .eslintrc.js
│   ├── Dockerfile
│   └── README-NESTJS.md         ← Detailed API docs
│
├── eyeflow-agent/               ← Python Agent Services
│   ├── src/
│   │   ├── main.py
│   │   ├── agent.py
│   │   └── executors/
│   ├── requirements.txt
│   └── Dockerfile
│
├── eyeflow-dashboard/           ← React Frontend (coming)
│
├── docker-compose.yml
└── .env.example
```

---

## 🚀 Quick Start

### Backend (Nest.js)

```bash
cd eyeflow-server

# Install
npm install --legacy-peer-deps

# Development
npm run dev

# Production
npm run build && npm run prod

# Tests
npm test
```

Server: **http://localhost:3000**

### Python Agent

```bash
cd eyeflow-agent

# Install
pip install -r requirements.txt

# Run
python src/main.py
```

---

## 📚 API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Server health |
| `/api` | GET | API info |
| `/agents/register` | POST | Register agent |
| `/agents` | GET | List agents |
| `/actions` | POST/GET | Actions management |
| `/jobs` | POST/GET | Job orchestration |

### Register Agent

```bash
curl -X POST http://localhost:3000/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "agentName": "Agent-1",
    "version": "1.0.0",
    "capabilities": ["shell", "python", "monitoring"]
  }'
```

---

## 🐳 Docker

```bash
# All services
docker-compose up

# Individual service
docker build -t eyeflow-server:latest eyeflow-server/
```

---

## ⚙️ Configuration

Edit `eyeflow-server/.env`:

```env
NODE_ENV=development
PORT=3000
DATABASE_HOST=localhost
DATABASE_NAME=eyeflow
JWT_SECRET=your-secret-key
```

---

## 📖 Documentation

- [Server API Docs](./eyeflow-server/README-NESTJS.md)
- [Configuration](./eyeflow-server/.env.example)

---

## 📝 License

MIT

---

**Built with ❤️ | © 2026**
