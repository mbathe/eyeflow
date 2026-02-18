/**
 * Task Compiler - Type definitions and enums
 * Phase 2.0 implementation
 */

// ==========================================
// ENUMS
// ==========================================

export enum GlobalTaskType {
  DIRECT = 'DIRECT',           // One-time execution (Mode 2)
  MONITORING = 'MONITORING',   // Continuous surveillance (Mode 3)
}

export enum GlobalTaskStatus {
  // DIRECT mode
  PENDING = 'PENDING',
  EXECUTING = 'EXECUTING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',

  // MONITORING mode
  ACTIVE = 'ACTIVE',
  STOPPED = 'STOPPED',
  ERROR = 'ERROR',
}

export enum ConditionState {
  NORMAL = 'NORMAL',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
  RESOLVED = 'RESOLVED',
}

export enum MissionStatus {
  PENDING_EXECUTION = 'PENDING_EXECUTION',
  EXECUTING = 'EXECUTING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  FAILOVER_IN_PROGRESS = 'FAILOVER_IN_PROGRESS',
}

export enum ActionStatus {
  PENDING = 'pending',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum EventRuleStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  STOPPED = 'STOPPED',
  ERROR = 'ERROR',
}

export enum RuleApprovalStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ACTIVE = 'ACTIVE',
}

export enum AuditResultStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  FAILOVER = 'failover',
  WARNING = 'warning',
}

export enum SignatureVerificationStatus {
  VALID = 'valid',
  INVALID = 'invalid',
  PENDING = 'pending',
}

export enum DebounceStrategy {
  IMMEDIATE = 'immediate',
  DEBOUNCE = 'debounce',
  THROTTLE = 'throttle',
}

export enum ConditionOperator {
  EQ = 'eq',
  NE = 'ne',
  GT = 'gt',
  GTE = 'gte',
  LT = 'lt',
  LTE = 'lte',
  RANGE = 'range',
  IN = 'in',
  NIN = 'nin',
  CONTAINS = 'contains',
  REGEX = 'regex',
  STARTS_WITH = 'startsWith',
  ENDS_WITH = 'endsWith',
  BETWEEN = 'between',
}

// ==========================================
// INTERFACES
// ==========================================

export interface ParsedIntent {
  action: string;
  parameters: Record<string, any>;
  confidence: number;
  parsingModel: string;
  parsingCompletedAt: Date;
}

export interface Condition {
  field: string;
  operator: ConditionOperator;
  value: any;
  duration?: number;
  allEventsInDuration?: boolean;
}

export interface DebounceConfig {
  enabled: boolean;
  strategy: DebounceStrategy;
  minIntervalMs?: number;
  maxActionsPerHour?: number;
}

export interface Action {
  id: string;
  type: string;
  params: Record<string, any>;
  order: number;
  status: ActionStatus;
  result?: any;
  error?: {
    code: string;
    message: string;
  };
}

export interface ExecutionProof {
  proof: Record<string, any>;
  cryptographicSignature: string;
  signedByNodeId: string;
  algorithmUsed: string;
  signatureTimestamp: Date;
  verificationStatus: SignatureVerificationStatus;
  verificationError?: string;
}

export interface LastError {
  code: string;
  message: string;
  timestamp: Date;
}
