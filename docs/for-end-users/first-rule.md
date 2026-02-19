---
sidebar_position: 3
title: Create Your First Rule
description: Add automation logic with conditionals
---

# Create Your First Rule

Let's build **smart automation with conditionals**: Send different messages based on weather.

## Scenario

Expand the weather task from before:

```
If temperature > 75°F:
  "🌞 It's hot! Drink water!"
Else if temperature < 50°F:
  "❄️ It's cold! Dress warm!"
Else:
  "🌤️ Perfect weather today!"
```

**What you'll learn:**
- Conditionals (if/else logic)
- Branching workflows
- Data transformations

---

## Understanding Rules

A **Rule** in EyeFlow is a set of conditions that determine what actions to take.

### Rule Structure

```
IF (condition)
  THEN (do these actions)
ELSE IF (other condition)
  THEN (do these different actions)
ELSE
  (do default actions)
```

**Example:**
```
Rule: send_weather_alert

IF (temperature > 28°C)
  ├─ Send message: "Hot weather ☀️"
  └─ Send alert: high_temperature
  
ELSE IF (temperature < 10°C)
  ├─ Send message: "Cold weather ❄️"
  └─ Send alert: low_temperature
  
ELSE
  └─ Send message: "Normal weather 🌤️"
```

### Execution happens at compile time

```
Your Rule (English):
  "If it's hot, send alert"
       ↓
EyeFlow Parser:
  Converts to typed conditions
       ↓
LLM (Compile Phase):
  Generates bytecode branches
       ↓
Bytecode (Deterministic):
  IF_GT(temp, 28) → BRANCH_HOT
  ELSE → BRANCH_NORMAL
       ↓
Runtime Execution (Fast & Safe):
  45ms per execution
  Zero hallucinations
```

---

## Build It Step-by-Step

### Step 1: Start from your weather task

(From previous guide: [Create Your First Task](./first-task.md))

In Dashboard, **Tasks → daily_weather_report**

Click **Edit**

### Step 2: Replace the format action with a rule

Find **Action 2: format_slack_message**

Click the **⚙️ settings** icon → **Edit**

Change from "Transform Data" to "Rule"

```
Name: weather_rule
Rule Type: Conditional
Input: ${fetch_weather}
```

### Step 3: Define the conditions

Click **+ Add Condition**

**First condition:**
```
Name: is_hot
Condition: ${fetch_weather.main.temp} > 75
Then: Format message for hot weather
```

In the "Then" field (output):
```
📍 Today's Weather in New York

Temperature: ${fetch_weather.main.temp}°F 🌞
Humidity: ${fetch_weather.main.humidity}%
Conditions: ${fetch_weather.weather[0].description}

⚠️ It's hot today! Stay hydrated and use sunscreen! 🧴

Have a great day!
```

Click **Save Condition**

### Step 4: Add second condition

Click **+ Add Condition**

**Second condition:**
```
Name: is_cold
Condition: ${fetch_weather.main.temp} < 50
Then: Format message for cold weather
```

Output:
```
📍 Today's Weather in New York

Temperature: ${fetch_weather.main.temp}°F ❄️
Humidity: ${fetch_weather.main.humidity}%
Conditions: ${fetch_weather.weather[0].description}

🧣 Brrrr! Dress warm and don't forget your coat!

Stay cozy today!
```

Click **Save Condition**

### Step 5: Add default condition

Click **+ Add Default**

**Default (else):**
```
Name: is_normal
Output:
📍 Today's Weather in New York

Temperature: ${fetch_weather.main.temp}°F 🌤️
Humidity: ${fetch_weather.main.humidity}%
Conditions: ${fetch_weather.weather[0].description}

Perfect weather today! Enjoy!
```

Click **Save**

### Step 6: Review your rule

You should see:

```
┌─ Rule: weather_rule ─────────────────┐
│                                       │
│ IF (temp > 75)                       │
│   Output: "It's hot! ..." 🌞         │
│                                       │
│ ELSE IF (temp < 50)                  │
│   Output: "Brrrr! ..." ❄️            │
│                                       │
│ ELSE                                 │
│   Output: "Perfect weather!" 🌤️      │
│                                       │
│ [✅ Complete and Valid]             │
└─────────────────────────────────────┘
```

Click **Save Rule**

### Step 7: Update the next action

The **Action 3: post_to_slack** now receives output from the rule.

It should already reference: `${weather_rule}`

If not, update it to use: `${weather_rule}` instead of `${format_slack_message}`

### Step 8: Save the task

Click **Save Task**

---

## Test Different Scenarios

### Test Case 1: Hot Weather (72°F)

Click **Run Now** with default location (New York, ~72°F in summer)

```
Execution Trace:

1️⃣  fetch_weather
    Temp: 72°F ✅

2️⃣  weather_rule (evaluate conditions)
    Check: 72 > 75? NO
    Check: 72 < 50? NO
    Execute: DEFAULT PATH
    Output: "Perfect weather! 🌤️"

3️⃣  post_to_slack
    Message sent: "Perfect weather!"

Status: ✅ SUCCESS (62ms)
```

### Test Case 2: Override Location

To test hot weather, you can modify the task temporarily:

Edit the task → **Action 1: fetch_weather**

Change "q" parameter from "New York" to:
```
"Dubai"  (for hot weather test)
```

