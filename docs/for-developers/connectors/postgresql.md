---
sidebar_position: 6
title: PostgreSQL Connector
description: Connect to PostgreSQL databases
---

# PostgreSQL Connector

Query, insert, and manage data in PostgreSQL databases.

## Features

- Run SELECT queries
- INSERT/UPDATE/DELETE operations
- Transactions
- Prepared statements
- Connection pooling
- SSL/TLS encryption

## Setup

### Step 1: Get Database Connection Info

You'll need:
- **Host:** `db.example.com` or `localhost`
- **Port:** Usually `5432`
- **Database:** `my_database`
- **Username:** `postgres` or `app_user`
- **Password:** Your database password

### Step 2: Create Database User (Recommended)

Instead of using `postgres` superuser, create a dedicated user:

```sql
-- Connect as postgres superuser first
psql -U postgres -h localhost

-- Create new user
CREATE USER eyeflow_user WITH PASSWORD 'secure_password_123';

-- Grant permissions to specific database
GRANT CONNECT ON DATABASE my_database TO eyeflow_user;
GRANT USAGE ON SCHEMA public TO eyeflow_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO eyeflow_user;
```

### Step 3: Connect in EyeFlow

1. Dashboard → **Settings → Connectors**
2. Click **+ Connect Service → PostgreSQL**
3. Fill in details:
   ```
   Name: postgres_main
   Host: db.example.com
   Port: 5432
   Database: my_database
   Username: eyeflow_user
   Password: [your password]
   SSL Mode: require (recommended)
   ```
4. Click **Test Connection** → Should show ✅
5. Click **Save**

---

## Usage Examples

### Simple SELECT Query

```
Task: get_users

Action: Query Database
Connector: postgres_main
Query:
  SELECT id, name, email FROM users LIMIT 10
```

Result:
```json
[
  { "id": 1, "name": "Alice", "email": "alice@example.com" },
  { "id": 2, "name": "Bob", "email": "bob@example.com" }
]
```

### Query with Parameters

```
Task: find_user_by_id

Action: Query Database
Connector: postgres_main

Query:
  SELECT * FROM users WHERE id = $1 AND status = $2

Parameters:
  [$user_id, 'active']
```

This prevents SQL injection! ✅

### INSERT Operation

```
Task: create_order

Action: Execute Query
Connector: postgres_main

Query:
  INSERT INTO orders (user_id, total, status)
  VALUES ($1, $2, $3)
  RETURNING id, created_at

Parameters:
  [$user_id, $order_total, 'pending']
```

Result:
```json
{
  "id": 12345,
  "created_at": "2024-10-02T14:34:12Z"
}
```

### UPDATE with Conditions

```
Query:
  UPDATE users 
  SET status = $1, updated_at = NOW()
  WHERE id = $2

Parameters:
  ['active', $user_id]
```

### Transaction

```
Task: transfer_funds

Actions:
1. BEGIN TRANSACTION
2. Deduct from account A
3. Add to account B
4. COMMIT (or ROLLBACK on error)
```

```sql
BEGIN;

UPDATE accounts 
SET balance = balance - $1 
WHERE id = $2;

UPDATE accounts 
SET balance = balance + $1 
WHERE id = $3;

COMMIT;
```

---

## Real-World Scenarios

### Scenario 1: Generate Daily Report

```
Task: daily_report

Trigger: Schedule (6:00 AM daily)

Actions:
1. Query: Get yesterday's sales
   SELECT SUM(amount) as total_sales FROM orders 
   WHERE DATE(created_at) = CURRENT_DATE - 1
   
2. Query: Get top products
   SELECT product_id, COUNT(*) as quantity
   FROM order_items
   WHERE DATE(created_at) = CURRENT_DATE - 1
   GROUP BY product_id
   ORDER BY quantity DESC
   LIMIT 10
   
3. Format results
4. Send email to management

Result: Automated daily business metrics ✅
```

### Scenario 2: Sync Data Between Systems

```
Task: sync_customers

Trigger: Webhook (from CRM)

Actions:
1. Receive customer data from CRM
2. Check if exists: SELECT * FROM customers WHERE crm_id = $1
3. IF exists:
   - UPDATE customer record
4. ELSE:
   - INSERT new customer
5. Notify CRM: sync successful

Result: Two-way data sync ✅
```

### Scenario 3: Archive Old Records

```
Task: archive_old_orders

Trigger: Schedule (monthly, 1st day)

Actions:
1. Query old orders:
   SELECT * FROM orders 
   WHERE created_at < NOW() - INTERVAL '1 year'
   
2. Copy to archive table:
   INSERT INTO orders_archive 
   SELECT * FROM orders 
   WHERE created_at < NOW() - INTERVAL '1 year'
   
3. Delete from main table:
   DELETE FROM orders 
   WHERE created_at < NOW() - INTERVAL '1 year'
   
4. Backup archive
5. Notify ops team

Result: Automated data archival ✅
```

### Scenario 4: Real-Time Analytics Update

```
Task: update_metrics

Trigger: Kafka message (real-time)

Actions:
1. Parse incoming metrics
2. INSERT INTO metrics_log VALUES (...)
3. UPDATE metrics_summary:
   UPDATE metrics_summary 
   SET 
     total_requests = total_requests + 1,
     avg_latency = AVERAGE(latencies),
     last_updated = NOW()
   WHERE metric_name = $1
4. IF avg_latency > threshold:
   - Alert DevOps team

Result: Real-time dashboard updates ✅
```

