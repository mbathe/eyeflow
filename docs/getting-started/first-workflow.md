---
id: first-workflow
sidebar_position: 2
title: Premier workflow complet
description: Créez un workflow avec conditions, branchements, appels LLM figés et contrôle d'un actionneur physique.
---

# Premier workflow complet

Nous allons créer un workflow de **surveillance de cuve industrielle** avec :
- Lecture multi-capteurs
- Branchement conditionnel
- Appel LLM figé pour analyse (CompiledLLMContext)
- Contrôle d'un actionneur avec fenêtre d'annulation
- Notification multi-canaux

---

## La règle métier

```
Chaque heure, lire les capteurs température, pression et niveau de la cuve T-04.
Si la combinaison des valeurs indique un état anormal :
  - Analyser la situation avec le modèle LLM industriel pour déterminer la cause
  - Si la cause est une surpression, fermer la vanne V-04 dans les 30 secondes
    avec une fenêtre d'annulation de 5 secondes
  - Envoyer un rapport d'incident signé à l'équipe de maintenance via Slack et email
  - Logger l'incident dans le système DCS avec priorité HAUTE
Si l'état est normal, logger uniquement les valeurs pour le tableau de bord.
```

---

## Soumettre la règle à la compilation

```bash
curl -X POST http://localhost:3000/api/rules/compile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $EYEFLOW_TOKEN" \
  -d '{
    "name": "Surveillance cuve T-04",
    "description": "Chaque heure, lire les capteurs température, pression et niveau...",
    "context": {
      "domain": "industrial",
      "criticality": "high",
      "plant": "usine-01",
      "equipment": "T-04"
    },
    "capabilities": [
      "sensor.read_multiple",
      "actuator.valve_control",
      "notification.slack",
      "notification.email",
      "dcs.log_incident",
      "llm.industrial_analysis"
    ],
    "llmContext": {
      "fewShotExamples": [
        {
          "input": "{\"temp\": 145, \"pressure\": 8.2, \"level\": 0.91}",
          "output": "{\"state\": \"overpressure\", \"cause\": \"thermal_expansion\", \"action\": \"close_valve\"}"
        },
        {
          "input": "{\"temp\": 72, \"pressure\": 4.1, \"level\": 0.45}",
          "output": "{\"state\": \"normal\", \"cause\": null, \"action\": \"log_only\"}"
        }
      ],
      "outputSchema": {
        "type": "object",
        "required": ["state", "action"],
        "properties": {
          "state": { "type": "string", "enum": ["normal", "overpressure", "underflow", "critical"] },
          "cause": { "type": ["string", "null"] },
          "action": { "type": "string", "enum": ["log_only", "close_valve", "emergency_stop", "alert_only"] }
        }
      }
    }
  }'
```

---

## Ce que génère le compilateur

Le compilateur produit un **DAG d'instructions LLM-IR** :

```
[CRON every=3600s]
        │
        ▼
[LOAD_RESOURCE sensor.read_multiple targets=["T-04-TEMP","T-04-PRES","T-04-LVL"]]
        │
        ▼
[EVAL condition="temp > 100 OR pressure > 7.0 OR level > 0.85"]
        │
     ┌──┴──┐
   true   false
     │        │
     ▼        ▼
[LLM_CALL   [CALL_ACTION dcs.log_incident
 model=industrial    priority=LOW]
 temp=calibrated(0.1)  │
 few_shot=frozen      END
 schema=frozen]
     │
     ▼
[EVAL cause == "overpressure"]
     │
     ▼
[CALL_ACTION actuator.valve_control
  target="V-04" action="close"
  time_window=30s
  cancellation_window=5s
  postcondition="pressure < 6.5"]
     │
     ▼
[CALL_ACTION notification.slack + notification.email]
     │
     ▼
[CALL_ACTION dcs.log_incident priority=HIGH]
     │
    END
```

---

## Rapport de vérification Z3

Après compilation, Z3 vérifie automatiquement :

```
✅ Invariant 1 : LLM output ∈ {normal, overpressure, underflow, critical}
   → Impossible de passer une valeur hors enum à CALL_ACTION
   
✅ Invariant 2 : CALL_ACTION valve_control REQUIRES sensor.read_multiple précédent
   → Pas d'action physique sans lecture capteur préalable
   
✅ Invariant 3 : time_window(30s) > cancellation_window(5s) + execution_overhead
   → Fenêtre d'annulation cohérente
   
✅ Invariant 4 : Boucle bornée — aucune boucle LLM non-bornée détectée
   
✅ Invariant 5 : dcs.log_incident accessible depuis les deux branches (true et false)
   → Pas de code mort
   
Z3 result: SATISFIABLE — signature autorisée
```

---

## Inspecter le CompiledLLMContext injecté

Vous pouvez inspecter le contexte LLM figé compilé dans le binaire :

```bash
curl http://localhost:3000/api/rules/cmp_01HXYZ.../ir/instructions \
  -H "Authorization: Bearer $EYEFLOW_TOKEN" | jq '.[] | select(.opcode == "LLM_CALL")'
```

```json
{
  "opcode": "LLM_CALL",
  "compiledContext": {
    "model": "gpt-4o-2024-08-06",
    "temperature": 0.1,
    "maxTokens": 256,
    "systemPrompt": "You are an industrial process analyzer...",
    "fewShotExamples": [
      { "inputJson": "{\"temp\": 145...}", "outputJson": "{\"state\": \"overpressure\"...}" },
      { "inputJson": "{\"temp\": 72...}",  "outputJson": "{\"state\": \"normal\"...}" }
    ],
    "outputSchema": { "type": "object", "required": ["state", "action"] },
    "dynamicSlots": [
      { "slotId": "equipment_config", "sourceType": "vault", "sourceKey": "industrial/T-04/config" }
    ]
  },
  "priority": {
    "priorityLevel": 64,
    "preemptible": false,
    "maxWaitMs": 2000
  }
}
```

---

## Tester une exécution simulée

```bash
curl -X POST http://localhost:3000/api/events/simulate \
  -H "Authorization: Bearer $EYEFLOW_TOKEN" \
  -d '{
    "source": "cron",
    "ruleId": "cmp_01HXYZ...",
    "mockSensors": {
      "T-04-TEMP": 148.5,
      "T-04-PRES": 8.7,
      "T-04-LVL": 0.93
    }
  }'
```

Résultat :

```json
{
  "executionId": "exec_01HDEF...",
  "status": "completed",
  "durationMs": 312,
  "path": "anomaly_branch",
  "llmCallDurationMs": 298,
  "actions": [
    { "type": "actuator.valve_control", "target": "V-04", "action": "close", "postconditionMet": true },
    { "type": "notification.slack", "status": "sent" },
    { "type": "notification.email", "status": "sent" },
    { "type": "dcs.log_incident", "priority": "HIGH", "status": "logged" }
  ],
  "auditHash": "sha256:d4e7f2..."
}
```

---

## Prochaines étapes

👉 [Dashboard](./dashboard) — visualiser les exécutions en temps réel  
👉 [SVM Runtime](../concepts/svm-runtime) — comprendre le scheduler et les priorités  
👉 [Contrôle physique](../concepts/physical-control) — TimeWindow et postconditions en détail
