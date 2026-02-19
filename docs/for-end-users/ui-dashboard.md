---
sidebar_position: 4
title: Dashboard Tour
description: Navigate the EyeFlow web interface
---

# Dashboard Tour: Complete Interface Guide

Your visual command center for all automations.

## Dashboard Map

```
┌─────────────────────────────────────────────────────────┐
│  🔷 EyeFlow                    🔍 Search    👤 Account │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  📊 NAVIGATION                  MAIN CONTENT            │
│  ├─ 📊 Dashboard         ┌────────────────────────┐   │
│  ├─ 📝 Tasks             │ Welcome to Dashboard   │   │
│  ├─ ⚡ Rules             │ 2 active tasks         │   │
│  ├─ 📚 Connectors        │ 5 recent executions    │   │
│  ├─ 🔔 Alerts            │ System status: ✅      │   │
│  ├─ 📊 Monitoring        │                        │   │
│  ├─ 📜 History           │ [More info buttons]    │   │
│  ├─ 🔧 Settings          └────────────────────────┘   │
│  └─ ⚙️  System                                         │
│                                                         │
│     Light/Dark Mode    Notifications    Help  Logout  │
└─────────────────────────────────────────────────────────┘
```

---

## Main Dashboard

### Overview Panel

When you first land on Dashboard:

```
┌─ Dashboard ──────────────────────────────┐
│                                          │
│ 📈 Quick Stats                          │
│ ├─ Active Tasks: 2                      │
│ ├─ Today's Executions: 47               │
│ ├─ Success Rate: 100%                   │
│ ├─ Average Latency: 56ms                │
│ └─ Uptime: 99.98%                       │
│                                          │
│ ⚡ Recent Activity                      │
│ ├─ daily_weather_report (4 min ago)    │
│ ├─ slack_sync_teams (12 min ago)       │
│ ├─ db_backup (1 hour ago)              │
│ ├─ email_campaign (2 hours ago)        │
│ └─ [View all →]                        │
│                                          │
│ 🔴 Alerts                               │
│ ├─ ✅ No active alerts                 │
│ └─ [Configure alerts →]                │
│                                          │
│ 📊 Execution Graph (Last 24 hours)      │
│                                          │
│ Tasks: ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁                 │
│                                          │
└──────────────────────────────────────────┘
```

**What you can do:**
- See system health at a glance
- Quick access to recent tasks
- Spot issues before they happen
- Click any metric to drill down

---

## 📝 Tasks Section

### List View

Click **Tasks** in the left menu:

```
┌─ Tasks ─────────────────────────────────┐
│ [+ New Task]  [Import]  [Export]       │
│ 🔍 Filter by: Status ▾  Trigger ▾     │
│                                        │
│ Name              Status    Trigger    │
│ ─────────────────────────────────────  │
│ daily_weather     🟢 Active Schedule   │
│ slack_sync        🟢 Active Webhook    │
│ db_cleanup        🟡 Pending Manual    │
│ email_report      🟢 Active Schedule   │
│ [Load more...]                         │
│                                        │
│ Total: 4 tasks                         │
└────────────────────────────────────────┘
```

**Actions:**
- **Click task name** → Edit task
- **▶ Run Now** → Execute immediately
- **⋮ Menu** → Disable, delete, duplicate
- **+ New Task** → Create from scratch

### Task Detail View

Click on any task (e.g., "daily_weather"):