---

## Advanced Queries

### Aggregate Functions

```sql
-- Count, sum, average
SELECT 
  COUNT(*) as total_orders,
  SUM(amount) as total_revenue,
  AVG(amount) as avg_order_value
FROM orders
WHERE created_at > NOW() - INTERVAL '30 days'
```

### GROUP BY & HAVING

```sql
-- Sales by region, filtering groups
SELECT 
  region,
  COUNT(*) as order_count,
  SUM(amount) as total_revenue
FROM orders
GROUP BY region
HAVING SUM(amount) > 10000
ORDER BY total_revenue DESC
```

### JOINs

```sql
-- Combine data from multiple tables
SELECT 
  o.id,
  u.name,
  u.email,
  o.amount,
  p.name as product
FROM orders o
JOIN users u ON o.user_id = u.id
JOIN products p ON o.product_id = p.id
WHERE o.status = 'completed'
```

### Window Functions

```sql
-- Rank, running totals, LAG
SELECT 
  name,
  salary,
  RANK() OVER (ORDER BY salary DESC) as rank,
  LAG(salary) OVER (ORDER BY salary DESC) as prev_salary
FROM employees
```

### Common Table Expressions (CTEs)

```sql
-- WITH clause for readable queries
WITH recent_orders AS (
  SELECT * FROM orders 
  WHERE created_at > NOW() - INTERVAL '7 days'
)
SELECT u.name, COUNT(*) as order_count
FROM recent_orders ro
JOIN users u ON ro.user_id = u.id
GROUP BY u.id, u.name
```

---

## Performance Tips

### Use Indexes

```sql
-- Speed up common WHERE conditions
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_orders_created ON orders(created_at);

-- Check if index helps
EXPLAIN ANALYZE SELECT * FROM users WHERE email = $1;
```

### Batch Operations

Instead of:
```sql
INSERT INTO logs VALUES (...);  -- Slow: 1000 queries
INSERT INTO logs VALUES (...);
... (1000 times)
```

Do this:
```sql
INSERT INTO logs VALUES 
  (...),
  (...),
  (...),  -- Fast: 1 query
  ... (all 1000 rows);
```

### Connection Pooling

EyeFlow automatically pools connections:
```
Connection 1: REUSED for Task A
Connection 2: REUSED for Task B
Connection 3: REUSED for Task C

Result: 10-30% faster than new connection per query
```

### Pagination

```sql
-- For large result sets
SELECT * FROM orders 
LIMIT 100 
OFFSET 0;

SELECT * FROM orders 
LIMIT 100 
OFFSET 100;  -- Next page
```

---

## Troubleshooting

### "Connection Refused"

```
Error: connect ECONNREFUSED 127.0.0.1:5432

Solutions:
1. Is PostgreSQL running?
   pg_isready -h localhost -p 5432
   
2. Are credentials correct?
   psql -U username -h host -d dbname
   
3. Is firewall blocking?
   Check security groups, network ACLs
```

### "Password Authentication Failed"

```
Error: password authentication failed

Solutions:
1. Verify password is correct
2. Check password doesn't have special chars
3. If password has $, \, or ', escape in EyeFlow
4. Reset password in PostgreSQL:
   ALTER USER username WITH PASSWORD 'newpass';
```

### "SSL Connection Error"

```
Error: SSL Error

Solutions:
1. Set SSL Mode:
   - "disable" (development only)
   - "require" (recommended)
   - "verify-full" (strict)
   
2. Download SSL certificate:
   - RDS: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html
```

### "Query Timeout"

```
Error: Query exceeded timeout

Solutions:
1. Add LIMIT clause
2. Optimize query (use indexes)
3. Increase timeout (default 30s)
4. Break into smaller queries
5. Archive old data
```

### "Too Many Connections"

```
Error: FATAL: too many connections

Solutions:
1. Increase max connections:
   ALTER SYSTEM SET max_connections = 500;
   
2. Use connection pooling (EyeFlow does this)
3. Check long-running queries:
   SELECT * FROM pg_stat_activity;
```

---

## Security Best Practices

✅ **Do:**
- Use connection encryption (SSL/TLS)
- Create dedicated user (not superuser)
- Grant minimal permissions needed
- Use prepared statements (prevents SQL injection)
- Rotate passwords regularly
- Keep PostgreSQL updated

❌ **Don't:**
- Use `postgres` superuser in credentials
- Store passwords in Git
- Use unencrypted connections
- Grant public access
- Use dynamic SQL concatenation

---

## Monitoring

```sql
-- Check slow queries
SELECT query, calls, total_time 
FROM pg_stat_statements 
ORDER BY total_time DESC 
LIMIT 10;

-- Check active connections
SELECT * FROM pg_stat_activity;

-- Check database size
SELECT pg_database.datname, 
  pg_size_pretty(pg_database_size(pg_database.datname)) 
FROM pg_database;
```

---

## Next Steps

- [Explore other connectors](./overview.md)
- [Create custom connector](./custom.md)
- [API Reference](../api-reference.md)

---

**PostgreSQL is the most popular database for EyeFlow tasks.** ⚡
