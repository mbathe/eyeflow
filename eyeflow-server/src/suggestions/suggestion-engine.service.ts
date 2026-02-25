/**
 * SuggestionEngineService
 *
 * AI-powered background engine that continuously monitors available data sources
 * (connectors, jobs, events, rules) and generates intelligent, actionable
 * suggestions using LLM analysis.
 *
 * Runs:
 *   - Automatically every 30 minutes via setInterval
 *   - On-demand via POST /suggestions/engine/trigger
 *
 * Architecture:
 *   1. buildContext()   — gather live state from DB
 *   2. callLlm()        — send context to configured LLM
 *   3. parseSuggestions() — validate & extract JSON suggestions
 *   4. saveSuggestions()  — deduplicate & persist
 *   5. broadcast()       — emit WS events
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import {
  SuggestionEntity,
  SuggestionStatus,
  SuggestionPriority,
  SuggestionSource,
} from './suggestion.entity';
import { SuggestionEngineConfigEntity } from './suggestion-engine-config.entity';
import { LlmConfigService } from '../llm-config/llm-config.service';
import { LlmConfigEntity } from '../llm-config/llm-config.entity';
import { LlmProvider } from '../llm-config/llm-config.types';
import { RealtimeEventsService } from '../realtime/realtime-events.service';

// ── Connector action catalog ─────────────────────────────────────────────────
// Maps each connector type to the action types that can realistically execute
// on it.  The LLM reads this so it only proposes feasible actions.

const CONNECTOR_ACTION_CATALOG: Record<string, string[]> = {
  // Databases — full read/write/query capabilities
  postgresql: ['INVESTIGATE', 'EXECUTE_ACTION', 'CREATE_RULE', 'SCHEDULE'],
  mysql:      ['INVESTIGATE', 'EXECUTE_ACTION', 'CREATE_RULE', 'SCHEDULE'],
  mongodb:    ['INVESTIGATE', 'EXECUTE_ACTION', 'CREATE_RULE', 'SCHEDULE'],
  dynamodb:   ['INVESTIGATE', 'EXECUTE_ACTION', 'SCHEDULE'],
  firestore:  ['INVESTIGATE', 'EXECUTE_ACTION', 'SCHEDULE'],

  // File systems
  local_file:   ['INVESTIGATE', 'EXECUTE_ACTION', 'SCHEDULE'],
  s3:           ['INVESTIGATE', 'EXECUTE_ACTION', 'SCHEDULE'],
  google_drive: ['INVESTIGATE', 'EXECUTE_ACTION', 'SCHEDULE'],
  dropbox:      ['INVESTIGATE', 'EXECUTE_ACTION', 'SCHEDULE'],

  // IoT & Streaming — subscribe + publish
  mqtt:     ['INVESTIGATE', 'CREATE_RULE', 'NOTIFY', 'EXECUTE_ACTION'],
  kafka:    ['INVESTIGATE', 'CREATE_RULE', 'EXECUTE_ACTION'],
  influxdb: ['INVESTIGATE', 'CREATE_RULE', 'SCHEDULE'],

  // Communication — outbound only
  smtp:     ['NOTIFY'],
  slack:    ['NOTIFY'],
  teams:    ['NOTIFY'],
  whatsapp: ['NOTIFY'],

  // ERP & Business
  shopify:  ['INVESTIGATE', 'EXECUTE_ACTION', 'SCHEDULE', 'NOTIFY'],
  stripe:   ['INVESTIGATE', 'EXECUTE_ACTION', 'NOTIFY'],
  hubspot:  ['INVESTIGATE', 'EXECUTE_ACTION', 'CREATE_RULE', 'SCHEDULE'],

  // Generic integrations
  webhook:  ['EXECUTE_ACTION', 'NOTIFY'],
  rest_api: ['INVESTIGATE', 'EXECUTE_ACTION', 'SCHEDULE'],
  graphql:  ['INVESTIGATE', 'EXECUTE_ACTION'],
};

// Fallback for unknown connector types
const DEFAULT_AVAILABLE_ACTIONS = ['INVESTIGATE', 'NOTIFY'];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConnectorSummary {
  id: string;
  name: string;
  type: string;
  status: string;
  failureCount: number;
  successCount: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  responseTime?: number;
  /** Actions that can realistically be executed on this connector */
  availableActionTypes: string[];
}

