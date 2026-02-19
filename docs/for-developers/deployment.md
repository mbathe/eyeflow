---
sidebar_position: 7
title: Deployment
description: Deploy EyeFlow to production environments
---

# Deployment Guide

Deploy EyeFlow securely and reliably to your production environment.

## Deployment Architectures

### Development (Local)

```bash
docker-compose up -d

# Runs on localhost:3000 and localhost:3001
```

**When to use:** Learning, testing, development

### Staging (Pre-production)

```bash
docker-compose -f docker-compose.staging.yml up -d
```

**When to use:** QA, performance testing, final validation

### Production (AWS)

Recommended setup for business-critical workloads.

---

## Production Deployment (AWS)

### Architecture Overview

```
┌─────────────────────────────────────────────────┐
│         CloudFront (CDN)                        │
│  - Caches dashboard                             │
│  - DDoS protection                              │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│         Application Load Balancer               │
│  - HTTPS / SSL termination                      │
│  - Health checks                                │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│    ECS Cluster (Auto-scaling)                   │
│  - 3-10 API server instances                    │
│  - 2 Dashboard instances                        │
│  - Each in different AZs                        │
└────────────────────┬────────────────────────────┘
                     │
        ┌────────────┼────────────┬──────────────┐
        │            │            │              │
┌───────▼───┐  ┌─────▼───┐  ┌────▼────┐  ┌────▼─────┐
│PostgreSQL │  │  Kafka  │  │  Redis  │  │ S3 (logs)│
│ (RDS HA)  │  │ (3 node)│  │(cluster)│  │          │
└───────────┘  └─────────┘  └─────────┘  └──────────┘
```

### Step 1: Prepare AWS

**Required AWS Services:**
- ECS (container orchestration)
- RDS PostgreSQL (database)
- ElastiCache Redis (caching)
- MSK Kafka (message queue)
- ALB (load balancer)
- CloudFront (CDN)
- S3 (logs, backups)
- Secrets Manager (credentials)

### Step 2: Create RDS Database

```bash
# Create PostgreSQL 14+ on RDS
AWS_REGION=us-east-1

aws rds create-db-instance \
  --db-instance-identifier eyeflow-prod \
  --db-instance-class db.t3.medium \
  --engine postgres \
  --master-username postgres \
  --master-user-password $(openssl rand -base64 32) \
  --allocated-storage 100 \
  --storage-type gp3 \
  --backup-retention-days 30 \
  --multi-az \
  --enable-iam-database-authentication \
  --enable-deletion-protection

# Output: Database endpoint, master password
```

### Step 3: Create ElastiCache Redis

```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id eyeflow-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-nodes 3 \
  --automatic-failover-enabled

# Output: Redis endpoint (cluster.abc.ng.0001.use1.cache.amazonaws.com)
```

### Step 4: Create MSK Kafka Cluster

```bash
aws kafka create-cluster \
  --cluster-name eyeflow-kafka \
  --broker-node-group-info BrokerNodeGroupInfo \
  --number-of-broker-nodes 3 \
  --kafka-version 3.4.0

# Output: Kafka bootstrap servers
```

### Step 5: Create ECS Task Definition

Create `ecs-task-definition.json`:

```json
{
  "family": "eyeflow-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "eyeflow-server",
      "image": "your-registry/eyeflow-server:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "hostPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "DATABASE_URL",
          "value": "postgresql://user:pass@eyeflow-prod.abc.us-east-1.rds.amazonaws.com:5432/eyeflow"
        },
        {
          "name": "REDIS_URL",
          "value": "redis://eyeflow-redis.abc.ng.0001.use1.cache.amazonaws.com:6379"
        },
        {
          "name": "KAFKA_BROKERS",
          "value": "broker1:9092,broker2:9092,broker3:9092"
        }
      ],
      "secrets": [
        {
          "name": "API_KEY",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:eyeflow/api-key"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/eyeflow-api",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "prod"
        }
      }
    }
  ]
}
```

### Step 6: Create ECS Service

```bash
aws ecs create-service \
  --cluster eyeflow-prod \
  --service-name eyeflow-api \
  --task-definition eyeflow-api:1 \
  --desired-count 3 \
  --launch-type FARGATE \
  --network-configuration \
    "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy,subnet-zzz],securityGroups=[sg-abc123],assignPublicIp=DISABLED}" \
  --load-balancers \
    "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=eyeflow-server,containerPort=3000" \
  --auto-scaling \
    --minimum=3 \
    --maximum=10 \
    --target-cpu-utilization=70
```

---

## Docker Deployment

### Multi-stage Build

Create `Dockerfile`:

```dockerfile
# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Runtime
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY src/ ./src/
COPY package.json ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/main.js"]
```

### Build & Push

```bash
# Build image
docker build -t my-registry/eyeflow:v1.0.0 .

# Push to registry
docker push my-registry/eyeflow:v1.0.0

# Or use AWS ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com
docker tag eyeflow:v1.0.0 123456789.dkr.ecr.us-east-1.amazonaws.com/eyeflow:v1.0.0
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/eyeflow:v1.0.0
```

---

## Kubernetes Deployment

### Helm Chart

Create `helm/values.yaml`:

```yaml
image:
  repository: my-registry/eyeflow
  tag: v1.0.0

replicas: 3

resources:
  requests:
    memory: "512Mi"
    cpu: "250m"
  limits:
    memory: "1Gi"
    cpu: "1000m"

postgresql:
  enabled: true
  auth:
    password: secure_password_123

redis:
  enabled: true
  replica:
    replicaCount: 3

kafka:
  enabled: true
  brokers: 3
```

