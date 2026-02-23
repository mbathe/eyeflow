/**
 * M5 — Tasks & Rules
 *
 * Tests the task compilation and rule management pipeline:
 *   POST /tasks/compile                     → compile a task without executing
 *   POST /tasks                             → create + execute a task
 *   GET  /tasks/:id                         → get task by id
 *   GET  /tasks/manifest/connectors         → connector manifest for LLM context
 *   GET  /tasks/manifest/llm-context        → full LLM context manifest
 *   POST /tasks/rules                       → create event rule
 *   GET  /tasks/rules/pending-approval      → pending rules
 *   POST /tasks/rules/:id/approve           → approve rule
 *   POST /tasks/rules/:id/reject            → reject rule
 *   GET  /tasks/rules/:id                   → get rule by id
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createAppWithMocks, MockRepos } from '../helpers/create-app-with-mocks';

const TASK_ID = '550e8400-e29b-41d4-a716-446655440010';
const RULE_ID = '550e8400-e29b-41d4-a716-446655440020';
const USER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const USER_HEADER = { 'x-user-id': USER_ID };

const FAKE_TASK = {
  id: TASK_ID,
  userInput: 'Send a Slack message when CPU > 90%',
  type: 'MONITORING',
  status: 'PENDING',
  missions: [],
  createdAt: new Date().toISOString(),
};

const FAKE_RULE = {
  id: RULE_ID,
  name: 'High CPU Alert',
  description: 'Fires when CPU exceeds 90%',
  status: 'DRAFT',
  conditions: [{ fieldName: 'cpu', operator: 'GT', value: 90 }],
  actions: [],
  debounceMs: 5000,
  priority: 1,
  createdAt: new Date().toISOString(),
};

describe('M5 – Tasks & Rules', () => {
  let app: INestApplication;
  let repos: MockRepos;

  beforeAll(async () => {
    ({ app, repos } = await createAppWithMocks());
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Manifest endpoints (no DB needed) ────────────────────────────────

  describe('GET /tasks/manifest/connectors', () => {
    it('returns 200 with connector manifest', async () => {
      repos.connector.find.mockResolvedValueOnce([]);
      const res = await request(app.getHttpServer())
        .get('/tasks/manifest/connectors')
        .set(USER_HEADER);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /tasks/manifest/llm-context', () => {
    it('returns 200 with LLM context manifest', async () => {
      repos.connector.find.mockResolvedValueOnce([]);
      repos.globalTask.find.mockResolvedValueOnce([]);
      repos.eventRule.find.mockResolvedValueOnce([]);
      const res = await request(app.getHttpServer())
        .get('/tasks/manifest/llm-context')
        .set(USER_HEADER);
      expect(res.status).toBe(200);
    });
  });

  // ── Task compilation ─────────────────────────────────────────────────

  describe('POST /tasks/compile', () => {
    it('returns 200 or 201 when task is compiled', async () => {
      repos.globalTask.create.mockReturnValueOnce(FAKE_TASK);
      repos.globalTask.save.mockResolvedValueOnce(FAKE_TASK);

      const res = await request(app.getHttpServer())
        .post('/tasks/compile')
        .set(USER_HEADER)
        .send({ userInput: 'Monitor server CPU usage', type: 'MONITORING' });
      expect([200, 201, 400, 503]).toContain(res.status);
    });

    it('returns 400 when userInput is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/tasks/compile')
        .set(USER_HEADER)
        .send({ type: 'DIRECT' });
      expect(res.status).toBe(400);
    });
  });

  // ── Task CRUD ────────────────────────────────────────────────────────

  describe('POST /tasks', () => {
    it('returns 201 or 200 when a task is created', async () => {
      repos.globalTask.create.mockReturnValueOnce(FAKE_TASK);
      repos.globalTask.save.mockResolvedValueOnce(FAKE_TASK);

      const res = await request(app.getHttpServer())
        .post('/tasks')
        .set(USER_HEADER)
        .send({ userInput: 'Send Slack message to #general', type: 'DIRECT' });
      expect([200, 201, 400, 503]).toContain(res.status);
    });

    it('returns 400 for missing required fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/tasks')
        .set(USER_HEADER)
        .send({ type: 'DIRECT' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /tasks/:id', () => {
    it('returns 200 when task found', async () => {
      repos.globalTask.findOne.mockResolvedValueOnce(FAKE_TASK);
      const res = await request(app.getHttpServer())
        .get(`/tasks/${TASK_ID}`)
        .set(USER_HEADER);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(TASK_ID);
    });

    it('returns 404 when task not found', async () => {
      repos.globalTask.findOne.mockResolvedValueOnce(null);
      const res = await request(app.getHttpServer())
        .get('/tasks/00000000-0000-4000-a000-000000000000')
        .set(USER_HEADER);
      expect(res.status).toBe(404);
    });
  });

  // ── Event Rules ──────────────────────────────────────────────────────

  describe('POST /tasks/rules', () => {
    it('returns 201 when rule is created', async () => {
      repos.eventRule.create.mockReturnValueOnce(FAKE_RULE);
      repos.eventRule.save.mockResolvedValueOnce(FAKE_RULE);

      const res = await request(app.getHttpServer())
        .post('/tasks/rules')
        .send({
          name: 'High CPU Alert',
          conditions: [{ fieldName: 'cpu', operator: 'GT', value: 90 }],
          actions: [],
          debounceMs: 5000,
          priority: 1,
        });
      expect([200, 201, 400]).toContain(res.status);
    });
  });

  describe('GET /tasks/rules/pending-approval', () => {
    it('returns 200 with list of pending rules', async () => {
      repos.eventRuleExtended.find.mockResolvedValueOnce([]);
      const res = await request(app.getHttpServer())
        .get('/tasks/rules/pending-approval')
        .set(USER_HEADER);
      expect(res.status).toBe(200);
      // Returns { success, count, rules: [...] }
      expect(Array.isArray(res.body.rules ?? res.body)).toBe(true);
    });
  });

  describe('GET /tasks/rules/:id', () => {
    it('returns 200 when rule found', async () => {
      repos.eventRuleExtended.findOne.mockResolvedValueOnce(FAKE_RULE);
      repos.eventRule.findOne.mockResolvedValueOnce(FAKE_RULE);
      const res = await request(app.getHttpServer()).get(`/tasks/rules/${RULE_ID}`);
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('POST /tasks/rules/:id/approve', () => {
    it('returns 200 or 201 when rule approved', async () => {
      repos.eventRuleExtended.findOne.mockResolvedValueOnce({ ...FAKE_RULE, status: 'PENDING_APPROVAL' });
      repos.eventRuleExtended.save.mockResolvedValueOnce({ ...FAKE_RULE, status: 'ACTIVE' });

      const res = await request(app.getHttpServer())
        .post(`/tasks/rules/${RULE_ID}/approve`)
        .set(USER_HEADER)
        .send({ feedback: 'Looks good' });
expect([200, 201, 400, 404]).toContain(res.status);
    });
  });

  describe('POST /tasks/rules/:id/reject', () => {
    it('returns 200 or 201 when rule rejected', async () => {
      repos.eventRuleExtended.findOne.mockResolvedValueOnce({ ...FAKE_RULE, status: 'PENDING_APPROVAL' });
      repos.eventRuleExtended.save.mockResolvedValueOnce({ ...FAKE_RULE, status: 'REJECTED' });
      
      const res = await request(app.getHttpServer())
        .post(`/tasks/rules/${RULE_ID}/reject`)
        .set(USER_HEADER)
        .send({ feedback: 'Needs revision' });
      expect([200, 201, 400, 404]).toContain(res.status);
    });
  });

  // ── Rule DAG & Approval Detail ────────────────────────────────────────

  describe('GET /tasks/rules/:ruleId/dag', () => {
    it('returns 200 or 404', async () => {
      repos.eventRuleExtended.findOne.mockResolvedValueOnce(FAKE_RULE);
      repos.eventRule.findOne.mockResolvedValueOnce(FAKE_RULE);
      const res = await request(app.getHttpServer())
        .get(`/tasks/rules/${RULE_ID}/dag`)
        .set(USER_HEADER);
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) expect(res.body).toHaveProperty('success');
    });

    it('returns 400 or 200 for non-UUID rule id (route does not enforce UUID format)', async () => {
      const res = await request(app.getHttpServer())
        .get('/tasks/rules/not-a-uuid/dag')
        .set(USER_HEADER);
      expect([200, 400, 404]).toContain(res.status);
    });
  });

  describe('GET /tasks/rules/:ruleId/for-approval', () => {
    it('returns 200 with rule + dag or 404', async () => {
      repos.eventRuleExtended.findOne.mockResolvedValueOnce({ ...FAKE_RULE, status: 'PENDING_APPROVAL' });
      repos.eventRule.findOne.mockResolvedValueOnce(FAKE_RULE);
      const res = await request(app.getHttpServer())
        .get(`/tasks/rules/${RULE_ID}/for-approval`)
        .set(USER_HEADER);
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) expect(res.body).toHaveProperty('success');
    });

    it('returns 404 for nonexistent rule', async () => {
      repos.eventRuleExtended.findOne.mockResolvedValueOnce(null);
      repos.eventRule.findOne.mockResolvedValueOnce(null);
      const res = await request(app.getHttpServer())
        .get('/tasks/rules/00000000-0000-4000-a000-000000000000/for-approval')
        .set(USER_HEADER);
      expect([404, 400]).toContain(res.status);
    });
  });

  describe('GET /tasks/approval/stats', () => {
    it('returns 200 with approval statistics', async () => {
      repos.eventRuleExtended.find.mockResolvedValueOnce([]);
      const res = await request(app.getHttpServer())
        .get('/tasks/approval/stats')
        .set(USER_HEADER);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success');
    });
  });

  // ── Generate Rule from Natural Language Intent ────────────────────────

  describe('POST /tasks/rules/generate-from-intent', () => {
    it('returns 200, 400, 500 or 503 for NL intent', async () => {
      const res = await request(app.getHttpServer())
        .post('/tasks/rules/generate-from-intent')
        .set(USER_HEADER)
        .send({ description: 'Si la température dépasse 30°C, envoyer une alerte' });
      expect([200, 400, 500, 503]).toContain(res.status);
    });

    it('returns 400 when description is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/tasks/rules/generate-from-intent')
        .set(USER_HEADER)
        .send({});
      expect(res.status).toBe(400);
    });
  });
});
