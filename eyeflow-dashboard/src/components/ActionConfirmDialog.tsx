/**
 * ActionConfirmDialog
 *
 * Shown before ANY suggestion action is executed.
 * Displays a visual DAG preview of the execution plan so the user
 * can understand exactly what will happen before confirming.
 *
 * "Chaque action génère un DAG même si elle est instantanée." — every
 * action goes through this confirmation flow, no exceptions.
 */

import { useState, useEffect } from 'react';
import {
  X, AlertTriangle, CheckCircle2, RefreshCw, Loader2,
  Bot, Zap, Settings, Bell, Search, Play, Calendar,
  GitBranch, Shield, ChevronRight, Eye, Lock, Unlock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { suggestionsApi } from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionStepKind =
  | 'ai' | 'compile' | 'validate' | 'deploy'
  | 'config' | 'notify' | 'query' | 'execute' | 'approve';

export interface ActionPlanStep {
  id: string;
  label: string;
  description: string;
  kind: ActionStepKind;
  estimatedDuration: string;
  isGate?: boolean;
}

export interface ActionPlan {
  suggestionId: string;
  actionType: string;
  label: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  isReversible: boolean;
  requiresApproval: boolean;
  steps: ActionPlanStep[];
  impactSummary: string;
  warnings: string[];
  payload: Record<string, unknown>;
}

interface ActionConfirmDialogProps {
  suggestionId: string;
  suggestionTitle: string;
  onConfirmed: (comment: string) => Promise<void>;
  onClose: () => void;
}

// ── Style maps ────────────────────────────────────────────────────────────────

const ACTION_TYPE_META: Record<string, { label: string; Icon: React.ElementType; color: string; bg: string; border: string }> = {
  INVESTIGATE:    { label: 'Investigation',    Icon: Search,    color: 'text-blue-400',    bg: 'bg-blue-900/20',    border: 'border-blue-700/30'    },
  NOTIFY:         { label: 'Notification',     Icon: Bell,      color: 'text-cyan-400',    bg: 'bg-cyan-900/20',    border: 'border-cyan-700/30'    },
  UPDATE_CONFIG:  { label: 'Config',           Icon: Settings,  color: 'text-amber-400',   bg: 'bg-amber-900/20',   border: 'border-amber-700/30'   },
  EXECUTE_ACTION: { label: 'Exécution directe', Icon: Play,     color: 'text-orange-400',  bg: 'bg-orange-900/20',  border: 'border-orange-700/30'  },
  CREATE_RULE:    { label: 'Règle IA',         Icon: Zap,       color: 'text-purple-400',  bg: 'bg-purple-900/20',  border: 'border-purple-700/30'  },
  SCHEDULE:       { label: 'Planification',    Icon: Calendar,  color: 'text-teal-400',    bg: 'bg-teal-900/20',    border: 'border-teal-700/30'    },
};

const RISK_META: Record<string, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  low:      { label: 'Risque faible',    color: 'text-emerald-400', bg: 'bg-emerald-900/10', border: 'border-emerald-700/20', Icon: CheckCircle2    },
  medium:   { label: 'Risque modéré',   color: 'text-amber-400',   bg: 'bg-amber-900/10',   border: 'border-amber-700/20',   Icon: AlertTriangle   },
  high:     { label: 'Risque élevé',    color: 'text-orange-400',  bg: 'bg-orange-900/10',  border: 'border-orange-700/20',  Icon: AlertTriangle   },
  critical: { label: 'Risque critique', color: 'text-red-400',     bg: 'bg-red-900/10',     border: 'border-red-700/30',     Icon: AlertTriangle   },
};

const STEP_KIND_META: Record<ActionStepKind, { Icon: React.ElementType; color: string; bg: string }> = {
  ai:       { Icon: Bot,          color: 'text-purple-400', bg: 'bg-purple-900/30' },
  compile:  { Icon: GitBranch,    color: 'text-blue-400',   bg: 'bg-blue-900/20'   },
  validate: { Icon: CheckCircle2, color: 'text-emerald-400',bg: 'bg-emerald-900/20'},
  deploy:   { Icon: RefreshCw,    color: 'text-cyan-400',   bg: 'bg-cyan-900/20'   },
  config:   { Icon: Settings,     color: 'text-amber-400',  bg: 'bg-amber-900/20'  },
  notify:   { Icon: Bell,         color: 'text-cyan-400',   bg: 'bg-cyan-900/20'   },
  query:    { Icon: Search,       color: 'text-blue-400',   bg: 'bg-blue-900/20'   },
  execute:  { Icon: Play,         color: 'text-orange-400', bg: 'bg-orange-900/20' },
  approve:  { Icon: Lock,         color: 'text-amber-400',  bg: 'bg-amber-900/20'  },
};

