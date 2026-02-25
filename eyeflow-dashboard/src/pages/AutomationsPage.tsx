// @ts-nocheck — full rewrite, types resolved below
import { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2, XCircle, GitBranch, Plus, RefreshCw,
  AlertCircle, Zap, Filter,
  ChevronRight, Loader2, Pencil, Trash2,
  Bell, Clock, Activity,
  ChevronDown, PlayCircle, PauseCircle, CheckCheck,
  SkipForward, CalendarClock, BarChart3, AlarmCheck, Terminal,
  FileText, Archive, TrendingUp, BookOpen, ChevronUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { rulesApi, reportsApi } from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LogEntry {
  ts: string;
  status: 'success' | 'error' | 'skipped';
  durationMs: number;
  message: string;
  triggeredBy: 'manual' | 'schedule' | 'event';
}

interface RuleAction {
  name: string;
  parameters?: Record<string, unknown>;
}

interface Rule {
  id: string;
  name?: string;
  status?: string;
  sourceConnectorType?: string;
  condition?: { fieldName?: string; operator?: string; value?: unknown };
  actions?: RuleAction[];
  totalTriggers?: number;
  lastTriggeredAt?: string;
  nextScheduledCheckAt?: string;
  executionLogs?: LogEntry[];
  createdAt?: string;
  updatedAt?: string;
}

interface LogsData {
  ruleId: string;
  ruleName: string;
  totalTriggers: number;
  lastTriggeredAt?: string;
  nextScheduledCheckAt?: string;
  logs: LogEntry[];
}

interface Report {
  id: string;
  userId: string;
  ruleId: string;
  ruleName?: string;
  title: string;
  summary?: string;
  type: string;
  status: string;
  period: { from?: string; to?: string; durationLabel?: string };
  stats: {
    totalExecutions: number;
    successCount: number;
    errorCount: number;
    skippedCount: number;
    successRate: number;
    avgDurationMs: number;
    minDurationMs: number;
    maxDurationMs: number;
  };
  logs: LogEntry[];
  generatedAt: string;
}

type StatusKey = 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'REJECTED' | 'DRAFT' | 'PAUSED';

// ── Config ─────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<StatusKey, { cls: string; dot: string; label: string }> = {
  ACTIVE:   { cls: 'text-emerald-400 bg-emerald-900/20 border-emerald-700/30', dot: 'bg-emerald-400',              label: 'active'      },
  PAUSED:   { cls: 'text-sky-400 bg-sky-900/20 border-sky-700/30',             dot: 'bg-sky-400',                 label: 'pausée'      },
  INACTIVE: { cls: 'text-zinc-400 bg-zinc-900/20 border-zinc-700/30',          dot: 'bg-zinc-400',                label: 'inactive'    },
  PENDING:  { cls: 'text-amber-400 bg-amber-900/20 border-amber-700/30',       dot: 'bg-amber-400 animate-pulse', label: 'en attente'  },
  REJECTED: { cls: 'text-red-400 bg-red-900/20 border-red-700/30',             dot: 'bg-red-400',                 label: 'rejetée'     },
  DRAFT:    { cls: 'text-muted-foreground bg-muted/30 border-border',          dot: 'bg-muted-foreground',        label: 'brouillon'   },
};

const LOG_STATUS_CFG = {
  success: { icon: CheckCheck,  cls: 'text-emerald-400', bg: 'bg-emerald-900/20 border-emerald-700/20' },
  error:   { icon: XCircle,     cls: 'text-red-400',     bg: 'bg-red-900/20 border-red-700/20'         },
  skipped: { icon: SkipForward, cls: 'text-amber-400',   bg: 'bg-amber-900/20 border-amber-700/20'     },
};

const TRIGGER_LABEL: Record<string, string> = {
  manual:   'Manuel',
  schedule: 'Planifié',
  event:    'Événement',
};

const normaliseStatus = (s?: string): StatusKey => {
  const up = (s ?? '').toUpperCase() as StatusKey;
  return STATUS_CFG[up] ? up : 'DRAFT';
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtRelative = (ts?: string) => {
  if (!ts) return '—';
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60_000)         return "à l'instant";
  if (d < 3_600_000)      return `il y a ${Math.floor(d / 60_000)} min`;
  if (d < 86_400_000)     return `il y a ${Math.floor(d / 3_600_000)} h`;
  if (d < 7 * 86_400_000) return `il y a ${Math.floor(d / 86_400_000)} j`;
  return new Date(ts).toLocaleDateString('fr-FR');
};

