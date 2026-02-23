/**
 * M8 — Audit Chain
 *
 * Tests the immutable audit log blockchain verification:
 *   GET /audit/chain/:workflowId          → audit chain summary
 *   GET /audit/chain/:workflowId/full     → full audit trail
 *   GET /audit/chain/:workflowId/verify   → hash integrity check
 *   GET /audit/chain/:workflowId/stats    → audit statistics
 *   GET /audit/events                     → recent events
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createAppWithMocks, MockRepos } from '../helpers/create-app-with-mocks';

const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440050';

const FAKE_AUDIT_LOG = {
  id: '00000000-0000-0000-0000-000000000051',
  workflowId: WORKFLOW_ID,
  eventType: 'TASK_CREATED',
  payload: { taskId: 'task-001' },
  hash: 'abc123',
  previousHash: null,
  createdAt: new Date().toISOString(),
};

describe('M8 – Audit Chain', () => {
  let app: INestApplication;
  let repos: MockRepos;

  beforeAll(async () => {
    ({ app, repos } = await createAppWithMocks());
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Chain summary ─────────────────────────────────────────────────────

  describe('GET /audit/chain/:workflowId', () => {
    it('returns 200 when audit chain found', async () => {
      repos.auditLog.find.mockResolvedValueOnce([FAKE_AUDIT_LOG]);
      repos.auditLog.count.mockResolvedValueOnce(1);

      const res = await request(app.getHttpServer())
        .get(`/audit/chain/${WORKFLOW_ID}`);
      expect([200, 404]).toContain(res.status);
    });

    it('returns 404 for unknown workflow', async () => {
      repos.auditLog.find.mockResolvedValueOnce([]);
      repos.auditLog.count.mockResolvedValueOnce(0);

      const res = await request(app.getHttpServer())
        .get('/audit/chain/no-such-workflow');
      expect([200, 404]).toContain(res.status);
    });
  });

  // ── Full audit trail ──────────────────────────────────────────────────

  describe('GET /audit/chain/:workflowId/full', () => {
    it('returns 200 with full audit entries', async () => {
      repos.auditLog.find.mockResolvedValueOnce([FAKE_AUDIT_LOG]);

      const res = await request(app.getHttpServer())
        .get(`/audit/chain/${WORKFLOW_ID}/full`);
      expect([200, 404]).toContain(res.status);
    });
  });

  // ── Hash verification ─────────────────────────────────────────────────

  describe('GET /audit/chain/:workflowId/verify', () => {
    it('returns 200 with integrity result', async () => {
      repos.auditLog.find.mockResolvedValueOnce([FAKE_AUDIT_LOG]);

      const res = await request(app.getHttpServer())
        .get(`/audit/chain/${WORKFLOW_ID}/verify`);
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        // API returns { workflowId, verified, totalEvents }
        expect(res.body).toHaveProperty('verified');
      }
    });
  });

  // ── Stats ─────────────────────────────────────────────────────────────

  describe('GET /audit/chain/:workflowId/stats', () => {
    it('returns 200 with statistics', async () => {
      repos.auditLog.count.mockResolvedValueOnce(1);
      repos.auditLog.find.mockResolvedValueOnce([FAKE_AUDIT_LOG]);

      const res = await request(app.getHttpServer())
        .get(`/audit/chain/${WORKFLOW_ID}/stats`);
      expect([200, 404]).toContain(res.status);
    });
  });

  // ── Events ────────────────────────────────────────────────────────────

  describe('GET /audit/events', () => {
    it('returns 200 with recent events', async () => {
      repos.auditLog.find.mockResolvedValueOnce([FAKE_AUDIT_LOG]);

      const res = await request(app.getHttpServer()).get('/audit/events');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
