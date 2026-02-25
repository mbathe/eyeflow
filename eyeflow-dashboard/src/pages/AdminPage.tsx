import { useEffect, useState, useCallback } from 'react';
import { Server, RefreshCw, CheckCircle2, XCircle, Activity, Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { nodesApi, rulesApi, jobsApi, connectorsApi } from '@/services/api';
import { useIsAdmin } from '@/store/auth.store';
import { SuggestionEnginePanel } from '@/components/SuggestionEnginePanel';

interface Metrics {
  rules: number | string;
  jobs: number | string;
  connectors: number | string;
  approvals: number | string;
}

interface NodeSummary {
  total?: number;
  online?: number;
  offline?: number;
}

export default function AdminPage() {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const [metrics, setMetrics] = useState<Metrics>({ rules: '—', jobs: '—', connectors: '—', approvals: '—' });
  const [nodeSummary, setNodeSummary] = useState<NodeSummary>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [rules, jobs, connectors, approvals, nodeSum] = await Promise.allSettled([
      rulesApi.list(),
      jobsApi.list(),
      connectorsApi.list(),
      rulesApi.pending(),
      nodesApi.summary(),
    ]);
    setMetrics({
      rules:      rules.status      === 'fulfilled' ? (rules.value.data?.length      ?? 0) : '—',
      jobs:       jobs.status       === 'fulfilled' ? (jobs.value.data?.length       ?? 0) : '—',
      connectors: connectors.status === 'fulfilled' ? (connectors.value.data?.length ?? 0) : '—',
      approvals:  approvals.status  === 'fulfilled' ? (approvals.value.data?.length  ?? 0) : '—',
    });
    if (nodeSum.status === 'fulfilled') setNodeSummary(nodeSum.value.data ?? {});
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const services = [
    { label: t('administration.services.nestApi'),    status: 'online'  },
    { label: t('administration.services.kafka'),      status: 'online'  },
    { label: t('administration.services.llmService'), status: 'online'  },
    { label: t('administration.services.svmRuntime'), status: 'offline' },
    { label: t('administration.services.database'),   status: 'online'  },
  ];

  const allOK = services.every((s) => s.status === 'online');

  const metricItems = [
    { label: t('administration.metrics.totalRules'),       value: metrics.rules      },
    { label: t('administration.metrics.totalJobs'),        value: metrics.jobs       },
    { label: t('administration.metrics.totalConnectors'),  value: metrics.connectors },
    { label: t('administration.metrics.pendingApprovals'), value: metrics.approvals  },
  ];

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Server className="h-8 w-8 text-primary/40" />
        <p className="text-sm">Accès réservé aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{t('administration.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('administration.subtitle')}</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-secondary transition-colors shrink-0">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </button>
      </div>

      {/* Platform health summary */}
      <div className={`flex items-center gap-2 text-sm rounded-md px-4 py-3 border ${allOK ? 'text-success bg-success/10 border-success/30' : 'text-warning bg-warning/10 border-warning/30'}`}>
        {allOK ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Activity className="h-4 w-4 shrink-0" />}
        {allOK ? t('administration.platformHealth.allOperational') : t('administration.platformHealth.someIssues')}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Services */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Server className="h-4 w-4" />{t('administration.services.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {services.map((s) => (
              <div key={s.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{s.label}</span>
                <span className={`flex items-center gap-1 text-xs font-medium ${s.status === 'online' ? 'text-success' : 'text-destructive'}`}>
                  {s.status === 'online'
                    ? <CheckCircle2 className="h-3.5 w-3.5" />
                    : <XCircle className="h-3.5 w-3.5" />}
                  {s.status === 'online' ? t('common.online') : t('common.offline')}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Metrics */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />{t('administration.metrics.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {metricItems.map((m) => (
              <div key={m.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{m.label}</span>
                <span className="font-bold tabular-nums">{m.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Node Summary */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">{t('administration.nodes.title')}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {Object.keys(nodeSummary).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
            ) : (
              <div className="space-y-2 text-sm">
                {nodeSummary.total !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-bold">{nodeSummary.total}</span>
                  </div>
                )}
                {nodeSummary.online !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-success">{t('common.online')}</span>
                    <span className="font-bold text-success">{nodeSummary.online}</span>
                  </div>
                )}
                {nodeSummary.offline !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('common.offline')}</span>
                    <span className="font-bold">{nodeSummary.offline}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Suggestion Engine */}
      <div>
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <Bot className="h-4 w-4 text-purple-400" />
          Moteur IA de suggestions
        </h2>
        <SuggestionEnginePanel />
      </div>
    </div>
  );
}
