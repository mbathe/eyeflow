---
id: dashboard
sidebar_position: 3
title: Dashboard — Tableau de bord
description: Guide du dashboard EyeFlow React — visualisation temps réel des exécutions, audit trail, gestion des règles et monitoring des nœuds SVM.
---

# Dashboard — Tableau de bord

Le dashboard EyeFlow est une interface React disponible sur `http://localhost:3001`. Il offre une vue temps réel sur l'ensemble de la plateforme.

---

## Lancer le dashboard

```bash
cd eyeflow-dashboard
npm install
npm run dev
# → http://localhost:3001
```

---

## Vue principale — Executions en temps réel

La page d'accueil affiche un flux live des exécutions en cours et récentes :

```
┌─────────────────────────────────────────────────────────────────┐
│  EyeFlow Dashboard                    🟢 3 nœuds actifs        │
├─────────────────────────────────────────────────────────────────┤
│  Règles actives : 12    Exécutions/h : 4,821    Erreurs : 0     │
├─────────────────────────────────────────────────────────────────┤
│  EXECUTIONS RECENTES                              [ voir tout ] │
│  ─────────────────────────────────────────────────────────────  │
│  exec_01H... │ Surveillance T-04    │ ✅ 7ms    │ node-prod-01  │
│  exec_01H... │ Alerte température   │ ✅ 12ms   │ node-edge-02  │
│  exec_01H... │ Dosage irrigation    │ ✅ 8ms    │ node-farm-01  │
│  exec_01H... │ Rapport financier    │ ⏳ 245ms  │ node-fin-01   │
│  exec_01H... │ Analyse visuelle     │ ✅ 18ms   │ node-prod-01  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Détail d'une exécution

Cliquer sur une exécution ouvre la vue détaillée :

### Trace d'instructions

Chaque instruction SVM exécutée est visualisée avec sa durée et son statut :

| # | Instruction | Durée | Statut |
|---|-------------|-------|--------|
| 1 | `LOAD_RESOURCE sensor.read_multiple` | 2ms | ✅ |
| 2 | `EVAL condition` | 0ms | ✅ — branche `true` |
| 3 | `LLM_CALL industrial_analysis` | 298ms | ✅ |
| 4 | `EVAL cause == overpressure` | 0ms | ✅ — branche `true` |
| 5 | `CALL_ACTION actuator.valve_control` | 45ms | ✅ |
| 6 | `CALL_ACTION notification.slack` | 180ms | ✅ |
| 7 | `CALL_ACTION dcs.log_incident` | 12ms | ✅ |

### Audit trail cryptographique

```
Instruction 1 → Hash: sha256:a3f9d2...
Instruction 2 → Hash: sha256:b7c1e4... (signé sur hash précédent)
Instruction 3 → Hash: sha256:c2d8f1... (signé sur hash précédent)
...
Hash final : sha256:d4e7f2... ← correspond à l'audit Kafka
```

La chaîne est vérifiable indépendamment pour prouver qu'aucune instruction n'a été modifiée.

---

## Gestion des règles

### Liste des règles

```
┌──────────────────────────────────────────────────────────────────┐
│  RÈGLES                                    [+ Nouvelle règle]   │
│  ─────────────────────────────────────────────────────────────   │
│  Surveillance T-04    │ v2.1.0 │ ✅ Actif │ 4 nœuds │ ⚙️  🗑️    │
│  Alerte température   │ v1.3.2 │ ✅ Actif │ 8 nœuds │ ⚙️  🗑️    │
│  Dosage irrigation    │ v1.0.0 │ ⏸️ Pause  │ 2 nœuds │ ⚙️  🗑️    │
│  Rapport SOC2 daily   │ v3.0.1 │ ✅ Actif │ 1 nœud  │ ⚙️  🗑️    │
└──────────────────────────────────────────────────────────────────┘
```

### Workflow de compilation

1. **Rédiger** la règle en langage naturel (éditeur intégré)
2. **Soumettre** → compilation asynchrone (barre de progression)
3. **Inspecter** le rapport Z3 et le DAG généré
4. **Valider** (approbation humaine)
5. **Déployer** sur un ou plusieurs nœuds SVM
6. **Monitorer** les exécutions en temps réel

---

## Monitoring des nœuds SVM

La page **Nœuds** affiche l'état de chaque instance SVM :

| Nœud | Plateforme | Statut | Règles | CPU | RAM | Dernière vue |
|------|-----------|--------|--------|-----|-----|-------------|
| node-prod-01 | x86_64 Linux | 🟢 En ligne | 5 | 12% | 48MB | il y a 2s |
| node-edge-02 | ARM64 RPi4 | 🟢 En ligne | 3 | 8% | 22MB | il y a 1s |
| node-farm-01 | ARMv7 RPi3 | 🟠 Offline | 2 | — | — | il y a 4min |
| node-mcu-01 | STM32F4 | 🟢 En ligne | 1 | — | 12KB | il y a 5s |

Pour les nœuds offline, le statut indique si des exécutions ont été **bufferisées localement** et en attente de réconciliation.

---

## Audit Trail global

La page **Audit** présente l'historique complet des actions de la plateforme :

- Compilations (qui, quand, quelle règle, hash IR)
- Validations (qui a approuvé, commentaire)
- Déploiements (sur quels nœuds, version)
- Exécutions (hash de la chaîne d'audit)
- Révocations de capabilities

Toutes les entrées sont **non-répudiables** (chaîne de hashes SHA-256).

### Export pour certification

```bash
# Export au format attendu par les auditeurs IEC 62304
curl http://localhost:3000/api/audit/export \
  -H "Authorization: Bearer $EYEFLOW_TOKEN" \
  -d '{"from": "2025-01-01", "to": "2026-02-20", "format": "iec62304"}' \
  > audit-export.json
```

---

## Alertes et notifications

Configurez des alertes dans **Paramètres → Alertes** :

| Type | Déclencheur | Canal |
|------|-------------|-------|
| Erreur d'exécution | Instruction échouée | Slack / email |
| Nœud offline | Pas de heartbeat > 2min | PagerDuty |
| Échec postcondition | Valeur hors seuil post-action | SMS + email |
| Drift de performance | Exécution > 5x baseline | Slack |

---

## Prochaines étapes

👉 [Compilation sémantique](../concepts/semantic-compilation) — comprendre les 6 phases  
👉 [SVM Runtime](../concepts/svm-runtime) — scheduler, priorités, fallback  
👉 [Sources d'événements](../concepts/event-sources) — Kafka, MQTT, Modbus, OPC-UA et plus
