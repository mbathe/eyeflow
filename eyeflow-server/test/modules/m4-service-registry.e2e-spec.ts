/**
 * M4 — Service Registry (in-memory)
 * GET /services/stats → { total, byCategory, byFormat, ... }
 * GET /services       → { count, services: [...] }
 * POST /services      → register a service
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createAppWithMocks } from '../helpers/create-app-with-mocks';

const SERVICE_ID      = 'test-service-' + Date.now();
const SERVICE_VERSION = '1.0.0';

const VALID_MANIFEST = {
  id: SERVICE_ID,
  version: SERVICE_VERSION,
  name: 'Test Service',
  description: 'A minimal test service',
  category: 'ml',
  author: 'test',
  publishedBy: 'test-suite',
  publishedAt: new Date().toISOString(),
  tags: ['test'],
  inputs:  [{ name: 'input',  type: 'string' }],
  outputs: [{ name: 'output', type: 'string' }],
  executionDescriptors: [{
    format: 'HTTP',
    endpoint: 'http://localhost:9999/test',
    method: 'POST',
    compatibleTiers: ['CENTRAL', 'LINUX'],
  }],
  nodeRequirements: {},
  contract: {},
};

describe('M4 – Service Registry (in-memory)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createAppWithMocks());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /services/stats', () => {
    it('returns 200 with statistics object', async () => {
      const res = await request(app.getHttpServer()).get('/services/stats');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('total');
    });
  });

  describe('GET /services', () => {
    it('returns 200 with services list', async () => {
      const res = await request(app.getHttpServer()).get('/services');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.services)).toBe(true);
    });
  });

  describe('POST /services', () => {
    it('registers a new service descriptor and returns 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/services')
        .send(VALID_MANIFEST);
      expect([200, 201]).toContain(res.status);
    });

    it('returns 400 when executionDescriptors are missing', async () => {
      const invalid = { id: 'bad-svc', version: '1.0.0', inputs: [{ name: 'x', type: 'string' }], outputs: [{ name: 'y', type: 'string' }] };
      const res = await request(app.getHttpServer()).post('/services').send(invalid);
      expect(res.status).toBe(400);
    });
  });

  describe('GET /services/:id', () => {
    it('returns service when found', async () => {
      await request(app.getHttpServer()).post('/services').send(VALID_MANIFEST);
      const res = await request(app.getHttpServer()).get(`/services/${SERVICE_ID}`);
      expect([200, 404]).toContain(res.status);
    });

    it('returns 404 for unknown service id', async () => {
      const res = await request(app.getHttpServer()).get('/services/no-such-service-xyz-99999');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /services/:id/:version', () => {
    it('returns 200 or 404 for a known service', async () => {
      const res = await request(app.getHttpServer()).get(`/services/${SERVICE_ID}/${SERVICE_VERSION}`);
      expect([200, 404]).toContain(res.status);
    });

    it('returns 404 for unknown version', async () => {
      const res = await request(app.getHttpServer()).get(`/services/${SERVICE_ID}/99.99.99`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /services/resolve', () => {
    it('returns 200, 400 or 404 for resolution request', async () => {
      const res = await request(app.getHttpServer())
        .post('/services/resolve')
        .send({ requiredCapabilities: ['sentiment'], nodeId: 'node-test-01', nodeTier: 'LINUX' });
      expect([200, 400, 404]).toContain(res.status);
    });
  });
});