const fmtFuture = (ts?: string) => {
  if (!ts) return null;
  const d = new Date(ts).getTime() - Date.now();
  if (d <= 0) return 'dépassé';
  if (d < 60_000)    return `dans ${Math.floor(d / 1_000)} s`;
  if (d < 3_600_000) return `dans ${Math.floor(d / 60_000)} min`;
  if (d < 86_400_000) return `dans ${Math.floor(d / 3_600_000)} h`;
  return `dans ${Math.floor(d / 86_400_000)} j`;
};

const fmtTs = (ts: string) =>
  new Date(ts).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

const fmtConnector = (ct?: string) =>
  (ct ?? '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) || '—';

const buildActionsLabel = (actions?: RuleAction[]) =>
  actions?.length
    ? actions.map(a =>
        a.parameters?.['channel'] ? `${a.name} → #${a.parameters['channel']}` : a.name
      ).join(', ')
    : '—';

const successRate = (logs: LogEntry[]) => {
  if (!logs.length) return null;
  return Math.round((logs.filter(l => l.status === 'success').length / logs.length) * 100);
};

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  const k = normaliseStatus(status);
  const c = STATUS_CFG[k];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} shrink-0`} />
      {c.label}
    </span>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, count, sub, cls, onClick, active }: {
  label: string; count: number | string; sub?: string;
  cls: string; onClick: () => void; active: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`rounded-xl border p-3 text-left transition-all hover:scale-[1.02] w-full ${active ? cls + ' ring-1 ring-current' : 'border-border bg-card hover:border-muted'}`}>
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-foreground">{count}</p>
      {sub && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{sub}</p>}
    </button>
  );
}

// ── Log timeline ───────────────────────────────────────────────────────────────

const LOG_PAGE_SIZE = 5;

function LogTimeline({ logsData, loading }: { logsData: LogsData | null; loading: boolean }) {
  const [page, setPage] = useState(1);
  const reversed = logsData?.logs.slice().reverse() ?? [];
  const visible  = reversed.slice(0, page * LOG_PAGE_SIZE);
  const hasMore  = visible.length < reversed.length;
  if (loading) {
    return (
      <div className="space-y-2 py-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-1 py-1.5 animate-pulse">
            <div className="w-5 h-5 rounded-full bg-muted/40 shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="h-3 bg-muted/40 rounded w-48" />
              <div className="h-2.5 bg-muted/30 rounded w-32" />
            </div>
            <div className="h-3 bg-muted/30 rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!logsData || logsData.logs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
        <Terminal className="h-8 w-8 opacity-20" />
        <p className="text-xs">Aucune exécution enregistrée</p>
      </div>
    );
  }

  const rate = successRate(logsData.logs);

  return (
    <div className="space-y-3">
      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-2 pb-1">
        <div className="rounded-lg border border-border/50 bg-muted/5 px-3 py-2 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
          <p className="text-lg font-bold tabular-nums">{logsData.totalTriggers ?? logsData.logs.length}</p>
        </div>
        {rate !== null && (
          <div className="rounded-lg border border-emerald-700/20 bg-emerald-900/10 px-3 py-2 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Succès</p>
            <p className="text-lg font-bold tabular-nums text-emerald-400">{rate}%</p>
          </div>
        )}
        {logsData.lastTriggeredAt && (
          <div className="rounded-lg border border-border/50 bg-muted/5 px-3 py-2 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Dernier</p>
            <p className="text-xs font-medium">{fmtRelative(logsData.lastTriggeredAt)}</p>
          </div>
        )}
      </div>

      {/* Log entries */}
      <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
        {visible.map((entry, i) => {
          const cfg = LOG_STATUS_CFG[entry.status] ?? LOG_STATUS_CFG.error;
          const Icon = cfg.icon;
          return (
            <div key={i} className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${cfg.bg}`}>
              <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${cfg.cls}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{entry.message}</p>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                  <span>{fmtTs(entry.ts)}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5">
                    <Clock className="h-3 w-3" />{entry.durationMs} ms
                  </span>
                  <span>·</span>
                  <span>{TRIGGER_LABEL[entry.triggeredBy] ?? entry.triggeredBy}</span>
                </div>
              </div>
              <span className={`text-[10px] font-semibold uppercase ${cfg.cls} shrink-0`}>
                {entry.status}
              </span>
            </div>
          );
        })}
        {hasMore && (
          <button onClick={() => setPage(p => p + 1)}
            className="w-full py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border/50 rounded-lg hover:border-border transition-colors flex items-center justify-center gap-1.5">
            <ChevronDown className="h-3.5 w-3.5" />
            Voir {Math.min(LOG_PAGE_SIZE, reversed.length - visible.length)} de plus
            ({reversed.length - visible.length} restants)
          </button>
        )}
        {page > 1 && !hasMore && reversed.length > LOG_PAGE_SIZE && (
          <button onClick={() => setPage(1)}
            className="w-full py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border/50 rounded-lg hover:border-border transition-colors flex items-center justify-center gap-1.5">
            <ChevronUp className="h-3.5 w-3.5" />Réduire
          </button>
        )}
      </div>
    </div>
  );
}

