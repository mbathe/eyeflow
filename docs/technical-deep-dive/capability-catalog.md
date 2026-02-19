---
sidebar_position: 4
title: Capability Catalog
description: Service registry and capability discovery
---

# Capability Catalog

The service registry that enables safe, deterministic LLM-based compilation.

## Purpose

The capability catalog is the critical bridge between **natural language** and **deterministic execution**:

1. **Safety**: LLM can only use registered services (no hallucinations)
2. **Determinism**: Only documented capabilities can be invoked
3. **Discoverability**: Enables automatic code generation
4. **Governance**: Central registry for all integrations

---

## Catalog Structure

### Catalog Format

```json
{
  "version": "2.0",
  "services": [
    {
      "id": "slack",
      "name": "Slack",
      "category": "communication",
      "description": "Send messages to Slack",
      "logo": "https://...",
      "capabilities": [
        {
          "id": "send_message",
          "name": "Send Message",
          "description": "Send text message to channel",
          "inputs": [
            {
              "name": "channel",
              "type": "string",
              "required": true,
              "description": "Channel ID or name",
              "example": "#alerts"
            },
            {
              "name": "text",
              "type": "string",
              "required": true,
              "description": "Message text",
              "example": "System alert"
            }
          ],
          "outputs": [
            {
              "name": "message_id",
              "type": "string",
              "description": "Message ID"
            }
          ],
          "rate_limit": "100/minute",
          "sandbox": "restricted"
        }
      ]
    }
  ]
}
```

---

## Services Included

### Communication (8 services)

1. **Slack**
   - send_message, create_thread, update_message, delete_message
   - Capabilities: 4 core + 8 advanced

2. **Email (SMTP)**
   - send_email, schedule_email, add_attachment
   - Capabilities: 3 core + 5 advanced

3. **Discord**
   - send_message, create_channel, mention_role
   - Capabilities: 3 core + 4 advanced

4. **Telegram**
   - send_message, send_photo, send_file
   - Capabilities: 3 core + 3 advanced

5. **Microsoft Teams**
   - send_message, create_channel
   - Capabilities: 2 core + 3 advanced

6. **SMS (Twilio)**
   - send_sms, schedule_sms
   - Capabilities: 2 core + 2 advanced

7. **Webhook**
   - POST, GET, PUT, DELETE
   - Capabilities: 4 core

8. **RSS**
   - publish_feed, publish_item
   - Capabilities: 2 core

---

### Data Integration (12 services)

1. **PostgreSQL**
   - query, insert, update, delete, transaction
   - Capabilities: 10 core

2. **MySQL**
   - query, insert, update, delete
   - Capabilities: 8 core

3. **MongoDB**
   - insert, update, delete, find, aggregate
   - Capabilities: 8 core

4. **Redis**
   - get, set, delete, incr, append
   - Capabilities: 10 core

5. **Elasticsearch**
   - search, index, delete, bulk
   - Capabilities: 6 core

6. **Firebase**
   - read, write, transact
   - Capabilities: 6 core

7. **S3**
   - upload, download, delete, list
   - Capabilities: 8 core

8. **Google Cloud Storage**
   - upload, download, delete
   - Capabilities: 6 core

9. **Azure Blob Storage**
   - upload, download, delete
   - Capabilities: 6 core

10. **Snowflake**
    - query, insert, stream
    - Capabilities: 6 core

11. **BigQuery**
    - query, insert, stream
    - Capabilities: 6 core

12. **GraphQL**
    - query, mutation
    - Capabilities: 2 core

---

### APIs & Data Sources (10 services)

1. **OpenWeather**
   - current_weather, forecast, alerts
   - Capabilities: 5

2. **Google Maps**
   - geocode, directions, places
   - Capabilities: 8

3. **OpenAI GPT**
   - completions, chat, embeddings
   - Capabilities: 4

4. **Stripe**
   - create_charge, refund, list_customers
   - Capabilities: 15

5. **Shopify**
   - create_order, update_order, list_products
   - Capabilities: 20

6. **Salesforce**
   - query, create, update, delete
   - Capabilities: 8

7. **HubSpot**
   - create_contact, update_contact, list_deals
   - Capabilities: 10

8. **Zendesk**
   - create_ticket, update_ticket, list_tickets
   - Capabilities: 8

