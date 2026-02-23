import { UserRole } from './roles.enum';
import { Permission } from './permissions.enum';

/**
 * Defines which permissions each role holds.
 * Roles are hierarchical: SUPER_ADMIN inherits all.
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.SUPER_ADMIN]: Object.values(Permission),

  [UserRole.ADMIN]: [
    Permission.CONNECTORS_READ, Permission.CONNECTORS_CREATE, Permission.CONNECTORS_UPDATE, Permission.CONNECTORS_DELETE, Permission.CONNECTORS_TEST,
    Permission.LLM_CONFIG_READ, Permission.LLM_CONFIG_WRITE,
    Permission.TASKS_READ, Permission.TASKS_CREATE, Permission.TASKS_EXECUTE, Permission.TASKS_DELETE,
    Permission.RULES_READ, Permission.RULES_CREATE, Permission.RULES_UPDATE, Permission.RULES_DELETE, Permission.RULES_APPROVE,
    Permission.SERVICES_READ, Permission.SERVICES_REGISTER,
    Permission.AGENTS_READ, Permission.AGENTS_MANAGE,
    Permission.AUDIT_READ, Permission.AUDIT_EXPORT,
    Permission.NODES_READ, Permission.NODES_MANAGE,
    Permission.KAFKA_READ, Permission.KAFKA_PRODUCE, Permission.KAFKA_MANAGE,
    Permission.USERS_READ,
  ],

  [UserRole.OPERATOR]: [
    Permission.CONNECTORS_READ, Permission.CONNECTORS_TEST,
    Permission.LLM_CONFIG_READ,
    Permission.TASKS_READ, Permission.TASKS_CREATE, Permission.TASKS_EXECUTE,
    Permission.RULES_READ, Permission.RULES_CREATE, Permission.RULES_UPDATE,
    Permission.SERVICES_READ,
    Permission.AGENTS_READ,
    Permission.AUDIT_READ,
    Permission.NODES_READ,
    Permission.KAFKA_READ, Permission.KAFKA_PRODUCE,
  ],

  [UserRole.VIEWER]: [
    Permission.CONNECTORS_READ,
    Permission.LLM_CONFIG_READ,
    Permission.TASKS_READ,
    Permission.RULES_READ,
    Permission.SERVICES_READ,
    Permission.AGENTS_READ,
    Permission.AUDIT_READ,
    Permission.NODES_READ,
    Permission.KAFKA_READ,
  ],
};
