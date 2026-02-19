---
sidebar_position: 4
title: Connectors Overview
description: Available integrations and services
---

# Connectors: Integrations & Services

EyeFlow connects to 40+ services out-of-the-box. Here's the complete list.

## Communication

### Slack
- Send messages
- Post reactions
- Upload files
- Create channels
- Managing users

[→ Full Slack Guide](./slack.md)

### Email (SMTP)
- Send emails
- HTML templates
- Attachments
- BCC/CC

### Twilio
- Send SMS
- Make calls
- Voice messages

### Discord
- Send messages
- Manage roles
- Create channels

### Microsoft Teams
- Send messages
- Adaptive cards
- Channel notifications

## Data & Storage

### PostgreSQL
- Query databases
- Insert/Update records
- Run migrations
- Backup/restore

[→ Full PostgreSQL Guide](./postgresql.md)

### MongoDB
- CRUD operations
- Aggregations
- Indexes

### MySQL / MariaDB
- Query databases
- Transactions
- Replication

### AWS S3
- Upload files
- Get objects
- List buckets
- Delete files

### Google Drive
- Upload files
- Share documents
- Create folders
- Manage permissions

## Analytics & Monitoring

### Google Analytics
- Get page views
- Query events
- Analyze user behavior

### Datadog
- Send metrics
- Create monitors
- Query logs

### Prometheus
- Query metrics
- Alert handling

### Splunk
- Search logs
- Run reports
- Create dashboards

## Development & CI/CD

### GitHub
- Create issues
- Manage PRs
- Trigger workflows
- Deploy releases

### GitLab
- Manage projects
- Pipeline control
- Issue tracking

### Jenkins
- Trigger builds
- Get job status
- Run parameterized builds

### Docker
- Pull images
- Build containers
- Manage registries

### Kubernetes
- Deploy pods
- Scale workloads
- Manage secrets

## Payment & Commerce

### Stripe
- Create charges
- Manage customers
- Process refunds
- Webhook handling

### PayPal
- Create invoices
- Process payments
- Manage subscriptions

### Shopify
- Get products
- Create orders
- Manage inventory

## CRM & Business

### Salesforce
- Create leads
- Update opportunities
- Manage accounts
- Run reports

### HubSpot
- Manage contacts
- Create deals
- Track interactions

### Pipedrive
- Manage pipelines
- Track deals
- Contact management

## Event Streaming

### Kafka
- Publish messages
- Consumer groups
- Topic management

[→ Full Kafka Guide](./kafka.md)

### RabbitMQ
- Publish messages
- Queue management
- Consume messages

### AWS SNS/SQS
- Publish to SNS
- Send to SQS
- Manage topics/queues

## APIs

### REST API
- Generic HTTP calls
- Authentication
- Custom headers
- Body transformation

[→ Full REST Guide](./rest-api.md)

### GraphQL
- Run queries
- Run mutations
- Variable support

### SOAP
- WSDL parsing
- Complex types
- Envelope handling

## Infrastructure

### AWS EC2
- Launch instances
- Manage security groups
- Manage elastic IPs

### Azure VMs
- Create resources
- Manage VMs
- Scaling

### Digital Ocean
- Droplet management
- Load balancing

### SSH
- Run remote commands
- File transfer
- Key authentication

## Scheduling & Workflow

### Cron
- Schedule jobs
- Time-based triggers

### Calendar
- Google Calendar
- Outlook Calendar
- Event creation

## Creating Custom Connectors

Don't see what you need? Create a custom connector:

[→ Custom Connector Guide](./custom.md)

**Process:**
1. Implement ConnectorInterface
2. Define capabilities
3. Register in Catalog
4. Test and validate
5. Deploy

---

## Connector Comparison

