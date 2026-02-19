---
sidebar_position: 3
title: SDKs & Client Libraries
description: Official SDKs for popular languages
---

# SDKs & Client Libraries

Official SDKs for integrating EyeFlow with your applications.

## JavaScript / Node.js

### Installation

```bash
npm install @eyeflow/sdk
```

### Basic Usage

```javascript
const Eyeflow = require('@eyeflow/sdk');

const client = new Eyeflow({
  apiKey: 'sk_live_your_key_here',
  apiUrl: 'https://api.eyeflow.com'
});

// Execute a task
const result = await client.tasks.execute('daily_weather', {
  city: 'New York'
});

console.log(`Status: ${result.status}`); // success
console.log(`Latency: ${result.duration_ms}ms`); // 78ms
console.log(`Output: ${JSON.stringify(result.output)}`);
```

### Task Operations

```javascript
// Create task
const task = await client.tasks.create({
  name: 'my_task',
  trigger: { type: 'webhook' },
  actions: [
    {
      type: 'http',
      method: 'GET',
      url: 'https://api.example.com/data'
    }
  ]
});

// List tasks
const tasks = await client.tasks.list({ limit: 50 });

// Get task details
const task = await client.tasks.get('daily_weather');

// Update task
await client.tasks.update('daily_weather', {
  description: 'Updated description'
});

// Execute task
const result = await client.tasks.execute('daily_weather');

// Delete task
await client.tasks.delete('daily_weather');
```

### Connector Operations

```javascript
// Create connector
const connector = await client.connectors.create({
  service: 'slack',
  name: 'slack_alerts',
  config: {
    token: 'xoxb-...'
  }
});

// Test connector
const test = await client.connectors.test('slack_alerts');
console.log(test.connected); // true

// List connectors
const connectors = await client.connectors.list();
```

### Execution History

```javascript
// Get execution details
const execution = await client.executions.get('exec_abc123');

// List executions
const executions = await client.executions.list({
  task_id: 'task_abc123',
  status: 'success',
  limit: 20
});

// Stream executions in real-time
client.executions.stream('task_abc123')
  .on('success', (exec) => {
    console.log(`Task succeeded in ${exec.duration_ms}ms`);
  })
  .on('failed', (exec) => {
    console.log(`Task failed: ${exec.error}`);
  });
```

### Error Handling

```javascript
try {
  const result = await client.tasks.execute('daily_weather');
} catch (error) {
  if (error.code === 'TASK_NOT_FOUND') {
    console.error('Task does not exist');
  } else if (error.code === 'TIMEOUT') {
    console.error('Task took too long');
  } else {
    console.error(`Error: ${error.message}`);
  }
}
```

---

## Python

### Installation

```bash
pip install eyeflow-sdk
```

### Basic Usage

```python
from eyeflow import Client

client = Client(
    api_key='sk_live_your_key_here',
    api_url='https://api.eyeflow.com'
)

# Execute a task
result = client.tasks.execute('daily_weather', {
    'city': 'New York'
})

print(f"Status: {result['status']}")        # success
print(f"Latency: {result['duration_ms']}ms") # 78ms
print(f"Output: {result['output']}")
```

### Task Operations

```python
# Create task
task = client.tasks.create({
    'name': 'my_task',
    'trigger': {'type': 'webhook'},
    'actions': [
        {
            'type': 'http',
            'method': 'GET',
            'url': 'https://api.example.com/data'
        }
    ]
})

# List tasks
tasks = client.tasks.list(limit=50, status='active')

# Get task
task = client.tasks.get('daily_weather')

# Update task
client.tasks.update('daily_weather', {
    'description': 'Updated description'
})

# Execute task
result = client.tasks.execute('daily_weather')

# Delete task
client.tasks.delete('daily_weather')
```

### Async Support

```python
import asyncio
from eyeflow import AsyncClient

async def main():
    async with AsyncClient(api_key='sk_live_...') as client:
        result = await client.tasks.execute('daily_weather')
        print(result)

asyncio.run(main())
```

### Batch Operations

```python
# Execute multiple tasks
results = []
for task_name in ['task1', 'task2', 'task3']:
    result = client.tasks.execute(task_name)
    results.append(result)

# Wait for all to complete
all_successful = all(r['status'] == 'success' for r in results)
```

---

## Go

### Installation

```bash
go get github.com/eyeflow-ai/go-sdk
```

### Basic Usage

```go
package main

import (
    "github.com/eyeflow-ai/go-sdk"
)

func main() {
    client := eyeflow.NewClient(
        "sk_live_your_key_here",
        "https://api.eyeflow.com",
    )

    // Execute a task
    result, err := client.Tasks.Execute("daily_weather", map[string]interface{}{
        "city": "New York",
    })
    if err != nil {
        panic(err)
    }

    println("Status:", result.Status)
    println("Latency:", result.DurationMs, "ms")
}
```

### Task Operations

```go
// Create task
task, err := client.Tasks.Create(&eyeflow.Task{
    Name: "my_task",
    Trigger: eyeflow.Trigger{Type: "webhook"},
})

// List tasks
tasks, err := client.Tasks.List(&eyeflow.ListOptions{
    Limit: 50,
    Status: "active",
})

// Get task
task, err := client.Tasks.Get("daily_weather")

// Execute task
result, err := client.Tasks.Execute("daily_weather", nil)
```

