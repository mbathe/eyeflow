/**
 * LlmAgentSelectorService
 *
 * Given a task type + available user LLM agents (from LLMContext.userLlmAgents),
 * selects the most suitable LLM agent to use for that task.
 *
 * Selection strategy (in order of priority):
 *  1. Explicit taskAffinity score > 70 AND skill tag match
 *  2. Best taskAffinity score (any score)
 *  3. Default LLM if flagged
 *  4. First available LLM
 *  5. null (no LLM configured → fallback to env LLM_SERVICE_URL)
 *
 * This service is injected into:
 *  - DAGGeneratorService           — picks the LLM that generates intent → DAG
 *  - RuleCompilerService           — picks the LLM that compiles rule text → IR
 *  - LLMContextEnricherService     — picks the LLM for enrichment calls
 */

import { Injectable, Logger } from '@nestjs/common';
import { LlmTaskType, LlmSkillTag } from '../../llm-config/llm-config.types';

export interface LlmAgentDescriptor {
  configId: string;
  name: string;
  description?: string;
  provider: string;
  model: string;
  isDefault: boolean;
  skills: string[];
  taskAffinities: Array<{ taskType: string; score: number }>;
  systemPrompt?: string;
  temperature: number;
  maxTokens: number;
  responseFormat?: string;
  contextWindow?: number;
}

export interface LlmSelectionResult {
  agent: LlmAgentDescriptor;
  reason: string;
  score: number;
}

@Injectable()
export class LlmAgentSelectorService {
  private readonly logger = new Logger(LlmAgentSelectorService.name);

  /**
   * Select best LLM agent for a given task type.
   *
   * @param taskType   - The LlmTaskType being performed
   * @param agents     - List of user-configured LLM agents from LLMContext
   * @param options    - Optional filters (requiredSkills, minScore)
   */
  selectBest(
    taskType: LlmTaskType | string,
    agents: LlmAgentDescriptor[],
    options: {
      requiredSkills?: (LlmSkillTag | string)[];
      minScore?: number;
    } = {},
  ): LlmSelectionResult | null {
    if (!agents || agents.length === 0) return null;

    const minScore = options.minScore ?? 0;

    // Score each agent
    const scored = agents
      .map((agent) => ({
        agent,
        score: this._computeScore(agent, taskType, options.requiredSkills),
      }))
      .filter((s) => s.score >= minScore)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      // Fallback: return default agent or first
      const fallback = agents.find((a) => a.isDefault) ?? agents[0];
      return { agent: fallback, reason: 'fallback_no_match', score: 0 };
    }

    const winner = scored[0];
    const reason = this._buildReason(winner.agent, taskType);
    this.logger.debug(
      `[LlmSelector] task=${taskType} → ${winner.agent.name} (${winner.agent.model}) score=${winner.score} reason=${reason}`,
    );
    return { agent: winner.agent, reason, score: winner.score };
  }

  /**
   * Select best LLM and return an object suitable for calling the LLM service.
   */
  selectBestAsCallConfig(
    taskType: LlmTaskType | string,
    agents: LlmAgentDescriptor[],
    extraSystemPrompt?: string,
  ): {
    provider: string;
    model: string;
    temperature: number;
    maxTokens: number;
    systemPrompt?: string;
    responseFormat?: string;
    contextWindow?: number;
    configId: string;
  } | null {
    const result = this.selectBest(taskType, agents);
    if (!result) return null;

    const { agent } = result;
    const systemPrompt = [agent.systemPrompt, extraSystemPrompt]
      .filter(Boolean)
      .join('\n\n') || undefined;

    return {
      configId:       agent.configId,
      provider:       agent.provider,
      model:          agent.model,
      temperature:    agent.temperature,
      maxTokens:      agent.maxTokens,
      systemPrompt,
      responseFormat: agent.responseFormat,
      contextWindow:  agent.contextWindow,
    };
  }

  /**
   * Return all agents sorted by their affinity for a task type.
   * Useful for the UI to show "recommended agents" per task.
   */
  rankForTask(
    taskType: LlmTaskType | string,
    agents: LlmAgentDescriptor[],
  ): Array<LlmSelectionResult> {
    return agents
      .map((agent) => ({
        agent,
        score: this._computeScore(agent, taskType),
        reason: this._buildReason(agent, taskType),
      }))
      .sort((a, b) => b.score - a.score);
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private _computeScore(
    agent: LlmAgentDescriptor,
    taskType: string,
    requiredSkills?: string[],
  ): number {
    let score = 0;

    // 1. Explicit task affinity (0-100 → weight x1.5)
    const affinity = agent.taskAffinities.find((a) => a.taskType === taskType);
    if (affinity) score += affinity.score * 1.5;

    // 2. Default bonus
    if (agent.isDefault) score += 20;

    // 3. Skill match bonus
    const agentSkills = new Set(agent.skills);
    const impliedSkills = TASK_TO_SKILLS[taskType] ?? [];
    const matchedImplied = impliedSkills.filter((s) => agentSkills.has(s)).length;
    score += matchedImplied * 15;

    // 4. Required skills check (hard filter via minScore logic in caller)
    if (requiredSkills && requiredSkills.length > 0) {
      const matchedRequired = requiredSkills.filter((s) => agentSkills.has(s)).length;
      const matchRatio = matchedRequired / requiredSkills.length;
      score += matchRatio * 50;
      if (matchedRequired < requiredSkills.length) score *= 0.5; // penalise missing required skills
    }

    // 5. Context window bonus for long-context tasks
    if (LONG_CONTEXT_TASKS.has(taskType as LlmTaskType) && (agent.contextWindow ?? 0) > 64000) {
      score += 10;
    }

    // 6. JSON response format bonus for structured tasks
    if (STRUCTURED_TASKS.has(taskType as LlmTaskType) && agent.responseFormat === 'json_object') {
      score += 10;
    }

    return Math.round(score);
  }

  private _buildReason(agent: LlmAgentDescriptor, taskType: string): string {
    const affinity = agent.taskAffinities.find((a) => a.taskType === taskType);
    if (affinity && affinity.score >= 80) return `high_affinity_${taskType}`;
    if (affinity && affinity.score >= 50) return `medium_affinity_${taskType}`;
    if (agent.isDefault) return 'default_agent';
    const skills = TASK_TO_SKILLS[taskType] ?? [];
    const agentSkills = new Set(agent.skills);
    if (skills.some((s) => agentSkills.has(s))) return `skill_match_${taskType}`;
    return 'best_available';
  }
}

