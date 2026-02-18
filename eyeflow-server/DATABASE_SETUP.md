# Database Setup Guide for eyeflow

## Prerequisites

- PostgreSQL 12+ installed on your system
- psql command-line tool available
- Your PostgreSQL user has superuser privileges or can create databases

---

## Option 1: Quick Setup (Default Credentials)

If you want to use the default credentials in `.env`:

```
DATABASE_USER=eyeflow
DATABASE_PASSWORD=eyeflow
DATABASE_NAME=eyeflow_db
DATABASE_HOST=localhost
DATABASE_PORT=5432
```

### Step 1: Create Database User

```bash
# Connect to PostgreSQL as superuser (usually 'postgres')
psql -U postgres

# Then in psql prompt, run:
CREATE USER eyeflow WITH PASSWORD 'eyeflow123';
ALTER USER eyeflow CREATEDB;
```

### Step 2: Create Database

```bash
# Still in psql prompt:
CREATE DATABASE eyeflow_db OWNER eyeflow;

# Verify
\l  # List all databases
```

### Step 3: Set Permissions

```bash
# In psql prompt:
GRANT ALL PRIVILEGES ON DATABASE eyeflow_db TO eyeflow;
GRANT ALL PRIVILEGES ON SCHEMA public TO eyeflow;
```

### Step 4: Exit psql

```bash
\q
```

---

## Option 2: Using Shell Commands

```bash
# Create user
sudo -u postgres createuser eyeflow -P

# Create database
sudo -u postgres createdb eyeflow_db -O eyeflow

# Verify connection
psql -U eyeflow -h localhost -d eyeflow_db -c "SELECT version();"
```

---

## Option 3: Custom Credentials

If you prefer different credentials, edit `.env`:

```env
DATABASE_USER=your_username
DATABASE_PASSWORD=your_password
DATABASE_NAME=your_database
DATABASE_HOST=localhost
DATABASE_PORT=5432
```

Then create the user and database accordingly:

```bash
# As postgres user
psql -U postgres

# Create with your custom credentials
CREATE USER your_username WITH PASSWORD 'your_password';
ALTER USER your_username CREATEDB;
CREATE DATABASE your_database OWNER your_username;
GRANT ALL PRIVILEGES ON DATABASE your_database TO your_username;
```

---

## Verify Connection

After setup, test the connection:

```bash
# Using the configured credentials
psql -U eyeflow -h localhost -d eyeflow_db -c "SELECT 1;"

# Should return:
# ?column? 
# ----------
#        1
# (1 row)
```

Or from the Node.js application:

```bash
cd eyeflow-server
npm run build
npm start

# Watch for successful database connection message:
# [Nest] xxxxx LOG [InstanceLoader] TypeOrmModule dependencies initialized
```

---

## Database Schema

The application uses TypeORM with `synchronize: true` in development mode, which automatically creates tables on startup:

### Tables Created:

1. **connector** - Stores connector configurations
   - Columns: id, userId, name, type, status, description, auth info, config, timestamps
   - Indexes: userId, type, status, deletedAt (for soft deletes)

2. **llm_config** - Stores LLM configurations
   - Columns: id, userId, provider, model, parameters, health check data, timestamps
   - Indexes: userId, isDefault

### Schema Details:

```sql
-- Connectors table
CREATE TABLE connector (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userId UUID NOT NULL,
  name VARCHAR NOT NULL,
  type VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'CONFIGURED',
  description TEXT,
  encryptedCredentials TEXT NOT NULL,
  config JSONB,
  encrypted BOOLEAN DEFAULT true,
  lastTestedAt TIMESTAMP NULL,
  lastTestSuccessful BOOLEAN,
  lastTestError TEXT,
  testResults JSONB,
  statistics JSONB,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deletedAt TIMESTAMP NULL,
  INDEX idx_userId (userId),
  INDEX idx_type (type),
  INDEX idx_status (status),
  INDEX idx_userId_name (userId, name),
  UNIQUE (userId, name) WHERE deletedAt IS NULL
);

-- LLM Configs table
CREATE TABLE llm_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userId UUID NOT NULL,
  provider VARCHAR NOT NULL,
  model VARCHAR NOT NULL,
  isDefault BOOLEAN DEFAULT false,
  temperature FLOAT DEFAULT 0.7,
  maxTokens INTEGER DEFAULT 2000,
  topP FLOAT DEFAULT 1,
  frequencyPenalty FLOAT DEFAULT 0,
  presencePenalty FLOAT DEFAULT 0,
  localConfig JSONB,
  encryptedApiConfig TEXT,
  lastHealthCheckAt TIMESTAMP NULL,
  lastHealthCheckSuccessful BOOLEAN,
  lastHealthCheckError TEXT,
  statistics JSONB,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deletedAt TIMESTAMP NULL,
  INDEX idx_userId (userId),
  INDEX idx_userId_isDefault (userId, isDefault)
);
```

