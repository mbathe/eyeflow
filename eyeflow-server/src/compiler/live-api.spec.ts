/**
 * Live API Integration Test
 * Tests the Task Execution API through HTTP endpoints using Supertest
 * 
 * Validates:
 * - API endpoints are accessible
 * - System info retrieval works
 * - Task execution through HTTP
 * - Response structure and data
 */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';

describe('Live Task Execution API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/tasks/info', () => {
    it('should return system information', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/tasks/info')
        .expect(200);

      console.log('\n🔍 SYSTEM INFO ENDPOINT:\n');
      console.log('Response:', JSON.stringify(response.body, null, 2));

      expect(response.body).toHaveProperty('availableActions');
      expect(response.body).toHaveProperty('availableServices');
      expect(response.body).toHaveProperty('connectors');
      expect(Array.isArray(response.body.availableActions)).toBe(true);
      expect(Array.isArray(response.body.availableServices)).toBe(true);
    });
  });

  describe('POST /api/tasks/quick-sentiment', () => {
    it('should execute sentiment analysis task', async () => {
      const taskRequest = {
        userId: 'user-api-test-001',
        text: 'I absolutely love this product! It is amazing and works perfectly.',
      };

      console.log('\n📝 SENTIMENT ANALYSIS REQUEST:');
      console.log('User ID:', taskRequest.userId);
      console.log('Text:', taskRequest.text);

      const response = await request(app.getHttpServer())
        .post('/api/tasks/quick-sentiment')
        .send(taskRequest)
        .expect(200);

      console.log('\n✅ SENTIMENT ANALYSIS RESPONSE:');
      console.log(JSON.stringify(response.body, null, 2));

      expect(response.body).toHaveProperty('taskId');
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('success');
      expect(response.body).toHaveProperty('compilationTime');
      expect(response.body).toHaveProperty('executionTime');
      expect(response.body).toHaveProperty('servicesUsed');
    });
  });

  describe('POST /api/tasks/execute', () => {
    it('should execute generic task (sentiment analysis)', async () => {
      const taskRequest = {
        userId: 'user-generic-001',
        action: 'analyze-sentiment',
        parameters: {
          text: 'This is fantastic news! I am very happy.',
        },
      };

      console.log('\n📝 GENERIC TASK EXECUTION REQUEST:');
      console.log('User ID:', taskRequest.userId);
      console.log('Action:', taskRequest.action);
      console.log('Parameters:', JSON.stringify(taskRequest.parameters, null, 2));

      const response = await request(app.getHttpServer())
        .post('/api/tasks/execute')
        .send(taskRequest)
        .expect(200);

      console.log('\n✅ GENERIC TASK EXECUTION RESPONSE:');
      console.log(JSON.stringify(response.body, null, 2));

      expect(response.body).toHaveProperty('taskId');
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('success');
    });

    it('should handle combined analysis (sentiment + github search)', async () => {
      const taskRequest = {
        userId: 'user-combined-001',
        action: 'combined-sentiment-github',
        parameters: {
          text: 'Great update!',
          query: 'awesome-projects',
        },
      };

      console.log('\n📝 COMBINED ANALYSIS REQUEST:');
      console.log('User ID:', taskRequest.userId);
      console.log('Action:', taskRequest.action);
      console.log('Parameters:', JSON.stringify(taskRequest.parameters, null, 2));

      const response = await request(app.getHttpServer())
        .post('/api/tasks/execute')
        .send(taskRequest)
        .expect(200);

      console.log('\n✅ COMBINED ANALYSIS RESPONSE:');
      console.log(JSON.stringify(response.body, null, 2));

      expect(response.body).toHaveProperty('taskId');
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('success');
      expect(response.body).toHaveProperty('servicesUsed');
      expect(Array.isArray(response.body.servicesUsed)).toBe(true);
    });

    it('should reject invalid action', async () => {
      const taskRequest = {
        userId: 'user-invalid-001',
        action: 'invalid-action-xyz',
        parameters: {},
      };

      console.log('\n❌ INVALID ACTION TEST:');
      console.log('Attempting action:', taskRequest.action);

      const response = await request(app.getHttpServer())
        .post('/api/tasks/execute')
        .send(taskRequest)
        .expect(200); // API returns 200 with error status

      console.log('\n✅ ERROR RESPONSE:');
      console.log(JSON.stringify(response.body, null, 2));

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('error');
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Multi-user concurrent execution', () => {
    it('should handle multiple users simultaneously', async () => {
      console.log('\n👥 CONCURRENT USERS TEST (3 users):');

      const users = [
        {
          userId: 'user-concurrent-001',
          text: 'Excellent work!',
        },
        {
          userId: 'user-concurrent-002',
          text: 'Great job, very satisfied.',
        },
        {
          userId: 'user-concurrent-003',
          text: 'Outstanding performance!',
        },
      ];

      console.log(`Sending ${users.length} requests in parallel...\n`);

      const startTime = performance.now();

      // Execute all requests in parallel
      const responses = await Promise.all(
        users.map((user) =>
          request(app.getHttpServer())
            .post('/api/tasks/quick-sentiment')
            .send(user)
            .expect(200),
        ),
      );

      const totalTime = performance.now() - startTime;

      console.log('📊 CONCURRENT EXECUTION RESULTS:\n');
      responses.forEach((response, index) => {
        console.log(`  User ${index + 1} (${users[index].userId}):`);
        console.log(`    Status: ${response.body.status}`);
        console.log(`    Task ID: ${response.body.taskId}`);
        console.log(`    Total Time: ${response.body.totalTime}ms`);
      });

      console.log(`\n  Total concurrent time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Average per request: ${(totalTime / users.length).toFixed(2)}ms`);

      responses.forEach((response) => {
        expect(response.body.status).toBe('success');
      });

      // Verify parallelism: concurrent should be faster than sequential
      const sequentialEstimate = responses.reduce(
        (sum, r) => sum + r.body.totalTime,
        0,
      );
      expect(totalTime).toBeLessThan(sequentialEstimate);
    });
  });

  describe('Performance baseline', () => {
    it('should execute tasks with acceptable latency', async () => {
      const repetitions = 5;
      const times: number[] = [];

      console.log(`\n⚡ PERFORMANCE BASELINE (${repetitions} runs):\n`);

      for (let i = 0; i < repetitions; i++) {
        const startTime = performance.now();

        await request(app.getHttpServer())
          .post('/api/tasks/quick-sentiment')
          .send({
            userId: `perf-test-${i}`,
            text: 'Performance test sentence.',
          })
          .expect(200);

        const elapsed = performance.now() - startTime;
        times.push(elapsed);

        console.log(`  Run ${i + 1}: ${elapsed.toFixed(2)}ms`);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);

      console.log(`\n  Average: ${avgTime.toFixed(2)}ms`);
      console.log(`  Min: ${minTime.toFixed(2)}ms`);
      console.log(`  Max: ${maxTime.toFixed(2)}ms`);

      // All executions should complete quickly
      expect(avgTime).toBeLessThan(1000); // Less than 1 second average
    });
  });
});
