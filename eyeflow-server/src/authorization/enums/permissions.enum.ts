/**
 * Fine-grained permissions using resource:action format.
 * Each role will be assigned a set of these permissions.
 */
export enum Permission {
  // ── Users ────────────────────────────────────────────────────────────────
  USERS_READ        = 'users:read',
  USERS_CREATE      = 'users:create',
  USERS_UPDATE      = 'users:update',
  USERS_DELETE      = 'users:delete',
  USERS_MANAGE_ROLE = 'users:manage_role',

  // ── Connectors ───────────────────────────────────────────────────────────
  CONNECTORS_READ   = 'connectors:read',
  CONNECTORS_CREATE = 'connectors:create',
  CONNECTORS_UPDATE = 'connectors:update',
  CONNECTORS_DELETE = 'connectors:delete',
  CONNECTORS_TEST   = 'connectors:test',

  // ── LLM Config ───────────────────────────────────────────────────────────
  LLM_CONFIG_READ   = 'llm_config:read',
  LLM_CONFIG_WRITE  = 'llm_config:write',

  // ── Tasks & Rules ────────────────────────────────────────────────────────
  TASKS_READ        = 'tasks:read',
  TASKS_CREATE      = 'tasks:create',
  TASKS_EXECUTE     = 'tasks:execute',
  TASKS_DELETE      = 'tasks:delete',
  RULES_READ        = 'rules:read',
  RULES_CREATE      = 'rules:create',
  RULES_UPDATE      = 'rules:update',
  RULES_DELETE      = 'rules:delete',
  RULES_APPROVE     = 'rules:approve',

  // ── Services / Registry ──────────────────────────────────────────────────
  SERVICES_READ     = 'services:read',
  SERVICES_REGISTER = 'services:register',

  // ── Agents ───────────────────────────────────────────────────────────────
  AGENTS_READ       = 'agents:read',
  AGENTS_MANAGE     = 'agents:manage',

  // ── Audit ────────────────────────────────────────────────────────────────
  AUDIT_READ        = 'audit:read',
  AUDIT_EXPORT      = 'audit:export',

  // ── Nodes ────────────────────────────────────────────────────────────────
  NODES_READ        = 'nodes:read',
  NODES_MANAGE      = 'nodes:manage',

  // ── Kafka / Events ───────────────────────────────────────────────────────
  KAFKA_READ        = 'kafka:read',
  KAFKA_PRODUCE     = 'kafka:produce',
  KAFKA_MANAGE      = 'kafka:manage',

  // ── Suggestions (Proactive AI) ─────────────────────────────────────────
  SUGGESTIONS_READ   = 'suggestions:read',
  SUGGESTIONS_CREATE = 'suggestions:create',
  SUGGESTIONS_DECIDE = 'suggestions:decide',

  // ── Admin ────────────────────────────────────────────────────────────────
  ADMIN_SYSTEM      = 'admin:system',
}
