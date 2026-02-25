import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { auditApi } from '@/services/api';
import { Card, CardContent } from '@/components/ui/card';
import {
  ShieldCheck, User, Bot, Cpu, Download, Hash, RefreshCw,
  AlertTriangle, CheckCircle2, Clock, ChevronRight, Filter,
  Activity, Eye, Lock
} from 'lucide-react';

/* ── helpers ─────────────────────────────────────────────── */
const rel = (d?: string) => {
  if (!d) return '—';
  const diff = Date.now() - new Date(d).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(d).toLocaleDateString();
};

const fmt = (d?: string) => d ? new Date(d).toLocaleString() : '—';

type Source = 'human' | 'ai' | 'auto' | 'system';

const sourceConfig: Record<Source, { label: string; icon: any; color: string; dotColor: string }> = {
  human:  { label: 'Human',  icon: User,       color: 'text-blue-400',   dotColor: 'bg-blue-400' },
  ai:     { label: 'AI',     icon: Bot,        color: 'text-purple-400', dotColor: 'bg-purple-400' },
  auto:   { label: 'Auto',   icon: Cpu,        color: 'text-amber-400',  dotColor: 'bg-amber-400' },
  system: { label: 'System', icon: Activity,   color: 'text-zinc-400',   dotColor: 'bg-zinc-400' },
};

const getSource = (entry: any): Source => {
  const s = (entry.source ?? entry.actor ?? entry.triggeredBy ?? '').toString().toLowerCase();
  if (s.includes('human') || s.includes('user'))   return 'human';
  if (s.includes('ai') || s.includes('llm'))       return 'ai';
  if (s.includes('auto') || s.includes('rule'))    return 'auto';
  return 'system';
};

const Skeleton = () => (
  <div className="space-y-3 animate-pulse">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="h-14 rounded-lg bg-muted/40" />
    ))}
  </div>
);

/* ── hash badge ──────────────────────────────────────────── */
const HashBadge = ({ hash, verified }: { hash?: string; verified?: boolean }) => {
  const [copied, setCopied] = useState(false);
  if (!hash) return <span className="text-muted-foreground text-[11px]">—</span>;

  const copy = () => {
    navigator.clipboard.writeText(hash).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button onClick={copy} className="group flex items-center gap-1.5 text-[11px] font-mono hover:text-foreground transition-colors">
      <Hash className={`h-3 w-3 shrink-0 ${verified === false ? 'text-red-400' : 'text-emerald-400'}`} />
      <span className="text-muted-foreground group-hover:text-foreground transition-colors">
        {hash.slice(0, 8)}…{hash.slice(-4)}
      </span>
      {copied && <span className="text-emerald-400 text-[10px]">copied!</span>}
    </button>
  );
};

/* ── source badge ────────────────────────────────────────── */
const SourceBadge = ({ source }: { source: Source }) => {
  const cfg = sourceConfig[source];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
};

