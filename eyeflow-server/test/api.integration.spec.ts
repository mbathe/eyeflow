/**
 * eyeflow API Integration Tests
 * 
 * Run with: npm test -- test/api.integration.spec.ts
 */

import axios, { AxiosInstance } from 'axios';

interface TestContext {
  api: AxiosInstance;
  userId: string;
  connectorIds: string[];
  llmConfigIds: string[];
}

const BASE_URL = 'http://localhost:3000/api';
const USER_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('eyeflow API Integration Tests', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = {
      api: axios.create({
        baseURL: BASE_URL,
        headers: {
          'X-User-ID': USER_ID,
          'Content-Type': 'application/json',
        },
      }),
      userId: USER_ID,
      connectorIds: [],
      llmConfigIds: [],
    };
  });

  describe('Connectors API', () => {
    test('should get available connector types', async () => {
      const response = await ctx.api.get('/connectors/catalog/available-types');
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('availableTypes');
      expect(Array.isArray(response.data.availableTypes)).toBe(true);
      expect(response.data.availableTypes.length).toBeGreaterThan(0);
    });

    test('should create a PostgreSQL connector', async () => {
      const payload = {
        name: 'Test PostgreSQL',
        type: 'POSTGRESQL',
        description: 'Test database connection',
        auth: {
          type: 'BASIC',
          credentials: {
            host: 'localhost',
            port: 5432,
            username: 'eyeflow',
            password: 'eyeflow123',
            database: 'eyeflow_db',
            ssl: false,
          },
        },
        config: {
          timeout: 30000,
          retryAttempts: 3,
          retryDelay: 1000,
        },
      };

      const response = await ctx.api.post('/connectors', payload);
      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('id');
      expect(response.data.name).toBe('Test PostgreSQL');
      expect(response.data.type).toBe('POSTGRESQL');
      expect(response.data.status).toBe('CONFIGURED');

      ctx.connectorIds.push(response.data.id);
    });

    test('should create an MQTT connector', async () => {
      const payload = {
        name: 'IoT Broker',
        type: 'MQTT',
        description: 'MQTT IoT data stream',
        auth: {
          type: 'BASIC',
          credentials: {
            broker: 'test.mosquitto.org',
            port: 1883,
            username: 'test',
            password: 'test',
            topics: ['sensors/+/temperature'],
          },
        },
      };

      const response = await ctx.api.post('/connectors', payload);
      expect(response.status).toBe(201);
      expect(response.data.type).toBe('MQTT');
      ctx.connectorIds.push(response.data.id);
    });

    test('should list all connectors', async () => {
      const response = await ctx.api.get('/connectors');
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('connectors');
      expect(response.data).toHaveProperty('total');
      expect(Array.isArray(response.data.connectors)).toBe(true);
    });

    test('should get connector detail', async () => {
      if (ctx.connectorIds.length === 0) {
        throw new Error('No connector ID available for testing');
      }

      const connectorId = ctx.connectorIds[0];
      const response = await ctx.api.get(`/connectors/${connectorId}`);
      expect(response.status).toBe(200);
      expect(response.data.id).toBe(connectorId);
      expect(response.data).toHaveProperty('name');
      expect(response.data).toHaveProperty('type');
      expect(response.data).toHaveProperty('status');
      expect(response.data).toHaveProperty('auth');
      // Password should not be returned
      expect(response.data.auth.credentials.password).toBeUndefined();
    });

    test('should update a connector', async () => {
      if (ctx.connectorIds.length === 0) {
        throw new Error('No connector ID available for testing');
      }

      const connectorId = ctx.connectorIds[0];
      const payload = {
        name: 'Updated Connector Name',
        description: 'Updated description',
      };

      const response = await ctx.api.put(`/connectors/${connectorId}`, payload);
      expect(response.status).toBe(200);
      expect(response.data.name).toBe('Updated Connector Name');
    });

    test('should test connector connection', async () => {
      if (ctx.connectorIds.length === 0) {
        throw new Error('No connector ID available for testing');
      }

      const connectorId = ctx.connectorIds[0];
      const response = await ctx.api.post(`/connectors/${connectorId}/test`);
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success');
      expect(response.data).toHaveProperty('message');
      expect(response.data).toHaveProperty('latency');
    });

    test('should not create duplicate connector', async () => {
      const payload = {
        name: 'Duplicate Name',
        type: 'POSTGRESQL',
        auth: {
          type: 'BASIC',
          credentials: {
            host: 'localhost',
            port: 5432,
            username: 'user',
            password: 'pass',
            database: 'db',
          },
        },
      };

      // Create first
      await ctx.api.post('/connectors', payload);

      // Try to create duplicate
      try {
        await ctx.api.post('/connectors', payload);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response.status).toBe(409); // Conflict
      }
    });
  });

  describe('LLM Configuration API', () => {
    test('should create a local LLM config', async () => {
      const payload = {
        provider: 'OLLAMA_LOCAL',
        model: 'LLAMA2_7B',
        isDefault: true,
        temperature: 0.7,
        maxTokens: 2000,
        topP: 1.0,
        frequencyPenalty: 0.0,
        presencePenalty: 0.0,
        localConfig: {
          baseUrl: 'http://localhost:11434',
          modelName: 'llama2:7b',
          gpuEnabled: false,
          cpuThreads: 4,
        },
      };

      const response = await ctx.api.post('/llm-config', payload);
      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('id');
      expect(response.data.provider).toBe('OLLAMA_LOCAL');
      expect(response.data.isDefault).toBe(true);

      ctx.llmConfigIds.push(response.data.id);
    });

    test('should create a cloud LLM config', async () => {
      const payload = {
        provider: 'OPENAI',
        model: 'GPT4_TURBO',
        isDefault: false,
        temperature: 0.7,
        maxTokens: 4096,
        topP: 1.0,
        frequencyPenalty: 0.0,
        presencePenalty: 0.6,
        apiConfig: {
          apiKey: 'sk-test-key',
          apiUrl: 'https://api.openai.com/v1',
          organization: 'org-test',
          costPer1kTokens: 0.03,
        },
      };

      const response = await ctx.api.post('/llm-config', payload);
      expect(response.status).toBe(201);
      expect(response.data.provider).toBe('OPENAI');

      ctx.llmConfigIds.push(response.data.id);
    });

    test('should list all LLM configs', async () => {
      const response = await ctx.api.get('/llm-config');
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('configs');
      expect(Array.isArray(response.data.configs)).toBe(true);
    });

    test('should get LLM config detail', async () => {
      if (ctx.llmConfigIds.length === 0) {
        throw new Error('No LLM config ID available for testing');
      }

      const configId = ctx.llmConfigIds[0];
      const response = await ctx.api.get(`/llm-config/${configId}`);
      expect(response.status).toBe(200);
      expect(response.data.id).toBe(configId);
      expect(response.data).toHaveProperty('provider');
      expect(response.data).toHaveProperty('model');
      expect(response.data).toHaveProperty('temperature');
    });

    test('should update LLM config', async () => {
      if (ctx.llmConfigIds.length === 0) {
        throw new Error('No LLM config ID available for testing');
      }

      const configId = ctx.llmConfigIds[0];
      const payload = {
        temperature: 0.5,
        maxTokens: 3000,
      };

      const response = await ctx.api.put(`/llm-config/${configId}`, payload);
      expect(response.status).toBe(200);
      expect(response.data.temperature).toBe(0.5);
      expect(response.data.maxTokens).toBe(3000);
    });

    test('should perform health check', async () => {
      if (ctx.llmConfigIds.length === 0) {
        throw new Error('No LLM config ID available for testing');
      }

      const configId = ctx.llmConfigIds[0];
      const response = await ctx.api.post(`/llm-config/${configId}/health-check`);
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status');
      expect(['healthy', 'unhealthy']).toContain(response.data.status);
      expect(response.data).toHaveProperty('latency');
    });

    test('should set default LLM config', async () => {
      if (ctx.llmConfigIds.length < 2) {
        throw new Error('Need at least 2 LLM configs for this test');
      }

      const configId = ctx.llmConfigIds[1];
      const response = await ctx.api.patch(`/llm-config/${configId}/set-default`);
      expect(response.status).toBe(200);
      expect(response.data.config.isDefault).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for non-existent connector', async () => {
      try {
        await ctx.api.get('/connectors/non-existent-id');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response.status).toBe(404);
      }
    });

    test('should return 404 for non-existent LLM config', async () => {
      try {
        await ctx.api.get('/llm-config/non-existent-id');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response.status).toBe(404);
      }
    });

    test('should return 400 for invalid connector type', async () => {
      const payload = {
        name: 'Invalid',
        type: 'INVALID_TYPE',
        auth: {
          type: 'BASIC',
          credentials: {},
        },
      };

      try {
        await ctx.api.post('/connectors', payload);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response.status).toBe(400);
      }
    });
  });

  afterAll(async () => {
    // Cleanup: Delete test connectors
    for (const connectorId of ctx.connectorIds) {
      try {
        await ctx.api.delete(`/connectors/${connectorId}`);
      } catch (error) {
        // Ignore errors during cleanup
      }
    }

    // Cleanup: Delete test LLM configs
    for (const configId of ctx.llmConfigIds) {
      try {
        await ctx.api.delete(`/llm-config/${configId}`);
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
  });
});
