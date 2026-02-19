---
sidebar_position: 1
title: Semantic Compilation
description: How EyeFlow compiles natural language tasks to bytecode
---

# Semantic Compilation

The compilation pipeline transforms natural language task descriptions into deterministic bytecode.

## Compilation Architecture

### Five-Layer Compilation Stack

```
Layer 1: Catalog
         ↓ (Service registry, capabilities)
         
Layer 2: Frontend
         ↓ (Parse natural language)
         
Layer 3: Optimizer
         ↓ (Simplify & optimize graph)
         
Layer 4: IR Generator
         ↓ (Generate intermediate representation)
         
Layer 5: SVM
         ↓ (Execute bytecode)
         
Result: Deterministic output
```

---

## Layer 1: Capability Catalog

The catalog defines all available services and their capabilities.

### Catalog Structure

```json
{
  "services": [
    {
      "id": "slack",
      "name": "Slack",
      "capabilities": [
        {
          "name": "send_message",
          "inputs": ["channel", "text"],
          "outputs": ["message_id", "timestamp"],
          "description": "Send message to Slack channel"
        },
        {
          "name": "create_thread",
          "inputs": ["channel", "text", "parent_id"],
          "outputs": ["thread_id"],
          "description": "Create threaded reply"
        }
      ]
    }
  ]
}
```

**Purpose**: Define semantic boundaries for LLM compilation

