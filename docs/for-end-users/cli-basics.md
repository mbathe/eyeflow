---
sidebar_position: 5
title: CLI Basics
description: Command-line interface for scripting and automation
---

# CLI Basics: Command-Line Interface

Use the EyeFlow CLI for automation, scripting, and batch operations.

## Installation

### Via npm

```bash
npm install -g @eyeflow/cli
```

### Via Docker

```bash
docker run -it eyeflow-cli:latest eyeflow --version
```

### Or use the local copy

```bash
cd eyeflow-server
npm run cli -- --help
```

### Verify installation

```bash
eyeflow --version
# eyeflow/1.0.0 (node 18.16.0)
```

---

## Configuration

### Set API endpoint

```bash
# Set for current session only
export EYEFLOW_API=http://localhost:3000

# Or set in config file (~/.eyeflow-cli.json)
eyeflow config set api http://localhost:3000
eyeflow config set api_key your_api_token
```

### Get your API key

```bash
# Via Dashboard: Settings → API Keys → [+ Create]
# Or via CLI:
eyeflow auth login
# (opens browser to authenticate)
```

### Verify configuration

```bash
eyeflow config get
```

Output:
```
{
  "api": "http://localhost:3000",
  "api_key": "sk_live_abc123...",
  "timeout": 30000,
  "format": "json"
}
```

---

## Common Commands

### Task Management

#### List all tasks

```bash
eyeflow tasks list
```

Output:
```
ID                    Name              Status    Trigger    
─────────────────────────────────────────────────────────────
task_abc123          daily_weather     Active    Schedule   
task_def456          slack_sync        Active    Webhook    
task_ghi789          db_cleanup        Inactive  Manual     

Total: 3 tasks
```

#### Get task details

```bash
eyeflow tasks get daily_weather
```

Output:
```
Task: daily_weather_report
ID: task_abc123
Status: Active
Description: Gets weather and posts to Slack
Created: 2024-09-15
Last run: 2 minutes ago
Success rate: 100% (140/140 executions)

Trigger: Schedule
├─ Frequency: Daily
├─ Time: 09:00 AM EST
└─ Next run: Tomorrow at 09:00

Actions: 3
├─ fetch_weather (API call)
├─ weather_rule (conditional)
└─ post_to_slack (send message)
```

#### Create a new task

```bash
eyeflow tasks create \
  --name "my_task" \
  --trigger "webhook" \
  --description "My first CLI task"
```

Output:
```
✅ Task created: task_xyz789
ID: task_xyz789
Webhook URL: https://localhost:3000/webhooks/xyz789
```

#### Run a task immediately

```bash
eyeflow tasks run daily_weather
```

Output:
```
▶ Execution started: exec_abc123
  Waiting for completion...

📊 Execution trace:
  1️⃣  fetch_weather      ✅  32ms
  2️⃣  weather_rule        ✅  3ms
  3️⃣  post_to_slack      ✅  43ms

✅ Completed in 78ms
Result:
{
  "status": "success",
  "duration": 78,
  "output": {...}
}
```

#### Delete a task

```bash
eyeflow tasks delete daily_weather
# Confirm: y/n?
y
# ✅ Task deleted
```

---

### Connectors

#### List connectors

```bash
eyeflow connectors list
```

Output:
```
NAME              SERVICE      STATUS   
────────────────────────────────────────
slack_daily       Slack        ✅ Connected        
openweather_prod  OpenWeather  ✅ Connected       
postgres_main     PostgreSQL   ✅ Connected       
```

#### Create connector

```bash
eyeflow connectors create \
  --service slack \
  --name slack_alerts \
  --token xoxb-1234567890
```

Output:
```
✅ Connector created: slack_alerts
Service: Slack
Status: ✅ Connected
```

#### Test connector

```bash
eyeflow connectors test slack_daily
```

Output:
```
👤 Testing Slack connection...
✅ Connection successful
Workspace: my-company
Bot token: valid
Permissions: chat:write, files:write
Rate limit: 120 requests/minute
```

#### Delete connector

```bash
eyeflow connectors delete slack_daily
```

---

### Execution History

#### List executions

```bash
eyeflow executions list [task_name] [--limit 20]
```

Output:
```
ID              Task           Status    Duration    Timestamp           
──────────────────────────────────────────────────────────────────────
exec_9a8b7c  daily_weather  ✅ S      78ms        Oct 2 2:34 PM      
exec_9a8b7b  slack_sync     ✅ S      156ms       Oct 2 2:29 PM      
exec_9a8b7a  db_cleanup     ✅ S      234ms       Oct 2 2:24 PM      
exec_9a8b79  email_send     ❌ F      2345ms      Oct 2 2:19 PM      

Total shown: 4 of 15,847 executions
```

