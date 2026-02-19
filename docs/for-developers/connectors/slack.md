---
sidebar_position: 5
title: Slack Connector
description: Send messages, files, and manage channels in Slack
---

# Slack Connector

Integrate EyeFlow with Slack to send messages, manage channels, and automate notifications.

## Features

- Send messages to channels
- Post reactions
- Upload files
- Create channels
- Invite members
- Manage threads
- Share files from URL

## Setup

### Step 1: Create Slack App

1. Go to [api.slack.com](https://api.slack.com)
2. Click **Create New App**
3. Choose **From scratch**
4. **App Name:** `EyeFlow`
5. **Workspace:** Select your workspace
6. Click **Create App**

### Step 2: Configure Permissions

In your app dashboard:

1. Go to **OAuth & Permissions**
2. Under **Scopes**, add **Bot Token Scopes**:
   - `chat:write` - Send messages
   - `files:write` - Upload files
   - `channels:manage` - Create channels
   - `users:read` - Get user info
   - `reactions:write` - Add reactions

3. If you need more, add:
   - `channels:read` - List channels
   - `users:read:email` - Get user emails
   - `channels:read:user` - Access private channels

4. Scroll to top and click **Install to Workspace**

### Step 3: Get Bot Token

After installation:
1. Go to **OAuth & Permissions**
2. Copy **Bot User OAuth Token** (starts with `xoxb-`)
3. Keep this secret!

### Step 4: Connect in EyeFlow

1. Dashboard → **Settings → Connectors**
2. Click **+ Connect Service → Slack**
3. **Name:** `slack_notifications` (any name)
4. **Bot Token:** Paste your token (`xoxb-...`)
5. **Default Channel:** `#general` (optional)
6. Click **Test Connection** → Should show ✅
7. Click **Save**

---

## Usage Examples

### Send a Message

```
Task: send_weather_alert

Action 1: Slack Message
Connector: slack_notifications
Function: send_message

Params:
  channel: "#weather-alerts"
  text: "🌡️ Temperature alert: 95°F"
```

In the Dashboard task editor:
```
Channel: #weather-alerts
Text: 🌡️ Temperature alert: 95°F
Message type: Text
```

### Send a Rich Message (Blocks)

More advanced with Slack Blocks:

```json
{
  "channel": "#updates",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Daily Weather Report* for New York"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Temperature:*\n72°F"
        },
        {
          "type": "mrkdwn",
          "text": "*Humidity:*\n60%"
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "View More"
          },
          "url": "https://example.com/weather"
        }
      ]
    }
  ]
}
```

### Mention Users & Groups

```
Send a message with mentions:

"Hi @user_name, your report is ready: ${report_link}"

For groups:
"Team attention needed: @channel"
"<!here> Emergency: System down"
```

### Upload File

```
Action: Upload File to Slack

Params:
  channel: "#documents"
  file_url: "${file_upload_link}"
  title: "Daily Report"
  initial_comment: "📄 Your daily report is ready"
```

### Create Channel

```
Action: Create Slack Channel

Params:
  name: "project-${project_id}"
  description: "Channel for Project ${project_name}"
  is_private: false
```

### Add Reaction

```
Action: Add Reaction

Params:
  channel: "#announcements"
  message_timestamp: "1234567890.000100"
  emoji_name: "tada"
```

---

## Real-World Scenarios

### Scenario 1: Daily Standup Bot

```
Task: daily_standup

Trigger: Schedule (9:00 AM every weekday)

Actions:
1. Fetch standup questions from DB
2. Post questions to #standup channel
3. Set 1-hour timeout for responses
4. Collect responses
5. Summarize and post to #management

Result: Automated daily standup every morning ✅
```

### Scenario 2: Error Alert System

```
Task: error_notification

Trigger: Webhook (from error monitoring)

Actions:
1. Receive error event
2. Filter by severity
3. IF severity == "critical":
   - Post to #critical-alerts
   - Mention @oncall team
   - Include stack trace
   Else:
   - Post to #warnings

Result: Alerts routed intelligently ✅
```

### Scenario 3: File Processing Pipeline

```
Task: process_and_share

Trigger: New file uploaded to S3

Actions:
1. Download file from S3
2. Process (resize, convert, validate)
3. Upload result to Slack
4. Post message with file preview
5. Notify team in channel

Result: Automated file processing ✅
```

### Scenario 4: Status Page Updates

```
Task: system_status_update

Trigger: External API (status service)

Actions:
1. Fetch current system status
2. Create formatted message
3. IF status changed:
   - Post to #status channel
   - Update topic
   - Mention #status-followers

Result: Real-time status updates ✅
```

---

## Advanced Features

### Thread Replies

Post replies within a thread:

```json
{
  "channel": "#random",
  "thread_ts": "1234567890.000100",
  "text": "This is a reply in a thread"
}
```

### Scheduled Messages

Send message at specific time:

```json
{
  "channel": "#announcements",
  "text": "Scheduled announcement",
  "scheduled_time": 1609459200
}
```

### Interactive Components

Buttons and selects:

```json
{
  "channel": "#decisions",
  "blocks": [
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "Approve" },
          "action_id": "approve_btn",
          "value": "click_me_123"
        },
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "Reject" },
          "action_id": "reject_btn",
          "value": "click_me_123"
        }
      ]
    }
  ]
}
```

---

## Channel Selection

### By Name

```
channel: "#general"
channel: "#alerts"
channel: "#private-team" (must be invited)
```

### By ID

```
channel: "C1234567890"  (channel ID)
```

### Direct Message

```
channel: "@username"         (direct message)
channel: "U1234567890"       (user ID)
```

### Group DM

```
channel: "G1234567890"  (group DM ID)
```

---

## Slack Message Formatting

### Markdown Support

```
*bold*
_italic_
~strikethrough~
`code`
```

### Links

```
<https://example.com|Click here>
<https://example.com|Example Site>
```

### Code Blocks

```
\`\`\`
code here
\`\`\`

\`\`\`javascript
const x = 42;
\`\`\`
```

### Lists

```
• Item 1
• Item 2
○ Sub-item 2a
○ Sub-item 2b
• Item 3
```

---

## Troubleshooting

### "Channel Not Found"

```
Error: "channel_not_found"

Solutions:
1. Verify channel name is correct (#with-dash)
2. Bot must be invited to private channels
3. Use channel ID instead of name
4. Check channel hasn't been deleted
```

### "Not in Channel"

```
Error: "not_in_channel"

Solution:
1. Go to Slack
2. Open the channel
3. Click channel name at top
4. Click "Invite to channel" or add bot
5. Invite @EyeFlow bot
```

### "Rate Limited"

```
Error: "rate_limited"

Solution:
- Slack allows 1 msg/sec per channel
- Wait before sending more
- Use batch operations when possible
```

### "Invalid Token"

```
Error: "invalid_auth"

Solution:
1. Re-generate token at api.slack.com
2. Go back to EyeFlow Settings → Connectors
3. Update token
4. [Test Connection] to verify
```

### "Permission Denied"

```
Error: "permission_denied"

Solution:
- Token scope is missing required permission
- Check OAuth & Permissions in Slack settings
- Add missing scopes (chat:write, files:write, etc.)
- Reinstall app to workspace
```

---

## Slack API Limits

| Limit | Value |
|-------|-------|
| Messages per second | 1/sec per channel |
| File upload size | 1GB |
| Text length | 40,000 chars |
| Threads limit | No limit |
| Reactions per message | 20,000+ |
| Files per workspace | Unlimited (with plan) |

---

## Security Best Practices

✅ **Do:**
- Rotate bot tokens monthly
- Use specific permission scopes (not blanket access)
- Audit who has access to connector
- Monitor channel access

❌ **Don't:**
- Share bot token publicly
- Use personal access tokens
- Add bot to unnecessary channels
- Grant admin permissions

---

## Real API Reference

For advanced usage, check:
- [Slack API Docs](https://api.slack.com)
- [Slack Blocks Kit](https://app.slack.com/block-kit-builder)
- [Message Format](https://api.slack.com/messaging/composing)

---

## Next Steps

- [Explore other connectors](./overview.md)
- [Create custom connector](./custom.md)
- [View API reference](../api-reference.md)

---

Automate your Slack notifications in 5 minutes! 🚀
