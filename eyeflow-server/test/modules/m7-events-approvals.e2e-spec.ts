/**
 * M7 — Events & Approvals
 *
 * Tests the human-in-the-loop approval gateway:
 *   GET  /approvals           → list pending gates
 *   GET  /approvals/summary   → approval stats
 *   GET  /approvals/:gateId   → get specific gate
 *   POST /approvals/:gateId   → approve or reject
 *   DELETE /approvals/:gateId → cancel gate
 *
 * The HumanApprovalService is in-memory — no DB required.
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createAppWithMocks } from '../helpers/create-app-with-mocks';

const GATE_ID = 'approval-gate-test-001';

describe('M7 – Events & Approvals', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createAppWithMocks());
  });

  afterAll(async () => {
    await app.close();
  });

  // ── List ──────────────────────────────────────────────────────────────

  describe('GET /approvals', () => {
    it('returns 200 with array of pending gates', async () => {
      const res = await request(app.getHttpServer()).get('/approvals');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ── Summary ──────────────────────────────────────────────────────────

  describe('GET /approvals/summary', () => {
    it('returns 200 with summary object', async () => {
      const res = await request(app.getHttpServer()).get('/approvals/summary');
      expect(res.status).toBe(200);
      // summary() returns { pending: number, total: number }
      expect(res.body).toHaveProperty('pending');
    });
  });

  // ── Get specific gate ─────────────────────────────────────────────────

  describe('GET /approvals/:gateId', () => {
    it('returns 404 when gate does not exist', async () => {
      const res = await request(app.getHttpServer())
        .get(`/approvals/${GATE_ID}`);
      expect(res.status).toBe(404);
    });
  });

  // ── Approve / Reject ──────────────────────────────────────────────────

  describe('POST /approvals/:gateId', () => {
    it('returns 400 or 404 for unknown gate (validation runs before existence check)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/approvals/${GATE_ID}`)
        .send({ decision: 'APPROVED', decidedBy: 'tester', comment: 'Looks good' });
      // Gate doesn't exist → 404; or 400 if validation fires first
      expect([400, 404]).toContain(res.status);
    });
  });

  // ── Cancel ────────────────────────────────────────────────────────────

  describe('DELETE /approvals/:gateId', () => {
    it('returns 404 for unknown gate', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/approvals/${GATE_ID}`);
      expect(res.status).toBe(404);
    });
  });
});