**Constraints**:
- Only services in catalog can be used
- Only documented inputs/outputs allowed
- Prevents hallucinations (LLM can't invent capabilities)

---

## Layer 2: Frontend Parser

Parses natural language into an abstract syntax tree (AST).

### Example Compilation

**Natural Language**:
```
"Fetch weather from OpenWeather API using city parameter.
If temperature > 30, send Slack alert to #weather.
If temperature <= 30, log to database."
```

**Parsed AST**:
```
Task {
  steps: [
    {
      action: "fetch",
      service: "openweather",
      params: { city: "${input.city}" }
    },
    {
      condition: "temperature > 30",
      then: {
        action: "send_message",
        service: "slack",
        params: { channel: "#weather", text: "High temp alert" }
      },
      else: {
        action: "log_db",
        service: "postgresql",
        params: { message: "Normal temp", value: "${fetch.temperature}" }
      }
    }
  ]
}
```

### Parser Components

**Tokenizer**: Split text into semantic units
- Natural language → tokens
- "Fetch weather" → [ACTION: fetch, OBJECT: weather]

**AST Builder**: Construct syntax tree
- Tokens → tree structure
- Validate against schema

**Variable Extractor**: Identify data flows
- ${input.city} → Input parameter
- ${fetch.temperature} → Output from step 1

---

## Layer 3: Optimizer

Simplifies and optimizes the AST before code generation.

### Optimization Passes

**Pass 1: Dead Code Elimination**
```
Before:
  Step 1: Fetch weather (unused)
  Step 2: Log to database
  
After:
  Step 1: Log to database (simplified)
```

**Pass 2: Loop Unrolling** (for known iterations)
```
Before:
  For each city in ["NYC", "LA", "SF"]:
    Fetch weather
    
After:
  Fetch weather (NYC)
  Fetch weather (LA)
  Fetch weather (SF)
```

**Pass 3: Constant Folding**
```
Before:
  temp = 32
  celsius = (temp - 32) * 5/9
  
After:
  celsius = 0
```

**Pass 4: Dependency Analysis**
```
Step 3 requires output of Step 2
Step 4 requires output of Step 2
→ Step 3 and Step 4 can run in parallel
```

### Result: Optimized DAG

Directed Acyclic Graph showing:
- Execution order (dependencies)
- Parallelizable steps
- Data flow
- Error handling paths

---

## Layer 4: IR Generator

Converts optimized AST to Intermediate Representation.

### IR Format

```
; Fetch from OpenWeather API
0: LOAD_INPUT "city"
1: CALL_SERVICE slack.send_message @channel="#weather" @text="Fetching..."
2: HTTP_GET "https://api.openweathermap.org/data/2.5/weather?q=%s" [0]
3: EXTRACT_JSON [2] "main.temp" -> $temp
4: COMPARE $temp ">" 30
5: IF_FALSE 8    ; Jump to else branch
6: CALL_SERVICE slack.send_message @channel="#weather" @text="High temp!"
7: JUMP 10       ; Skip else
8: CALL_SERVICE postgresql.log @message="Normal temp" @value=$temp
9: END
```

### IR Instructions

| Instruction | Purpose | Example |
|-------------|---------|---------|
| LOAD_INPUT | Load input parameter | LOAD_INPUT "city" |
| LOAD_CONST | Load constant | LOAD_CONST 30 |
| HTTP_GET | HTTP GET request | HTTP_GET "url" [params] |
| HTTP_POST | HTTP POST request | HTTP_POST "url" [body] |
| CALL_SERVICE | Call connector | CALL_SERVICE slack.send_message |
| EXTRACT_JSON | Parse JSON | EXTRACT_JSON [response] "path" -> $var |
| EXTRACT_XML | Parse XML | EXTRACT_XML [response] "xpath" -> $var |
| COMPARE | Boolean comparison | COMPARE $a ">" $b |
| IF_TRUE/IF_FALSE | Conditional jump | IF_FALSE 8 |
| JUMP | Unconditional jump | JUMP 10 |
| FOR_EACH | Loop | FOR_EACH $item in [list] |
| PARALLEL_START | Begin parallel | PARALLEL_START 3 |
| PARALLEL_JOIN | Sync parallel | PARALLEL_JOIN |
| STORE_OUTPUT | Store result | STORE_OUTPUT "temp" $value |
| END | Termination | END |

---

## Layer 5: SVM Execution

The Semantic Virtual Machine executes IR bytecode deterministically.

### Execution Model

**Instruction Pointer (IP)**: Points to current instruction
**Stack**: Local variables, inputs, outputs
**Registers**: $0, $1, ... (temporary values)

### Determinism Guarantees

**Deterministic if**:
1. All inputs are defined (no random functions)
2. All API calls return consistent results
3. All operations are pure (no side effects except service calls)
4. All conditionals are evaluable (no randomness in conditions)

**Example**:
```
Input: city = "NYC"
Step 1: Fetch weather (always same result for same city+time)
Step 2: Extract temperature (pure function of response)
Step 3: Compare (1 > 30? always evaluates same)
Output: "High temp alert" (deterministic)
```

**Non-deterministic if**:
```
Step 1: Generate random number
Step 2: Compare to threshold
→ Different branch each execution = non-deterministic
```

---

## Compilation Example: End-to-End

### Task Definition

**Natural Language**:
```
"Process order for customer.
1. Validate email format
2. If email valid, fetch customer from database
3. If customer exists, create order in database
4. Send confirmation to Slack
5. If customer doesn't exist, send error to Slack"
```

### Step 1: Frontend Parse

```
AST {
  steps: [
    { action: validate_email, param: ${input.email} },
    { condition: is_valid, then: fetch_customer, params: ${input.customer_id} },
    { condition: customer_exists, then: create_order, params: ${input.order_data} },
    { action: send_slack, params: success_message }
  ]
}
```

### Step 2: Optimize

```
DAG {
  validate_email(${input.email}) -> is_valid
    ├─[true]→ fetch_customer(${input.customer_id}) -> customer
    │         create_order(${input.order_data}) -> order_id
    │         send_slack("success")
    └─[false]→ send_slack("invalid email")
}
```

### Step 3: IR Generation

```
0: LOAD_INPUT "email"
1: CALL_SERVICE validator.check_email [0] -> $valid
2: IF_FALSE 5          ; If not valid, jump to error
3: LOAD_INPUT "customer_id"
4: CALL_SERVICE postgresql.fetch_customer [3] -> $customer
5: IF_JAR 9            ; If no customer, jump to error
6: LOAD_INPUT "order_data"
7: CALL_SERVICE postgresql.create_order [6] $customer -> $order_id
8: CALL_SERVICE slack.send_message @text="Order created"
9: JUMP 11
10: CALL_SERVICE slack.send_message @text="Error"
11: END
```

### Step 4: Execution

Input: `{ email: "user@example.com", customer_id: 123, order_data: {...} }`

```
IP 0: LOAD_INPUT → email = "user@example.com"
IP 1: EMAIL_VALIDATE → valid = true
IP 2: IF_FALSE 5 → condition false, continue
IP 3: LOAD_INPUT → customer_id = 123
IP 4: FETCH_CUSTOMER → customer = {id: 123, name: "Alice", ...}
IP 5: IF_JAR → customer exists, continue
IP 6: LOAD_INPUT → order_data = {...}
IP 7: CREATE_ORDER → order_id = 456
IP 8: SEND_SLACK → message sent
IP 11: END

Result: {
  success: true,
  order_id: 456,
  customer: {id: 123, name: "Alice", ...}
}
```

---

## Correctness Guarantees

### What EyeFlow Guarantees

1. **Type Safety**: All values have defined types
2. **No Undefined Variables**: All $vars initialized before use
3. **Bounded Execution**: All loops bounded, no infinite loops
4. **Resource Bounds**: Memory & time limited
5. **Determinism**: Same input → Same output (always)

### What EyeFlow Does NOT Guarantee

1. **Hallucination Prevention**: LLM during compilation (offline)
   - If task is ambiguous, LLM may guess
   - Solution: Clear, specific task definitions

2. **Perfect Understanding**: Complex natural language
   - If task is unclear, compilation may fail
   - Solution: Use structured task templates

3. **API Reliability**: Depends on external services
   - If API returns error, task fails
   - Solution: Error handling in task definition

---

## Performance Characteristics

### Compilation Time

| Task Complexity | Time | Reason |
|-----------------|------|--------|
| Simple (1-5 steps) | 10-50ms | Fast LLM parsing |
| Medium (5-20 steps) | 50-200ms | Multiple LLM calls |
| Complex (20+ steps) | 200-500ms | Full optimization |

**One-time cost**: Compiled once, executed many times

### Execution Time

| Task Type | Time | Reason |
|-----------|------|--------|
| Data extraction | 45ms | Network + parsing |
| Computation | 5-10ms | Pure function |
| Database query | 20-100ms | Network + query |
| Multiple APIs | 100-200ms | Parallel execution |

**Deterministic**: Same time every execution (no variance)

---

## Limitations & Future Improvements

### Current Limitations

1. **No Runtime Decisions**: Compilation happens offline
   - Can't adapt to runtime data (by design)
   - Solution: Pre-compute decision branches

2. **No True AI Reasoning**: Deterministic, not intelligent
   - Can't reason like AI agents
   - Solution: Use OpenClaw for reasoning-heavy tasks

3. **No Incremental Compilation**: Full recompile on change
   - Solution: Coming in v2.1

### Future Roadmap

- **v2.1**: Incremental compilation (10x faster)
- **v2.2**: Constraint solvers (for optimization)
- **v2.3**: ML-based optimization (learned execution orders)
- **v3.0**: JIT compilation (runtime optimization)

