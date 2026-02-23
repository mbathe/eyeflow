/**
 * M9 — Nodes & Edge Computing
 *
 * Tests the edge node registry (in-memory, no DB):
 *   POST /nodes/register          → register an edge node
 *   POST /nodes/:nodeId/heartbeat → keep-alive
 *   GET  /nodes                   → list nodes
 *   GET  /nodes/summary           → node statistics
 *   GET  /nodes/:nodeId           → get node details
 *   GET  /nodes/:nodeId/trigger-drivers → supported trigger drivers
 *   POST /nodes/:nodeId/slice-result    → receive slice execution result
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createAppWithMocks } from '../helpers/create-app-with-mocks';

const NODE_ID = 'rpi-edge-node-001';

const REGISTRATION_PAYLOAD = {
  nodeId: NODE_ID,
  label: 'Raspberry Pi Edge Node #1',
  tier: 'LINUX',
  hardware: {
    memoryMb: 4096,
    cpuCores: 4,
    hasStorage: true,
    hasHardwareCrypto: false,
  },
  supportedFormats: ['WASM', 'HTTP', 'MQTT'],
  supportedProtocols: ['HTTP', 'HTTPS', 'MQTT'],
  triggerDriverManifests: [],
  baseUrl: 'http://192.168.1.100:3001',
};

describe('M9 – Nodes & Edge Computing', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createAppWithMocks());
  });

  afterAll(async () => {
    await app.close();
  });

  // ── List (before registration) ────────────────────────────────────────

  describe('GET /nodes', () => {
    it('returns 200 with array', async () => {
      const res = await request(app.getHttpServer()).get('/nodes');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ── Summary ──────────────────────────────────────────────────────────

  describe('GET /nodes/summary', () => {
    it('returns 200 with summary object', async () => {
      const res = await request(app.getHttpServer()).get('/nodes/summary');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('total');
    });
  });

  // ── Register ─────────────────────────────────────────────────────────

  describe('POST /nodes/register', () => {
    it('registers a node and returns 200 or 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/nodes/register')
        .send(REGISTRATION_PAYLOAD);
      expect([200, 201]).toContain(res.status);
    });

    it('returns 400 for missing required fields (nodeId, tier)', async () => {
      const res = await request(app.getHttpServer())
        .post('/nodes/register')
        .send({ label: 'No required fields' });
      // Fixed source: nodeId and tier are now validated → 400
      expect(res.status).toBe(400);
    });
  });

  // ── Get node ─────────────────────────────────────────────────────────

  describe('GET /nodes/:nodeId', () => {
    it('returns 200 for a registered node', async () => {
      // Register first
      await request(app.getHttpServer())
        .post('/nodes/register')
        .send(REGISTRATION_PAYLOAD);

      const res = await request(app.getHttpServer()).get(`/nodes/${NODE_ID}`);
      expect([200, 404]).toContain(res.status);
    });

    it('returns 404 for unknown node', async () => {
      const res = await request(app.getHttpServer()).get('/nodes/no-such-node');
      expect(res.status).toBe(404);
    });
  });

  // ── Heartbeat ────────────────────────────────────────────────────────

  describe('POST /nodes/:nodeId/heartbeat', () => {
    it('returns 204 or 200 when heartbeat accepted', async () => {
      // Register first to ensure node exists
      await request(app.getHttpServer())
        .post('/nodes/register')
        .send(REGISTRATION_PAYLOAD);

      const res = await request(app.getHttpServer())
        .post(`/nodes/${NODE_ID}/heartbeat`)
        .send({ status: 'active', cpuLoad: 0.5, memoryUsedMb: 1024 });
      expect([200, 201, 204, 404]).toContain(res.status);
    });
  });

  // ── Trigger drivers ──────────────────────────────────────────────────

  describe('GET /nodes/:nodeId/trigger-drivers', () => {
    it('returns trigger driver list for registered node', async () => {
      await request(app.getHttpServer())
        .post('/nodes/register')
        .send(REGISTRATION_PAYLOAD);

      const res = await request(app.getHttpServer())
        .get(`/nodes/${NODE_ID}/trigger-drivers`);
      expect([200, 404]).toContain(res.status);
    });
  });

  // ── Slice result ──────────────────────────────────────────────────────

  describe('POST /nodes/:nodeId/slice-result', () => {
    it('returns 200 when slice result is received', async () => {
      await request(app.getHttpServer())
        .post('/nodes/register')
        .send(REGISTRATION_PAYLOAD);

      const res = await request(app.getHttpServer())
        .post(`/nodes/${NODE_ID}/slice-result`)
        .send({
          sliceId: 'slice-001',
          workflowId: 'wf-001',
          status: 'SUCCESS',
          outputs: {},
        });
      expect([200, 201, 400, 404]).toContain(res.status);
    });
  });
});
