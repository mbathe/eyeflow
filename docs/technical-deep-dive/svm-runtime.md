---
sidebar_position: 3
title: SVM Runtime
description: Semantic Virtual Machine execution and correctness
---

# SVM Runtime

The Semantic Virtual Machine executes IR bytecode deterministically and safely.

## Architecture Overview

### SVM Components

```
┌─────────────────────────────────────┐
│  LLM-IR Bytecode (Input)            │
└──────────────┬──────────────────────┘
               │
       ┌───────▼────────┐
       │  Loader        │ (Validate, deserialize)
       └───────┬────────┘
               │
       ┌───────▼────────┐
       │  Type Checker  │ (Verify types)
       └───────┬────────┘
               │
       ┌───────▼────────┐
       │  Execution     │ (Run instructions)
       │  Engine        │
       └───────┬────────┘
               │
       ┌───────▼────────┐
       │  Connector     │ (Call external services)
       │  Runtime       │
       └───────┬────────┘
               │
┌──────────────▼──────────────────────┐
│  Output (Result)                    │
└─────────────────────────────────────┘
```

---

## Execution Model

### Instruction Pointer

```
Current state:
  - IP (Instruction Pointer): Address of current instruction
  - Registers: $0-$65535 (register file)
  - Memory: Call stack, local variables
  - Output: Accumulated results
```

### Execution Cycle

```
Loop:
  1. Fetch instruction at IP
  2. Decode instruction
  3. Execute instruction
  4. Update state (registers, memory)
  5. Increment IP (or jump if control flow)
  6. Loop until RETURN or ERROR
```

### Example Execution Trace

```
Bytecode:
  0: LOAD_INPUT "email" -> $0
  1: CALL_SERVICE "validator.check_email" [$0] -> $1
  2: IF_FALSE $1 -> 5
  3: STORE_OUTPUT "status" "valid"
  4: RETURN
  5: STORE_OUTPUT "status" "invalid"
  6: RETURN

Execution:
  IP=0: LOAD_INPUT "email" -> "user@example.com"
  IP=1: CALL_SERVICE -> $1 = true
  IP=2: IF_FALSE "false" (skip to IP 3)
  IP=3: STORE_OUTPUT "status" -> "valid"
  IP=4: RETURN

Result: { status: "valid" }
```

---

## Memory Management

### Memory Layout

```
┌────────────────────────┐
│ Heap (100MB max)       │  Dynamic allocation
├────────────────────────┤
│ Stack (10MB max)       │  Call frames, locals
├────────────────────────┤
│ Register File          │  $0-$65535
│ (64KB per frame)       │
├────────────────────────┤
│ Constant Pool          │  Strings, URLs, etc.
├────────────────────────┤
│ Bytecode (1MB max)     │  IR instructions
└────────────────────────┘

Total: 111MB per execution
```

### Automatic Garbage Collection

```
Stack frames:
  - Created at function entry
  - Freed at function exit
  - Variables automatically collected

Heap objects:
  - Reference counted
  - Freed when count = 0
  - No manual deallocation needed

Deterministic cleanup: Ensures no memory leaks across executions
```

### Safety Guarantees

1. **No Buffer Overflow**: Bounds checking on all arrays
2. **No Use-After-Free**: Reference counting + type checking
3. **No Memory Leaks**: Automatic cleanup on scope exit
4. **No Uninitialized Variables**: Must be explicitly initialized

---

## Type Checking at Runtime

### Type Verification

```
Before execution:
  1. Load bytecode
  2. Verify instruction types match
  3. Verify variable types are consistent
  4. Verify function signatures match

Example error caught:
  Instruction: EXTRACT_JSON $email "field"
  Type error: $email is string, not object
  Error: Cannot extract JSON from non-object
```

### Type Inference

```
Input: email = "user@example.com" (string from input)
Step 1: HTTP_GET(...) -> HTTP response (object)
Step 2: EXTRACT_JSON(response, "email") -> string
Step 3: CMP "==" email string -> bool

Type trace:
  string → object → string → bool
```

---

## Determinism Engine

### What Makes Execution Deterministic

1. **Pure Functions**: Given same input, always same output
2. **No Random Values**: No Math.random(), no time-based randomness
3. **No Side Effects**: All external calls are tracked
4. **Ordered Execution**: Deterministic order of operations

### Determinism Verification

```
Task execution must satisfy:
  1. Same input → Same output (100%)
  2. Same latency ±10% (within margin)
  3. Same side effects (same APIs called)
  4. No race conditions (single-threaded execution)

Verified by: Runtime assertion framework
Non-determinism detected: Execution fails with error
```

### Example: Deterministic vs Non-Deterministic

**Deterministic**:
```
Input: { city: "NYC", date: "2024-01-01" }
Step 1: Fetch weather (same result for same city+date)
Step 2: Extract temp (pure math)
Step 3: Compare to threshold (pure logic)
Output: { alert: "high temp" } (100% deterministic)
```

**Non-Deterministic**:
```
Input: { city: "NYC" }
Step 1: Fetch weather (different result at different times!)
Step 2: Extract temp
Step 3: Compare to variable threshold
→ Different output at different times = Non-deterministic
```

---

## Execution Limits

### Resource Limits

```
Memory: 100MB per execution
CPU Time: 5 minutes per execution
Instructions: 1,000,000 max per execution
Call Depth: 100 levels max
Loop Iterations: 1,000,000 max per loop

Exceeded limit → Execution terminates with error
```

### Loop Protection

```
Bytecode: FOR_EACH i 0 1000000 start end
Check: 1,000,000 iterations ≤ limit?
Result: Yes, allowed

Bytecode: FOR_EACH i 0 10000000 start end
Check: 10,000,000 iterations > limit?
Result: No, rejected at setup time
Error: Loop exceeds iteration limit
```

