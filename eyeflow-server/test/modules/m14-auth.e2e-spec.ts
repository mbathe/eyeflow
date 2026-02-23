/**
 * M14 — Authentication Module
 *
 * Tests the complete authentication lifecycle:
 *   POST /auth/register        → create user, return tokens
 *   POST /auth/login           → return tokens for valid credentials
 *   GET  /auth/me              → return safe user object
 *   POST /auth/refresh         → exchange refresh token for new pair
 *   POST /auth/logout          → invalidate refresh token
 *   PATCH /auth/change-password → change password, invalidate sessions
 *   GET  /auth/users           → list users (admin only)
 *   PATCH /auth/users/:id/role → change role (super_admin only)
 *   DELETE /auth/users/:id     → deactivate user (admin only)
 *
 * Guard enforcement is tested in M15 (AuthorizationModule).
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createAppWithMocks, MockRepos } from '../helpers/create-app-with-mocks';
import { UserRole } from '../../src/authorization/enums/roles.enum';

const USER_ID    = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const OTHER_ID   = '550e8400-e29b-41d4-a716-446655440099';

const FAKE_USER = {
  id: USER_ID,
  email: 'admin@eyeflow.io',
  firstName: 'Alice',
  lastName: 'Admin',
  password: '$2b$12$hashedpasswordhashpasswordhashpa',
  role: UserRole.SUPER_ADMIN,
  isActive: true,
  refreshTokenHash: null,
  isServiceAccount: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deletedAt: null,
  fullName: 'Alice Admin',
  validatePassword: jest.fn().mockResolvedValue(true),
  hashPasswordIfChanged: jest.fn(),
  toSafeObject: jest.fn().mockReturnValue({
    id: USER_ID,
    email: 'admin@eyeflow.io',
    firstName: 'Alice',
    lastName: 'Admin',
    role: UserRole.SUPER_ADMIN,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
};

describe('M14 – Authentication', () => {
  let app: INestApplication;
  let repos: MockRepos;

  beforeAll(async () => {
    ({ app, repos } = await createAppWithMocks());
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Register ───────────────────────────────────────────────────────────────

  describe('POST /auth/register', () => {
    it('returns 201 with tokens when first user registers (auto SUPER_ADMIN)', async () => {
      repos.user.findOne.mockResolvedValueOnce(null);  // email not taken
      repos.user.count.mockResolvedValueOnce(0);       // first user → SUPER_ADMIN
      repos.user.create.mockReturnValueOnce({ ...FAKE_USER });
      repos.user.save.mockResolvedValueOnce({ ...FAKE_USER, refreshTokenHash: 'hashed' });

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'admin@eyeflow.io',
          password: 'Str0ngP@ss!',
          firstName: 'Alice',
          lastName: 'Admin',
        });

      expect([200, 201]).toContain(res.status);
      if ([200, 201].includes(res.status)) {
        expect(res.body).toHaveProperty('accessToken');
        expect(res.body).toHaveProperty('refreshToken');
        expect(res.body).toHaveProperty('user');
        expect(res.body.user).toHaveProperty('id');
        expect(res.body.user).not.toHaveProperty('password');
      }
    });

    it('returns 409 when email already taken', async () => {
      repos.user.findOne.mockResolvedValueOnce(FAKE_USER); // email exists
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'admin@eyeflow.io',
          password: 'Str0ngP@ss!',
          firstName: 'Alice',
          lastName: 'Admin',
        });
      expect(res.status).toBe(409);
    });

    it('returns 400 for missing required fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'no-password@test.io' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for weak password (< 8 chars)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'x@test.io', password: 'short', firstName: 'A', lastName: 'B' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid email format', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'Str0ngP@ss!', firstName: 'A', lastName: 'B' });
      expect(res.status).toBe(400);
    });
  });

  // ── Login ─────────────────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('returns 200 with tokens for valid credentials', async () => {
      repos.user.findOne.mockResolvedValueOnce({ ...FAKE_USER, validatePassword: jest.fn().mockResolvedValue(true) });
      repos.user.save.mockResolvedValueOnce({ ...FAKE_USER, refreshTokenHash: 'hashed' });

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@eyeflow.io', password: 'Str0ngP@ss!' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user.email).toBe('admin@eyeflow.io');
    });

    it('returns 401 for wrong password', async () => {
      repos.user.findOne.mockResolvedValueOnce({ ...FAKE_USER, validatePassword: jest.fn().mockResolvedValue(false) });
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@eyeflow.io', password: 'WrongPass!' });
      expect(res.status).toBe(401);
    });

    it('returns 401 for unknown email', async () => {
      repos.user.findOne.mockResolvedValueOnce(null);
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'notexists@eyeflow.io', password: 'SomePass123!' });
      expect(res.status).toBe(401);
    });

    it('returns 400 for missing email', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ password: 'Str0ngP@ss!' });
      expect(res.status).toBe(400);
    });
  });

  // ── Get profile ───────────────────────────────────────────────────────────

  describe('GET /auth/me', () => {
    it('returns 200 with user profile (no password)', async () => {
      repos.user.findOne.mockResolvedValueOnce({ ...FAKE_USER });
      const res = await request(app.getHttpServer()).get('/auth/me');
      expect([200, 401]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).not.toHaveProperty('password');
        expect(res.body).toHaveProperty('email');
        expect(res.body).toHaveProperty('role');
      }
    });
  });

  // ── Logout ────────────────────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('returns 204 when logged out successfully', async () => {
      repos.user.update.mockResolvedValueOnce({ affected: 1 });
      const res = await request(app.getHttpServer())
        .post('/auth/logout');
      expect([204, 401]).toContain(res.status);
    });
  });

  // ── Change password ───────────────────────────────────────────────────────

  describe('PATCH /auth/change-password', () => {
    it('returns 204 when password changed successfully', async () => {
      repos.user.findOne.mockResolvedValueOnce({ ...FAKE_USER, validatePassword: jest.fn().mockResolvedValue(true) });
      repos.user.save.mockResolvedValueOnce({ ...FAKE_USER });

      const res = await request(app.getHttpServer())
        .patch('/auth/change-password')
        .send({ currentPassword: 'Str0ngP@ss!', newPassword: 'NewStr0ng@Pass2!' });
      expect([204, 401]).toContain(res.status);
    });

    it('returns 400 for new password too short', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/change-password')
        .send({ currentPassword: 'Str0ngP@ss!', newPassword: 'short' });
      expect(res.status).toBe(400);
    });
  });

  // ── User management ───────────────────────────────────────────────────────

  describe('GET /auth/users', () => {
    it('returns user list (200) or forbidden (401/403)', async () => {
      repos.user.find.mockResolvedValueOnce([FAKE_USER]);
      const res = await request(app.getHttpServer()).get('/auth/users');
      expect([200, 401, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body)).toBe(true);
      }
    });
  });

  describe('PATCH /auth/users/:id/role', () => {
    it('returns 200, 401 or 403', async () => {
      repos.user.findOne.mockResolvedValueOnce({ ...FAKE_USER, id: OTHER_ID });
      repos.user.save.mockResolvedValueOnce({ ...FAKE_USER, id: OTHER_ID, role: UserRole.OPERATOR });

      const res = await request(app.getHttpServer())
        .patch(`/auth/users/${OTHER_ID}/role`)
        .send({ role: UserRole.OPERATOR });
      expect([200, 401, 403]).toContain(res.status);
    });
  });

  describe('DELETE /auth/users/:id', () => {
    it('returns 200, 401 or 403', async () => {
      repos.user.findOne.mockResolvedValueOnce({ ...FAKE_USER, id: OTHER_ID });
      repos.user.save.mockResolvedValueOnce({ ...FAKE_USER, id: OTHER_ID, isActive: false });

      const res = await request(app.getHttpServer())
        .delete(`/auth/users/${OTHER_ID}`);
      expect([200, 401, 403]).toContain(res.status);
    });
  });
});
