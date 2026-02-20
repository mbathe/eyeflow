/**
 * Project Types
 */

export enum ProjectStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ARCHIVED = 'archived',
}

export enum ProjectVersionStatus {
  DRAFT = 'draft',
  VALIDATING = 'validating',
  VALID = 'valid',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  EXECUTING = 'executing', // actively running
}

export enum ExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout',
}
