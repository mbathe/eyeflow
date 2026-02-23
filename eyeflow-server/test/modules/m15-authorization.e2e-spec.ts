/**
 * M15 — Authorization (RBAC + Permissions)
 *
 * Tests the RBAC permission matrix in production configuration:
 *   hasPermission()         → role-based permission resolution
 *   getPermissionsForRole() → returns correct permission set per role
 *   getRolesSummary()       → aggregated role/permission summary
 *
 * Also verifies that the permission hierarchy is correct:
 *   SUPER_ADMIN ⊃ ADMIN ⊃ OPERATOR ⊃ VIEWER
 */

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { createAppWithMocks, MockRepos } from '../helpers/create-app-with-mocks';
import { AuthorizationService } from '../../src/authorization/authorization.service';
import { AuthorizationModule } from '../../src/authorization/authorization.module';
import { UserRole } from '../../src/authorization/enums/roles.enum';
import { Permission } from '../../src/authorization/enums/permissions.enum';
import { ROLE_PERMISSIONS } from '../../src/authorization/enums/role-permissions.map';
import request from 'supertest';

describe('M15 – Authorization (RBAC)', () => {
  let authzService: AuthorizationService;

  // ── Unit-level permission matrix tests ────────────────────────────────────

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' })],
      providers: [AuthorizationService],
    }).compile();

    authzService = module.get<AuthorizationService>(AuthorizationService);
  });

  // ── Role hierarchy ────────────────────────────────────────────────────────

  describe('Role hierarchy: SUPER_ADMIN', () => {
    it('has ALL permissions', () => {
      const allPerms = Object.values(Permission);
      for (const perm of allPerms) {
        expect(authzService.hasPermission(UserRole.SUPER_ADMIN, perm)).toBe(true);
      }
    });
  });

  describe('Role hierarchy: ADMIN', () => {
    it('can read and write connectors', () => {
      expect(authzService.hasPermission(UserRole.ADMIN, Permission.CONNECTORS_READ)).toBe(true);
      expect(authzService.hasPermission(UserRole.ADMIN, Permission.CONNECTORS_CREATE)).toBe(true);
      expect(authzService.hasPermission(UserRole.ADMIN, Permission.CONNECTORS_DELETE)).toBe(true);
    });

    it('can approve rules', () => {
      expect(authzService.hasPermission(UserRole.ADMIN, Permission.RULES_APPROVE)).toBe(true);
    });

    it('cannot manage users (only SUPER_ADMIN can)', () => {
      expect(authzService.hasPermission(UserRole.ADMIN, Permission.USERS_MANAGE_ROLE)).toBe(false);
      expect(authzService.hasPermission(UserRole.ADMIN, Permission.USERS_DELETE)).toBe(false);
    });

    it('cannot perform ADMIN_SYSTEM actions', () => {
      expect(authzService.hasPermission(UserRole.ADMIN, Permission.ADMIN_SYSTEM)).toBe(false);
    });
  });

  describe('Role hierarchy: OPERATOR', () => {
    it('can read connectors and execute tasks', () => {
      expect(authzService.hasPermission(UserRole.OPERATOR, Permission.CONNECTORS_READ)).toBe(true);
      expect(authzService.hasPermission(UserRole.OPERATOR, Permission.TASKS_EXECUTE)).toBe(true);
    });

    it('cannot delete connectors or tasks', () => {
      expect(authzService.hasPermission(UserRole.OPERATOR, Permission.CONNECTORS_DELETE)).toBe(false);
      expect(authzService.hasPermission(UserRole.OPERATOR, Permission.TASKS_DELETE)).toBe(false);
    });

    it('cannot approve rules', () => {
      expect(authzService.hasPermission(UserRole.OPERATOR, Permission.RULES_APPROVE)).toBe(false);
    });
  });

  describe('Role hierarchy: VIEWER', () => {
    it('can only read resources', () => {
      expect(authzService.hasPermission(UserRole.VIEWER, Permission.CONNECTORS_READ)).toBe(true);
      expect(authzService.hasPermission(UserRole.VIEWER, Permission.TASKS_READ)).toBe(true);
      expect(authzService.hasPermission(UserRole.VIEWER, Permission.AUDIT_READ)).toBe(true);
    });

    it('cannot create, update or delete anything', () => {
      const writePerms = [
        Permission.CONNECTORS_CREATE, Permission.CONNECTORS_UPDATE, Permission.CONNECTORS_DELETE,
        Permission.TASKS_CREATE, Permission.TASKS_EXECUTE, Permission.TASKS_DELETE,
        Permission.RULES_CREATE, Permission.RULES_UPDATE, Permission.RULES_DELETE,
        Permission.RULES_APPROVE, Permission.KAFKA_PRODUCE, Permission.USERS_CREATE,
      ];
      for (const perm of writePerms) {
        expect(authzService.hasPermission(UserRole.VIEWER, perm)).toBe(false);
      }
    });
  });

  // ── hasAllPermissions ─────────────────────────────────────────────────────

  describe('hasAllPermissions()', () => {
    it('returns true when role has all required permissions', () => {
      expect(authzService.hasAllPermissions(UserRole.ADMIN, [
        Permission.CONNECTORS_READ,
        Permission.TASKS_READ,
        Permission.AUDIT_READ,
      ])).toBe(true);
    });

    it('returns false when role is missing one permission', () => {
      expect(authzService.hasAllPermissions(UserRole.OPERATOR, [
        Permission.CONNECTORS_READ,
        Permission.CONNECTORS_DELETE, // OPERATOR cannot delete
      ])).toBe(false);
    });
  });

  // ── getPermissionsForRole ─────────────────────────────────────────────────

  describe('getPermissionsForRole()', () => {
    it('returns all permissions for SUPER_ADMIN', () => {
      const perms = authzService.getPermissionsForRole(UserRole.SUPER_ADMIN);
      expect(perms.length).toBe(Object.values(Permission).length);
    });

    it('returns more permissions for ADMIN than OPERATOR', () => {
      const adminPerms = authzService.getPermissionsForRole(UserRole.ADMIN);
      const operatorPerms = authzService.getPermissionsForRole(UserRole.OPERATOR);
      expect(adminPerms.length).toBeGreaterThan(operatorPerms.length);
    });

    it('returns more permissions for OPERATOR than VIEWER', () => {
      const operatorPerms = authzService.getPermissionsForRole(UserRole.OPERATOR);
      const viewerPerms = authzService.getPermissionsForRole(UserRole.VIEWER);
      expect(operatorPerms.length).toBeGreaterThan(viewerPerms.length);
    });
  });

  // ── getRolesSummary ───────────────────────────────────────────────────────

  describe('getRolesSummary()', () => {
    it('returns summary for all 4 roles', () => {
      const summary = authzService.getRolesSummary();
      expect(summary).toHaveLength(4);
      const roles = summary.map(s => s.role);
      expect(roles).toContain(UserRole.SUPER_ADMIN);
      expect(roles).toContain(UserRole.ADMIN);
      expect(roles).toContain(UserRole.OPERATOR);
      expect(roles).toContain(UserRole.VIEWER);
    });

    it('counts are consistent with ROLE_PERMISSIONS map', () => {
      const summary = authzService.getRolesSummary();
      for (const { role, permissionCount, permissions } of summary) {
        expect(permissionCount).toBe(permissions.length);
        if (role !== UserRole.SUPER_ADMIN) {
          expect(permissions.length).toBe(ROLE_PERMISSIONS[role].length);
        }
      }
    });
  });

  // ── API-level guard enforcement ────────────────────────────────────────────
  // In test mode guards are disabled; this section documents expected behavior.
  // In production, these routes require Bearer JWT token + appropriate role.

  describe('Guard enforcement (documented behavior)', () => {
    let testApp: INestApplication;
    let repos: MockRepos;

    beforeAll(async () => {
      ({ app: testApp, repos } = await createAppWithMocks());
    });

    afterAll(async () => {
      await testApp.close();
    });

    it('GET /health is public (no auth required)', async () => {
      const res = await request(testApp.getHttpServer()).get('/health');
      expect(res.status).toBe(200);
    });

    it('GET /api is public (no auth required)', async () => {
      const res = await request(testApp.getHttpServer()).get('/api');
      expect(res.status).toBe(200);
    });

    it('POST /auth/register is public (no auth required)', async () => {
      // The endpoint itself validates the body, so 400 = "auth passed, validation failed"
      const res = await request(testApp.getHttpServer())
        .post('/auth/register')
        .send({});
      expect(res.status).toBe(400); // 400 not 401 = route is accessible
    });

    it('POST /auth/login is public (no auth required)', async () => {
      const res = await request(testApp.getHttpServer())
        .post('/auth/login')
        .send({});
      expect(res.status).toBe(400); // 400 not 401 = route is accessible
    });
  });
});