#### Get execution details

```bash
eyeflow executions get exec_9a8b7c --verbose
```

Output:
```
Execution: exec_9a8b7c
Task: daily_weather_report
Status: ✅ Success
Duration: 78ms
Started: Oct 2, 2:34:12.000 PM
Ended: Oct 2, 2:34:12.078 PM

INPUT:
{
  "trigger": "schedule",
  "timestamp": "2024-10-02T14:34:12Z"
}

ACTIONS:
1️⃣  fetch_weather (32ms)
  ✅ Success
  Output: {
    "main": {
      "temp": 72,
      "humidity": 60
    },
    "weather": [{
      "description": "Partly cloudy"
    }]
  }

2️⃣  weather_rule (3ms)
  ✅ Success
  Output: "Perfect weather today! 🌤️"

3️⃣  post_to_slack (43ms)
  ✅ Success
  Response: {
    "ok": true,
    "channel": "C1234567",
    "ts": "1601234567.000123"
  }

FINAL OUTPUT:
{
  "status": "success",
  "message": "Posted to Slack successfully"
}
```

---

### Rules

#### List rules

```bash
eyeflow rules list
```

#### Create rule

```bash
eyeflow rules create \
  --name weather_alert \
  --description "Send alert for extreme weather"
```

#### View rule

```bash
eyeflow rules get weather_alert
```

#### Add condition to rule

```bash
eyeflow rules add-condition weather_alert \
  --condition 'temperature > 95' \
  --action 'send_alert_hot'
```

---

### Webhooks

#### List webhooks

```bash
eyeflow webhooks list
```

Output:
```
ID                    URL                         Task        Status
──────────────────────────────────────────────────────────────────────
webhook_abc123        /webhooks/abc123            daily_weather  ✅     
webhook_def456        /webhooks/def456            slack_sync     ✅     
```

#### Create webhook

```bash
eyeflow webhooks create \
  --task daily_weather \
  --name my_webhook
```

Output:
```
✅ Webhook created
ID: webhook_xyz789
URL: http://localhost:3000/webhooks/xyz789
Full URL: http://localhost:3000/webhooks/xyz789
```

#### Trigger webhook

```bash
curl -X POST http://localhost:3000/webhooks/xyz789 \
  -H "Content-Type: application/json" \
  -d '{"name": "Test", "value": 42}'
```

---

### System Information

#### Check system status

```bash
eyeflow status
```

Output:
```
🟢 EyeFlow System Status

Servers:
├─ API Server: ✅ Running (http://localhost:3000)
├─ Dashboard: ✅ Running (http://localhost:3001)
├─ Message Queue: ✅ Running (redis://localhost:6379)
└─ Database: ✅ Running (postgres://localhost:5432)

Stats:
├─ Tasks: 4 active
├─ Executions today: 47
├─ Average latency: 62ms
├─ Success rate: 100%
├─ Uptime: 99.98%
└─ Memory: 256MB / 1GB
```

#### View logs

```bash
eyeflow logs [--lines 50] [--follow]
```

With `--follow`, stream logs in real-time (like `tail -f`)

```bash
eyeflow logs --follow --filter error
```

---

## Advanced Usage

### Batch Operations

#### Create multiple tasks from file

```bash
# Create tasks.json
cat > tasks.json << 'EOF'
[
  {
    "name": "task1",
    "trigger": "webhook"
  },
  {
    "name": "task2",
    "trigger": "schedule",
    "schedule": "0 9 * * *"
  }
]
EOF

# Import
eyeflow tasks import tasks.json
```

#### Export all tasks

```bash
eyeflow tasks export > backup.json
```

#### Run multiple tasks in sequence

```bash
for task in task1 task2 task3; do
  eyeflow tasks run $task
  echo "✅ $task completed"
done
```

### Scripting

#### Check task execution status

```bash
#!/bin/bash
# wait_for_task.sh

TASK_NAME=$1
MAX_RETRIES=10
RETRY_DELAY=5

for i in $(seq 1 $MAX_RETRIES); do
  STATUS=$(eyeflow tasks get $TASK_NAME --json | jq -r '.last_run.status')
  
  if [ "$STATUS" = "success" ]; then
    echo "✅ Task succeeded"
    exit 0
  elif [ "$STATUS" = "failed" ]; then
    echo "❌ Task failed"
    exit 1
  fi
  
  echo "⏳ Waiting... ($i/$MAX_RETRIES)"
  sleep $RETRY_DELAY
done

echo "❌ Timeout waiting for task"
exit 1
```

