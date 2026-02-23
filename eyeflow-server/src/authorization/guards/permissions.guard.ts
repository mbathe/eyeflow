import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { Permission } from '../enums/permissions.enum';
import { ROLE_PERMISSIONS } from '../enums/role-permissions.map';
import { UserEntity } from '../../auth/entities/user.entity';
import { UserRole } from '../enums/roles.enum';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user: UserEntity = request.user;

    if (!user) return false;

    // SUPER_ADMIN bypasses all permission checks
    if (user.role === UserRole.SUPER_ADMIN) return true;

    const userPermissions = ROLE_PERMISSIONS[user.role] ?? [];
    const missing = requiredPermissions.filter(p => !userPermissions.includes(p));

    if (missing.length > 0) {
      throw new ForbiddenException(
        `Missing permissions: [${missing.join(', ')}]`,
      );
    }

    return true;
  }
}