// ── Rule card ──────────────────────────────────────────────────────────────────

function RuleCard({
  rule, expanded, onToggleExpand, onEdit, onDelete,
  onApprove, onReject, onExecute, onToggleStatus,
  approving, executing, toggling, logsData, logsLoading,
}: {
  rule: Rule; expanded: boolean;
  onToggleExpand: (id: string) => void;
  onEdit: (r: Rule) => void;
  onDelete: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onExecute: (id: string) => void;
  onToggleStatus: (id: string) => void;
  approving: string | null; executing: string | null; toggling: string | null;
  logsData: LogsData | null; logsLoading: boolean;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const status   = normaliseStatus(rule.status);
  const isPending = status === 'PENDING';
  const isActive  = status === 'ACTIVE';
  const isPaused  = status === 'PAUSED';
  const canRun    = isActive || isPaused;
  const nextExec  = fmtFuture(rule.nextScheduledCheckAt);
  const isExec    = executing === rule.id;
  const isToggle  = toggling  === rule.id;

  return (
    <div className={`border-b border-border/40 last:border-b-0 transition-colors ${expanded ? 'bg-muted/5' : 'hover:bg-muted/5'}`}>
      {/* ── Main row ── */}
      <div className="flex items-start gap-3 px-4 py-3.5 group">
        <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${STATUS_CFG[status].dot}`} />

        {/* Info block */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold truncate">{rule.name ?? rule.id}</p>
            <StatusBadge status={rule.status} />
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground mt-1">
            {rule.sourceConnectorType && (
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3 opacity-60" />{fmtConnector(rule.sourceConnectorType)}
              </span>
            )}
            {rule.actions?.length ? (
              <span className="flex items-center gap-1 truncate max-w-xs">
                <Bell className="h-3 w-3 opacity-60" />{buildActionsLabel(rule.actions)}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-muted-foreground/70">
            <span className="flex items-center gap-1">
              <AlarmCheck className="h-3 w-3" />
              {rule.lastTriggeredAt ? fmtRelative(rule.lastTriggeredAt) : 'jamais exécutée'}
            </span>
            {nextExec && (
              <span className="flex items-center gap-1 text-sky-400/80">
                <CalendarClock className="h-3 w-3" />Prochain : {nextExec}
              </span>
            )}
            {(rule.totalTriggers ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <Activity className="h-3 w-3" />{rule.totalTriggers} déclenchement(s)
              </span>
            )}
            {rule.executionLogs && rule.executionLogs.length > 0 && (() => {
              const rate = successRate(rule.executionLogs!);
              return rate !== null ? (
                <span className="flex items-center gap-1 text-emerald-400/80">
                  <BarChart3 className="h-3 w-3" />{rate}% succès
                </span>
              ) : null;
            })()}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {/* Pending approval */}
          {isPending && (
            <div className="flex gap-1">
              <button onClick={() => onApprove(rule.id)} disabled={approving === rule.id}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-900/30 text-emerald-400 border border-emerald-700/30 rounded-lg hover:bg-emerald-900/50 transition-colors disabled:opacity-50">
                {approving === rule.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                Approuver
              </button>
              <button onClick={() => onReject(rule.id)} disabled={approving === rule.id}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-red-900/20 text-red-400 border border-red-700/30 rounded-lg hover:bg-red-900/30 transition-colors disabled:opacity-50">
                <XCircle className="h-3 w-3" />Rejeter
              </button>
            </div>
          )}

          {/* Run now */}
          {canRun && (
            <button onClick={() => onExecute(rule.id)} disabled={isExec}
              title="Exécuter maintenant"
              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-primary/10 text-primary border border-primary/30 rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50">
              {isExec ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
              {isExec ? 'Exécution…' : 'Lancer'}
            </button>
          )}

          {/* Toggle Active / Pause */}
          {(isActive || isPaused) && (
            <button onClick={() => onToggleStatus(rule.id)} disabled={isToggle}
              title={isActive ? 'Mettre en pause' : 'Réactiver'}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs border rounded-lg transition-colors disabled:opacity-50 ${
                isActive
                  ? 'bg-sky-900/20 text-sky-400 border-sky-700/30 hover:bg-sky-900/40'
                  : 'bg-emerald-900/20 text-emerald-400 border-emerald-700/30 hover:bg-emerald-900/40'
              }`}>
              {isToggle
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : isActive ? <PauseCircle className="h-3 w-3" /> : <PlayCircle className="h-3 w-3" />
              }
              {isActive ? 'Pause' : 'Activer'}
            </button>
          )}

          {/* Edit (hover) */}
          <button onClick={() => onEdit(rule)} title="Modifier"
            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100">
            <Pencil className="h-3.5 w-3.5" />
          </button>

          {/* Delete (hover) */}
          {confirmDel ? (
            <div className="flex items-center gap-1">
              <button onClick={() => { setConfirmDel(false); onDelete(rule.id); }}
                className="px-2 py-1 text-xs bg-red-900/30 text-red-400 border border-red-700/30 rounded-md hover:bg-red-900/50 transition-colors">
                Confirmer
              </button>
              <button onClick={() => setConfirmDel(false)}
                className="px-2 py-1 text-xs text-muted-foreground border border-border rounded-md hover:text-foreground transition-colors">
                Annuler
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)} title="Supprimer"
              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Expand toggle */}
          <button onClick={() => onToggleExpand(rule.id)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors ml-0.5">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* ── Expanded log panel ── */}
      {expanded && (
        <div className="px-5 pb-4 pt-1 border-t border-border/30 bg-card/30">
          <div className="flex items-center gap-2 mb-3">
            <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Historique d'exécution
            </span>
            {!logsLoading && logsData && (
              <span className="ml-auto text-[11px] text-muted-foreground/60">
                {logsData.logs.length} entrée(s)
              </span>
            )}
          </div>
          <LogTimeline logsData={logsData} loading={logsLoading} />
        </div>
      )}
    </div>
  );
}