interface JobSummary {
  id: string;
  status: string;
  startedAt: string;
  durationSeconds?: number;
  error?: string;
}

interface AuditLogSummary {
  action: string;
  triggeredBy: string;
  timestamp: string;
  severity?: string;
}

interface RuleSummary {
  id: string;
  name: string;
  status: string;
  executionCount?: number;
  lastExecutedAt?: string;
}

interface AgentSummary {
  id: string;
  name: string;
  status: string;
  lastSeenAt?: string;
}

interface AnalysisContext {
  timestamp: string;
  connectors: ConnectorSummary[];
  recentJobs: JobSummary[];
  recentEvents: AuditLogSummary[];
  rules: RuleSummary[];
  agents: AgentSummary[];
  existingPendingCount: number;
  systemMetrics: {
    totalConnectors: number;
    activeConnectors: number;
    failingConnectors: number;
    failedJobsLast24h: number;
    pendingSuggestions: number;
  };
}

interface RawSuggestion {
  title: string;
  description: string;
  priority?: string;
  confidence?: number;
  impact?: string;
  category?: string;
  reasoning?: string;
  evidence?: Record<string, unknown>;
  suggestedAction?: Record<string, unknown>;
}

export interface EngineStatus {
  isRunning: boolean;
  lastRunAt: Date | null;
  lastRunDurationMs: number | null;
  lastRunSuggestionsCreated: number;
  nextRunAt: Date | null;
  totalRuns: number;
  hasLlm: boolean;
  llmProvider?: string;
  llmModel?: string;
  error?: string;
}

// ── Default system prompt ─────────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `You are EyeFlow's intelligent monitoring AI assistant.

Your role is to analyze real-time data from industrial and IT systems and generate
suggestions (both informational and actionable) to improve performance, reliability,
and efficiency.

You have access to:
- Connector health data (IoT sensors, APIs, databases, MQTT brokers, etc.) — each
  connector carries an "availableActionTypes" field listing the actions that can
  realistically execute on it.
- Job execution history (successes, failures, durations)
- System event logs
- Active automation rules
- Agent status

When analyzing, look for:
- Connectors with high failure rates or connection issues
- Jobs failing repeatedly or taking too long
- Anomalous patterns in sensor data
- Rules that could be optimized or are never triggered
- Security concerns (offline agents, authentication failures)
- Performance bottlenecks
- Resource usage anomalies (energy, bandwidth, CPU, memory)
- Missing automation opportunities
- Observations or trends worth communicating even if no immediate action is needed

Return ONLY a valid JSON object with this exact structure:
{
  "suggestions": [
    {
      "title": "Short title (max 80 chars)",
      "description": "Clear explanation of the situation. Be specific with data.",
      "priority": "critical|high|medium|low",
      "confidence": 0-100,
      "impact": "Quantified impact if possible (e.g. '~15% energy reduction', 'avoid 3 daily failures')",
      "category": "connector|job|rule|security|performance|energy|network|agent|other",
      "reasoning": "Explain your analytical reasoning. Which data points led you here?",
      "evidence": { "key": "value" },
      "suggestedAction": {
        "type": "EXECUTE_ACTION|CREATE_RULE|UPDATE_CONFIG|NOTIFY|INVESTIGATE|SCHEDULE",
        "label": "Human-readable action label",
        "connectorId": "id of the target connector if applicable",
        "connectorType": "type of the target connector if applicable",
        "payload": { "connectorId": "...", "connectorName": "..." }
      }
    }
  ]
}

CRITICAL rules for suggestedAction:
- It is OPTIONAL. Omit it entirely for:
  * Pure observations, trend analyses, or informational alerts
  * Recommendations that require human study before any action
  * Multi-step decisions where the right path is unclear
- When present, type MUST be one of the connector's availableActionTypes.
  NEVER suggest an action type not listed under that connector's availableActionTypes.
- INVESTIGATE is safe for any connector and is the default for diagnostic actions.
- NOTIFY is only valid for connectors with communication capabilities
  (smtp, slack, teams, whatsapp, mqtt, etc.).
- EXECUTE_ACTION and CREATE_RULE require write/query capabilities
  (databases, IoT publish channels, APIs, etc.).
