import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BrainCircuit, Sparkles, AlertCircle, CheckCircle2, Loader2,
  ChevronRight, Lightbulb, Code2, GitBranch, Zap, Send,
  ArrowRight, RotateCcw, Copy, Check, Filter, Plug, Server,
  Network, ChevronDown, ChevronUp, X, MessageSquare,
  Cpu, WifiOff, ShieldCheck, PenLine, Eye,
  SlidersHorizontal, Bot, Boxes,
  Bell, BarChart3, Play, Pause, Ban, PlayCircle, Gauge, Circle,
  ZoomIn, ZoomOut, Pencil, Save, Maximize2, Minimize2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { manifestApi, llmConfigApi, llmServiceApi, connectorsApi, rulesApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Connector {
  id: string;
  name: string;
  type: string;
  status?: string;       // 'connected' | 'disconnected' | 'error' | 'pending'
  lastTestedAt?: string;
  isHealthy?: boolean;
  nodes?: string[];
  functions?: string[];
  triggers?: string[];
}

interface ManifestConnector {
  id: string;
  name: string;
  type: string;
  category?: string;
  nodes?: Array<{ id: string; name: string; type: string }>;
  functions?: Array<{ id: string; name: string }>;
  triggers?: Array<{ id: string; name: string }>;
  status?: string;
}

interface ServiceItem {
  id: string;
  name: string;
  version?: string;
  description?: string;
}

interface ContextFilter {
  connectorIds: Set<string>;
  serviceIds: Set<string>;
  nodeTypes: Set<string>;
  onlyHealthy: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  rules?: unknown;        // parsed rules object from assistant
  dag?: Record<string, unknown>;
  confidence?: number;
  isLoading?: boolean;
  chat_reply?: string;   // conversational message from the LLM
  feasibility?: {
    feasible: boolean;
    checked_by?: string;
    missing_capabilities: string[];
    unavailable_connectors?: string[];
    warnings?: string[];
    questions_for_user: string[];
    assumptions?: string[];
  };
}

interface GenerationResult {
  workflow_rules?: Record<string, unknown>;
  refined_rules?: Record<string, unknown>;
  rules?: unknown;
  dag?: Record<string, unknown>;
  changes_summary?: string;
  model_used?: string;
  tokens_used?: number;
  generation_time_ms?: number;
  confidence?: number;
  explanation?: string;
  name?: string;
  summary?: string;
  chat_reply?: string;
  feasibility?: {
    feasible: boolean;
    checked_by?: string;
    missing_capabilities: string[];
    unavailable_connectors?: string[];
    warnings?: string[];
    questions_for_user: string[];
    assumptions?: string[];
  };
}

type Step = 'idle' | 'interpreting' | 'compiling' | 'validating' | 'done' | 'error';

// ── DAG / Workflow Graph Types ────────────────────────────────────────────────

type WfNodeType = 'trigger' | 'sensor' | 'analysis' | 'decision' | 'action' | 'notification' | 'unknown';
type WfNodeStatus = 'pending' | 'active' | 'done' | 'blocked' | 'paused';
type ReadLevel = 1 | 2 | 3;

interface WfNode {
  id: string;
  name: string;
  type: WfNodeType;
  description?: string;
  condition?: string;
  thenAction?: string;
  elseAction?: string;
  onError?: string;
  params?: Record<string, unknown>;
  /** Pre-extracted message content for notification/action nodes */
  message?: string;
  /** Pre-extracted channel/destination for notification/action nodes */
  channel?: string;
  /** Pre-extracted subject/objet for notification/action nodes */
  subject?: string;
}

interface WfEdge {
  from: string;
  to: string;
  label?: string;
  isError?: boolean;
}

interface WfGraph {
  nodes: WfNode[];
  edges: WfEdge[];
  title?: string;
  summary?: string;
}

const WF_NODE_CFG: Record<WfNodeType, { label: string; bg: string; border: string; text: string; iconBg: string }> = {
  trigger:      { label: 'Déclencheur', bg: 'bg-blue-950/50',    border: 'border-blue-700/40',    text: 'text-blue-300',    iconBg: 'bg-blue-900/50' },
  sensor:       { label: 'Capteur',     bg: 'bg-cyan-950/50',    border: 'border-cyan-700/40',    text: 'text-cyan-300',    iconBg: 'bg-cyan-900/50' },
  analysis:     { label: 'Analyse',     bg: 'bg-purple-950/50',  border: 'border-purple-700/40',  text: 'text-purple-300',  iconBg: 'bg-purple-900/50' },
  decision:     { label: 'Décision',    bg: 'bg-amber-950/50',   border: 'border-amber-700/40',   text: 'text-amber-300',   iconBg: 'bg-amber-900/50' },
  action:       { label: 'Action',      bg: 'bg-emerald-950/50', border: 'border-emerald-700/40', text: 'text-emerald-300', iconBg: 'bg-emerald-900/50' },
  notification: { label: 'Notification',bg: 'bg-rose-950/50',    border: 'border-rose-700/40',    text: 'text-rose-300',    iconBg: 'bg-rose-900/50' },
  unknown:      { label: 'Étape',       bg: 'bg-zinc-900/30',    border: 'border-zinc-700/40',    text: 'text-zinc-400',    iconBg: 'bg-zinc-800/40' },
};

const WF_NODE_ICON: Record<WfNodeType, React.ElementType> = {
  trigger:      Zap,
  sensor:       Gauge,
  analysis:     BarChart3,
  decision:     GitBranch,
  action:       Play,
  notification: Bell,
  unknown:      Circle,
};

function inferWfNodeType(type: string, name: string): WfNodeType {
  const s = (type + ' ' + name).toLowerCase();
  if (s.match(/trigger|événement|event|capteur|sensor|d[eé]tect|surveille|monitor|watch/)) return 'trigger';
  if (s.match(/capteur|gauge|mesure|temp[eé]rature|tension|pression|consomm|volt|ampère|hz/)) return 'sensor';
  if (s.match(/analys|score|calcul|[eé]value|v[eé]rif|inspecte|corr[eè]le/)) return 'analysis';
  if (s.match(/d[eé]cision|condition|if\b|si\b|branch|switch|choix|compare|seuil|threshold/)) return 'decision';
  if (s.match(/notif|alerte|alert|slack|email|sms|mail|envoi|envoie|message|signal|webhook/)) return 'notification';
  if (s.match(/action|ex[eé]cute|run|lance|active|coupe|bascule|pump|restart|red[eé]marre/)) return 'action';
  return 'unknown';
}

// ── Natural-language serializers ─────────────────────────────────────────────

const OP_LABELS: Record<string, string> = {
  GT: '>', GTE: '≥', LT: '<', LTE: '≤', EQ: '=', NEQ: '≠',
  GREATER_THAN: '>', LESS_THAN: '<', EQUALS: '=', NOT_EQUALS: '≠',
  CONTAINS: 'contient', STARTS_WITH: 'commence par', ENDS_WITH: 'finit par',
  IS_NULL: 'est vide', IS_NOT_NULL: 'est renseigné',
  IN: 'appartient à', NOT_IN: "n'appartient pas à",
};

function humanLabel(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'string' || typeof val === 'number') return String(val);
  if (Array.isArray(val)) return val.map(humanLabel).filter(Boolean).join(', ');
  return '';
}

/** Converts a single condition object {type, config} → readable sentence */
function humanReadableCondition(cond: unknown, depth = 0): string {
  if (cond == null) return '';
  if (typeof cond === 'string') return cond;
  if (typeof cond === 'number' || typeof cond === 'boolean') return String(cond);
  if (Array.isArray(cond)) {
    return cond.map(c => humanReadableCondition(c, depth)).filter(Boolean).join(' ET ');
  }
  const c = cond as Record<string, unknown>;
  const cfg = (c.config ?? c.params ?? c) as Record<string, unknown>;
  const type = String(c.type ?? '').toUpperCase();

  // Aggregation / AND / OR group
  if (type === 'AGGREGATION' || type === 'AND' || type === 'OR' || c.logic != null || c.conditions != null) {
    const subConds = (c.conditions ?? cfg.conditions ?? []) as unknown[];
    const logic = String(c.logic ?? cfg.logic ?? 'AND').toUpperCase();
    const word = logic === 'OR' ? 'OU' : 'ET';
    const parts = subConds.map(sc => humanReadableCondition(sc, depth + 1)).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return depth === 0 ? parts.join(` ${word} `) : `(${parts.join(` ${word} `)})`;
  }

  // SIMPLE condition (most common)
  if (type === 'SIMPLE' || type === 'THRESHOLD' || type === 'COMPARISON') {
    const field     = humanLabel(cfg.field ?? cfg.attribute ?? cfg.key ?? cfg.metric);
    const operator  = OP_LABELS[String(cfg.operator ?? cfg.op ?? '').toUpperCase()] ?? String(cfg.operator ?? cfg.op ?? '');
    const value     = humanLabel(cfg.value ?? cfg.threshold ?? cfg.expected);
    const connector = humanLabel(cfg.connector ?? cfg.datasource ?? cfg.source);
    const node      = humanLabel(cfg.node ?? cfg.table ?? cfg.collection ?? cfg.entity);
    const duration  = humanLabel(cfg.duration ?? cfg.for_duration ?? cfg.sustained_for ?? cfg.window);

    const parts: string[] = [];
    if (connector && node) parts.push(`[${connector} › ${node}]`);
    else if (connector) parts.push(`[${connector}]`);
    else if (node) parts.push(`[${node}]`);
    if (field) parts.push(field);
    if (operator) parts.push(operator);
    if (value) parts.push(value);
    if (duration) parts.push(`pendant ${duration}`);
    return parts.length > 0 ? parts.join(' ') : (field || type);
  }

  // TIME_WINDOW / DURATION
  if (type === 'TIME_WINDOW' || type === 'DURATION') {
    const window = humanLabel(cfg.window ?? cfg.duration ?? cfg.period);
    const metric = humanLabel(cfg.field ?? cfg.metric ?? cfg.attribute);
    return `${metric ? metric + ' ' : ''}mesuré sur ${window || 'une période'}`;
  }

  // Fallback: stringify useful config fields
  const usefulKeys = Object.entries(cfg)
    .filter(([k]) => !['id', 'type', 'kind'].includes(k) && cfg[k] != null)
    .slice(0, 4);
  if (usefulKeys.length > 0) {
    return usefulKeys.map(([k, v]) => `${k}: ${humanLabel(v)}`).join(', ');
  }
  return type || 'Condition';
}

/** Converts an action object {type, config} → readable sentence */
function humanReadableAction(action: unknown): string {
  if (action == null) return '';
  if (typeof action === 'string') return action;
  const a = action as Record<string, unknown>;
  const cfg = (a.config ?? a.params ?? {}) as Record<string, unknown>;
  const type = String(a.type ?? a.action ?? '');
  const connector   = humanLabel(cfg.connector ?? cfg.datasource ?? cfg.service);
  const fn          = humanLabel(cfg.function ?? cfg.method ?? cfg.node ?? cfg.operation);
  const channel     = humanLabel(cfg.channel ?? cfg.to ?? cfg.destination ?? cfg.topic);
  const title       = humanLabel(cfg.title ?? cfg.subject ?? cfg.name);
  const text        = humanLabel(cfg.text ?? cfg.message ?? cfg.content ?? cfg.body);

  const parts: string[] = [];
  if (connector) parts.push(connector);
  if (fn) parts.push(`→ ${fn}`);
  if (channel) parts.push(`(${channel})`);
  const msg = title || text;
  if (msg) parts.push(`"${String(msg).slice(0, 50)}"`);
  return parts.length > 0 ? parts.join(' ') : (type || 'Action');
}