// ── Reports tab ────────────────────────────────────────────────────────────────

function ReportCard({
  report, rules, onDelete, onGenerate, generating, deleting,
}: {
  report: Report; rules: Rule[];
  onDelete: (id: string) => void;
  onGenerate: (ruleId: string) => void;
  generating: string | null;
  deleting: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const { stats } = report;
  const isDeleting = deleting === report.id;

  return (
    <div className="border-b border-border/40 last:border-b-0">
      <div className="flex items-start gap-3 px-4 py-3.5 hover:bg-muted/5 group">
        <div className="flex-shrink-0 mt-0.5 p-1.5 rounded-lg bg-primary/10">
          <FileText className="h-4 w-4 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{report.title}</p>
          {report.summary && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{report.summary}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-muted-foreground/70">
            {report.ruleName && (
              <span className="flex items-center gap-1">
                <GitBranch className="h-3 w-3" />{report.ruleName}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />{fmtRelative(report.generatedAt)}
            </span>
            {report.period?.durationLabel && (
              <span className="flex items-center gap-1">
                <Archive className="h-3 w-3" />{report.period.durationLabel}
              </span>
            )}
          </div>

          {/* Stats mini-row */}
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/20 border border-border/40 text-[11px]">
              <Activity className="h-3 w-3 text-muted-foreground" />{stats.totalExecutions} exec
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-900/20 border border-emerald-700/20 text-[11px] text-emerald-400">
              <CheckCheck className="h-3 w-3" />{stats.successCount} ok · {stats.successRate}%
            </span>
            {stats.errorCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-900/20 border border-red-700/20 text-[11px] text-red-400">
                <XCircle className="h-3 w-3" />{stats.errorCount} erreur(s)
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/20 border border-border/40 text-[11px]">
              <Clock className="h-3 w-3 text-muted-foreground" />moy. {stats.avgDurationMs} ms
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Delete */}
          {confirmDel ? (
            <div className="flex items-center gap-1">
              <button onClick={() => { setConfirmDel(false); onDelete(report.id); }} disabled={isDeleting}
                className="px-2 py-1 text-xs bg-red-900/30 text-red-400 border border-red-700/30 rounded-md hover:bg-red-900/50 transition-colors">
                {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Supprimer'}
              </button>
              <button onClick={() => setConfirmDel(false)}
                className="px-2 py-1 text-xs text-muted-foreground border border-border rounded-md hover:text-foreground transition-colors">
                Annuler
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)} title="Supprimer"
              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {/* Expand logs */}
          {report.logs.length > 0 && (
            <button onClick={() => setExpanded(e => !e)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded log snapshot */}
      {expanded && report.logs.length > 0 && (
        <div className="px-5 pb-4 pt-1 border-t border-border/30 bg-card/30">
          <LogTimeline
            logsData={{ ruleId: report.ruleId, ruleName: report.ruleName ?? '', totalTriggers: stats.totalExecutions, logs: report.logs }}
            loading={false}
          />
        </div>
      )}
    </div>
  );
}

function ReportsTab({
  rules, rulesLoading,
}: {
  rules: Rule[]; rulesLoading: boolean;
}) {
  const [reports, setReports]       = useState<Report[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [generating, setGenerating] = useState<string | null>(null);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [filterRuleId, setFilterRuleId] = useState<string>('');

  const loadReports = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await reportsApi.list(filterRuleId || undefined);
      setReports(Array.isArray(res.data) ? res.data : (res.data?.data ?? []));
    } catch {
      setError('Impossible de charger les rapports.');
    } finally { setLoading(false); }
  }, [filterRuleId]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const handleGenerate = async (ruleId: string) => {
    setGenerating(ruleId);
    try {
      await rulesApi.generateReport(ruleId);
      await loadReports();
    } catch {
      setError('Erreur lors de la génération du rapport.');
    } finally { setGenerating(null); }
  };

  const handleDelete = async (reportId: string) => {
    setDeleting(reportId);
    try { await reportsApi.delete(reportId); await loadReports(); }
    catch { setError('Erreur lors de la suppression.'); }
    finally { setDeleting(null); }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-48">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <select
            value={filterRuleId}
            onChange={e => setFilterRuleId(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none text-foreground">
            <option value="">Toutes les règles</option>
            {rules.map(r => (
              <option key={r.id} value={r.id}>{r.name ?? r.id}</option>
            ))}
          </select>
        </div>

        {/* Generate report for a rule */}
        {rules.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {rules.filter(r => normaliseStatus(r.status) === 'ACTIVE' || normaliseStatus(r.status) === 'PAUSED').map(r => (
              <button key={r.id} onClick={() => handleGenerate(r.id)}
                disabled={generating === r.id || rulesLoading}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-primary/10 text-primary border border-primary/30 rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50">
                {generating === r.id
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <TrendingUp className="h-3 w-3" />}
                Rapport — {r.name?.slice(0, 20) ?? r.id.slice(0, 8)}
              </button>
            ))}
          </div>
        )}

        <button onClick={loadReports} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-secondary transition-colors">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}

      {/* Reports list */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="divide-y divide-border/40">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-start gap-4 px-4 py-4 animate-pulse">
                  <div className="w-8 h-8 rounded-lg bg-muted/30 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-muted/40 rounded w-64" />
                    <div className="h-3 bg-muted/30 rounded w-48" />
                    <div className="h-2.5 bg-muted/20 rounded w-80" />
                  </div>
                </div>
              ))}
            </div>
          ) : reports.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
              <BookOpen className="h-10 w-10 opacity-20" />
              <p className="text-sm">Aucun rapport généré</p>
              <p className="text-xs text-muted-foreground/60 max-w-xs text-center">
                Cliquez sur "Rapport — [règle]" ci-dessus pour générer un instantané du rapport d'exécution d'une règle
              </p>
            </div>
          ) : (
            <div>
              {reports.map(r => (
                <ReportCard
                  key={r.id}
                  report={r}
                  rules={rules}
                  onDelete={handleDelete}
                  onGenerate={handleGenerate}
                  generating={generating}
                  deleting={deleting}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Execute result toast ───────────────────────────────────────────────────────

function ExecToast({ msg, ok, onDismiss }: { msg: string; ok: boolean; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg max-w-sm ${
      ok ? 'bg-emerald-900/80 border-emerald-700/50 text-emerald-200'
         : 'bg-red-900/80 border-red-700/50 text-red-200'
    }`}>
      {ok ? <CheckCheck className="h-4 w-4 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
      <p className="text-sm flex-1">{msg}</p>
      <button onClick={onDismiss} className="opacity-60 hover:opacity-100 ml-2">
        <XCircle className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [rules, setRules]             = useState<Rule[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [approving, setApproving]     = useState<string | null>(null);
  const [executing, setExecuting]     = useState<string | null>(null);
  const [toggling, setToggling]       = useState<string | null>(null);
  const [filter, setFilter]           = useState<StatusKey | 'ALL'>('ALL');
  const [search, setSearch]           = useState('');
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [logsCache, setLogsCache]     = useState<Record<string, LogsData>>({});
  const [logsLoading, setLogsLoading] = useState(false);
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null);
  const [activeTab, setActiveTab]     = useState<'rules' | 'reports'>('rules');

  // ── Load rules ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await rulesApi.list();
      const data: Rule[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
      setRules(data);
    } catch {
      setError('Impossible de charger les règles — vérifiez la connexion au serveur.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Load logs ───────────────────────────────────────────────────────────────

  const loadLogs = useCallback(async (id: string, force = false) => {
    if (logsCache[id] && !force) return;
    setLogsLoading(true);
    try {
      const res = await rulesApi.logs(id);
      setLogsCache(prev => ({ ...prev, [id]: res.data }));
    } catch { /* silently — log panel shows empty state */ }
    finally { setLogsLoading(false); }
  }, [logsCache]);

  // ── Expand / collapse ────────────────────────────────────────────────────────

  const handleToggleExpand = useCallback((id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    loadLogs(id);
  }, [expandedId, loadLogs]);

  // ── Execute rule ─────────────────────────────────────────────────────────────

  const handleExecute = async (id: string) => {
    setExecuting(id);
    try {
      const res = await rulesApi.execute(id);
      const msg = res.data?.message ?? 'Règle exécutée avec succès';
      setToast({ msg, ok: true });
      // Refresh logs for expanded panel
      if (expandedId === id) loadLogs(id, true);
      else setLogsCache(prev => { const n = { ...prev }; delete n[id]; return n; });
      await load();
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.message ?? "Erreur lors de l'exécution";
      setToast({ msg, ok: false });
    } finally { setExecuting(null); }
  };

  // ── Toggle status ────────────────────────────────────────────────────────────

  const handleToggleStatus = async (id: string) => {
    setToggling(id);
    try { await rulesApi.toggle(id); await load(); }
    catch { setToast({ msg: 'Impossible de changer le statut', ok: false }); }
    finally { setToggling(null); }
  };

  // ── Approve / Reject / Delete / Edit ─────────────────────────────────────────

  const handleApprove = async (id: string) => {
    setApproving(id);
    try { await rulesApi.approve(id); await load(); }
    catch { /* noop */ }
    finally { setApproving(null); }
  };

  const handleReject = async (id: string) => {
    setApproving(id);
    try { await rulesApi.reject(id); await load(); }
    catch { /* noop */ }
    finally { setApproving(null); }
  };

  const handleDelete = async (id: string) => {
    try { await rulesApi.delete(id); await load(); }
    catch { setError('Erreur lors de la suppression.'); }
  };

  const handleEdit = (rule: Rule) => navigate(`/analysis?editRule=${rule.id}`);

  // ── Counts ───────────────────────────────────────────────────────────────────

  const counts = {
    ACTIVE:        rules.filter(r => normaliseStatus(r.status) === 'ACTIVE').length,
    PAUSED:        rules.filter(r => normaliseStatus(r.status) === 'PAUSED').length,
    PENDING:       rules.filter(r => normaliseStatus(r.status) === 'PENDING').length,
    INACTIVE:      rules.filter(r => normaliseStatus(r.status) === 'INACTIVE').length,
    total:         rules.length,
    totalTriggers: rules.reduce((acc, r) => acc + (r.totalTriggers ?? 0), 0),
  };

  // ── Filtered list ─────────────────────────────────────────────────────────────

  const filtered = rules.filter(r => {
    const matchStatus = filter === 'ALL' || normaliseStatus(r.status) === filter;
    const matchSearch = !search || (r.name ?? r.id).toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />{t('automations.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {rules.length} règle(s) · {counts.totalTriggers} déclenchement(s) au total
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-secondary transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
          <button onClick={() => navigate('/analysis')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
            <Plus className="h-3.5 w-3.5" />Nouvelle règle
          </button>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-border/50 pb-0">
        {([
          { id: 'rules',   label: 'Règles',   icon: GitBranch, count: rules.length },
          { id: 'reports', label: 'Rapports', icon: FileText,  count: undefined },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}>
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {tab.count !== undefined && (
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id ? 'bg-primary/15 text-primary' : 'bg-muted/50 text-muted-foreground'
              }`}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'rules' && <>
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiCard label="Toutes"          count={counts.total}          cls="border-border bg-card"                       active={filter === 'ALL'}      onClick={() => setFilter('ALL')}                                         />
        <KpiCard label="Actives"         count={counts.ACTIVE}         cls={STATUS_CFG.ACTIVE.cls}   active={filter === 'ACTIVE'}   onClick={() => setFilter(filter === 'ACTIVE'   ? 'ALL' : 'ACTIVE')}   />
        <KpiCard label="Pausées"         count={counts.PAUSED}         cls={STATUS_CFG.PAUSED.cls}   active={filter === 'PAUSED'}   onClick={() => setFilter(filter === 'PAUSED'   ? 'ALL' : 'PAUSED')}   />
        <KpiCard label="En attente"      count={counts.PENDING}        cls={STATUS_CFG.PENDING.cls}  active={filter === 'PENDING'}  onClick={() => setFilter(filter === 'PENDING'  ? 'ALL' : 'PENDING')}  />
        <KpiCard label="Déclenchements"  count={counts.totalTriggers}  sub="toutes règles confondues" cls="border-border bg-card"  active={false}                onClick={() => {}}                                              />
      </div>

      {/* Rules list */}
      <Card>
        <CardHeader className="py-3 px-4 border-b border-border/50">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-40">
              <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher une règle…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {(['ALL', 'ACTIVE', 'PAUSED', 'PENDING', 'INACTIVE', 'REJECTED'] as const).map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${filter === s ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  {s === 'ALL' ? 'Toutes' : STATUS_CFG[s as StatusKey]?.label ?? s.toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive p-4">
              <AlertCircle className="h-4 w-4" />{error}
            </div>
          )}
          {loading ? (
            <div className="divide-y divide-border/40">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-4 animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-muted/40 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-muted/40 rounded w-48" />
                    <div className="h-3 bg-muted/30 rounded w-64" />
                    <div className="h-2.5 bg-muted/20 rounded w-36" />
                  </div>
                  <div className="h-5 bg-muted/30 rounded w-16" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
              <GitBranch className="h-10 w-10 opacity-20" />
              <p className="text-sm">
                {rules.length === 0 ? 'Aucune règle configurée' : 'Aucune règle ne correspond aux filtres'}
              </p>
              {rules.length === 0 && (
                <button onClick={() => navigate('/analysis')}
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline mt-1">
                  <Plus className="h-4 w-4" />Créer votre première règle
                </button>
              )}
            </div>
          ) : (
            <div>
              {filtered.map(r => (
                <RuleCard
                  key={r.id}
                  rule={r}
                  expanded={expandedId === r.id}
                  onToggleExpand={handleToggleExpand}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onExecute={handleExecute}
                  onToggleStatus={handleToggleStatus}
                  approving={approving}
                  executing={executing}
                  toggling={toggling}
                  logsData={logsCache[r.id] ?? null}
                  logsLoading={logsLoading && expandedId === r.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CTA */}
      {!loading && rules.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Zap className="h-4 w-4 text-primary" />
            Générer une nouvelle règle depuis une intention en langage naturel
          </div>
          <button onClick={() => navigate('/analysis')}
            className="flex items-center gap-1 text-sm text-primary hover:underline font-medium shrink-0">
            Analyser <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      </>}

      {activeTab === 'reports' && <ReportsTab rules={rules} rulesLoading={loading} />}

      {/* Toast */}
      {toast && <ExecToast msg={toast.msg} ok={toast.ok} onDismiss={() => setToast(null)} />}
    </div>
  );
}

