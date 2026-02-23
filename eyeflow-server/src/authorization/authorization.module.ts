import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthorizationService } from './authorization.service';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';

const isTest = process.env.NODE_ENV === 'test';

@Global()
@Module({
  providers: [
    AuthorizationService,
    // Global guards disabled in test mode (guards are bypassed via test helpers)
    ...(isTest ? [] : [
      { provide: APP_GUARD, useClass: RolesGuard },
      { provide: APP_GUARD, useClass: PermissionsGuard },
    ]),
  ],
  exports: [AuthorizationService],
})
export class AuthorizationModule {}
