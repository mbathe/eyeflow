export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN', // Full access + user management
  ADMIN       = 'ADMIN',       // Full access to resources, cannot manage users (except viewers)
  OPERATOR    = 'OPERATOR',    // Can execute tasks/rules, no delete, no config changes
  VIEWER      = 'VIEWER',      // Read-only access
}