```
┌─ Task: daily_weather_report ──────────┐
│                                       │
│ [← Back]  [Edit]  [▶ Run Now]  [⋮]  │
│                                       │
│ ℹ️  Information                       │
│ ├─ Status: 🟢 Active                │
│ ├─ Created: Sep 15, 2024             │
│ ├─ Last run: 4 minutes ago           │
│ ├─ Last status: ✅ Success           │
│ ├─ Last duration: 78ms               │
│ └─ Success rate: 100% (140/140)      │
│                                       │
│ 📅 Schedule                           │
│ ├─ Frequency: Daily                  │
│ ├─ Time: 09:00 AM EST                │
│ ├─ Next run: Tomorrow 09:00           │
│ └─ [Edit schedule...]                │
│                                       │
│ 🔗 Trigger                           │
│ └─ Schedule                           │
│                                       │
│ 📋 Actions (3 total)                 │
│ ├─ 1️⃣  fetch_weather (API call)      │
│ ├─ 2️⃣  weather_rule (conditional)   │
│ └─ 3️⃣  post_to_slack (send message) │
│                                       │
│ 🔔 Notifications                     │
│ ├─ On success: None                   │
│ ├─ On failure: Email admin            │
│ └─ [Configure...]                    │
│                                       │
│ 📊 Analytics                          │
│ ├─ Total executions: 140             │
│ ├─ Success rate: 100%                │
│ ├─ Avg duration: 76ms                │
│ ├─ Min: 42ms | Max: 156ms            │
│ └─ [View history →]                  │
└──────────────────────────────────────┘
```

**Sections:**
- **Information** - Status and metadata
- **Schedule** - When and how often it runs
- **Actions** - What the task does
- **Notifications** - Alerts on success/failure
- **Analytics** - Performance metrics

---

## ⚡ Rules Section

Similar to Tasks, but for **Rules** (reusable conditional logic):

```
┌─ Rules ──────────────────────────────┐
│ [+ New Rule]  [Import]               │
│                                      │
│ Name              Status    Used in  │
│ ──────────────────────────────────   │
│ weather_alert     🟢 Active 2 tasks  │
│ order_processor   🟢 Active 5 tasks  │
│ server_monitor    🟡 Draft  0 tasks  │
│ [+ Create new rule]                  │
│                                      │
│ Total: 3 rules                       │
└──────────────────────────────────────┘
```

**Each rule has:**
- Name and description
- Conditions (if/else logic)
- Actions (what happens)
- Used by count (how many tasks use it)

---

## 📚 Connectors Section

Connect to external services:

```
┌─ Connectors ──────────────────────────┐
│ [+ Connect Service]                   │
│ 🔍 Search: [__________]               │
│                                       │
│ CONNECTED ✅                          │
│ ├─ Slack (@slack_daily)               │
│ │  Status: ✅ Connected                │
│ │  Actions: [Edit] [Test] [Delete]   │
│ │                                     │
│ ├─ OpenWeather (@openweather_prod)   │
│ │  Status: ✅ Connected                │
│ │  Used by: 3 tasks                   │
│ │  Actions: [Edit] [Test] [Delete]   │
│ │                                     │
│ └─ PostgreSQL (@postgres_main)        │
│    Status: ✅ Connected                │
│    Used by: 7 tasks                   │
│    Actions: [Edit] [Test] [Delete]   │
│                                       │
│ AVAILABLE                             │
│ ├─ Twilio (SMS)                       │
│ ├─ Stripe (Payment)                   │
│ ├─ GitHub (Repository)                │
│ ├─ AWS (Cloud)                        │
│ └─ [View all 40+ connectors...]      │
│                                       │
└───────────────────────────────────────┘
```

**Actions:**
- **[+ Connect Service]** - Add new integration
- **[Test]** - Verify connection working
- **[Edit]** - Update credentials
- **[Delete]** - Remove integration

### Add a New Connector

Click **+ Connect Service**:

```
┌─ Add Connector ─────────────────────┐
│                                     │
│ Select Service:                     │
│ 🔍 [____________________]           │
│                                     │
│ Category:                           │
│ [Communication]  [Data]  [Cloud]   │
│                                     │
│ Available Services:                 │
│ ├─ 💬 Slack                         │
│ ├─ 📧 Gmail                         │
│ ├─ 📞 Twilio                        │
│ ├─ 🗄️  PostgreSQL                  │
│ ├─ ☁️  AWS S3                       │
│ └─ [Show all...]                    │
│                                     │
│ ┤ Click to select ┤                │
└─────────────────────────────────────┘
```

After selecting service (e.g., "Slack"):

```
┌─ Connect Slack ─────────────────────┐
│                                     │
│ Slack Workspace:                    │
│ [Select workspace ▾]                │
│                                     │
│ Display Name:                       │
│ [slack_notifications___________]   │
│                                     │
│ Permissions:                        │
│ ✓ Send messages                     │
│ ✓ Upload files                      │
│ ✓ Manage channels                   │
│                                     │
│ [Test Connection]  [Cancel]  [Save]│
└─────────────────────────────────────┘
```

