---
sidebar_position: 7
title: Security Sandbox
description: Closed-world security model and threat mitigation
---

# Security Sandbox

EyeFlow's multi-layer security sandbox prevents unauthorized access and data breaches.

## Threat Model

### Identified Threats

1. **Malicious Task Code**: Task definition tries to access restricted resources
2. **Service Injection**: Task tries to call non-existent services
3. **Data Exfiltration**: Task tries to leak sensitive data
4. **Resource Exhaustion**: Task tries to consume unlimited resources
5. **Privilege Escalation**: Task tries to gain elevated permissions
6. **Side-Channel Attacks**: Task tries to exploit timing to extract secrets

---

## Security Layers

### Layer 1: Task Validation

```
Input: Task definition (JSON/YAML)
Checks:
  1. Syntax validation (well-formed JSON/YAML)
  2. Schema validation (required fields present)
  3. Service check (all services in catalog)
  4. Input check (all inputs defined)
  5. Output check (no undefined outputs)

If any check fails:
  → Task rejected before compilation
  → Error returned to user
  → No code execution attempted
```

### Layer 2: Compilation

```
Compilation checks:
  1. Type checking (all types consistent)
  2. Service verification (all services exist)
  3. Capability verification (all capabilities exist)
  4. Input validation (I/O types match)
  5. Bounds checking (loops/recursion bounded)

If any check fails:
  → Bytecode rejected
  → Error returned to user
  → No code execution attempted
```

### Layer 3: Sandboxing

```
Bytecode execution in sandbox:
  1. Resource limits enforced
  2. File system access denied
  3. Network access restricted
  4. System calls blocked
  5. Privilege escalation blocked

Allowed only:
  - Register operations
  - Service connector calls (pre-approved)
  - Memory operations (bounded)
```

### Layer 4: Connector Isolation

```
Each service connector:
  1. Runs as separate process (if possible)
  2. Only has credentials for that service
  3. Rate-limited (per service)
  4. Monitored for anomalies
  5. Killable if misbehaving

Example:
  Slack connector:
    - Environment: SLACK_BOT_TOKEN only
    - Can do: Send Slack messages
    - Cannot do: Access database, file system, other services
```

### Layer 5: Audit Logging

```
Every action logged:
  - Task execution (what ran)
  - Service calls (which services called)
  - Data access (what data was accessed)
  - Errors (what failed)
  - Results (what was produced)

Retention: 90 days (encrypted storage)
Access: Authorized users only (with audit trail)
```

---

## Specific Threat Mitigations

### Threat 1: Malicious Task Code

**Attack**: Write task that tries to read /etc/passwd

```json
{
  "name": "malicious_task",
  "actions": [
    {
      "type": "read_file",
      "path": "/etc/passwd"
    }
  ]
}
```

**Mitigation**:
1. **Catalog check**: read_file not in catalog
   - Compilation error: "Service 'file_system' not available"
   - Task rejected

2. **Impossible to bypass**:
   - No way to invoke services not in catalog
   - LLM cannot import arbitrary libraries
   - Bytecode cannot execute OS calls directly

**Result**: Attack blocked before execution ✓

---

### Threat 2: Service Injection

**Attack**: Try to call fake service

```
Task: "Call service database.steal_all_data"
```

**Mitigation**:
1. **Catalog check**: steal_all_data not in database.* capabilities
   - Compilation error: "Capability 'steal_all_data' not found"

2. **Runtime check**: Even if bytecode was manually crafted
   - SVM validates all service calls before execution
   - Unknown service → Execution error
   - No fallback to system calls

**Result**: Attack blocked ✓

---

### Threat 3: Data Exfiltration (Logging)

**Attack**: Task logs sensitive data to public endpoint

```
Task: "Fetch password from database then POST to attacker.com"
```

**Mitigations**:
1. **Service isolation**: 
   - Task can POST to pre-configured endpoints only
   - Cannot add new endpoints at runtime

2. **Audit logging**:
   - All POST calls logged with destination
   - Suspicious patterns detected:
     - Multiple requests to unknown IPs
     - Unusual data volumes
     - Off-hours activity

