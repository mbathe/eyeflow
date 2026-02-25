import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Lightbulb, CheckCircle2, XCircle, Clock, AlertTriangle,
  BarChart3, RefreshCw, Plus, ChevronDown, Sparkles,
  Info, Loader2, Trash2, CalendarClock,
  Bot, FlaskConical, Activity, Shield, CheckCheck,
  Eye, Zap, Play, Bell, Settings, Search,
} from 'lucide-react';
import { suggestionsApi, suggestionWatchesApi, connectorsApi } from '@/services/api';
import { cn } from '@/lib/utils';
import { SuggestionEnginePanel } from '@/components/SuggestionEnginePanel';
import { WatchDialog, WatchCard, type SuggestionWatch } from '@/components/WatchDialog';
import { ActionConfirmDialog } from '@/components/ActionConfirmDialog';

type PageTab = 'suggestions' | 'watches';

interface ConnectorItem { id: string; name: string; type: string; }

// ── Types ─────────────────────────────────────────────────────────────────────

type SuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'deferred';
type SuggestionPriority = 'critical' | 'high' | 'medium' | 'low';
type DecisionVerb = 'accept' | 'reject' | 'defer';

interface Suggestion {
  id: string;
  title: string;
  description: string;
  priority: SuggestionPriority;
  status: SuggestionStatus;
  confidence: number;
  impact?: string;
  source: string;
  category?: string;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionComment?: string;
  suggestedAction?: Record<string, unknown>;
  // AI engine fields
  reasoning?: string;
  evidence?: Record<string, unknown>;
  executed?: boolean;
  executedAt?: string;
}

// ── Engine config dialog + panel moved to @/components/SuggestionEnginePanel ─

interface Stats {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
  deferred: number;
  [key: string]: unknown; // backend may return extra fields (e.g. byPriority)
}

const STATS_KEYS: Array<'total' | 'pending' | 'accepted' | 'rejected' | 'deferred'> = [
  'total', 'pending', 'accepted', 'rejected', 'deferred',
];

// ── Style helpers ─────────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<SuggestionPriority, string> = {
  critical: 'bg-red-900/30 text-red-300 border-red-700/40',
  high:     'bg-orange-900/30 text-orange-300 border-orange-700/40',
  medium:   'bg-amber-900/30 text-amber-300 border-amber-700/40',
  low:      'bg-blue-900/20 text-blue-300 border-blue-700/30',
};

const PRIORITY_DOT: Record<SuggestionPriority, string> = {
  critical: 'bg-red-400',
  high:     'bg-orange-400',
  medium:   'bg-amber-400',
  low:      'bg-blue-400',
};

const STATUS_STYLES: Record<SuggestionStatus, string> = {
  pending:  'bg-amber-900/20 text-amber-300',
  accepted: 'bg-emerald-900/20 text-emerald-300',
  rejected: 'bg-red-900/20 text-red-400',
  deferred: 'bg-gray-800 text-gray-400',
};

const ACTION_BADGE: Record<string, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  INVESTIGATE:    { label: 'Investigation',     color: 'text-blue-400',   bg: 'bg-blue-900/20',   border: 'border-blue-700/30',   Icon: Search   },
  NOTIFY:         { label: 'Notification',      color: 'text-cyan-400',   bg: 'bg-cyan-900/20',   border: 'border-cyan-700/30',   Icon: Bell     },
  UPDATE_CONFIG:  { label: 'Config',            color: 'text-amber-400',  bg: 'bg-amber-900/20',  border: 'border-amber-700/30',  Icon: Settings },
  EXECUTE_ACTION: { label: 'Exécution directe', color: 'text-orange-400', bg: 'bg-orange-900/20', border: 'border-orange-700/30', Icon: Play     },
  CREATE_RULE:    { label: 'Règle IA',          color: 'text-purple-400', bg: 'bg-purple-900/20', border: 'border-purple-700/30', Icon: Zap      },
  SCHEDULE:       { label: 'Planification',     color: 'text-teal-400',   bg: 'bg-teal-900/20',   border: 'border-teal-700/30',   Icon: Clock    },
};

// ── Cycle banner ──────────────────────────────────────────────────────────────

