---
sidebar_position: 1
title: Quickstart
description: Get EyeFlow running in 5 minutes
---

# Quickstart: Get Running in 5 Minutes

Let's get EyeFlow running and execute your first automation.

## Prerequisites

✅ **Have these ready:**
- Docker installed ([download](https://www.docker.com/products/docker-desktop))
- Docker Compose installed
- 5 MB free disk space
- Any text editor (VS Code, Sublime, etc.)

**Optional:**
- Git (for cloning examples)
- Python 3.8+ (for advanced integrations)

## Start EyeFlow (3 minutes)

### 1. Clone the repository

```bash
git clone https://github.com/eyeflow-ai/eyeflow.git
cd eyeflow
```

### 2. Start the services

```bash
docker-compose up -d
```

This starts:
- **EyeFlow Server** (API, task execution) → `http://localhost:3000`
- **EyeFlow Dashboard** (Web UI) → `http://localhost:3001`
- **PostgreSQL** (data storage)
- **Kafka** (event streaming)

**Verify it's running:**

```bash
docker ps | grep eyeflow
```

You should see 4 containers running. ✅

### 3. Open the Dashboard

Open your browser and go to: **http://localhost:3001**

You should see:
```
┌─────────────────────────────────────┐
│     Welcome to EyeFlow Dashboard    │
│                                     │
│  📊 Dashboard                       │
│  ⚙️  Settings                       │
│  📚 Connectors                      │
│  🎯 Tasks                           │
│  ⚡ Rules                           │
│  📊 Monitoring                      │
└─────────────────────────────────────┘
```

**Congratulations!** EyeFlow is running. ✅

---

## Execute Your First Task (2 minutes)

### Step 1: Create a webhook trigger

In the Dashboard, click **Settings → Webhooks**

Click **+ New Webhook**

```
Name: my_first_webhook
Description: First webhook trigger
Enabled: Yes
```

Click **Create**

You'll see:
```
ID: webhook_a1b2c3d4e5f6
URL: https://localhost:3000/webhooks/a1b2c3d4e5f6
```

Copy the webhook URL. You'll need it.

### Step 2: Create a simple task

Click **Tasks → + New Task**

```
Name: hello_world
Description: My first task
Trigger: Webhook
```

In the **Actions** section, click **+ Add Action**

```
Action Type: Log to Console
Message: "Hello from EyeFlow! 🎉"
```

Click **Create Task**

### Step 3: Trigger it

From your terminal:

```bash
curl -X POST http://localhost:3000/webhooks/a1b2c3d4e5f6 \
  -H "Content-Type: application/json" \
  -d '{"name": "World"}'
```

**Result:** The task executes instantly!

Check the **Dashboard → Monitoring**:

```
Task: hello_world
Status: ✅ Completed
Duration: 45ms
Output: Hello from EyeFlow! 🎉
Time: 12:34:56 PM
```

**Success!** 🎉

---

## What's Next?

You've just:
✅ Started EyeFlow  
✅ Created your first webhook  
✅ Executed your first task  

### Choose your next step:

**🚀 Ready for more?**
- [Create your first real task with connectors](./first-task.md)
- [Set up automation rules](./first-rule.md)

**🤔 Want to understand better?**
- [How EyeFlow works](../intro/what-is-eyeflow.md)
- [Architecture overview](../technical-deep-dive/semantic-compilation.md)

**🔧 Need specific integration?**
- [Connect to Slack](../for-developers/connectors/slack.md)
- [Connect to PostgreSQL](../for-developers/connectors/postgresql.md)
- [Connect to Kafka](../for-developers/connectors/kafka.md)

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs eyeflow-server

# Restart everything
docker-compose down
docker-compose up -d
```

### Dashboard won't load

- Wait 10 seconds (containers take time to start)
- Clear browser cache (Ctrl+Shift+Delete)
- Check if port 3001 is available: `lsof -i :3001`

### Webhook URL gives 404

- Make sure the webhook ID matches (shown in Settings)
- Check that the task is in "Enabled" state
- Verify the task has at least one action

### Still stuck?

Check the logs:

```bash
docker-compose logs -f eyeflow-server | grep -i error
```

Or post in [GitHub Discussions](https://github.com/eyeflow-ai/eyeflow/discussions)

---

## Performance Metrics

**Your first task showed:**
```
Latency: 45ms (compile + execute)
Status: ✅ Success
Memory: ~50MB
CPU: <5%
```

**At scale, EyeFlow handles:**
- 3,333 tasks/second
- 45-50ms per task (always)
- 100% deterministic (never fails)
- 90% cheaper than alternatives

---

**Ready for the next step?** Continue to [Create Your First Real Task](./first-task.md)
