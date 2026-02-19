---
sidebar_position: 8
title: Custom Connectors
description: Build your own EyeFlow connectors
---

# Building Custom Connectors

Extend EyeFlow by creating connectors for services not in the built-in library.

## Connector Architecture

Every connector implements the `Connector` interface:

```typescript
interface Connector {
  // Called once at setup (compile time)
  initialize(config: ConnectorConfig): Promise<void>;
  
  // Called for each execution
  call(method: string, params: Record<string, any>): Promise<any>;
  
  // Called on shutdown
  cleanup(): Promise<void>;
}
```

## Quick Start Template

### Step 1: Create Connector Class

Create `connectors/my-service.connector.ts`:

```typescript
import { Connector, ConnectorConfig } from '@eyeflow/sdk';

export class MyServiceConnector implements Connector {
  private client: MyServiceClient;
  private config: ConnectorConfig;
  
  async initialize(config: ConnectorConfig): Promise<void> {
    this.config = config;
    
    // Validate configuration
    if (!config.api_key) {
      throw new Error('api_key is required');
    }
    
    // Initialize client
    this.client = new MyServiceClient({
      apiKey: config.api_key,
      baseUrl: config.base_url || 'https://api.myservice.com'
    });
    
    // Test connection
    await this.client.testConnection();
    console.log('✅ Connector initialized');
  }
  
  async call(method: string, params: Record<string, any>): Promise<any> {
    switch (method) {
      case 'getUserById':
        return this.getUserById(params.id);
      case 'createUser':
        return this.createUser(params);
      case 'updateUser':
        return this.updateUser(params.id, params);
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }
  
  async cleanup(): Promise<void> {
    await this.client.disconnect();
  }
  
  // Specific methods
  private async getUserById(id: string): Promise<any> {
    const response = await this.client.get(`/users/${id}`);
    return response.data;
  }
  
  private async createUser(data: any): Promise<any> {
    const response = await this.client.post('/users', data);
    return response.data;
  }
  
  private async updateUser(id: string, data: any): Promise<any> {
    const response = await this.client.put(`/users/${id}`, data);
    return response.data;
  }
}
```

### Step 2: Define Service Capabilities

Create `connectors/my-service.capabilities.yaml`:

```yaml
id: my_service
name: My Service
description: Integration with My Service API
type: data_management

capabilities:
  - id: getUserById
    name: Get User
    description: Retrieve a single user by ID
    params:
      - name: id
        type: string
        required: true
        description: User ID
    returns:
      type: object
      schema:
        id: string
        name: string
        email: string
        created_at: string
  
  - id: createUser
    name: Create User
    description: Create a new user
    params:
      - name: name
        type: string
        required: true
      - name: email
        type: string
        required: true
      - name: role
        type: string
        enum: [admin, user, guest]
        default: user
    returns:
      type: object
      schema:
        id: string
        name: string
        email: string
        created_at: string
  
  - id: updateUser
    name: Update User
    description: Update an existing user
    params:
      - name: id
        type: string
        required: true
      - name: name
        type: string
      - name: email
        type: string
    returns:
      type: object

authentication:
  type: api_key
  location: header
  name: X-API-Key

rateLimit:
  requests: 1000
  per: minute

healthCheck:
  method: testConnection
  interval: 5m
```

### Step 3: Register Connector

In `connectors/index.ts`:

```typescript
import { MyServiceConnector } from './my-service.connector';

export const connectors = {
  my_service: {
    class: MyServiceConnector,
    capabilities: require('./my-service.capabilities.yaml')
  }
};
```

---

## Example: Build a Weather Service Connector

### Complete Implementation

