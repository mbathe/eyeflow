import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Zap, Network, Bot, AlertTriangle, CheckCircle2, XCircle,
  MinusCircle, ChevronRight, GitBranch, History, Info,
  Sparkles, Pin, PinOff, Wifi, WifiOff,
  BarChart2, TrendingUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser } from '@/store/auth.store';
import { nodesApi, rulesApi, jobsApi } from '@/services/api';
import { useRealtimeStore, useSystemHealth, useSuggestionsCount, useRecentEvents } from '@/store/realtime.store';
import { usePinnedWidgets, useWidgetsStore } from '@/store/widgets.store';
import type { ChartType, PinnedWidget } from '@/store/widgets.store';

// ── Types ──────────────────────────────────────────────────────────────────────

type HealthStatus = 'ok' | 'degraded' | 'critical';

interface Stats {
  rules: number | string;
  nodes: number | string;
  jobs: number | string;
}

// ── Tiny "Why this widget" tooltip ────────────────────────────────────────────

function WhyBadge({ reason }: { reason: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
        title="Pourquoi ce widget ?"
      >
        <Info className="h-3 w-3" />
        Pourquoi ?
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-56 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-xl">
          {reason}
          <button onClick={() => setOpen(false)} className="mt-2 block text-primary hover:underline">
            Fermer
          </button>
        </div>
      )}
    </div>
  );
}