---

## Java

### Installation (Maven)

```xml
<dependency>
    <groupId>com.eyeflow</groupId>
    <artifactId>eyeflow-sdk</artifactId>
    <version>1.0.0</version>
</dependency>
```

### Basic Usage

```java
import com.eyeflow.Client;
import com.eyeflow.models.ExecutionResult;

public class Example {
    public static void main(String[] args) throws Exception {
        Client client = new Client("sk_live_your_key_here");
        
        // Execute a task
        ExecutionResult result = client.tasks()
            .execute("daily_weather", new HashMap<>() {{
                put("city", "New York");
            }});
        
        System.out.println("Status: " + result.getStatus());
        System.out.println("Latency: " + result.getDurationMs() + "ms");
    }
}
```

### Reactive Streams

```java
// Combine with Project Reactor for reactive programming
client.tasks()
    .executeAsync("daily_weather")
    .map(ExecutionResult::getOutput)
    .subscribe(
        output -> System.out.println("Result: " + output),
        error -> System.err.println("Error: " + error)
    );
```

---

## Ruby

### Installation

```bash
gem install eyeflow
```

### Basic Usage

```ruby
require 'eyeflow'

client = Eyeflow::Client.new(api_key: 'sk_live_your_key_here')

# Execute a task
result = client.tasks.execute('daily_weather', city: 'New York')

puts "Status: #{result['status']}"
puts "Latency: #{result['duration_ms']}ms"
puts "Output: #{result['output']}"
```

### Rails Integration

```ruby
# Add to Gemfile
gem 'eyeflow-rails'

# app/services/weather_service.rb
class WeatherService
  def get_weather(city)
    result = Eyeflow.execute('daily_weather', city: city)
    result['output']
  end
end

# app/controllers/weather_controller.rb
class WeatherController < ApplicationController
  def show
    @weather = WeatherService.new.get_weather('New York')
  end
end
```

---

## PHP

### Installation

```bash
composer require eyeflow/sdk
```

### Basic Usage

```php
<?php
require_once 'vendor/autoload.php';

use Eyeflow\Client;

$client = new Client('sk_live_your_key_here');

// Execute a task
$result = $client->tasks()->execute('daily_weather', [
    'city' => 'New York'
]);

echo "Status: " . $result['status'] . "\n";
echo "Latency: " . $result['duration_ms'] . "ms\n";
echo "Output: " . json_encode($result['output']) . "\n";
```

### Laravel Integration

```php
// config/eyeflow.php
return [
    'api_key' => env('EYEFLOW_API_KEY'),
    'api_url' => env('EYEFLOW_API_URL'),
];

// app/Services/EyeflowService.php
class EyeflowService {
    protected $client;
    
    public function __construct() {
        $this->client = new Client(config('eyeflow.api_key'));
    }
    
    public function executeTask($name, $data = []) {
        return $this->client->tasks()->execute($name, $data);
    }
}

// Usage in controller
$result = app(EyeflowService::class)->executeTask('daily_weather', [
    'city' => 'New York'
]);
```

---

## Common Patterns

### Pattern 1: Error Handling with Retry

```javascript
async function executeWithRetry(taskName, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await client.tasks.execute(taskName);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`Retry ${i + 1}/${maxRetries}`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

### Pattern 2: Webhook Handler (Express)

```javascript
const express = require('express');
const app = express();

app.post('/api/webhooks/eyeflow', express.json(), async (req, res) => {
  try {
    const result = await client.tasks.execute('process_incoming', req.body);
    res.json({ success: true, execution_id: result.execution_id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Pattern 3: Batch Execution Monitor

```python
import asyncio
from eyeflow import AsyncClient

async def batch_execute(tasks):
    async with AsyncClient(api_key='sk_live_...') as client:
        # Execute all tasks concurrently
        results = await asyncio.gather(*[
            client.tasks.execute(task)
            for task in tasks
        ])
        
        # Generate report
        successful = sum(1 for r in results if r['status'] == 'success')
        failed = sum(1 for r in results if r['status'] == 'failed')
        
        return {
            'total': len(results),
            'successful': successful,
            'failed': failed,
            'results': results
        }
```

---

## SDK Features

| Feature | JS | Python | Go | Java | Ruby | PHP |
|---------|----|---------|----|------|------|-----|
| Task execution | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Error handling | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Async/await | ✅ | ✅ | ✅ | ✅ | ✅ | ⏳ |
| Streaming | ✅ | ✅ | ✅ | ✅ | ⏳ | ⏳ |
| Rate limiting | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Retries | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Migration Guide

### From OpenClaw SDK

```javascript
// OpenClaw (slow)
const result = await openclaw.run('task_name', {
  ...params
});
// Takes 1900ms, might hallucinate

// EyeFlow (fast)
const result = await eyeflow.tasks.execute('task_name', {
  ...params
});
// Takes 45ms, 100% guaranteed
```

---

**Ready to build?**
- [Connector Development](./connectors/custom.md)
- [API Reference](./api-reference.md)
- [Deployment Guide](./deployment.md)

---

Integrate EyeFlow with your entire tech stack. 🚀