function CycleBanner() {
  const { t } = useTranslation();
  const steps = [
    { key: 'observer', icon: BarChart3, color: 'text-blue-400' },
    { key: 'analyser', icon: Sparkles,  color: 'text-purple-400' },
    { key: 'proposer', icon: Lightbulb, color: 'text-amber-400' },
    { key: 'valider',  icon: CheckCircle2, color: 'text-emerald-400' },
  ] as const;

  return (
    <div className="flex items-center gap-1 rounded-xl border border-gray-800 bg-gray-900 px-5 py-3 text-xs">
      {steps.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <s.icon size={13} className={s.color} />
          <span className="font-medium text-gray-300">{t(`suggestions.cycle.${s.key}`)}</span>
          {i < steps.length - 1 && <span className="mx-1 text-gray-600">→</span>}
        </span>
      ))}
    </div>
  );
}

// ── Decision dialog ───────────────────────────────────────────────────────────

interface DecisionDialogProps {
  suggestion: Suggestion;
  verb: DecisionVerb;
  onConfirm: (comment: string, deferUntil?: string) => Promise<void>;
  onClose: () => void;
}

function DecisionDialog({ suggestion, verb, onConfirm, onClose }: DecisionDialogProps) {
  const { t } = useTranslation();
  const [comment, setComment] = useState('');
  const [deferUntil, setDeferUntil] = useState('');
  const [loading, setLoading] = useState(false);

  const titleKey = verb === 'accept' ? 'acceptTitle' : verb === 'reject' ? 'rejectTitle' : 'deferTitle';
  const hintKey  = verb === 'accept' ? 'acceptHint'  : verb === 'reject' ? 'rejectHint'  : 'deferHint';

  const handle = async () => {
    setLoading(true);
    try {
      await onConfirm(comment, verb === 'defer' ? deferUntil : undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <h2 className="mb-1 text-base font-bold text-gray-100">
          {t(`suggestions.dialogs.${titleKey}`)}
        </h2>
        <p className="mb-1 text-xs font-semibold text-gray-400 truncate">{suggestion.title}</p>
        <p className="mb-4 text-xs text-gray-500">{t(`suggestions.dialogs.${hintKey}`)}</p>

        {verb === 'defer' && (
          <div className="mb-3">
            <label className="mb-1 block text-xs text-gray-400">{t('suggestions.actions.deferUntil')}</label>
            <input
              type="date"
              value={deferUntil}
              onChange={e => setDeferUntil(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-xs text-gray-400">{t('suggestions.actions.addComment')}</label>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:bg-gray-800"
          >
            {t('suggestions.actions.cancel')}
          </button>
          <button
            onClick={handle}
            disabled={loading || (verb === 'defer' && !deferUntil)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50',
              verb === 'accept' ? 'bg-emerald-600 hover:bg-emerald-500' :
              verb === 'reject' ? 'bg-red-600 hover:bg-red-500' :
              'bg-amber-600 hover:bg-amber-500',
            )}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {t('suggestions.actions.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Suggestion card ───────────────────────────────────────────────────────────

interface CardProps {
  s: Suggestion;
  onDecide: (id: string, verb: DecisionVerb) => void;
  onDelete: (id: string) => void;
  onActionPreview: (s: Suggestion) => void;
  executing?: string | null;
}

function SuggestionCard({ s, onDecide, onDelete, onActionPreview }: CardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      'rounded-xl border bg-gray-900 transition-all',
      s.priority === 'critical' ? 'border-red-700/50' :
      s.priority === 'high'     ? 'border-orange-700/40' :
      'border-gray-800',
    )}>
      {/* Header row */}
      <div className="flex items-start gap-3 p-4">
        {/* Priority dot */}
        <div className="mt-1.5 shrink-0">
          <span className={cn('block h-2.5 w-2.5 rounded-full', PRIORITY_DOT[s.priority])} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', PRIORITY_STYLES[s.priority])}>
              {t(`suggestions.priority.${s.priority}`)}
            </span>
            <span className={cn('rounded-full px-2 py-0.5 text-xs', STATUS_STYLES[s.status])}>
              {t(`suggestions.status.${s.status}`)}
            </span>
            {s.source === 'ai_engine' && (
              <span className="flex items-center gap-1 rounded-full bg-purple-900/30 border border-purple-700/30 px-2 py-0.5 text-[10px] text-purple-300">
                <Bot size={10} /> IA
              </span>
            )}
            {s.executed && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-900/30 border border-emerald-700/30 px-2 py-0.5 text-[10px] text-emerald-300">
                <CheckCheck size={10} /> Exécutée
              </span>
            )}
            {/* Action type badge — shown when actionable; "Informatif" badge when advisory only */}
            {s.suggestedAction ? (() => {
              const actionType = (s.suggestedAction['type'] as string)?.toUpperCase() ?? '';
              const ab = ACTION_BADGE[actionType];
              if (!ab) return null;
              return (
                <span className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold', ab.bg, ab.border, ab.color)}>
                  <ab.Icon size={9} /> {ab.label}
                </span>
              );
            })() : (
              <span className="flex items-center gap-1 rounded-full border border-gray-700/40 bg-gray-800/40 px-2 py-0.5 text-[10px] text-gray-500">
                <Info size={9} /> Informatif
              </span>
            )}
            {s.category && (
              <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">{s.category}</span>
            )}
            <span className="ml-auto text-xs text-gray-600">
              {new Date(s.createdAt).toLocaleDateString()}
            </span>
          </div>

          <h3 className="text-sm font-semibold text-gray-100 mb-0.5">{s.title}</h3>
          <p className="text-xs text-gray-400 line-clamp-2">{s.description}</p>

          {/* Confidence bar */}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-gray-500">{t('suggestions.fields.confidence')}</span>
            <div className="flex-1 h-1.5 rounded-full bg-gray-800 max-w-[120px]">
              <div
                className={cn('h-1.5 rounded-full', s.confidence >= 80 ? 'bg-emerald-500' : s.confidence >= 50 ? 'bg-amber-500' : 'bg-red-500')}
                style={{ width: `${s.confidence}%` }}
              />
            </div>
            <span className="text-xs text-gray-400">{s.confidence}%</span>
          </div>
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-0.5 shrink-0 text-gray-600 hover:text-gray-300"
        >
          <ChevronDown size={16} className={cn('transition-transform', expanded && 'rotate-180')} />
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-800 px-4 py-3 space-y-2">
          {s.impact && (
            <div className="flex gap-2 text-xs">
              <Info size={13} className="mt-0.5 shrink-0 text-blue-400" />
              <div>
                <span className="text-gray-500">{t('suggestions.fields.impact')}: </span>
                <span className="text-gray-300">{s.impact}</span>
              </div>
            </div>
          )}
          <div className="flex gap-2 text-xs">
            <span className="text-gray-500">{t('suggestions.fields.source')}: </span>
            <span className="text-gray-300">{t(`suggestions.source.${s.source}`, { defaultValue: s.source })}</span>
          </div>
          {/* AI reasoning */}
          {s.reasoning && (
            <details className="text-xs">
              <summary className="cursor-pointer flex items-center gap-1.5 text-purple-400 hover:text-purple-300">
                <Bot size={12} /> Raisonnement IA
              </summary>
              <p className="mt-1.5 rounded bg-purple-950/30 border border-purple-800/30 px-3 py-2 text-gray-300 leading-relaxed">
                {s.reasoning}
              </p>
            </details>
          )}

          {/* Evidence chips */}
          {s.evidence && Object.keys(s.evidence).length > 0 && (
            <div className="text-xs">
              <span className="text-gray-500 mr-2">Preuves :</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(s.evidence).map(([k, v]) => (
                  <span key={k} className="rounded bg-gray-800 border border-gray-700 px-2 py-0.5 text-gray-300">
                    <span className="text-gray-500">{k}:</span> {String(v)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {s.suggestedAction && (
            <details className="text-xs">
              <summary className="cursor-pointer flex items-center gap-1.5 text-blue-400 hover:text-blue-300">
                <FlaskConical size={12} /> Action suggérée
              </summary>
              <pre className="mt-1 overflow-x-auto rounded bg-gray-950 p-2 text-gray-400 text-[11px]">
                {JSON.stringify(s.suggestedAction, null, 2)}
              </pre>
            </details>
          )}
          {s.decisionComment && (
            <div className="rounded bg-gray-800 px-3 py-2 text-xs text-gray-400 italic">
              « {s.decisionComment} »
            </div>
          )}
        </div>
      )}

      {/* Actions — only for pending/deferred */}
      {(s.status === 'pending' || s.status === 'deferred') && (
        <div className="flex items-center gap-2 border-t border-gray-800 px-4 py-2 flex-wrap">
          <button
            onClick={() => onDecide(s.id, 'accept')}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-900/20 border border-emerald-700/30 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-800/30 transition-colors"
          >
            <CheckCircle2 size={13} />
            {t('suggestions.actions.accept')}
          </button>
          <button
            onClick={() => onDecide(s.id, 'defer')}
            className="flex items-center gap-1.5 rounded-lg bg-amber-900/20 border border-amber-700/30 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-800/30 transition-colors"
          >
            <CalendarClock size={13} />
            {t('suggestions.actions.defer')}
          </button>
          <button
            onClick={() => onDecide(s.id, 'reject')}
            className="flex items-center gap-1.5 rounded-lg bg-red-900/20 border border-red-700/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-800/30 transition-colors"
          >
            <XCircle size={13} />
            {t('suggestions.actions.reject')}
          </button>
          {/* Execute action */}
          {s.suggestedAction && !s.executed && (
            <button
              onClick={() => onActionPreview(s)}
              className="flex items-center gap-1.5 rounded-lg bg-purple-900/30 border border-purple-700/40 px-3 py-1.5 text-xs text-purple-300 hover:bg-purple-800/40 transition-colors"
            >
              <Activity size={12} />
              Voir plan d'action
            </button>
          )}
          {s.executed && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-900/10 border border-emerald-700/20 rounded-lg px-2 py-1.5">
              <CheckCheck size={11} /> Exécutée
            </span>
          )}
          <button
            onClick={() => onDelete(s.id)}
            className="ml-auto text-gray-600 hover:text-red-400 transition-colors"
            title={t('suggestions.actions.delete')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Create form ───────────────────────────────────────────────────────────────

interface CreateFormProps {
  onCreated: () => void;
  onClose: () => void;
}

function CreateForm({ onCreated, onClose }: CreateFormProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [impact, setImpact] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handle = async () => {
    if (!title.trim() || !description.trim()) return;
    setLoading(true);
    setError('');
    try {
      await suggestionsApi.create({ title, description, impact, category, source: 'manual' });
      onCreated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <h2 className="mb-4 text-base font-bold text-gray-100">{t('suggestions.createForm.title')}</h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-gray-400">{t('suggestions.createForm.titleField')}</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">{t('suggestions.createForm.descriptionField')}</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-400">{t('suggestions.createForm.impactField')}</label>
              <input
                value={impact}
                onChange={e => setImpact(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">{t('suggestions.createForm.categoryField')}</label>
              <input
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:bg-gray-800">
            {t('suggestions.actions.cancel')}
          </button>
          <button
            onClick={handle}
            disabled={loading || !title.trim() || !description.trim()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {t('suggestions.createForm.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SuggestionsPage() {
  const { t } = useTranslation();
  const [pageTab, setPageTab] = useState<PageTab>('suggestions');

  // ── Suggestions state
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, accepted: 0, rejected: 0, deferred: 0 });
  const [statusFilter, setStatusFilter] = useState<SuggestionStatus | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Engine state
  const [triggering, setTriggering] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);

  // Dialog state
  const [decisionTarget, setDecisionTarget] = useState<{ id: string; verb: DecisionVerb } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [actionTarget, setActionTarget] = useState<Suggestion | null>(null);

  // ── Watches state
  const [watches, setWatches] = useState<SuggestionWatch[]>([]);
  const [watchesLoading, setWatchesLoading] = useState(false);
  const [connectors, setConnectors] = useState<ConnectorItem[]>([]);
  const [watchDialog, setWatchDialog] = useState<SuggestionWatch | null | 'new'>(null);
  const [triggeringWatch, setTriggeringWatch] = useState<string | null>(null);

  // ── Data loading ─────────────────────────────────────────────────────────────

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const [listRes, statsRes] = await Promise.allSettled([
        statusFilter === 'all'
          ? suggestionsApi.list()
          : suggestionsApi.list(statusFilter),
        suggestionsApi.stats(),
      ]);

      if (listRes.status === 'fulfilled') {
        const data = listRes.value.data as { suggestions?: Suggestion[] } | Suggestion[];
        setSuggestions(Array.isArray(data) ? data : (data.suggestions ?? []));
      }
      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data as Stats);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  // ── Watches loading ───────────────────────────────────────────────────────────
  const loadWatches = useCallback(async () => {
    setWatchesLoading(true);
    try {
      const [wRes, cRes] = await Promise.allSettled([
        suggestionWatchesApi.list(),
        connectorsApi.list(),
      ]);
      if (wRes.status === 'fulfilled') {
        const d = wRes.value.data;
        setWatches(Array.isArray(d) ? d : (d.data ?? []));
      }
      if (cRes.status === 'fulfilled') {
        const d = cRes.value.data;
        setConnectors(Array.isArray(d) ? d : (d.data ?? []));
      }
    } finally {
      setWatchesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pageTab === 'watches') loadWatches();
  }, [pageTab, loadWatches]);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleDecideOpen = (id: string, verb: DecisionVerb) => {
    setDecisionTarget({ id, verb });
  };

  const handleDecideConfirm = async (comment: string, deferUntil?: string) => {
    if (!decisionTarget) return;
    await suggestionsApi.decide(decisionTarget.id, decisionTarget.verb, comment, deferUntil);
    setDecisionTarget(null);
    load(true);
  };

  const handleDelete = async (id: string) => {
    await suggestionsApi.remove(id);
    load(true);
  };

  const handleCreated = () => {
    setShowCreate(false);
    load(true);
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await suggestionsApi.engineTrigger();
      setTimeout(() => load(true), 3000);
    } catch (e) {
      console.error('Engine trigger failed', e);
    } finally {
      setTriggering(false);
    }
  };

  const handleWatchSaved = (w: SuggestionWatch) => {
    setWatches(prev => prev.some(x => x.id === w.id) ? prev.map(x => x.id === w.id ? w : x) : [w, ...prev]);
    setWatchDialog(null);
  };

  const handleWatchDelete = async (id: string) => {
    await suggestionWatchesApi.remove(id);
    setWatches(prev => prev.filter(x => x.id !== id));
  };

  const handleWatchTrigger = async (id: string) => {
    setTriggeringWatch(id);
    try {
      await suggestionWatchesApi.trigger(id);
      setTimeout(() => loadWatches(), 2000);
    } catch (e) {
      console.error('Watch trigger failed', e);
    } finally {
      setTriggeringWatch(null);
    }
  };

  const handleWatchToggle = async (id: string, enabled: boolean) => {
    const r = await suggestionWatchesApi.update(id, { enabled });
    setWatches(prev => prev.map(x => x.id === id ? r.data : x));
  };

  const handleExecute = async (id: string) => {
    setExecuting(id);
    try {
      await suggestionsApi.execute(id);
      load(true);
    } catch (e) {
      console.error('Execute failed', e);
    } finally {
      setExecuting(null);
    }
  };

  const handleActionConfirmed = async (comment: string) => {
    if (!actionTarget) return;
    await suggestionsApi.execute(actionTarget.id, comment);
    setActionTarget(null);
    load(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const decisionSuggestion = decisionTarget
    ? suggestions.find(s => s.id === decisionTarget.id)
    : null;

  const STATUS_TABS: Array<SuggestionStatus | 'all'> = ['pending', 'all', 'accepted', 'rejected', 'deferred'];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">{t('suggestions.title')}</h1>
          <p className="mt-1 text-sm text-gray-400">{t('suggestions.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {pageTab === 'suggestions' ? (
            <>
              <button
                onClick={() => load(true)}
                disabled={refreshing}
                className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
              >
                <Plus size={15} />
                {t('suggestions.actions.create')}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={loadWatches}
                disabled={watchesLoading}
                className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50"
              >
                <RefreshCw size={14} className={watchesLoading ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={() => setWatchDialog('new')}
                className="flex items-center gap-2 rounded-lg bg-purple-700 hover:bg-purple-600 px-4 py-2 text-sm font-medium text-white"
              >
                <Plus size={15} />
                Nouvelle surveillance
              </button>
            </>
          )}
        </div>
      </div>

      {/* Page tabs */}
      <div className="mb-5 flex gap-1">
        {([['suggestions', Lightbulb, t('suggestions.title')], ['watches', Eye, 'Surveillances']] as const).map(([key, Icon, label]) => (
          <button
            key={key}
            onClick={() => setPageTab(key as PageTab)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              pageTab === key
                ? key === 'watches' ? 'bg-purple-700/30 text-purple-300' : 'bg-blue-600/20 text-blue-300'
                : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300',
            )}
          >
            <Icon size={14} />
            {label}
            {key === 'watches' && watches.length > 0 && (
              <span className="ml-0.5 rounded-full bg-purple-700/40 text-purple-300 text-[10px] font-bold px-1.5">
                {watches.filter(w => w.enabled).length}/{watches.length}
              </span>
            )}
            {key === 'suggestions' && stats.pending > 0 && (
              <span className="ml-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold px-1.5">
                {stats.pending}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── WATCHES TAB ─────────────────────────────────────────────────────── */}
      {pageTab === 'watches' && (
        <div>
          {watchesLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-800" />)}
            </div>
          ) : watches.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-purple-700/30 bg-purple-900/10">
                <Eye size={28} className="text-purple-400 opacity-50" strokeWidth={1} />
              </div>
              <div>
                <p className="text-lg font-medium text-gray-500">Aucune surveillance configurée</p>
                <p className="mt-1 max-w-sm text-sm text-gray-600">
                  Créez une règle de surveillance pour que l'IA analyse automatiquement vos sources de données à intervalles réguliers et génère des suggestions.
                </p>
              </div>
              <button
                onClick={() => setWatchDialog('new')}
                className="flex items-center gap-2 rounded-xl bg-purple-700 hover:bg-purple-600 px-5 py-2.5 text-sm font-medium text-white transition-colors"
              >
                <Plus size={15} /> Créer ma première surveillance
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {watches.map(w => (
                <WatchCard
                  key={w.id}
                  watch={w}
                  connectors={connectors}
                  onEdit={setWatchDialog}
                  onDelete={handleWatchDelete}
                  onTrigger={handleWatchTrigger}
                  onToggle={handleWatchToggle}
                  triggering={triggeringWatch}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SUGGESTIONS TAB ─────────────────────────────────────────────────── */}
      {pageTab === 'suggestions' && (
        <>
      {/* AI Engine panel */}
      <div className="mb-4">
        <SuggestionEnginePanel onTrigger={handleTrigger} triggering={triggering} />
      </div>

      {/* Cycle banner */}
      <div className="mb-5">
        <CycleBanner />
      </div>

      {/* Stats row */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STATS_KEYS.map(key => (
          <div key={key} className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-center">
            <div className={cn(
              'text-xl font-bold',
              key === 'pending'  ? 'text-amber-400' :
              key === 'accepted' ? 'text-emerald-400' :
              key === 'rejected' ? 'text-red-400' :
              key === 'deferred' ? 'text-gray-400' : 'text-gray-200',
            )}>
              {stats[key] as number}
            </div>
            <div className="text-xs text-gray-500">{t(`suggestions.stats.${key}`)}</div>
          </div>
        ))}
      </div>

      {/* Status filter tabs */}
      <div className="mb-5 flex gap-1 flex-wrap">
        {STATUS_TABS.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm transition-colors',
              statusFilter === s
                ? 'bg-blue-600/25 text-blue-300 font-medium'
                : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300',
            )}
          >
            {t(`suggestions.status.${s === 'all' ? 'all' : s}`)}
            {s === 'pending' && stats.pending > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {stats.pending}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-800" />
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center text-gray-600">
          <Lightbulb size={48} strokeWidth={1} />
          <p className="text-lg font-medium text-gray-500">{t('suggestions.empty.title')}</p>
          <p className="max-w-sm text-sm">{t('suggestions.empty.hint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map(s => (
            <SuggestionCard
              key={s.id}
              s={s}
              onDecide={handleDecideOpen}
              onDelete={handleDelete}
              onActionPreview={setActionTarget}
            />
          ))}
        </div>
      )}

        </>
      )}

      {/* Dialogs */}
      {decisionTarget && decisionSuggestion && (
        <DecisionDialog
          suggestion={decisionSuggestion}
          verb={decisionTarget.verb}
          onConfirm={handleDecideConfirm}
          onClose={() => setDecisionTarget(null)}
        />
      )}
      {showCreate && (
        <CreateForm onCreated={handleCreated} onClose={() => setShowCreate(false)} />
      )}
      {actionTarget && (
        <ActionConfirmDialog
          suggestionId={actionTarget.id}
          suggestionTitle={actionTarget.title}
          onConfirmed={handleActionConfirmed}
          onClose={() => setActionTarget(null)}
        />
      )}
      {watchDialog !== null && (
        <WatchDialog
          watch={watchDialog === 'new' ? null : watchDialog}
          onSaved={handleWatchSaved}
          onClose={() => setWatchDialog(null)}
        />
      )}
    </div>
  );
}