---

## Connection Pool Settings

The application uses connection pooling with these defaults:

```env
# In TypeORM configuration (can be customized via .env if needed)
DB_CONNECTION_POOL_MIN=2
DB_CONNECTION_POOL_MAX=10
DB_POOL_IDLE_TIMEOUT=30000
DB_STATEMENT_TIMEOUT=30000
```

---

## Backup and Recovery

### Backup Database

```bash
# Full database backup
pg_dump -U eyeflow -h localhost eyeflow_db > eyeflow_backup.sql

# Compressed backup
pg_dump -U eyeflow -h localhost eyeflow_db | gzip > eyeflow_backup.sql.gz
```

### Restore Database

```bash
# From SQL file
psql -U eyeflow -h localhost eyeflow_db < eyeflow_backup.sql

# From compressed backup
gunzip -c eyeflow_backup.sql.gz | psql -U eyeflow -h localhost eyeflow_db
```

---

## Troubleshooting

### Connection refused
```
Error: connect ECONNREFUSED 127.0.0.1:5432

Solution: Ensure PostgreSQL service is running
- On macOS: brew services start postgresql
- On Linux: sudo systemctl start postgresql
- On Windows: Start PostgreSQL service from Services
```

### Authentication failed
```
Error: password authentication failed for user "eyeflow"

Solutions:
1. Verify username and password in .env match database user
2. Check pg_hba.conf authentication method (should be md5 or scram-sha-256)
3. Restart PostgreSQL after user creation
4. Try connecting directly with psql to verify credentials
```

### Database does not exist
```
Error: database "eyeflow_db" does not exist

Solution: Run database creation steps above
```

### Permission denied
```
Error: permission denied for schema public

Solution: Grant permissions:
psql -U postgres
GRANT ALL PRIVILEGES ON SCHEMA public TO eyeflow;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO eyeflow;
EXIT;
```

---

## Connection Monitoring

Monitor active connections:

```bash
# Connect to database and list active connections
psql -U eyeflow -h localhost eyeflow_db

# In psql prompt:
SELECT pid, usename, state FROM pg_stat_activity WHERE datname = 'eyeflow_db';
```

---

## Performance Optimization

### Enable PostgreSQL Query Logging

```bash
# Connect as superuser
psql -U postgres

# Enable slow query logging
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_min_duration_statement = 100;  # 100ms
SELECT pg_reload_conf();

# Check log location
SHOW log_directory;
```

### Create Performance Indexes

```bash
psql -U eyeflow -h localhost eyeflow_db

-- For connector queries
CREATE INDEX idx_connector_userId_deletedAt ON connector(userId) WHERE deletedAt IS NULL;
CREATE INDEX idx_connector_type_status ON connector(type, status);

-- For llm_config queries
CREATE INDEX idx_llm_userId_isDefault ON llm_config(userId, isDefault);
```

---

## Environment Variables Reference

```env
# Database Connection
DATABASE_HOST=localhost         # PostgreSQL server address
DATABASE_PORT=5432            # PostgreSQL port
DATABASE_USER=eyeflow         # Database user
DATABASE_PASSWORD=eyeflow123  # Database password
DATABASE_NAME=eyeflow_db      # Database name

# Encryption
ENCRYPTION_KEY=<32-char-string>  # Used for encrypting credentials

# TypeORM Options
DB_LOGGING=false              # Enable SQL query logging
NODE_ENV=development          # Set to 'production' for production
```

---

## Next Steps

1. Verify database connection: `psql -U eyeflow -h localhost eyeflow_db -c "SELECT 1;"`
2. Start the application: `npm run build && npm start`
3. Check server logs for "TypeOrmModule dependencies initialized" (no errors)
4. Test API endpoints using provided test scripts
5. Monitor database with application running: `npm run db:monitor` (if available)

