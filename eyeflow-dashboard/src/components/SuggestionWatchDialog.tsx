/**
 * SuggestionWatchDialog
 *
 * Multi-step modal for creating or editing a "data-source watch".
 * A watch is a scheduled LLM analysis job scoped to one or more connectors.
 *
 * Steps:
 *  1. Identity  — name + description
 *  2. Sources   — select connectors (multi-select)
 *  3. Prompt    — manual text OR AI auto-generate
 *  4. Schedule  — interval, jitter, limits
 */

import { useState, useEffect, useCallback } from 'react';
import {
  X, Database, Lightbulb, Clock, Bot, Wand2, ChevronRight, ChevronLeft,
  Loader2, Check, AlertCircle, Play, RotateCcw, Zap, Activity,
  Plug2, Shield, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { connectorsApi, suggestionWatchesApi } from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type WatchPromptMode = 'manual' | 'ai_auto';

export interface SuggestionWatch {
  id: string;
  name: string;
  description?: string;
  connectorIds: string[];
  promptMode: WatchPromptMode;
  prompt: string;
  systemPrompt?: string;
  intervalMinutes: number;
  jitterPercent: number;
  enabled: boolean;
  maxSuggestionsPerRun: number;
  minConfidence: number;
  lastRunAt?: string;
  nextRunAt?: string;
  lastRunStatus?: 'idle' | 'running' | 'ok' | 'error';
  lastRunSuggestionsCreated?: number;
  totalRuns?: number;
  lastError?: string;
  createdAt: string;
}

interface Connector {
  id: string;
  name: string;
  type: string;
  status: string;
  description?: string;
}

interface Props {
  watch?: SuggestionWatch; // if set → edit mode
  onSaved: (watch: SuggestionWatch) => void;
  onClose: () => void;
}

// ── Preset intervals ──────────────────────────────────────────────────────────

const INTERVAL_PRESETS = [
  { label: '5 min',   value: 5   },
  { label: '10 min',  value: 10  },
  { label: '15 min',  value: 15  },
  { label: '30 min',  value: 30  },
  { label: '1 heure', value: 60  },
  { label: '3 heures',value: 180 },
  { label: '6 heures',value: 360 },
  { label: '1 jour',  value: 1440},
];

// ── Connector type icons (reuse logic from NotificationPanel) ─────────────────

const CONN_ICON: Record<string, React.ElementType> = {
  mqtt:       Zap,
  postgresql: Database,
  mysql:      Database,
  mongodb:    Database,
  rest_api:   Activity,
  webhook:    Activity,
  s3:         Database,
  smtp:       Shield,
};

function ConnectorIcon({ type }: { type: string }) {
  const Icon = CONN_ICON[type] ?? Plug2;
  return <Icon size={14} className="text-gray-400 shrink-0" />;
}

// ── Steps ─────────────────────────────────────────────────────────────────────

const STEPS = [
  { key: 'identity', label: 'Identité',         icon: Lightbulb },
  { key: 'sources',  label: 'Sources de données', icon: Database },
  { key: 'prompt',   label: 'Analyse',           icon: Bot },
  { key: 'schedule', label: 'Planification',     icon: Clock },
] as const;

type Step = typeof STEPS[number]['key'];

// ── StepHeader ────────────────────────────────────────────────────────────────

function StepHeader({ current, onGo }: { current: Step; onGo: (s: Step) => void }) {
  const idx = STEPS.findIndex(s => s.key === current);
  return (
    <div className="flex items-center gap-1 mb-6">
      {STEPS.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <button
            key={s.key}
            onClick={() => i < idx && onGo(s.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
              active  ? 'bg-amber-600/20 text-amber-300 border border-amber-600/40' :
              done    ? 'text-gray-400 hover:text-gray-200 cursor-pointer' :
              'text-gray-600 cursor-default',
            )}
          >
            {done
              ? <Check size={11} className="text-emerald-400 shrink-0" />
              : <s.icon size={11} className="shrink-0" />
            }
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export function SuggestionWatchDialog({ watch, onSaved, onClose }: Props) {
  const isEdit = !!watch;

  // Form state
  const [step, setStep] = useState<Step>('identity');
  const [name, setName]             = useState(watch?.name ?? '');
  const [description, setDesc]      = useState(watch?.description ?? '');
  const [connectorIds, setConn]     = useState<string[]>(watch?.connectorIds ?? []);
  const [promptMode, setPromptMode] = useState<WatchPromptMode>(watch?.promptMode ?? 'manual');
  const [prompt, setPrompt]         = useState(watch?.prompt ?? '');
  const [systemPrompt, setSysPrompt]= useState(watch?.systemPrompt ?? '');
  const [intervalMinutes, setInterval]  = useState(watch?.intervalMinutes ?? 30);
  const [jitterPercent, setJitter]      = useState(watch?.jitterPercent ?? 20);
  const [maxSuggestions, setMaxSugg]    = useState(watch?.maxSuggestionsPerRun ?? 5);
  const [minConfidence, setMinConf]     = useState(watch?.minConfidence ?? 50);
  const [enabled, setEnabled]           = useState(watch?.enabled ?? true);
  const [userHint, setUserHint]         = useState('');

  // Async state
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loadingConns, setLoadingConns] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load available connectors
  useEffect(() => {
    setLoadingConns(true);
    connectorsApi.list()
      .then(r => setConnectors((r.data as any[]) ?? []))
      .catch(() => setConnectors([]))
      .finally(() => setLoadingConns(false));
  }, []);

  // ── AI prompt generation ──────────────────────────────────────────────────

  const handleGeneratePrompt = useCallback(async () => {
    if (!connectorIds.length) return;
    setGeneratingPrompt(true);
    setError('');
    try {
      const res = await suggestionWatchesApi.generatePrompt(connectorIds, userHint || undefined);
      setPrompt((res.data as any).prompt ?? '');
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e.message ?? 'Erreur lors de la génération');
    } finally {
      setGeneratingPrompt(false);
    }
  }, [connectorIds, userHint]);

  // ── Navigation ────────────────────────────────────────────────────────────

  const canNext = (): boolean => {
    switch (step) {
      case 'identity': return name.trim().length >= 2;
      case 'sources':  return connectorIds.length > 0;
      case 'prompt':   return promptMode === 'ai_auto' || prompt.trim().length >= 10;
      case 'schedule': return intervalMinutes >= 1;
    }
  };

  const nextStep = () => {
    const idx = STEPS.findIndex(s => s.key === step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].key);
  };

  const prevStep = () => {
    const idx = STEPS.findIndex(s => s.key === step);
    if (idx > 0) setStep(STEPS[idx - 1].key);
  };

  const isLast = step === 'schedule';

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        connectorIds,
        promptMode,
        prompt,
        systemPrompt: systemPrompt.trim() || undefined,
        intervalMinutes,
        jitterPercent,
        maxSuggestionsPerRun: maxSuggestions,
        minConfidence,
        enabled,
      };
      const res = isEdit
        ? await suggestionWatchesApi.update(watch!.id, payload)
        : await suggestionWatchesApi.create(payload);
      onSaved(res.data as SuggestionWatch);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e.message ?? 'Erreur lors de la sauvegarde');
      setSaving(false);
    }
  };

  // ── Toggle connector selection ────────────────────────────────────────────

  const toggleConnector = (id: string) => {
    setConn(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-700 bg-gray-950 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Title bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <Bot size={18} className="text-amber-400" />
            <h2 className="text-base font-bold text-gray-100">
              {isEdit ? 'Modifier la surveillance' : 'Nouvelle surveillance IA'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <StepHeader current={step} onGo={setStep} />

          {/* ── Step: Identity ─────────────────────────────────────────── */}
          {step === 'identity' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Donnez un nom à cette règle de surveillance. Elle analysera périodiquement
                vos sources de données et générera des suggestions intelligentes.
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">Nom *</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="ex. Surveillance MQTT broker"
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-amber-500/60 focus:outline-none transition-colors"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">Description (optionnel)</label>
                <textarea
                  value={description}
                  onChange={e => setDesc(e.target.value)}
                  rows={2}
                  placeholder="Brève description de l'objectif de cette surveillance…"
                  className="w-full resize-none rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-amber-500/60 focus:outline-none transition-colors"
                />
              </div>
            </div>
          )}

          {/* ── Step: Sources ─────────────────────────────────────────── */}
          {step === 'sources' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Sélectionnez les sources de données à surveiller.
                L'IA analysera ces connecteurs à chaque exécution.
              </p>

              {loadingConns ? (
                <div className="flex items-center justify-center py-10 text-gray-600">
                  <Loader2 size={20} className="animate-spin mr-2" />
                  Chargement des connecteurs…
                </div>
              ) : connectors.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-gray-600">
                  <Database size={32} strokeWidth={1} />
                  <p className="text-sm">Aucun connecteur disponible</p>
                  <p className="text-xs">Créez d'abord des connecteurs dans la section "Connecteurs".</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {connectors.map(c => {
                    const selected = connectorIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleConnector(c.id)}
                        className={cn(
                          'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all',
                          selected
                            ? 'border-amber-600/50 bg-amber-900/20 text-gray-200'
                            : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600 hover:text-gray-300',
                        )}
                      >
                        <div className={cn(
                          'shrink-0 w-5 h-5 rounded-md flex items-center justify-center transition-colors',
                          selected ? 'bg-amber-600' : 'bg-gray-700',
                        )}>
                          {selected && <Check size={11} className="text-white" />}
                        </div>
                        <ConnectorIcon type={c.type} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-200 truncate">{c.name}</p>
                          <p className="text-xs text-gray-500">{c.type} · {c.status}</p>
                        </div>
                        {c.status === 'active' || c.status === 'connected' ? (
                          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-900/20 border border-emerald-700/30 rounded-full px-2 py-0.5">Actif</span>
                        ) : (
                          <span className="text-[10px] text-gray-500 bg-gray-800 border border-gray-700 rounded-full px-2 py-0.5">{c.status}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {connectorIds.length > 0 && (
                <p className="text-xs text-amber-400">{connectorIds.length} connecteur(s) sélectionné(s)</p>
              )}
            </div>
          )}

          {/* ── Step: Prompt ──────────────────────────────────────────── */}
          {step === 'prompt' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Définissez comment l'IA doit analyser vos sources de données.
              </p>

              {/* Mode selector */}
              <div className="grid grid-cols-2 gap-3">
                {(['manual', 'ai_auto'] as WatchPromptMode[]).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setPromptMode(mode)}
                    className={cn(
                      'rounded-xl border p-4 text-left transition-all',
                      promptMode === mode
                        ? 'border-amber-600/50 bg-amber-900/20'
                        : 'border-gray-700 bg-gray-900 hover:border-gray-600',
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {mode === 'ai_auto'
                        ? <Wand2 size={16} className="text-purple-400" />
                        : <Lightbulb size={16} className="text-amber-400" />
                      }
                      <span className="text-sm font-semibold text-gray-200">
                        {mode === 'ai_auto' ? 'IA automatique' : 'Prompt manuel'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      {mode === 'ai_auto'
                        ? "L'IA génère automatiquement le meilleur prompt d'analyse pour vos sources. Se régénère si besoin."
                        : "Vous rédigez votre propre prompt d'analyse. Contrôle total sur les questions posées à l'IA."
                      }
                    </p>
                  </button>
                ))}
              </div>

              {/* Prompt area */}
              {promptMode === 'ai_auto' ? (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-400">
                      Instructions supplémentaires (optionnel)
                    </label>
                    <input
                      value={userHint}
                      onChange={e => setUserHint(e.target.value)}
                      placeholder="ex. Se concentrer sur la consommation énergétique…"
                      className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-amber-500/60 focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={handleGeneratePrompt}
                    disabled={generatingPrompt || connectorIds.length === 0}
                    className="flex items-center gap-2 rounded-xl bg-purple-700/30 border border-purple-700/40 text-purple-300 px-4 py-2.5 text-sm font-medium hover:bg-purple-700/50 transition-colors disabled:opacity-40"
                  >
                    {generatingPrompt
                      ? <><Loader2 size={14} className="animate-spin" /> Génération en cours…</>
                      : <><Wand2 size={14} /> Générer le prompt avec l'IA</>
                    }
                  </button>
                  {prompt && (
                    <div className="rounded-xl border border-purple-700/30 bg-purple-950/20 p-3">
                      <p className="text-[11px] text-purple-400 font-medium mb-1.5 flex items-center gap-1">
                        <Wand2 size={10} /> Prompt généré (modifiable)
                      </p>
                      <textarea
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                        rows={6}
                        className="w-full resize-y rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-2.5 text-sm text-gray-200 focus:border-amber-500/60 focus:outline-none"
                      />
                    </div>
                  )}
                  {!prompt && (
                    <p className="text-xs text-gray-500 italic text-center py-2">
                      Cliquez "Générer" pour créer automatiquement le prompt → il sera visible et modifiable ici.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-400">
                      Prompt d'analyse * <span className="text-gray-600">(min. 10 caractères)</span>
                    </label>
                    <textarea
                      value={prompt}
                      onChange={e => setPrompt(e.target.value)}
                      rows={8}
                      placeholder={`Exemple :
Analyse l'état de ces connecteurs et identifie les 3 meilleures
corrections à apporter. Pour chaque problème détecté, indique :
- Sa sévérité (critique, élevée, moyenne, faible)
- L'action corrective recommandée  
- L'impact estimé de la correction
Concentre-toi sur les échecs récents, les temps de réponse anormaux
et les anomalies de comportement.`}
                      className="w-full resize-y rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-gray-100 placeholder-gray-600 focus:border-amber-500/60 focus:outline-none font-mono leading-relaxed"
                    />
                    <p className="mt-1 text-[11px] text-gray-600">{prompt.length} caractères</p>
                  </div>
                </div>
              )}

              {/* Optional system prompt override */}
              <details className="group">
                <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-400 flex items-center gap-1 select-none">
                  <ChevronRight size={12} className="group-open:rotate-90 transition-transform" />
                  Prompt système personnalisé (avancé)
                </summary>
                <div className="mt-2">
                  <textarea
                    value={systemPrompt}
                    onChange={e => setSysPrompt(e.target.value)}
                    rows={4}
                    placeholder="Laissez vide pour utiliser le prompt système EyeFlow par défaut…"
                    className="w-full resize-y rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-xs text-gray-300 placeholder-gray-600 focus:border-gray-500 focus:outline-none font-mono"
                  />
                </div>
              </details>
            </div>
          )}

          {/* ── Step: Schedule ────────────────────────────────────────── */}
          {step === 'schedule' && (
            <div className="space-y-5">
              <p className="text-sm text-gray-400">
                Configurez la fréquence d'exécution. Le <em>jitter</em> introduit
                une variation aléatoire pour éviter que toutes les règles démarrent
                exactement en même temps.
              </p>

              {/* Interval presets */}
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-400">Intervalle d'exécution</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {INTERVAL_PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setInterval(p.value)}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                        intervalMinutes === p.value
                          ? 'border-amber-600/60 bg-amber-900/30 text-amber-300'
                          : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600',
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={10080}
                    value={intervalMinutes}
                    onChange={e => setInterval(Number(e.target.value))}
                    className="w-24 rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-amber-500/60 focus:outline-none"
                  />
                  <span className="text-sm text-gray-500">minutes</span>
                </div>
              </div>

              {/* Jitter */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-400">Variation aléatoire (jitter)</label>
                  <span className="text-xs text-amber-400 font-mono">±{jitterPercent}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={5}
                  value={jitterPercent}
                  onChange={e => setJitter(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
                <p className="mt-1 text-xs text-gray-600">
                  Délai réel ≈ {Math.round(intervalMinutes * (1 - jitterPercent/100))}–{Math.round(intervalMinutes * (1 + jitterPercent/100))} minutes
                </p>
              </div>

              {/* Max suggestions + min confidence */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Suggestions max / exécution</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={maxSuggestions}
                    onChange={e => setMaxSugg(Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-amber-500/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Confiance minimale (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={minConfidence}
                    onChange={e => setMinConf(Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-amber-500/60 focus:outline-none"
                  />
                </div>
              </div>

              {/* Enabled toggle */}
              <div className="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-900 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-200">Activer immédiatement</p>
                  <p className="text-xs text-gray-500">Cette règle sera planifiée dès l'enregistrement</p>
                </div>
                <button
                  onClick={() => setEnabled(v => !v)}
                  className={cn(
                    'transition-colors',
                    enabled ? 'text-amber-400' : 'text-gray-600',
                  )}
                >
                  {enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                </button>
              </div>

              {/* Summary */}
              <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4 text-xs text-gray-400 space-y-1">
                <p className="font-semibold text-gray-300 mb-2">Résumé</p>
                <p>📡 {connectorIds.length} source(s) surveillée(s)</p>
                <p>🤖 Mode prompt : {promptMode === 'ai_auto' ? 'IA auto' : 'Manuel'}</p>
                <p>⏱ Toutes les ~{intervalMinutes} minutes (±{jitterPercent}%)</p>
                <p>🎯 Max {maxSuggestions} suggestions, confiance ≥ {minConfidence}%</p>
                <p>{enabled ? '✅ Activé' : '⏸ Désactivé'}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-950/20 px-4 py-3 text-sm text-red-300">
              <AlertCircle size={14} />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800 shrink-0">
          <button
            onClick={isLast ? prevStep : onClose}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
          >
            {isLast ? <><ChevronLeft size={14} /> Retour</> : 'Annuler'}
          </button>

          {!isLast && step !== 'identity' && (
            <button
              onClick={prevStep}
              className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            >
              <ChevronLeft size={14} /> Précédent
            </button>
          )}

          <button
            onClick={isLast ? handleSave : nextStep}
            disabled={!canNext() || saving}
            className={cn(
              'flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-colors disabled:opacity-40',
              isLast
                ? 'bg-amber-600 text-white hover:bg-amber-500'
                : 'bg-gray-700 text-gray-200 hover:bg-gray-600',
            )}
          >
            {saving ? (
              <><Loader2 size={14} className="animate-spin" /> Enregistrement…</>
            ) : isLast ? (
              <><Check size={14} /> {isEdit ? 'Enregistrer' : 'Créer la surveillance'}</>
            ) : (
              <>Suivant <ChevronRight size={14} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Watch card (displayed in the watches list) ─────────────────────────────────

const STATUS_STYLES_WATCH: Record<string, string> = {
  idle:    'text-gray-500',
  running: 'text-blue-400 animate-pulse',
  ok:      'text-emerald-400',
  error:   'text-red-400',
};

interface WatchCardProps {
  watch: SuggestionWatch;
  onEdit: (w: SuggestionWatch) => void;
  onDelete: (id: string) => void;
  onTrigger: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  triggering: boolean;
}

export function WatchCard({ watch, onEdit, onDelete, onTrigger, onToggle, triggering }: WatchCardProps) {
  const statusKey = watch.lastRunStatus ?? 'idle';
  return (
    <div className={cn(
      'group rounded-xl border bg-gray-900 p-4 transition-all',
      watch.enabled ? 'border-gray-700' : 'border-gray-800 opacity-75',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Name + status */}
          <div className="flex items-center gap-2 mb-1">
            <Bot size={14} className="text-amber-400 shrink-0" />
            <span className="text-sm font-semibold text-gray-200 truncate">{watch.name}</span>
            {watch.enabled ? (
              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-900/20 border border-emerald-700/30 rounded-full px-1.5">actif</span>
            ) : (
              <span className="text-[10px] text-gray-500 bg-gray-800 border border-gray-700 rounded-full px-1.5">inactif</span>
            )}
          </div>

          {watch.description && (
            <p className="text-xs text-gray-500 mb-2 line-clamp-1">{watch.description}</p>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
            <span className="flex items-center gap-1">
              <Database size={10} />
              {watch.connectorIds.length} source{watch.connectorIds.length !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={10} />
              ~{watch.intervalMinutes}min ±{watch.jitterPercent}%
            </span>
            <span className="flex items-center gap-1">
              {watch.promptMode === 'ai_auto'
                ? <><Wand2 size={10} className="text-purple-400" /> IA auto</>
                : <><Lightbulb size={10} className="text-amber-400" /> Manuel</>
              }
            </span>
            <span className={cn('flex items-center gap-1', STATUS_STYLES_WATCH[statusKey])}>
              <Activity size={10} />
              {statusKey === 'idle' ? 'En attente' :
               statusKey === 'running' ? 'En cours…' :
               statusKey === 'ok'    ? `${watch.lastRunSuggestionsCreated} suggestion(s)` :
               `Erreur`}
            </span>
          </div>

          {watch.nextRunAt && watch.enabled && (
            <p className="mt-1 text-[10px] text-gray-600">
              Prochain run : {new Date(watch.nextRunAt).toLocaleString()}
            </p>
          )}

          {watch.lastError && statusKey === 'error' && (
            <p className="mt-1 text-[10px] text-red-400 line-clamp-1">{watch.lastError}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => onTrigger(watch.id)}
            disabled={triggering || watch.lastRunStatus === 'running'}
            className="p-1.5 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-blue-900/20 transition-colors disabled:opacity-40"
            title="Exécuter maintenant"
          >
            {triggering ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          </button>
          <button
            onClick={() => onToggle(watch.id, !watch.enabled)}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              watch.enabled
                ? 'text-amber-400 hover:text-gray-400 hover:bg-gray-800'
                : 'text-gray-600 hover:text-amber-400 hover:bg-amber-900/20',
            )}
            title={watch.enabled ? 'Désactiver' : 'Activer'}
          >
            {watch.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
          </button>
          <button
            onClick={() => onEdit(watch)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
            title="Modifier"
          >
            <Wand2 size={14} />
          </button>
          <button
            onClick={() => onDelete(watch.id)}
            className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-900/20 transition-colors"
            title="Supprimer"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