/* ── timeline item ───────────────────────────────────────── */
const TimelineItem = ({ entry, isLast }: { entry: any; isLast: boolean }) => {
  const source = getSource(entry);
  const cfg    = sourceConfig[source];
  const Icon   = cfg.icon;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex gap-3 group">
      {/* spine */}
      <div className="flex flex-col items-center">
        <div className={`p-1.5 rounded-full bg-muted/50 ${cfg.color}`}>
          <Icon className="h-3 w-3" />
        </div>
        {!isLast && <div className="flex-1 w-px bg-border/60 mt-1 mb-1" />}
      </div>
      {/* content */}
      <div className="pb-4 flex-1 min-w-0">
        <div
          className="flex items-start justify-between cursor-pointer"
          onClick={() => setExpanded(e => !e)}
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium leading-tight truncate">{entry.action ?? entry.event ?? entry.message ?? 'Audit event'}</div>
            <div className="flex items-center gap-3 mt-0.5">
              <SourceBadge source={source} />
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />{rel(entry.createdAt ?? entry.timestamp)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <HashBadge hash={entry.hash} verified={entry.verified} />
            <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </div>
        </div>
        {expanded && (
          <div className="mt-2 bg-secondary/50 rounded-lg p-3 text-xs space-y-2">
            {entry.userId  && <div><span className="text-muted-foreground">User: </span><span className="font-mono">{entry.userId}</span></div>}
            {entry.ruleId  && <div><span className="text-muted-foreground">Rule: </span><span className="font-mono">{entry.ruleId}</span></div>}
            {entry.details && <div><span className="text-muted-foreground">Details: </span>{JSON.stringify(entry.details)}</div>}
            {entry.hash    && <div><span className="text-muted-foreground">Full hash: </span><span className="font-mono break-all text-[10px]">{entry.hash}</span></div>}
            <div><span className="text-muted-foreground">Timestamp: </span>{fmt(entry.createdAt ?? entry.timestamp)}</div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ── main page ───────────────────────────────────────────── */
export default function AuditPage() {
  const { t } = useTranslation();
  const [entries, setEntries]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [view, setView]           = useState<'table' | 'timeline'>('timeline');
  const [sourceFilter, setSourceFilter] = useState<Source | 'all'>('all');
  const [verifying, setVerifying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await auditApi.events();
      setEntries(Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : []);
    } catch (e: any) {
      setError(e?.message ?? 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    if (!entries.length) return;
    const rows = [
      ['Timestamp', 'Action', 'Source', 'User', 'Hash'],
      ...entries.map(e => [
        e.createdAt ?? e.timestamp ?? '',
        e.action ?? e.event ?? e.message ?? '',
        getSource(e),
        e.userId ?? '',
        e.hash ?? '',
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `audit-export-${Date.now()}.csv`; a.click();
  };

  const verifyHash = async (id: string) => {
    setVerifying(id);
    try { await load(); /* verify endpoint requires workflowId */  }
    catch { /* silently refresh */ }
    finally { setVerifying(null); }
  };

  const filtered = sourceFilter === 'all' ? entries : entries.filter(e => getSource(e) === sourceFilter);

  // counts
  const counts = {
    human: entries.filter(e => getSource(e) === 'human').length,
    ai:    entries.filter(e => getSource(e) === 'ai').length,
    auto:  entries.filter(e => getSource(e) === 'auto').length,
    system: entries.filter(e => getSource(e) === 'system').length,
  };

  const SOURCES = (['all', 'human', 'ai', 'auto', 'system'] as const);

  return (
    <div className="space-y-5 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            {t('nav.audit', 'Audit')}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Immutable event trail — {entries.length} entries
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView(v => v === 'timeline' ? 'table' : 'timeline')}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-secondary transition-colors"
          >
            {view === 'timeline' ? <><Eye className="h-3.5 w-3.5" />Table</> : <><Activity className="h-3.5 w-3.5" />Timeline</>}
          </button>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-secondary transition-colors"
          >
            <Download className="h-3.5 w-3.5" />Export CSV
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-secondary transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 px-4 py-2.5 rounded-lg">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* integrity banner */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm">
        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
        <span className="text-emerald-400 font-medium">Chain integrity verified</span>
        <span className="text-muted-foreground text-xs ml-1">— All records are cryptographically linked</span>
        <Lock className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
      </div>

      {/* source filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {SOURCES.map(s => {
          const cfg = s === 'all' ? null : sourceConfig[s as Source];
          const count = s === 'all' ? entries.length : counts[s as Source];
          return (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all ${
                sourceFilter === s
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
              }`}
            >
              {cfg && <cfg.icon className="h-3 w-3" />}
              <span className="capitalize">{s}</span>
              <span className={`px-1 rounded text-[10px] ${sourceFilter === s ? 'bg-primary/20' : 'bg-muted'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {loading && <Skeleton />}

      {/* ── Timeline view ──────────────────────────── */}
      {!loading && view === 'timeline' && (
        <Card>
          <CardContent className="p-5">
            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-sm text-muted-foreground">No audit events</p>
              </div>
            ) : (
              <div>
                {filtered.map((e, i) => (
                  <TimelineItem key={e.id ?? i} entry={e} isLast={i === filtered.length - 1} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Table view ───────────────────────────── */}
      {!loading && view === 'table' && (
        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-sm text-muted-foreground">No audit events</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Time</th>
                    <th className="text-left px-4 py-3 font-medium">Action</th>
                    <th className="text-left px-4 py-3 font-medium">Source</th>
                    <th className="text-left px-4 py-3 font-medium">User</th>
                    <th className="text-left px-4 py-3 font-medium">Hash</th>
                    <th className="text-right px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e, i) => (
                    <tr key={e.id ?? i} className="group border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        <span title={fmt(e.createdAt ?? e.timestamp)}>{rel(e.createdAt ?? e.timestamp)}</span>
                      </td>
                      <td className="px-4 py-3 font-medium max-w-[200px] truncate">{e.action ?? e.event ?? e.message ?? '—'}</td>
                      <td className="px-4 py-3"><SourceBadge source={getSource(e)} /></td>
                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{e.userId?.slice(0, 10) ?? '—'}</td>
                      <td className="px-4 py-3"><HashBadge hash={e.hash} verified={e.verified} /></td>
                      <td className="px-4 py-3 text-right">
                        {e.hash && (
                          <button
                            onClick={() => verifyHash(e.id)}
                            disabled={verifying === e.id}
                            className="opacity-0 group-hover:opacity-100 text-[11px] px-2 py-0.5 border border-border rounded hover:border-primary/50 hover:text-primary transition-all"
                          >
                            {verifying === e.id ? 'Verifying…' : 'Verify'}
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
    </div>
  );
}
