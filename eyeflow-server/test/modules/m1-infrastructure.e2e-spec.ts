/**
 * M1 — Infrastructure
 *
 * Validates core platform health endpoints:
 *   GET /health  → 200 { status: 'ok' }
 *   GET /api     → 200 (API info / welcome)
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createAppWithMocks } from '../helpers/create-app-with-mocks';

describe('M1 – Infrastructure', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createAppWithMocks());
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Health ─────────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ok' });
    });
  });

  // ── API info ───────────────────────────────────────────────────────────

  describe('GET /api', () => {
    it('returns 200', async () => {
      const res = await request(app.getHttpServer()).get('/api');
      expect(res.status).toBe(200);
    });
  });
});