Run now → Should show 🌞 hot message

### Test Case 3: Different Location

Change to:
```
"Anchorage"  (for cold weather test)
```

Run now → Should show ❄️ cold message

---

## Understanding the Compilation

### Behind the Scenes

When you save the rule, EyeFlow compiles it:

```
Your Rule (Natural Language):
  - If temperature > 75°F, show hot message
  - Else if temperature < 50°F, show cold message
  - Else show normal message

         ⬇️ LLM Parser (Offline)

Typed Conditions:
  - COMPARE(main.temp, GT, 75)
  - COMPARE(main.temp, LT, 50)
  - DEFAULT

         ⬇️ Optimizer

Bytecode:
  PUSH temp_value
  PUSH 75
  CMP GT → IF_TRUE jump_to_hot
  PUSH temp_value
  PUSH 50
  CMP LT → IF_TRUE jump_to_cold
  jump_to_normal

         ⬇️ Runtime (Deterministic)

Input: {main: {temp: 72}}
  Execute: CMP(72, GT, 75) = FALSE
  Execute: CMP(72, LT, 50) = FALSE
  Jump: jump_to_normal
  Output: "Perfect weather!"
  Time: 3ms
```

**Key point:** Once compiled, runtime is just bytecode execution. NO LLM involved. NO hallucinations possible.

---

## Advanced Rules

### Combine Multiple Conditions (AND/OR)

```
IF (temperature > 75 AND humidity > 80)
  "Hot and humid! 🥵"
ELSE IF (temperature > 75 OR humidity > 90)
  "Hot or very humid 😅"
ELSE
  "Comfortable 😊"
```

### Use Nested Conditions

```
IF (weather_type = "rain")
  IF (temperature < 50)
    "Cold rain 🌧️❄️"
  ELSE
    "Gentle rain 🌧️"
ELSE
  ...
```

### Chain Multiple Rules

```
Task: weather_notification

1️⃣  fetch_weather
2️⃣  rule_1_weather_alert (hot/cold/normal)
3️⃣  rule_2_activity_suggestion (what to do today)
4️⃣  rule_3_clothing_advice (what to wear)
5️⃣  format_message (combine all suggestions)
6️⃣  post_to_slack
```

---

## Real-World Examples

### Example 1: Order Processing

```
Rule: process_order

IF (payment_status = "approved" AND inventory > 0)
  Actions:
  ├─ Deduct inventory
  ├─ Send shipment order
  └─ Email customer: "Order confirmed"
  
ELSE IF (payment_status = "approved" AND inventory = 0)
  Actions:
  ├─ Notify warehouse: backorder
  └─ Email customer: "Item will ship when available"
  
ELSE IF (payment_status = "declined")
  Actions:
  ├─ Flag order
  └─ Email customer: "Payment declined, please retry"
```

### Example 2: Server Monitoring

```
Rule: server_health

IF (cpu_load > 80)
  Actions:
  ├─ Alert: high_cpu
  ├─ Scale up servers
  └─ Slack: "@DevOps CPU high!"
  
ELSE IF (disk_free < 20%)
  Actions:
  ├─ Alert: low_disk
  ├─ Schedule cleanup
  └─ Slack: "@DevOps Disk low!"
  
ELSE IF (uptime > 99.5%)
  Actions:
  └─ Slack: "✅ Great performance today!"
```

### Example 3: Customer Segmentation

```
Rule: send_marketing_email

IF (customer_lifetime_value > $10,000)
  ├─ Send: Premium offers email
  └─ Template: vip_exclusive.html
  
ELSE IF (customer_lifetime_value > $1,000)
  ├─ Send: Standard offers email
  └─ Template: standard.html
  
ELSE IF (last_purchase > 90_days_ago)
  ├─ Send: "We miss you!" email
  └─ Template: winback.html
  
ELSE
  └─ Do nothing (too recent)
```

---

## Performance Impact

### Compilation (One-time)

```
Parse rule: 50ms
Generate bytecode: 100ms
Total: 150ms (once, then done)
```

### Runtime (Per execution)

```
Hot weather check: 3ms
Cold weather check: 3ms
Message format: 5ms
Slack send: 38ms
Total: 49ms (guaranteed)
```

**Even with 10 conditions:** Still ~50ms

**OpenClaw equivalent:** 1900ms+ (LLM called for each decision)

---

## Troubleshooting

### "Condition syntax error"

Make sure syntax is correct:
```
✅ Valid:   ${fetch_weather.main.temp} > 75
❌ Invalid: temperature > 75 (need full JSON path)
```

### "Rule returns null"

Missing default case. Always add a default clause.

### "Condition never triggers"

Check data path:
```
Debug: ${fetch_weather}
If output is empty, check fetch_weather action
```

### "Multiple conditions always false"

Likely a logic error. Test each condition independently first:
```
Temp: ${fetch_weather.main.temp}
Type: ${typeof fetch_weather.main.temp}
```

---

## Next Steps

**🎯 You're ready for advanced tasks!**

- [Explore all connectors](../for-developers/connectors/overview.md)
- [Learn about error handling](../for-developers/api-reference.md)
- [Dashboard tutorial](./ui-dashboard.md)
- [CLI for scripting](./cli-basics.md)

---

🎉 **Congratulations!** You've built your first conditional automation.
