import { useEffect, useState, useCallback, useRef } from 'react';
import {
  AlertOctagon, AlertTriangle, Info, ShieldAlert, RefreshCw,
  Radio, Activity, Clock, Filter, List, AlignLeft,
  TrendingUp, Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { auditApi } from '@/services/api';
import { useRecentEvents } from '@/store/realtime.store';
import type { RealtimeEvent } from '@/store/realtime.store';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditEvent {
  id?: string;
  severity?: string;
  source?: string;
  message?: string;
  timestamp?: string;
  createdAt?: string;
  actor?: string;
  action?: string;
}

type View = 'table' | 'timeline';

// ── Config ─────────────────────────────────────────────────────────────────────

const SEV_CFG: Record<string, { label: string; badge: string; dot: string; icon: typeof AlertOctagon; color: string }> = {
  critical: { label: 'critique', badge: 'text-red-400 bg-red-900/30 border-red-700/40',       dot: 'bg-red-400',             icon: AlertOctagon, color: '#ef4444' },
  high:     { label: 'élevé',    badge: 'text-orange-400 bg-orange-900/30 border-orange-700/40', dot: 'bg-orange-400',        icon: ShieldAlert,  color: '#f97316' },
  medium:   { label: 'moyen',    badge: 'text-amber-400 bg-amber-900/30 border-amber-700/40',  dot: 'bg-amber-400',           icon: AlertTriangle,color: '#f59e0b' },
  low:      { label: 'faible',   badge: 'text-blue-400 bg-blue-900/20 border-blue-700/30',     dot: 'bg-blue-400',            icon: Info,         color: '#3b82f6' },
  info:     { label: 'info',     badge: 'text-muted-foreground bg-muted/30 border-border',     dot: 'bg-muted-foreground',    icon: Info,         color: '#6b7280' },
};
const SEVERITIES = ['all','critical','high','medium','low','info'] as const;
const SEV = (s?: string) => SEV_CFG[s ?? 'info'] ?? SEV_CFG.info;

const fmt = (ts?: string) => {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' }); }
  catch { return ts; }
};
const rel = (ts?: string) => {
  if (!ts) return '';
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60_000) return `il y a ${Math.floor(d/1000)}s`;
  if (d < 3_600_000) return `il y a ${Math.floor(d/60_000)}m`;
  return `il y a ${Math.floor(d/3_600_000)}h`;
};
function wsToAudit(e: RealtimeEvent): AuditEvent {
  return { id: e.id, severity: e.severity, source: e.connectorId, message: e.message, timestamp: e.timestamp };
}

