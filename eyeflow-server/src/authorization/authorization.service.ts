import { Injectable } from '@nestjs/common';
import { UserRole } from './enums/roles.enum';
import { Permission } from './enums/permissions.enum';
import { ROLE_PERMISSIONS } from './enums/role-permissions.map';

@Injectable()
export class AuthorizationService {
  /**
   * Check if a specific role has a given permission.
   */
  hasPermission(role: UserRole, permission: Permission): boolean {
    if (role === UserRole.SUPER_ADMIN) return true;
    return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
  }

  /**
   * Check if a role passes ALL required permissions.
   */
  hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
    return permissions.every(p => this.hasPermission(role, p));
  }

  /**
   * Return all permissions for a given role.
   */
  getPermissionsForRole(role: UserRole): Permission[] {
    return ROLE_PERMISSIONS[role] ?? [];
  }

  /**
   * Return a summary of all roles and their permission counts.
   * Useful for admin dashboards.
   */
  getRolesSummary() {
    return (Object.values(UserRole) as UserRole[]).map(role => ({
      role,
      permissionCount: this.getPermissionsForRole(role).length,
      permissions: this.getPermissionsForRole(role),
    }));
  }
}
