---
id: finance
sidebar_position: 4
title: Secteur finance
description: EyeFlow en finance — conformité AMF/RGPD/NIS2, détection fraude déterministe, validation transactions, audit SOC2, reporting réglementaire automatisé.
---

# EyeFlow — Secteur financier

EyeFlow fournit aux institutions financières des **règles de décision déterministes et auditables** : validation de transactions, scoring de risque, détection de fraude et reporting réglementaire — sans LLM au runtime, sans risque de dérive.

---

## Pourquoi EyeFlow en finance ?

| Défi financier | Solution EyeFlow |
|---------------|-----------------|
| Décisions de crédit reproductibles | Compilation statique — même input = même décision |
| Audit SOC2 / PCI-DSS | Chaîne SHA-256 immuable par décision |
| Conformité RGPD Art. 22 | Traçabilité décisions automatisées exportable |
| Latence scoring < 50ms | SVM Rust < 5ms sans appel LLM |
| Règles métier changeantes | Recompilation rapide sans redéploiement applicatif |
| Anti-fraude temps réel | PriorityPolicy CRITICAL + ResourceArbiter |

---

## Catalog finance — Capabilities

| Capability | Version | Description |
|-----------|---------|-------------|
| `transaction.validate` | 2.0.0 | Validation transaction avec règles configurables |
| `transaction.flag` | 1.3.0 | Marquage transaction suspecte |
| `fraud.detect` | 1.5.0 | Détection fraude temps réel multi-signaux |
| `fraud.report` | 1.2.0 | Génération rapport fraude structuré |
| `compliance.check_rgpd` | 1.0.0 | Vérification traitement RGPD |
| `compliance.check_amf` | 1.1.0 | Vérification conformité AMF |
| `report.generate_regulatory` | 1.3.0 | Génération rapport réglementaire (COREP, FINREP) |
| `risk.score_calculate` | 1.2.0 | Calcul score de risque client ou transaction |
| `kyc.trigger_enhanced` | 1.0.0 | Déclenchement KYC renforcé |
| `alert.compliance_officer` | 1.0.0 | Notification responsable conformité |

---

## Exemple 1 : Détection fraude temps réel

### Règle métier
```
Pour chaque transaction bancaire entrante,
analyser les signaux de fraude (montant, localisation, fréquence,
comportement historique client) pour calculer un score de risque.
Si le score dépasse 0.85, bloquer la transaction et alerter
le service fraude avec un rapport détaillé des signaux activés.
Si le score est entre 0.6 et 0.85, demander une validation 3DS au client.
```

### Priorité CRITICAL pour la latence

```json
{
  "priority": {
    "priorityLevel": 0,
    "preemptible": false,
    "maxWaitMs": 200
  }
}
```

La détection de fraude s'exécute en moins de 10ms (sans appel LLM au runtime).

### Programme compilé
```
[EVENT cdc.transactions INSERT]
 → [LOAD_RESOURCE risk.score_calculate
     inputs=["amount","location","velocity","device","history"]]
 → [EVAL fraud_score > 0.85]
      true:
       → [CALL_ACTION transaction.flag status=BLOCKED]
       → [CALL_ACTION fraud.report severity=HIGH]
       → [CALL_ACTION alert.compliance_officer]
      EVAL fraud_score BETWEEN 0.6 AND 0.85:
       → [CALL_ACTION transaction.flag status=REVIEW_3DS]
       → [CALL_ACTION kyc.trigger_enhanced type=3ds_challenge]
      false:
       → [CALL_ACTION transaction.validate status=APPROVED]
```

---

## Exemple 2 : Reporting réglementaire automatisé

### Règle métier
```
Chaque jour ouvré à 18h, consolider les données de transaction du jour,
vérifier la conformité AMF des positions ouvertes,
et générer le rapport COREP quotidien dans le format requis par l'ACPR.
```

### Pipeline LLM pour la rédaction réglementaire

```
[LLM_CALL GPT-4o] → analyse des positions et flags réglementaires
         ↓
[LLM_CALL Claude] → rédaction narrative du rapport COREP
         ↓
[CALL_ACTION report.generate_regulatory format=COREP]
[CALL_ACTION compliance.check_amf]
```

Le LLM Claude est configuré avec :
- Temperature 0.3 (rédaction factuelle structurée)
- Few-shot : 5 exemples de rapports COREP précédemment validés
- Output schema : structure exacte COREP XML

---

## Conformité réglementaire

### RGPD Article 22 — Décisions automatisées

EyeFlow génère automatiquement la documentation Art. 22 :

```bash
curl http://localhost:3000/api/audit/rgpd-report \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"customerId": "USER-12345", "period": "2025"}'
```

Retourne :
- Toutes les décisions automatisées concernant ce client
- La règle utilisée pour chaque décision
- Les données utilisées en input
- Le résultat et la date

### SOC2 Type II

EyeFlow fournit :
- Log d'accès aux configurations (qui a modifié quelle règle, quand)
- Audit trail des déploiements
- Rapport de disponibilité des services (uptime, incidents)
- Preuve d'intégrité des données traitées (audit hash chain)

---

## Performance anti-fraude

| Métriques | Valeur |
|----------|--------|
| Latence p50 (scoring) | 3ms |
| Latence p99 (scoring) | 18ms |
| Latence p50 (avec rapport PDF) | 850ms |
| Throughput max | 50,000 transactions/s par nœud |
| Faux positifs | Réductibles par itération des few-shot |

---

## Prochaines étapes

👉 [Sécurité](../concepts/security) — conformité SOC2/PCI-DSS  
👉 [Audit et observabilité](../concepts/audit-observability) — RGPD et chaîne de preuves  
👉 [Secteur IoT](./iot) — extension vers l'edge IoT
