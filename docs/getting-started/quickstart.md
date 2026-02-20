---
id: quickstart
sidebar_position: 1
title: Quickstart — 10 minutes
description: Lancez EyeFlow localement, compilez votre première règle métier et exécutez-la sur la SVM en moins de 10 minutes.
---

# Quickstart — Opérationnel en 10 minutes

## Prérequis

| Outil | Version minimale |
|-------|-----------------|
| Docker + Docker Compose | 24.x |
| Node.js | 20.x LTS |
| Rust + Cargo | 1.75+ |
| Git | 2.x |

---

## Étape 1 — Cloner et démarrer les services

```bash
git clone https://github.com/eyeflow/eyeflow-platform.git
cd eyeflow-platform

# Démarrer PostgreSQL + Kafka + Redis + LLM service
docker compose up -d

# Vérifier que tous les services sont sains
docker compose ps
```

Vous devriez voir :

```
NAME                    STATUS          PORTS
eyeflow-postgres        running         5432/tcp
eyeflow-kafka           running         9092/tcp
eyeflow-redis           running         6379/tcp
eyeflow-llm-service     running         8001/tcp
```

---

## Étape 2 — Démarrer le compilateur (NestJS)

```bash
cd eyeflow-server
npm install
npm run db:migrate
npm run start:dev
```

Le compilateur est disponible sur `http://localhost:3000`.

---

## Étape 3 — Démarrer la SVM Rust

```bash
cd eyeflow-svm-node
cargo build --release

./target/release/eyeflow-svm \
  --server http://localhost:3000 \
  --vault-addr http://localhost:8200 \
  --node-id node-local-01
```

---

## Étape 4 — Compiler votre première règle

Créez un fichier `ma-premiere-regle.json` :

```json
{
  "name": "Alerte température critique",
  "description": "Si la température du capteur dépasse 85°C, envoyer une alerte Slack et déclencher l'arrêt d'urgence de la pompe P-01.",
  "context": {
    "domain": "industrial",
    "criticality": "high",
    "environment": "production"
  },
  "capabilities": [
    "sensor.read",
    "slack.send_alert",
    "actuator.emergency_stop"
  ]
}
```

Soumettez-la au compilateur :

```bash
curl -X POST http://localhost:3000/api/rules/compile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $EYEFLOW_TOKEN" \
  -d @ma-premiere-regle.json
```

Réponse :

```json
{
  "compilationId": "cmp_01HXYZ...",
  "status": "compilation_complete",
  "irHash": "sha256:a3f9d2...",
  "binarySize": 4096,
  "validationRequired": true,
  "z3Report": {
    "invariantsChecked": 12,
    "conflicts": 0,
    "unreachableBranches": 0
  }
}
```

---

## Étape 5 — Valider (optionnel en dev)

EyeFlow demande une validation humaine avant déploiement en production.  
En mode développement local, vous pouvez auto-valider :

```bash
curl -X POST http://localhost:3000/api/rules/cmp_01HXYZ.../validate \
  -H "Authorization: Bearer $EYEFLOW_TOKEN" \
  -d '{"approved": true, "comment": "Validé pour test local"}'
```

---

## Étape 6 — Déployer sur la SVM

```bash
curl -X POST http://localhost:3000/api/rules/cmp_01HXYZ.../deploy \
  -H "Authorization: Bearer $EYEFLOW_TOKEN" \
  -d '{"nodeIds": ["node-local-01"]}'
```

La SVM télécharge le binaire signé et commence à écouter les événements.

---

## Étape 7 — Tester l'exécution

Simulez un événement capteur :

```bash
curl -X POST http://localhost:3000/api/events/simulate \
  -H "Authorization: Bearer $EYEFLOW_TOKEN" \
  -d '{
    "source": "sensor",
    "payload": {
      "sensor_id": "TEMP-001",
      "temperature": 92.5,
      "unit": "celsius"
    }
  }'
```

Consultez les logs d'exécution :

```bash
curl http://localhost:3000/api/executions/latest \
  -H "Authorization: Bearer $EYEFLOW_TOKEN" | jq .
```

---

## Résultat attendu

```json
{
  "executionId": "exec_01HABC...",
  "ruleId": "cmp_01HXYZ...",
  "status": "completed",
  "durationMs": 7,
  "instructionsExecuted": 8,
  "auditHash": "sha256:b7c1e4...",
  "actions": [
    { "type": "slack.send_alert", "status": "success" },
    { "type": "actuator.emergency_stop", "target": "P-01", "status": "success" }
  ]
}
```

Exécution en **7ms** — zéro appel LLM. ✅

---

## Prochaines étapes

👉 [Premier workflow complet](./first-workflow) — ajouter des branchements conditionnels  
👉 [Dashboard](./dashboard) — visualiser les exécutions en temps réel  
👉 [Compilation sémantique](../concepts/semantic-compilation) — comprendre les 6 phases
