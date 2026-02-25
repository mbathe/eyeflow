import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Singleton configuration table for the AI Suggestion Engine.
 * Only one row exists (id = 1). Use upsert to update.
 *
 * All fields are runtime-configurable — no restart required.
 * When intervalMinutes changes, the engine reschedules automatically.
 */
@Entity('suggestion_engine_config')
export class SuggestionEngineConfigEntity {
  /** Always 1 — singleton row */
  @PrimaryColumn({ type: 'int', default: 1 })
  id = 1;

  // ── Scheduling ──────────────────────────────────────────────────────────────

  /** Enable/disable the background engine entirely */
  @Column({ type: 'boolean', default: true })
  enabled = true;

  /** Interval between automatic analyses (in minutes) */
  @Column({ type: 'float', default: 30 })
  intervalMinutes = 30;

  /** Delay before the very first run after server startup (in seconds) */
  @Column({ type: 'float', default: 60 })
  firstRunDelaySeconds = 60;

  // ── Analysis quality ────────────────────────────────────────────────────────

  /** Maximum number of suggestions the LLM may return per run */
  @Column({ type: 'int', default: 8 })
  maxSuggestionsPerRun = 8;

  /**
   * Minimum confidence score (0–100) for a suggestion to be saved.
   * Suggestions below this threshold are discarded.
   */
  @Column({ type: 'int', default: 40 })
  minConfidenceThreshold = 40;

  /**
   * Window (in hours) to look back when deduplicating by title.
   * A suggestion with the same normalized title won't be re-created
   * if an identical-ish PENDING one was created within this window.
   */
  @Column({ type: 'float', default: 24 })
  deduplicationWindowHours = 24;

  /** Use rule-based heuristics when no LLM is configured or LLM call fails */
  @Column({ type: 'boolean', default: true })
  enableFallbackHeuristics = true;

  /**
   * When set (0–100), suggestions with confidence >= this value are
   * automatically accepted without human review. Set to null to disable.
   */
  @Column({ type: 'int', nullable: true, default: null })
  autoAcceptAboveConfidence: number | null = null;

  // ── Context window ──────────────────────────────────────────────────────────

  /** How many hours back to include jobs in the analysis context */
  @Column({ type: 'float', default: 24 })
  contextJobsWindowHours = 24;

  /** How many hours back to include audit-log events */
  @Column({ type: 'float', default: 24 })
  contextEventsWindowHours = 24;

  /** Max number of connectors to include in the LLM context */
  @Column({ type: 'int', default: 15 })
  contextMaxConnectors = 15;

  /** Max number of job records to include */
  @Column({ type: 'int', default: 30 })
  contextMaxJobs = 30;

  /** Max number of audit-log events to include */
  @Column({ type: 'int', default: 50 })
  contextMaxEvents = 50;

  /** Max number of rules to include */
  @Column({ type: 'int', default: 15 })
  contextMaxRules = 15;

  /** Max number of agents to include */
  @Column({ type: 'int', default: 10 })
  contextMaxAgents = 10;

  // ── LLM overrides ───────────────────────────────────────────────────────────

  /**
   * When set, forces the engine to use this specific LlmConfig ID.
   * null = use the default LLM config.
   */
  @Column({ type: 'uuid', nullable: true, default: null })
  preferredLlmConfigId: string | null = null;

  /**
   * Override the LLM maxTokens for engine requests.
   * null = use the value from LlmConfigEntity.
   */
  @Column({ type: 'int', nullable: true, default: null })
  llmMaxTokensOverride: number | null = null;

  /**
   * Override the temperature for engine requests (0.0–2.0).
   * null = use the value from LlmConfigEntity.
   */
  @Column({ type: 'float', nullable: true, default: null })
  llmTemperatureOverride: number | null = null;

  /**
   * Fully replace the system prompt sent to the LLM.
   * null = use the built-in default prompt.
   */
  @Column({ type: 'text', nullable: true, default: null })
  systemPromptOverride: string | null = null;

  /**
   * Additional context injected at the bottom of the user prompt.
   * Useful for domain-specific instructions (e.g., "Focus on energy consumption").
   */
  @Column({ type: 'text', nullable: true, default: null })
  additionalContext: string | null = null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
