---
sidebar_position: 2
title: LLM-IR (Intermediate Representation)
description: Bytecode format and execution semantics
---

# LLM-IR: Intermediate Representation

The bytecode format that bridges compilation and execution.

## IR Overview

### Purpose

LLM-IR is a low-level bytecode that:
1. Can be generated deterministically (no hallucinations)
2. Can be executed without LLM (no external dependencies)
3. Can be optimized independently (compiler research applicable)
4. Can be transmitted efficiently (binary encoding)
5. Can be verified formally (type checking, bounds analysis)

### Properties

| Property | Value | Benefit |
|----------|-------|---------|
| Type System | Strongly typed | Catches errors early |
| Memory Safety | No buffer overflows | Secure execution |
| Bounded Execution | All loops bounded | No infinite loops |
| Determinism | Pure functions | Reproducible results |
| Compactness | Binary encoding | Efficient storage |

---

## IR Instruction Set

### Data Operations

```
LOAD_INPUT "param_name" -> Reg
  Load input parameter
  Example: LOAD_INPUT "email" -> $0

LOAD_CONST <value> -> Reg
  Load constant value
  Example: LOAD_CONST 42 -> $1

STORE "var_name" Reg
  Store register to variable
  Example: STORE "result" $0

LOAD "var_name" -> Reg
  Load variable to register
  Example: LOAD "result" -> $0
```

### Network Operations

```
HTTP_GET "url" [params] -> Reg
  GET request
  Example: HTTP_GET "https://api.weather.com/data" [$city] -> $0
  
HTTP_POST "url" [body] -> Reg
  POST request
  Example: HTTP_POST "https://api.slack.com/send" [$message] -> $0

HTTP_PUT "url" [body] -> Reg
  PUT request
  
HTTP_DELETE "url" [params] -> Reg
  DELETE request
```

### Parsing Operations

```
EXTRACT_JSON Reg "path" -> Reg
  Parse JSON field
  Example: EXTRACT_JSON $0 "main.temp" -> $1
  
EXTRACT_XML Reg "xpath" -> Reg
  Parse XML field
  Example: EXTRACT_XML $0 "//temperature" -> $1

EXTRACT_REGEX Reg "pattern" -> Reg
  Extract via regex
  Example: EXTRACT_REGEX $0 "[0-9]+" -> $1
```

### Computation Operations

```
ADD Reg Reg -> Reg
  Addition
  Example: ADD $0 $1 -> $2
  
SUB Reg Reg -> Reg
  Subtraction
  
MUL Reg Reg -> Reg
  Multiplication
  
DIV Reg Reg -> Reg
  Division
  
MOD Reg Reg -> Reg
  Modulo
  
LEN Reg -> Reg
  String/array length
```

### Comparison Operations

```
CMP "<op>" Reg Reg -> Reg
  Comparison
  Operators: <, <=, >, >=, ==, !=
  Example: CMP ">" $0 $1 -> $2
  Result: 1 (true) or 0 (false)
```

### Control Flow

```
IF_TRUE Reg <addr>
  Jump if register is true
  Example: IF_TRUE $condition -> 10 (jump to instruction 10)
  
IF_FALSE Reg <addr>
  Jump if register is false
  
JUMP <addr>
  Unconditional jump
  
CALL_SERVICE "service.method" [params] -> Reg
  Call connector
  Example: CALL_SERVICE "slack.send_message" ["#channel", "text"] -> $0
```

### Iteration

```
FOR_EACH Reg <start> <end> <body_start> <body_end>
  Loop over range
  Example: FOR_EACH $item 0 10 5 9 (loop items 0-9, body at 5-9)
  
FOR_EACH_ARRAY Reg <body_start> <body_end>
  Loop over array elements
  
BREAK -> void
  Exit loop
  
CONTINUE -> void
  Next iteration
```

### Concurrency

```
PARALLEL_START <num_tasks> -> void
  Begin parallel section
  Example: PARALLEL_START 3 (run next 3 tasks in parallel)
  
PARALLEL_JOIN -> void
  Wait for parallel tasks
```

### Output

```
STORE_OUTPUT "name" Reg -> void
  Store result output
  Example: STORE_OUTPUT "temperature" $temp
  
RETURN Reg
  Return result and exit
```

---

## IR Binary Format

### Compact Encoding

Each instruction encodes as:
- 1 byte: Opcode (256 possible operations)
- Variable: Arguments encoded based on opcode

### Example Encoding

```
Instruction: HTTP_GET "https://api.weather.com/data" [$city] -> $0
Encoding:
  Byte 0: 0x42 (HTTP_GET opcode)
  Bytes 1-2: 0x1234 (string offset in constant pool)
  Byte 3: 0x01 (1 parameter)
  Byte 4: 0x00 (parameter: $city = register index 0)
  Byte 5: 0x00 (destination: register 0)

Total: 6 bytes (vs 50+ bytes if stored as text)
```

### Binary Format Structure

```
[Header]
  Magic: 0xFFEF (identifies as IR)
  Version: 0x02 (IR version 2)
  Size: U32 (total bytecode size)
  Constants: U16 (count of constants)

[Constant Pool]
  String lengths and data for all strings/URLs

[Instructions]
  Bytecode for all operations

[Metadata]
  Line numbers (for debugging)
  Variable names (for debugging)
  Type information
```

### Size Optimization

Average bytecode size reduction:

