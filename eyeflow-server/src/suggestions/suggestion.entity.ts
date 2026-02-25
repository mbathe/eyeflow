import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

// ── Enums ─────────────────────────────────────────────────────────────────────

export enum SuggestionPriority {
  LOW      = 'low',
  MEDIUM   = 'medium',
  HIGH     = 'high',
  CRITICAL = 'critical',
}

export enum SuggestionStatus {
  PENDING  = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  DEFERRED = 'deferred',
}

export enum SuggestionSource {
  EVENT       = 'event',
  ANALYSIS    = 'analysis',
  DATA_EXPLORER = 'data_explorer',
  SYSTEM      = 'system',
  MANUAL      = 'manual',
  AI_ENGINE   = 'ai_engine',
}

// ── Entity ────────────────────────────────────────────────────────────────────

@Entity('suggestions')
@Index(['status'])
@Index(['priority'])
@Index(['createdBy'])
export class SuggestionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Short title surfaced in lists and the header badge */
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  /** Full description — explains WHY this is suggested */
  @Column({ type: 'text' })
  description!: string;

  /** Urgency ranking */
  @Column({ type: 'enum', enum: SuggestionPriority, default: SuggestionPriority.MEDIUM })
  priority!: SuggestionPriority;

  /** Workflow state */
  @Column({ type: 'enum', enum: SuggestionStatus, default: SuggestionStatus.PENDING })
  status!: SuggestionStatus;

  /** 0-100 — how confident the AI is in this suggestion */
  @Column({ type: 'float', default: 70 })
  confidence!: number;

  /** Human-readable impact description */
  @Column({ type: 'varchar', length: 500, nullable: true })
  impact?: string;

  /** Where this suggestion originated */
  @Column({ type: 'enum', enum: SuggestionSource, default: SuggestionSource.SYSTEM })
  source!: SuggestionSource;

  /** Optional: id of the source object (event id, rule id, etc.) */
  @Column({ type: 'varchar', nullable: true })
  sourceId?: string;

  /** The suggested action payload — free-form JSON */
  @Column({ type: 'jsonb', nullable: true })
  suggestedAction?: Record<string, unknown>;

  /** Category tag (e.g. "connector", "rule", "security") */
  @Column({ type: 'varchar', length: 100, nullable: true })
  category?: string;

  /** AI reasoning: why this suggestion was generated */
  @Column({ type: 'text', nullable: true })
  reasoning?: string;

  /** Data evidence that triggered this suggestion (metrics, values, etc.) */
  @Column({ type: 'jsonb', nullable: true })
  evidence?: Record<string, unknown>;

  /** Whether a suggestedAction has been executed */
  @Column({ type: 'boolean', default: false })
  executed = false;

  @Column({ type: 'timestamptz', nullable: true })
  executedAt?: Date;

  // ── Decision fields ──────────────────────────────────────────────────────

  /** User id who created or triggered this suggestion */
  @Column({ type: 'uuid', nullable: true })
  createdBy?: string;

  /** User id who made the decision */
  @Column({ type: 'uuid', nullable: true })
  decidedBy?: string;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt?: Date;

  /** Optional defer-until date */
  @Column({ type: 'timestamptz', nullable: true })
  deferUntil?: Date;

  /** Free-form comment attached to the decision */
  @Column({ type: 'text', nullable: true })
  decisionComment?: string;

  /** Optional: id of the SuggestionWatch that generated this suggestion */
  @Column({ type: 'uuid', nullable: true })
  watchId?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