// ── PinnedWidgetCard ───────────────────────────────────────────────────────────

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function PinnedWidgetCard({ widget }: { widget: PinnedWidget }) {
  const removeWidget = useWidgetsStore(s => s.removeWidget);

  return (
    <Card className="relative group">
      <CardHeader className="pb-1 pt-3 px-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-xs font-semibold text-foreground leading-tight line-clamp-2">{widget.title}</CardTitle>
          <button
            onClick={() => removeWidget(widget.id)}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0 mt-0.5"
            title="Désépingler"
          >
            <PinOff className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground truncate">{widget.query}</p>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {widget.data.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucune donnée</p>
        ) : widget.chartType === 'table' ? (
          <div className="overflow-x-auto max-h-28 text-[10px]">
            <table className="w-full">
              <tbody>
                {widget.data.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-0.5 pr-2 text-muted-foreground">{row.name}</td>
                    <td className="py-0.5 font-mono">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : widget.chartType === 'bar' ? (
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={widget.data} margin={{ top: 2, right: 2, bottom: 2, left: -20 }}>
              <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 8, fill: '#6b7280' }} />
              <Tooltip contentStyle={{ fontSize: 10, padding: '2px 6px' }} />
              <Bar dataKey="value" fill={COLORS[0]} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : widget.chartType === 'line' || widget.chartType === 'area' ? (
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={widget.data} margin={{ top: 2, right: 2, bottom: 2, left: -20 }}>
              <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 8, fill: '#6b7280' }} />
              <Tooltip contentStyle={{ fontSize: 10, padding: '2px 6px' }} />
              <Line type="monotone" dataKey="value" stroke={COLORS[0]} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          // pie / fallback → mini bar
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={widget.data} margin={{ top: 2, right: 2, bottom: 2, left: -20 }}>
              <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                {widget.data.map((_entry, index) => (
                  <rect key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
              <Tooltip contentStyle={{ fontSize: 10 }} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useUser();

  // ── Static API stats ─────────────────────────────────────────────────────────
  const [stats, setStats] = useState<Stats>({ rules: '—', nodes: '—', jobs: '—' });
  const [pendingRules, setPendingRules] = useState<unknown[]>([]);
  const [topSuggestions, setTopSuggestions] = useState<{ id: string; message: string; severity: string }[]>([]);

  useEffect(() => {
    Promise.allSettled([
      rulesApi.list(),
      nodesApi.list(),
      jobsApi.list(),
      rulesApi.pending(),
    ]).then(([rules, nodes, jobs, approvals]) => {
      setStats({
        rules:   rules.status    === 'fulfilled' ? (rules.value.data?.length    ?? 0) : 0,
        nodes:   nodes.status    === 'fulfilled' ? (nodes.value.data?.length    ?? 0) : 0,
        jobs:    jobs.status     === 'fulfilled' ? (jobs.value.data?.length     ?? 0) : 0,
      });
      if (approvals.status === 'fulfilled') {
        const list = (approvals.value.data ?? []) as { id: string; name?: string }[];
        setPendingRules(list.slice(0, 3));
      }
    });

    // Mock top suggestions for widget (replace with real API when available)
    setTopSuggestions([
      { id: '1', message: 'Règle "seuil tension" déclenchée 12× aujourd\'hui', severity: 'warning' },
      { id: '2', message: 'Nouveau connecteur détecté : capteur-nord-03', severity: 'info' },
      { id: '3', message: 'Latence anormale sur pipeline B (>2 s)', severity: 'error' },
    ]);
  }, []);

  // ── Realtime store ───────────────────────────────────────────────────────────
  const rtHealth        = useSystemHealth();
  const pendingCount    = useSuggestionsCount();
  const recentEvents    = useRecentEvents();
  const rtStatus        = useRealtimeStore(s => s.status);

  // ── Pinned widgets ───────────────────────────────────────────────────────────
  const pinnedWidgets = usePinnedWidgets();

  // ── Derived flags for conditional widgets ────────────────────────────────────
  const hasCriticalEvent   = recentEvents.some(e => e.severity === 'critical');
  const hasErrorEvent      = recentEvents.some(e => e.severity === 'error');
  const hasPendingCount    = pendingCount > 0;
  const runningJobCount    = typeof stats.jobs === 'number' ? stats.jobs : 0;

  // ── Merged health: WS health wins if critical, otherwise server-derived ──────
  const effectiveHealth: HealthStatus =
    rtHealth === 'critical' || hasCriticalEvent ? 'critical' :
    rtHealth === 'degraded' || hasErrorEvent || hasPendingCount ? 'degraded' :
    'ok';

  // ── Stat cards ───────────────────────────────────────────────────────────────
  const statCards = [
    { label: t('dashboard.stats.rules'),  value: stats.rules,  sub: t('dashboard.stats.rulesSub'),  icon: Zap,     color: 'text-primary' },
    { label: t('dashboard.stats.nodes'),  value: stats.nodes,  sub: t('dashboard.stats.nodesSub'),  icon: Network, color: 'text-success' },
    { label: t('dashboard.stats.jobs'),   value: stats.jobs,   sub: t('dashboard.stats.jobsSub'),   icon: Bot,     color: 'text-accent'  },
    {
      label: 'Suggestions IA',
      value: pendingCount,
      sub: 'en attente de décision',
      icon: Sparkles,
      color: pendingCount > 0 ? 'text-amber-400' : 'text-success',
    },
  ];

  // ── Health config ─────────────────────────────────────────────────────────────
  const healthConfig: Record<HealthStatus, { label: string; icon: typeof CheckCircle2; cls: string }> = {
    ok:       { label: t('dashboard.systemHealth.ok'),       icon: CheckCircle2, cls: 'text-success border-success/30 bg-success/10' },
    degraded: { label: t('dashboard.systemHealth.degraded'), icon: MinusCircle,  cls: 'text-warning border-warning/30 bg-warning/10' },
    critical: { label: t('dashboard.systemHealth.critical'), icon: XCircle,      cls: 'text-destructive border-destructive/30 bg-destructive/10' },
  };
  const hc = healthConfig[effectiveHealth];

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">{t('dashboard.greeting', { name: user?.firstName })}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* WS connection pill */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-semibold ${
            rtStatus === 'connected'  ? 'border-green-500/30 bg-green-500/10 text-green-400' :
            rtStatus === 'connecting' ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400' :
            'border-gray-600/30 bg-gray-600/10 text-gray-400'
          }`}>
            {rtStatus === 'connected'  ? <Wifi className="h-3 w-3" />    : <WifiOff className="h-3 w-3" />}
            {rtStatus === 'connected'  ? 'Live' :
             rtStatus === 'connecting' ? 'Connexion…' : 'Hors ligne'}
          </div>
          {/* Global health badge */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm font-medium ${hc.cls}`}>
            <hc.icon className="h-4 w-4" />
            <span>{hc.label}</span>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className={`text-3xl font-bold mt-1 ${card.color} tabular-nums`}>{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                </div>
                <card.icon className={`h-4 w-4 ${card.color} mt-1 shrink-0`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── CONDITIONAL WIDGETS ROW ──────────────────────────────────────────── */}
      {(hasCriticalEvent || hasErrorEvent || hasPendingCount || runningJobCount > 0) && (
        <div className="grid md:grid-cols-3 gap-3">

          {/* 🔴 Critical Alert Widget — appears when a critical event arrives via WS */}
          {(hasCriticalEvent || hasErrorEvent) && (
            <Card className={`border-2 ${hasCriticalEvent ? 'border-red-500/40 bg-red-950/20' : 'border-orange-500/40 bg-orange-950/20'}`}>
              <CardHeader className="pb-1 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className={`text-sm flex items-center gap-2 ${hasCriticalEvent ? 'text-red-400' : 'text-orange-400'}`}>
                    <AlertTriangle className="h-4 w-4" />
                    {hasCriticalEvent ? 'Alerte critique' : 'Erreurs détectées'}
                  </CardTitle>
                  <WhyBadge reason="Ce widget apparaît car des évènements critiques ou erreurs ont été reçus en temps réel depuis votre système." />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-1.5">
                {recentEvents
                  .filter(e => e.severity === 'critical' || e.severity === 'error')
                  .slice(0, 3)
                  .map(e => (
                    <div key={e.id} className="text-xs text-muted-foreground truncate">
                      <span className={`font-semibold ${e.severity === 'critical' ? 'text-red-400' : 'text-orange-400'}`}>
                        [{e.severity.toUpperCase()}]
                      </span>{' '}
                      {e.message}
                    </div>
                  ))}
                <Link to="/events" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                  Voir tous les évènements <ChevronRight className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          )}

          {/* 🟡 Top Suggestions Widget — appears when pendingCount > 0 */}
          {hasPendingCount && (
            <Card className="border-2 border-amber-500/40 bg-amber-950/20">
              <CardHeader className="pb-1 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2 text-amber-400">
                    <Sparkles className="h-4 w-4" />
                    {pendingCount} suggestion{pendingCount > 1 ? 's' : ''} en attente
                  </CardTitle>
                  <WhyBadge reason={`Ce widget apparaît car ${pendingCount} suggestion${pendingCount > 1 ? 's' : ''} IA attend${pendingCount === 1 ? '' : 'ent'} votre décision.`} />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-1.5">
                {topSuggestions.slice(0, 3).map(s => (
                  <div key={s.id} className="text-xs text-muted-foreground truncate">
                    <span className={`font-semibold ${
                      s.severity === 'error' ? 'text-red-400' :
                      s.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'
                    }`}>•</span>{' '}{s.message}
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => navigate('/suggestions')}
                    className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-1 rounded transition-colors"
                  >
                    <ChevronRight className="h-3 w-3" /> Décider
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 🔵 Active Pipelines Widget — appears when jobs > 0 */}
          {runningJobCount > 0 && (
            <Card className="border-2 border-blue-500/40 bg-blue-950/20">
              <CardHeader className="pb-1 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2 text-blue-400">
                    <Bot className="h-4 w-4" />
                    {runningJobCount} pipeline{runningJobCount > 1 ? 's' : ''} actif{runningJobCount > 1 ? 's' : ''}
                  </CardTitle>
                  <WhyBadge reason="Ce widget apparaît car des pipelines sont actuellement en cours d'exécution dans votre système." />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <p className="text-sm text-muted-foreground mb-2">
                  {runningJobCount} tâche{runningJobCount > 1 ? 's' : ''} en cours d'exécution
                </p>
                <Link to="/execution" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline">
                  Voir l'exécution <ChevronRight className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          )}

        </div>
      )}

      {/* ── Middle row: System Services + Pending Approvals ─────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* System services */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">{t('dashboard.systemServices.title')}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {[
              { label: t('dashboard.systemServices.nestApi'),    status: rtStatus === 'connected' ? 'online' : 'online' },
              { label: t('dashboard.systemServices.kafka'),      status: 'online'  },
              { label: t('dashboard.systemServices.llmService'), status: 'online'  },
              { label: t('dashboard.systemServices.svmRuntime'), status: 'offline' },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{s.label}</span>
                <span className={`flex items-center gap-1 text-xs font-medium ${s.status === 'online' ? 'text-success' : 'text-destructive'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'online' ? 'bg-success' : 'bg-destructive'}`} />
                  {s.status === 'online' ? t('common.online') : t('common.offline')}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Pending approvals */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{t('dashboard.pendingApprovals')}</CardTitle>
              <Link to="/automations" className="text-xs text-primary hover:underline">{t('common.viewAll')}</Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {pendingRules.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-success py-2">
                <CheckCircle2 className="h-4 w-4" />
                <span>Aucune approbation en attente</span>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingRules.map((r) => {
                  const rule = r as { id?: string; name?: string };
                  return (
                    <div key={rule.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground truncate">{rule.name ?? rule.id}</span>
                      <Link to="/automations" className="text-xs text-primary hover:underline shrink-0">
                        {t('automations.approvalQueue.viewDag')}
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Live Events Feed (only when events exist) ────────────────────────── */}
      {recentEvents.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Évènements récents (live)
              </CardTitle>
              <Link to="/events" className="text-xs text-primary hover:underline">{t('common.viewAll')}</Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1.5">
            {recentEvents.slice(0, 5).map(e => (
              <div key={e.id} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                  e.severity === 'critical' ? 'bg-red-500' :
                  e.severity === 'error'    ? 'bg-orange-500' :
                  e.severity === 'warning'  ? 'bg-yellow-500' :
                  'bg-blue-500'
                }`} />
                <span className="text-muted-foreground line-clamp-1">{e.message}</span>
                <span className="shrink-0 text-muted-foreground/60 tabular-nums">
                  {new Date(e.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Quick Actions ─────────────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              {t('dashboard.quickActions.compileRule.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-sm text-muted-foreground mb-3">{t('dashboard.quickActions.compileRule.description')}</p>
            <Link to="/analysis" className="inline-flex items-center gap-1 text-sm text-primary hover:underline font-medium">
              {t('dashboard.quickActions.compileRule.link')} <ChevronRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              {t('dashboard.quickActions.auditTrail.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-sm text-muted-foreground mb-3">{t('dashboard.quickActions.auditTrail.description')}</p>
            <Link to="/audit" className="inline-flex items-center gap-1 text-sm text-primary hover:underline font-medium">
              {t('dashboard.quickActions.auditTrail.link')} <ChevronRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* ── Pinned Widgets from DataExplorer ─────────────────────────────────── */}
      {pinnedWidgets.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Pin className="h-4 w-4 text-primary" />
              Widgets épinglés
              <span className="rounded-full bg-primary/20 text-primary text-[10px] font-bold px-1.5 py-0.5">
                {pinnedWidgets.length}
              </span>
            </h2>
            <Link to="/data-explorer" className="text-xs text-primary hover:underline flex items-center gap-1">
              <BarChart2 className="h-3 w-3" /> Explorateur de données
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {pinnedWidgets.map(w => (
              <PinnedWidgetCard key={w.id} widget={w} />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