/** Converts a trigger object → readable trigger label */
function humanReadableTrigger(trigger: unknown): string {
  if (trigger == null) return 'Déclencheur';
  if (typeof trigger === 'string') return trigger;
  const t = trigger as Record<string, unknown>;
  const cfg = (t.config ?? {}) as Record<string, unknown>;
  const type = String(t.type ?? '').toUpperCase();

  if (type === 'ON_SCHEDULE') {
    const cron = humanLabel(cfg.cronExpression ?? cfg.cron ?? cfg.schedule);
    if (cron) {
      if (cron.match(/0 0\/(\d+) \*/)) {
        const mins = cron.match(/0 0\/(\d+) \*/)![1];
        return `Toutes les ${mins} minute${Number(mins) > 1 ? 's' : ''}`;
      }
      if (cron.match(/0 \* \* \* \*/)) return 'Chaque heure';
      if (cron.match(/0 0 \* \* \*/)) return 'Chaque jour à minuit';
      return `Planifié : ${cron}`;
    }
    return 'Planifié';
  }
  if (type === 'ON_WEBHOOK') return 'Appel webhook entrant';
  if (type === 'ON_WORKFLOW_START') return 'Au démarrage du workflow';
  if (type === 'ON_TASK_COMPLETED') {
    const task = humanLabel(cfg.task_type ?? cfg.taskType ?? cfg.name);
    return task ? `Après complétion de : ${task}` : 'Tâche terminée';
  }
  if (type === 'ON_CHANGE') {
    const field = humanLabel(cfg.field ?? cfg.attribute);
    const conn  = humanLabel(cfg.connector ?? cfg.source);
    return `Changement détecté${field ? ` sur ${field}` : ''}${conn ? ` (${conn})` : ''}`;
  }
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Déclencheur';
}

// ── Main DAG parser ───────────────────────────────────────────────────────────

function parseWfDag(raw: Record<string, unknown>): WfGraph {
  let nodes: WfNode[] = [];
  let edges: WfEdge[] = [];

  // Unwrap workflow_rules wrapper if present
  const root: Record<string, unknown> = (raw.workflow_rules != null && typeof raw.workflow_rules === 'object')
    ? (raw.workflow_rules as Record<string, unknown>)
    : raw;

  const title   = humanLabel(root.workflow_name ?? root.name ?? raw.name ?? raw.title) || undefined;
  const summary = humanLabel(root.description   ?? raw.summary ?? raw.description)     || undefined;

  // ── Priority 1: use rules[].display steps if the LLM emitted them ──────────
  const rulesRaw: Array<Record<string, unknown>> = Array.isArray(root.rules) ? root.rules as Array<Record<string, unknown>> : [];

  if (rulesRaw.length > 0 && rulesRaw[0].display != null) {
    rulesRaw.forEach((rule, rIdx) => {
      const disp = rule.display as Record<string, unknown> | undefined;
      if (!disp) return;
      const steps = Array.isArray(disp.steps) ? disp.steps as Array<Record<string, unknown>> : [];
      const ruleTitle  = humanLabel(disp.title ?? rule.name) || `Règle ${rIdx + 1}`;
      const dataFlow   = humanLabel(disp.data_flow) || undefined;
      const constraints = Array.isArray(disp.constraints) ? (disp.constraints as unknown[]).map(c => humanLabel(c)).filter(Boolean) : [];

      if (steps.length === 0) {
        // Minimal: one node from rule description
        const nid = `rule_${rIdx}`;
        nodes.push({
          id: nid, name: ruleTitle,
          type: 'action',
          description: humanLabel(disp.summary ?? rule.description) || undefined,
          params: rule,
        });
        if (nodes.length > 1) edges.push({ from: nodes[nodes.length - 2].id, to: nid });
        return;
      }

      // Build index of compilation.actions keyed by their sequential index among
      // notification/action steps — so we can look up the full config.message.
      const compilationActions: Array<Record<string, unknown>> = (() => {
        const comp = rule.compilation as Record<string, unknown> | undefined;
        const acts = comp?.actions ?? rule.actions;
        return Array.isArray(acts) ? (acts as Array<Record<string, unknown>>) : [];
      })();
      let actionStepIdx = 0; // tracks which compilation action corresponds to current step

      steps.forEach((step, sIdx) => {
        const nid = `r${rIdx}_s${sIdx}`;
        const stepType = inferWfNodeType(String(step.type ?? ''), String(step.label ?? ''));
        const isNotifOrAction = stepType === 'notification' || stepType === 'action';

        // Cross-reference compilation.actions for full message content
        let fullMessage: string | undefined;
        let fullChannel: string | undefined;
        let fullSubject: string | undefined;
        if (isNotifOrAction) {
          const compAct = compilationActions[actionStepIdx] as Record<string, unknown> | undefined;
          const compCfg = compAct ? ((compAct.config ?? compAct.params ?? compAct) as Record<string, unknown>) : {};
          // Prefer compilation config (has complete message) over display preview
          fullMessage = humanLabel(compCfg.message ?? compCfg.text ?? compCfg.content ?? compCfg.body) ||
                        humanLabel(step.message_preview) || undefined;
          fullChannel = humanLabel(compCfg.channel ?? compCfg.to ?? compCfg.destination ?? compCfg.topic) ||
                        humanLabel(step.connector) || undefined;
          fullSubject = humanLabel(compCfg.subject ?? compCfg.title ?? compCfg.objet) || undefined;
          actionStepIdx++;
        }

        const node: WfNode = {
          id: nid,
          name: humanLabel(step.label) || `Étape ${sIdx + 1}`,
          type: stepType,
          description: humanLabel(step.detail) || undefined,
          condition:   humanLabel(step.condition_natural) || undefined,
          thenAction:  humanLabel(step.then_natural) || undefined,
          elseAction:  humanLabel(step.else_natural ?? step.otherwise_natural) || undefined,
          onError:     humanLabel(step.on_error) || undefined,
          message: fullMessage,
          channel: fullChannel,
          subject: fullSubject,
          params: Object.assign({}, step, {
            _dataFlow: dataFlow,
            _constraints: constraints,
          }),
        };
        nodes.push(node);
        if (sIdx > 0) {
          const prev = `r${rIdx}_s${sIdx - 1}`;
          const isDecision = steps[sIdx - 1].type === 'decision';
          edges.push({ from: prev, to: nid, label: isDecision ? 'Condition vérifiée ✓' : undefined });
        }
      });
    });
    if (nodes.length > 0) return { nodes, edges, title, summary };
  }

  // ── Priority 2: parse raw rules[] with {trigger, conditions[], actions[]} ──
  if (rulesRaw.length > 0) {
    rulesRaw.forEach((rule, rIdx) => {
      const compilation = (rule.compilation as Record<string, unknown> | undefined) ?? rule;
      const ruleTitle   = humanLabel(rule.name ?? rule.description) || `Règle ${rIdx + 1}`;

      // Trigger node
      const triggerRaw = compilation.trigger ?? rule.trigger;
      const trigLabel  = triggerRaw != null ? humanReadableTrigger(triggerRaw) : humanLabel(rule.event ?? rule.sensor ?? rule.source) || `Déclencheur ${rIdx + 1}`;
      const trigType   = String((triggerRaw as Record<string, unknown> | null)?.type ?? '');
      const trigId = `trig_${rIdx}`;
      nodes.push({
        id: trigId,
        name: trigLabel,
        type: 'trigger',
        description: ruleTitle !== trigLabel ? ruleTitle : (humanLabel(rule.description) || undefined),
        params: typeof triggerRaw === 'object' && triggerRaw ? (triggerRaw as Record<string, unknown>) : rule,
      });
      if (trigType.includes('SCHEDULE')) {
        const sensorCron = humanLabel((triggerRaw as Record<string, unknown> | null)?.config != null
          ? ((triggerRaw as Record<string, unknown>).config as Record<string, unknown>).cronExpression : '');
        if (sensorCron) {
          // add sensor timing visually already baked into trigger label
        }
      }

      // Sensor node (if connector data source detected in conditions)
      const conditionsRaw: unknown[] = Array.isArray(compilation.conditions ?? rule.conditions)
        ? (compilation.conditions ?? rule.conditions) as unknown[]
        : [];

      // — Detect primary data source from first SIMPLE condition
      let sensorNodeId: string | null = null;
      const firstSimple = conditionsRaw.find(c => {
        if (c == null || typeof c !== 'object') return false;
        const cc = c as Record<string, unknown>;
        const cfg = (cc.config ?? cc) as Record<string, unknown>;
        return (cc.type === 'SIMPLE' || cc.type === 'THRESHOLD') && (cfg.connector != null || cfg.node != null);
      }) as Record<string, unknown> | undefined;

      if (firstSimple) {
        const cfg = (firstSimple.config ?? firstSimple) as Record<string, unknown>;
        const sourceConn = humanLabel(cfg.connector ?? cfg.datasource ?? cfg.source);
        const sourceNode = humanLabel(cfg.node ?? cfg.table ?? cfg.collection);
        if (sourceConn || sourceNode) {
          const sensorId = `sensor_${rIdx}`;
          sensorNodeId = sensorId;
          nodes.push({
            id: sensorId,
            name: [sourceConn, sourceNode].filter(Boolean).join(' › ') || 'Capteur',
            type: 'sensor',
            description: `Lecture de ${humanLabel(cfg.field ?? 'la mesure')} en temps réel`,
            params: cfg,
          });
          edges.push({ from: trigId, to: sensorId });
        }
      }

      // Decision node — all conditions merged into natural language
      if (conditionsRaw.length > 0) {
        const condId = `cond_${rIdx}`;
        const condText = conditionsRaw.map(c => humanReadableCondition(c)).filter(Boolean).join(' ET ');

        // Extract then/else from rule or compilation
        const thenRaw   = compilation.then ?? rule.then;
        const otherwiseRaw = compilation.otherwise ?? rule.otherwise ?? rule.else;
        const actionsRaw: unknown[] = Array.isArray(compilation.actions ?? rule.actions)
          ? (compilation.actions ?? rule.actions) as unknown[]
          : Array.isArray(thenRaw) ? thenRaw as unknown[] : [];

        const thenText = actionsRaw.length > 0
          ? actionsRaw.slice(0, 2).map(humanReadableAction).filter(Boolean).join(', puis ')
          : (thenRaw != null ? humanLabel(thenRaw) : undefined) || 'Déclencher les actions';

        nodes.push({
          id: condId,
          name: 'Vérification de condition',
          type: 'decision',
          condition:  condText || 'Vérification…',
          thenAction: thenText,
          elseAction: otherwiseRaw != null ? humanLabel(otherwiseRaw) : 'Continuer la surveillance',
          onError:    humanLabel(compilation.on_error ?? rule.on_error) || undefined,
          params: rule,
        });
        edges.push({ from: sensorNodeId ?? trigId, to: condId });

        // Action nodes (one per action, max 3) — "then" branch
        const actionsToShow: unknown[] = actionsRaw.length > 0 ? actionsRaw.slice(0, 3)
          : thenRaw != null ? [thenRaw] : [];
        const hasElseBranch = otherwiseRaw != null && otherwiseRaw !== '';
        let prevId = condId;
        actionsToShow.forEach((act, aIdx) => {
          const aId = `act_${rIdx}_${aIdx}`;
          const actLabel = humanReadableAction(act);
          const aRaw = act as Record<string, unknown> | null;
          const cfg = aRaw != null ? ((aRaw.config ?? aRaw.params ?? aRaw) as Record<string, unknown>) : {};
          const connector  = humanLabel(cfg.connector ?? cfg.service ?? cfg.datasource);
          const msgContent = humanLabel(cfg.message ?? cfg.text ?? cfg.content ?? cfg.body);
          const channelDst = humanLabel(cfg.channel ?? cfg.to ?? cfg.destination ?? cfg.topic);
          const actType = String((aRaw as Record<string, unknown> | null)?.type ?? '');
          const isNotif = inferWfNodeType(actType, actLabel) === 'notification';
          nodes.push({
            id: aId,
            name: actLabel || `Action ${aIdx + 1}`,
            type: isNotif ? 'notification' : inferWfNodeType(actType, actLabel),
            description: connector ? `via ${connector}` : undefined,
            params: aRaw ?? undefined,
            message: msgContent || undefined,
            channel: channelDst || undefined,
            subject: humanLabel(cfg.subject ?? cfg.title ?? cfg.objet) || undefined,
          });
          edges.push({
            from: prevId, to: aId,
            // Only label "Oui ✓" on the first action, and only when there is an else branch
            label: aIdx === 0 && hasElseBranch ? 'Oui ✓' : undefined,
          });
          prevId = aId;
        });

        // Else branch: real node connected directly to the decision node
        if (hasElseBranch) {
          const elseId = `else_${rIdx}`;
          const elseRaw = typeof otherwiseRaw === 'object' && otherwiseRaw !== null
            ? (otherwiseRaw as Record<string, unknown>) : null;
          const elseCfg = elseRaw ? ((elseRaw.config ?? elseRaw.params ?? elseRaw) as Record<string, unknown>) : {};
          const elseLabel = typeof otherwiseRaw === 'string'
            ? otherwiseRaw
            : humanReadableAction(otherwiseRaw);
          const elseMsg     = humanLabel(elseCfg.message ?? elseCfg.text ?? elseCfg.content ?? elseCfg.body);
          const elseChan    = humanLabel(elseCfg.channel ?? elseCfg.to ?? elseCfg.destination ?? elseCfg.topic);
          const elseActType = String(elseRaw?.type ?? '');
          const elseIsNotif = elseRaw != null && inferWfNodeType(elseActType, elseLabel) === 'notification';
          nodes.push({
            id: elseId,
            name: elseLabel || 'Continuer la surveillance',
            type: elseIsNotif ? 'notification'
              : (elseRaw ? inferWfNodeType(elseActType, elseLabel) : 'unknown'),
            description: 'Condition non vérifiée',
            params: elseRaw ?? undefined,
            message: elseMsg || undefined,
            channel: elseChan || undefined,
            subject: humanLabel(elseCfg.subject ?? elseCfg.title ?? elseCfg.objet) || undefined,
          });
          edges.push({ from: condId, to: elseId, label: 'Non ✗' });
        }

        // Resilience / error handling node
        const resilience = compilation.resilience ?? rule.resilience;
        if (resilience != null && typeof resilience === 'object') {
          const res = resilience as Record<string, unknown>;
          const retry = res.retry as Record<string, unknown> | undefined;
          const fallback = humanLabel(res.fallback_action ?? res.fallback);
          if (retry || fallback) {
            const errId = `err_${rIdx}`;
            const maxAttempts = retry?.max_attempts != null ? `${retry.max_attempts} tentatives` : '';
            const fallbackText = fallback ? `puis ${fallback}` : '';
            nodes.push({
              id: errId,
              name: 'Gestion des erreurs',
              type: 'unknown',
              description: [maxAttempts, fallbackText].filter(Boolean).join(', ') || 'Résilience configurée',
              onError: 'Circuit breaker activé si défaillance répétée',
              params: res,
            });
            edges.push({ from: prevId, to: errId, label: 'En cas d\'échec', isError: true });
          }
        }
      } else {
        // No conditions — direct action chain
        const actionsRaw: unknown[] = Array.isArray(compilation.actions ?? rule.actions)
          ? (compilation.actions ?? rule.actions) as unknown[]
          : [];
        let prevId = sensorNodeId ?? trigId;
        (actionsRaw.length > 0 ? actionsRaw.slice(0, 3) : [rule]).forEach((act, aIdx) => {
          const aId = `act_direct_${rIdx}_${aIdx}`;
          const actLabel = humanReadableAction(act);
          const aRaw = act as Record<string, unknown>;
          const cfg = ((aRaw.config ?? aRaw.params ?? aRaw) as Record<string, unknown>);
          const msgContent = humanLabel(cfg.message ?? cfg.text ?? cfg.content ?? cfg.body);
          const channelDst = humanLabel(cfg.channel ?? cfg.to ?? cfg.destination ?? cfg.topic);
          nodes.push({
            id: aId,
            name: actLabel || humanLabel(aRaw.action) || `Action ${aIdx + 1}`,
            type: inferWfNodeType(String(aRaw.type ?? ''), actLabel),
            params: aRaw,
            message: msgContent || undefined,
            channel: channelDst || undefined,
            subject: humanLabel(cfg.subject ?? cfg.title ?? cfg.objet) || undefined,
          });
          edges.push({ from: prevId, to: aId });
          prevId = aId;
        });
      }
    });

    if (nodes.length > 0) return { nodes, edges, title, summary };
  }

  // ── Priority 3: nodes/steps array (generic) ─────────────────────────────────
  const rawNodes = raw.nodes ?? raw.steps ?? null;
  const rawEdges = raw.edges ?? raw.connections ?? raw.links ?? null;
  if (Array.isArray(rawNodes) && rawNodes.length > 0) {
    nodes = (rawNodes as Array<Record<string, unknown>>).map((n, i) => {
      const nName = humanLabel(n.name ?? n.label ?? n.id) || `Étape ${i + 1}`;
      return {
        id: String(n.id ?? `node_${i}`),
        name: nName,
        type: inferWfNodeType(String(n.type ?? n.kind ?? ''), nName),
        description: humanLabel(n.description ?? n.summary) || undefined,
        condition:   n.condition != null ? humanReadableCondition(n.condition) : humanLabel(n.when ?? n.threshold) || undefined,
        thenAction:  humanLabel(n.then ?? n.thenAction) || undefined,
        elseAction:  humanLabel(n.else ?? n.elseAction ?? n.otherwise) || undefined,
        onError:     humanLabel(n.on_error ?? n.onError) || undefined,
        params: n,
      };
    });
    if (Array.isArray(rawEdges) && rawEdges.length > 0) {
      edges = (rawEdges as Array<Record<string, unknown>>).map(e => ({
        from: String(e.from ?? e.source ?? e.sourceId ?? ''),
        to:   String(e.to   ?? e.target ?? e.targetId ?? ''),
        label: humanLabel(e.label ?? e.condition) || undefined,
        isError: Boolean(e.isError ?? e.error ?? e.onError),
      }));
    } else {
      edges = nodes.slice(0, -1).map((n, i) => ({ from: n.id, to: nodes[i + 1].id }));
    }
    return { nodes, edges, title, summary };
  }

  // ── Priority 4: top-level keys fallback ─────────────────────────────────────
  const skip = new Set(['version', 'metadata', 'workflow_name', 'workflow_rules', 'name', 'title',
    'summary', 'description', 'confidence', 'model_used', 'tokens_used', 'generation_time_ms',
    'model_version', 'explanation']);
  nodes = Object.entries(raw)
    .filter(([k]) => !skip.has(k) && raw[k] != null)
    .slice(0, 10)
    .map(([k, v]) => ({
      id: k,
      name: k.replace(/_/g, ' ').replace(/\b([a-z])/g, l => l.toUpperCase()),
      type: inferWfNodeType(k, ''),
      description: typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v),
      params: typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined,
    }));
  edges = nodes.slice(0, -1).map((n, i) => ({ from: n.id, to: nodes[i + 1].id }));
  return { nodes, edges, title, summary };
}

