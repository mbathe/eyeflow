/**
 * SuggestionWatchService
 *
 * Manages "data source watches" — scheduled LLM analysis jobs that are
 * tightly scoped to one or more connectors.
 *
 * Key characteristics:
 *  - Per-watch scheduling with configurable jitter (avoids thundering-herd)
 *  - Prompt mode: 'manual' (user-written) or 'ai_auto' (AI-generated meta-prompt)
 *  - Suggestions produced carry a `watchId` for traceability
 *  - On startup: all enabled watches are loaded and scheduled
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, MoreThan } from 'typeorm';
import { SuggestionWatchEntity, WatchPromptMode, WatchRunStatus } from './suggestion-watch.entity';
import { SuggestionEntity, SuggestionStatus, SuggestionPriority, SuggestionSource } from './suggestion.entity';
import { LlmConfigService } from '../llm-config/llm-config.service';
import { LlmConfigEntity } from '../llm-config/llm-config.entity';
import { LlmProvider } from '../llm-config/llm-config.types';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateWatchDto, UpdateWatchDto } from './dto/watch.dto';

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface ConnectorRow {
  id: string;
  name: string;
  type: string;
  status: string;
  failureCount: number;
  successCount: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  responseTime?: number;
  description?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class SuggestionWatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SuggestionWatchService.name);

  /** Map<watchId, NodeJS.Timeout> — scheduled fire timers */
  private readonly timers = new Map<string, NodeJS.Timeout>();
  /** Map<watchId, boolean> — prevents concurrent runs for the same watch */
  private readonly running = new Map<string, boolean>();

  constructor(
    @InjectRepository(SuggestionWatchEntity)
    private readonly watchRepo: Repository<SuggestionWatchEntity>,
    @InjectRepository(SuggestionEntity)
    private readonly suggestionRepo: Repository<SuggestionEntity>,
    private readonly llmConfigService: LlmConfigService,
    private readonly bus: RealtimeEventsService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async onModuleInit() {
    const watches = await this.watchRepo.find({
      where: { enabled: true, deletedAt: IsNull() },
    });
    for (const w of watches) {
      this._scheduleNext(w);
    }
    this.logger.log(`SuggestionWatchService ready — ${watches.length} watch(es) scheduled`);
  }

  onModuleDestroy() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async list(userId: string): Promise<SuggestionWatchEntity[]> {
    return this.watchRepo.find({
      where: { userId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async get(id: string, userId: string): Promise<SuggestionWatchEntity> {
    const watch = await this.watchRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!watch) throw new NotFoundException(`Watch ${id} not found`);
    if (watch.userId !== userId) throw new ForbiddenException();
    return watch;
  }

  async create(dto: CreateWatchDto, userId: string): Promise<SuggestionWatchEntity> {
    const watch = this.watchRepo.create({
      ...dto,
      prompt:       dto.prompt ?? '',
      jitterPercent: dto.jitterPercent ?? 20,
      enabled:      dto.enabled ?? true,
      maxSuggestionsPerRun: dto.maxSuggestionsPerRun ?? 5,
      minConfidence: dto.minConfidence ?? 50,
      userId,
      createdBy: userId,
      lastRunStatus: WatchRunStatus.IDLE,
      totalRuns: 0,
    });
    const saved = await this.watchRepo.save(watch);

    if (saved.enabled) {
      this._scheduleNext(saved);
    }
    this.bus?.emit('watch.created', { watchId: saved.id, name: saved.name });
    return saved;
  }

  async update(id: string, dto: UpdateWatchDto, userId: string): Promise<SuggestionWatchEntity> {
    const watch = await this.get(id, userId);
    const prevEnabled  = watch.enabled;
    const prevInterval = watch.intervalMinutes;
    const prevJitter   = watch.jitterPercent;

    Object.assign(watch, dto);
    const saved = await this.watchRepo.save(watch);

    // Reschedule if timing or enabled flag changed
    const scheduleChanged =
      saved.intervalMinutes !== prevInterval ||
      saved.jitterPercent   !== prevJitter   ||
      saved.enabled         !== prevEnabled;

    if (scheduleChanged) {
      this._cancelTimer(id);
      if (saved.enabled) this._scheduleNext(saved);
    }

    this.bus?.emit('watch.updated', { watchId: saved.id });
    return saved;
  }

  async remove(id: string, userId: string): Promise<void> {
    const watch = await this.get(id, userId);
    this._cancelTimer(id);
    await this.watchRepo.softDelete(id);
    this.bus?.emit('watch.deleted', { watchId: id });

    // Note: leave existing suggestions in DB — they stay for audit trail
    this.logger.log(`Watch ${id} ("${watch.name}") deleted`);
  }

  // ── Manual trigger ────────────────────────────────────────────────────────

  async trigger(id: string, userId: string): Promise<{ created: number; error?: string }> {
    const watch = await this.get(id, userId);
    return this._runWatch(watch);
  }

  // ── AI prompt generation ─────────────────────────────────────────────────

  /**
   * Ask the LLM to generate an optimal analysis prompt for the given connectors.
   * Returns the generated prompt text so the user can review/edit before saving.
   */
  async generatePrompt(connectorIds: string[], userId: string, userHint?: string): Promise<{ prompt: string }> {
    const llmConfig = await this.findAnyLlmConfig();
    if (!llmConfig) throw new NotFoundException('No LLM configuration found — add one in Settings');

    const connectors = await this.loadConnectors(connectorIds);
    const meta = connectors.map(c => ({
      name: c.name,
      type: c.type,
      status: c.status,
      description: c.description,
    }));

    const metaSystemPrompt = `You are an expert system administrator assistant.
Your task is to write a clear, specific, and actionable analysis prompt that 
will be used periodically to monitor the given data sources and generate improvement suggestions.
The prompt should be detailed enough for an AI to analyse connector behaviour and propose concrete corrections.
Write ONLY the prompt text, no extra commentary, no JSON.`;

    const metaUserPrompt = `Generate an analysis prompt for these data sources:
${JSON.stringify(meta, null, 2)}

${userHint ? `User instructions: ${userHint}\n` : ''}
The prompt will be sent to an AI analyst on every scheduled run.
It should:
- Ask the AI to analyse health, failures, patterns and anomalies
- Request specific, quantified suggestions (top 3-5)
- Ask for severity rating (critical/high/medium/low)
- Ask for recommended corrective actions
- Ask for estimated impact of each action
Keep it under 500 words. Write in the same language as these instructions.`;

    const text = await this._callLlmRaw(llmConfig, metaSystemPrompt, metaUserPrompt, 800);
    return { prompt: text.trim() };
  }

  // ── Scheduling internals ──────────────────────────────────────────────────

  private _computeDelayMs(watch: SuggestionWatchEntity): number {
    const nominalMs = watch.intervalMinutes * 60_000;
    if (watch.jitterPercent <= 0) return nominalMs;

    // Apply symmetric jitter: delay = nominal × (1 + rnd ∈ [-j, +j])
    const j = watch.jitterPercent / 100;
    const factor = 1 + (Math.random() * 2 - 1) * j;
    return Math.max(5_000, nominalMs * factor); // min 5 s
  }

  private _scheduleNext(watch: SuggestionWatchEntity): void {
    const delayMs = this._computeDelayMs(watch);
    const nextAt  = new Date(Date.now() + delayMs);

    // Persist nextRunAt without awaiting to keep this synchronous
    void this.watchRepo.update(watch.id, { nextRunAt: nextAt });

    const timer = setTimeout(async () => {
      const fresh = await this.watchRepo.findOne({ where: { id: watch.id, deletedAt: IsNull() } });
      if (!fresh || !fresh.enabled) return;

      await this._runWatch(fresh);
      this._scheduleNext(fresh); // schedule next after run completes
    }, delayMs);

    if ((timer as any).unref) (timer as any).unref();
    this.timers.set(watch.id, timer);

    this.logger.debug(
      `Watch "${watch.name}" scheduled in ${Math.round(delayMs / 1000)}s (jitter=${watch.jitterPercent}%)`,
    );
  }

  private _cancelTimer(watchId: string): void {
    const t = this.timers.get(watchId);
    if (t) { clearTimeout(t); this.timers.delete(watchId); }
  }

  // ── Analysis run ──────────────────────────────────────────────────────────

  private async _runWatch(watch: SuggestionWatchEntity): Promise<{ created: number; error?: string }> {
    if (this.running.get(watch.id)) {
      this.logger.warn(`Watch "${watch.name}" already running — skipping`);
      return { created: 0 };
    }
    this.running.set(watch.id, true);

    const t0 = Date.now();
    this.logger.log(`Watch "${watch.name}" starting run`);
    this.bus?.emit(`watch.started`, { watchId: watch.id, name: watch.name });

    try {
      await this.watchRepo.update(watch.id, { lastRunStatus: WatchRunStatus.RUNNING });

      // 1. Load connector context
      const connectors = await this.loadConnectors(watch.connectorIds);

      // 2. Resolve prompt (auto-generate if needed)
      let prompt = watch.prompt;
      if (watch.promptMode === WatchPromptMode.AI_AUTO || !prompt?.trim()) {
        try {
          const llmCfg = await this.findAnyLlmConfig();
          if (llmCfg) {
            const gen = await this.generatePrompt(watch.connectorIds, watch.userId);
            prompt = gen.prompt;
            // Persist auto-generated prompt so user can see it
            await this.watchRepo.update(watch.id, { prompt: gen.prompt });
          }
        } catch (e: any) {
          this.logger.warn(`Auto prompt generation failed: ${e.message} — using fallback`);
          prompt = this._buildFallbackPrompt(connectors, watch);
        }
      }

      // 3. Call LLM for suggestions
      const llmConfig = await this.findAnyLlmConfig();
      let rawSuggestions: RawSuggestion[] = [];

      if (llmConfig) {
        const systemPrompt = watch.systemPrompt?.trim() || this._buildSystemPrompt();
        const userPrompt   = this._buildContextualPrompt(connectors, prompt, watch);
        try {
          const text = await this._callLlmRaw(llmConfig, systemPrompt, userPrompt, 2000);
          rawSuggestions = this._parseSuggestions(text, watch.maxSuggestionsPerRun);
        } catch (err: any) {
          this.logger.warn(`LLM call failed for watch "${watch.name}": ${err.message}`);
          rawSuggestions = this._fallbackSuggestions(connectors, watch);
        }
      } else {
        rawSuggestions = this._fallbackSuggestions(connectors, watch);
      }

      // 4. Persist
      const created = await this._saveSuggestions(rawSuggestions, watch);

      await this.watchRepo.update(watch.id, {
        lastRunAt: new Date(),
        lastRunStatus: WatchRunStatus.OK,
        lastRunSuggestionsCreated: created,
        lastError: undefined,
        totalRuns: () => '"totalRuns" + 1',
      } as any);

      this.bus?.emit('watch.completed', {
        watchId: watch.id,
        name: watch.name,
        created,
        durationMs: Date.now() - t0,
      });

      this.logger.log(`Watch "${watch.name}" done — ${created} suggestion(s) in ${Date.now() - t0}ms`);
      return { created };

    } catch (err: any) {
      this.logger.error(`Watch "${watch.name}" error: ${err.message}`, err.stack);
      await this.watchRepo.update(watch.id, {
        lastRunStatus: WatchRunStatus.ERROR,
        lastError: err.message,
      });
      this.bus?.emit('watch.error', { watchId: watch.id, name: watch.name, error: err.message });
      return { created: 0, error: err.message };

    } finally {
      this.running.delete(watch.id);
    }
  }

  // ── Context + prompt builders ─────────────────────────────────────────────

  private async loadConnectors(connectorIds: string[]): Promise<ConnectorRow[]> {
    if (!connectorIds.length) return [];
    try {
      const qr = this.watchRepo.manager.connection.createQueryRunner();
      await qr.connect();
      try {
        const ids = connectorIds.map(id => `'${id}'`).join(',');
        const rows = await qr.query(
          `SELECT id, name, type, status::text, "failureCount", "successCount",
                  "lastSuccessAt", "lastFailureAt", "responseTime", description
           FROM connectors
           WHERE id IN (${ids}) AND "deletedAt" IS NULL`,
        ).catch(() => []);
        return rows ?? [];
      } finally {
        await qr.release();
      }
    } catch {
      return [];
    }
  }

  private _buildSystemPrompt(): string {
    return `You are EyeFlow's intelligent data-source monitoring AI.

Your role is to analyse health, performance and behavioural data from specific connectors
(IoT sensors, databases, APIs, MQTT brokers, etc.) and generate precise, actionable suggestions.

Respond ONLY with a valid JSON object:
{
  "suggestions": [
    {
      "title": "Short actionable title (max 80 chars)",
      "description": "Explanation of the issue and recommended action with specifics",
      "priority": "critical|high|medium|low",
      "confidence": 0-100,
      "impact": "Quantified impact if possible",
      "category": "connector|security|performance|energy|network|agent|other",
      "reasoning": "Which data points led to this conclusion",
      "evidence": {},
      "suggestedAction": { "type": "INVESTIGATE|EXECUTE_ACTION|CREATE_RULE|UPDATE_CONFIG|NOTIFY", "label": "...", "payload": {} }
    }
  ]
}`;
  }

  private _buildContextualPrompt(
    connectors: ConnectorRow[],
    userPrompt: string,
    watch: SuggestionWatchEntity,
  ): string {
    const summary = connectors.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      status: c.status,
      failures: c.failureCount,
      successes: c.successCount,
      lastSuccess: c.lastSuccessAt,
      lastFailure: c.lastFailureAt,
      avgResponseMs: c.responseTime,
    }));

    return `## Analysis request
${userPrompt}

## Watched connector data (${connectors.length} source${connectors.length !== 1 ? 's' : ''}):
${JSON.stringify(summary, null, 2)}

## Parameters
- Max suggestions: ${watch.maxSuggestionsPerRun}
- Min confidence: ${watch.minConfidence}
- Analysis time: ${new Date().toISOString()}

Return your response as a JSON object with a "suggestions" array.`;
  }

  private _buildFallbackPrompt(connectors: ConnectorRow[], watch: SuggestionWatchEntity): string {
    const names = connectors.map(c => c.name).join(', ');
    return `Analyse the current state of these data sources: ${names}.
Identify failures, anomalies, performance issues and propose the top ${watch.maxSuggestionsPerRun} corrective actions.
Rate each suggestion by severity (critical/high/medium/low) and estimated impact.`;
  }

  // ── LLM call (provider-agnostic) ──────────────────────────────────────────

  private async findAnyLlmConfig(): Promise<LlmConfigEntity | null> {
    try {
      const repo = this.watchRepo.manager.connection.getRepository(LlmConfigEntity);
      return await repo.findOne({ where: { isDefault: true }, order: { createdAt: 'ASC' } })
          ?? await repo.findOne({ order: { createdAt: 'ASC' } });
    } catch {
      return null;
    }
  }

  private async _callLlmRaw(
    config: LlmConfigEntity,
    systemPrompt: string,
    userPrompt: string,
    maxTokens = 2000,
  ): Promise<string> {
    const apiConfig = this.llmConfigService.getDecryptedApiConfig(config);
    if (!apiConfig?.apiKey) throw new Error('No API key in LLM config');

    const temperature = 0.3;

    switch (config.provider) {
      case LlmProvider.ANTHROPIC:
        return this._callAnthropic(apiConfig, config.model, systemPrompt, userPrompt, maxTokens);
      default:
        return this._callOpenAi(apiConfig, config.model, systemPrompt, userPrompt, maxTokens, temperature);
    }
  }

  private async _callOpenAi(
    apiConfig: any,
    model: string,
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
    temperature: number,
  ): Promise<string> {
    const url = apiConfig.apiUrl || 'https://api.openai.com/v1/chat/completions';
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiConfig.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (apiConfig.organization) headers['OpenAI-Organization'] = apiConfig.organization;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        max_tokens: Math.min(maxTokens, 4000),
        temperature,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json() as any;
    return json.choices?.[0]?.message?.content ?? '';
  }

  private async _callAnthropic(
    apiConfig: any,
    model: string,
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
  ): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiConfig.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(maxTokens, 4000),
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json() as any;
    return json.content?.[0]?.text ?? '';
  }

  // ── Parsing + persistence ─────────────────────────────────────────────────

  private _parseSuggestions(raw: string, max: number): RawSuggestion[] {
    try {
      const jsonMatch = raw.match(/```(?:json)?\n?([\s\S]*?)\n?```/) ?? [null, raw];
      const parsed = JSON.parse((jsonMatch[1] ?? raw).trim());
      const items: RawSuggestion[] = parsed.suggestions ?? parsed.items ?? [];
      return items.filter(s => typeof s.title === 'string' && s.title.length > 0).slice(0, max);
    } catch {
      return [];
    }
  }

  private _fallbackSuggestions(connectors: ConnectorRow[], watch: SuggestionWatchEntity): RawSuggestion[] {
    const out: RawSuggestion[] = [];
    for (const c of connectors.filter(c => c.failureCount >= 2).slice(0, watch.maxSuggestionsPerRun)) {
      out.push({
        title: `Connector "${c.name}" shows ${c.failureCount} failures`,
        description: `The connector "${c.name}" (${c.type}) has ${c.failureCount} recorded failures. Check connection settings and network access.`,
        priority: c.failureCount >= 10 ? 'critical' : 'high',
        confidence: 85,
        impact: 'Automated data flows may be interrupted',
        category: 'connector',
        reasoning: `failure_count=${c.failureCount}, status=${c.status}`,
        evidence: { connectorId: c.id, failureCount: c.failureCount },
        suggestedAction: { type: 'INVESTIGATE', label: 'Check connector', payload: { connectorId: c.id } },
      });
    }
    return out;
  }

  private async _saveSuggestions(rawList: RawSuggestion[], watch: SuggestionWatchEntity): Promise<number> {
    if (!rawList.length) return 0;

    const windowMs = 24 * 60 * 60_000; // 24h dedup window
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

      const confidence = Math.min(100, Math.max(0, raw.confidence ?? 70));
      if (confidence < watch.minConfidence) continue;

      const priority = this._mapPriority(raw.priority);

      const entity = this.suggestionRepo.create({
        title:           raw.title.slice(0, 255),
        description:     raw.description,
        priority,
        confidence,
        status:          SuggestionStatus.PENDING,
        impact:          raw.impact?.slice(0, 500),
        category:        raw.category?.slice(0, 100),
        reasoning:       raw.reasoning,
        evidence:        raw.evidence,
        suggestedAction: raw.suggestedAction,
        source:          SuggestionSource.AI_ENGINE,
        watchId:         watch.id,
        sourceId:        watch.id,
        createdBy:       watch.userId,
      } as any);

      const saved = await this.suggestionRepo.save(entity);
      existingTitles.add(normalized);
      created++;

      this.bus?.emit('suggestion.created', saved);
    }

    return created;
  }

  private _mapPriority(raw?: string): SuggestionPriority {
    switch ((raw ?? '').toLowerCase()) {
      case 'critical': return SuggestionPriority.CRITICAL;
      case 'high':     return SuggestionPriority.HIGH;
      case 'low':      return SuggestionPriority.LOW;
      default:         return SuggestionPriority.MEDIUM;
    }
  }
}
