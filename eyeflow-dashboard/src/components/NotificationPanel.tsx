/**
 * NotificationPanel
 *
 * Dynamic notification dropdown displayed when the user clicks the Bell icon.
 * Widget rendering is fully data-driven — icon, colour, actions and layout
 * adapt to the notification payload (priority, confidence, category, source).
 *
 * Nothing is hardcoded: every visual choice is computed from the data.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, X, CheckCheck, Trash2, Bot, Zap, Activity, Shield,
  Plug2, Play, Lightbulb, AlertTriangle, CheckCircle2, Clock,
  XCircle, ChevronRight, Sparkles, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useNotificationStore,
  useNotifications,
  useUnreadCount,
  type AppNotification,
  type SuggestionPayload,
} from '@/store/notification.store';
import { suggestionsApi } from '@/services/api';

// ── Dynamic icon resolver ─────────────────────────────────────────────────────

const CATEGORY_ICONS: Array<{ keywords: string[]; Icon: React.ElementType; colorClass: string }> = [
  { keywords: ['connecteur', 'connector', 'connexion', 'connection', 'api', 'intégration'], Icon: Plug2,       colorClass: 'text-cyan-400' },
  { keywords: ['job', 'tâche', 'task', 'exécution', 'execution', 'pipeline'],              Icon: Play,        colorClass: 'text-blue-400' },
  { keywords: ['règle', 'rule', 'automation', 'automatisation', 'workflow'],               Icon: Zap,         colorClass: 'text-yellow-400' },
  { keywords: ['performance', 'cpu', 'mémoire', 'memory', 'latence', 'latency', 'lent'],   Icon: Activity,    colorClass: 'text-orange-400' },
  { keywords: ['sécurité', 'security', 'accès', 'access', 'auth', 'permis'],               Icon: Shield,      colorClass: 'text-red-400' },
  { keywords: ['agent', 'ia', 'ai', 'modèle', 'model', 'llm'],                            Icon: Bot,         colorClass: 'text-purple-400' },
  { keywords: ['optimisation', 'optimization', 'amélioration', 'améliore'],                Icon: Sparkles,    colorClass: 'text-emerald-400' },
  { keywords: ['erreur', 'error', 'échec', 'failed', 'fail'],                             Icon: AlertTriangle, colorClass: 'text-red-400' },
];

function resolveIcon(s: SuggestionPayload): { Icon: React.ElementType; colorClass: string } {
  const text = `${s.title} ${s.description} ${s.category ?? ''}`.toLowerCase();
  for (const entry of CATEGORY_ICONS) {
    if (entry.keywords.some((kw) => text.includes(kw))) {
      return { Icon: entry.Icon, colorClass: entry.colorClass };
    }
  }
  return { Icon: Lightbulb, colorClass: 'text-amber-400' };
}

// ── Priority theme resolver ───────────────────────────────────────────────────

const PRIORITY_THEME: Record<string, { border: string; badge: string; dot: string }> = {
  critical: {
    border: 'border-red-700/60 bg-red-950/30',
    badge:  'bg-red-900/40 text-red-300 border-red-700/40',
    dot:    'bg-red-400',
  },
  high: {
    border: 'border-orange-700/50 bg-orange-950/20',
    badge:  'bg-orange-900/30 text-orange-300 border-orange-700/40',
    dot:    'bg-orange-400',
  },
  medium: {
    border: 'border-amber-700/40 bg-gray-900',
    badge:  'bg-amber-900/20 text-amber-300 border-amber-700/30',
    dot:    'bg-amber-400',
  },
  low: {
    border: 'border-gray-700/40 bg-gray-900',
    badge:  'bg-gray-800 text-gray-400 border-gray-700/30',
    dot:    'bg-blue-400',
  },
};

// ── Suggestion widget ─────────────────────────────────────────────────────────

interface SuggestionWidgetProps {
  notif: AppNotification;
}

function SuggestionWidget({ notif }: SuggestionWidgetProps) {
  const { markRead, dismiss } = useNotificationStore();
  const navigate = useNavigate();
  const s = notif.suggestion!;
  const theme = PRIORITY_THEME[s.priority] ?? PRIORITY_THEME.medium;
  const { Icon, colorClass } = resolveIcon(s);
  const [acting, setActing] = useState(false);

  const decide = async (decision: 'accept' | 'reject' | 'defer') => {
    setActing(true);
    try {
      await suggestionsApi.decide(s.id, decision, '');
      useNotificationStore.getState().updateSuggestion(s.id, {
        status: decision === 'accept' ? 'accepted' : decision === 'reject' ? 'rejected' : 'deferred',
      });
      markRead(notif.id);
    } catch { /* ignore */ } finally {
      setActing(false);
    }
  };

  const handleOpen = () => {
    markRead(notif.id);
    navigate('/suggestions');
  };

  const isPending = s.status === 'pending';
  const isHighConfidence = s.confidence >= 75;

  return (
    <div
      className={cn(
        'relative rounded-xl border p-3 transition-all group',
        theme.border,
        !notif.read && 'ring-1 ring-white/5',
      )}
    >
      {/* Unread dot */}
      {!notif.read && (
        <span className={cn('absolute top-2 right-2 w-2 h-2 rounded-full', theme.dot)} />
      )}

      {/* Dismiss */}
      <button
        onClick={() => dismiss(notif.id)}
        className="absolute top-2 right-5 opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-gray-400"
      >
        <X size={12} />
      </button>

      <div className="flex items-start gap-2.5">
        {/* Icon */}
        <div className={cn('mt-0.5 shrink-0 rounded-lg p-1.5 bg-gray-800/60', colorClass)}>
          <Icon size={14} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {s.source === 'ai_engine' && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide text-purple-400 bg-purple-900/30 border border-purple-700/40 rounded-full px-1.5 py-0">
                <Bot size={8} /> IA
              </span>
            )}
            <span className={cn('text-[9px] font-semibold uppercase tracking-wide border rounded-full px-1.5 py-0', theme.badge)}>
              {s.priority}
            </span>
            {s.confidence > 0 && (
              <span className={cn('text-[9px] tabular-nums', isHighConfidence ? 'text-emerald-400' : 'text-gray-500')}>
                {s.confidence}%
              </span>
            )}
            {!isPending && (
              <span className={cn('text-[9px] font-medium', {
                'text-emerald-400': s.status === 'accepted',
                'text-red-400':     s.status === 'rejected',
                'text-gray-400':    s.status === 'deferred',
              })}>
                {s.status === 'accepted' ? '✓ Acceptée' : s.status === 'rejected' ? '✗ Refusée' : '⏱ Différée'}
              </span>
            )}
          </div>

          {/* Title */}
          <p className="text-xs font-medium text-gray-200 leading-snug line-clamp-2">{s.title}</p>

          {/* Impact if present */}
          {s.impact && (
            <p className="mt-0.5 text-[11px] text-gray-500 line-clamp-1">{s.impact}</p>
          )}

          {/* Time */}
          <p className="mt-0.5 text-[10px] text-gray-600">
            {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      {/* Action buttons — only for pending suggestions */}
      {isPending && (
        <div className="mt-2.5 flex items-center gap-1.5">
          {/* Prominent Accept if high confidence */}
          <button
            onClick={() => decide('accept')}
            disabled={acting}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-40',
              isHighConfidence
                ? 'bg-emerald-700/40 text-emerald-300 border border-emerald-600/40 hover:bg-emerald-700/60'
                : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700',
            )}
          >
            <CheckCircle2 size={10} />
            Accepter
          </button>
          <button
            onClick={() => decide('defer')}
            disabled={acting}
            className="flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[11px] text-gray-500 border border-gray-700 bg-gray-800 hover:bg-gray-700 transition-colors disabled:opacity-40"
          >
            <Clock size={10} />
            Plus tard
          </button>
          <button
            onClick={() => decide('reject')}
            disabled={acting}
            className="flex items-center justify-center rounded-lg p-1 text-gray-600 border border-gray-700 bg-gray-800 hover:text-red-400 hover:border-red-700/40 transition-colors disabled:opacity-40"
            title="Refuser"
          >
            <XCircle size={10} />
          </button>
          <button
            onClick={handleOpen}
            className="flex items-center justify-center rounded-lg p-1 text-gray-600 border border-gray-700 bg-gray-800 hover:text-gray-300 transition-colors"
            title="Voir le détail"
          >
            <ChevronRight size={10} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Engine run widget ─────────────────────────────────────────────────────────

function EngineCompletedWidget({ notif }: { notif: AppNotification }) {
  const { dismiss } = useNotificationStore();
  const navigate = useNavigate();
  const r = notif.engineRun!;
  return (
    <div className="relative rounded-xl border border-purple-700/30 bg-purple-950/20 p-3 group">
      <button onClick={() => dismiss(notif.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-gray-400">
        <X size={12} />
      </button>
      {!notif.read && <span className="absolute top-2 right-6 w-2 h-2 rounded-full bg-purple-400" />}
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={14} className="text-purple-400 shrink-0" />
        <span className="text-xs font-medium text-gray-200">Analyse IA terminée</span>
      </div>
      <p className="text-[11px] text-gray-400">
        {r.suggestionsCreated} nouvelle{r.suggestionsCreated > 1 ? 's' : ''} suggestion{r.suggestionsCreated > 1 ? 's' : ''} générée{r.suggestionsCreated > 1 ? 's' : ''}
        {r.durationMs ? ` · ${(r.durationMs / 1000).toFixed(1)}s` : ''}
        {r.llmProvider ? ` · ${r.llmProvider}` : ''}
      </p>
      <button
        onClick={() => { useNotificationStore.getState().markRead(notif.id); navigate('/suggestions'); }}
        className="mt-1.5 text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-0.5"
      >
        Voir les suggestions <ChevronRight size={10} />
      </button>
    </div>
  );
}

// ── Engine error widget ───────────────────────────────────────────────────────

function EngineErrorWidget({ notif }: { notif: AppNotification }) {
  const { dismiss } = useNotificationStore();
  const e = notif.engineError!;
  return (
    <div className="relative rounded-xl border border-red-700/40 bg-red-950/20 p-3 group">
      <button onClick={() => dismiss(notif.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-gray-400">
        <X size={12} />
      </button>
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle size={14} className="text-red-400 shrink-0" />
        <span className="text-xs font-medium text-red-300">Erreur moteur IA</span>
      </div>
      <p className="text-[11px] text-gray-400 line-clamp-2">{e.error}</p>
    </div>
  );
}

// ── System event widget ───────────────────────────────────────────────────────

const SEV_STYLES: Record<string, string> = {
  critical: 'border-red-700/40 bg-red-950/20',
  error:    'border-orange-700/40 bg-orange-950/20',
  warning:  'border-amber-700/30 bg-amber-950/10',
};
const SEV_ICON_COLOR: Record<string, string> = {
  critical: 'text-red-400', error: 'text-orange-400', warning: 'text-amber-400',
};

function SystemEventWidget({ notif }: { notif: AppNotification }) {
  const { dismiss } = useNotificationStore();
  const ev = notif.systemEvent!;
  return (
    <div className={cn('relative rounded-xl border p-3 group', SEV_STYLES[ev.severity] ?? 'border-gray-700 bg-gray-900')}>
      <button onClick={() => dismiss(notif.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-gray-400">
        <X size={12} />
      </button>
      <div className="flex items-center gap-2 mb-0.5">
        <AlertTriangle size={14} className={SEV_ICON_COLOR[ev.severity] ?? 'text-gray-400'} />
        <span className="text-xs font-medium text-gray-200 capitalize">{ev.severity}</span>
        {!notif.read && <span className="ml-auto w-2 h-2 rounded-full bg-orange-400 shrink-0" />}
      </div>
      <p className="text-[11px] text-gray-400 line-clamp-2">{ev.message}</p>
    </div>
  );
}

// ── Dynamic widget router ─────────────────────────────────────────────────────

function NotifWidget({ notif }: { notif: AppNotification }) {
  useEffect(() => {
    // Auto mark read after 5 s if visible
    const t = setTimeout(() => {
      if (!notif.read) useNotificationStore.getState().markRead(notif.id);
    }, 5_000);
    return () => clearTimeout(t);
  }, [notif.id, notif.read]);

  switch (notif.kind) {
    case 'suggestion_new':
    case 'suggestion_decided':
      return <SuggestionWidget notif={notif} />;
    case 'engine_completed':
      return <EngineCompletedWidget notif={notif} />;
    case 'engine_error':
      return <EngineErrorWidget notif={notif} />;
    case 'system_event':
      return <SystemEventWidget notif={notif} />;
    default:
      return null;
  }
}

// ── Panel ─────────────────────────────────────────────────────────────────────

type Tab = 'suggestions' | 'system';

export function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('suggestions');
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);
  const navigate  = useNavigate();

  const unread       = useUnreadCount();
  const notifications = useNotifications();
  const { markAllRead, clearAll } = useNotificationStore();

  const suggestions = notifications.filter(
    (n) => n.kind === 'suggestion_new' || n.kind === 'suggestion_decided',
  );
  const system = notifications.filter(
    (n) => n.kind !== 'suggestion_new' && n.kind !== 'suggestion_decided',
  );

  const tabItems = tab === 'suggestions' ? suggestions : system;
  const tabUnread = tab === 'suggestions'
    ? suggestions.filter((n) => !n.read).length
    : system.filter((n) => !n.read).length;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current   && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative h-8 w-8 flex items-center justify-center rounded-md hover:bg-secondary transition-colors',
          open ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white leading-none animate-pulse">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-10 z-50 w-96 rounded-2xl border border-gray-700 bg-gray-950 shadow-2xl flex flex-col"
          style={{ maxHeight: 'calc(100vh - 80px)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
            <div className="flex items-center gap-2">
              <Bell size={15} className="text-amber-400" />
              <span className="text-sm font-semibold text-gray-100">Notifications</span>
              {unread > 0 && (
                <span className="text-xs font-bold bg-amber-500 text-white rounded-full px-1.5 py-0 leading-4">
                  {unread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button onClick={markAllRead} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 px-1.5 py-1 rounded transition-colors" title="Tout marquer comme lu">
                  <CheckCheck size={13} /> Tout lire
                </button>
              )}
              {notifications.length > 0 && (
                <button onClick={clearAll} className="text-gray-600 hover:text-red-400 px-1.5 py-1 rounded transition-colors" title="Tout effacer">
                  <Trash2 size={13} />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-600 hover:text-gray-400 px-1.5 py-1 rounded">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-800 shrink-0">
            {(['suggestions', 'system'] as Tab[]).map((t) => {
              const count = t === 'suggestions'
                ? suggestions.filter((n) => !n.read).length
                : system.filter((n) => !n.read).length;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors',
                    tab === t
                      ? 'border-amber-500 text-gray-100'
                      : 'border-transparent text-gray-500 hover:text-gray-300',
                  )}
                >
                  {t === 'suggestions' ? <Lightbulb size={12} /> : <AlertTriangle size={12} />}
                  {t === 'suggestions' ? 'Suggestions' : 'Système'}
                  {count > 0 && (
                    <span className="min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {tabItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-600">
                {tab === 'suggestions'
                  ? <><Lightbulb size={28} className="mb-3 opacity-30" /><p className="text-sm">Aucune suggestion</p><p className="text-xs">Les suggestions IA apparaîtront ici en temps réel</p></>
                  : <><RefreshCw size={28} className="mb-3 opacity-30" /><p className="text-sm">Aucun événement récent</p></>
                }
              </div>
            ) : (
              tabItems.map((n) => <NotifWidget key={n.id} notif={n} />)
            )}
          </div>

          {/* Footer */}
          {tab === 'suggestions' && suggestions.length > 0 && (
            <div className="border-t border-gray-800 px-4 py-2.5 shrink-0">
              <button
                onClick={() => { setOpen(false); navigate('/suggestions'); }}
                className="w-full text-center text-xs text-amber-400 hover:text-amber-300 flex items-center justify-center gap-1 transition-colors"
              >
                Voir toutes les suggestions <ChevronRight size={12} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Toast notifications ────────────────────────────────────────────────────────

/**
 * ToastNotifications — renders brief pop-up toasts for new high-priority
 * suggestions (critical/high) in the bottom-right corner.
 * Auto-dismiss after 6 s.
 */
export function ToastNotifications() {
  const notifications = useNotifications();
  const { dismiss } = useNotificationStore();
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const seenRef = useRef(new Set<string>());

  useEffect(() => {
    const urgent = notifications.filter(
      (n) =>
        n.kind === 'suggestion_new' &&
        !seenRef.current.has(n.id) &&
        (n.suggestion?.priority === 'critical' || n.suggestion?.priority === 'high'),
    );
    if (urgent.length === 0) return;
    urgent.forEach((n) => seenRef.current.add(n.id));
    setToasts((prev) => [...urgent, ...prev].slice(0, 5));

    urgent.forEach((n) => {
      setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== n.id));
      }, 6_000);
    });
  }, [notifications]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((n) => {
        const s = n.suggestion!;
        const { Icon, colorClass } = resolveIcon(s);
        const theme = PRIORITY_THEME[s.priority] ?? PRIORITY_THEME.medium;
        return (
          <div
            key={n.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3 py-2.5 shadow-2xl backdrop-blur w-80 animate-slide-in-right',
              theme.border,
            )}
          >
            <div className={cn('mt-0.5 shrink-0 rounded-lg p-1.5 bg-gray-800/60', colorClass)}>
              <Icon size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-0.5">
                {s.source === 'ai_engine' && (
                  <span className="text-[9px] font-semibold text-purple-400 bg-purple-900/30 border border-purple-700/40 rounded-full px-1.5">IA</span>
                )}
                <span className={cn('text-[9px] font-semibold uppercase border rounded-full px-1.5', theme.badge)}>
                  {s.priority}
                </span>
              </div>
              <p className="text-xs font-medium text-gray-200 line-clamp-2">{s.title}</p>
            </div>
            <button
              onClick={() => { dismiss(n.id); setToasts((t) => t.filter((x) => x.id !== n.id)); }}
              className="shrink-0 text-gray-600 hover:text-gray-400"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