- Always fill connectorId and connectorType in the payload when the action
  targets a specific connector.

Other rules:
- Only suggest if confidence >= 50
- Be specific (use actual data from context)
- For energy/consumption monitoring, calculate estimated savings
- Never suggest duplicate issues
`;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class SuggestionEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SuggestionEngineService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private firstRunHandle: NodeJS.Timeout | null = null;
  private config!: SuggestionEngineConfigEntity;
  private status: EngineStatus = {
    isRunning: false,
    lastRunAt: null,
    lastRunDurationMs: null,
    lastRunSuggestionsCreated: 0,
    nextRunAt: null,
    totalRuns: 0,
    hasLlm: false,
  };

  constructor(
    @InjectRepository(SuggestionEntity)
    private readonly suggestionRepo: Repository<SuggestionEntity>,
    @InjectRepository(SuggestionEngineConfigEntity)
    private readonly configRepo: Repository<SuggestionEngineConfigEntity>,
    private readonly llmConfigService: LlmConfigService,
    private readonly bus: RealtimeEventsService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async onModuleInit() {
    await this.loadConfig();
    this.scheduleEngine();
    this.logger.log(
      `SuggestionEngine ready — enabled=${this.config.enabled}, ` +
      `interval=${this.config.intervalMinutes}min, ` +
      `firstRunDelay=${this.config.firstRunDelaySeconds}s`,
    );
  }

  onModuleDestroy() {
    this.clearTimers();
  }

  // ── Config management ───────────────────────────────────────────────

  async loadConfig(): Promise<SuggestionEngineConfigEntity> {
    let cfg = await this.configRepo.findOne({ where: { id: 1 } });
    if (!cfg) {
      cfg = this.configRepo.create({ id: 1 });
      cfg = await this.configRepo.save(cfg);
      this.logger.log('Created default engine config');
    }
    this.config = cfg;
    return cfg;
  }

  getConfig(): SuggestionEngineConfigEntity {
    return { ...this.config } as SuggestionEngineConfigEntity;
  }

  async updateConfig(
    patch: Partial<Omit<SuggestionEngineConfigEntity, 'id' | 'updatedAt'>>,
  ): Promise<SuggestionEngineConfigEntity> {
    const prevInterval = this.config.intervalMinutes;
    const prevEnabled  = this.config.enabled;
    const prevDelay    = this.config.firstRunDelaySeconds;

    Object.assign(this.config, patch, { id: 1 });
    this.config = await this.configRepo.save(this.config);

    if (
      this.config.intervalMinutes !== prevInterval ||
      this.config.enabled         !== prevEnabled  ||
      this.config.firstRunDelaySeconds !== prevDelay
    ) {
      this.logger.log(
        `Engine rescheduled — interval=${this.config.intervalMinutes}min, ` +
        `enabled=${this.config.enabled}, delay=${this.config.firstRunDelaySeconds}s`,
      );
      this.scheduleEngine();
    }

    this.bus?.emit('engine.config_updated', this.getConfig());
    return this.getConfig();
  }

  // ── Scheduling ────────────────────────────────────────────────────────

  private clearTimers() {
    if (this.intervalHandle)  { clearInterval(this.intervalHandle); this.intervalHandle = null; }
    if (this.firstRunHandle)  { clearTimeout(this.firstRunHandle);  this.firstRunHandle = null; }
  }

  private scheduleEngine() {
    this.clearTimers();
    if (!this.config.enabled) {
      this.status.nextRunAt = null;
      this.logger.log('SuggestionEngine disabled — no timer scheduled');
      return;
    }
    const delayMs    = this.config.firstRunDelaySeconds * 1000;
    const intervalMs = this.config.intervalMinutes * 60 * 1000;
    this.firstRunHandle = setTimeout(() => {
      void this.runAnalysis();
      this.intervalHandle = setInterval(() => void this.runAnalysis(), intervalMs);
    }, delayMs);
    this.status.nextRunAt = new Date(Date.now() + delayMs);
  }

  getStatus(): EngineStatus {
    return { ...this.status };
  }

  // ── Main analysis loop ─────────────────────────────────────────────────────

  async runAnalysis(): Promise<{ created: number; skipped: boolean; error?: string }> {
    // Always reload config before running so changes are picked up immediately
    await this.loadConfig();

    if (!this.config.enabled) return { created: 0, skipped: true };

    if (this.status.isRunning) {
      this.logger.warn('Analysis already running — skipping');
      return { created: 0, skipped: true };
    }

    const intervalMs = this.config.intervalMinutes * 60 * 1000;
    const t0 = Date.now();
    this.status.isRunning = true;
    this.status.lastRunAt = new Date();
    this.status.nextRunAt = new Date(Date.now() + intervalMs);
    this.status.error = undefined;

    // Broadcast engine started
    this.bus?.emit('engine.started', { ts: this.status.lastRunAt });

    try {
      // 1. Gather context
      const context = await this.buildContext();

      // 2. Try LLM analysis
      let rawSuggestions: RawSuggestion[] = [];
      let llmUsed = false;

      try {
        const llmConfig = await this.findAnyLlmConfig();
        if (llmConfig) {
          this.status.hasLlm = true;
          this.status.llmProvider = llmConfig.provider;
          this.status.llmModel = llmConfig.model;
          const llmText = await this.callLlm(llmConfig, context);
          rawSuggestions = this.parseLlmResponse(llmText);
          llmUsed = true;
          this.logger.debug(`LLM returned ${rawSuggestions.length} suggestions`);
        }
      } catch (llmErr: any) {
        this.logger.warn(`LLM call failed, using rule-based fallback: ${llmErr.message}`);
        this.status.hasLlm = false;
      }

      // 3. Fallback: rule-based suggestions if LLM not available or failed
      if (!llmUsed && this.config.enableFallbackHeuristics) {
        rawSuggestions = this.generateRuleBasedSuggestions(context);
      }

      // 4. Save suggestions (with deduplication)
      const created = await this.saveSuggestions(rawSuggestions);

      // 5. Broadcast results
      const count = await this.suggestionRepo.count({ where: { status: SuggestionStatus.PENDING } });
      this.bus?.emit('suggestions.count', { count });
      this.bus?.emit('engine.completed', {
        ts: new Date(),
        created,
        durationMs: Date.now() - t0,
        llmUsed,
      });

      this.status.lastRunSuggestionsCreated = created;
      this.status.lastRunDurationMs = Date.now() - t0;
      this.status.totalRuns++;
      this.logger.log(`Analysis complete — ${created} new suggestions created in ${Date.now() - t0}ms`);

      return { created, skipped: false };
    } catch (err: any) {
      this.status.error = err.message;
      this.bus?.emit('engine.error', { error: err.message });
      this.logger.error(`Analysis failed: ${err.message}`, err.stack);
      return { created: 0, skipped: false, error: err.message };
    } finally {
      this.status.isRunning = false;
    }
  }

  // ── Context building ───────────────────────────────────────────────────────

  private async buildContext(): Promise<AnalysisContext> {
    const c = this.config;
    // Use raw queries to stay independent of other module repositories
    const queryRunner = this.suggestionRepo.manager.connection.createQueryRunner();

    try {
      await queryRunner.connect();

      const [
        connectorRows,
        jobRows,
        auditRows,
        ruleRows,
        agentRows,
        pendingCount,
      ] = await Promise.allSettled([
        queryRunner.query(
          `SELECT id, name, type, status::text,
            "failureCount", "successCount",
            "lastSuccessAt", "lastFailureAt", "responseTime"
           FROM connectors
           WHERE "deletedAt" IS NULL
           ORDER BY "failureCount" DESC
           LIMIT ${c.contextMaxConnectors}`,
        ).catch(() => []),

        queryRunner.query(
          `SELECT id, status::text, "startedAt",
            EXTRACT(EPOCH FROM ("completedAt" - "startedAt")) AS "durationSeconds",
            error
           FROM jobs
           WHERE "createdAt" > NOW() - INTERVAL '${c.contextJobsWindowHours} hours'
           ORDER BY "createdAt" DESC
           LIMIT ${c.contextMaxJobs}`,
        ).catch(() => []),

        queryRunner.query(
          `SELECT action, "triggeredBy"::text, "createdAt" as timestamp,
            severity::text
           FROM audit_logs
           WHERE "createdAt" > NOW() - INTERVAL '${c.contextEventsWindowHours} hours'
           ORDER BY "createdAt" DESC
           LIMIT ${c.contextMaxEvents}`,
        ).catch(() => []),

        queryRunner.query(
          `SELECT id, name, status::text,
            "executionCount", "lastExecutedAt"
           FROM tasks_rules
           WHERE "deletedAt" IS NULL
           ORDER BY "lastExecutedAt" DESC NULLS LAST
           LIMIT ${c.contextMaxRules}`,
        ).catch(() => []),

        queryRunner.query(
          `SELECT id, name, status::text, "lastSeenAt"
           FROM agents
           WHERE "deletedAt" IS NULL
           LIMIT ${c.contextMaxAgents}`,
        ).catch(() => []),

        this.suggestionRepo.count({ where: { status: SuggestionStatus.PENDING } }),
      ]);

      const connectors: ConnectorSummary[] = (connectorRows.status === 'fulfilled' ? connectorRows.value ?? [] : [])
        .map((c: any) => ({
          ...c,
          availableActionTypes: CONNECTOR_ACTION_CATALOG[c.type as string] ?? DEFAULT_AVAILABLE_ACTIONS,
        }));
      const jobs: JobSummary[] = jobRows.status === 'fulfilled' ? jobRows.value ?? [] : [];
      const events: AuditLogSummary[] = auditRows.status === 'fulfilled' ? auditRows.value ?? [] : [];
      const rules: RuleSummary[] = ruleRows.status === 'fulfilled' ? ruleRows.value ?? [] : [];
      const agents: AgentSummary[] = agentRows.status === 'fulfilled' ? agentRows.value ?? [] : [];
      const pendingCnt = pendingCount.status === 'fulfilled' ? pendingCount.value : 0;

      const failingConnectors = connectors.filter(c => c.failureCount > 0 || c.status === 'error').length;
      const failedJobs = jobs.filter(j => j.status === 'failed' || j.status === 'error').length;

      return {
        timestamp: new Date().toISOString(),
        connectors,
        recentJobs: jobs,
        recentEvents: events,
        rules,
        agents,
        existingPendingCount: pendingCnt,
        systemMetrics: {
          totalConnectors: connectors.length,
          activeConnectors: connectors.filter(c => c.status === 'active' || c.status === 'connected').length,
          failingConnectors,
          failedJobsLast24h: failedJobs,
          pendingSuggestions: pendingCnt,
        },
      };
    } finally {
      await queryRunner.release();
    }
  }

  // ── LLM call ───────────────────────────────────────────────────────────────

  private async findAnyLlmConfig(): Promise<LlmConfigEntity | null> {
    try {
      const repo = this.suggestionRepo.manager.connection.getRepository(LlmConfigEntity);
      // Use preferred config if set
      if (this.config.preferredLlmConfigId) {
        const preferred = await repo.findOne({ where: { id: this.config.preferredLlmConfigId } });
        if (preferred) return preferred;
        this.logger.warn(`Preferred LLM config ${this.config.preferredLlmConfigId} not found — falling back to default`);
      }
      return await repo.findOne({ where: { isDefault: true }, order: { createdAt: 'ASC' } })
          ?? await repo.findOne({ order: { createdAt: 'ASC' } });
    } catch {
      return null;
    }
  }

  private async callLlm(config: LlmConfigEntity, context: AnalysisContext): Promise<string> {
    const apiConfig = this.llmConfigService.getDecryptedApiConfig(config);
    if (!apiConfig?.apiKey) {
      throw new Error('No API key found in LLM config');
    }

    // Apply config-level overrides on top of LlmConfig values
    const maxTokens   = this.config.llmMaxTokensOverride   ?? config.maxTokens;
    const temperature = this.config.llmTemperatureOverride ?? config.temperature;
    const systemPrompt = this.config.systemPromptOverride?.trim() || DEFAULT_SYSTEM_PROMPT;
    const userPrompt  = this.buildUserPrompt(context);

    switch (config.provider) {
      case LlmProvider.OPENAI:
      case LlmProvider.AZURE_OPENAI:
        return this.callOpenAi(apiConfig, config, userPrompt, maxTokens, temperature, systemPrompt);
      case LlmProvider.ANTHROPIC:
        return this.callAnthropic(apiConfig, config, userPrompt, maxTokens, systemPrompt);
      default:
        return this.callOpenAi(apiConfig, config, userPrompt, maxTokens, temperature, systemPrompt);
    }
  }

  private async callOpenAi(
    apiConfig: any,
    config: LlmConfigEntity,
    userPrompt: string,
    maxTokens: number,
    temperature: number,
    systemPrompt: string,
  ): Promise<string> {
    const url = apiConfig.apiUrl || 'https://api.openai.com/v1/chat/completions';
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiConfig.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (apiConfig.organization) headers['OpenAI-Organization'] = apiConfig.organization;

    const body = {
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      max_tokens: Math.min(maxTokens, 4000),
      temperature,
      response_format: { type: 'json_object' },
    };

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json = await res.json() as any;
    return json.choices?.[0]?.message?.content ?? '';
  }

  private async callAnthropic(
    apiConfig: any,
    config: LlmConfigEntity,
    userPrompt: string,
    maxTokens: number,
    systemPrompt: string,
  ): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiConfig.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: Math.min(maxTokens, 4000),
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json = await res.json() as any;
    return json.content?.[0]?.text ?? '';
  }

  private buildUserPrompt(context: AnalysisContext): string {
    const c = this.config;
    const body = `Analyze the following EyeFlow system state and generate up to ${c.maxSuggestionsPerRun} suggestions.