// ─── Task → Implied skills mapping ────────────────────────────────────────────

const TASK_TO_SKILLS: Record<string, LlmSkillTag[]> = {
  [LlmTaskType.RULE_GENERATION]:    [LlmSkillTag.RULE_COMPILER,   LlmSkillTag.INTENT_PARSING, LlmSkillTag.WORKFLOW_DESIGN],
  [LlmTaskType.DAG_COMPILATION]:    [LlmSkillTag.DAG_BUILDER,     LlmSkillTag.RULE_COMPILER,  LlmSkillTag.JSON_SCHEMA],
  [LlmTaskType.CODE_GENERATION]:    [LlmSkillTag.CODE_GENERATION, LlmSkillTag.CODE_REVIEW,    LlmSkillTag.API_DESIGN],
  [LlmTaskType.DATA_ANALYSIS]:      [LlmSkillTag.STATISTICS,      LlmSkillTag.DATA_TRANSFORMATION, LlmSkillTag.SQL_QUERY],
  [LlmTaskType.STRUCTURED_EXTRACT]: [LlmSkillTag.JSON_SCHEMA,     LlmSkillTag.ENTITY_EXTRACTION],
  [LlmTaskType.FUNCTION_CALLING]:   [LlmSkillTag.TOOL_USE,        LlmSkillTag.JSON_SCHEMA],
  [LlmTaskType.REASONING]:          [LlmSkillTag.LOGICAL_REASONING, LlmSkillTag.MATH],
  [LlmTaskType.SUMMARIZATION]:      [LlmSkillTag.SUMMARIZATION,   LlmSkillTag.LONG_CONTEXT],
  [LlmTaskType.TRANSLATION]:        [LlmSkillTag.TRANSLATION,     LlmSkillTag.MULTILINGUAL,   LlmSkillTag.FRENCH],
  [LlmTaskType.CLASSIFICATION]:     [LlmSkillTag.CLASSIFICATION,  LlmSkillTag.SENTIMENT_ANALYSIS],
  [LlmTaskType.QA_ANSWER]:          [LlmSkillTag.DOCUMENT_QA,     LlmSkillTag.LONG_CONTEXT],
  [LlmTaskType.VISION]:             [LlmSkillTag.VISION],
  [LlmTaskType.TEXT_PROCESSING]:    [LlmSkillTag.SUMMARIZATION,   LlmSkillTag.ENTITY_EXTRACTION, LlmSkillTag.MULTILINGUAL],
  [LlmTaskType.CREATIVE_WRITING]:   [LlmSkillTag.CONTENT_CREATION],
};

const LONG_CONTEXT_TASKS = new Set([
  LlmTaskType.QA_ANSWER,
  LlmTaskType.SUMMARIZATION,
  LlmTaskType.DAG_COMPILATION,
  LlmTaskType.RULE_GENERATION,
]);

const STRUCTURED_TASKS = new Set([
  LlmTaskType.DAG_COMPILATION,
  LlmTaskType.STRUCTURED_EXTRACT,
  LlmTaskType.FUNCTION_CALLING,
]);