Usage:
```bash
./wait_for_task.sh daily_weather
```

#### Monitor system health

```bash
#!/bin/bash
# monitor.sh

while true; do
  STATUS=$(eyeflow status --json)
  MEMORY=$(echo $STATUS | jq -r '.memory.usage')
  SUCCESS_RATE=$(echo $STATUS | jq -r '.success_rate')
  
  echo "Memory: $MEMORY | Success: $SUCCESS_RATE%"
  
  if (( $(echo "$MEMORY > 80" | bc -l) )); then
    echo "⚠️  High memory usage!"
    # Send alert
    curl -X POST https://hooks.slack.com/... \
      -d '{"text":"EyeFlow memory high"}'
  fi
  
  sleep 60
done
```

---

## Options & Flags

### Global Options

| Flag | Purpose |
|------|---------|
| `--help` | Show help |
| `--version` | Show version |
| `--api <url>` | Override API endpoint |
| `--json` | Output as JSON (for scripts) |
| `--csv` | Output as CSV |
| `--verbose` | Verbose output |
| `--quiet` | Suppress output |

### Format Output

#### JSON (for scripting)

```bash
eyeflow tasks list --json | jq '.tasks[] | .name'
```

Output:
```
"daily_weather"
"slack_sync"
"db_cleanup"
```

#### CSV (for spreadsheets)

```bash
eyeflow tasks list --csv > tasks.csv
```

Output:
```
ID,Name,Status,Trigger
task_abc123,daily_weather,Active,Schedule
task_def456,slack_sync,Active,Webhook
```

---

## Common Patterns

### Pattern 1: Deploy & Test

```bash
#!/bin/bash
# deploy.sh

# Export current configuration
eyeflow tasks export > backup_$(date +%s).json

# Import new tasks
eyeflow tasks import new_tasks.json

# Run smoke tests
eyeflow tasks run smoke_test_1
eyeflow tasks run smoke_test_2

echo "✅ Deployment complete"
```

### Pattern 2: Daily Report

```bash
#!/bin/bash
# daily_report.sh

YESTERDAY=$(date -d yesterday +%Y-%m-%d)

# Get stats
TOTAL=$(eyeflow executions list --json | jq '.total')
SUCCESS=$(eyeflow executions list --json | jq '.success_count')
FAILED=$(eyeflow executions list --json | jq '.failed_count')
AVG_LATENCY=$(eyeflow executions list --json | jq '.average_latency')

# Send report
MESSAGE="Daily Report ($YESTERDAY)
Total executions: $TOTAL
Successful: $SUCCESS
Failed: $FAILED
Avg latency: ${AVG_LATENCY}ms"

curl -X POST https://hooks.slack.com/... \
  -d "{\"text\":\"$MESSAGE\"}"
```

### Pattern 3: Conditional Task Execution

```bash
#!/bin/bash
# conditional_run.sh

# Check if database is healthy
if eyeflow connectors test postgres_main > /dev/null; then
  echo "DB is healthy, running task..."
  eyeflow tasks run db_sync
else
  echo "DB is down, skipping task"
  # Send alert
  eyeflow alerts create --name db_down --severity high
fi
```

---

## Troubleshooting

### "Connection refused"

```bash
# Check if server is running
eyeflow status

# Start server if needed
docker-compose up -d

# Check API endpoint
eyeflow config get
# Should show your API URL
```

### "Unauthorized"

```bash
# Re-authenticate
eyeflow auth login

# Or set token
eyeflow config set api_key your_new_token
```

### "Task not found"

```bash
# List available tasks
eyeflow tasks list

# Check spelling
eyeflow tasks get daily_weather  # Exact match required
```

### Debug mode

```bash
# Enable verbose logging
eyeflow --verbose tasks run my_task

# Check full error trace
eyeflow executions get exec_123 --verbose --json | jq .error
```

---

## Next Steps

- [Full API reference](../for-developers/api-reference.md)
- [Webhook documentation](../for-developers/api-reference.md#webhooks)
- [Connector development](../for-developers/connectors/custom.md)
- [Deployment guide](../for-developers/deployment.md)

---

**Ready to script?** Use the CLI as your automation foundation! 🚀
