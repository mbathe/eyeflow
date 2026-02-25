/**
 * SuggestionEnginePanel — shared component
 *
 * Used by both SuggestionsPage and AdminPage so the AI engine configuration
 * is accessible from the administration section too.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bot, Play, Zap, Loader2, AlertTriangle,
  Settings, X, Save,
} from 'lucide-react';
import { suggestionsApi } from '@/services/api';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EngineStatus {
  isRunning: boolean;
  lastRunAt: string | null;
  lastRunDurationMs: number | null;
  lastRunSuggestionsCreated: number;
  nextRunAt: string | null;
  nextRunInSeconds: number | null;
  totalRuns: number;
  hasLlm: boolean;
  llmProvider?: string;
  llmModel?: string;
  error?: string;
}

export interface EngineConfig {
  enabled: boolean;
  intervalMinutes: number;
  firstRunDelaySeconds: number;
  maxSuggestionsPerRun: number;
  minConfidenceThreshold: number;
  deduplicationWindowHours: number;
  enableFallbackHeuristics: boolean;
  autoAcceptAboveConfidence: number | null;
  contextJobsWindowHours: number;
  contextEventsWindowHours: number;
  contextMaxConnectors: number;
  contextMaxJobs: number;
  contextMaxEvents: number;
  contextMaxRules: number;
  contextMaxAgents: number;
  llmMaxTokensOverride: number | null;
  llmTemperatureOverride: number | null;
  preferredLlmConfigId: string | null;
  systemPromptOverride: string | null;
  additionalContext: string | null;
  updatedAt?: string;
}

// ── Engine config dialog ───────────────────────────────────────────────────────

interface ConfigDialogProps {
  config: EngineConfig;
  onSave: (patch: Partial<EngineConfig>) => Promise<void>;
  onClose: () => void;
}

export function EngineConfigDialog({ config, onSave, onClose }: ConfigDialogProps) {
  const [form, setForm] = useState<EngineConfig>({ ...config });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = <K extends keyof EngineConfig>(key: K, val: EngineConfig[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(form);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-400">{label}</label>
      {children}
    </div>
  );

  const NumberInput = ({ value, onChange, min, max, step, nullable }: {
    value: number | null;
    onChange: (v: number | null) => void;
    min?: number; max?: number; step?: number; nullable?: boolean;
  }) => (
    <input
      type="number"
      value={value ?? ''}
      min={min} max={max} step={step ?? 1}
      placeholder={nullable ? 'Auto' : undefined}
      onChange={e => onChange(e.target.value === '' && nullable ? null : Number(e.target.value))}
      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none placeholder-gray-600"
    />
  );

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        'relative h-6 w-11 rounded-full transition-colors',
        value ? 'bg-blue-600' : 'bg-gray-700',
      )}
    >
      <span className={cn(
        'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
        value ? 'translate-x-5' : 'translate-x-0.5',
      )} />
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/50 backdrop-blur-sm">
      <div className="h-full w-full max-w-lg overflow-y-auto border-l border-gray-700 bg-gray-950 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-800 bg-gray-950 px-5 py-4">
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-purple-400" />
            <span className="text-sm font-bold text-gray-100">Configuration du moteur IA</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-6">

          {/* ── Scheduling ── */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Planification</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Moteur actif</span>
                <Toggle value={form.enabled} onChange={v => set('enabled', v)} />
              </div>
              <Field label="Intervalle entre analyses (minutes)">
                <NumberInput value={form.intervalMinutes} onChange={v => set('intervalMinutes', v ?? 30)} min={1} max={1440} />
              </Field>
              <Field label="Délai avant première analyse au démarrage (secondes)">
                <NumberInput value={form.firstRunDelaySeconds} onChange={v => set('firstRunDelaySeconds', v ?? 60)} min={0} max={3600} />
              </Field>
            </div>
          </section>

          {/* ── Quality ── */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Qualité des suggestions</h3>
            <div className="space-y-3">
              <Field label="Nombre max de suggestions par analyse">
                <NumberInput value={form.maxSuggestionsPerRun} onChange={v => set('maxSuggestionsPerRun', v ?? 8)} min={1} max={20} />
              </Field>
              <Field label={`Confiance minimale pour enregistrer : ${form.minConfidenceThreshold}%`}>
                <input
                  type="range" min={0} max={100} step={5}
                  value={form.minConfidenceThreshold}
                  onChange={e => set('minConfidenceThreshold', Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </Field>
              <Field label="Fenêtre de déduplication (heures)">
                <NumberInput value={form.deduplicationWindowHours} onChange={v => set('deduplicationWindowHours', v ?? 24)} min={1} max={720} />
              </Field>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-gray-300">Heuristiques de secours</span>
                  <p className="text-xs text-gray-500">Activer si pas de LLM disponible</p>
                </div>
                <Toggle value={form.enableFallbackHeuristics} onChange={v => set('enableFallbackHeuristics', v)} />
              </div>
              <Field label="Auto-accepter si confiance ≥ (laisser vide pour désactiver)">
                <NumberInput value={form.autoAcceptAboveConfidence} onChange={v => set('autoAcceptAboveConfidence', v)} min={50} max={100} nullable />
              </Field>
            </div>
          </section>

          {/* ── Context window ── */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Fenêtre de contexte</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fenêtre jobs (heures)">
                <NumberInput value={form.contextJobsWindowHours} onChange={v => set('contextJobsWindowHours', v ?? 24)} min={1} max={720} />
              </Field>
              <Field label="Fenêtre événements (heures)">
                <NumberInput value={form.contextEventsWindowHours} onChange={v => set('contextEventsWindowHours', v ?? 24)} min={1} max={720} />
              </Field>
              <Field label="Max connecteurs">
                <NumberInput value={form.contextMaxConnectors} onChange={v => set('contextMaxConnectors', v ?? 15)} min={1} max={100} />
              </Field>
              <Field label="Max jobs">
                <NumberInput value={form.contextMaxJobs} onChange={v => set('contextMaxJobs', v ?? 30)} min={1} max={200} />
              </Field>
              <Field label="Max événements">
                <NumberInput value={form.contextMaxEvents} onChange={v => set('contextMaxEvents', v ?? 50)} min={1} max={200} />
              </Field>
              <Field label="Max règles">
                <NumberInput value={form.contextMaxRules} onChange={v => set('contextMaxRules', v ?? 15)} min={1} max={100} />
              </Field>
              <Field label="Max agents">
                <NumberInput value={form.contextMaxAgents} onChange={v => set('contextMaxAgents', v ?? 10)} min={1} max={50} />
              </Field>
            </div>
          </section>

          {/* ── LLM overrides ── */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Surcharges LLM</h3>
            <div className="space-y-3">
              <Field label="ID config LLM préféré (laisser vide = LLM par défaut)">
                <input
                  type="text"
                  value={form.preferredLlmConfigId ?? ''}
                  onChange={e => set('preferredLlmConfigId', e.target.value || null)}
                  placeholder="Auto"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none placeholder-gray-600"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Max tokens (vide = config LLM)">
                  <NumberInput value={form.llmMaxTokensOverride} onChange={v => set('llmMaxTokensOverride', v)} min={256} max={8000} nullable />
                </Field>
                <Field label="Température (vide = config LLM)">
                  <input
                    type="number" min={0} max={2} step={0.1}
                    value={form.llmTemperatureOverride ?? ''}
                    placeholder="Auto"
                    onChange={e => set('llmTemperatureOverride', e.target.value === '' ? null : parseFloat(e.target.value))}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none placeholder-gray-600"
                  />
                </Field>
              </div>
            </div>
          </section>

          {/* ── Prompts ── */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Prompts personnalisés</h3>
            <div className="space-y-3">
              <Field label="Instructions additionnelles pour l'IA (domaine métier, focus, etc.)">
                <textarea
                  value={form.additionalContext ?? ''}
                  onChange={e => set('additionalContext', e.target.value || null)}
                  rows={3}
                  placeholder="Ex : Focalise-toi sur la consommation d'énergie et propose des optimisations chiffrées."
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </Field>
              <Field label="Prompt système personnalisé (remplace entièrement le prompt par défaut)">
                <textarea
                  value={form.systemPromptOverride ?? ''}
                  onChange={e => set('systemPromptOverride', e.target.value || null)}
                  rows={6}
                  placeholder="Laisser vide pour utiliser le prompt intégré…"
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none font-mono text-xs"
                />
              </Field>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between border-t border-gray-800 bg-gray-950 px-5 py-4">
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:bg-gray-800">
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Sauvegarder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Engine panel ───────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: EngineConfig = {
  enabled: true,
  intervalMinutes: 30,
  firstRunDelaySeconds: 60,
  maxSuggestionsPerRun: 8,
  minConfidenceThreshold: 40,
  deduplicationWindowHours: 24,
  enableFallbackHeuristics: true,
  autoAcceptAboveConfidence: null,
  contextJobsWindowHours: 24,
  contextEventsWindowHours: 24,
  contextMaxConnectors: 15,
  contextMaxJobs: 30,
  contextMaxEvents: 50,
  contextMaxRules: 15,
  contextMaxAgents: 10,
  llmMaxTokensOverride: null,
  llmTemperatureOverride: null,
  preferredLlmConfigId: null,
  systemPromptOverride: null,
  additionalContext: null,
};

interface EnginePanelProps {
  onTrigger?: () => Promise<void>;
  triggering?: boolean;
}

export function SuggestionEnginePanel({ onTrigger, triggering = false }: EnginePanelProps) {
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [config, setConfig] = useState<EngineConfig | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await suggestionsApi.engineStatus();
      const data = res.data as EngineStatus;
      setStatus(data);
      setCountdown(data.nextRunInSeconds);
    } catch { /* backend may not be ready */ }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await suggestionsApi.engineConfig();
      setConfig(res.data as EngineConfig);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchConfig();
    pollRef.current = setInterval(fetchStatus, 10_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [fetchStatus, fetchConfig]);

  // Local countdown tick
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (countdown !== null && countdown > 0) {
      countdownRef.current = setInterval(() => {
        setCountdown(c => (c !== null && c > 0 ? c - 1 : c));
      }, 1000);
    }
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [Math.floor((countdown ?? 0) / 60)]);

  const handleSaveConfig = async (patch: Partial<EngineConfig>) => {
    await suggestionsApi.engineUpdateConfig(patch as Record<string, unknown>);
    await fetchConfig();
    await fetchStatus();
  };

  const fmtCountdown = (secs: number | null) => {
    if (secs === null) return '—';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString();
  };

  return (
    <>
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Bot size={16} className="text-purple-400" />
            <span className="text-sm font-semibold text-gray-200">Moteur IA d'analyse</span>
            {config && !config.enabled && (
              <span className="rounded-full bg-gray-800 border border-gray-700 px-2 py-0.5 text-[10px] text-gray-400">
                Désactivé
              </span>
            )}
            {status?.isRunning && (
              <span className="flex items-center gap-1 rounded-full bg-purple-900/40 border border-purple-700/40 px-2 py-0.5 text-[10px] text-purple-300">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                Analyse en cours…
              </span>
            )}
            {status && !status.isRunning && status.hasLlm && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-900/30 border border-emerald-700/30 px-2 py-0.5 text-[10px] text-emerald-400">
                <Zap size={10} />
                {status.llmProvider?.toUpperCase()} · {status.llmModel}
              </span>
            )}
            {status && !status.hasLlm && (
              <span className="rounded-full bg-amber-900/30 border border-amber-700/30 px-2 py-0.5 text-[10px] text-amber-400">
                Heuristique (pas de LLM)
              </span>
            )}
            {config && (
              <span className="rounded-full bg-gray-800 border border-gray-700 px-2 py-0.5 text-[10px] text-gray-500">
                Toutes les {config.intervalMinutes} min
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => { if (!config) await fetchConfig(); setShowConfig(true); }}
              className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
              title="Configurer le moteur"
            >
              <Settings size={13} />
              Config
            </button>
            {onTrigger && (
              <button
                onClick={onTrigger}
                disabled={triggering || status?.isRunning || (config !== null && !config.enabled)}
                className="flex items-center gap-1.5 rounded-lg bg-purple-700/30 border border-purple-600/40 px-3 py-1.5 text-xs text-purple-300 hover:bg-purple-700/50 disabled:opacity-40 transition-colors"
              >
                {triggering || status?.isRunning
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Play size={12} />}
                Analyser maintenant
              </button>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
          <div className="rounded-lg bg-gray-800/60 px-3 py-2">
            <div className="text-gray-500 mb-0.5">Dernière analyse</div>
            <div className="font-medium text-gray-200">{fmtDate(status?.lastRunAt ?? null)}</div>
          </div>
          <div className="rounded-lg bg-gray-800/60 px-3 py-2">
            <div className="text-gray-500 mb-0.5">Prochaine dans</div>
            <div className="font-medium text-blue-300">
              {config && !config.enabled ? 'Désactivé' : fmtCountdown(countdown)}
            </div>
          </div>
          <div className="rounded-lg bg-gray-800/60 px-3 py-2">
            <div className="text-gray-500 mb-0.5">Suggestions créées</div>
            <div className="font-medium text-emerald-300">{status?.lastRunSuggestionsCreated ?? 0}</div>
          </div>
          <div className="rounded-lg bg-gray-800/60 px-3 py-2">
            <div className="text-gray-500 mb-0.5">Total analyses</div>
            <div className="font-medium text-gray-200">{status?.totalRuns ?? 0}</div>
          </div>
        </div>

        {/* Error */}
        {status?.error && (
          <div className="mt-2 flex items-center gap-2 text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">
            <AlertTriangle size={12} />
            {status.error}
          </div>
        )}
      </div>

      {/* Config dialog */}
      {showConfig && (
        <EngineConfigDialog
          config={config ?? DEFAULT_CONFIG}
          onSave={handleSaveConfig}
          onClose={() => setShowConfig(false)}
        />
      )}
    </>
  );
}