| Task Complexity | Text IR | Binary IR | Reduction |
|-----------------|---------|-----------|-----------|
| Simple (5 steps) | 1.2 KB | 180 bytes | 85% |
| Medium (20 steps) | 5.4 KB | 650 bytes | 88% |
| Complex (100 steps) | 28 KB | 3.2 KB | 88% |

---

## Type System

### Supported Types

```
Primitive:
  - bool (1 byte)
  - i32 (4 bytes)
  - i64 (8 bytes)
  - f32 (4 bytes)
  - f64 (8 bytes)
  - string (variable length)
  - bytes (variable length)

Composite:
  - array<T> (typed arrays)
  - object (key-value map)
  - union<T1, T2, ...> (tagged union)

Special:
  - null (absence of value)
  - error (error type)
```

### Type Tracking

Each instruction has type information:

```
HTTP_GET -> string (response body)
EXTRACT_JSON "main.temp" (from string) -> f64 (temperature)
CMP ">" (f64, f64) -> bool (comparison result)
CALL_SERVICE "slack.send_message" -> object (response)
```

### Type Errors

Caught at **compilation** time:

```
Error: Cannot compare string > number
  Instruction: CMP ">" $email $count
  $email: string
  $count: i32
```

---

## Execution Semantics

### Register State

```
Registers: $0, $1, $2, ... (16-bit addressing = 65K registers)
Memory Limit: 100MB per execution
Execution Stack: 1000 stack frames max
Recursion Depth: 100 levels max
```

### Variable Scope

```
Global Scope:
  - Inputs (read-only)
  - Outputs (write-once)
  - Constants

Local Scope (per function call):
  - Local variables
  - Function parameters
  - Temporary results

Scope Lifetime:
  - Created: At function entry
  - Valid: Until function exit
  - Freed: Automatic (no manual deallocation)
```

### Error Handling

```
Error Types:
  - Compilation error (invalid IR)
  - Runtime error (execution failure)
  - External error (API failure)

Error Handling:
  CALL_SERVICE may return error
  IF error condition is true:
    - Jump to error handler
    - Or propagate to caller

Example:
  CALL_SERVICE "database.query" [$sql]
  IF_ERROR -> 50 (jump to error handler)
```

---

## Optimization Opportunities

### IR-Level Optimizations

**Dead Instruction Elimination**:
```
Before:
  0: HTTP_GET "url" -> $0
  1: EXTRACT_JSON $0 "field" -> $1
  2: STORE_OUTPUT "result" $1
  3: HTTP_GET "url2" -> $2  (unused)

After:
  0: HTTP_GET "url" -> $0
  1: EXTRACT_JSON $0 "field" -> $1
  2: STORE_OUTPUT "result" $1
```

**Common Subexpression Elimination**:
```
Before:
  0: HTTP_GET "url" -> $0
  1: EXTRACT_JSON $0 "field" -> $1
  2: CMP ">" $1 30 -> $2
  3: HTTP_GET "url" -> $3 (identical to $0)
  4: EXTRACT_JSON $3 "field" -> $4

After:
  0: HTTP_GET "url" -> $0
  1: EXTRACT_JSON $0 "field" -> $1
  2: CMP ">" $1 30 -> $2
  3: ... (reuse $1, skip lines 3-4)
```

**Constant Folding**:
```
Before:
  0: LOAD_CONST 32 -> $0
  1: LOAD_CONST 5 -> $1
  2: MUL $0 $1 -> $2  (32 * 5 = 160, can fold at compile)

After:
  0: LOAD_CONST 160 -> $0
```

### Parallel Opportunities

```
PARALLEL_START 2
  Task 1: HTTP_GET "url1" -> $0
  Task 2: HTTP_GET "url2" -> $1
PARALLEL_JOIN

(Both tasks run in parallel, results combined)
```

---

## Debugging Support

### Line Number Mapping

Each instruction maps to original source:

```
IR Instruction 5: HTTP_GET "url"
  ↓ (maps to)
  Source: task.py, line 23
  Context: "Fetch weather data"

Debug output shows:
  Error at task.py:23 - Network timeout
  Context: "Fetch weather data"
```

### Variable Inspection

During execution, inspect any register:

```
Instruction Pointer: 12
  $0 = "NYC"
  $1 = "New York"
  $2 = 25.5
  $temp = 25.5
  $message = "Warm day"
```

### Runtime Tracing

Record execution trace for debugging:

```
Trace:
  IP 0: LOAD_INPUT "city" -> $0 ($0 = "NYC")
  IP 1: HTTP_GET "api.weather.com?q=NYC" -> $1 ($1 = {...})
  IP 2: EXTRACT_JSON $1 "main.temp" -> $2 ($2 = 25.5)
  IP 3: CMP ">" $2 30 -> $3 ($3 = 0)
  IP 4: IF_FALSE $3 -> 7 (jump taken)
  IP 7: STORE_OUTPUT "temperature" $2
  IP 8: RETURN
```

---

## Standards & Specifications

### Version History

- v1.0: Initial format (2021)
- v1.1: Added concurrency (2022)
- v2.0: Type system, debugging (2023)
- v2.1: Binary encoding (current)

### Compatibility

```
Forward Compatible: v2.1 IR can run on v2.0+ runtime
Backward Compatible: v2.0 IR can run on v2.0 runtime

Migration: v1.x → v2.0 (automatic, during compilation)
```

### Open Specification

LLM-IR format is documented and open:
- [LLM-IR Specification](https://docs.eyeflow.sh/llm-ir)
- Community implementations welcome
- Reference implementation: GitHub
