import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { actionsApi, jobsApi, agentsApi } from '@/services/api';
import { Card, CardContent } from '@/components/ui/card';
import { useConnectionStatus } from '@/store/realtime.store';
import {
  Play, Bot, Cpu, RefreshCw, Activity, CheckCircle2,
  XCircle, Clock, ChevronRight, Zap, Wifi, WifiOff,
  Timer, BarChart2, AlertTriangle
} from 'lucide-react';

/* ── helpers ─────────────────────────────────────────────── */
const rel = (d?: string) => {
  if (!d) return '—';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return new Date(d).toLocaleTimeString();
};

const fmt = (d?: string) => d ? new Date(d).toLocaleString() : '—';

interface StatusBadgeProps { status?: string }
const StatusBadge = ({ status }: StatusBadgeProps) => {
  const s = (status ?? '').toLowerCase();
  const map: Record<string, { color: string; dot: string; label: string }> = {
    running:   { color: 'bg-blue-500/15 text-blue-400 border-blue-500/30',   dot: 'bg-blue-400 animate-pulse', label: 'Running' },
    active:    { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400 animate-pulse', label: 'Active' },
    completed: { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400', label: 'Completed' },
    success:   { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400', label: 'Success' },
    failed:    { color: 'bg-red-500/15 text-red-400 border-red-500/30',       dot: 'bg-red-400', label: 'Failed' },
    error:     { color: 'bg-red-500/15 text-red-400 border-red-500/30',       dot: 'bg-red-400', label: 'Error' },
    pending:   { color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', dot: 'bg-amber-400 animate-pulse', label: 'Pending' },
    idle:      { color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',    dot: 'bg-zinc-400', label: 'Idle' },
    offline:   { color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',    dot: 'bg-zinc-500', label: 'Offline' },
  };
  const cfg = map[s] ?? { color: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground', label: status ?? '—' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-medium ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

/* ── agent heartbeat ring ────────────────────────────────── */
const HeartbeatRing = ({ lastSeen }: { lastSeen?: string }) => {
  if (!lastSeen) return <span className="w-3 h-3 rounded-full bg-zinc-600 inline-block" />;
  const s = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000);
  const cls = s < 30 ? 'bg-emerald-400 animate-pulse' : s < 300 ? 'bg-amber-400' : 'bg-red-400';
  return <span className={`w-3 h-3 rounded-full inline-block shrink-0 ${cls}`} />;
};

/* ── job progress row ────────────────────────────────────── */
const JobProgressBar = ({ job }: { job: any }) => {
  const s = (job.status ?? '').toLowerCase();
  const isRunning = s === 'running';
  const pct = job.progress != null ? job.progress : isRunning ? null : s === 'completed' || s === 'success' ? 100 : 0;
  return (
    <div className="w-full max-w-[180px]">
      <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
        {pct === null ? (
          <div className="h-full w-1/3 rounded-full bg-blue-400 animate-[shimmer_1.2s_ease-in-out_infinite]"
            style={{ background: 'linear-gradient(90deg,transparent,#60a5fa,transparent)', backgroundSize: '200% 100%', animation: 'shimmer 1.2s infinite' }} />
        ) : (
          <div
            className={`h-full rounded-full transition-all duration-700 ${pct >= 100 ? 'bg-emerald-400' : 'bg-blue-400'}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        )}
      </div>
      <span className="text-[10px] text-muted-foreground mt-0.5 block">
        {pct === null ? 'In progress…' : `${Math.min(pct, 100)}%`}
      </span>
    </div>
  );
};

/* ── skeleton ────────────────────────────────────────────── */
const Skeleton = () => (
  <div className="space-y-2 p-4 animate-pulse">
    {[...Array(4)].map((_, i) => (
      <div key={i} className="h-10 rounded bg-muted/40" />
    ))}
  </div>
);

/* ── KPI card ────────────────────────────────────────────── */
const KpiCard = ({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: any; color: string }) => (
  <div className={`flex items-center gap-3 p-3 rounded-lg border bg-card ${color}`}>
    <div className="p-2 rounded-md bg-muted/50">
      <Icon className="h-4 w-4 text-muted-foreground" />
    </div>
    <div>
      <div className="text-xl font-bold leading-none">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  </div>
);

/* ── main page ───────────────────────────────────────────── */
export default function ExecutionPage() {
  const { t } = useTranslation();
  const wsStatus = useConnectionStatus();
  const [tab, setTab] = useState<'actions' | 'jobs' | 'agents'>('actions');
  const [actions, setActions] = useState<any[]>([]);
  const [jobs, setJobs]       = useState<any[]>([]);
  const [agents, setAgents]   = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [executing, setExecuting]   = useState<string | null>(null);
  const [error, setError]    = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [a, j, ag] = await Promise.all([actionsApi.list(), jobsApi.list(), agentsApi.list()]);
      setActions(Array.isArray(a?.data) ? a.data : Array.isArray(a) ? a : []);
      setJobs(Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : []);
      setAgents(Array.isArray(ag?.data) ? ag.data : Array.isArray(ag) ? ag : []);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runningJobs  = jobs.filter(j => (j.status ?? '').toLowerCase() === 'running').length;
  const activeAgents = agents.filter(a => (a.status ?? '').toLowerCase() === 'active').length;
  const failedJobs   = jobs.filter(j => ['failed','error'].includes((j.status ?? '').toLowerCase())).length;

  const counts = { actions: actions.length, jobs: jobs.length, agents: agents.length };

  const handleExecute = async (id: string) => {
    setExecuting(id); setConfirming(null);
    try { await actionsApi.execute(id); await load(); }
    catch (e: any) { setError(e?.message ?? 'Execution failed'); }
    finally { setExecuting(null); }
  };

  const TABS = [
    { key: 'actions' as const, label: 'Actions', icon: Zap },
    { key: 'jobs' as const,    label: 'Jobs',    icon: BarChart2 },
    { key: 'agents' as const,  label: 'Agents',  icon: Bot },
  ];

  return (
    <div className="space-y-5 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('nav.execution', 'Execution')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live orchestration — {rel(lastRefresh.toISOString())}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
            wsStatus === 'connected'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30'
          }`}>
            {wsStatus === 'connected'
              ? <><Wifi className="h-3 w-3" /><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live</>
              : <><WifiOff className="h-3 w-3" />Offline</>}
          </span>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-secondary transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 px-4 py-2.5 rounded-lg">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Running Jobs"   value={runningJobs}  icon={Activity}     color="border-blue-500/20" />
        <KpiCard label="Active Agents"  value={activeAgents} icon={Bot}          color="border-emerald-500/20" />
        <KpiCard label="Failed Jobs"    value={failedJobs}   icon={XCircle}      color={failedJobs > 0 ? 'border-red-500/30' : 'border-border'} />
        <KpiCard label="Total Actions"  value={actions.length} icon={Zap}        color="border-border" />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border gap-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {counts[key] > 0 && (
              <span className={`px-1.5 py-0.5 text-[10px] rounded-full font-medium ${
                tab === key ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
              }`}>{counts[key]}</span>
            )}
          </button>
        ))}
      </div>

      {loading && <Skeleton />}

      {/* ── Actions tab ─────────────────────────────── */}
      {!loading && tab === 'actions' && (
        <Card>
          <CardContent className="p-0">
            {actions.length === 0 ? (
              <div className="text-center py-16">
                <Zap className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-sm text-muted-foreground">No actions available</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Name</th>
                    <th className="text-left px-4 py-3 font-medium">Type</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Created</th>
                    <th className="text-right px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {actions.map((a) => (
                    <tr key={a.id} className="group border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{a.name ?? a.id}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-secondary px-2 py-0.5 rounded capitalize">{a.type ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(a.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {executing === a.id ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-blue-400">
                            <Cpu className="h-3 w-3 animate-spin" />Running…
                          </span>
                        ) : confirming === a.id ? (
                          <div className="inline-flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Confirm?</span>
                            <button
                              onClick={() => handleExecute(a.id)}
                              className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                            >Yes</button>
                            <button
                              onClick={() => setConfirming(null)}
                              className="px-2 py-1 text-xs border border-border rounded hover:bg-secondary transition-colors"
                            >Cancel</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirming(a.id)}
                            className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1.5 text-xs text-primary border border-primary/30 px-2.5 py-1 rounded hover:bg-primary/10 transition-all"
                          >
                            <Play className="h-3 w-3" />Execute
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Jobs tab ─────────────────────────────────── */}
      {!loading && tab === 'jobs' && (
        <Card>
          <CardContent className="p-0">
            {jobs.length === 0 ? (
              <div className="text-center py-16">
                <BarChart2 className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-sm text-muted-foreground">No jobs recorded</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Job ID</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Progress</th>
                    <th className="text-left px-4 py-3 font-medium">Started</th>
                    <th className="text-left px-4 py-3 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => {
                    const started = j.startedAt ?? j.createdAt;
                    const ended   = j.completedAt ?? j.updatedAt;
                    const dur = started && ended
                      ? `${Math.round((new Date(ended).getTime() - new Date(started).getTime()) / 1000)}s`
                      : '—';
                    return (
                      <tr key={j.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{j.id?.slice(0, 12)}…</td>
                        <td className="px-4 py-3"><StatusBadge status={j.status} /></td>
                        <td className="px-4 py-3"><JobProgressBar job={j} /></td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{rel(started)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground flex items-center gap-1">
                          <Timer className="h-3 w-3 opacity-50" />{dur}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Agents tab ────────────────────────────────── */}
      {!loading && tab === 'agents' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.length === 0 ? (
            <div className="col-span-full text-center py-16">
              <Bot className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-sm text-muted-foreground">No agents connected</p>
            </div>
          ) : agents.map((ag) => {
            const lastSeen = ag.lastSeen ?? ag.updatedAt;
            const s = (ag.seconds ?? (lastSeen ? Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000) : 9999));
            const health = s < 30 ? 'Healthy' : s < 300 ? 'Stale' : 'Offline';
            const healthColor = s < 30 ? 'text-emerald-400' : s < 300 ? 'text-amber-400' : 'text-red-400';
            return (
              <Card key={ag.id} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <HeartbeatRing lastSeen={lastSeen} />
                      <span className="font-medium text-sm">{ag.name ?? ag.id}</span>
                    </div>
                    <StatusBadge status={ag.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Health</div>
                      <div className={`font-medium ${healthColor}`}>{health}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Last seen</div>
                      <div className="font-medium">{rel(lastSeen)}</div>
                    </div>
                    {ag.version && (
                      <div>
                        <div className="text-muted-foreground">Version</div>
                        <div className="font-mono text-[11px]">{ag.version}</div>
                      </div>
                    )}
                    {ag.tasks != null && (
                      <div>
                        <div className="text-muted-foreground">Tasks run</div>
                        <div className="font-medium">{ag.tasks}</div>
                      </div>
                    )}
                  </div>
                  <div className="pt-1 border-t border-border/50 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Activity className="h-3 w-3" />
                    <span>{ag.id?.slice(0, 16)}…</span>
                    <ChevronRight className="h-3 w-3 ml-auto" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