9. **Twilio**
   - send_sms, make_call, send_fax
   - Capabilities: 6

10. **Jira**
    - create_issue, update_issue, list_issues
    - Capabilities: 8

---

### Business Logic (10 services)

1. **Email Validator**
   - check_format, check_mx, check_smtp
   - Capabilities: 3

2. **Phone Validator**
   - check_format, check_carrier
   - Capabilities: 2

3. **Address Validator**
   - validate, geocode, format
   - Capabilities: 3

4. **Credit Card Validator**
   - validate, identify_type
   - Capabilities: 2

5. **Password Strength**
   - check_strength, suggest_password
   - Capabilities: 2

6. **Data Transformer**
   - convert_format, parse, validate_schema
   - Capabilities: 5

7. **Text Analytics**
   - sentiment_analysis, extract_keywords, summarize
   - Capabilities: 5

8. **Image Processing**
   - resize, crop, convert, ocr
   - Capabilities: 8

9. **PDF Generation**
   - create_pdf, merge_pdfs, extract_text
   - Capabilities: 5

10. **Encryption**
    - encrypt, decrypt, hash
    - Capabilities: 3

---

## Capability Discovery

### Search Interface

```bash
# List all services
curl https://api.eyeflow.sh/catalog/services

# Search by keyword
curl https://api.eyeflow.sh/catalog/services?search=slack

# List capabilities for service
curl https://api.eyeflow.sh/catalog/services/slack/capabilities

# Get capability details
curl https://api.eyeflow.sh/catalog/services/slack/capabilities/send_message
```

### Example Response

```json
{
  "id": "send_message",
  "name": "Send Message",
  "description": "Send text message to Slack channel",
  "inputs": [
    {
      "name": "channel",
      "type": "string",
      "required": true,
      "description": "Slack channel ID or name",
      "example": "#alerts"
    },
    {
      "name": "text",
      "type": "string",
      "required": true,
      "description": "Message text",
      "example": "Alert: High temperature detected"
    }
  ],
  "outputs": [
    {
      "name": "message_id",
      "type": "string",
      "description": "Slack message ID",
      "example": "1234567890.123456"
    }
  ],
  "rate_limit": "100 per minute",
  "cost": 0.0001,
  "latency_p50": 250,
  "latency_p99": 1000
}
```

---

## Catalog Integration with Compilation

### How LLM Prevents Hallucinations

**Before (Without Catalog)**:
```
Task: "Send alert to Slack"
LLM generates (may hallucinate):
  - slack.send_to_channel (wrong method name)
  - slack.message_send (wrong method name)
  - slack.post (doesn't exist)
Result: Runtime error, no determinism
```

**After (With Catalog)**:
```
Task: "Send alert to Slack"
LLM receives catalog:
  Available: slack.send_message, slack.create_thread, ...
  Inputs: channel (required), text (required), ...
  Outputs: message_id, timestamp, ...
LLM generates (correct):
  - slack.send_message(channel="#alerts", text="alert")
Result: Deterministic execution, no errors
```

### Catalog-Driven Code Generation

```
1. Parse task: "Fetch weather and send to Slack"
2. Query catalog:
   - Find: openweather (weather API)
   - Find: slack (messaging)
3. Generate IR:
   CALL_SERVICE "openweather.current_weather" [city]
   EXTRACT_JSON ... "main.temp"
   CALL_SERVICE "slack.send_message" [channel, message]
4. Execute
```

---

## Custom Service Registration

### Adding Custom Services

```bash
# Register custom service
curl -X POST https://api.eyeflow.sh/catalog/services \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '
{
  "id": "my_service",
  "name": "My Service",
  "description": "Custom internal service",
  "capabilities": [
    {
      "id": "get_data",
      "name": "Get Data",
      "inputs": [
        {
          "name": "query",
          "type": "string",
          "required": true
        }
      ],
      "outputs": [
        {
          "name": "result",
          "type": "object"
        }
      ]
    }
  ],
  "endpoint": "https://my-service.internal/api",
  "auth": "api_key"
}
'
```

### Custom Service Example

**Internal Service**: Customer Database

