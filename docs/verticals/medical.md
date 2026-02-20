---
id: medical
sidebar_position: 1
title: Secteur médical
description: EyeFlow en environnement médical — conformité IEC 62304, catalog de capabilities médicales, exemples de workflows ICU, dosage médicament et coordination soins.
---

# EyeFlow — Secteur médical

EyeFlow répond aux exigences les plus strictes du secteur médical : **déterminisme total, traçabilité IEC 62304, garde-fous pour actions critiques** et déploiement possible sur dispositifs embarqués certifiables.

:::danger Avertissement
Les exemples de cette page sont illustratifs. Tout déploiement en environnement médical doit être validé par un processus de certification conforme à IEC 62304 / ISO 13485.
:::

---

## Pourquoi EyeFlow en médical ?

| Défi médical | Solution EyeFlow |
|-------------|-----------------|
| Décisions IA reproductibles | Déterminisme compilé — même input = même output toujours |
| Certification IEC 62304 | Rapports Z3, audit chain, traçabilité automatique |
| Pas d'hallucination LLM en production | LLM jamais appelé au runtime |
| Audit de toutes les décisions | Chaîne SHA-256 par instruction, non-répudiable |
| Déploiement sur dispositifs embarqués | SVM Rust Embassy (STM32, nRF52) |
| Révocation rapide | Capability révocable à chaud sans redéploiement |

---

## Catalog médical — Capabilities disponibles

| Capability | Version | Description |
|-----------|---------|-------------|
| `medical.patient_alert` | 2.1.0 | Alerte équipe soignante multi-niveaux |
| `medical.medication_dosage` | 1.3.0 | Calcul et validation dosage + garde-fous |
| `medical.vital_signs_monitor` | 2.0.0 | Lecture multi-capteurs patient (SpO2, FC, TA, T°) |
| `medical.icu_coordinate` | 1.1.0 | Coordination soins ICU multi-intervenants |
| `medical.ehr_update` | 1.5.0 | Mise à jour dossier patient HL7 FHIR |
| `medical.lab_result_process` | 1.0.0 | Traitement résultats biologiques |
| `medical.imaging_trigger` | 1.0.0 | Déclenchement imagerie avec contexte clinique |

Toutes ces capabilities sont **signées Ed25519** et ont des préconditions/postconditions explicites avec rollback.

---

## Exemple 1 : Alerte signes vitaux ICU

### Règle métier
```
Surveiller en continu les signes vitaux du patient.
Si la SpO2 descend sous 90% ET la fréquence cardiaque dépasse 110 bpm,
analyser la combinaison de symptômes et alerter immédiatement l'équipe
avec un niveau de priorité adapté à la gravité calculée.
Enregistrer l'événement dans le dossier patient avec les valeurs mesurées.
```

### Programme compilé (résumé DAG)
```
[CRON every=30s]
 → [LOAD_RESOURCE medical.vital_signs_monitor patient_id="P-1234"]
 → [EVAL spo2 < 90 AND heart_rate > 110]
      true:
       → [LLM_CALL model=gpt-4o-medical temp=0.1
           few_shot=frozen(3 exemples ICU)
           output_schema={severity: enum[low,medium,high,critical]}]
       → [CALL_ACTION medical.patient_alert
           priority=CRITICAL time_window=immediate
           cancellation_window=5s]
       → [CALL_ACTION medical.ehr_update type=vital_alert]
      false:
       → [CALL_ACTION medical.ehr_update type=normal_reading]
```

### Préconditions vérifiées automatiquement
- Capteurs calibrés dans les 24h (vérification base CMMS)
- Consentement patient actif pour monitoring automatisé
- Équipe de garde disponible (calendrier de garde consulté)

---

## Exemple 2 : Validation dosage médicament

### Règle métier
```
Quand une prescription de médicament est créée pour un patient,
valider le dosage selon le poids, l'âge, les contre-indications
et les interactions médicamenteuses actives.
Si le dosage proposé présente un risque, bloquer et alerter le prescripteur.
```

### Garde-fous spécifiques
```json
{
  "action": "medical.medication_dosage",
  "criticality": "CRITICAL",
  "cancellationWindow": {
    "durationMs": 30000,
    "requiresAcknowledgment": true,
    "escalationOnMissed": "abort"
  },
  "postconditions": [
    {
      "check": "dosage.validated_by_pharmacist == true",
      "timeoutMs": 300000,
      "description": "Validation pharmacien dans les 5 minutes"
    }
  ]
}
```

---

## Traçabilité IEC 62304

Chaque exécution génère automatiquement les artefacts requis :

```bash
eyeflow-cli cert generate \
  --rule-id cmp_01HXYZ... \
  --standard iec62304 \
  --output ./certification/v1.0.0/
```

Artefacts générés :
- `§5.1-software-development-planning.pdf`
- `§5.7-software-integration-testing.json`
- `§5.8-software-system-testing.json` (traces d'exécution)
- `§9-software-problem-resolution.pdf`
- `z3-formal-verification.pdf`
- `audit-chain-evidence.zip`

---

## Configuration secteur médical

```toml
# eyeflow-server.toml — profil médical
[sector]
type = "medical"

[sector.medical]
hl7_fhir_base   = "https://ehr.hospital.local/fhir/R4"
ehr_auth_vault  = "medical/ehr/api_key"
require_human_validation_for = ["medication_dosage", "imaging_trigger"]
audit_retention_years = 10
certification_standard = "IEC62304"
```

---

## Architecture déploiement médical

```
┌────────────────────────────────────────┐
│  Réseau hospitalier (VLAN séparé)      │
│                                        │
│  EyeFlow Server (server de garde)      │
│       ↓ mTLS WebSocket                 │
│  SVM node-icu-01 (Linux x86)          │
│       ↓ BLE / Modbus Medical          │
│  Capteurs vitaux (SpO2, FC, TA, T°)   │
│       ↓                                │
│  SVM node-mcu-embedded (nRF52840)     │
│  (dans le dispositif patient)          │
└────────────────────────────────────────┘
         ↕ HL7 FHIR TLS
┌────────────────────────────────────────┐
│  Système EHR (Epic, Orbis...)          │
└────────────────────────────────────────┘
```

---

## Prochaines étapes

👉 [Contrôle physique](../concepts/physical-control) — TimeWindow médical et postconditions  
👉 [Sécurité](../concepts/security) — certifications IEC 62304 et ISO 13485  
👉 [Secteur industriel](./industrial) — capabilities industrielles