3. **Rate limiting**:
   - Max 100 requests per task
   - Max 1MB data per task
   - Exceeding limits → Task terminated

4. **Data classification**:
   - Sensitive fields labeled in schema
   - Task cannot SELECT sensitive fields without approval
   - Audit alert if sensitive field accessed

**Result**: Attack detected and prevented ✓

---

### Threat 4: Resource Exhaustion

**Attack**: Create infinite loop to exhaust CPU

```
Bytecode (manually crafted):
  FOR_EACH i 0 999999999 (9.99B iterations)
    COMPUTE something
```

**Mitigations**:
1. **Compile-time check**:
   - Loop bounds checked: 999999999 > limit (1M)
   - Bytecode rejected: "Loop exceeds bounds"

2. **Runtime check** (if somehow accepted):
   - Timeout enforced: 5 minutes max
   - Memory limit: 100MB max
   - CPU throttling: Can be enabled per task

3. **Monitoring**:
   - Task resource usage monitored
   - Unusual patterns detected (e.g., 90% CPU for 5min)
   - Alert sent to admin

**Result**: Attack blocked before execution ✓

---

### Threat 5: Privilege Escalation

**Attack**: Try to run code as root or escalate privileges

```
Bytecode (manually crafted):
  SYSCALL exec sudo
```

**Mitigations**:
1. **No system calls available**: SVM doesn't support SYSCALL instruction
2. **No sudo**: Task runs as unprivileged user (eyeflow-sandbox)
3. **No file write**: Cannot write to system directories
4. **No process spawning**: Cannot spawn child processes

**Result**: Attack impossible by design ✓

---

### Threat 6: Side-Channel Attacks (Timing)

**Attack**: Measure execution time to infer secret values

```
Task: "Check if API_KEY starts with 'A' by timing execution"
  - If API starts with 'A': StringComparison takes 5μs
  - If not: Short-circuits in 1μs
  - Attacker infers secret from timing
```

**Mitigations**:
1. **Constant-time operations**: All comparisons use constant-time algorithms
   - String comparison: Always same time (timing-safe)
   - Number comparison: Always same time (timing-safe)

2. **Execution time variability**: Inherent network variance (50-100ms)
   - Timing variation >> side-channel signal
   - No meaningful information leakable

3. **Access control**: 
   - API keys stored in secret management system
   - Task cannot directly access API keys
   - Only service connectors have credentials

**Result**: Attack ineffective ✓

---

## Permission Model

### Permission Levels

**Level 0: No Access (Default)**
```
Task cannot:
  - Call this service
  - Access this data
  - Perform this operation
```

**Level 1: Limited Access**
```
Task can:
  - Call service with rate limiting (e.g., 10/min)
  - Read public data only
  - Cannot write/delete
```

**Level 2: Standard Access**
```
Task can:
  - Call service normally
  - Read/write data
  - Subject to audit logging
```

**Level 3: Elevated Access**
```
Task can:
  - Call service without rate limiting
  - Access sensitive data
  - Requires admin approval
  - Detailed audit logging
```

### Permission Configuration

```json
{
  "permissions": {
    "slack": "level2",
    "postgresql": {
      "read": "level2",
      "write": "level1",
      "delete": "level0"
    },
    "stripe": {
      "read_transactions": "level2",
      "create_charge": "level3",
      "refund": "level0"
    },
    "openai": "level0"
  }
}
```

### Runtime Permission Check

```
Task tries: CALL_SERVICE stripe.create_charge
Checks:
  1. Service stripe: Exists? Yes
  2. Capability create_charge: Exists? Yes
  3. Task authorized? Check permission: level3
  4. User authenticated? Yes
  5. User has level3 permission? Check...
     - If yes: Allow
     - If no: Deny + Log + Alert
  6. Rate limit check: (this hour) 5/5 used?
     - If no: Allow + Increment counter
     - If yes: Deny + Log + Alert

Result: Allow or Deny with detailed reason
```

---

## Data Isolation

### Policy: Minimum Privilege