// ── Step node ─────────────────────────────────────────────────────────────────

function StepNode({ step, index, total }: { step: ActionPlanStep; index: number; total: number }) {
  const meta = STEP_KIND_META[step.kind] ?? STEP_KIND_META.execute;
  const { Icon } = meta;
  const isLast = index === total - 1;

  return (
    <div className="flex items-start gap-0">
      {/* Vertical spine */}
      <div className="flex flex-col items-center mr-3 shrink-0">
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-full border', meta.bg, `border-${meta.color.replace('text-','').split('-')[0]}-700/30`)}>
          {step.isGate
            ? <Lock size={13} className="text-amber-400" />
            : <Icon size={13} className={meta.color} />
          }
        </div>
        {!isLast && <div className="w-px h-6 bg-gray-700 my-0.5" />}
      </div>

      {/* Content */}
      <div className={cn('pb-4 flex-1', isLast && 'pb-0')}>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-semibold text-gray-200">{step.label}</span>
          {step.isGate && (
            <span className="rounded-full border border-amber-700/30 bg-amber-900/20 px-1.5 py-0 text-[10px] font-medium text-amber-400 flex items-center gap-0.5">
              <Lock size={8} /> Approbation requise
            </span>
          )}
          <span className="ml-auto text-[10px] text-gray-600 shrink-0">{step.estimatedDuration}</span>
        </div>
        <p className="text-[11px] text-gray-500 leading-relaxed">{step.description}</p>
      </div>
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export function ActionConfirmDialog({
  suggestionId,
  suggestionTitle,
  onConfirmed,
  onClose,
}: ActionConfirmDialogProps) {
  const [plan,        setPlan]        = useState<ActionPlan | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [comment,     setComment]     = useState('');
  const [executing,   setExecuting]   = useState(false);
  const [confirmed,   setConfirmed]   = useState(false);

  // Load action plan on mount
  useEffect(() => {
    setLoading(true);
    suggestionsApi.actionPlan(suggestionId)
      .then(r => setPlan(r.data))
      .catch(e => setError(e instanceof Error ? e.message : 'Impossible de charger le plan d\'action'))
      .finally(() => setLoading(false));
  }, [suggestionId]);

  const handleConfirm = async () => {
    setExecuting(true);
    try {
      await onConfirmed(comment);
      setConfirmed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'exécution');
    } finally {
      setExecuting(false);
    }
  };

  const typeMeta  = plan ? (ACTION_TYPE_META[plan.actionType] ?? ACTION_TYPE_META['INVESTIGATE']) : null;
  const riskMeta  = plan ? (RISK_META[plan.riskLevel] ?? RISK_META['low']) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl border border-gray-700 bg-gray-950 shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <div className="flex items-start gap-3">
            {typeMeta && (
              <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border', typeMeta.bg, typeMeta.border)}>
                <typeMeta.Icon size={16} className={typeMeta.color} />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-bold text-gray-100">Confirmation requise</span>
                {typeMeta && (
                  <span className={cn('rounded-full border px-2 py-0 text-[10px] font-semibold uppercase tracking-wide', typeMeta.bg, typeMeta.border, typeMeta.color)}>
                    {typeMeta.label}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 line-clamp-2">{suggestionTitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 text-gray-600 hover:text-gray-400 ml-2">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Chargement du plan d'exécution…</span>
            </div>
          ) : error && !plan ? (
            <div className="flex items-center gap-2 m-6 rounded-xl border border-red-700/30 bg-red-900/10 px-4 py-3 text-sm text-red-400">
              <AlertTriangle size={15} /> {error}
            </div>
          ) : plan ? (
            <div className="px-6 py-4 space-y-5">

              {/* Impact summary */}
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Ce qui va se passer</p>
                <p className="text-sm text-gray-200">{plan.description}</p>
                <p className="mt-1 text-xs text-gray-400">{plan.impactSummary}</p>
              </div>

              {/* Risk + reversibility badges */}
              <div className="flex flex-wrap gap-2">
                {riskMeta && (
                  <span className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium', riskMeta.bg, riskMeta.border, riskMeta.color)}>
                    <riskMeta.Icon size={12} /> {riskMeta.label}
                  </span>
                )}
                <span className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium',
                  plan.isReversible
                    ? 'bg-emerald-900/10 border-emerald-700/20 text-emerald-400'
                    : 'bg-red-900/10 border-red-700/20 text-red-400',
                )}>
                  {plan.isReversible ? <Unlock size={12} /> : <Lock size={12} />}
                  {plan.isReversible ? 'Réversible' : 'Irréversible'}
                </span>
                {plan.requiresApproval && (
                  <span className="flex items-center gap-1.5 rounded-lg border border-amber-700/30 bg-amber-900/10 px-3 py-1.5 text-xs font-medium text-amber-400">
                    <Eye size={12} /> Approbation requise avant activation
                  </span>
                )}
              </div>

              {/* Warnings */}
              {plan.warnings.length > 0 && (
                <div className="rounded-xl border border-amber-700/30 bg-amber-900/10 px-4 py-3 space-y-1">
                  {plan.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-amber-300">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      {w}
                    </div>
                  ))}
                </div>
              )}

              {/* DAG Steps */}
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Étapes d'exécution ({plan.steps.length})
                </p>
                <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-4">
                  {plan.steps.map((step, i) => (
                    <StepNode key={step.id} step={step} index={i} total={plan.steps.length} />
                  ))}
                </div>
              </div>

              {/* Payload details (collapsed) */}
              {Object.keys(plan.payload).length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer flex items-center gap-1.5 text-gray-500 hover:text-gray-300 select-none">
                    <ChevronRight size={12} className="transition-transform [[open]_&]:rotate-90" />
                    Détails du payload
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded-lg border border-gray-800 bg-gray-900 p-3 text-[11px] text-gray-400 font-mono leading-relaxed">
                    {JSON.stringify(plan.payload, null, 2)}
                  </pre>
                </details>
              )}

              {/* Comment */}
              <div>
                <label className="mb-1 block text-xs text-gray-400">
                  Commentaire de confirmation (optionnel)
                </label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={2}
                  placeholder="Précisez pourquoi vous confirmez cette action…"
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-red-700/30 bg-red-900/10 px-3 py-2 text-xs text-red-400">
                  <AlertTriangle size={13} /> {error}
                </div>
              )}
            </div>
          ) : null}

          {/* Success state */}
          {confirmed && (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-900/20 border border-emerald-700/30">
                <CheckCircle2 size={24} className="text-emerald-400" />
              </div>
              <p className="text-sm font-semibold text-gray-100">Action confirmée et enregistrée</p>
              <p className="text-xs text-gray-400">L'exécution a été lancée selon le plan affiché.</p>
              <button onClick={onClose} className="mt-2 rounded-xl bg-gray-800 hover:bg-gray-700 px-4 py-2 text-sm text-gray-300 transition-colors">
                Fermer
              </button>
            </div>
          )}
        </div>

        {/* Footer — hidden when confirmed or no plan */}
        {!confirmed && plan && !loading && (
          <div className="border-t border-gray-800 px-6 py-4 flex items-center justify-between shrink-0">
            <p className="text-[11px] text-gray-600 max-w-xs">
              En confirmant, vous autorisez l'exécution du plan ci-dessus en votre nom.
            </p>
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:bg-gray-800 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirm}
                disabled={executing}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50',
                  plan.riskLevel === 'critical' || plan.riskLevel === 'high'
                    ? 'bg-orange-700 hover:bg-orange-600'
                    : 'bg-emerald-700 hover:bg-emerald-600',
                )}
              >
                {executing
                  ? <><Loader2 size={14} className="animate-spin" /> Exécution…</>
                  : <><Play size={14} /> Je confirme et j'exécute</>
                }
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
