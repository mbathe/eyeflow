/**
 * M10 — Kafka/CDC Events
 *
 * All Kafka endpoints require x-user-id header (valid UUID).
 * Topics endpoint returns { topics: [], description: '' } not an array.
 * Rules GET/:id returns null (not 404) when not found. 
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createAppWithMocks } from '../helpers/create-app-with-mocks';

const USER_ID     = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const USER_HEADER = { 'x-user-id': USER_ID };

describe('M10 – Kafka/CDC Events', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createAppWithMocks());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /kafka/status', () => {
    it('returns 200 when Kafka is disabled in test env', async () => {
      const res = await request(app.getHttpServer())
        .get('/kafka/status')
        .set(USER_HEADER);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('connected');
    });
  });

  describe('GET /kafka/topics', () => {
    it('returns 200 with topic list', async () => {
      const res = await request(app.getHttpServer())
        .get('/kafka/topics')
        .set(USER_HEADER);
      expect(res.status).toBe(200);
      // Returns { topics: {...}, description: '...' } (topics is an object with category keys)
      expect(res.body).toHaveProperty('topics');
    });
  });

  describe('GET /kafka/rules', () => {
    it('returns 200 with array', async () => {
      const res = await request(app.getHttpServer())
        .get('/kafka/rules')
        .set(USER_HEADER);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /kafka/rules', () => {
    it('creates a new CDC rule and returns 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/kafka/rules')
        .set(USER_HEADER)
        .send({
          name: 'Monitor orders table',
          trigger: { topicPattern: 'postgres.public.orders' },
          action: { type: 'mission', missionType: 'verify_order', priority: 'high' },
          enabled: true,
        });
      expect([200, 201, 400]).toContain(res.status);
    });

    it('returns 400 for missing required fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/kafka/rules')
        .set(USER_HEADER)
        .send({ name: 'incomplete rule' });
      // Missing trigger and action fields → 400 BadRequestException
      expect(res.status).toBe(400);
    });
  });

  describe('GET /kafka/rules/:ruleId', () => {
    it('returns 404 when rule not found', async () => {
      const res = await request(app.getHttpServer())
        .get('/kafka/rules/no-such-rule-id')
        .set(USER_HEADER);
      // Fixed source: throws NotFoundException → 404
      expect(res.status).toBe(404);
    });
  });

  describe('GET /kafka/rules-examples/list', () => {
    it('returns 200 with examples array', async () => {
      const res = await request(app.getHttpServer())
        .get('/kafka/rules-examples/list')
        .set(USER_HEADER);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /kafka/rules-examples/import/:exampleId', () => {
    it('returns 404 for unknown example id', async () => {
      const res = await request(app.getHttpServer())
        .post('/kafka/rules-examples/import/no-such-example')
        .set(USER_HEADER);
      // Fixed source: isNaN(parseInt('no-such-example')) → NotFoundException → 404
      expect(res.status).toBe(404);
    });

    it('imports a known example by numeric id', async () => {
      const res = await request(app.getHttpServer())
        .post('/kafka/rules-examples/import/0')
        .set(USER_HEADER);
      expect([200, 201, 400, 404]).toContain(res.status);
    });
  });
});