```typescript
// weather-service.connector.ts
import axios from 'axios';
import { Connector, ConnectorConfig } from '@eyeflow/sdk';

interface WeatherData {
  temperature: number;
  condition: string;
  humidity: number;
  wind_speed: number;
}

export class WeatherServiceConnector implements Connector {
  private apiKey: string;
  private baseUrl: string = 'https://api.weatherapi.com/v1';
  
  async initialize(config: ConnectorConfig): Promise<void> {
    if (!config.api_key) {
      throw new Error('WeatherAPI API key is required');
    }
    
    this.apiKey = config.api_key;
    
    // Test the connection immediately
    try {
      await this.getWeather({ location: 'London' });
      console.log('✅ Weather connector initialized');
    } catch (error) {
      throw new Error(`Failed to initialize weather connector: ${error.message}`);
    }
  }
  
  async call(method: string, params: Record<string, any>): Promise<any> {
    switch (method) {
      case 'getWeather':
        return this.getWeather(params);
      case 'getForecast':
        return this.getForecast(params);
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }
  
  async cleanup(): Promise<void> {
    // No cleanup needed for HTTP-based connector
  }
  
  private async getWeather(params: any): Promise<WeatherData> {
    const { location, units = 'metric' } = params;
    
    if (!location) {
      throw new Error('location parameter is required');
    }
    
    try {
      const response = await axios.get(`${this.baseUrl}/current.json`, {
        params: {
          key: this.apiKey,
          q: location,
          aqi: 'yes'
        }
      });
      
      const data = response.data.current;
      
      return {
        temperature: data.temp_c,
        condition: data.condition.text,
        humidity: data.humidity,
        wind_speed: data.wind_kph
      };
    } catch (error) {
      if (error.response?.status === 400) {
        throw new Error(`Location not found: ${location}`);
      }
      throw new Error(`Weather API error: ${error.message}`);
    }
  }
  
  private async getForecast(params: any): Promise<any> {
    const { location, days = 5 } = params;
    
    if (!location) {
      throw new Error('location parameter is required');
    }
    
    if (days < 1 || days > 10) {
      throw new Error('days must be between 1 and 10');
    }
    
    try {
      const response = await axios.get(`${this.baseUrl}/forecast.json`, {
        params: {
          key: this.apiKey,
          q: location,
          days: days,
          aqi: 'yes'
        }
      });
      
      return response.data.forecast.forecastday.map(day => ({
        date: day.date,
        max_temp: day.day.maxtemp_c,
        min_temp: day.day.mintemp_c,
        condition: day.day.condition.text,
        chance_of_rain: day.day.daily_chance_of_rain
      }));
    } catch (error) {
      throw new Error(`Forecast error: ${error.message}`);
    }
  }
}
```

### Capabilities Definition

```yaml
# weather-service.capabilities.yaml
id: weather_service
name: Weather Service
description: Get weather data via WeatherAPI.com
type: data_lookup

capabilities:
  - id: getWeather
    name: Get Current Weather
    description: Get current weather for a location
    params:
      - name: location
        type: string
        required: true
        description: City name or coordinates (e.g., "London", "40.71,-74.00")
      - name: units
        type: string
        enum: [metric, imperial]
        default: metric
    returns:
      type: object
      schema:
        temperature: number 
        condition: string
        humidity: number
        wind_speed: number
  
  - id: getForecast
    name: Get Weather Forecast
    description: Get weather forecast (1-10 days)
    params:
      - name: location
        type: string
        required: true
      - name: days
        type: number
        minimum: 1
        maximum: 10
        default: 5
    returns:
      type: array
      items:
        date: string
        max_temp: number
        min_temp: number
        condition: string
        chance_of_rain: number

authentication:
  type: api_key
  location: query
  name: key

rateLimit:
  requests: 1000
  per: day
```

---

## Testing Your Connector

### Unit Test

```typescript
// weather-service.connector.test.ts
import { WeatherServiceConnector } from './weather-service.connector';

describe('WeatherServiceConnector', () => {
  let connector: WeatherServiceConnector;
  
  beforeEach(async () => {
    connector = new WeatherServiceConnector();
    await connector.initialize({
      api_key: process.env.WEATHER_API_KEY
    });
  });
  
  it('should get current weather', async () => {
    const weather = await connector.call('getWeather', {
      location: 'London'
    });
    
    expect(weather).toHaveProperty('temperature');
    expect(weather).toHaveProperty('condition');
    expect(typeof weather.temperature).toBe('number');
  });
  
  it('should get forecast', async () => {
    const forecast = await connector.call('getForecast', {
      location: 'London',
      days: 3
    });
    
    expect(Array.isArray(forecast)).toBe(true);
    expect(forecast[0]).toHaveProperty('date');
    expect(forecast[0]).toHaveProperty('max_temp');
  });
  
  it('should reject invalid location', async () => {
    await expect(
      connector.call('getWeather', { location: 'InvalidCity123!' })
    ).rejects.toThrow('Location not found');
  });
  
  afterEach(async () => {
    await connector.cleanup();
  });
});
```