| Service | Type | Auth | RateLimit | Priority |
|---------|------|------|-----------|----------|
| Slack | Communication | OAuth2 | 120/min | ⭐⭐⭐ |
| PostgreSQL | Data | Password | Unlimited | ⭐⭐⭐ |
| Stripe | Payment | API Key | 100/sec | ⭐⭐⭐ |
| GitHub | DevOps | OAuth2/Token | 5000/hr | ⭐⭐⭐ |
| Kafka | Streaming | SASL | Unlimited | ⭐⭐⭐ |
| AWS S3 | Storage | IAM | 3500/sec | ⭐⭐ |
| MongoDB | Data | Password | Unlimited | ⭐⭐ |
| Twilio | Communication | API Key | 100/sec | ⭐⭐ |

---

## Getting Started

### Step 1: Choose Connector

Browse the list above and select one that matches your service.

### Step 2: Gather Credentials

Each connector needs authentication:
- **API Key**: Usually a string (Stripe, Twilio)
- **OAuth2**: Requires browser login (Slack, GitHub)
- **Username/Password**: Self-hosted services (PostgreSQL, MongoDB)
- **Custom Auth**: Service-specific (AWS IAM, Azure managed identity)

### Step 3: Add Connector in Dashboard

1. Go to **Settings → Connectors**
2. Click **+ Connect Service**
3. Select desired service
4. Enter credentials
5. Click **[Test Connection]**
6. If ✅ appears, success!

### Step 4: Use in Tasks

In any task, reference connectors:
```
Action: Slack Message
Connector: slack_daily (dropdown)
Function: send_message
```

---

## Best Practices

### Security
- ✅ Use API keys specific to integrations (not shared keys)
- ✅ Rotate credentials regularly
- ✅ Use TLS 1.2+ only
- ✅ Never commit secrets to Git

### Performance
- ✅ Connection reuse (EyeFlow pools connections)
- ✅ Batch operations when possible
- ✅ Cache results when safe
- ✅ Watch rate limits

### Reliability
- ✅ Enable fallback actions for critical connectors
- ✅ Test connectors after rotation
- ✅ Monitor connector health
- ✅ Have backups for sensitive operations

---

## Troubleshooting

### "Connection Failed"

```
Likely causes:
1. Invalid credentials
2. Service is down
3. Firewall blocking access
4. IP address not whitelisted

Solution:
- Click [Test Connection] to verify
- Check credentials are correct
- Verify service status page
```

### "Rate Limit Exceeded"

```
You've hit the service's rate limit

Solution:
- Reduce execution frequency
- Use connector pooling
- Contact service provider for quota increase
- Consider caching responses
```

### "Authentication Expired"

```
OAuth token or API key expired

Solution:
- Re-authenticate via Settings
- Generate new API key
- Rotate credentials
- Test connection again
```

---

## Advanced Topics

### Connector Pooling

EyeFlow automatically pools connections:
```
Task 1: Use Slack connector → 1 connection
Task 2: Use Slack connector → Reuse connection (faster)
Task 3: Use Slack connector → Reuse connection
Result: 3x faster than separate connections
```

### Request Timeout

Default timeout: 30 seconds
Can be customized per task:
```
Action: REST API Call
URL: https://slow-api.example.com
Timeout: 60 seconds (override default)
```

### Fallback Connectors

If primary fails, use secondary:
```
Action: Send notification
Primary: Slack
Fallback: Email
Result: Always succeeds, via one method or other
```

---

## Connector Development

Ready to extend EyeFlow?

[→ Create Custom Connector](./custom.md)

**Available integrations:**
- REST APIs
- WebSockets
- gRPC
- Database drivers
- Message queues
- File systems

---

**Popular connectors:**
- [Slack](./slack.md)
- [PostgreSQL](./postgresql.md)
- [REST API](./rest-api.md)
- [Kafka](./kafka.md)
- [Google Drive](./google-drive.md)

**Or create your own:**
- [Custom Connector Guide](./custom.md)

---

Integrate with your entire tech stack within 5 minutes. 🚀
