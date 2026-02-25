import {
  Controller,
  Post,
  Get,
  Put,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { SuggestionEngineService, EngineStatus } from './suggestion-engine.service';
import { SuggestionEngineConfigEntity } from './suggestion-engine-config.entity';
import { SuggestionsService } from './suggestions.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SuggestionEntity } from './suggestion.entity';

// ── Action plan types ─────────────────────────────────────────────────────────

export type ActionStepKind =
  | 'ai'        // LLM call
  | 'compile'   // DAG/rule compilation
  | 'validate'  // validation / dry-run
  | 'deploy'    // deployment
  | 'config'    // configuration update
  | 'notify'    // push notification
  | 'query'     // data query / fetch
  | 'execute'   // direct execution
  | 'approve';  // human approval gate

export interface ActionPlanStep {
  id: string;
  label: string;
  description: string;
  kind: ActionStepKind;
  estimatedDuration: string;
  isGate?: boolean;   // requires human approval before proceeding
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

// ── Step templates per action type ───────────────────────────────────────────

function buildActionPlan(suggestion: SuggestionEntity): ActionPlan {
  const action = suggestion.suggestedAction ?? {};
  const type   = (action['type'] as string | undefined)?.toUpperCase() ?? 'INVESTIGATE';
  const label  = (action['label'] as string | undefined) ?? suggestion.title;
  const payload = (action['payload'] as Record<string, unknown> | undefined) ?? {};

  // Enrich payload with connector info stored at the action root level (from LLM)
  const connectorId   = (action['connectorId']   as string | undefined) ?? (payload['connectorId']   as string | undefined);
  const connectorName = (action['connectorName'] as string | undefined) ?? (payload['connectorName'] as string | undefined);
  const connectorType = (action['connectorType'] as string | undefined) ?? (payload['connectorType'] as string | undefined);

  const targetLabel = connectorName
    ? `"${connectorName}"${connectorType ? ` (${connectorType})` : ''}`
    : (connectorId ? `connecteur ${connectorId}` : 'la cible');

  const mergedPayload: Record<string, unknown> = {
    ...payload,
    ...(connectorId   ? { connectorId }   : {}),
    ...(connectorName ? { connectorName } : {}),
    ...(connectorType ? { connectorType } : {}),
  };

  const planByType: Record<string, Omit<ActionPlan, 'suggestionId' | 'payload'>> = {
    INVESTIGATE: {
      actionType: 'INVESTIGATE',
      label,
      description: 'Analyse approfondie des données pour confirmer la situation.',
      riskLevel: 'low',
      isReversible: true,
      requiresApproval: false,
      impactSummary: 'Lecture seule — aucune modification de données ou de configuration.',
      warnings: [],
      steps: [
        { id: '1', label: 'Collecte des données sources', description: `Lecture des données de ${targetLabel}`, kind: 'query',   estimatedDuration: '~2 s' },
        { id: '2', label: 'Analyse IA',                  description: 'LLM analyse les données collectées',             kind: 'ai',      estimatedDuration: '~5 s' },
        { id: '3', label: 'Génération du rapport',        description: 'Structuration des résultats',                    kind: 'compile', estimatedDuration: '~1 s' },
        { id: '4', label: 'Enregistrement du rapport',    description: 'Sauvegarde des conclusions',                     kind: 'execute', estimatedDuration: 'immédiat' },
      ],
    },

    NOTIFY: {
      actionType: 'NOTIFY',
      label,
      description: 'Envoi d\'une notification aux parties concernées.',
      riskLevel: 'low',
      isReversible: false,
      requiresApproval: false,
      impactSummary: 'Envoi d\'un message — aucune modification système.',
      warnings: ['La notification sera envoyée immédiatement et ne peut pas être rappelée.'],
      steps: [
        { id: '1', label: 'Préparation du message',  description: 'Formatage du contenu de la notification', kind: 'compile', estimatedDuration: '~1 s'    },
        { id: '2', label: 'Envoi de la notification', description: 'Distribution aux destinataires configurés', kind: 'notify',  estimatedDuration: '~2 s'    },
        { id: '3', label: 'Confirmation de réception', description: 'Vérification des accusés de réception',    kind: 'validate', estimatedDuration: '~3 s'   },
      ],
    },

    UPDATE_CONFIG: {
      actionType: 'UPDATE_CONFIG',
      label,
      description: 'Modification d\'un paramètre de configuration du système.',
      riskLevel: 'medium',
      isReversible: true,
      requiresApproval: false,
      impactSummary: 'Modification de configuration — impact immédiat sur le comportement du système.',
      warnings: [
        'La configuration actuelle sera sauvegardée automatiquement avant modification.',
        'Le changement prend effet immédiatement sans redémarrage.',
      ],
      steps: [
        { id: '1', label: 'Sauvegarde config actuelle', description: 'Snapshot de la configuration avant modification', kind: 'query',   estimatedDuration: 'immédiat' },
        { id: '2', label: 'Validation des nouvelles valeurs', description: 'Vérification des contraintes et types',     kind: 'validate', estimatedDuration: '~1 s'    },
        { id: '3', label: 'Application de la modification',   description: 'Écriture de la nouvelle configuration',    kind: 'config',   estimatedDuration: 'immédiat' },
        { id: '4', label: 'Vérification post-modification',   description: 'Test de cohérence de la config appliquée', kind: 'validate', estimatedDuration: '~2 s'    },
      ],
    },

    EXECUTE_ACTION: {
      actionType: 'EXECUTE_ACTION',
      label,
      description: 'Exécution directe d\'une action sur le système.',
      riskLevel: 'high',
      isReversible: false,
      requiresApproval: false,
      impactSummary: 'Action directe sur le système — effet immédiat et potentiellement irréversible.',
      warnings: [
        'Cette action sera exécutée immédiatement après votre confirmation.',
        'Vérifiez l\'impact estimé avant de confirmer.',
      ],
      steps: [
        { id: '1', label: 'Validation pré-exécution',  description: `Vérification des prérequis sur ${targetLabel}`, kind: 'validate', estimatedDuration: '~1 s'    },
        { id: '2', label: "Exécution de l'action",    description: `Application de l'action sur ${targetLabel}`,   kind: 'execute',  estimatedDuration: '~3 s'    },
        { id: '3', label: 'Vérification post-action',  description: 'Contrôle du résultat et de l\'état final',      kind: 'validate', estimatedDuration: '~2 s'    },
        { id: '4', label: 'Journalisation',            description: "Enregistrement de l'action dans l'audit",       kind: 'deploy',   estimatedDuration: 'immédiat' },
      ],
    },

    CREATE_RULE: {
      actionType: 'CREATE_RULE',
      label,
      description: 'Génération et déploiement d\'une règle d\'automatisation IA.',
      riskLevel: 'medium',
      isReversible: true,
      requiresApproval: true,
      impactSummary: 'Une nouvelle règle sera créée et soumise à approbation avant activation.',
      warnings: [
        'La règle générée nécessitera une approbation séparée avant d\'être activée.',
        'Vous pourrez modifier le workflow généré avant de l\'approuver.',
      ],
      steps: [
        { id: '1', label: 'Analyse de l\'intention',        description: 'Interprétation sémantique de la demande par le LLM',      kind: 'ai',      estimatedDuration: '~3 s'    },
        { id: '2', label: 'Génération du workflow',          description: 'Construction du graphe d\'exécution (DAG)',               kind: 'compile', estimatedDuration: '~5 s'    },
        { id: '3', label: 'Validation syntaxique',           description: 'Vérification de la validité et cohérence du DAG',        kind: 'validate', estimatedDuration: '~2 s'   },
        { id: '4', label: 'Soumission pour approbation',     description: 'La règle est créée en état "pending_approval"',          kind: 'approve',  estimatedDuration: 'immédiat', isGate: true },
        { id: '5', label: 'Activation (après approbation)',  description: 'Déploiement et activation sur les agents d\'exécution',   kind: 'deploy',   estimatedDuration: 'après approbation' },
      ],
    },

    SCHEDULE: {
      actionType: 'SCHEDULE',
      label,
      description: 'Planification d\'une tâche récurrente ou différée.',
      riskLevel: 'low',
      isReversible: true,
      requiresApproval: false,
      impactSummary: 'Création d\'une tâche planifiée — aucun effet immédiat sur le système.',
      warnings: [],
      steps: [
        { id: '1', label: 'Validation des paramètres',   description: 'Vérification de l\'expression CRON et des permissions', kind: 'validate', estimatedDuration: '~1 s'    },
        { id: '2', label: 'Création de la tâche',         description: 'Enregistrement dans le planificateur',                 kind: 'compile',  estimatedDuration: 'immédiat' },
        { id: '3', label: 'Activation du planificateur',  description: 'Démarrage du minuteur de la tâche',                    kind: 'deploy',   estimatedDuration: 'immédiat' },
      ],
    },
  };

  const template = planByType[type] ?? planByType['INVESTIGATE'];

  return {
    suggestionId: suggestion.id,
    payload: mergedPayload,
    ...template,
  };
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('suggestions')
export class SuggestionEngineController {
  constructor(
    private readonly engine: SuggestionEngineService,
    private readonly suggestionsService: SuggestionsService,
    @InjectRepository(SuggestionEntity)
    private readonly suggestionRepo: Repository<SuggestionEntity>,
  ) {}

  /** GET /suggestions/engine/status */
  @Get('engine/status')
  getEngineStatus(): EngineStatus & { nextRunInSeconds: number | null } {
    const status = this.engine.getStatus();
    const nextRunInSeconds = status.nextRunAt
      ? Math.max(0, Math.round((status.nextRunAt.getTime() - Date.now()) / 1000))
      : null;
    return { ...status, nextRunInSeconds };
  }

  /** GET /suggestions/engine/config */
  @Get('engine/config')
  getConfig(): SuggestionEngineConfigEntity {
    return this.engine.getConfig();
  }

  /** PUT /suggestions/engine/config — update any/all config fields at runtime */
  @Put('engine/config')
  async updateConfig(
    @Body() body: Partial<Omit<SuggestionEngineConfigEntity, 'id' | 'updatedAt'>>,
  ): Promise<SuggestionEngineConfigEntity> {
    return this.engine.updateConfig(body);
  }

  /** POST /suggestions/engine/trigger — on-demand analysis trigger */
  @Post('engine/trigger')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerAnalysis(): Promise<{ message: string; accepted: boolean }> {
    const current = this.engine.getStatus();
    if (current.isRunning) {
      return { message: 'Analysis already running', accepted: false };
    }
    void this.engine.runAnalysis();
    return { message: 'Analysis started', accepted: true };
  }

  /**
   * GET /suggestions/:id/action-plan
   *
   * Returns a structured action plan (preview DAG) for the suggestion's
   * `suggestedAction` without executing anything.
   * The frontend shows this before asking the user to confirm.
   */
  @Get(':id/action-plan')
  async getActionPlan(@Param('id') id: string): Promise<ActionPlan> {
    const suggestion = await this.suggestionRepo.findOne({ where: { id } });
    if (!suggestion) throw new NotFoundException(`Suggestion ${id} not found`);
    return buildActionPlan(suggestion);
  }

  /**
   * POST /suggestions/:id/execute
   *
   * Called AFTER the user has reviewed the action plan and confirmed.
   * Marks the suggestion as executed and records the confirmation comment.
   */
  @Post(':id/execute')
  @HttpCode(HttpStatus.OK)
  async executeSuggestion(
    @Param('id') id: string,
    @Body() body: { comment?: string } = {},
  ): Promise<{ suggestion: SuggestionEntity; actionPlan: ActionPlan }> {
    const suggestion = await this.suggestionRepo.findOne({ where: { id } });
    if (!suggestion) throw new NotFoundException(`Suggestion ${id} not found`);

    const plan = buildActionPlan(suggestion);

    suggestion.executed    = true;
    suggestion.executedAt  = new Date();
    if (body.comment) suggestion.decisionComment = body.comment;

    const saved = await this.suggestionRepo.save(suggestion);
    return { suggestion: saved, actionPlan: plan };
  }
}
