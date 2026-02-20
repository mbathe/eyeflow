/**
 * CatalogVerticalService — Spec §4 (vertical segmentation du catalogue)
 *
 * Segmente le catalogue de capacités en 5 sous-catalogues verticaux :
 *   MEDICAL       — Systèmes de santé, EHR/FHIR, diagnostic, pharmacie
 *   INDUSTRIAL    — Industrie 4.0 : capteurs, automates, maintenance prédictive
 *   AGRICULTURE   — AgriTech : irrigation, météo, drones, sol, récolte
 *   FINANCE       — FinTech : paiements, facturation, risque, comptabilité
 *   IOT           — IoT générique : MQTT, passerelles, firmware, télémétrie
 *
 * Fonctionnement :
 *   1. Chaque capacité reçoit un score de pertinence par vertical (basé sur
 *      les mots-clés de son `name` + `description` + `category`).
 *   2. Un vertical est assigné si le score dépasse `ASSIGNMENT_THRESHOLD`.
 *   3. `buildVerticalCatalog(vertical, fullCatalog)` retourne un sous-catalogue
 *      trié par score décroissant.
 *   4. La matrice de compatibilité croisée est exposée via
 *      `getCrossVerticalMatrix()` pour l'affichage dans la UI.
 */

import { Injectable, Logger } from '@nestjs/common';
import type {
  CapabilityCatalogDocument,
  CapabilityInfo,
} from './capability-catalog-builder.service';

// ── Vertical enum ─────────────────────────────────────────────────────────────

export enum CatalogVertical {
  MEDICAL      = 'MEDICAL',
  INDUSTRIAL   = 'INDUSTRIAL',
  AGRICULTURE  = 'AGRICULTURE',
  FINANCE      = 'FINANCE',
  IOT          = 'IOT',
}

// ── Vertical metadata ─────────────────────────────────────────────────────────

export interface VerticalMetadata {
  id: CatalogVertical;
  label: string;
  description: string;
  icon: string;
  /** Primary keywords — weight 3 */
  primaryKeywords: string[];
  /** Secondary keywords — weight 1 */
  secondaryKeywords: string[];
  /** Compliance frameworks relevant to this vertical */
  compliance: string[];
}

