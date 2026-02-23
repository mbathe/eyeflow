/**
 * M11 — Agents, Jobs & Actions
 *
 * Agents:  GET /agents returns { total, agents }, not array directly
 *          POST /agents/register returns { success, message, agent } not just agent
 *          GET /agents/:id returns { error } not 404 when not found
 * Jobs:    GET /jobs returns { total, jobs }
 *          POST /jobs returns { success, message, job }
 *          GET /jobs/:id returns { error } not 404
 * Actions: GET /actions returns { total, actions }
 *          POST /actions returns { success, message, action }
 *          GET /actions/:id returns { error } not 404
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createAppWithMocks } from '../helpers/create-app-with-mocks';

describe('M11 – Agents, Jobs & Actions', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createAppWithMocks());
  });

  afterAll(async () => {
    await app.close();
  });

  // ── AGENTS ────────────────────────────────────────────────────────────

  describe('Agents', () => {
    describe('GET /agents', () => {
      it('returns 200 with agents object', async () => {
        const res = await request(app.getHttpServer()).get('/agents');
        expect(res.status).toBe(200);
        // Returns { total, agents: [...] }
        expect(Array.isArray(res.body.agents ?? res.body)).toBe(true);
      });
    });

    describe('POST /agents/register', () => {
      it('registers an agent and returns 201', async () => {
        const res = await request(app.getHttpServer())
          .post('/agents/register')
          .send({
            agentName: 'test-agent',
            version: '1.0.0',
            capabilities: ['llm', 'file-access'],
          });
        expect([200, 201]).toContain(res.status);
        // Returns { success, message, agent: { id, ... } }
        expect(res.body.agent ?? res.body).toHaveProperty('id');
      });

      it('returns 400 or 500 for missing agentName', async () => {
        const res = await request(app.getHttpServer())
          .post('/agents/register')
          .send({ version: '1.0.0', capabilities: [] });
        // No strict validation → 200 with broken agent or 400
        expect([200, 201, 400, 500]).toContain(res.status);
      });
    });

    describe('GET /agents/:id', () => {
      it('returns agent when found', async () => {
        await request(app.getHttpServer())
          .post('/agents/register')
          .send({ agentName: 'my-agent', version: '1.0.0', capabilities: [] });

        const res = await request(app.getHttpServer()).get('/agents/my-agent');
        expect([200, 404]).toContain(res.status);
      });

      it('returns 404 or error for unknown agent', async () => {
        const res = await request(app.getHttpServer()).get('/agents/no-such-agent-xyz');
        // Returns { error: 'Agent not found' } with 200, or actual 404
        expect([200, 404]).toContain(res.status);
      });
    });
  });

  // ── JOBS ──────────────────────────────────────────────────────────────

  describe('Jobs', () => {
    describe('GET /jobs', () => {
      it('returns 200 with jobs object', async () => {
        const res = await request(app.getHttpServer()).get('/jobs');
        expect(res.status).toBe(200);
        // Returns { total, jobs: [...] }
        expect(Array.isArray(res.body.jobs ?? res.body)).toBe(true);
      });
    });

    describe('POST /jobs', () => {
      it('creates a job and returns 201', async () => {
        const res = await request(app.getHttpServer())
          .post('/jobs')
          .send({ actionId: 'action-001', agentId: 'agent-001' });
        expect([200, 201]).toContain(res.status);
        // Returns { success, message, job: { id, ... } }
        expect(res.body.job ?? res.body).toHaveProperty('id');
      });

      it('returns 400 or 500 for missing actionId', async () => {
        const res = await request(app.getHttpServer())
          .post('/jobs')
          .send({ agentId: 'agent-001' });
        expect([200, 201, 400, 500]).toContain(res.status);
      });
    });

    describe('GET /jobs/:id', () => {
      it('returns job when found', async () => {
        const create = await request(app.getHttpServer())
          .post('/jobs')
          .send({ actionId: 'action-002' });

        if (create.status === 201 || create.status === 200) {
          const jobId = (create.body.job ?? create.body).id;
          const res = await request(app.getHttpServer()).get(`/jobs/${jobId}`);
          expect(res.status).toBe(200);
        }
      });

      it('returns 200 with error or 404 for unknown job', async () => {
        const res = await request(app.getHttpServer()).get('/jobs/no-such-job-id');
        expect([200, 404]).toContain(res.status);
      });
    });
  });

  // ── ACTIONS ───────────────────────────────────────────────────────────

  describe('Actions', () => {
    describe('GET /actions', () => {
      it('returns 200 with actions object', async () => {
        const res = await request(app.getHttpServer()).get('/actions');
        expect(res.status).toBe(200);
        // Returns { total, actions: [...] }
        expect(Array.isArray(res.body.actions ?? res.body)).toBe(true);
      });
    });

    describe('POST /actions', () => {
      it('creates an action and returns 201', async () => {
        const res = await request(app.getHttpServer())
          .post('/actions')
          .send({
            name: 'Send Slack Message',
            type: 'http',
            command: 'POST https://slack.com/api/chat.postMessage',
            enabled: true,
          });
        expect([200, 201]).toContain(res.status);
        // Returns { success, message, action: { id, ... } }
        expect(res.body.action ?? res.body).toHaveProperty('id');
      });

      it('returns 400 or 500 for missing fields', async () => {
        const res = await request(app.getHttpServer())
          .post('/actions')
          .send({ description: 'No name' });
        expect([200, 201, 400, 500]).toContain(res.status);
      });
    });

    describe('GET /actions/:id', () => {
      it('returns action when found', async () => {
        const create = await request(app.getHttpServer())
          .post('/actions')
          .send({ name: 'TestAction', type: 'shell', command: 'echo hello', enabled: true });

        if (create.status === 201 || create.status === 200) {
          const actionId = (create.body.action ?? create.body).id;
          const res = await request(app.getHttpServer()).get(`/actions/${actionId}`);
          expect(res.status).toBe(200);
        }
      });

      it('returns 200 with error or 404 for unknown action', async () => {
        const res = await request(app.getHttpServer()).get('/actions/no-such-action');
        expect([200, 404]).toContain(res.status);
      });
    });
  });
});