### Timeout Protection

```
Execution starts:
  - Timer set to 300 seconds (5 minutes)
  - Each instruction checks elapsed time
  - If time > limit: Stop execution, return error

Example:
  Step 1-10: Complete in 4 minutes
  Step 11: Send request to slow API (estimated: 2 minutes)
  Actual: API timeout after 1 minute
  Total: 5 minutes
  Result: Timeout error
```

---

## Error Handling

### Error Types

```
Compilation Errors:
  - Invalid bytecode
  - Type mismatch
  - Undefined instructions
  → Caught before execution

Runtime Errors:
  - Null pointer dereference
  - Array out of bounds
  - Type assertion failed
  → Caught during execution

External Errors:
  - API call failed
  - Network timeout
  - Database error
  → Caught in connector runtime
```

### Error Recovery

```
Task with error handling:
  CALL_SERVICE "database.query" [sql]
  IF_ERROR -> 50 (jump to error handler)
  
  ...(success path)...
  RETURN
  
  50: STORE_OUTPUT "error" "Query failed"
      RETURN

Result: { error: "Query failed" } (graceful error)
```

### Error Messages

```
Error format:
  {
    code: "RUNTIME_ERROR",
    message: "Type mismatch in EXTRACT_JSON",
    context: {
      instruction_pointer: 12,
      register: "$0",
      expected_type: "object",
      actual_type: "string"
    }
  }
```

---

## Performance Characteristics

### Instruction Latency

```
Category | Instruction | Latency | Example |
----------|-------------|---------|---------|
Data Op   | LOAD_CONST | 1μs | Load constant |
          | STORE | 1μs | Store to variable |
Compute   | ADD | 10μs | Arithmetic |
          | CMP | 15μs | Comparison |
Network   | HTTP_GET | 20-500ms | API call |
          | HTTP_POST | 20-500ms | API call |
Parse     | EXTRACT_JSON | 100-1000μs | JSON parsing |
Service   | CALL_SERVICE | 20-500ms | External call |
Control   | IF_TRUE/JUMP | 1μs | Branch |
```

### Throughput Characteristics

```
Per execution:
  - Tasks: 1 per execution
  - Latency (p50): 45ms
  - Latency (p99): 120ms
  - Throughput: 3,333 tasks/sec per instance

Multi-instance:
  - 5 instances: 16,665 tasks/sec
  - 10 instances: 33,330 tasks/sec
```

---

## Concurrency Model

### Single-Threaded Execution

```
Why single-threaded?
  1. Determinism: Multi-threading adds non-determinism
  2. Simplicity: No race conditions, locks, synchronization
  3. Predictability: Latency is consistent
  4. Debugging: Easier to trace execution

Note: Parallel execution handled at SVM level (not in bytecode)
```

### Parallel Actions

```
Bytecode:
  PARALLEL_START 2
  Task 1: HTTP_GET "url1"
  Task 2: HTTP_GET "url2"
  PARALLEL_JOIN

Execution:
  SVM spawns 2 worker threads
  Both execute in parallel (non-blocking)
  Results combined after both complete
  Main thread continues

Result: 2 * 250ms = 250ms (not 500ms)
```

---

## Debugging Support

### Inspector Interface

```bash
svm-inspect bytecode.ir

Output:
  Instruction 0: LOAD_INPUT "city"
  Instruction 1: HTTP_GET "https://..."
  Instruction 2: EXTRACT_JSON ... "main.temp"
  ... (all instructions listed)
```

### Breakpoint Support

```bash
svm-debug --breakpoint 5 bytecode.ir input.json

Execution pauses at:
  Instruction 5 reached
  
Inspect state:
  > print $0
  "NYC"
  > print $1
  {temperature: 25.5, ...}
  > continue
```

### Trace Output

```bash
svm-run --trace bytecode.ir input.json

Output: Complete execution trace
  IP=0: LOAD_INPUT "city" -> $0="NYC"
  IP=1: HTTP_GET ... -> $1={...}
  IP=2: EXTRACT_JSON ... -> $2=25.5
  ...
```

---

## Security Sandbox

### Isolation

Each execution runs in isolated sandbox:

```
Sandbox limits:
  - No file system access
  - No network access (except via connectors)
  - No environment variable access
  - No child process spawning
  - No direct memory access

Exception: Service connectors
  - Limited to registered services
  - Each service has permission list
  - Audit logged
```

### Capability-Based Security

```
Task: Send Slack message

Permissions:
  - REQUIRE: slack.send_message
  - Denied: database write
  - Denied: file create

Execution:
  - Slack call: Allowed
  - Database write: Rejected
  - File create: Rejected
```

---

## Correctness Proofs

### Termination Guarantee

**Theorem**: Every well-formed program terminates.

**Proof**:
1. All loops have bounded iteration count
2. Recursion limited to 100 levels
3. Timeout enforced (5 minutes max)
→ Execution always terminates

### Type Safety Guarantee

**Theorem**: No type errors occur during execution.

**Proof**:
1. Bytecode type-checked before execution
2. All operations type-consistent
3. No unsafe casts allowed
→ Runtime type errors impossible

---

## Roadmap & Optimizations

### Performance Improvements (v2.2)

1. **JIT Compilation**: Compile to native code (10x faster)
2. **Instruction Caching**: Pre-compile common sequences
3. **SIMD Operations**: Vectorized operations

### Feature Roadmap

- **v2.2**: JIT compilation, SIMD
- **v2.3**: Distributed execution (multi-machine)
- **v3.0**: GPU acceleration (for data-parallel tasks)