// ── Tree graph builder (forest: supports multiple disconnected root trees) ────

interface TreeNode {
  node: WfNode;
  children: { child: TreeNode; edge: WfEdge }[];
}

/**
 * Returns ALL root trees (nodes with no incoming edges).
 * Multiple independent rules → multiple trees rendered side by side.
 */
function buildForestFromGraph(nodes: WfNode[], edges: WfEdge[]): TreeNode[] {
  if (nodes.length === 0) return [];
  const targets = new Set(edges.map(e => e.to));
  const roots = nodes.filter(n => !targets.has(n.id));

  function build(nodeId: string, visited = new Set<string>()): TreeNode | null {
    if (visited.has(nodeId)) return null;
    visited.add(nodeId);
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return null;
    const children = edges
      .filter(e => e.from === nodeId)
      // Pass a copy of visited so diamond shapes work per-branch
      .map(e => { const child = build(e.to, new Set(visited)); return child ? { child, edge: e } : null; })
      .filter((x): x is { child: TreeNode; edge: WfEdge } => x !== null);
    return { node, children };
  }

  const forest = (roots.length > 0 ? roots : nodes.slice(0, 1))
    .map(r => build(r.id))
    .filter((t): t is TreeNode => t !== null);
  return forest;
}

// ── Quick intent chips ────────────────────────────────────────────────────────