---

## 🔔 Alerts Section

Monitor and manage notifications:

```
┌─ Alerts ───────────────────────────┐
│ [+ Create Alert]                    │
│                                     │
│ ACTIVE ALERTS                       │
│ ├─ daily_weather: Failed ⚠️         │
│ │  Last: Oct 2, 3:45 PM             │
│ │  [View] [Acknowledge] [Delete]   │
│ │                                   │
│ ├─ db_backup: Slow ⚠️               │
│ │  Last: Oct 1, 11:32 PM            │
│ │  Duration: 450ms (normal: 200ms)  │
│ │  [View] [Acknowledge] [Delete]   │
│ │                                   │
│ └─ slack_sync: Warning ⚠️           │
│    Last: 2 hours ago                │
│    [View] [Acknowledge] [Delete]   │
│                                     │
│ ALERT HISTORY                       │
│ Last 30 days: 3 alerts              │
│ [View all...]                       │
│                                     │
└────────────────────────────────────┘
```

**Alert types:**
- 🔴 Failed (task failed)
- 🟡 Warning (high latency, partial failure)
- 🔵 Info (informational only)

### Create an Alert

Click **+ Create Alert**:

```
┌─ New Alert ─────────────────────────┐
│                                     │
│ Alert Name:                         │
│ [daily_weather_failure__________]  │
│                                     │
│ Watch Task:                         │
│ [daily_weather_report ▾]            │
│                                     │
│ Alert When:                         │
│ ⦿ Task fails                        │
│ ○ Task takes > ___ ms               │
│ ○ Execution count > ___/day         │
│                                     │
│ Notify:                             │
│ □ Email: admin@company.com          │
│ ☑ Slack: #alerts                    │
│ □ SMS: +1234567890                  │
│                                     │
│ [Create]  [Cancel]                  │
└─────────────────────────────────────┘
```

---

## 📊 Monitoring Section

Real-time performance metrics:

```
┌─ Monitoring ──────────────────────────┐
│ Time Range: [Last 24h ▾]              │
│                                       │
│ 📊 Execution Rate                     │
│ Tasks per minute: ▁▂▃▄▅▆▇█▇▆▅       │
│ Peak: 15 per minute @ 2:34 PM        │
│                                       │
│ ⏱️  Latency                           │
│ Min: 32ms   Avg: 62ms  Max: 215ms   │
│ Performance: 99.2% under 100ms ✅    │
│                                       │
│ ✅ Success Rate                       │
│ 100% success (2,847 total)           │
│ Last failure: 2 days ago             │
│                                       │
│ 💾 Resource Usage                    │
│ Memory: 256MB / 1GB                  │
│ CPU: 12% average                     │
│ Network: 2.3 MB/sec peak             │
│                                       │
│ 🔝 Top Tasks                         │
│ 1. daily_weather (847 execs)        │
│ 2. slack_sync (602 execs)           │
│ 3. email_send (398 execs)           │
│                                       │
│ [Detailed metrics →]                 │
└───────────────────────────────────────┘
```

**Tabs:**
- **Overview** - Quick stats
- **Latency** - Response time analysis
- **Throughput** - Executions per time period
- **Errors** - Failure analysis
- **Resources** - CPU, memory, network

---

## 📜 History Section

View past executions:

```
┌─ Execution History ──────────────────┐
│ Filter by: Task ▾  Status ▾  Date ▾ │
│ 🔍 Search results                    │
│                                      │
│ Execution ID  Task      Status Time  │
│ ──────────────────────────────────── │
│ exec_9a8b7c  daily_weather ✅ 2m ago │
│ exec_9a8b7b  slack_sync   ✅ 5m ago  │
│ exec_9a8b7a  weather_rule ✅ 8m ago  │
│ exec_9a8b79  email_send   🔴 1h ago  │
│ exec_9a8b78  daily_weather ✅ 1d ago │
│ [Load more...]                       │
│                                      │
│ Total: 15,847 executions             │
└──────────────────────────────────────┘
```