### Deploy to Kubernetes

```bash
# Add Helm repo
helm repo add eyeflow https://charts.eyeflow.io
helm repo update

# Install
helm install eyeflow eyeflow/eyeflow \
  --namespace eyeflow \
  --create-namespace \
  -f values.yaml

# Verify
kubectl get pods -n eyeflow
kubectl logs -n eyeflow -f deployment/eyeflow-api
```

---

## Environment Configuration

### Production Secrets

Store in AWS Secrets Manager or HashiCorp Vault:

```bash
# PostgreSQL
DATABASE_URL=postgresql://user:pass@host:5432/eyeflow
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=20

# Redis
REDIS_URL=redis://host:6379/0
REDIS_PASSWORD=secure_password

# Kafka
KAFKA_BROKERS=broker1:9092,broker2:9092,broker3:9092
KAFKA_USERNAME=eyeflow
KAFKA_PASSWORD=secure_password

# API Keys
JWT_SECRET=very_long_random_string_here
API_KEY=sk_live_abc123xyz789

# Monitoring
DATADOG_API_KEY=dd_api_key_here
SENTRY_DSN=https://...@sentry.io/123456

# Feature Flags
LOG_LEVEL=info
ENABLE_AUDIT_LOGGING=true
ENABLE_METRICS=true
```

### Connection Pooling

```
# PostgreSQL
DATABASE_POOL_MIN: 5
DATABASE_POOL_MAX: 20
CONNECTION_TIMEOUT: 30000

# Redis
REDIS_POOL_SIZE: 10

# Kafka
KAFKA_CONNECTIONS: 3
```

---

## Monitoring & Health

### Health Checks

```bash
# Liveness probe (is service running?)
GET /health/live
Response: { "status": "alive" }

# Readiness probe (can accept traffic?)
GET /health/ready
Response: { "status": "ready", "services": {...} }

# Detailed status
GET /health/status
Response: {
  "api": "healthy",
  "database": "healthy",
  "redis": "healthy",
  "kafka": "healthy"
}
```

### Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
```

### Metrics Collection

```bash
# Prometheus endpoint
GET /metrics
Returns Prometheus-formatted metrics:
  eyeflow_tasks_executed_total{status="success"} 12847
  eyeflow_execution_duration_ms{quantile="0.99"} 120
  eyeflow_active_tasks 35
```

---

## Database Migrations

```bash
# Run migrations on startup
npm run migrate

# Or with npx
npx typeorm migration:run

# Rollback if needed
npx typeorm migration:revert
```

---

## Backup & Recovery

### Automated Backups

```bash
# RDS: Automatic daily backups
BACKUP_RETENTION_DAYS: 30

# S3: Export database weekly
aws rds start-export-task \
  --export-task-identifier eyeflow-backup-$(date +%Y%m%d) \
  --source-arn arn:aws:rds:us-east-1:123456789:db:eyeflow-prod \
  --s3-bucket-name eyeflow-backups \
  --iam-role-arn arn:aws:iam::123456789:role/rds-export-role
```

### Point-in-Time Recovery

```bash
# Restore database to specific point in time
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier eyeflow-prod \
  --target-db-instance-identifier eyeflow-prod-restored \
  --restore-time 2024-10-02T14:00:00Z
```

---

## Monitoring Dashboard

### Datadog Integration

```yaml
# datadog-agent-config.yaml
dd_api_key: ${DATADOG_API_KEY}

logs:
  - type: docker
    service: eyeflow-api

apm:
  enabled: true
  port: 8126
```

### Key Metrics to Monitor

- **Execution latency** (p50, p99)
- **Success rate** (%)
- **Active tasks** (count)
- **Database connections** (used vs pool size)
- **Redis memory** (used vs available)
- **Kafka lag** (consumer group lag)

---

## Scaling

### Horizontal Scaling

```
3 instances → Can handle: 10K tasks/day
6 instances → Can handle: 20K tasks/day
10 instances → Can handle: 33K tasks/day

Linear scaling across CPU cores
```

### Auto-scaling Policy

```
Target metrics:
- CPU > 70% → Scale up
- CPU < 30% for 5 min → Scale down
- Min: 3 instances
- Max: 10 instances
```

---

## Troubleshooting

### "Database Connection Failed"

```
Check:
1. RDS security group allows inbound: 5432
2. Database is in AVAILABLE state
3. Credentials are correct
4. Connection string format is correct
```

### "Out of Memory"

```
Solution:
1. Increase container memory limit
2. Check for memory leaks: 
   - Monitor memory over time
   - Check Redis is not growing unbounded
3. Enable debug logging to find leaks
```

### "Task Executions Slow"

```
Check:
1. CPU utilization (scale up if >80%)
2. Database connection pool not exhausted
3. Kafka lag (check broker health)
4. Network latency to external services
```

---

## Security Checklist

- [ ] Use HTTPS/TLS for all communications
- [ ] Enable encryption at rest (EBS, RDS)
- [ ] Restrict security group ingress
- [ ] Rotate API keys monthly
- [ ] Enable audit logging
- [ ] Use VPC for database (not public)
- [ ] Enable MFA for AWS console
- [ ] Backup tested and verified
- [ ] Disaster recovery plan documented
- [ ] Penetration testing completed

---

## Next Steps

- [Architecture Deep Dive](./architecture.md)
- [API Reference](./api-reference.md)
- [Monitoring & Observability](../for-decision-makers/scaling-performance.md)

---

**Ready for production?** Follow this guide for reliable, scalable deployment. 🚀