const QUICK_INTENTS = [
  'Alerter sur Slack si la tension dépasse 240V pendant 5 minutes',
  'Couper le pompage si la pression descend sous 1.5 bar',
  'Rapport quotidien à 8h sur la consommation énergétique',
  'Basculer sur le générateur si le réseau est indisponible 30s',
  'Déclencher une alarme si le transformateur dépasse 80°C',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function msgId() {
  return Math.random().toString(36).slice(2);
}

function formatMs(ms?: number) {
  if (!ms) return '';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function getStatusColor(status?: string) {
  switch (status) {
    case 'connected':    return 'bg-emerald-500';
    case 'disconnected': return 'bg-zinc-500';
    case 'error':        return 'bg-red-500';
    default:             return 'bg-amber-500';
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 85 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
  const label = pct >= 85 ? 'Haute confiance' : pct >= 60 ? 'Modérée' : 'Faible';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-bold font-mono" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// WorkflowSummaryCard — compact natural-language flow shown inside chat bubble
function WorkflowSummaryCard({ dag }: { dag: Record<string, unknown> }) {
  const parsed = parseWfDag(dag);
  if (parsed.nodes.length === 0) return null;

  const NODE_EMOJI: Record<WfNodeType, string> = {
    trigger: '⚡', sensor: '📡', analysis: '📊',
    decision: '🔀', action: '⚙️', notification: '📣', unknown: '▸',
  };

  return (
    <div className="rounded-xl border border-emerald-800/30 bg-emerald-950/10 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-emerald-800/20">
        <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5" />
          {parsed.title ?? 'Workflow compilé'}
        </span>
        <span className="text-[10px] text-muted-foreground/50">{parsed.nodes.length} étape{parsed.nodes.length > 1 ? 's' : ''}</span>
      </div>
      {/* Flow strip */}
      <div className="px-3 py-2.5 flex flex-wrap items-center gap-1.5">
        {parsed.nodes.map((node, i) => {
          const cfg = WF_NODE_CFG[node.type];
          return (
            <div key={node.id} className="flex items-center gap-1.5">
              <span className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg border ${cfg.bg} ${cfg.border} ${cfg.text} font-medium`}>
                <span>{NODE_EMOJI[node.type]}</span>
                <span className="max-w-[110px] truncate">{node.name}</span>
              </span>
              {i < parsed.nodes.length - 1 && (
                <ArrowRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
              )}
            </div>
          );
        })}
      </div>
      {parsed.summary && (
        <div className="px-3 pb-2.5">
          <p className="text-[11px] text-muted-foreground/60 italic">{parsed.summary}</p>
        </div>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps: Step[] = ['interpreting', 'compiling', 'validating'];
  const stepLabels = ['Interpréter', 'Compiler', 'Valider'];
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => {
        const stepOrder = ['interpreting', 'compiling', 'validating', 'done'];
        const currentIdx = stepOrder.indexOf(step);
        const thisIdx = stepOrder.indexOf(s);
        const done = currentIdx > thisIdx || step === 'done';
        const active = step === s;
        return (
          <div key={s} className="flex items-center gap-1.5">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all border ${
              done   ? 'bg-emerald-500 border-emerald-500 text-white' :
              active ? 'bg-primary/20 border-primary text-primary animate-pulse' :
              'bg-muted/20 border-border/50 text-muted-foreground/50'
            }`}>
              {done ? <Check className="h-2.5 w-2.5" /> : i + 1}
            </div>
            <span className={`text-[10px] hidden sm:block ${active ? 'text-primary' : done ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
              {stepLabels[i]}
            </span>
            {i < 2 && <ArrowRight className="h-2.5 w-2.5 text-border/50 shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

// ── DAG Node Connector (arrow between nodes) ─────────────────────────────────

function WfConnector({ label, isError, active }: { label?: string; isError?: boolean; active?: boolean }) {
  const lineColor = active ? 'bg-emerald-500/70' : isError ? 'bg-red-700/40' : 'bg-border/40';
  const labelColor = isError
    ? 'bg-red-900/20 border-red-700/30 text-red-400/80'
    : 'bg-muted/20 border-border/30 text-muted-foreground/60';
  return (
    <div className="flex flex-col items-center">
      <div className={`w-px h-3 transition-all duration-500 ${lineColor}`} />
      {label && (
        <div className={`text-[10px] px-2.5 py-0.5 my-0.5 rounded-full border font-medium transition-all ${labelColor}`}>
          {label}
        </div>
      )}
      <div className={`w-px h-3 transition-all duration-500 ${lineColor}`} />
      {/* Arrow head */}
      <div className={`w-0 h-0 transition-all duration-500 ${
        active ? 'border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-emerald-500/70'
        : isError ? 'border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-red-700/40'
        : 'border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-border/40'
      }`} />
    </div>
  );
}

// ── DAG Tree Node Card (expandable + editable) ────────────────────────────────

interface WfNodeCardProps {
  node: WfNode;
  status: WfNodeStatus;
  readLevel: ReadLevel;
  defaultExpanded?: boolean;
}

function WfNodeCard({ node, status, readLevel, defaultExpanded = true }: WfNodeCardProps) {
  const [nodeAction, setNodeAction] = useState<'validated' | 'paused' | 'blocked' | null>(null);
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Message/channel/subject state for notification/action nodes
  const rawParams = (node.params ?? {}) as Record<string, unknown>;
  const rawCfg = (rawParams.config ?? rawParams.params ?? rawParams) as Record<string, unknown>;
  // Prefer pre-extracted fields (from parseWfDag), fall back to deep params traversal
  const initialMsg = node.message
    ?? String(rawCfg.message ?? rawCfg.text ?? rawCfg.content ?? rawCfg.body ?? rawCfg.message_preview ?? '');
  const initialCh  = node.channel
    ?? String(rawCfg.channel ?? rawCfg.to ?? rawCfg.destination ?? rawCfg.topic ?? rawCfg.connector ?? '');
  const initialSubject = node.subject
    ?? String(rawCfg.subject ?? rawCfg.title ?? rawCfg.objet ?? '');
  const [editMode, setEditMode] = useState(false);
  const [msgText, setMsgText]         = useState(initialMsg);
  const [channelText, setChannelText] = useState(initialCh);
  const [subjectText, setSubjectText] = useState(initialSubject);
  const [saved, setSaved] = useState(false);
  // Show the message card for ALL notification/action nodes (even when content is empty = invite to fill in)
  const isMsgNode = node.type === 'notification' || node.type === 'action';
  const canEdit   = isMsgNode;

  const handleSave = () => {
    setSaved(true);
    setEditMode(false);
    setTimeout(() => setSaved(false), 2000);
  };

  const cfg = WF_NODE_CFG[node.type];
  const Icon = WF_NODE_ICON[node.type];

  const ringStyle =
    status === 'active'  ? 'ring-2 ring-primary/60 shadow-xl shadow-primary/15 scale-[1.02]' :
    status === 'done'    ? 'opacity-80 ring-1 ring-emerald-700/30' :
    status === 'blocked' ? 'ring-2 ring-red-700/50 opacity-60' :
    status === 'paused'  ? 'ring-2 ring-amber-700/50' : '';

  return (
    <div
      className={`relative rounded-xl border transition-all duration-300 select-none ${cfg.bg} ${cfg.border} ${ringStyle}`}
      style={{ minWidth: 220, maxWidth: 320 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ── Header row (click to expand/collapse) ── */}
      <div
        className="flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${cfg.border} ${cfg.iconBg} ${status === 'active' ? 'animate-pulse' : ''}`}>
          {status === 'active'  ? <Loader2 className={`h-4 w-4 animate-spin ${cfg.text}`} /> :
           status === 'done'    ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> :
           status === 'blocked' ? <Ban className="h-4 w-4 text-red-400" /> :
           <Icon className={`h-4 w-4 ${cfg.text}`} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap leading-none">
            <span className="text-[13px] font-semibold text-foreground/90 truncate">{node.name}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-widest border shrink-0 ${cfg.text} ${cfg.border}`}>{cfg.label}</span>
            {nodeAction === 'validated' && <span className="text-[10px] text-emerald-400 font-medium">✓</span>}
            {nodeAction === 'paused'    && <span className="text-[10px] text-amber-400 font-medium">⏸</span>}
            {nodeAction === 'blocked'   && <span className="text-[10px] text-red-400 font-medium">✕</span>}
            {saved && <span className="text-[10px] text-emerald-400 font-medium">💾</span>}
          </div>
          {!expanded && node.description && (
            <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">{node.description}</p>
          )}
          {!expanded && node.condition && (
            <p className="text-[11px] text-amber-400/60 truncate mt-0.5">Si {node.condition}</p>
          )}
          {!expanded && canEdit && (msgText || channelText || subjectText) && (
            <p className="text-[11px] text-muted-foreground/50 truncate mt-0.5 font-mono">
              {channelText && `→ ${channelText}`}{subjectText && channelText ? ' · ' : ''}{subjectText && `« ${subjectText.slice(0, 24)}»`}{msgText && (channelText || subjectText) ? ' · ' : ''}{msgText && `"${msgText.slice(0, 22)}…"`}
            </p>
          )}
        </div>
        <div className={`shrink-0 ${cfg.text} opacity-40`}>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </div>
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="px-3.5 pb-3.5 space-y-3 border-t border-border/20 pt-3">

          {/* Level 1 — Vue Métier */}
          {readLevel === 1 && (
            <div className="space-y-2">
              {node.description && (
                <p className="text-xs text-muted-foreground leading-relaxed">{node.description}</p>
              )}
              {node.type === 'decision' && node.condition && (
                <div className="space-y-1.5 pl-2 border-l-2 border-amber-700/30">
                  <div className="flex items-start gap-2 text-xs">
                    <span className="text-amber-400 font-bold shrink-0 w-6 pt-px">Si</span>
                    <span className="text-foreground/85 leading-relaxed">{node.condition}</span>
                  </div>
                  {node.thenAction && (
                    <div className="flex items-start gap-2 text-xs">
                      <span className="text-emerald-400 font-bold shrink-0 w-6 pt-px">↓</span>
                      <span className="text-muted-foreground leading-relaxed">{node.thenAction}</span>
                    </div>
                  )}
                  {node.elseAction && (
                    <div className="flex items-start gap-2 text-xs">
                      <span className="text-zinc-500 font-bold shrink-0 w-6 pt-px">↳</span>
                      <span className="text-muted-foreground/60 italic leading-relaxed">{node.elseAction}</span>
                    </div>
                  )}
                </div>
              )}
              {canEdit && (
                <div className="border border-border/30 rounded-lg bg-black/20 overflow-hidden">
                  <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border/20">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Contenu du message</span>
                    <button
                      onClick={e => { e.stopPropagation(); setEditMode(m => !m); }}
                      className={`text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-colors ${editMode ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {editMode ? <><Save className="h-3 w-3" /> Édition…</> : <><Pencil className="h-3 w-3" /> Modifier</>}
                    </button>
                  </div>
                  <div className="p-2.5 space-y-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide block mb-1">Canal / Destination</label>
                      {editMode
                        ? <input value={channelText} onChange={e => setChannelText(e.target.value)} placeholder="ex: #alertes, admin@example.com…" onClick={e => e.stopPropagation()} className="w-full text-xs bg-background/40 border border-border/40 rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 font-mono placeholder:text-muted-foreground/30" />
                        : channelText
                          ? <p className="text-xs text-cyan-300/80 font-mono">{channelText}</p>
                          : <p className="text-[11px] text-muted-foreground/30 italic">Non défini — cliquer Modifier</p>}
                    </div>
                    {(subjectText || editMode) && (
                      <div>
                        <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide block mb-1">Objet / Titre</label>
                        {editMode
                          ? <input value={subjectText} onChange={e => setSubjectText(e.target.value)} placeholder="ex: Alerte tension élevée…" onClick={e => e.stopPropagation()} className="w-full text-xs bg-background/40 border border-border/40 rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/30" />
                          : <p className="text-xs text-amber-200/70 font-semibold leading-relaxed">{subjectText}</p>}
                      </div>
                    )}
                    <div>
                      <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide block mb-1">Message envoyé</label>
                      {editMode
                        ? <textarea value={msgText} onChange={e => setMsgText(e.target.value)} placeholder="Contenu du message ou template…" onClick={e => e.stopPropagation()} rows={4} className="w-full text-xs bg-background/40 border border-border/40 rounded px-2 py-1 text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/30" />
                        : msgText
                          ? <p className="text-xs text-muted-foreground/80 leading-relaxed break-words whitespace-pre-wrap">{msgText}</p>
                          : node.description
                            ? <p className="text-xs text-muted-foreground/50 italic leading-relaxed">{node.description}</p>
                            : <p className="text-[11px] text-muted-foreground/30 italic">Non défini — cliquer Modifier</p>}
                    </div>
                    {editMode && (
                      <button onClick={e => { e.stopPropagation(); handleSave(); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary text-xs rounded-lg transition-all w-full justify-center font-semibold">
                        <Save className="h-3.5 w-3.5" /> Sauvegarder
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Level 2 — Vue Logique */}
          {readLevel === 2 && (
            <div className="space-y-2">
              {node.condition && (
                <div className="rounded-lg bg-black/20 border border-amber-800/30 px-2.5 py-1.5">
                  <p className="text-[10px] font-semibold text-amber-500/60 uppercase tracking-wide mb-1">Condition(s) évaluée(s)</p>
                  <p className="text-xs text-foreground/80 leading-relaxed">{node.condition}</p>
                </div>
              )}
              {node.description && node.type !== 'decision' && (
                <p className="text-xs text-muted-foreground leading-relaxed">{node.description}</p>
              )}
              {node.thenAction && (
                <div className="flex items-start gap-2 text-xs">
                  <span className="text-emerald-400 font-semibold shrink-0 w-20">Cas nominal :</span>
                  <span className="text-muted-foreground">{node.thenAction}</span>
                </div>
              )}
              {node.elseAction && (
                <div className="flex items-start gap-2 text-xs">
                  <span className="text-zinc-500 font-semibold shrink-0 w-20">Sinon :</span>
                  <span className="text-muted-foreground/60 italic">{node.elseAction}</span>
                </div>
              )}
              {node.onError && (
                <div className="flex items-start gap-2 text-xs text-red-400/80">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>En cas d'échec : {node.onError}</span>
                </div>
              )}
              {Array.isArray(node.params?._constraints) && (node.params._constraints as string[]).length > 0 && (
                <div className="rounded-lg bg-black/20 border border-blue-800/30 px-2.5 py-1.5">
                  <p className="text-[10px] font-semibold text-blue-400/60 uppercase tracking-wide mb-1">Contraintes</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(node.params._constraints as string[]).map((c, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/25 border border-blue-700/25 text-blue-300/80">{c}</span>
                    ))}
                  </div>
                </div>
              )}
              {typeof node.params?._dataFlow === 'string' && node.params._dataFlow && (
                <div className="flex items-start gap-2 text-xs">
                  <span className="text-cyan-400/60 font-semibold shrink-0">Flux :</span>
                  <span className="text-muted-foreground/70 font-mono">{String(node.params._dataFlow)}</span>
                </div>
              )}
            </div>
          )}

          {/* Level 3 — Vue Technique */}
          {readLevel === 3 && node.params && (() => {
            const SYNTHETIC = new Set(['_dataFlow', '_constraints']);
            const cleanParams = Object.fromEntries(Object.entries(node.params).filter(([k]) => !SYNTHETIC.has(k)));
            if (Object.keys(cleanParams).length === 0) return null;
            return (
              <div>
                <p className="text-[10px] font-semibold text-violet-400/60 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Code2 className="h-3 w-3" /> Paramètres techniques
                </p>
                <pre className="text-[10px] font-mono text-violet-300/70 bg-black/25 rounded-lg px-2.5 py-2 overflow-auto max-h-40 leading-relaxed border border-violet-900/30">
                  {JSON.stringify(cleanParams, null, 2)}
                </pre>
              </div>
            );
          })()}

          {/* Action buttons */}
          <div className={`flex items-center gap-1.5 pt-1 border-t border-border/20 transition-all ${hovered ? 'opacity-100' : 'opacity-0'}`}>
            <span className="text-[10px] text-muted-foreground/40 mr-auto">Nœud :</span>
            {[
              ['validated', 'bg-emerald-700/40 border-emerald-600/40 text-emerald-300', 'bg-emerald-900/20 hover:bg-emerald-900/40 border-emerald-800/30 text-emerald-400/70', CheckCircle2, 'Valider'],
              ['paused',    'bg-amber-700/40 border-amber-600/40 text-amber-300',  'bg-amber-900/20 hover:bg-amber-900/40 border-amber-800/30 text-amber-400/70',  Pause, 'Pause'],
              ['blocked',   'bg-red-700/40 border-red-600/40 text-red-300',    'bg-red-900/20 hover:bg-red-900/40 border-red-800/30 text-red-400/70',    Ban, 'Bloquer'],
            ].map(([action, activeClass, idleClass, BtnIcon, label]) => (
              <button
                key={action as string}
                onClick={e => { e.stopPropagation(); setNodeAction(a => a === action ? null : action as 'validated' | 'paused' | 'blocked'); }}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] border transition-colors ${nodeAction === action ? activeClass : idleClass}`}
              >
                {React.createElement(BtnIcon as React.ElementType, { className: 'h-3 w-3' })} {label as string}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Context Filter Panel ──────────────────────────────────────────────────────

interface FilterPanelProps {
  connectors: ManifestConnector[];
  services: ServiceItem[];
  nodeCategories: string[];
  filter: ContextFilter;
  onChange: (f: ContextFilter) => void;
}

function FilterPanel({ connectors, services, nodeCategories, filter, onChange }: FilterPanelProps) {
  const [tab, setTab] = useState<'connectors' | 'services' | 'nodes'>('connectors');

  const toggleConnector = (id: string) => {
    const next = new Set(filter.connectorIds);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange({ ...filter, connectorIds: next });
  };

  const toggleService = (id: string) => {
    const next = new Set(filter.serviceIds);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange({ ...filter, serviceIds: next });
  };

  const toggleNode = (type: string) => {
    const next = new Set(filter.nodeTypes);
    next.has(type) ? next.delete(type) : next.add(type);
    onChange({ ...filter, nodeTypes: next });
  };

  const selectAllConnectors = () => {
    const healthy = connectors.filter(c => !filter.onlyHealthy || c.status === 'connected');
    onChange({ ...filter, connectorIds: new Set(healthy.map(c => c.id)) });
  };

  const clearConnectors = () => onChange({ ...filter, connectorIds: new Set() });

  const displayedConnectors = filter.onlyHealthy
    ? connectors.filter(c => c.status === 'connected')
    : connectors;

  const activeCount = filter.connectorIds.size + filter.serviceIds.size + filter.nodeTypes.size;

  return (
    <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-border/40 bg-muted/10">
        {([ ['connectors', Plug, 'Connecteurs'], ['services', Server, 'Services'], ['nodes', Boxes, 'Nœuds'] ] as const).map(([key, Icon, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
              tab === key
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {key === 'connectors' && filter.connectorIds.size > 0 && (
              <span className="ml-1 text-[10px] bg-primary/20 text-primary rounded-full px-1.5 py-0.5 font-bold">
                {filter.connectorIds.size}
              </span>
            )}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 px-3">
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filter.onlyHealthy}
              onChange={e => onChange({ ...filter, onlyHealthy: e.target.checked })}
              className="accent-emerald-400"
            />
            <ShieldCheck className="h-3 w-3 text-emerald-400" />
            Opérationnels uniquement
          </label>
          {activeCount > 0 && (
            <span className="text-[10px] bg-amber-900/30 text-amber-400 border border-amber-700/30 rounded-full px-2 py-0.5 font-medium">
              {activeCount} filtre{activeCount > 1 ? 's' : ''} actif{activeCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Connectors tab */}
      {tab === 'connectors' && (
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              {filter.connectorIds.size === 0
                ? 'Tous les connecteurs opérationnels seront utilisés'
                : `${filter.connectorIds.size} sélectionné${filter.connectorIds.size > 1 ? 's' : ''}`}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={selectAllConnectors} className="text-[11px] text-primary hover:underline">Tout sélect.</button>
              <button onClick={clearConnectors} className="text-[11px] text-muted-foreground hover:text-foreground">Effacer</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-1">
            {displayedConnectors.map(c => {
              const isSelected = filter.connectorIds.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleConnector(c.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs border transition-all ${
                    isSelected
                      ? 'border-primary/60 bg-primary/10 text-foreground'
                      : 'border-border/40 bg-muted/10 text-muted-foreground hover:border-border hover:text-foreground'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(c.status)}`} />
                  <span className="truncate font-medium">{c.name}</span>
                  <span className="text-[10px] opacity-60 shrink-0 uppercase">{c.type}</span>
                  {isSelected && <Check className="h-3 w-3 text-primary shrink-0 ml-auto" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Services tab */}
      {tab === 'services' && (
        <div className="p-3 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            {filter.serviceIds.size === 0
              ? 'Tous les services disponibles seront inclus dans le contexte'
              : `${filter.serviceIds.size} service${filter.serviceIds.size > 1 ? 's' : ''} sélectionné${filter.serviceIds.size > 1 ? 's' : ''}`}
          </p>
          {services.length === 0 ? (
            <p className="text-xs text-muted-foreground/50 italic py-2">Aucun service WASM/MCP/Docker enregistré</p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {services.map(s => {
                const isSelected = filter.serviceIds.has(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleService(s.id)}
                    className={`flex flex-col px-3 py-2 rounded-lg text-left text-xs border transition-all ${
                      isSelected
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-border/40 bg-muted/10 text-muted-foreground hover:border-border hover:text-foreground'
                    }`}
                  >
                    <span className="font-medium truncate">{s.name}</span>
                    {s.version && <span className="text-[10px] opacity-60">v{s.version}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Nodes tab */}
      {tab === 'nodes' && (
        <div className="p-3 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            {filter.nodeTypes.size === 0
              ? 'Tous les types de nœuds seront disponibles'
              : `${filter.nodeTypes.size} type${filter.nodeTypes.size > 1 ? 's' : ''} sélectionné${filter.nodeTypes.size > 1 ? 's' : ''}`}
          </p>
          {nodeCategories.length === 0 ? (
            <p className="text-xs text-muted-foreground/50 italic py-2">Catégories non disponibles</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {nodeCategories.map(n => {
                const isSelected = filter.nodeTypes.has(n);
                return (
                  <button
                    key={n}
                    onClick={() => toggleNode(n)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                      isSelected
                        ? 'border-primary/60 bg-primary/10 text-primary'
                        : 'border-border/40 bg-muted/10 text-muted-foreground hover:border-border hover:text-foreground'
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Chat Message Bubble ───────────────────────────────────────────────────────

interface MessageBubbleProps {
  msg: ChatMessage;
  onValidate?: (rules: unknown) => void;
}

function MessageBubble({ msg, onValidate }: MessageBubbleProps) {
  const isUser = msg.role === 'user';
  const isSystem = msg.role === 'system';

  const rulesForValidate: Record<string, unknown> | undefined =
    msg.rules != null ? (msg.rules as Record<string, unknown>) : undefined;
  void rulesForValidate;

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-[11px] text-muted-foreground/60 bg-muted/20 rounded-full px-3 py-1 border border-border/30">
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} group`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
        isUser ? 'bg-primary/20 border border-primary/40' : 'bg-violet-900/40 border border-violet-700/40'
      }`}>
        {isUser
          ? <PenLine className="h-3.5 w-3.5 text-primary" />
          : <Bot className="h-3.5 w-3.5 text-violet-400" />
        }
      </div>

      {/* Bubble */}
      <div className={`flex-1 max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-primary/15 border border-primary/30 text-foreground rounded-tr-sm'
            : 'bg-card/60 border border-border/50 text-foreground/90 rounded-tl-sm'
        }`}>
          {msg.isLoading
            ? <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="text-xs">Génération en cours…</span>
              </div>
            : <p className="whitespace-pre-wrap">{String(msg.content)}</p>
          }
        </div>

        {/* Feasibility warning banner */}
        {msg.feasibility && !msg.feasibility.feasible && !msg.isLoading && (
          <div className="rounded-xl border border-amber-700/40 bg-amber-950/30 px-4 py-3 space-y-2.5 w-full max-w-[85%]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                <span className="text-xs font-semibold text-amber-400">Faisabilité incomplète</span>
              </div>
              {msg.feasibility.checked_by === 'deterministic' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-900/30 border border-amber-700/30 text-amber-400/60 font-mono">✓ vérifié automatiquement</span>
              )}
            </div>
            {(msg.feasibility.unavailable_connectors?.length ?? 0) > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] text-red-300/70 font-medium uppercase tracking-wide">Connecteurs hors ligne :</p>
                <ul className="space-y-0.5">
                  {msg.feasibility.unavailable_connectors!.map((c, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-red-200/80">
                      <WifiOff className="h-3 w-3 text-red-400/60 shrink-0 mt-0.5" />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {msg.feasibility.missing_capabilities.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] text-amber-300/70 font-medium uppercase tracking-wide">Capacités manquantes :</p>
                <ul className="space-y-0.5">
                  {msg.feasibility.missing_capabilities.map((cap, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-amber-200/70">
                      <span className="text-amber-500/60 shrink-0 mt-0.5">•</span>
                      <span>{cap}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(msg.feasibility.warnings?.length ?? 0) > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] text-yellow-300/60 font-medium uppercase tracking-wide">Avertissements :</p>
                <ul className="space-y-0.5">
                  {msg.feasibility.warnings!.map((w, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-yellow-200/60">
                      <AlertCircle className="h-3 w-3 text-yellow-400/50 shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {msg.feasibility.questions_for_user.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-amber-300/70 font-medium uppercase tracking-wide">Questions :</p>
                {msg.feasibility.questions_for_user.map((q, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-amber-100/80 bg-amber-900/20 border border-amber-700/25 rounded-lg px-3 py-2">
                    <MessageSquare className="h-3.5 w-3.5 text-amber-400/60 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{q}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Feasibility assumptions (when feasible=true) */}
        {msg.feasibility?.feasible && !msg.isLoading && (
          <div className="rounded-xl border border-blue-800/30 bg-blue-950/20 px-3.5 py-2.5 space-y-1.5 w-full max-w-[85%]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-blue-400/60 shrink-0" />
                <span className="text-[11px] font-semibold text-blue-400/70">
                  {(msg.feasibility.assumptions?.length ?? 0) > 0 ? 'Hypothèses utilisées' : 'Workflow faisable'}
                </span>
              </div>
              {msg.feasibility.checked_by === 'deterministic' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-900/30 border border-emerald-700/30 text-emerald-400/70 font-mono">✓ connecteurs vérifiés</span>
              )}
            </div>
            {(msg.feasibility.warnings?.length ?? 0) > 0 && (
              <ul className="space-y-0.5">
                {msg.feasibility.warnings!.map((w, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-yellow-200/60">
                    <AlertCircle className="h-3 w-3 text-yellow-400/50 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
            {(msg.feasibility.assumptions?.length ?? 0) > 0 && (
              <ul className="space-y-0.5">
                {msg.feasibility.assumptions!.map((a, i) => (
                  <li key={i} className="text-[11px] text-blue-200/60 flex items-start gap-1.5">
                    <span className="text-blue-500/50 shrink-0 mt-0.5">·</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Workflow summary */}
        {msg.dag && !msg.isLoading ? <WorkflowSummaryCard dag={msg.dag} /> : null}

        {/* Confidence */}
        {msg.confidence !== undefined && !msg.isLoading ? (
          <div className="w-52">
            <ConfidenceBar value={msg.confidence} />
          </div>
        ) : null}

        {/* Validate button */}
        {msg.rules != null && !msg.isLoading && onValidate ? (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onValidate(msg.rules as Record<string, unknown>)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-700/40 text-emerald-400 text-xs rounded-lg transition-all hover:border-emerald-600/60"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Valider ce workflow
            </button>
            <span className="text-[11px] text-muted-foreground/60">ou continuez la discussion pour affiner</span>
          </div>
        ) : null}

        <span className="text-[10px] text-muted-foreground/40 px-1">
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

// ── DAG Tree Renderer ───────────────────────────────────────────────────────

interface WfTreeBranchProps {
  tree: TreeNode;
  readLevel: ReadLevel;
  nodeStatuses: Record<string, WfNodeStatus>;
}

function WfTreeBranch({ tree, readLevel, nodeStatuses }: WfTreeBranchProps) {
  const status = nodeStatuses[tree.node.id] ?? 'pending';
  const isActive = status === 'active' || status === 'done';
  const lineColor  = isActive ? 'bg-emerald-500/60' : 'bg-border/35';
  const arrowColor = isActive ? 'border-t-emerald-500/60' : 'border-t-border/35';

  return (
    <div className="flex flex-col items-center">
      <WfNodeCard
        node={tree.node}
        status={status}
        readLevel={readLevel}
        defaultExpanded={tree.children.length === 0 || readLevel > 1}
      />

      {/* Children */}
      {tree.children.length > 0 && (
        <>
          {/* Stem from node down */}
          <div className={`w-px h-5 transition-colors duration-500 ${lineColor}`} />

          {tree.children.length === 1 ? (
            // ── Straight-down single child ──
            <div className="flex flex-col items-center">
              {tree.children[0].edge.label && (
                <div className={`text-[10px] px-2.5 py-0.5 my-0.5 rounded-full border font-medium whitespace-nowrap ${
                  tree.children[0].edge.isError
                    ? 'bg-red-900/20 border-red-700/30 text-red-400/80'
                    : tree.children[0].edge.label.includes('✓')
                      ? 'bg-emerald-900/10 border-emerald-700/25 text-emerald-400/70'
                      : 'bg-muted/10 border-border/25 text-muted-foreground/60'
                }`}>
                  {tree.children[0].edge.label}
                </div>
              )}
              <div className={`w-px h-3 transition-colors duration-500 ${lineColor}`} />
              <div className={`w-0 h-0 mb-3 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent transition-colors duration-500 ${arrowColor}`} />
              <WfTreeBranch tree={tree.children[0].child} readLevel={readLevel} nodeStatuses={nodeStatuses} />
            </div>
          ) : (
            // ── Multiple children — fan out horizontally ──
            // The horizontal branch bar spans all children; each gets its own vertical stem + arrow
            <div className="relative flex gap-8 items-start">
              {/* Horizontal top bridge */}
              <div
                className={`absolute top-0 h-px transition-colors duration-500 ${lineColor}`}
                style={{ left: 'calc(50% - (var(--branch-half, 40%) ))', right: 'calc(50% - (var(--branch-half, 40%) ))' }}
              />
              {tree.children.map(({ child, edge }, idx) => {
                const isErr   = !!edge.isError;
                const isYes   = !isErr && !!edge.label?.includes('✓');
                const isNo    = !isErr && !!edge.label?.includes('✗');
                const labelClass = isErr  ? 'bg-red-900/20 border-red-700/30 text-red-400/80'
                  : isYes ? 'bg-emerald-900/10 border-emerald-700/25 text-emerald-400/70'
                  : isNo  ? 'bg-zinc-900/25 border-zinc-700/30 text-zinc-400/70'
                  : 'bg-muted/10 border-border/25 text-muted-foreground/60';
                return (
                  <div key={child.node.id} className="flex flex-col items-center">
                    <div className={`w-px h-5 ${lineColor}`} />
                    {edge.label && (
                      <div className={`text-[10px] px-2.5 py-0.5 my-0.5 rounded-full border font-medium whitespace-nowrap ${labelClass}`}>
                        {edge.label}
                      </div>
                    )}
                    <div className={`w-px h-3 ${lineColor}`} />
                    <div className={`w-0 h-0 mb-3 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent ${arrowColor}`} />
                    <WfTreeBranch tree={child} readLevel={readLevel} nodeStatuses={nodeStatuses} />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── DAG Live Preview Panel ────────────────────────────────────────────────────

function DagLivePanel({
  messages,
  isExpanded,
  onToggleExpand,
}: {
  messages: ChatMessage[];
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const latestWithDag = [...messages].reverse().find(m => m.dag && !m.isLoading);
  const [readLevel, setReadLevel] = useState<ReadLevel>(1);
  const [simRunning, setSimRunning] = useState(false);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, WfNodeStatus>>({});
  const [zoom, setZoom] = useState(1.0);
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 1.6;
  const treeScrollRef = useRef<HTMLDivElement>(null);

  const parsed = latestWithDag ? parseWfDag(latestWithDag.dag!) : null;
  const nodes  = parsed?.nodes ?? [];
  const edges  = parsed?.edges ?? [];
  const treeForest = (nodes.length > 0) ? buildForestFromGraph(nodes, edges) : [];

  // Reset simulation when the dag changes
  const dagId = latestWithDag?.id;
  useEffect(() => {
    setNodeStatuses({});
    setSimRunning(false);
  }, [dagId]);

  const startSimulation = async () => {
    if (simRunning || nodes.length === 0) return;
    setSimRunning(true);
    setNodeStatuses({});
    for (let i = 0; i < nodes.length; i++) {
      setNodeStatuses(prev => ({ ...prev, [nodes[i].id]: 'active' }));
      await new Promise<void>(r => setTimeout(r, 1400));
      setNodeStatuses(prev => ({ ...prev, [nodes[i].id]: 'done' }));
    }
    setSimRunning(false);
  };

  // Empty state
  if (!latestWithDag || nodes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-5 text-center p-8">
        <div className="w-20 h-20 rounded-3xl bg-muted/10 border border-border/20 flex items-center justify-center">
          <Network className="h-10 w-10 text-muted-foreground/20" />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-muted-foreground/50">Aucun workflow généré</p>
          <p className="text-xs text-muted-foreground/30 leading-relaxed max-w-[220px]">
            Décrivez votre intention dans le chat —<br />le DAG enrichi s'affiche ici en temps réel
          </p>
        </div>
        {/* Example node type legend */}
        <div className="w-full max-w-[260px] space-y-1.5 text-left">
          {(['trigger', 'decision', 'action', 'notification'] as WfNodeType[]).map(t => {
            const cfg = WF_NODE_CFG[t];
            const Icon = WF_NODE_ICON[t];
            return (
              <div key={t} className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border ${cfg.bg} ${cfg.border}`}>
                <div className={`w-6 h-6 rounded-md flex items-center justify-center ${cfg.iconBg} border ${cfg.border}`}>
                  <Icon className={`h-3.5 w-3.5 ${cfg.text}`} />
                </div>
                <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const levelLabels = ['Vue Métier', 'Vue Logique', 'Vue Technique'];
  const levelDesc = [
    'Compréhensible pour tous — langage naturel',
    'Conditions, seuils, dépendances et cas d\'erreur',
    "Paramètres techniques, payloads et audit",
  ];
  const levelColors = [
    'text-primary/70 bg-primary/5 border-primary/20',
    'text-amber-400/70 bg-amber-900/10 border-amber-700/20',
    'text-violet-400/70 bg-violet-900/10 border-violet-700/20',
  ];

  const panelContent = (
    <div className={`flex flex-col overflow-hidden ${
      isExpanded
        ? 'fixed inset-0 z-50 bg-background'
        : 'h-full'
    }`}>
      {/* ── Panel header ── */}
      <div className="px-4 pt-3 pb-2 border-b border-border/40 bg-muted/10 shrink-0 space-y-3">
        {/* Title + confidence + simulate */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-semibold truncate">{parsed?.title ?? 'Workflow généré'}</span>
              <span className="text-[11px] text-muted-foreground/50 shrink-0">· {nodes.length} nœud{nodes.length > 1 ? 's' : ''}</span>
            </div>
            {parsed?.summary && (
              <p className="text-[11px] text-muted-foreground/60 italic mt-0.5 pl-6 leading-relaxed line-clamp-2">
                {parsed.summary}
              </p>
            )}
            {/* Data flow strip — extracted from nodes params */}
            {(() => {
              const dataFlow = nodes.map(n => n.params?._dataFlow).find(v => typeof v === 'string' && v);
              const constraints = nodes.flatMap(n =>
                Array.isArray(n.params?._constraints) ? (n.params._constraints as string[]) : []
              ).slice(0, 4);
              return (
                <>
                  {typeof dataFlow === 'string' && dataFlow && (
                    <div className="mt-2 flex items-center gap-1.5 pl-1 flex-wrap">
                      <span className="text-[10px] text-cyan-400/60 font-semibold uppercase tracking-wide shrink-0">Flux :</span>
                      <span className="text-[11px] text-cyan-300/80 font-mono leading-relaxed">{dataFlow}</span>
                    </div>
                  )}
                  {constraints.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1 pl-1">
                      {constraints.map((c, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/20 border border-blue-700/25 text-blue-300/70">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          {latestWithDag.confidence !== undefined && (
            <div className="flex items-center gap-1.5 shrink-0">
              <div className={`w-2 h-2 rounded-full animate-pulse ${
                (latestWithDag.confidence ?? 0) >= 0.85 ? 'bg-emerald-400' :
                (latestWithDag.confidence ?? 0) >= 0.6  ? 'bg-amber-400'  : 'bg-red-400'
              }`} />
              <span className="text-xs font-mono font-bold text-muted-foreground">
                {Math.round((latestWithDag.confidence ?? 0) * 100)}%
              </span>
            </div>
          )}
        </div>

        {/* Reading level tabs */}
        <div className="flex gap-0.5 rounded-xl bg-muted/20 p-0.5">
          {([1, 2, 3] as ReadLevel[]).map(lvl => (
            <button
              key={lvl}
              onClick={() => setReadLevel(lvl)}
              className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-all ${
                readLevel === lvl
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground/60 hover:text-muted-foreground'
              }`}
            >
              {levelLabels[lvl - 1]}
            </button>
          ))}
        </div>

        {/* Level hint + simulate button + zoom controls */}
        <div className="flex items-center justify-between gap-2">
          <p className={`text-[10px] px-2 py-0.5 rounded-full border ${levelColors[readLevel - 1]}`}>
            {levelDesc[readLevel - 1]}
          </p>
          <div className="flex items-center gap-1">
            {/* Zoom buttons */}
            <button onClick={() => setZoom(z => Math.max(MIN_ZOOM, +(z - 0.1).toFixed(1)))} title="Zoom -" className="w-6 h-6 flex items-center justify-center rounded-md border border-border/40 bg-muted/10 hover:bg-muted/30 transition-colors">
              <ZoomOut className="h-3 w-3 text-muted-foreground" />
            </button>
            <span className="text-[10px] font-mono text-muted-foreground/50 w-8 text-center">{Math.round(zoom*100)}%</span>
            <button onClick={() => setZoom(z => Math.min(MAX_ZOOM, +(z + 0.1).toFixed(1)))} title="Zoom +" className="w-6 h-6 flex items-center justify-center rounded-md border border-border/40 bg-muted/10 hover:bg-muted/30 transition-colors">
              <ZoomIn className="h-3 w-3 text-muted-foreground" />
            </button>
            <button onClick={() => setZoom(1)} title="Réinitialiser le zoom (100%)" className="w-6 h-6 flex items-center justify-center rounded-md border border-border/40 bg-muted/10 hover:bg-muted/30 transition-colors ml-0.5 text-[9px] font-bold text-muted-foreground">
              1:1
            </button>
            <button
              onClick={onToggleExpand}
              title={isExpanded ? 'Réduire le panneau' : 'Agrandir le panneau'}
              className={`w-7 h-7 flex items-center justify-center rounded-md border transition-all ${
                isExpanded
                  ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'
                  : 'border-border/40 bg-muted/10 text-muted-foreground hover:bg-muted/30 hover:text-foreground'
              }`}
            >
              {isExpanded
                ? <Minimize2 className="h-3.5 w-3.5" />
                : <Maximize2 className="h-3.5 w-3.5" />
              }
            </button>
            <div className="w-px h-4 bg-border/40 mx-1" />
            <button
              onClick={startSimulation}
              disabled={simRunning}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                simRunning
                  ? 'border-primary/30 bg-primary/5 text-primary/60 cursor-not-allowed'
                  : 'border-emerald-700/40 bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/35 hover:border-emerald-600/50'
              }`}
            >
              {simRunning
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Simulation…</>
                : <><PlayCircle className="h-3.5 w-3.5" /> Simuler</>
              }
            </button>
          </div>
        </div>
      </div>

      {/* ── Tree view ── */}
      <div
        ref={treeScrollRef}
        className="flex-1 overflow-auto"
        onWheel={e => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z - e.deltaY * 0.002).toFixed(2))));
          }
        }}
      >
        <div
          className="min-h-full flex flex-col items-center py-8 px-6"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.15s ease' }}
        >
          {treeForest.length > 0 ? (
            <div className={`flex items-start justify-center ${
              treeForest.length > 1 ? 'gap-10' : ''
            }`}>
              {treeForest.map((tree, tIdx) => (
                <div key={tree.node.id} className="flex flex-col items-center">
                  {treeForest.length > 1 && (
                    <div className="flex items-center gap-1.5 mb-4 px-3 py-1 rounded-full border border-border/25 bg-muted/10">
                      <span className="text-[10px] font-semibold text-muted-foreground/50">Règle {tIdx + 1}</span>
                    </div>
                  )}
                  <WfTreeBranch
                    tree={tree}
                    readLevel={readLevel}
                    nodeStatuses={nodeStatuses}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/40 italic mt-8">Aucun nœud à afficher</p>
          )}

          {/* Level 3: raw JSON at the bottom */}
          {readLevel === 3 && latestWithDag.dag && (
            <div className="mt-8 rounded-xl border border-violet-800/30 bg-violet-950/20 overflow-hidden w-full max-w-xl">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-violet-800/20">
                <Code2 className="h-3.5 w-3.5 text-violet-400" />
                <span className="text-xs font-semibold font-mono text-violet-400">Payload JSON brut</span>
              </div>
              <pre className="text-[10px] px-3 py-3 text-violet-300/70 font-mono overflow-auto max-h-80 leading-relaxed">
                {JSON.stringify(latestWithDag.dag, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  return panelContent;
}



// ── Main component ─────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // LLM & manifest state
  const [llm, setLlm]         = useState<{ name?: string; provider?: string } | null>(null);
  const [llmLoading, setLlmLoading] = useState(true);
  const [manifest, setManifest] = useState<{
    connectors: ManifestConnector[];
    services: ServiceItem[];
    nodeCategories: string[];
  }>({ connectors: [], services: [], nodeCategories: [] });
  const [manifestLoading, setManifestLoading] = useState(true);

  // Context filter
  const [filter, setFilter] = useState<ContextFilter>({
    connectorIds: new Set(),
    serviceIds: new Set(),
    nodeTypes: new Set(),
    onlyHealthy: true,
  });
  const [showFilter, setShowFilter] = useState(false);

  // DAG panel expanded state
  const [dagExpanded, setDagExpanded] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [step, setStep]         = useState<Step>('idle');
  const [validatedRules, setValidatedRules] = useState<unknown>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployedIds, setDeployedIds] = useState<string[]>([]);

  // Edit mode — activated when navigating from Automations with ?editRule=<id>
  const [editingRuleId, setEditingRuleId]     = useState<string | null>(null);
  const [editingRuleName, setEditingRuleName] = useState('');

  // Load LLM + manifest on mount
  useEffect(() => {
    llmConfigApi.getDefault()
      .then(r => setLlm(r.data))
      .catch(() => setLlm(null))
      .finally(() => setLlmLoading(false));

    // Load aggregated context for filters
    Promise.all([
      manifestApi.getAggregated().catch(() => ({ data: {} })),
      connectorsApi.list({ limit: '100' } as Record<string, string>).catch(() => ({ data: [] })),
    ]).then(([manifestRes, connRes]) => {
      const m = manifestRes.data ?? {};
      const rawConnectors: Connector[] = Array.isArray(connRes.data)
        ? connRes.data
        : (connRes.data?.data ?? []);

      // Merge manifest connectors with live health status
      const manifestConnectors: ManifestConnector[] = m.connectors ?? [];
      const merged: ManifestConnector[] = manifestConnectors.map(mc => {
        const live = rawConnectors.find((rc: Connector) => rc.id === mc.id || rc.name === mc.name);
        return { ...mc, status: live?.status ?? 'pending' };
      });

      // Also add live connectors not in manifest
      rawConnectors.forEach(rc => {
        if (!merged.find(m => m.id === rc.id)) {
          merged.push({ id: rc.id, name: rc.name, type: rc.type, status: rc.status });
        }
      });

      const services: ServiceItem[] = (m.servicesManifest ?? []).map((s: ServiceItem) => ({
        id: s.id, name: s.name, version: s.version, description: s.description,
      }));

      // Derive node categories from conditionTypes + actionTypes + triggerTypes
      const nodeCategories = Array.from(new Set([
        ...(m.conditionTypes ?? []).map((c: { category?: string; type?: string }) => c.category ?? c.type),
        ...(m.actionTypes ?? []).map((a: { category?: string; type?: string }) => a.category ?? a.type),
        ...(m.triggerTypes ?? []).map((t: { category?: string; type?: string }) => t.category ?? t.type),
      ])).filter(Boolean) as string[];

      setManifest({ connectors: merged, services, nodeCategories });
    }).finally(() => setManifestLoading(false));

    // Welcome message
    setMessages([{
      id: msgId(),
      role: 'system',
      content: 'Session démarrée — décrivez votre workflow en langage naturel',
      timestamp: new Date(),
    }]);
  }, []);

  // ── Edit mode: load existing rule when ?editRule=<id> is in URL ──────────
  useEffect(() => {
    const editRuleId = searchParams.get('editRule');
    if (!editRuleId) return;

    setEditingRuleId(editRuleId);
    rulesApi.get(editRuleId)
      .then(res => {
        const rule = res.data;
        setEditingRuleName(rule.name ?? editRuleId);

        // Reconstruct workflow_rules format for the deploy pipeline
        const ruleKey = rule.name ?? editRuleId;
        const workflowRules: Record<string, unknown> = {
          [ruleKey]: {
            trigger:  { type: rule.sourceConnectorType },
            condition: rule.condition ? {
              field:    rule.condition.fieldName,
              operator: rule.condition.operator,
              value:    rule.condition.value,
            } : undefined,
            actions: (rule.actions ?? []).map((a: { name: string; parameters?: Record<string, unknown> }) => ({
              type:       a.name,
              parameters: a.parameters ?? {},
            })),
            debounce: rule.debounceConfig,
          },
        };
        setValidatedRules(workflowRules);
        setStep('done');

        // Show existing rule in chat
        const actionsDesc = (rule.actions ?? []).map((a: { name: string; parameters?: Record<string, unknown> }) =>
          a.parameters?.['channel']
            ? `${a.name} → #${a.parameters['channel']}`
            : a.name
        ).join(', ') || '—';
        const condDesc = rule.condition
          ? `${rule.condition.fieldName ?? ''} ${rule.condition.operator ?? ''} ${rule.condition.value ?? ''}`
          : '—';

        setMessages([
          { id: msgId(), role: 'system', content: `📝 Mode édition — règle existante chargée : **${ruleKey}**`, timestamp: new Date() },
          {
            id:        msgId(),
            role:      'assistant',
            content:   `Règle chargée : **${ruleKey}**\n\nTrigger : \`${rule.sourceConnectorType}\`\nCondition : \`${condDesc}\`\nActions : ${actionsDesc}\n\nModifiez via le chat ci-dessous ou cliquez directement sur **Enregistrer** pour sauvegarder.`,
            timestamp: new Date(),
            rules:     workflowRules,
          },
          { id: msgId(), role: 'system', content: '✅ Règle chargée — modifiez ou cliquez sur "Enregistrer" pour mettre à jour', timestamp: new Date() },
        ]);
      })
      .catch(() => {
        setMessages([{ id: msgId(), role: 'system', content: `❌ Impossible de charger la règle "${editRuleId}"`, timestamp: new Date() }]);
      });
  }, [searchParams]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Build filtered context to send to LLM service
  const buildFilteredContext = useCallback(async (): Promise<Record<string, unknown>> => {
    try {
      const res = await manifestApi.getAggregated();
      const full = res.data ?? {};

      if (filter.connectorIds.size === 0 && filter.serviceIds.size === 0 && filter.nodeTypes.size === 0) {
        // No filter — pass full context but restrict to healthy if needed
        if (filter.onlyHealthy) {
          const healthy = manifest.connectors.filter(c => c.status === 'connected');
          return {
            ...full,
            connectors: (full.connectors ?? []).filter((c: ManifestConnector) =>
              healthy.some(h => h.id === c.id || h.name === c.name)
            ),
          };
        }
        return full;
      }

      // Apply explicit filter
      const filteredConn = filter.connectorIds.size > 0
        ? (full.connectors ?? []).filter((c: ManifestConnector) => filter.connectorIds.has(c.id))
        : (full.connectors ?? []);

      const filteredSvcs = filter.serviceIds.size > 0
        ? (full.servicesManifest ?? []).filter((s: ServiceItem) => filter.serviceIds.has(s.id))
        : (full.servicesManifest ?? []);

      return { ...full, connectors: filteredConn, servicesManifest: filteredSvcs };
    } catch {
      return {};
    }
  }, [filter, manifest.connectors]);

  // Extract result from LLM response
  const parseResult = (data: GenerationResult): {
    rules: unknown;
    dag?: Record<string, unknown>;
    confidence?: number;
    content: string;
    chat_reply?: string;
    feasibility?: ChatMessage['feasibility'];
  } => {
    const rules = data.refined_rules ?? data.workflow_rules ?? data.rules ?? data;
    const dag: Record<string, unknown> | undefined =
      (rules as Record<string, unknown>)?.dag as Record<string, unknown> ??
      data.dag ??
      (typeof rules === 'object' && rules !== null ? rules as Record<string, unknown> : undefined);

    const confidence = data.confidence
      ?? (rules as Record<string, unknown>)?.confidence as number | undefined
      ?? ((rules as Record<string, unknown>)?.rules as Array<Record<string, unknown>>)?.[0]?.confidence as number | undefined;

    const ruleList = (rules as Record<string, unknown>)?.rules ?? [];
    const summary = data.summary ?? (rules as Record<string, unknown>)?.summary;
    const name = data.name ?? (Array.isArray(ruleList) ? (ruleList[0] as Record<string, unknown>)?.name : undefined);

    // chat_reply is the primary conversational content; fall back to summary/name
    const chat_reply = data.chat_reply ?? (rules as Record<string, unknown>)?.chat_reply as string | undefined;

    const fallbackContent = [
      name ? `**${String(name)}**` : '',
      typeof summary === 'string' ? summary : '',
      data.changes_summary ? `✏️ ${data.changes_summary}` : '',
      data.generation_time_ms ? `\n_Généré en ${formatMs(data.generation_time_ms)} · ${data.tokens_used ?? '?'} tokens · ${data.model_used ?? ''}_` : '',
    ].filter(Boolean).join('\n') || (data.refined_rules ? 'Workflow mis à jour.' : 'Workflow compilé avec succès.');

    const content = chat_reply || fallbackContent;

    return { rules, dag, confidence, content, chat_reply, feasibility: data.feasibility };
  };

  const simulate = async (s: Step, ms: number) => {
    setStep(s);
    await new Promise(r => setTimeout(r, ms));
  };

  const handleSend = async () => {
    if (!input.trim() || isGenerating) return;
    const userText = input.trim();
    setInput('');
    setIsGenerating(true);
    setStep('interpreting');

    // Add user message
    const userMsg: ChatMessage = { id: msgId(), role: 'user', content: userText, timestamp: new Date() };

    // Add placeholder assistant message
    const loadingId = msgId();
    const loadingMsg: ChatMessage = { id: loadingId, role: 'assistant', content: '', timestamp: new Date(), isLoading: true };
    setMessages(prev => [...prev, userMsg, loadingMsg]);

    try {
      await simulate('interpreting', 600);
      await simulate('compiling', 800);

      const ctx = await buildFilteredContext();
      await simulate('validating', 400);

      // Determine if this is a refinement (has prior assistant messages with rules)
      const priorRules = [...messages].reverse().find(m => m.role === 'assistant' && m.rules && !m.isLoading);

      let data: GenerationResult;
      if (priorRules?.rules) {
        const res = await llmServiceApi.refineRules(priorRules.rules, userText, ctx);
        data = res.data;
      } else {
        const res = await llmServiceApi.generateRules(userText, ctx);
        data = res.data;
      }

      const { rules, dag, confidence, content, chat_reply, feasibility } = parseResult(data);
      setStep('done');

      // Replace loading message
      const assistantMsg: ChatMessage = {
        id: loadingId,
        role: 'assistant',
        content,
        timestamp: new Date(),
        rules,
        dag,
        confidence,
        isLoading: false,
        chat_reply,
        feasibility,
      };
      setMessages(prev => prev.map(m => m.id === loadingId ? assistantMsg : m));

    } catch (e: unknown) {
      setStep('error');
      const err = e as { response?: { data?: { detail?: string; message?: string } } };
      const errMsg = err.response?.data?.detail ?? err.response?.data?.message ?? 'Erreur lors de la génération. Vérifiez que le service LLM est démarré.';
      setMessages(prev => prev.map(m =>
        m.id === loadingId
          ? { ...m, isLoading: false, content: `❌ ${errMsg}` }
          : m
      ));
    } finally {
      setIsGenerating(false);
      setTimeout(() => setStep('idle'), 1500);
    }
  };

  const handleValidate = (rules: unknown) => {
    setValidatedRules(rules);
    setDeployedIds([]);
    setMessages(prev => [...prev, {
      id: msgId(),
      role: 'system',
      content: '✅ Workflow validé — cliquez sur "Enregistrer" pour l\'activer dans le système',
      timestamp: new Date(),
    }]);
  };

  const handleDeploy = async () => {
    if (!validatedRules || isDeploying) return;

    // Recover the user intent from the first user message in the conversation
    const userIntent =
      messages.find(m => m.role === 'user')?.content
      ?? 'Workflow généré via Eyeflow AI Studio';

    // Read auth credentials from the store
    const { accessToken, user } = useAuthStore.getState();
    const userId = user?.id ?? '';

    setIsDeploying(true);
    setMessages(prev => [...prev, {
      id: msgId(),
      role: 'system',
      content: '⏳ Enregistrement en cours — compilation, règles et déclencheurs…',
      timestamp: new Date(),
    }]);

    try {
      const res = await fetch('http://localhost:8000/api/workflow/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
          ...(userId       ? { 'X-User-ID': userId }                      : {}),
        },
        body: JSON.stringify({
          workflow_rules: validatedRules,
          user_intent: userIntent,
          user_id: userId || undefined,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();

      if (data.success || data.deployed_count > 0) {
        const ids: string[] = data.deployed?.map((d: { id: string }) => d.id) ?? [];
        setDeployedIds(ids);
        const ruleNames = data.deployed
          ?.filter((d: { error?: string }) => !d.error)
          .map((d: { name: string }) => d.name)
          .join(', ') || '—';

        // If editing, delete the old rule (replaced by the newly deployed ones)
        if (editingRuleId) {
          try { await rulesApi.delete(editingRuleId); } catch { /* non-blocking */ }
          setEditingRuleId(null);
          setEditingRuleName('');
        }

        setMessages(prev => [...prev, {
          id: msgId(),
          role: 'system',
          content: `✅ Workflow activé — ${data.deployed_count} règle(s) enregistrée(s) : ${ruleNames}`,
          timestamp: new Date(),
        }]);
        setValidatedRules(null);
        // Navigate to automations after a short delay so user sees the confirmation
        setTimeout(() => navigate('/automations'), 1800);
      } else {
        const errList = data.errors?.join(' | ') || 'Erreur inconnue';
        setMessages(prev => [...prev, {
          id: msgId(),
          role: 'system',
          content: `❌ Échec de l'enregistrement : ${errList}`,
          timestamp: new Date(),
        }]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages(prev => [...prev, {
        id: msgId(),
        role: 'system',
        content: `❌ Erreur réseau lors de l'enregistrement : ${msg}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsDeploying(false);
    }
  };

  const handleReset = () => {
    setMessages([{
      id: msgId(),
      role: 'system',
      content: 'Session réinitialisée — décrivez un nouveau workflow',
      timestamp: new Date(),
    }]);
    setValidatedRules(null);
    setStep('idle');
    setInput('');
  };

  const isRunning = ['interpreting', 'compiling', 'validating'].includes(step);
  const hasMessages = messages.some(m => m.role !== 'system' || messages.length > 1);
  const activeFilterCount = filter.connectorIds.size + filter.serviceIds.size + filter.nodeTypes.size;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] gap-0 overflow-hidden">

      {/* ── Edit mode banner ── */}
      {editingRuleId && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-900/20 border-b border-amber-700/30 text-xs text-amber-300 shrink-0">
          <Pencil className="h-3.5 w-3.5 shrink-0" />
          <span>Mode édition — <strong>{editingRuleName || editingRuleId}</strong></span>
          <span className="text-amber-500/70">· Modifiez via le chat ou cliquez Enregistrer pour mettre à jour</span>
          <button
            onClick={() => { setEditingRuleId(null); setEditingRuleName(''); navigate('/analysis'); }}
            className="ml-auto p-1 hover:text-amber-100 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-card/30 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
              <BrainCircuit className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground leading-none">Analysis & AI Studio</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t('analysis.subtitle')}</p>
            </div>
          </div>

          {/* LLM badge */}
          {!llmLoading && (
            llm ? (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 bg-emerald-900/20 border border-emerald-700/30 rounded-lg px-2.5 py-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-medium">{llm.name}</span>
                <span className="text-emerald-600">·</span>
                <span className="text-emerald-500/70 capitalize">{llm.provider}</span>
              </div>
            ) : (
              <button onClick={() => navigate('/configuration')}
                className="flex items-center gap-1.5 text-[11px] text-amber-400 bg-amber-900/20 border border-amber-700/30 rounded-lg px-2.5 py-1 hover:bg-amber-900/30 transition-colors">
                <WifiOff className="h-3 w-3" />
                <span>Aucun LLM</span>
                <ChevronRight className="h-3 w-3" />
              </button>
            )
          )}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {/* Filter toggle */}
          <button
            onClick={() => setShowFilter(f => !f)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${
              showFilter || activeFilterCount > 0
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border/40 text-muted-foreground hover:border-border hover:text-foreground'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Contexte
            {activeFilterCount > 0 && (
              <span className="text-[10px] bg-primary/30 rounded-full px-1.5 font-bold">{activeFilterCount}</span>
            )}
          </button>

          {/* Step indicator (during generation) */}
          {isRunning ? <StepIndicator step={step} /> : null}

          {/* Reset */}
          {hasMessages && !isRunning && (
            <button onClick={handleReset}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-muted/20">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          )}

          {/* Save / Update validated rule */}
          {validatedRules != null ? (
            <button
              onClick={handleDeploy}
              disabled={isDeploying}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-700/40 text-emerald-400 text-xs rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isDeploying ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {editingRuleId ? 'Mise à jour…' : 'Enregistrement…'}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {editingRuleId ? 'Mettre à jour' : 'Enregistrer le workflow'}
                </>
              )}
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Filter panel (collapsible) ── */}
      {showFilter && (
        <div className="px-4 py-3 border-b border-border/30 bg-background/50 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Restriction de contexte</span>
              <span className="text-[11px] text-muted-foreground/50">— le LLM n'utilisera que les ressources sélectionnées</span>
            </div>
            <button onClick={() => setShowFilter(false)}>
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
            </button>
          </div>
          {manifestLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement du manifeste…
            </div>
          ) : (
            <FilterPanel
              connectors={manifest.connectors}
              services={manifest.services}
              nodeCategories={manifest.nodeCategories}
              filter={filter}
              onChange={setFilter}
            />
          )}
        </div>
      )}

      {/* ── Main 2-column layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT — Chat / Conversation */}
        <div className="flex flex-col flex-[5] border-r border-border/30 overflow-hidden">

          {/* Quick intents (show only when no conversation yet) */}
          {messages.filter(m => m.role !== 'system').length === 0 && (
            <div className="p-4 shrink-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-3">
                <Lightbulb className="h-3.5 w-3.5" /> Intentions rapides
              </p>
              <div className="flex flex-wrap gap-2">
                {QUICK_INTENTS.map((qi, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(qi); setTimeout(() => textareaRef.current?.focus(), 50); }}
                    disabled={isRunning}
                    className="text-xs px-3 py-1.5 rounded-lg border border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-40 text-left"
                  >
                    {qi}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {messages.map(m => (
              <MessageBubble key={m.id} msg={m} onValidate={handleValidate} />
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input area */}
          <div className="shrink-0 border-t border-border/40 bg-card/30 p-3">
            {/* Context info bar */}
            <div className="flex items-center gap-3 mb-2 text-[11px] text-muted-foreground/60">
              <div className="flex items-center gap-1">
                <Plug className="h-3 w-3" />
                <span>
                  {activeFilterCount > 0
                    ? `${filter.connectorIds.size || manifest.connectors.filter(c => !filter.onlyHealthy || c.status === 'connected').length} connecteurs`
                    : `${manifest.connectors.filter(c => !filter.onlyHealthy || c.status === 'connected').length} connecteurs actifs`
                  }
                </span>
              </div>
              {manifest.services.length > 0 && (
                <div className="flex items-center gap-1">
                  <Server className="h-3 w-3" />
                  <span>{filter.serviceIds.size || manifest.services.length} services</span>
                </div>
              )}
              <div className="flex items-center gap-1 ml-auto">
                <Cpu className="h-3 w-3" />
                <span>
                  {validatedRules
                    ? 'Workflow validé'
                    : messages.some(m => m.role === 'assistant' && m.rules && !m.isLoading)
                      ? 'En discussion — affinez ou validez'
                      : 'Décrivez votre intention'}
                </span>
              </div>
            </div>

            {/* Textarea + send */}
            <div className={`flex items-end gap-2 rounded-xl border p-2 transition-all ${
              isRunning ? 'border-primary/50 bg-primary/5' : 'border-border/50 bg-background/50 focus-within:border-primary/40'
            }`}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={
                  messages.some(m => m.role === 'assistant' && m.rules && !m.isLoading)
                    ? "Affinez le workflow, demandez des modifications… (Entrée pour envoyer)"
                    : "Décrivez en langage naturel le workflow à créer… (Entrée pour envoyer)"
                }
                rows={2}
                disabled={isRunning || !llm}
                className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/50 outline-none resize-none disabled:opacity-50 py-0.5 leading-relaxed"
              />
              <button
                onClick={handleSend}
                disabled={isRunning || !input.trim() || !llm}
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                  isRunning || !input.trim() || !llm
                    ? 'bg-muted/30 text-muted-foreground/30'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20'
                }`}
              >
                {isRunning
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Send className="h-4 w-4" />
                }
              </button>
            </div>

            {!llm && !llmLoading && (
              <div className="flex items-center gap-2 mt-2 text-xs text-amber-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Configurez un LLM pour activer la génération. </span>
                <button onClick={() => navigate('/configuration')} className="underline">Configurer</button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Live DAG preview */}
        <div className="flex-[4] overflow-hidden flex flex-col bg-card/20">
          <DagLivePanel messages={messages} isExpanded={dagExpanded} onToggleExpand={() => setDagExpanded(v => !v)} />
        </div>
      </div>
    </div>
  );
}