export const VERTICAL_METADATA: Record<CatalogVertical, VerticalMetadata> = {
  [CatalogVertical.MEDICAL]: {
    id:          CatalogVertical.MEDICAL,
    label:       'Médical & Santé',
    description: 'Systèmes de santé connectés, EHR/FHIR, monitoring patient, pharmacie intelligente',
    icon:        '🏥',
    primaryKeywords: [
      'patient', 'health', 'medical', 'ehr', 'fhir', 'hospital', 'clinical',
      'diagnostic', 'pharmacy', 'medication', 'vitals', 'ecg', 'hl7',
      'healthcare', 'doctor', 'nurse', 'imaging', 'lab', 'specimen',
    ],
    secondaryKeywords: [
      'alert', 'monitor', 'sensor', 'temperature', 'pressure', 'threshold',
      'notification', 'report', 'audit', 'compliance', 'gdpr', 'hipaa',
    ],
    compliance: ['HIPAA', 'HDS', 'ISO 27001', 'GDPR', 'MDR'],
  },

  [CatalogVertical.INDUSTRIAL]: {
    id:          CatalogVertical.INDUSTRIAL,
    label:       'Industrie 4.0',
    description: 'Automatisation industrielle, maintenance prédictive, SCADA, IIoT',
    icon:        '🏭',
    primaryKeywords: [
      'sensor', 'actuator', 'plc', 'scada', 'opc', 'modbus', 'opcua',
      'vibration', 'machine', 'motor', 'pump', 'conveyor', 'robot',
      'maintenance', 'predictive', 'industrial', 'factory', 'line',
      'production', 'yield', 'downtime', 'alarm',
    ],
    secondaryKeywords: [
      'temperature', 'pressure', 'flow', 'level', 'humidity',
      'telemetry', 'gateway', 'edge', 'firmware', 'iot', 'mqtt',
      'threshold', 'anomaly', 'alert', 'report',
    ],
    compliance: ['IEC 62443', 'ISO 55001', 'ATEX', 'CE'],
  },

  [CatalogVertical.AGRICULTURE]: {
    id:          CatalogVertical.AGRICULTURE,
    label:       'Agriculture & AgriTech',
    description: 'Agriculture de précision, irrigation intelligente, suivi des cultures, drones',
    icon:        '🌾',
    primaryKeywords: [
      'soil', 'crop', 'field', 'farm', 'harvest', 'irrigation', 'fertilizer',
      'drone', 'ndvi', 'weather', 'rainfall', 'humidity', 'moisture',
      'agri', 'agriculture', 'plant', 'seed', 'yield', 'pest',
    ],
    secondaryKeywords: [
      'sensor', 'temperature', 'monitor', 'alert', 'forecast', 'map',
      'gps', 'satellite', 'telemetry', 'report', 'recommendation',
    ],
    compliance: ['GlobalG.A.P.', 'ISO 22000', 'TRACES NT'],
  },

  [CatalogVertical.FINANCE]: {
    id:          CatalogVertical.FINANCE,
    label:       'Finance & FinTech',
    description: 'Paiements, facturation automatisée, analyse du risque, comptabilité IA',
    icon:        '💰',
    primaryKeywords: [
      'payment', 'invoice', 'bank', 'credit', 'debit', 'transaction',
      'accounting', 'ledger', 'portfolio', 'risk', 'fraud', 'kyc', 'aml',
      'finance', 'fintech', 'budget', 'expense', 'revenue', 'tax',
    ],
    secondaryKeywords: [
      'report', 'audit', 'compliance', 'notification', 'alert', 'approval',
      'workflow', 'crm', 'erp', 'document', 'signature', 'contract',
    ],
    compliance: ['PCI-DSS', 'DORA', 'MiFID II', 'GDPR', 'SOX'],
  },

  [CatalogVertical.IOT]: {
    id:          CatalogVertical.IOT,
    label:       'IoT & Edge',
    description: 'Passerelles MQTT, télémétrie, firmware OTA, gestion des flottes de devices',
    icon:        '📡',
    primaryKeywords: [
      'mqtt', 'iot', 'device', 'gateway', 'edge', 'telemetry',
      'firmware', 'ota', 'fleet', 'protocol', 'lorawan', 'zigbee',
      'zwave', 'coap', 'websocket', 'amqp', 'topic', 'broker',
    ],
    secondaryKeywords: [
      'sensor', 'actuator', 'monitor', 'alert', 'threshold', 'metric',
      'dashboard', 'report', 'anomaly', 'provision', 'certificate',
    ],
    compliance: ['ETSI EN 303 645', 'Matter 1.x', 'IEEE 802.15.4'],
  },
};

// ── Per-capability vertical scoring ──────────────────────────────────────────

export interface VerticalScore {
  vertical: CatalogVertical;
  score: number;
}

export interface CapabilityWithVerticals extends CapabilityInfo {
  /** Assigned verticals (score ≥ threshold) ordered by score descending */
  verticals: VerticalScore[];
}

// ── Vertical catalog ──────────────────────────────────────────────────────────

export interface VerticalCatalog {
  vertical: CatalogVertical;
  metadata: VerticalMetadata;
  totalCapabilities: number;
  capabilities: CapabilityWithVerticals[];
  buildTimestamp: string;
}

// ── Cross-vertical matrix ─────────────────────────────────────────────────────

export type CrossVerticalMatrix = Record<
  CatalogVertical,
  Record<CatalogVertical, number /** shared capability count */>
>;

// ── Service ───────────────────────────────────────────────────────────────────

/** Minimum relevance score to assign a vertical tag to a capability. */
const ASSIGNMENT_THRESHOLD = 2;

@Injectable()
export class CatalogVerticalService {
  private readonly logger = new Logger(CatalogVerticalService.name);

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Annotate each capability in the catalog with vertical scores.
   * Returns a new array — does not mutate the source catalog.
   */
  annotateCapabilities(
    capabilities: CapabilityInfo[],
  ): CapabilityWithVerticals[] {
    return capabilities.map(cap => ({
      ...cap,
      verticals: this.scoreCapability(cap),
    }));
  }

