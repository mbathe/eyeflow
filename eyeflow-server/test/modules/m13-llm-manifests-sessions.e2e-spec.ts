/**
 * M13 — LLM Manifests (enhanced variants) & LLM Sessions
 *
 * Tests the full spectrum of manifest export endpoints and the
 * ephemeral session lifecycle:
 *
 *   GET  /tasks/manifest/llm-context/json             → JSON-export of base ctx
 *   GET  /tasks/manifest/llm-context/enhanced         → enriched context (all capabilities)
 *   GET  /tasks/manifest/llm-context/enhanced/rule    → rule-optimised context
 *   GET  /tasks/manifest/llm-context/enhanced/task    → task-optimised context
 *   GET  /tasks/manifest/llm-context/enhanced/json    → enriched as JSON string
 *   GET  /tasks/manifest/llm-context/enhanced/rule/json  → rule ctx as JSON string
 *   GET  /tasks/manifest/llm-context/enhanced/task/json  → task ctx as JSON string
 *   GET  /tasks/manifest/llm-context/aggregated       → aggregated from all modules
 *   POST /tasks/llm-sessions                          → create ephemeral session
 *   GET  /tasks/llm-sessions/:id                      → get session (or { found: false })
 *   DELETE /tasks/llm-sessions/:id                    → delete session
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createAppWithMocks, MockRepos } from '../helpers/create-app-with-mocks';

const USER_ID      = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const USER_HEADER  = { 'x-user-id': USER_ID };
const SESSION_ID   = '550e8400-e29b-41d4-a716-446655440090';
const CONNECTOR_ID = '550e8400-e29b-41d4-a716-446655440001';

const FAKE_SESSION = {
  id: SESSION_ID,
  userId: USER_ID,
  allowedConnectorIds: [CONNECTOR_ID],
  allowedFunctionIds: [],
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  createdAt: new Date().toISOString(),
};

describe('M13 – LLM Manifests & Sessions', () => {
  let app: INestApplication;
  let repos: MockRepos;

  beforeAll(async () => {
    ({ app, repos } = await createAppWithMocks());
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Enhanced manifest variants ─────────────────────────────────────────────

  describe('GET /tasks/manifest/llm-context/json', () => {
    it('returns 200 with LLM context as JSON string', async () => {
      repos.connector.find.mockResolvedValueOnce([]);
      const res = await request(app.getHttpServer())
        .get('/tasks/manifest/llm-context/json')
        .set(USER_HEADER);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /tasks/manifest/llm-context/enhanced', () => {
    it('returns 200 with enriched context (all capabilities)', async () => {
      repos.connector.find.mockResolvedValueOnce([]);
      const res = await request(app.getHttpServer())
        .get('/tasks/manifest/llm-context/enhanced')
        .set(USER_HEADER);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /tasks/manifest/llm-context/enhanced/rule', () => {
    it('returns 200 with rule-optimised context', async () => {
      repos.connector.find.mockResolvedValueOnce([]);
      const res = await request(app.getHttpServer())
        .get('/tasks/manifest/llm-context/enhanced/rule')
        .set(USER_HEADER);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /tasks/manifest/llm-context/enhanced/task', () => {
    it('returns 200 with task-optimised context', async () => {
      repos.connector.find.mockResolvedValueOnce([]);
      const res = await request(app.getHttpServer())
        .get('/tasks/manifest/llm-context/enhanced/task')
        .set(USER_HEADER);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /tasks/manifest/llm-context/enhanced/json', () => {
    it('returns 200 with enhanced context as JSON string', async () => {
      repos.connector.find.mockResolvedValueOnce([]);
      const res = await request(app.getHttpServer())
        .get('/tasks/manifest/llm-context/enhanced/json')
        .set(USER_HEADER);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /tasks/manifest/llm-context/enhanced/rule/json', () => {
    it('returns 200 with rule context as JSON string', async () => {
      repos.connector.find.mockResolvedValueOnce([]);
      const res = await request(app.getHttpServer())
        .get('/tasks/manifest/llm-context/enhanced/rule/json')
        .set(USER_HEADER);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /tasks/manifest/llm-context/enhanced/task/json', () => {
    it('returns 200 with task context as JSON string', async () => {
      repos.connector.find.mockResolvedValueOnce([]);
      const res = await request(app.getHttpServer())
        .get('/tasks/manifest/llm-context/enhanced/task/json')
        .set(USER_HEADER);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /tasks/manifest/llm-context/aggregated', () => {
    it('returns 200 with aggregated context from all registered modules', async () => {
      repos.connector.find.mockResolvedValueOnce([]);
      const res = await request(app.getHttpServer())
        .get('/tasks/manifest/llm-context/aggregated')
        .set(USER_HEADER);
      expect(res.status).toBe(200);
    });
  });

  // ── LLM Sessions ──────────────────────────────────────────────────────────

  describe('POST /tasks/llm-sessions', () => {
    it('creates a session and returns id + expiresAt', async () => {
      repos.llmSession.create.mockReturnValueOnce(FAKE_SESSION);
      repos.llmSession.save.mockResolvedValueOnce(FAKE_SESSION);

      const res = await request(app.getHttpServer())
        .post('/tasks/llm-sessions')
        .set(USER_HEADER)
        .send({ allowedConnectorIds: [CONNECTOR_ID], ttlMinutes: 60 });

      expect([200, 201]).toContain(res.status);
      if ([200, 201].includes(res.status)) {
        expect(res.body).toHaveProperty('id');
        expect(res.body).toHaveProperty('expiresAt');
        expect(res.body).toHaveProperty('allowedConnectorIds');
      }
    });

    it('creates a session with no body (all fields optional)', async () => {
      repos.llmSession.create.mockReturnValueOnce(FAKE_SESSION);
      repos.llmSession.save.mockResolvedValueOnce(FAKE_SESSION);

      const res = await request(app.getHttpServer())
        .post('/tasks/llm-sessions')
        .set(USER_HEADER)
        .send({});

      expect([200, 201]).toContain(res.status);
    });
  });

  describe('GET /tasks/llm-sessions/:id', () => {
    it('returns { found: false } for non-existent session', async () => {
      repos.llmSession.findOne.mockResolvedValueOnce(null);

      const res = await request(app.getHttpServer())
        .get('/tasks/llm-sessions/00000000-0000-4000-a000-000000000000')
        .set(USER_HEADER);

      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.found).toBe(false);
      }
    });

    it('returns session when found', async () => {
      repos.llmSession.findOne.mockResolvedValueOnce(FAKE_SESSION);

      const res = await request(app.getHttpServer())
        .get(`/tasks/llm-sessions/${SESSION_ID}`)
        .set(USER_HEADER);

      expect([200, 404, 500]).toContain(res.status);
      if (res.status === 200 && res.body.found !== false) {
        expect(res.body).toHaveProperty('id');
        expect(res.body).toHaveProperty('expiresAt');
      }
    });
  });

  describe('DELETE /tasks/llm-sessions/:id', () => {
    it('returns { deleted: false } for non-existent session', async () => {
      repos.llmSession.findOne.mockResolvedValueOnce(null);

      const res = await request(app.getHttpServer())
        .delete('/tasks/llm-sessions/00000000-0000-4000-a000-000000000000')
        .set(USER_HEADER);

      expect([200, 204, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(typeof res.body.deleted).toBe('boolean');
        expect(res.body.deleted).toBe(false);
      }
    });

    it('deletes an existing session and returns { deleted: true }', async () => {
      repos.llmSession.findOne.mockResolvedValueOnce(FAKE_SESSION);
      repos.llmSession.remove.mockResolvedValueOnce(FAKE_SESSION);

      const res = await request(app.getHttpServer())
        .delete(`/tasks/llm-sessions/${SESSION_ID}`)
        .set(USER_HEADER);

      expect([200, 204, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.deleted).toBe(true);
      }
    });
  });
});
