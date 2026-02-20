---
id: physical-control
sidebar_position: 7
title: Contrôle physique
description: Sécurité des actionneurs — TimeWindow, fenêtre d'annulation, postconditions, garde-fous pour actions irréversibles en environnements industriels et médicaux.
---

# Contrôle physique

Quand un programme EyeFlow commande un actionneur physique (vanne, pompe, relais, moteur, dispositif médical), des **garde-fous obligatoires** s'appliquent. Cette page décrit le modèle de sécurité pour les actions physiques.

:::danger Actions irréversibles
Certaines actions physiques sont irréversibles (injection médicament, ouverture vanne haute pression, arrêt moteur en production). EyeFlow impose des garde-fous formels pour ces cas.
:::

---

## Architecture de sécurité physique

```
LLM-IR programme
      │
      ▼ CALL_ACTION actuator.*
┌─────────────────────────────────────────┐
│  Physical Action Guard                  │
│                                         │
│  1. Vérification préconditions          │
│  2. Calcul TimeWindow                   │
│  3. Affichage fenêtre d'annulation      │
│  4. Exécution de l'action              │
│  5. Attente postcondition              │
│  6. Rollback si postcondition échoue   │
└─────────────────────────────────────────┘
      │
      ▼
Actionneur physique
```

---

## TimeWindow — Fenêtre temporelle

Le `TimeWindow` est une contrainte temporelle sur l'exécution d'une action physique.

```typescript
interface TimeWindow {
  allowedDays:   number[];   // 0=dim, 1=lun, ..., 6=sam
  allowedHours:  [number, number];  // [start, end] en heure locale
  timezone:      string;     // IANA timezone
  maxDurationMs: number;     // Durée maximale de l'action
}
```

### Exemple : maintenance planifiée

```json
{
  "action": "actuator.pump_control",
  "params": { "pump": "P-01", "command": "stop" },
  "timeWindow": {
    "allowedDays": [1, 2, 3, 4, 5],
    "allowedHours": [2, 6],
    "timezone": "Europe/Paris",
    "maxDurationMs": 7200000
  }
}
```

Si l'action est déclenchée en dehors de la fenêtre autorisée :
- L'instruction est **mise en attente** jusqu'à l'ouverture de la fenêtre
- Une alerte est envoyée à l'opérateur
- Le programme ne bloque pas (continue sur d'autres branches)

---

## Fenêtre d'annulation

Avant d'exécuter une action irréversible, EyeFlow peut afficher une **fenêtre d'annulation** :

```json
{
  "action": "medical.medication_dosage",
  "params": { "drug": "insulin", "dose_units": 4 },
  "cancellationWindow": {
    "durationMs": 10000,
    "notifyChannels": ["dashboard", "pager"],
    "requiresAcknowledgment": true,
    "escalationOnMissed": "abort"
  }
}
```

Comportement :
1. L'action est **annoncée** (dashboard + pager)
2. Compte à rebours de 10 secondes
3. Si l'opérateur annule → action annulée, logged dans audit
4. Si aucune action → action exécutée automatiquement
5. `escalationOnMissed: "abort"` → si pas de réponse, annuler plutôt qu'exécuter

---

## Postconditions

Après chaque action physique, EyeFlow **vérifie que l'action a eu l'effet attendu** :

```json
{
  "action": "actuator.valve_control",
  "params": { "valve": "V-04", "command": "close" },
  "postconditions": [
    {
      "check": "sensor.valve_V04_position == 'closed'",
      "timeoutMs": 10000,
      "description": "Confirmation position fermée"
    },
    {
      "check": "sensor.pressure_downstream < 2.0",
      "timeoutMs": 15000,
      "description": "Pression aval retombée sous seuil"
    }
  ],
  "rollbackOnFailure": {
    "action": "actuator.valve_control",
    "params": { "valve": "V-04", "command": "open" },
    "alertOnRollback": true
  }
}
```

### Séquence de vérification

```
Action exécutée
   │
   ▼ (t=0ms)
Polling postcondition 1 toutes les 500ms...
   │
   ├─ ✅ position == 'closed' à t=2.3s → OK
   │
   ▼
Polling postcondition 2 toutes les 500ms...
   │
   ├─ ❌ pressure = 2.8 bar à t=15s (timeout)
   │
   ▼
ROLLBACK : ouvrir V-04
Alerte : "Postcondition pression non respectée — rollback effectué"
Audit : entrée signée avec cause du rollback
```

---

## Niveaux de criticité physique

EyeFlow catégorise les actions selon 4 niveaux :

| Niveau | Exemples | Règles appliquées |
|--------|---------|-------------------|
| **SAFE** | Lecture capteur, log | Aucune restriction |
| **GUARDED** | Notification, rapport | Préconditions vérifiées |
| **CONTROLLED** | Pompe, vanne standard | TimeWindow + postconditions |
| **CRITICAL** | Médicament, arrêt urgence, haute tension | TimeWindow + annulation + postconditions + validation humaine |

---

## Certification SIL / IEC 62304

EyeFlow génère automatiquement les **artefacts de certification** pour les actions CRITICAL :

- Rapport Z3 de vérification formelle des garde-fous
- Log structuré de chaque exécution (format IEC 62304 §5.8)
- Preuve de la chaîne d'audit (hash SHA-256 par instruction)
- Document de traçabilité exigences → code → test

```bash
eyeflow-cli cert generate \
  --rule-id cmp_01HXYZ... \
  --standard iec62304 \
  --output ./certification/
```

Génère :
- `srs-traceability.pdf` — traçabilité exigences
- `risk-analysis.json` — analyse de risque automatique
- `audit-evidence.zip` — preuves d'exécution
- `z3-formal-proofs.pdf` — rapports vérification formelle

---

## Prochaines étapes

👉 [Audit et observabilité](./audit-observability) — chaîne de preuves cryptographiques  
👉 [SVM Runtime](./svm-runtime) — FallbackEngine et gestion des erreurs  
👉 [Verticals — Médical](../verticals/medical) — garde-fous spécifiques au secteur médical
