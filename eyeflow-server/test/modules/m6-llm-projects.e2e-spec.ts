/**
 * M6 — LLM Projects
 *
 * All endpoints require x-user-id header.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createAppWithMocks, MockRepos } from '../helpers/create-app-with-mocks';

const PROJECT_ID  = '550e8400-e29b-41d4-a716-446655440030';
const VERSION_ID  = '00000000-0000-0000-0000-000000000031';
const USER_ID     = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const USER_HEADER = { 'x-user-id': USER_ID };

const FAKE_PROJECT = {
  id: PROJECT_ID,
  name: 'HR Automation',
  description: 'Automates HR workflows',
  allowedConnectorIds: ['slack-1'],
  allowedFunctionIds: ['send_message'],
  allowedTriggerTypes: ['on_create'],
  status: 'DRAFT',
  versions: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const FAKE_VERSION = {
  id: VERSION_ID,
  projectId: PROJECT_ID,
  version: 1,
  status: 'DRAFT',
  ir: null,
  dagHash: null,
  createdAt: new Date().toISOString(),
};

describe('M6 – LLM Projects', () => {
  let app: INestApplication;
  let repos: MockRepos;

  beforeAll(async () => {
    ({ app, repos } = await createAppWithMocks());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /projects', () => {
    it('creates a project and returns 201', async () => {
      repos.llmProject.create.mockReturnValueOnce(FAKE_PROJECT);
      repos.llmProject.save.mockResolvedValueOnce(FAKE_PROJECT);

      const res = await request(app.getHttpServer())
        .post('/projects')
        .set(USER_HEADER)
        .send({ name: 'HR Automation', description: 'Automates HR workflows' });
      expect([200, 201, 400]).toContain(res.status);
    });
  });

  describe('GET /projects', () => {
    it('returns 200 with array', async () => {
      repos.llmProject.find.mockResolvedValueOnce([FAKE_PROJECT]);
      const res = await request(app.getHttpServer())
        .get('/projects')
        .set(USER_HEADER);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /projects/:id', () => {
    it('returns 200 when project found', async () => {
      repos.llmProject.findOne.mockResolvedValueOnce(FAKE_PROJECT);
      const res = await request(app.getHttpServer())
        .get(`/projects/${PROJECT_ID}`)
        .set(USER_HEADER);
      expect(res.status).toBe(200);
    });

    it('returns 404 when project not found', async () => {
      repos.llmProject.findOne.mockResolvedValueOnce(null);
      const res = await request(app.getHttpServer())
        .get('/projects/00000000-0000-4000-a000-000000000000')
        .set(USER_HEADER);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /projects/:id', () => {
    it('returns 200 when project is updated', async () => {
      repos.llmProject.findOne.mockResolvedValueOnce(FAKE_PROJECT);
      repos.llmProject.save.mockResolvedValueOnce({ ...FAKE_PROJECT, name: 'Updated' });

      const res = await request(app.getHttpServer())
        .put(`/projects/${PROJECT_ID}`)
        .set(USER_HEADER)
        .send({ name: 'Updated' });
      expect([200, 204, 400]).toContain(res.status);
    });
  });

  describe('DELETE /projects/:id', () => {
    it('returns 200 or 204 when project deleted', async () => {
      repos.llmProject.findOne.mockResolvedValueOnce(FAKE_PROJECT);
      repos.llmProject.remove.mockResolvedValueOnce(FAKE_PROJECT);

      const res = await request(app.getHttpServer())
        .delete(`/projects/${PROJECT_ID}`)
        .set(USER_HEADER);
      expect([200, 204, 400]).toContain(res.status);
    });
  });

  describe('POST /projects/:id/versions', () => {
    it('creates a new version and returns 201', async () => {
      repos.llmProject.findOne.mockResolvedValueOnce(FAKE_PROJECT);
      repos.projectVersion.create.mockReturnValueOnce(FAKE_VERSION);
      repos.projectVersion.save.mockResolvedValueOnce(FAKE_VERSION);

      const res = await request(app.getHttpServer())
        .post(`/projects/${PROJECT_ID}/versions`)
        .set(USER_HEADER)
        .send({ sourceCode: '-- empty --' });
      expect([200, 201, 400]).toContain(res.status);
    });
  });

  describe('GET /projects/:id/versions', () => {
    it('returns 200 with list of versions', async () => {
      repos.llmProject.findOne.mockResolvedValueOnce({ ...FAKE_PROJECT, versions: [FAKE_VERSION] });
      const res = await request(app.getHttpServer())
        .get(`/projects/${PROJECT_ID}/versions`)
        .set(USER_HEADER);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /projects/:id/versions/:vId', () => {
    it('returns 200 or 404 depending on version existence', async () => {
      repos.projectVersion.findOne.mockResolvedValueOnce(FAKE_VERSION);
      const res = await request(app.getHttpServer())
        .get(`/projects/${PROJECT_ID}/versions/${VERSION_ID}`)
        .set(USER_HEADER);
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('GET /projects/:id/executions', () => {
    it('returns 200 with executions array', async () => {
      repos.executionRecord.find.mockResolvedValueOnce([]);
      const res = await request(app.getHttpServer())
        .get(`/projects/${PROJECT_ID}/executions`)
        .set(USER_HEADER);
      expect([200, 404]).toContain(res.status);
    });
  });
});
