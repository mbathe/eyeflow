/**
 * WatchDialog
 *
 * Create or edit a SuggestionWatch — a scheduled rule that periodically
 * analyses one or more data-source connectors with an LLM and generates
 * suggestions.
 *
 * Modes:
 *  - manual   → user writes the analysis prompt himself
 *  - ai_auto  → user provides a short intent hint; the API generates the
 *               best prompt for the selected connectors
 */

import { useState, useEffect, useCallback } from 'react';
import {
  X, Plug2, Sparkles, Clock, Sliders, Bot, ChevronRight,
  Loader2, CheckCircle2, AlertTriangle, RefreshCw, Info,
  ToggleLeft, ToggleRight, Wand2, Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { connectorsApi, suggestionWatchesApi } from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Connector {
  id: string;
  name: string;
  type: string;
}

export interface SuggestionWatch {
  id: string;
  name: string;
  description?: string;
  connectorIds: string[];
  promptMode: 'manual' | 'ai_auto';
  prompt: string;
  systemPrompt?: string;
  intervalMinutes: number;
  jitterPercent: number;
  enabled: boolean;
  maxSuggestionsPerRun: number;
  minConfidence: number;
  lastRunStatus: 'idle' | 'running' | 'ok' | 'error';
  lastRunAt?: string;
  nextRunAt?: string;
  lastRunSuggestionsCreated: number;
  totalRuns: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

interface WatchDialogProps {
  watch?: SuggestionWatch | null;   // null = create mode
  onSaved: (w: SuggestionWatch) => void;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONNECTOR_TYPE_COLORS: Record<string, string> = {
  mqtt:     'text-orange-400 bg-orange-900/20 border-orange-700/30',
  http:     'text-blue-400 bg-blue-900/20 border-blue-700/30',
  postgres: 'text-cyan-400 bg-cyan-900/20 border-cyan-700/30',
  mysql:    'text-teal-400 bg-teal-900/20 border-teal-700/30',
  redis:    'text-red-400 bg-red-900/20 border-red-700/30',
  kafka:    'text-purple-400 bg-purple-900/20 border-purple-700/30',
  file:     'text-gray-400 bg-gray-800 border-gray-700',
};

function connectorColor(type: string) {
  return CONNECTOR_TYPE_COLORS[type?.toLowerCase()] ?? 'text-gray-400 bg-gray-800 border-gray-700';
}

/** Format minutes to human-readable string */
function fmtInterval(m: number) {
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${(m / 60).toFixed(1).replace(/\.0$/, '')} h`;
  return `${(m / 1440).toFixed(1).replace(/\.0$/, '')} j`;
}

const INTERVAL_PRESETS = [
  { label: '5 min',  min: 5 },
  { label: '10 min', min: 10 },
  { label: '30 min', min: 30 },
  { label: '1 h',    min: 60 },
  { label: '6 h',    min: 360 },
  { label: '24 h',   min: 1440 },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={14} className="text-gray-500" />
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</span>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-xs text-gray-400">
        {label}
        {hint && (
          <span className="group relative cursor-help">
            <Info size={11} className="text-gray-600" />
            <span className="absolute left-4 top-0 z-10 w-48 rounded-lg border border-gray-700 bg-gray-900 px-2 py-1.5 text-[11px] text-gray-300 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {hint}
            </span>
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export function WatchDialog({ watch, onSaved, onClose }: WatchDialogProps) {
  const isEdit = !!watch;

  // ── Form state ───────────────────────────────────────────────────────────
  const [name,           setName]           = useState(watch?.name ?? '');
  const [description,    setDescription]    = useState(watch?.description ?? '');
  const [connectorIds,   setConnectorIds]   = useState<string[]>(watch?.connectorIds ?? []);
  const [promptMode,     setPromptMode]     = useState<'manual' | 'ai_auto'>(watch?.promptMode ?? 'ai_auto');
  const [prompt,         setPrompt]         = useState(watch?.prompt ?? '');
  const [userHint,       setUserHint]       = useState('');
  const [intervalMin,    setIntervalMin]    = useState(watch?.intervalMinutes ?? 30);
  const [jitter,         setJitter]         = useState(watch?.jitterPercent ?? 20);
  const [enabled,        setEnabled]        = useState(watch?.enabled ?? true);
  const [maxSuggestions, setMaxSuggestions] = useState(watch?.maxSuggestionsPerRun ?? 5);
  const [minConfidence,  setMinConfidence]  = useState(watch?.minConfidence ?? 50);

  // ── Async state ──────────────────────────────────────────────────────────
  const [connectors,      setConnectors]      = useState<Connector[]>([]);
  const [loadingConn,     setLoadingConn]     = useState(true);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [promptGenerated,  setPromptGenerated]  = useState(false);
  const [saving,           setSaving]           = useState(false);
  const [error,            setError]            = useState('');
  const [tab,              setTab]              = useState<'data' | 'prompt' | 'schedule' | 'tuning'>('data');

  // ── Load connectors ──────────────────────────────────────────────────────
  useEffect(() => {
    setLoadingConn(true);
    connectorsApi.list().then(r => {
      setConnectors(r.data.data ?? r.data);
    }).catch(console.error).finally(() => setLoadingConn(false));
  }, []);

  const toggleConnector = (id: string) => {
    setConnectorIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // ── Generate prompt via AI ────────────────────────────────────────────────
  const handleGeneratePrompt = useCallback(async () => {
    if (connectorIds.length === 0) return;
    setGeneratingPrompt(true);
    setPromptGenerated(false);
    try {
      const r = await suggestionWatchesApi.generatePrompt(connectorIds, userHint || undefined);
      setPrompt(r.data.prompt ?? r.data);
      setPromptGenerated(true);
      setTab('prompt');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur génération prompt');
    } finally {
      setGeneratingPrompt(false);
    }
  }, [connectorIds, userHint]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim() || connectorIds.length === 0 || !prompt.trim()) return;
    setSaving(true);
    setError('');
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      connectorIds,
      promptMode,
      prompt,
      intervalMinutes: intervalMin,
      jitterPercent: jitter,
      enabled,
      maxSuggestionsPerRun: maxSuggestions,
      minConfidence,
    };
    try {
      const r = isEdit
        ? await suggestionWatchesApi.update(watch!.id, payload)
        : await suggestionWatchesApi.create(payload);
      onSaved(r.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const canSave = name.trim() && connectorIds.length > 0 && prompt.trim();

  const TABS = [
    { key: 'data',     label: 'Sources',   icon: Plug2 },
    { key: 'prompt',   label: 'Prompt',    icon: Bot },
    { key: 'schedule', label: 'Planif.',   icon: Clock },
    { key: 'tuning',   label: 'Réglages',  icon: Sliders },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-700 bg-gray-950 shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-900/30 border border-purple-700/30">
              <Clock size={15} className="text-purple-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-100">
                {isEdit ? `Modifier « ${watch!.name} »` : 'Nouvelle surveillance automatique'}
              </h2>
              <p className="text-[11px] text-gray-500">
                Analyse périodique d'une ou plusieurs sources de données
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Step tabs */}
        <div className="flex border-b border-gray-800 shrink-0 px-2">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors',
                tab === key
                  ? 'border-purple-500 text-gray-100'
                  : 'border-transparent text-gray-500 hover:text-gray-300',
              )}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Name (always visible) */}
          <div className="mb-5">
            <Field label="Nom de la surveillance *">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Monitor santé MQTT broker"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
              />
            </Field>
          </div>

          {/* ── Tab: Sources ──────────────────────────────────────────────── */}
          {tab === 'data' && (
            <div className="space-y-4">
              <SectionTitle icon={Plug2} label="Sources de données" />
              <Field label="Sélectionnez les connecteurs à surveiller *">
                {loadingConn ? (
                  <div className="flex items-center gap-2 py-4 text-gray-500 text-xs">
                    <Loader2 size={14} className="animate-spin" /> Chargement…
                  </div>
                ) : connectors.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-700 p-4 text-center text-xs text-gray-500">
                    Aucun connecteur disponible.<br />
                    <a href="/connectors" className="text-blue-400 hover:underline">Créer un connecteur →</a>
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {connectors.map(c => {
                      const selected = connectorIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          onClick={() => toggleConnector(c.id)}
                          className={cn(
                            'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all',
                            selected
                              ? 'border-purple-600/60 bg-purple-900/20 ring-1 ring-purple-500/30'
                              : 'border-gray-700 bg-gray-900 hover:border-gray-600',
                          )}
                        >
                          <span className={cn('shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase', connectorColor(c.type))}>
                            {c.type}
                          </span>
                          <span className={cn('flex-1 text-xs font-medium truncate', selected ? 'text-gray-100' : 'text-gray-300')}>
                            {c.name}
                          </span>
                          {selected && <CheckCircle2 size={13} className="shrink-0 text-purple-400" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Field>

              {connectorIds.length > 0 && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500">
                  <CheckCircle2 size={11} className="text-purple-400" />
                  {connectorIds.length} source{connectorIds.length > 1 ? 's' : ''} sélectionnée{connectorIds.length > 1 ? 's' : ''}
                </div>
              )}

              {/* AI hint for auto-generation */}
              <div className="mt-5 rounded-xl border border-purple-800/40 bg-purple-950/20 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Wand2 size={13} className="text-purple-400" />
                  <span className="text-xs font-semibold text-purple-300">Génération automatique du prompt</span>
                </div>
                <p className="text-[11px] text-gray-500 mb-3">
                  Décrivez brièvement ce que vous voulez surveiller et l'IA génèrera le meilleur prompt pour analyser ces sources de données.
                </p>
                <textarea
                  value={userHint}
                  onChange={e => setUserHint(e.target.value)}
                  rows={2}
                  placeholder="Ex: Je veux détecter les anomalies de débit et proposer des corrections automatiques…"
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
                />
                <button
                  onClick={handleGeneratePrompt}
                  disabled={connectorIds.length === 0 || generatingPrompt}
                  className="mt-2 flex items-center gap-2 rounded-lg bg-purple-700/40 border border-purple-600/40 hover:bg-purple-700/60 px-3 py-1.5 text-xs font-medium text-purple-300 transition-colors disabled:opacity-40"
                >
                  {generatingPrompt
                    ? <><Loader2 size={12} className="animate-spin" /> Génération en cours…</>
                    : <><Sparkles size={12} /> Générer le prompt avec l'IA</>
                  }
                </button>
                {promptGenerated && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-emerald-400">
                    <CheckCircle2 size={10} /> Prompt généré — consultez l'onglet «&nbsp;Prompt&nbsp;»
                  </p>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setTab('prompt')}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Suivant : Prompt <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}

          {/* ── Tab: Prompt ────────────────────────────────────────────────── */}
          {tab === 'prompt' && (
            <div className="space-y-4">
              <SectionTitle icon={Bot} label="Prompt d'analyse" />

              {/* Mode selector */}
              <div className="flex gap-2">
                {(['ai_auto', 'manual'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setPromptMode(m)}
                    className={cn(
                      'flex-1 rounded-xl border px-3 py-3 text-left transition-all',
                      promptMode === m
                        ? 'border-purple-600/60 bg-purple-900/20 ring-1 ring-purple-500/30'
                        : 'border-gray-700 bg-gray-900 hover:border-gray-600',
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {m === 'ai_auto' ? <Sparkles size={13} className="text-purple-400" /> : <Bot size={13} className="text-gray-400" />}
                      <span className={cn('text-xs font-semibold', promptMode === m ? 'text-gray-100' : 'text-gray-400')}>
                        {m === 'ai_auto' ? 'IA auto (recommandé)' : 'Prompt manuel'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500">
                      {m === 'ai_auto'
                        ? "Le prompt est régénéré à chaque run pour s'adapter au contexte actuel de vos données."
                        : "Vous écrivez un prompt fixe utilisé à chaque exécution."}
                    </p>
                  </button>
                ))}
              </div>

              {/* Prompt textarea */}
              <Field
                label={promptMode === 'ai_auto' ? 'Prompt initial (sera enrichi à chaque run) *' : 'Prompt d\'analyse *'}
                hint="Ce texte est envoyé comme message utilisateur au LLM. Soyez précis sur ce que vous voulez analyser et le format de réponse attendu."
              >
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  rows={8}
                  placeholder={`Ex: Analyse les données de ce capteur MQTT et propose les 3 meilleures actions correctives.\n\nPour chaque suggestion :\n- Titre court et actionnable\n- Impact estimé\n- Niveau de priorité (critical/high/medium/low)\n- Niveau de confiance (0-100)`}
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-mono leading-relaxed text-gray-200 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
                />
              </Field>

              {/* Optional system prompt */}
              <Field
                label="System prompt personnalisé (optionnel)"
                hint="Remplace le system prompt global de l'engine. Laissez vide pour utiliser le prompt système par défaut."
              >
                <textarea
                  value={undefined}
                  onChange={() => {}}
                  rows={3}
                  placeholder="Optionnel — laissez vide pour utiliser le system prompt par défaut du moteur IA."
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-mono text-gray-200 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
                />
              </Field>

              <div className="flex justify-between">
                <button onClick={() => setTab('data')} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">← Sources</button>
                <button onClick={() => setTab('schedule')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors">
                  Suivant : Planification <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}

          {/* ── Tab: Schedule ─────────────────────────────────────────────── */}
          {tab === 'schedule' && (
            <div className="space-y-5">
              <SectionTitle icon={Clock} label="Planification" />

              {/* Interval presets */}
              <Field label="Intervalle d'exécution *" hint={`Délai nominal entre deux analyses. Valeur actuelle : ${fmtInterval(intervalMin)}`}>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {INTERVAL_PRESETS.map(p => (
                    <button
                      key={p.min}
                      onClick={() => setIntervalMin(p.min)}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                        intervalMin === p.min
                          ? 'border-purple-600/60 bg-purple-900/20 text-purple-300'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600',
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    ou
                    <input
                      type="number"
                      min={1}
                      max={10080}
                      value={intervalMin}
                      onChange={e => setIntervalMin(Math.max(1, Number(e.target.value)))}
                      className="w-16 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 focus:border-purple-500 focus:outline-none"
                    />
                    min
                  </span>
                </div>
              </Field>

              {/* Jitter */}
              <Field
                label={`Variation aléatoire (jitter) : ${jitter}%`}
                hint={`Ajoute ±${jitter}% de randomisation à l'intervalle pour éviter les pics de charge simultanés. Avec ${intervalMin} min + ${jitter}% de jitter → délai réel entre ${Math.round(intervalMin*(1-jitter/100))} et ${Math.round(intervalMin*(1+jitter/100))} min.`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0} max={50} step={5}
                    value={jitter}
                    onChange={e => setJitter(Number(e.target.value))}
                    className="flex-1 accent-purple-500"
                  />
                  <span className="w-10 text-right text-xs tabular-nums text-gray-300">{jitter}%</span>
                </div>
                <p className="mt-1.5 text-[11px] text-gray-600">
                  Recommandé si vous avez plusieurs surveillances avec le même intervalle.
                </p>
              </Field>

              {/* Effective interval display */}
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-xs text-gray-400">
                <div className="flex items-center gap-2 mb-1.5">
                  <Info size={12} className="text-gray-600" />
                  <span className="font-medium text-gray-300">Délai réel calculé</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-base font-bold text-gray-200">{fmtInterval(Math.round(intervalMin*(1-jitter/100)))}</div>
                    <div className="text-gray-600">minimum</div>
                  </div>
                  <div>
                    <div className="text-base font-bold text-purple-300">{fmtInterval(intervalMin)}</div>
                    <div className="text-gray-600">nominal</div>
                  </div>
                  <div>
                    <div className="text-base font-bold text-gray-200">{fmtInterval(Math.round(intervalMin*(1+jitter/100)))}</div>
                    <div className="text-gray-600">maximum</div>
                  </div>
                </div>
              </div>

              {/* Enable toggle */}
              <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-200">Surveillance active</p>
                  <p className="text-[11px] text-gray-500">Démarrer l'exécution automatique après la création</p>
                </div>
                <button
                  onClick={() => setEnabled(v => !v)}
                  className={cn('transition-colors', enabled ? 'text-emerald-400' : 'text-gray-600')}
                >
                  {enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                </button>
              </div>

              <div className="flex justify-between">
                <button onClick={() => setTab('prompt')} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">← Prompt</button>
                <button onClick={() => setTab('tuning')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors">
                  Suivant : Réglages <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}

          {/* ── Tab: Tuning ───────────────────────────────────────────────── */}
          {tab === 'tuning' && (
            <div className="space-y-5">
              <SectionTitle icon={Sliders} label="Paramètres d'analyse" />

              <Field
                label={`Suggestions max par analyse : ${maxSuggestions}`}
                hint="Nombre maximum de suggestions que le LLM peut générer en un seul run."
              >
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={1} max={20} step={1}
                    value={maxSuggestions}
                    onChange={e => setMaxSuggestions(Number(e.target.value))}
                    className="flex-1 accent-purple-500"
                  />
                  <span className="w-8 text-right text-xs tabular-nums text-gray-300">{maxSuggestions}</span>
                </div>
              </Field>

              <Field
                label={`Confiance minimale : ${minConfidence}%`}
                hint="Les suggestions avec une confiance IA inférieure à ce seuil sont automatiquement filtrées et non enregistrées."
              >
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={0} max={100} step={5}
                    value={minConfidence}
                    onChange={e => setMinConfidence(Number(e.target.value))}
                    className="flex-1 accent-purple-500"
                  />
                  <span className="w-10 text-right text-xs tabular-nums text-gray-300">{minConfidence}%</span>
                </div>
                <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-gray-800">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500 transition-all"
                    style={{ width: `${minConfidence}%` }}
                  />
                </div>
              </Field>

              <Field label="Description (optionnel)">
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Notes internes sur l'objectif de cette surveillance…"
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
                />
              </Field>

              <div className="flex justify-start">
                <button onClick={() => setTab('schedule')} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">← Planification</button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-950/20 px-3 py-2 text-xs text-red-400">
              <AlertTriangle size={13} />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-gray-600">
            {connectorIds.length === 0 && <span className="text-amber-500">↑ Sélectionnez au moins 1 source</span>}
            {connectorIds.length > 0 && !prompt.trim() && <span className="text-amber-500">↑ Ajoutez un prompt d'analyse</span>}
            {canSave && <span className="text-emerald-400">✓ Prêt à sauvegarder</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:bg-gray-800 transition-colors">
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="flex items-center gap-2 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-40 px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? 'Enregistrer' : 'Créer la surveillance'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Watch card (list item) ─────────────────────────────────────────────────────

interface WatchCardProps {
  watch: SuggestionWatch;
  connectors: Connector[];
  onEdit: (w: SuggestionWatch) => void;
  onDelete: (id: string) => void;
  onTrigger: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  triggering: string | null;
}

const STATUS_ICON = {
  idle:    { Icon: Clock,         color: 'text-gray-500' },
  running: { Icon: Loader2,       color: 'text-purple-400' },
  ok:      { Icon: CheckCircle2,  color: 'text-emerald-400' },
  error:   { Icon: AlertTriangle, color: 'text-red-400' },
};

export function WatchCard({ watch, connectors, onEdit, onDelete, onTrigger, onToggle, triggering }: WatchCardProps) {
  const [confirm, setConfirm] = useState(false);
  const status = STATUS_ICON[watch.lastRunStatus] ?? STATUS_ICON.idle;
  const linkedConnectors = connectors.filter(c => watch.connectorIds.includes(c.id));

  return (
    <div className={cn(
      'rounded-xl border bg-gray-900 p-4 transition-all',
      watch.enabled ? 'border-gray-700' : 'border-gray-800 opacity-60',
    )}>
      <div className="flex items-start gap-3">
        {/* Status icon */}
        <div className="mt-0.5 shrink-0">
          <status.Icon
            size={16}
            className={cn(status.color, watch.lastRunStatus === 'running' && 'animate-spin')}
          />
        </div>

        <div className="flex-1 min-w-0">
          {/* Name + badges */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-gray-100">{watch.name}</span>
            <span className={cn(
              'text-[10px] font-medium rounded-full px-2 py-0 border',
              watch.enabled
                ? 'text-emerald-400 bg-emerald-900/20 border-emerald-700/30'
                : 'text-gray-500 bg-gray-800 border-gray-700',
            )}>
              {watch.enabled ? 'active' : 'inactive'}
            </span>
            <span className="text-[10px] text-gray-600 bg-gray-800 border border-gray-700 rounded-full px-2">
              {fmtInterval(watch.intervalMinutes)} ±{watch.jitterPercent}%
            </span>
            {watch.promptMode === 'ai_auto' && (
              <span className="text-[10px] font-medium text-purple-400 bg-purple-900/20 border border-purple-700/30 rounded-full px-2 flex items-center gap-0.5">
                <Sparkles size={9} /> IA auto
              </span>
            )}
          </div>

          {/* Description */}
          {watch.description && (
            <p className="text-[11px] text-gray-500 mb-2 line-clamp-1">{watch.description}</p>
          )}

          {/* Connector chips */}
          {linkedConnectors.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {linkedConnectors.map(c => (
                <span key={c.id} className={cn('flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]', connectorColor(c.type))}>
                  <Plug2 size={8} />
                  {c.name}
                </span>
              ))}
            </div>
          )}

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
            {watch.lastRunAt && (
              <span>Dernier run : {new Date(watch.lastRunAt).toLocaleString('fr', { dateStyle: 'short', timeStyle: 'short' })}</span>
            )}
            {watch.nextRunAt && watch.enabled && (
              <span className="text-purple-400">Prochain : {new Date(watch.nextRunAt).toLocaleString('fr', { dateStyle: 'short', timeStyle: 'short' })}</span>
            )}
            {watch.totalRuns > 0 && (
              <span>{watch.totalRuns} run{watch.totalRuns > 1 ? 's' : ''} · {watch.lastRunSuggestionsCreated} suggestion{watch.lastRunSuggestionsCreated > 1 ? 's' : ''} dernier run</span>
            )}
          </div>

          {watch.lastError && (
            <p className="mt-1 text-[11px] text-red-400 line-clamp-1">⚠ {watch.lastError}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onToggle(watch.id, !watch.enabled)}
            className={cn('p-1.5 rounded-lg transition-colors border', watch.enabled ? 'text-emerald-400 border-emerald-700/30 hover:bg-emerald-900/20' : 'text-gray-600 border-gray-700 hover:bg-gray-800')}
            title={watch.enabled ? 'Désactiver' : 'Activer'}
          >
            {watch.enabled ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
          </button>
          <button
            onClick={() => onTrigger(watch.id)}
            disabled={triggering === watch.id}
            className="p-1.5 rounded-lg border border-gray-700 text-gray-500 hover:text-purple-400 hover:border-purple-700/40 transition-colors disabled:opacity-40"
            title="Exécuter maintenant"
          >
            {triggering === watch.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          </button>
          <button
            onClick={() => onEdit(watch)}
            className="p-1.5 rounded-lg border border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-colors"
            title="Modifier"
          >
            <RefreshCw size={14} />
          </button>
          {confirm ? (
            <button onClick={() => onDelete(watch.id)} className="p-1.5 rounded-lg border border-red-700/40 bg-red-900/20 text-red-400 text-[11px] font-medium px-2">
              Confirmer
            </button>
          ) : (
            <button onClick={() => setConfirm(true)} className="p-1.5 rounded-lg border border-gray-700 text-gray-600 hover:text-red-400 hover:border-red-700/30 transition-colors" title="Supprimer">
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
