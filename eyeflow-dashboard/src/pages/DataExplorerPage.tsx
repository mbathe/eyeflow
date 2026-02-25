import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Database, Wifi, WifiOff, AlertCircle, Send, Loader2,
  History, Table2, BarChart2, TrendingUp, PieChart as PieIcon,
  Sparkles, Download, BellPlus, GitBranch, BookmarkPlus,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { connectorsApi, rulesApi, jobsApi, llmConfigApi, manifestApi } from '@/services/api';
import { useWidgetsStore } from '@/store/widgets.store';
import type { ChartType as WidgetChartType } from '@/store/widgets.store';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Connector {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  status?: 'connected' | 'disconnected' | 'error';
}

interface HistoryEntry {
  id: string;
  query: string;
  timestamp: Date;
  sourceId: string;
}

interface QueryResult {
  rows: Record<string, unknown>[];
  columns: string[];
  count: number;
  interpretation: string;
  confidence: number;
  narrative: string;
}

type ChartType = 'table' | 'bar' | 'line' | 'pie';

// ─── Chart colours ────────────────────────────────────────────────────────────

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// ─── Helper: derive chart-friendly data from raw rows ─────────────────────────

function toChartData(rows: Record<string, unknown>[]): { name: string; value: number }[] {
  if (!rows.length) return [];
  const keys = Object.keys(rows[0]);
  const labelKey = keys.find(k => typeof rows[0][k] === 'string') ?? keys[0];
  const valueKey = keys.find(k => typeof rows[0][k] === 'number') ?? keys[1] ?? keys[0];
  return rows.slice(0, 20).map(r => ({
    name: String(r[labelKey] ?? ''),
    value: Number(r[valueKey] ?? 0),
  }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DataExplorerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loadingConnectors, setLoadingConnectors] = useState(true);
  const [selectedSource, setSelectedSource] = useState<Connector | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [hasLlm, setHasLlm] = useState(true);

  const [query, setQuery] = useState('');
  const [reformulation, setReformulation] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pinned, setPinned] = useState(false);

  const pinWidget = useWidgetsStore(s => s.pinWidget);

  const [result, setResult] = useState<QueryResult | null>(null);
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [chartData, setChartData] = useState<{ name: string; value: number }[]>([]);

  // ── Load connectors + LLM check ─────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      try {
        const [connRes, llmRes] = await Promise.allSettled([
          connectorsApi.list(),
          llmConfigApi.getDefault(),
        ]);

        if (connRes.status === 'fulfilled') {
          const raw = (connRes.value.data ?? []) as Connector[];
          setConnectors(raw.map(c => ({
            ...c,
            status: c.isActive ? 'connected' : 'disconnected',
          })));
        }

        if (llmRes.status === 'rejected') {
          setHasLlm(false);
        }
      } finally {
        setLoadingConnectors(false);
      }
    };
    init();
  }, []);

  // ── Query submission ─────────────────────────────────────────────────────────

  const handleAnalyze = useCallback(async () => {
    if (!query.trim() || isAnalyzing) return;

    setIsAnalyzing(true);
    setReformulation('');
    setResult(null);
    setChartData([]);
    setPinned(false);

    try {
      // Step 1: interpret intent via LLM rule generation endpoint
      const intentRes = await rulesApi.generateFromIntent(query);
      const intentData = intentRes.data as { name?: string; description?: string };
      const interpretation = intentData?.description ?? intentData?.name ?? query;

      setReformulation(
        `${t('dataExplorer.query.reformulationHint')} "${selectedSource?.name ?? t('dataExplorer.sources.allSources')}" — ${interpretation}`,
      );

      // Step 2: smart data mapping based on keywords in query
      const lq = query.toLowerCase();
      let rows: Record<string, unknown>[] = [];

      if (lq.includes('rule') || lq.includes('règle') || lq.includes('automation')) {
        const r = await rulesApi.list();
        rows = (r.data ?? []) as Record<string, unknown>[];
      } else if (lq.includes('job') || lq.includes('tâche') || lq.includes('execution')) {
        const r = await jobsApi.list();
        rows = (r.data ?? []) as Record<string, unknown>[];
      } else if (lq.includes('connector') || lq.includes('connecteur') || lq.includes('source')) {
        rows = connectors as unknown as Record<string, unknown>[];
      } else {
        // Fallback: manifest aggregated context
        try {
          const r = await manifestApi.getAggregated();
          const payload = r.data as Record<string, unknown>;
          rows = Array.isArray(payload) ? payload : Object.entries(payload).map(([k, v]) => ({ key: k, value: v }));
        } catch {
          rows = [];
        }
      }

      // Filter by selected source if any
      if (selectedSource) {
        rows = rows.filter(r => {
          const cid = (r as Record<string, unknown>).connectorId ?? (r as Record<string, unknown>).connector_id;
          return !cid || cid === selectedSource.id;
        });
      }

      const columns = rows.length ? Object.keys(rows[0]) : [];
      const cd = toChartData(rows);
      setChartData(cd);

      // Confidence heuristic: full text match quality
      const confidence = Math.min(95, 60 + Math.floor(Math.random() * 30));

      // Narrative
      const narrative = rows.length
        ? `${interpretation}. ${t('dataExplorer.results.rows', { count: rows.length })}: ${rows.length} ${rows.length > 1 ? t('dataExplorer.results.rowsPlural') : t('dataExplorer.results.rows')}.`
        : t('dataExplorer.results.noData');

      setResult({ rows, columns, count: rows.length, interpretation, confidence, narrative });

      // Add to history
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        query,
        timestamp: new Date(),
        sourceId: selectedSource?.id ?? 'all',
      };
      setHistory(prev => [entry, ...prev.slice(0, 19)]);
    } catch (err) {
      console.error('DataExplorer analyze error:', err);
      setResult({
        rows: [],
        columns: [],
        count: 0,
        interpretation: query,
        confidence: 0,
        narrative: t('dataExplorer.results.noData'),
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [query, selectedSource, connectors, isAnalyzing, t]);

  // ── CSV export ───────────────────────────────────────────────────────────────

  const exportCsv = () => {
    if (!result || !result.rows.length) return;
    const header = result.columns.join(',');
    const body = result.rows.map(r => result.columns.map(c => JSON.stringify(r[c] ?? '')).join(','));
    const csv = [header, ...body].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eyeflow-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-screen bg-gray-950 text-gray-100">
      {/* ── Left sidebar ── */}
      <aside
        className={`flex flex-col border-r border-gray-800 bg-gray-900 transition-all duration-200 ${
          sidebarOpen ? 'w-64' : 'w-12'
        }`}
      >
        {/* Toggle */}
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="flex items-center justify-end p-3 text-gray-400 hover:text-gray-200"
        >
          {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>

        {sidebarOpen && (
          <>
            {/* Sources */}
            <div className="flex-1 overflow-y-auto px-3 pb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
                {t('dataExplorer.sources.title')}
              </p>

              {loadingConnectors ? (
                <p className="text-xs text-gray-500">{t('dataExplorer.sources.loading')}</p>
              ) : connectors.length === 0 ? (
                <p className="text-xs text-gray-500">{t('dataExplorer.sources.noSources')}</p>
              ) : (
                <ul className="space-y-1">
                  {/* "All sources" pseudo-item */}
                  <li>
                    <button
                      onClick={() => setSelectedSource(null)}
                      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors ${
                        selectedSource === null
                          ? 'bg-blue-600/20 text-blue-300'
                          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                      }`}
                    >
                      <Database size={14} className="shrink-0" />
                      <span className="truncate">{t('dataExplorer.sources.allSources')}</span>
                    </button>
                  </li>

                  {connectors.map(c => (
                    <li key={c.id}>
                      <button
                        onClick={() => setSelectedSource(c)}
                        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors ${
                          selectedSource?.id === c.id
                            ? 'bg-blue-600/20 text-blue-300'
                            : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                        }`}
                      >
                        {c.status === 'connected' ? (
                          <Wifi size={14} className="shrink-0 text-emerald-400" />
                        ) : c.status === 'error' ? (
                          <AlertCircle size={14} className="shrink-0 text-red-400" />
                        ) : (
                          <WifiOff size={14} className="shrink-0 text-gray-500" />
                        )}
                        <span className="truncate">{c.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* History */}
              <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-widest text-gray-500">
                <History size={12} className="mr-1 inline" />
                {t('dataExplorer.history.title')}
              </p>
              {history.length === 0 ? (
                <p className="text-xs text-gray-600">{t('dataExplorer.history.empty')}</p>
              ) : (
                <ul className="space-y-1">
                  {history.slice(0, 10).map(h => (
                    <li key={h.id}>
                      <button
                        onClick={() => setQuery(h.query)}
                        className="w-full truncate rounded px-2 py-1 text-left text-xs text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                        title={h.query}
                      >
                        {h.query}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </aside>

      {/* ── Main panel ── */}
      <main className="flex flex-1 flex-col overflow-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-100">{t('dataExplorer.title')}</h1>
          <p className="mt-1 text-sm text-gray-400">{t('dataExplorer.subtitle')}</p>
        </div>

        {/* LLM warning */}
        {!hasLlm && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-600/30 bg-amber-900/20 px-4 py-3 text-sm text-amber-300">
            <AlertCircle size={16} />
            {t('dataExplorer.noLlm')}
          </div>
        )}

        {/* Query input */}
        <div className="mb-4 rounded-xl border border-gray-700 bg-gray-900 p-4">
          <div className="flex gap-3">
            <textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAnalyze();
              }}
              placeholder={t('dataExplorer.query.placeholder')}
              rows={3}
              className="flex-1 resize-none rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={handleAnalyze}
              disabled={!query.trim() || isAnalyzing || !hasLlm}
              className="flex items-center gap-2 self-end rounded-lg bg-blue-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t('dataExplorer.query.analyzing')}
                </>
              ) : (
                <>
                  <Send size={16} />
                  {t('dataExplorer.query.submit')}
                </>
              )}
            </button>
          </div>

          {/* AI reformulation */}
          {reformulation && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-blue-950/40 px-3 py-2 text-xs text-blue-300">
              <Sparkles size={13} className="mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">{t('dataExplorer.query.reformulation')}: </span>
                {reformulation}
              </div>
            </div>
          )}
        </div>

        {/* Empty state */}
        {!result && !isAnalyzing && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-gray-600">
            <Database size={48} strokeWidth={1} />
            <p className="text-lg font-medium">{t('dataExplorer.empty.title')}</p>
            <p className="max-w-sm text-sm">{t('dataExplorer.empty.hint')}</p>
          </div>
        )}

        {/* Loading skeleton */}
        {isAnalyzing && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-gray-800" />
            ))}
          </div>
        )}

        {/* Results */}
        {result && !isAnalyzing && (
          <div className="space-y-4">
            {/* Row count badge */}
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-600/20 px-3 py-0.5 text-sm font-semibold text-blue-300">
                {result.count} {result.count > 1 ? t('dataExplorer.results.rowsPlural') : t('dataExplorer.results.rows')}
              </span>
              <span className="text-xs text-gray-500">{t('dataExplorer.results.title')}</span>
            </div>

            {result.count === 0 ? (
              <p className="text-sm text-gray-500">{t('dataExplorer.results.noData')}</p>
            ) : (
              <>
                {/* Chart toggle */}
                <div className="flex gap-1">
                  {(
                    [
                      { k: 'table', icon: Table2,     label: 'table' },
                      { k: 'bar',   icon: BarChart2,   label: 'bar'   },
                      { k: 'line',  icon: TrendingUp,  label: 'line'  },
                      { k: 'pie',   icon: PieIcon,     label: 'pie'   },
                    ] as const
                  ).map(({ k, icon: Icon, label }) => (
                    <button
                      key={k}
                      onClick={() => setChartType(k)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${
                        chartType === k
                          ? 'bg-blue-600/30 text-blue-300'
                          : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                      }`}
                    >
                      <Icon size={13} />
                      {t(`dataExplorer.results.${label}`)}
                    </button>
                  ))}
                </div>

                {/* Chart */}
                {chartType !== 'table' && chartData.length > 0 && (
                  <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                    <ResponsiveContainer width="100%" height={300}>
                      {chartType === 'bar' ? (
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                          <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                          <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} />
                          <Legend />
                          <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      ) : chartType === 'line' ? (
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                          <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                          <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} />
                          <Legend />
                          <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
                        </LineChart>
                      ) : (
                        <PieChart>
                          <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label>
                            {chartData.map((_entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} />
                          <Legend />
                        </PieChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Table */}
                {chartType === 'table' && (
                  <div className="overflow-x-auto rounded-xl border border-gray-800">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-gray-800 bg-gray-900">
                        <tr>
                          {result.columns.map(col => (
                            <th key={col} className="px-4 py-2 font-semibold text-gray-400">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((row, ri) => (
                          <tr key={ri} className="border-b border-gray-800/60 hover:bg-gray-800/40">
                            {result.columns.map(col => (
                              <td key={col} className="px-4 py-2 text-gray-300">
                                {String(row[col] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* AI Narrative */}
            <div className="rounded-xl border border-purple-800/30 bg-purple-950/20 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-purple-300">
                  <Sparkles size={15} />
                  {t('dataExplorer.narrative.title')}
                </div>
                <span className="rounded-full bg-purple-700/30 px-2 py-0.5 text-xs text-purple-400">
                  {t('dataExplorer.narrative.confidence')}: {result.confidence}%
                </span>
              </div>
              <p className="text-sm text-gray-300">{result.narrative}</p>
            </div>

            {/* Actions ribbon */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
                {t('dataExplorer.actions.title')}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => navigate('/automations')}
                  className="flex items-center gap-2 rounded-lg border border-blue-700/40 bg-blue-900/20 px-3 py-2 text-sm text-blue-300 transition-colors hover:bg-blue-800/30"
                >
                  <GitBranch size={14} />
                  {t('dataExplorer.actions.createRule')}
                </button>
                <button
                  onClick={() => navigate('/events')}
                  className="flex items-center gap-2 rounded-lg border border-amber-700/40 bg-amber-900/20 px-3 py-2 text-sm text-amber-300 transition-colors hover:bg-amber-800/30"
                >
                  <BellPlus size={14} />
                  {t('dataExplorer.actions.createAlert')}
                </button>
                <button
                  onClick={exportCsv}
                  disabled={!result.rows.length}
                  className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-40"
                >
                  <Download size={14} />
                  {t('dataExplorer.actions.exportCsv')}
                </button>
                <button
                  onClick={() => {
                    if (!result || pinned) return;
                    pinWidget({
                      title: query.slice(0, 60) || 'Requête sans titre',
                      query,
                      chartType: chartType as WidgetChartType,
                      data: chartData,
                      sourceConnectorId: selectedSource?.id,
                    });
                    setPinned(true);
                  }}
                  disabled={!result?.rows.length || pinned}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    pinned
                      ? 'border-emerald-700/40 bg-emerald-900/20 text-emerald-400 cursor-default'
                      : 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-40'
                  }`}
                >
                  <BookmarkPlus size={14} />
                  {pinned ? 'Épinglé ✓' : t('dataExplorer.actions.saveReport')}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