function SevBadge({ sev }: { sev?: string }) {
  const c = SEV(sev); const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold uppercase tracking-wide ${c.badge}`}>
      <Icon className="h-3 w-3" />{c.label}
    </span>
  );
}

export default function EventsPage() {
  const { t } = useTranslation();
  const wsEvents = useRecentEvents();
  const [apiEvents, setApiEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [sevFilter, setSevFilter] = useState<typeof SEVERITIES[number]>('all');
  const [view, setView]           = useState<View>('table');
  const [newCount, setNewCount]   = useState(0);
  const [merged, setMerged]       = useState<RealtimeEvent[]>([]);
  const prevLen                   = useRef(0);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const r = await auditApi.events({ limit: 200 }); setApiEvents(r.data ?? []); }
    catch { setError(t('events.loadError')); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (wsEvents.length > prevLen.current) setNewCount(n => n + wsEvents.length - prevLen.current);
    prevLen.current = wsEvents.length;
  }, [wsEvents]);

  const all: AuditEvent[] = [...merged.map(wsToAudit), ...apiEvents];
  const filtered = all.filter(e => sevFilter === 'all' || (e.severity ?? 'info') === sevFilter);

  const chartData = (['critical','high','medium','low','info'] as const)
    .map(s => ({ name: SEV_CFG[s].label, count: all.filter(e => (e.severity ?? 'info') === s).length, color: SEV_CFG[s].color }))
    .filter(d => d.count > 0);

  const kpis = (['critical','high','medium','low'] as const).map(s => ({
    s, ...SEV_CFG[s], count: all.filter(e => (e.severity ?? 'info') === s).length,
  }));

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />{t('events.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('events.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />Live
          </span>
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-secondary transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />{t('common.refresh')}
          </button>
        </div>
      </div>

      {/* New WS banner */}
      {newCount > 0 && (
        <button onClick={() => { setMerged(wsEvents); setNewCount(0); }}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-primary/40 bg-primary/10 text-primary text-sm font-medium animate-pulse hover:animate-none hover:bg-primary/20 transition-colors">
          <Radio className="h-4 w-4" />
          {newCount} nouvel{newCount > 1 ? 'aux' : ''} évènement{newCount > 1 ? 's' : ''} en temps réel — cliquer pour afficher
        </button>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map(k => (
          <button key={k.s} onClick={() => setSevFilter(sevFilter === k.s ? 'all' : k.s)}
            className={`rounded-xl border p-3 text-left transition-all hover:scale-[1.02] ${sevFilter === k.s ? k.badge + ' ring-1 ring-current' : 'border-border bg-card hover:border-muted'}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{k.label}</span>
              <k.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold tabular-nums text-foreground">{k.count}</p>
          </button>
        ))}
      </div>

      {/* Chart + filters */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5" />Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {chartData.length === 0
              ? <p className="text-xs text-muted-foreground py-6 text-center">Aucun évènement</p>
              : <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={chartData} margin={{ top:0, right:0, bottom:0, left:-20 }}>
                    <XAxis dataKey="name" tick={{ fontSize:10, fill:'#6b7280' }} />
                    <YAxis tick={{ fontSize:10, fill:'#6b7280' }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background:'#1f2937', border:'1px solid #374151', borderRadius:6, fontSize:12 }} cursor={{ fill:'rgba(255,255,255,0.05)' }} />
                    <Bar dataKey="count" radius={[3,3,0,0]}>
                      {chartData.map((d,i) => <Cell key={i} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
            }
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Filter className="h-3.5 w-3.5" />Filtres & vue
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {SEVERITIES.map(s => (
                <button key={s} onClick={() => setSevFilter(s)}
                  className={`px-2.5 py-1 text-xs rounded-lg border font-medium transition-all ${sevFilter === s ? (s === 'all' ? 'bg-primary/15 border-primary/40 text-primary' : SEV(s).badge) : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  {s === 'all' ? 'Tous' : SEV(s).label}
                  {s !== 'all' && <span className="ml-1.5 opacity-60">{all.filter(e => (e.severity ?? 'info') === s).length}</span>}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 border border-border rounded-lg p-0.5 w-fit">
              {([['table','Tableau',List],['timeline','Timeline',AlignLeft]] as const).map(([v,label,Icon]) => (
                <button key={v} onClick={() => setView(v as View)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${view === v ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  <Icon className="h-3.5 w-3.5" />{label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3">
          <AlertOctagon className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* Table view */}
      {view === 'table' && (
        <Card>
          <CardHeader className="py-3 px-4 border-b border-border/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {filtered.length} évènement{filtered.length !== 1 ? 's' : ''}
              </CardTitle>
              {merged.length > 0 && (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <Zap className="h-3 w-3" />{merged.length} live
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!loading && filtered.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
                <Activity className="h-10 w-10 opacity-20" />
                <p className="text-sm">Aucun évènement correspondant aux filtres</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border/50">
                      <th className="text-left px-4 py-2.5 font-medium w-32">Sévérité</th>
                      <th className="text-left px-4 py-2.5 font-medium w-44">Horodatage</th>
                      <th className="text-left px-4 py-2.5 font-medium w-32">Source</th>
                      <th className="text-left px-4 py-2.5 font-medium">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? Array.from({ length: 5 }).map((_,i) => (
                          <tr key={i} className="border-b border-border/30">
                            {[80,60,50,90].map((w,j) => (
                              <td key={j} className="px-4 py-3">
                                <div className={`h-4 bg-muted/40 rounded animate-pulse`} style={{ width: `${w}%` }} />
                              </td>
                            ))}
                          </tr>
                        ))
                      : filtered.map((ev, i) => {
                          const live = merged.some(w => w.id === ev.id);
                          return (
                            <tr key={ev.id ?? i} className={`border-b border-border/40 hover:bg-muted/10 transition-colors ${live ? 'bg-primary/5' : ''}`}>
                              <td className="px-4 py-2.5"><SevBadge sev={ev.severity} /></td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-1.5">
                                  <Clock className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">{fmt(ev.timestamp ?? ev.createdAt)}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground">{ev.source ?? ev.actor ?? '—'}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-foreground/90 truncate max-w-sm">{ev.message ?? ev.action ?? '—'}</span>
                                  {live && <span className="shrink-0 text-[9px] font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded uppercase tracking-widest">live</span>}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                    }
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Timeline view */}
      {view === 'timeline' && (
        <div className="relative pl-2">
          <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border/50" />
          {loading
            ? Array.from({ length: 6 }).map((_,i) => (
                <div key={i} className="flex gap-4 py-3">
                  <div className="w-3.5 h-3.5 rounded-full bg-muted/40 animate-pulse shrink-0 mt-0.5 z-10" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 bg-muted/40 rounded animate-pulse w-3/4" />
                    <div className="h-3 bg-muted/30 rounded animate-pulse w-1/2" />
                  </div>
                </div>
              ))
            : filtered.length === 0
            ? <p className="text-sm text-muted-foreground text-center py-12">Aucun évènement</p>
            : filtered.map((ev, i) => {
                const cfg = SEV(ev.severity); const Icon = cfg.icon;
                const live = merged.some(w => w.id === ev.id);
                return (
                  <div key={ev.id ?? i} className="flex gap-4 group py-2.5">
                    <div className={`relative z-10 w-3.5 h-3.5 rounded-full border-2 shrink-0 mt-1 transition-transform group-hover:scale-125 ${cfg.dot} border-background`} />
                    <div className={`flex-1 rounded-xl border p-3 transition-colors hover:bg-muted/5 ${live ? 'border-primary/20 bg-primary/5' : 'border-border/40'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0">
                          <Icon className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground/90">{ev.message ?? ev.action ?? '—'}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{ev.source ?? ev.actor ?? 'système'} · {rel(ev.timestamp ?? ev.createdAt)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {live && <span className="text-[9px] font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded uppercase tracking-widest">live</span>}
                          <SevBadge sev={ev.severity} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
          }
        </div>
      )}
    </div>
  );
}
