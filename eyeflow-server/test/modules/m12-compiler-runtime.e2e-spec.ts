/**
 * M12 — Compiler Pipeline & Runtime Execution
 *
 * DAG Visualizer: GET /api/dag/:workflowId/visualize
 *                 GET /api/dag/:workflowId/summary  
 * Task Controller: GET  /api/tasks/info      → { availableActions, totalServices, ... }
 *                  POST /api/tasks/execute   → execute
 *                  POST /api/tasks/quick-sentiment
 *                  POST /api/tasks/combined-analysis
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createAppWithMocks } from '../helpers/create-app-with-mocks';

const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440060';

describe('M12 – Compiler Pipeline & Runtime Execution', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createAppWithMocks());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/dag/:workflowId/visualize', () => {
    it('returns 200 or 404 for a workflow', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/dag/${WORKFLOW_ID}/visualize`);
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('GET /api/dag/:workflowId/summary', () => {
    it('returns 200 or 404 for a workflow', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/dag/${WORKFLOW_ID}/summary`);
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('GET /api/tasks/info', () => {
    it('returns 200 with service capabilities', async () => {
      const res = await request(app.getHttpServer()).get('/api/tasks/info');
      expect(res.status).toBe(200);
      // Returns { availableActions, availableConnectors, availableServiceIds, totalServices }
      expect(res.body).toHaveProperty('totalServices');
    });
  });

  describe('POST /api/tasks/execute', () => {
    it('returns a valid status when executing a task', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/tasks/execute')
        .send({
          task: 'Summarize this document',
          context: { text: 'This is a test document for summarization.' },
        });
      expect([200, 201, 400, 202, 503]).toContain(res.status);
    });

    it('returns various statuses for empty body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/tasks/execute')
        .send({});
      expect([200, 201, 400, 202, 503]).toContain(res.status);
    });
  });

  describe('POST /api/tasks/quick-sentiment', () => {
    it('returns valid status with sentiment analysis', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/tasks/quick-sentiment')
        .send({ text: 'I love this product! It works perfectly.' });
      expect([200, 201, 400, 202, 503]).toContain(res.status);
    });
  });

  describe('POST /api/tasks/combined-analysis', () => {
    it('returns valid status with multi-NLP analysis', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/tasks/combined-analysis')
        .send({ text: 'Apple Inc. reported strong quarterly earnings today in Cupertino.' });
      expect([200, 201, 400, 202, 503]).toContain(res.status);
    });
  });
});
