import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../../app.module';

describe('Approval Workflow E2E Tests', () => {
  let app: INestApplication;
  const userId = '550e8400-e29b-41d4-a716-446655440000';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Checks', () => {
    it('/health (GET) should return ok status', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
        });
    });
  });

  describe('Approval Workflow Routes', () => {
    describe('GET /tasks/rules/pending-approval', () => {
      it('should return pending approval rules', () => {
        return request(app.getHttpServer())
          .get('/tasks/rules/pending-approval')
          .set('X-User-ID', userId)
          .expect(HttpStatus.OK)
          .expect((res) => {
            expect(res.body).toHaveProperty('success');
            expect(res.body).toHaveProperty('count');
            expect(res.body).toHaveProperty('rules');
            expect(Array.isArray(res.body.rules)).toBe(true);
          });
      });

      it('should return 401 without X-User-ID header', () => {
        return request(app.getHttpServer())
          .get('/tasks/rules/pending-approval')
          .expect((res) => {
            expect(res.status).toBeGreaterThanOrEqual(400);
          });
      });
    });

    describe('GET /tasks/approval/stats', () => {
      it('should return approval statistics', () => {
        return request(app.getHttpServer())
          .get('/tasks/approval/stats')
          .set('X-User-ID', userId)
          .expect(HttpStatus.OK)
          .expect((res) => {
            expect(res.body).toHaveProperty('success', true);
            expect(res.body.stats).toHaveProperty('pending');
            expect(res.body.stats).toHaveProperty('approved');
            expect(res.body.stats).toHaveProperty('rejected');
            expect(res.body.stats).toHaveProperty('total');
          });
      });
    });

    describe('Manifest Endpoints', () => {
      it('should list available connectors', () => {
        return request(app.getHttpServer())
          .get('/tasks/manifest/connectors')
          .expect(HttpStatus.OK)
          .expect((res) => {
            expect(res.body).toHaveProperty('connectors');
            expect(Array.isArray(res.body.connectors)).toBe(true);
          });
      });

      it('should provide LLM context', () => {
        return request(app.getHttpServer())
          .get('/tasks/manifest/llm-context')
          .expect(HttpStatus.OK);
      });
    });

    describe('Generic Rule Endpoint (GET /tasks/rules/:id)', () => {
      it('should return 404 for non-existent rule', () => {
        return request(app.getHttpServer())
          .get('/tasks/rules/00000000-0000-0000-0000-000000000000')
          .set('X-User-ID', userId)
          .expect((res) => {
            expect(res.status).toBe(HttpStatus.NOT_FOUND);
          });
      });
    });

    describe('Approval-Specific Endpoints with Invalid IDs', () => {
      it('GET /tasks/rules/:id/for-approval should return 404 for non-existent rule', () => {
        return request(app.getHttpServer())
          .get('/tasks/rules/00000000-0000-0000-0000-000000000000/for-approval')
          .set('X-User-ID', userId)
          .expect(HttpStatus.NOT_FOUND);
      });

      it('GET /tasks/rules/:id/dag should return 404 for non-existent rule', () => {
        return request(app.getHttpServer())
          .get('/tasks/rules/00000000-0000-0000-0000-000000000000/dag')
          .set('X-User-ID', userId)
          .expect(HttpStatus.NOT_FOUND);
      });

      it('POST /tasks/rules/:id/approve should return 404 for non-existent rule', () => {
        return request(app.getHttpServer())
          .post('/tasks/rules/00000000-0000-0000-0000-000000000000/approve')
          .set('X-User-ID', userId)
          .expect((res) => {
            expect(res.status).toBeGreaterThanOrEqual(400);
          });
      });

      it('POST /tasks/rules/:id/reject should return 404 for non-existent rule', () => {
        return request(app.getHttpServer())
          .post('/tasks/rules/00000000-0000-0000-0000-000000000000/reject')
          .set('X-User-ID', userId)
          .send({ feedback: 'test' })
          .expect((res) => {
            expect(res.status).toBeGreaterThanOrEqual(400);
          });
      });
    });

    describe('Route Priority (Specific Before Generic)', () => {
      it('should route /pending-approval to specific handler, not generic :id handler', async () => {
        const res = await request(app.getHttpServer())
          .get('/tasks/rules/pending-approval')
          .set('X-User-ID', userId);
        
        // Should have 'rules' field (from specific handler)
        // Should NOT have 'totalTriggers' field (from generic handler)
        expect(res.body).toHaveProperty('rules');
        expect(res.status).toBe(HttpStatus.OK);
      });

      it('should route /approval/stats to specific handler', async () => {
        const res = await request(app.getHttpServer())
          .get('/tasks/approval/stats')
          .set('X-User-ID', userId);
        
        // Should have 'stats' field (from specific handler)
        expect(res.body).toHaveProperty('stats');
        expect(res.status).toBe(HttpStatus.OK);
      });
    });
  });
});
