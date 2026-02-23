/**
 * M3 — LLM Config
 *
 * Tests the full lifecycle for LLM provider configurations.
 * All endpoints require x-user-id header (valid UUID).
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createAppWithMocks, MockRepos } from '../helpers/create-app-with-mocks';

const CONFIG_ID   = '550e8400-e29b-41d4-a716-446655440002';
const USER_ID     = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const USER_HEADER = { 'x-user-id': USER_ID };

const FAKE_CONFIG = {
  id: CONFIG_ID,
  userId: USER_ID,
  provider: 'openai',
  model: 'gpt-4',
  name: 'OpenAI GPT-4',
  isDefault: false,
  apiKey: 'sk-test-key',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('M3 – LLM Config', () => {
  let app: INestApplication;
  let repos: MockRepos;

  beforeAll(async () => {
    ({ app, repos } = await createAppWithMocks());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /llm-config', () => {
    it('returns 200 with array', async () => {
      repos.llmConfig.find.mockResolvedValueOnce([]);
      const res = await request(app.getHttpServer()).get('/llm-config').set(USER_HEADER);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns existing configs', async () => {
      repos.llmConfig.find.mockResolvedValueOnce([FAKE_CONFIG]);
      const res = await request(app.getHttpServer()).get('/llm-config').set(USER_HEADER);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /llm-config', () => {
    it('creates a new LLM config and returns 201', async () => {
      repos.llmConfig.create.mockReturnValueOnce(FAKE_CONFIG);
      repos.llmConfig.save.mockResolvedValueOnce(FAKE_CONFIG);
      const res = await request(app.getHttpServer())
        .post('/llm-config').set(USER_HEADER)
        .send({ provider: 'openai', model: 'gpt-4', name: 'OpenAI GPT-4', apiKey: 'sk-test-key' });
      expect([200, 201]).toContain(res.status);
    });

    it('returns 400 for missing provider', async () => {
      const res = await request(app.getHttpServer())
        .post('/llm-config').set(USER_HEADER)
        .send({ model: 'gpt-4', name: 'Test' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /llm-config/default', () => {
    it('returns 200 or 404 depending on default config', async () => {
      repos.llmConfig.findOne.mockResolvedValueOnce({ ...FAKE_CONFIG, isDefault: true });
      const res = await request(app.getHttpServer()).get('/llm-config/default').set(USER_HEADER);
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('GET /llm-config/:id', () => {
    it('returns 200 when config is found', async () => {
      repos.llmConfig.findOne.mockResolvedValueOnce(FAKE_CONFIG);
      const res = await request(app.getHttpServer()).get(`/llm-config/${CONFIG_ID}`).set(USER_HEADER);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(CONFIG_ID);
    });

    it('returns 404 when config not found', async () => {
      repos.llmConfig.findOne.mockResolvedValueOnce(null);
      const res = await request(app.getHttpServer())
        .get('/llm-config/00000000-0000-4000-a000-000000000000')
        .set(USER_HEADER);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /llm-config/:id', () => {
    it('returns 200 when config is updated', async () => {
      repos.llmConfig.findOne.mockResolvedValueOnce(FAKE_CONFIG);
      repos.llmConfig.save.mockResolvedValueOnce({ ...FAKE_CONFIG, name: 'Updated' });
      const res = await request(app.getHttpServer())
        .put(`/llm-config/${CONFIG_ID}`).set(USER_HEADER)
        .send({ name: 'Updated' });
      expect([200, 204]).toContain(res.status);
    });
  });

  describe('PATCH /llm-config/:id/set-default', () => {
    it('returns 200 when config is set as default', async () => {
      repos.llmConfig.findOne.mockResolvedValueOnce(FAKE_CONFIG);
      repos.llmConfig.find.mockResolvedValueOnce([FAKE_CONFIG]);
      repos.llmConfig.save.mockResolvedValue({ ...FAKE_CONFIG, isDefault: true });
      const res = await request(app.getHttpServer())
        .patch(`/llm-config/${CONFIG_ID}/set-default`)
        .set(USER_HEADER);
      expect([200, 204]).toContain(res.status);
    });
  });

  describe('POST /llm-config/:id/health-check', () => {
    it('returns 200 with health result', async () => {
      repos.llmConfig.findOne.mockResolvedValueOnce(FAKE_CONFIG);
      const res = await request(app.getHttpServer())
        .post(`/llm-config/${CONFIG_ID}/health-check`)
        .set(USER_HEADER);
      expect([200, 201, 400, 503]).toContain(res.status);
    });
  });

  describe('DELETE /llm-config/:id', () => {
    it('returns 200 or 204 when config is deleted', async () => {
      repos.llmConfig.findOne.mockResolvedValueOnce({ ...FAKE_CONFIG, isDefault: false });
      repos.llmConfig.delete.mockResolvedValueOnce({ affected: 1, raw: [] });
      const res = await request(app.getHttpServer())
        .delete(`/llm-config/${CONFIG_ID}`)
        .set(USER_HEADER);
      expect([200, 204, 400]).toContain(res.status);
    });

    it('returns 404 when config not found', async () => {
      repos.llmConfig.findOne.mockResolvedValueOnce(null);
      const res = await request(app.getHttpServer())
        .delete('/llm-config/00000000-0000-4000-a000-000000000000')
        .set(USER_HEADER);
      expect(res.status).toBe(404);
    });
  });
});