**Click any execution** to see details:

```
┌─ Execution Detail ────────────────────┐
│ ID: exec_9a8b7c                       │
│ Task: daily_weather_report            │
│ Status: ✅ Success                    │
│ Duration: 78ms                        │
│ Started: Oct 2, 2:34:12 PM            │
│ Completed: Oct 2, 2:34:12.078 PM      │
│                                       │
│ Actions Executed:                     │
│ 1️⃣  fetch_weather      ✅  32ms       │
│    Output: {temp: 72, humidity: 60}  │
│                                       │
│ 2️⃣  weather_rule        ✅  3ms       │
│    Output: "Perfect weather! 🌤️"    │
│                                       │
│ 3️⃣  post_to_slack      ✅  43ms       │
│    Message ID: ts_1234567890.0012345 │
│                                       │
│ [← Back]                             │
└───────────────────────────────────────┘
```

---

## 🔧 Settings Section

Configure system behavior:

```
┌─ Settings ────────────────────────┐
│                                   │
│ WORKSPACE                         │
│ ├─ Workspace Name: My Workspace  │
│ ├─ Workspace ID: ws_abc123       │
│ ├─ Created: Sep 1, 2024          │
│ │ [Edit]                          │
│ │                                 │
│ ├─ Members (3)                    │
│ │ • alice@company.com (Owner)    │
│ │ • bob@company.com (Editor)     │
│ │ • charlie@company.com (Viewer) │
│ │ [Add member] [Remove]          │
│ │                                 │
│ └─ [Delete workspace] (danger!)  │
│                                   │
│ APIKEYS                           │
│ └─ [Create new API key]           │
│                                   │
│ WEBHOOKS                          │
│ ├─ [+ Create webhook]             │
│ ├─ webhook_1: /webhooks/xyz123   │
│ ├─ webhook_2: /webhooks/abc456   │
│ └─ [Manage all...]               │
│                                   │
│ INTEGRATIONS                      │
│ ├─ Connected services: 5          │
│ └─ [Manage connectors...]        │
│                                   │
│ BACKUP & IMPORT/EXPORT            │
│ ├─ [Export all tasks]             │
│ ├─ [Import tasks]                 │
│ └─ [Backup now]                   │
│                                   │
│ NOTIFICATIONS                     │
│ ├─ Email on task failure: ✓       │
│ ├─ Daily digest: ✓                │
│ └─ [Configure...]                 │
│                                   │
└───────────────────────────────────┘
```

---

## Typical Workflows

### Workflow 1: Create a New Task

```
1. Click [+ New Task]
2. Name, description, trigger type
3. Add actions (click [+ Add Action] N times)
4. Configure each action (API, connectors, etc.)
5. Review and save
6. [▶ Run Now] to test
7. Enable schedule if needed
```

### Workflow 2: Debug a Failed Task

```
1. Dashboard → See alert
2. Click alert or go to History
3. Click failed execution
4. View action-by-action trace
5. Check action output/error
6. View full logs (click [Logs])
7. Fix connector credentials or task logic
8. Click [▶ Run Now] to retry
```

### Workflow 3: Scale a Task to Different Services

```
1. Find working task
2. Click [⋮] → Duplicate
3. Rename duplicate
4. Edit connectors/actions
5. Test with [▶ Run Now]
6. Enable schedule
```

---

## Tips & Tricks

**🔍 Search everything:**
- Use search bar at top to find tasks, rules, executions

**⌨️ Keyboard shortcuts:**
- `Ctrl+K` - Command palette (quick actions)
- `Ctrl+/` - Help menu
- `?` - Show all shortcuts

**🎯 Dark mode:**
- Click moon icon (bottom left) to toggle

**📱 Mobile friendly:**
- Dashboard works on tablets
- Limited editing (desktop better for full control)

**⏰ Timezone awareness:**
- All times shown in your local timezone
- Schedules always run in specified timezone

---

**Ready to explore?**
- [CLI for power users](./cli-basics.md)
- [API reference for developers](../for-developers/api-reference.md)
- [Connector library](../for-developers/connectors/overview.md)

---

Now you can navigate EyeFlow like an expert! 🎯
