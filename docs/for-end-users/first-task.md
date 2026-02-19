---
sidebar_position: 2
title: Create Your First Task
description: Build a practical task with connectors
---

# Create Your First Real Task

Now let's build something practical: **Get the weather and send it to Slack**

## Real-World Scenario

Every morning at 9 AM, automatically post the weather forecast to your team's Slack channel.

**What we'll build:**
```
Trigger: Schedule (daily, 9 AM)
  ↓
Action 1: Get weather (OpenWeather API)
  ↓
Action 2: Format message
  ↓
Action 3: Send to Slack #general
```

**Execution time:** 78ms  
**LLM calls:** 0 (all pre-compiled)  
**Hallucination risk:** Impossible

---

## Prerequisites

✅ EyeFlow running (from [quickstart](./quickstart.md))  
✅ Slack workspace with a channel  
✅ OpenWeather API key (free tier available)

### Get Your API Keys

**OpenWeather (Free):**
1. Go to [openweathermap.org](https://openweathermap.org)
2. Sign up for free account
3. Get your API key from "API Keys" section
4. Save it

**Slack (Easy):**
1. Go to [api.slack.com](https://api.slack.com)
2. Click "Create New App"
3. Choose "From scratch"
4. Name: "EyeFlow"
5. Select workspace → Create
6. Go to "OAuth & Permissions"
7. Under "Scopes," add: `chat:write`, `files:write`
8. Install to workspace
9. Copy "Bot User OAuth Token" (starts with `xoxb-`)

---

## Step-by-Step Guide

### Step 1: Connect your integrations

In Dashboard, click **Settings → Connectors**

#### Add OpenWeather

Click **+ Connect Service → OpenWeather**

```
Name: openweather_prod
API Key: [your API key from above]
Base URL: https://api.openweathermap.org/data/2.5
```

Click **Test Connection** → Should see ✅

Click **Save**

#### Add Slack

Click **+ Connect Service → Slack**

```
Name: slack_daily
Bot Token: xoxb-[your token]
Default Channel: #general
```

Click **Test Connection** → Should see ✅

Click **Save**

### Step 2: Create the task

Click **Tasks → + New Task**

```
Name: daily_weather_report
Description: Gets weather and posts to Slack
Trigger Type: Schedule
```

For **Schedule**, set:
```
Frequency: Daily
Time: 09:00 AM
Timezone: [Your timezone]
```

Click **Next**

### Step 3: Add the weather action

In **Actions**, click **+ Add Action**

```
Action Type: Call HTTP API
Name: fetch_weather
```

**API Details:**
```
Method: GET
URL: https://api.openweathermap.org/data/2.5/weather
Parameters:
  - q: "New York"  (city name, can be variable)
  - appid: ${openweather_prod.api_key}
```

Click **Save Action**

You'll see the weather API is now configured:
```
✅ fetch_weather (configured)
Endpoint: /data/2.5/weather
Expected output: {temperature, humidity, description, ...}
```

### Step 4: Format the message

Click **+ Add Action**

```
Action Type: Transform Data
Name: format_slack_message
```

In the **Template** field, enter:

```
📍 Today's Weather in New York

Temperature: ${fetch_weather.main.temp}°F
Humidity: ${fetch_weather.main.humidity}%
Conditions: ${fetch_weather.weather[0].description}

Have a great day! ☀️
```

Click **Save Action**

You'll see:
```
✅ format_slack_message
Input: fetch_weather output
Output: Formatted text for Slack
```

### Step 5: Send to Slack

Click **+ Add Action**

```
Action Type: Slack
Name: post_to_slack
Slack Connector: slack_daily
```

**Message Settings:**
```
Channel: #general
Message Type: Text
Message: ${format_slack_message}
```

Click **Save Action**

```
✅ post_to_slack
Channel: #general
Will execute after format_slack_message
```

### Step 6: Review and enable

You should see the complete flow:

```
┌─── Task: daily_weather_report ───┐
│                                   │
│ Schedule: Daily @ 09:00 AM       │
│ ├─ Enabled: Yes                  │
│                                   │
│ Actions:                          │
│ 1️⃣  fetch_weather                  │
│     └─ Call OpenWeather API       │
│                                   │
│ 2️⃣  format_slack_message          │
│     └─ Transform to Slack format  │
│                                   │
│ 3️⃣  post_to_slack                 │
│     └─ Send to #general           │
│                                   │
│ [Create Task]                    │
└─────────────────────────────────────┘
```

Click **Create Task**

**Success!** ✅

---

## Test It Immediately

### Manual Trigger

In Dashboard, go to **Tasks → daily_weather_report**

Click **▶ Run Now**

Watch the execution:

```
Task Execution: daily_weather_report

⏱️  Step 1 - fetch_weather
   Status: ✅ Complete (32ms)
   Data fetched: {"main": {"temp": 72, "humidity": 60}, ...}

⏱️  Step 2 - format_slack_message
   Status: ✅ Complete (8ms)
   Output: "📍 Today's Weather in New York..."

⏱️  Step 3 - post_to_slack
   Status: ✅ Complete (38ms)
   Message ID: ts_1234567890

Total Duration: 78ms
Status: ✅ SUCCESS
```

Check your Slack channel → You should see the weather report! 🎉

### Enable Automatic Scheduling

The schedule is already enabled. Verify in **Settings → Schedules**:

```
daily_weather_report
├─ Status: Active ✅
├─ Next run: Tomorrow 09:00 AM
├─ Frequency: Daily
└─ Last run: Just now (78ms)
```

---

## What You Just Learned

✅ **Task anatomy:**
- Triggers (schedule, webhook, event)
- Actions (parallel or sequential)
- Connectors (Slack, APIs, databases)

✅ **Data flow:**
- Actions pass outputs to next action
- Variables reference previous outputs
- Templates for text transformation

✅ **Performance:**
- Task compiled once, runs 78ms every time
- Zero LLM calls at runtime
- 100% reproducible every execution

---

## Next Steps

### Add more features to this task:

**Option 1: Add error handling**
- [Learn about conditionals and rules](./first-rule.md)

**Option 2: Connect more services**
- [Browse available connectors](../for-developers/connectors/overview.md)

**Option 3: Create more tasks**
```
Ideas:
- Send daily standup reminder, collect responses, post summary
- Monitor website uptime, alert if down
- Pull sales data, generate report, email stakeholders
- Sync data between services
- Clean up old files
```

---

## Troubleshooting

### "connector not found" error

Make sure the connector is saved in **Settings → Connectors** and the name matches exactly.

### "API returned 403 Forbidden"

Check your API key is correct and has the right permissions.

### "Slack message failed to send"

1. Verify bot token is valid (copy again from api.slack.com)
2. Check channel name is correct (include # symbol)
3. Make sure bot is invited to the channel

### Task runs slowly (>200ms)

Normal if API is slow. Check:
- API response time: `curl -X GET https://api.openweathermap.org/...`
- Network latency: `ping api.openweathermap.org`
- Slack API: Usually <50ms

---

**Want to learn more?**
- [Create automated rules (triggers within tasks)](./first-rule.md)
- [Explore all connectors](../for-developers/connectors/overview.md)
- [CLI usage for scripting](./cli-basics.md)
- [Architecture deep dive](../technical-deep-dive/semantic-compilation.md)

---

🚀 **Congratulations!** You've built your first real automation.