  /**
   * Build a vertical-specific catalog: all capabilities that are relevant
   * to the given vertical, sorted by relevance score (descending).
   */
  buildVerticalCatalog(
    vertical: CatalogVertical,
    fullCatalog: CapabilityCatalogDocument,
  ): VerticalCatalog {
    const annotated = this.annotateCapabilities(fullCatalog.capabilities);

    const matching = annotated
      .filter(cap => cap.verticals.some(v => v.vertical === vertical))
      .sort((a, b) => {
        const sa = a.verticals.find(v => v.vertical === vertical)?.score ?? 0;
        const sb = b.verticals.find(v => v.vertical === vertical)?.score ?? 0;
        return sb - sa;
      });

    this.logger.log(
      `[VerticalCatalog] Built "${vertical}": ${matching.length} capabilities ` +
      `out of ${fullCatalog.capabilities.length} total`,
    );

    return {
      vertical,
      metadata:          VERTICAL_METADATA[vertical],
      totalCapabilities: matching.length,
      capabilities:      matching,
      buildTimestamp:    new Date().toISOString(),
    };
  }

  /**
   * Build all 5 vertical catalogs at once.
   * Returns a Map keyed by `CatalogVertical`.
   */
  buildAllVerticalCatalogs(
    fullCatalog: CapabilityCatalogDocument,
  ): Map<CatalogVertical, VerticalCatalog> {
    const result = new Map<CatalogVertical, VerticalCatalog>();
    for (const vertical of Object.values(CatalogVertical)) {
      result.set(vertical, this.buildVerticalCatalog(vertical, fullCatalog));
    }
    return result;
  }

  /**
   * Cross-vertical compatibility matrix:
   * `matrix[V1][V2]` = number of capabilities shared between V1 and V2.
   *
   * Useful to identify capabilities that straddle verticals (e.g. a sensor
   * reading capability might belong to both INDUSTRIAL and IOT).
   */
  getCrossVerticalMatrix(
    fullCatalog: CapabilityCatalogDocument,
  ): CrossVerticalMatrix {
    const annotated = this.annotateCapabilities(fullCatalog.capabilities);
    const verticals = Object.values(CatalogVertical);

    // Build per-vertical sets
    const sets: Record<CatalogVertical, Set<string>> = {} as any;
    for (const v of verticals) {
      sets[v] = new Set(
        annotated
          .filter(c => c.verticals.some(vs => vs.vertical === v))
          .map(c => c.id),
      );
    }

    // Build matrix
    const matrix: CrossVerticalMatrix = {} as any;
    for (const v1 of verticals) {
      matrix[v1] = {} as any;
      for (const v2 of verticals) {
        let shared = 0;
        for (const id of sets[v1]) {
          if (sets[v2].has(id)) shared++;
        }
        matrix[v1][v2] = shared;
      }
    }

    return matrix;
  }

  /**
   * Returns the list of verticals assigned to a single capability.
   */
  getCapabilityVerticals(cap: CapabilityInfo): VerticalScore[] {
    return this.scoreCapability(cap);
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  private scoreCapability(cap: CapabilityInfo): VerticalScore[] {
    const text = `${cap.name} ${cap.description} ${cap.id} ${cap.category}`.toLowerCase();
    const scores: VerticalScore[] = [];

    for (const [vertical, meta] of Object.entries(VERTICAL_METADATA) as [CatalogVertical, VerticalMetadata][]) {
      let score = 0;

      for (const kw of meta.primaryKeywords) {
        if (text.includes(kw)) score += 3;
      }
      for (const kw of meta.secondaryKeywords) {
        if (text.includes(kw)) score += 1;
      }

      if (score >= ASSIGNMENT_THRESHOLD) {
        scores.push({ vertical, score });
      }
    }

    // Sort descending by score
    scores.sort((a, b) => b.score - a.score);
    return scores;
  }
}