### Integration Test in EyeFlow

```typescript
describe('Weather Connector Integration', () => {
  it('should work in a task', async () => {
    // Create task using connector
    const task = await client.tasks.create({
      name: 'get_weather_test',
      actions: [
        {
          type: 'connector',
          connector: 'weather_service',
          function: 'getWeather',
          params: { location: 'New York' }
        }
      ]
    });
    
    // Execute task
    const result = await client.tasks.execute('get_weather_test');
    
    expect(result.status).toBe('success');
    expect(result.output).toHaveProperty('temperature');
  });
});
```

---

## Publishing Your Connector

### Step 1: Publish to NPM

```bash
# Create package.json
{
  "name": "@myorg/eyeflow-weather-connector",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "peerDependencies": {
    "@eyeflow/sdk": "^1.0.0"
  }
}

# Build
npm run build

# Publish
npm publish
```

### Step 2: Register with EyeFlow

Submit to the [EyeFlow Connector Registry](https://registry.eyeflow.io):

```yaml
name: Weather Service Connector
author: Your Name
version: 1.0.0
package: "@myorg/eyeflow-weather-connector"
npm_url: https://www.npmjs.com/package/@myorg/eyeflow-weather-connector
capabilities:
  - getWeather
  - getForecast
tags:
  - weather
  - data-lookup
```

### Step 3: Community

Share your connector:
- GitHub discussions
- EyeFlow Slack community
- Connector marketplace

---

## Best Practices

### Error Handling

```typescript
// ✅ Good: Specific, actionable errors
throw new Error('Location not found: coordinates [-90.5, -180]');

// ❌ Bad: Vague error
throw new Error('API error');
```

### Validation

```typescript
// ✅ Validate early
if (!params.email || !params.email.includes('@')) {
  throw new Error('Invalid email format');
}

// ✅ Type safety
async call(method: string, params: Record<string, any>): Promise<any> {
  if (typeof method !== 'string') {
    throw new TypeError('method must be a string');
  }
}
```

### Performance

```typescript
// ✅ Cache connections
private client: ApiClient;  // Reuse across calls

// ✅ Implement timeout
const response = await Promise.race([
  this.client.get(url),
  this.timeout(30000)
]);

// ❌ Don't create new connection per call
async call() {
  const client = new Client();  // Slow!
}
```

### Documentation

```typescript
/**
 * Get weather for a location
 * 
 * @param location - City name or coordinates
 * @param units - Temperature units (metric/imperial)
 * @returns Weather data with temperature, condition, humidity
 * @throws Error if location not found or API unreachable
 */
async getWeather(params: {
  location: string;
  units?: 'metric' | 'imperial';
}): Promise<WeatherData>
```

---

## Advanced Topics

### Streaming Data

```typescript
async *streamWeather(location: string) {
  for (let hour = 0; hour < 24; hour++) {
    const weather = await this.getWeatherAtTime(location, hour);
    yield weather;
  }
}
```

### Async Patterns

```typescript
// Poll for completion
async createJob(data: any): Promise<string> {
  const response = await this.client.post('/jobs', data);
  return response.job_id;
}

async getJobStatus(jobId: string): Promise<any> {
  return this.client.get(`/jobs/${jobId}`);
}
```

### Batch Operations

```typescript
async getWeatherBatch(locations: string[]): Promise<WeatherData[]> {
  return Promise.all(
    locations.map(loc => this.getWeather({ location: loc }))
  );
}
```

---

## Debugging Tips

```typescript
// Add debug output
console.log('[weather-connector] Calling API:', url);
console.log('[weather-connector] Response:', data);

// Or use debug module
import debug from 'debug';
const log = debug('eyeflow:weather');
log('API response: %O', data);

// Enable with: DEBUG=eyeflow:* npm start
```

---

## Next Steps

- [Share on GitHub](https://github.com/topics/eyeflow-connector)
- [Join community](https://github.com/eyeflow-ai/eyeflow/discussions)
- [View connector marketplace](https://registry.eyeflow.io)

---

Build powerful integrations with EyeFlow! 🚀