```json
{
  "id": "customer_db",
  "name": "Customer Database",
  "capabilities": [
    {
      "id": "lookup_customer",
      "name": "Lookup Customer",
      "description": "Look up customer by ID or email",
      "inputs": [
        {
          "name": "customer_id",
          "type": "string",
          "required": false
        },
        {
          "name": "email",
          "type": "string",
          "required": false
        }
      ],
      "outputs": [
        {
          "name": "customer",
          "type": "object",
          "description": "Customer object with all fields"
        }
      ]
    },
    {
      "id": "create_customer",
      "name": "Create Customer",
      "inputs": [
        {
          "name": "name",
          "type": "string",
          "required": true
        },
        {
          "name": "email",
          "type": "string",
          "required": true
        }
      ],
      "outputs": [
        {
          "name": "customer_id",
          "type": "string"
        }
      ]
    }
  ]
}
```

---

## Versioning & Compatibility

### Service Versions

```json
{
  "id": "slack",
  "versions": [
    {
      "version": "1.0",
      "released": "2021-01-01",
      "status": "deprecated",
      "capabilities": ["send_message"]
    },
    {
      "version": "2.0",
      "released": "2022-06-01",
      "status": "stable",
      "capabilities": [
        "send_message",
        "create_thread",
        "update_message",
        "add_reaction"
      ]
    },
    {
      "version": "2.1",
      "released": "2024-01-01",
      "status": "beta",
      "capabilities": [
        "send_message",
        "create_thread",
        "update_message",
        "add_reaction",
        "create_workflow"
      ]
    }
  ]
}
```

### Backward Compatibility

```
v2.1 tasks CAN use v2.0 capabilities
v2.0 tasks CANNOT use v2.1 capabilities (unless opt-in)
v1.0 tasks are DEPRECATED (still work, but upgrading recommended)
```

---

## Performance & Scaling

### Catalog Caching

```
Update frequency: Hourly
Cache TTL: 1 hour
Cache size: ~5MB
Lookup time: <1ms (cached)

On cache miss:
  Fetch from catalog service: ~50ms
  Update cache
  Use result
```

### Service-Level Metrics

```
Per capability:
  - Usage count (daily)
  - Error rate
  - Average latency
  - Cost per execution
  - Availability %

Example:
  slack.send_message:
    - Usage: 2.3M/day
    - Error rate: 0.01%
    - Latency p99: 500ms
    - Cost: $0.0001
    - Availability: 99.99%
```

---

## Governance

### Service Classification

```
Level 1 (Stable):
  - Slack, Email, Database
  - High reliability
  - Full backward compatibility

Level 2 (Experimental):
  - New services being tested
  - May have breaking changes
  - Prefix: "beta" or "experimental"

Level 3 (Deprecated):
  - Being phased out
  - Full alternative available
  - Sunset date announced
```

### Approval Process

**Adding new public service**:
1. Design phase (catalog entry)
2. Implementation phase (connector)
3. Testing phase (internal trials)
4. Review phase (security, performance)
5. Beta release (limited audience)
6. General availability (catalog published)
7. Support (ongoing maintenance)

---

## Audit & Security

### Service Audit Log

```
Each service call logged:
  - Timestamp
  - Service + capability
  - User/task ID
  - Inputs (sanitized)
  - Outputs (sanitized)
  - Latency
  - Result (success/error)

Retention: 90 days
Query capability: Authorized users only
```

### Permission Model

```
Default: Users can use public services
Restricted: Admin approval required
Blocked: Service disabled for account

Example config:
  Allow:
    - slack.send_message
    - postgresql.query
    - openweather.*
  Deny:
    - stripe.* (not approved)
    - custom_payment.* (internal)
```

---

## Catalog API Reference

### List Services

```
GET /catalog/services
Query params:
  - search: string (keyword search)
  - category: string (filter by category)
  - limit: integer (default 20)
  - offset: integer (for pagination)

Response: Array of services
```

### Get Service Details

```
GET /catalog/services/{service_id}

Response:
  {
    "id": "slack",
    "name": "Slack",
    "description": "...",
    "capabilities": [...]
  }
```

### Get Capability Details

```
GET /catalog/services/{service_id}/capabilities/{capability_id}

Response:
  {
    "id": "send_message",
    "name": "Send Message",
    "inputs": [...],
    "outputs": [...],
    "rate_limit": "100/minute"
  }
```

### Search Capabilities

```
GET /catalog/capabilities/search
Query params:
  - query: string (search term)

Response: Array of matching capabilities
```