Not all suggestions need a suggestedAction — omit it for informational/advisory observations.
Only include suggestions with confidence >= ${c.minConfidenceThreshold}.
For each connector, only suggest actions listed in its availableActionTypes.

## Analysis timestamp: ${context.timestamp}

## System metrics:
${JSON.stringify(context.systemMetrics, null, 2)}

## Connectors (${context.connectors.length}, window: all active):
${JSON.stringify(context.connectors, null, 2)}

## Recent jobs — last ${c.contextJobsWindowHours}h (${context.recentJobs.length} records):
${JSON.stringify(context.recentJobs, null, 2)}

## Recent events — last ${c.contextEventsWindowHours}h (${context.recentEvents.length} records):
${JSON.stringify(context.recentEvents, null, 2)}

## Active rules (${context.rules.length}):
${JSON.stringify(context.rules, null, 2)}

## Agents (${context.agents.length}):
${JSON.stringify(context.agents, null, 2)}`;

    const extra = c.additionalContext?.trim()
      ? `\n\n## Additional instructions from administrator:\n${c.additionalContext.trim()}`
      : '';

    return body + extra + '\n\nReturn your response as a JSON object with a "suggestions" array.';
  }

  // ── Response parsing ───────────────────────────────────────────────────────

  private parseLlmResponse(raw: string): RawSuggestion[] {
    try {
      // Extract JSON block if wrapped in markdown
      const jsonMatch = raw.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || [null, raw];
      const jsonStr = jsonMatch[1] ?? raw;
      const parsed = JSON.parse(jsonStr.trim());
      const items: RawSuggestion[] = parsed.suggestions ?? parsed.items ?? [];

      return items
        .filter(s =>
          typeof s.title === 'string' &&
          typeof s.description === 'string' &&
          s.title.length > 0,
        )
        .slice(0, this.config.maxSuggestionsPerRun);
    } catch (err) {
      this.logger.warn(`Could not parse LLM JSON response: ${String(err)}`);
      return [];
    }
  }

  // ── Rule-based fallback ────────────────────────────────────────────────────

  private generateRuleBasedSuggestions(ctx: AnalysisContext): RawSuggestion[] {
    const out: RawSuggestion[] = [];
    const max = this.config.maxSuggestionsPerRun;

    // Failing connectors
    const failing = ctx.connectors.filter(c => c.failureCount >= 3 || c.status === 'error');
    for (const c of failing.slice(0, Math.ceil(max / 2))) {
      out.push({
        title: `Connector "${c.name}" has ${c.failureCount} failures`,
        description: `The connector "${c.name}" (${c.type}) reported ${c.failureCount} consecutive failures. Investigate configuration and network connectivity.`,
        priority: c.failureCount >= 10 ? 'critical' : 'high',
        confidence: 90,
        impact: 'System reliability degraded — automated rules may not trigger correctly',
        category: 'connector',
        reasoning: `failure_count=${c.failureCount}, status=${c.status}`,
        evidence: { connectorId: c.id, failureCount: c.failureCount, lastFailureAt: c.lastFailureAt },
        suggestedAction: { type: 'INVESTIGATE', label: `Check connector "${c.name}" configuration`, connectorId: c.id, connectorType: c.type, payload: { connectorId: c.id, connectorName: c.name } },
      });
    }

    // Failed jobs
    const failedJobs = ctx.recentJobs.filter(j => j.status === 'failed' || j.status === 'error');
    if (failedJobs.length >= 3 && out.length < max) {
      out.push({
        title: `${failedJobs.length} jobs failed in the last ${this.config.contextJobsWindowHours}h`,
        description: `${failedJobs.length} automation jobs have failed recently. Review error logs and rule configurations.`,
        priority: failedJobs.length >= 10 ? 'high' : 'medium',
        confidence: 85,
        impact: 'Automated operations not completing as expected',
        category: 'job',
        reasoning: `${failedJobs.length} failed jobs detected in window`,
        evidence: { failedCount: failedJobs.length, sample: failedJobs.slice(0, 3) },
        // Informational — no specific connector to act on, just advisory
        // (no suggestedAction intentionally omitted here; keep it optional)
      });
    }

    // Offline agents
    const offlineAgents = ctx.agents.filter(a => a.status === 'offline' || a.status === 'inactive');
    for (const ag of offlineAgents.slice(0, 2)) {
      if (out.length >= max) break;
      out.push({
        title: `Agent "${ag.name}" is offline`,
        description: `The EyeFlow agent "${ag.name}" appears to be offline or unreachable. This may prevent automated tasks from executing.`,
        priority: 'high',
        confidence: 95,
        impact: 'Tasks assigned to this agent will not execute',
        category: 'agent',
        reasoning: `Agent status=${ag.status}, lastSeen=${ag.lastSeenAt}`,
        evidence: { agentId: ag.id, status: ag.status, lastSeenAt: ag.lastSeenAt },
        suggestedAction: { type: 'INVESTIGATE', label: `Check agent "${ag.name}" connectivity`, payload: { agentId: ag.id, agentName: ag.name } },
      });
    }

    return out;
  }

  // ── Persistence with deduplication ────────────────────────────────────────

  private async saveSuggestions(rawList: RawSuggestion[]): Promise<number> {
    if (!rawList.length) return 0;

    // Deduplicate using config-defined window
    const windowMs = this.config.deduplicationWindowHours * 60 * 60 * 1000;
    const since = new Date(Date.now() - windowMs);
    const existing = await this.suggestionRepo.find({
      where: { status: SuggestionStatus.PENDING, createdAt: MoreThan(since) },
      select: ['title'],
    });
    const existingTitles = new Set(existing.map(s => s.title.toLowerCase().slice(0, 60)));

    let created = 0;
    for (const raw of rawList) {
      const normalized = raw.title.toLowerCase().slice(0, 60);
      if (existingTitles.has(normalized)) continue;

      const priority   = this.mapPriority(raw.priority);
      const confidence = Math.min(100, Math.max(0, raw.confidence ?? 70));
      if (confidence < this.config.minConfidenceThreshold) continue;

      // Auto-accept if above configured threshold
      const autoAccept = this.config.autoAcceptAboveConfidence;
      const status = (autoAccept !== null && confidence >= autoAccept)
        ? SuggestionStatus.ACCEPTED
        : SuggestionStatus.PENDING;

      const entity = this.suggestionRepo.create({
        title: raw.title.slice(0, 255),
        description: raw.description,
        priority,
        confidence,
        status,
        impact: raw.impact?.slice(0, 500),
        category: raw.category?.slice(0, 100),
        reasoning: raw.reasoning,
        evidence: raw.evidence,
        suggestedAction: raw.suggestedAction,
        source: SuggestionSource.AI_ENGINE,
      } as Partial<SuggestionEntity> as any);

      const saved = await this.suggestionRepo.save(entity);
      existingTitles.add(normalized);
      created++;

      this.bus?.emit('suggestion.created', saved);
    }

    return created;
  }

  private mapPriority(raw?: string): SuggestionPriority {
    switch ((raw ?? '').toLowerCase()) {
      case 'critical': return SuggestionPriority.CRITICAL;
      case 'high':     return SuggestionPriority.HIGH;
      case 'low':      return SuggestionPriority.LOW;
      default:         return SuggestionPriority.MEDIUM;
    }
  }
}