Each task gets only what it needs:

```
Task: "Process customer orders"
Permissions:
  ✓ Read: orders table
  ✓ Write: order_processed table
  ✗ Read: passwords table
  ✗ Read: credit_cards table
  ✗ Read: customer_emails table

Attempted access:
  - Task tries: SELECT * FROM passwords
  - Result: Permission denied + Logged + Alert

Attack prevented: No data exfiltration possible
```

### Credential Segregation

```
Each service has separate credentials:
  - Slack bot token: Only used by Slack connector
  - Database password: Only used by Database connector
  - Stripe API key: Only used by Stripe connector

If one credential is leaked:
  - Only one service compromised
  - Others remain secure
  - Attacker can't access multiple services
  - Lateral movement prevented
```

### Data Encryption

```
Storage:
  - Task definitions: AES-256 encrypted at rest
  - Results: Encrypted if sensitive
  - Credentials: Encrypted in vault

Transport:
  - All connections: TLS 1.3 minimum
  - Certificate pinning: Enabled
  - Perfect forward secrecy: Enabled
```

---

## Anomaly Detection

### Behavioral Patterns Monitored

```
Per-task:
  - Request rate (requests/minute)
  - Data volume (bytes transferred)
  - Service calls (which services, how many)
  - Error patterns (failures, retries)
  - Execution duration (latency)

Per-user:
  - Task creation rate
  - Service permissions requested
  - Data accessed
  - Execution patterns
```

### Anomaly Example

**Normal Pattern**:
```
Order processing task (8 AM - 5 PM, weekdays):
  - Slack: 10 calls/minute
  - Database: 5 queries/minute
  - Stripe: 2 charges/minute
  - Data: 1MB/hour
  - Duration: 50ms ± 10ms
```

**Detected Anomaly**:
```
Same task at 3 AM, Saturday:
  - Slack: 1000 calls/minute [ANOMALY]
  - Database: 500 queries/minute [ANOMALY]
  - Stripe: 50 charges/minute [ANOMALY]
  - Data: 1GB/hour [ANOMALY]
  - Duration: 5s + [ANOMALY]

Action: Task paused + Alert admin + Log incident
```

---

## Secure Output

### Output Filtering

Sensitive data removed from outputs:

```json
{
  "task_output": {
    "customer_id": "123",
    "customer_name": "John",
    "customer_email": "[REDACTED]",
    "card_last4": "****",
    "api_response": "[TRUNCATED]"
  }
}
```

### Output Audit

```
All outputs logged:
  - What: Task output
  - Who: Which user/service called task
  - When: Timestamp
  - Why: Task purpose
  - How much: Data volume
  
Retention: 90 days
Query: Authorized users only
```

---

## Compliance

### Standards Supported

- **GDPR**: Privacy-by-design, data minimization
- **HIPAA**: Encryption, audit logs, access controls
- **PCI-DSS**: Secure credential handling
- **SOC 2**: Security controls, availability, confidentiality
- **ISO 27001**: Information security management

### Audit Capabilities

```bash
# Generate audit report
eyeflow-cli audit-report \
  --start 2024-01-01 \
  --end 2024-01-31 \
  --service slack,postgresql \
  --user admin

Output: Compliance audit report (PDF)
  - All services called
  - All data accessed
  - All users involved
  - All security events
  - Regulatory framework: SOC 2, GDPR, etc.
```

---

## Testing & Verification

### Security Testing

**Automated tests** (weekly):
1. Injection attack tests (100+ patterns)
2. Privilege escalation tests
3. Resource exhaustion tests
4. Data exfiltration tests
5. Side-channel tests

**Manual reviews** (quarterly):
1. Code review (security focus)
2. Penetration testing
3. Vulnerability assessment
4. Architecture review

Results: Published at https://security.eyeflow.sh

---

## Roadmap: Security v3.0

- **Hardware-backed attestation**: Prove code hasn't been modified
- **Confidential computing**: Intel SGX enclave support
- **Zero-knowledge proofs**: Prove security properties without revealing details
- **Continuous security monitoring**: Real-time threat detection
