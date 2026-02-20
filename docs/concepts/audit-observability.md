---
id: audit-observability
sidebar_position: 9
title: Audit et observabilité
description: Chaîne d'audit cryptographique SHA-256, traçabilité par instruction, export Kafka, dashboards Grafana/InfluxDB et conformité RGPD/NIS2.
---

# Audit et observabilité

EyeFlow génère une **chaîne d'audit cryptographique immuable** pour chaque exécution. Chaque instruction exécutée est hashée et enchaînée, rendant toute modification rétroactive détectable.

---

## Chaîne d'audit cryptographique

```
Exécution démarrée (exec_id, rule_id, timestamp)
      │
      ├─ Instruction 1: LOAD_RESOURCE
      │  hash_1 = SHA256(exec_id + instr_1_id + input_1 + output_1 + timestamp_1)
      │
      ├─ Instruction 2: EVAL
      │  hash_2 = SHA256(hash_1 + instr_2_id + condition + result + timestamp_2)
      │
      ├─ Instruction 3: LLM_CALL
      │  hash_3 = SHA256(hash_2 + instr_3_id + llm_input + llm_output + timestamp_3)
      │
      ├─ Instruction 4: CALL_ACTION
      │  hash_4 = SHA256(hash_3 + instr_4_id + action + params + result + timestamp_4)
      │
      └─ Hash final = hash_4 → stocké en Kafka + base de données
```

**Propriété clé :** modifier rétroactivement un résultat intermédiaire invalide tous les hashes suivants. L'intégrité de la chaîne est **mathématiquement vérifiable**.

---

## Structure d'un enregistrement d'audit

```typescript
interface AuditEntry {
  executionId:   string;
  ruleId:        string;
  ruleVersion:   string;
  nodeId:        string;
  startedAt:     number;       // Unix ms
  completedAt:   number;
  durationMs:    number;
  status:        'completed' | 'failed' | 'aborted';
  
  instructions: AuditInstruction[];
  
  finalHash:    string;        // SHA-256 de la chaîne complète
  signature:    string;        // Ed25519 du nœud SVM (non-répudiation)
}

interface AuditInstruction {
  instructionId: string;
  opcode:        string;
  sequenceNum:   number;
  startedAt:     number;
  durationMs:    number;
  inputHash:     string;       // Hash des données d'entrée
  outputHash:    string;       // Hash des données de sortie
  chainHash:     string;       // Hash cumulatif de la chaîne
  status:        'success' | 'failed' | 'skipped';
  errorCode?:    string;
  fallbackUsed?: string;
}
```

---

## Publication Kafka

Chaque entrée d'audit est publiée sur le topic Kafka `eyeflow.audit` :

```json
{
  "topic": "eyeflow.audit",
  "partition": "hash_by_rule_id",
  "message": {
    "executionId": "exec_01HABC...",
    "ruleId": "cmp_01HXYZ...",
    "finalHash": "sha256:d4e7f2...",
    "signature": "ed25519:abc123...",
    "durationMs": 312,
    "status": "completed",
    "timestamp": 1740000000000
  }
}
```

Les consommateurs peuvent s'abonner à ce topic pour :
- Alimenter des dashboards temps réel
- Déclencher des alertes sur des patterns
- Archiver vers un système de compliance long terme
- Intégrer vers un SIEM

---

## Intégration InfluxDB + Grafana

EyeFlow exporte automatiquement des métriques vers InfluxDB :

```toml
# eyeflow-server.toml
[observability]
influxdb_url    = "http://influxdb:8086"
influxdb_bucket = "eyeflow_metrics"
influxdb_org    = "my-org"
influxdb_token  = "${INFLUXDB_TOKEN}"

metrics_interval_s = 30
```

### Métriques disponibles

| Métrique | Type | Description |
|---------|------|-------------|
| `eyeflow_executions_total` | Counter | Exécutions par règle/nœud |
| `eyeflow_execution_duration_ms` | Histogram | Distribution des temps d'exécution |
| `eyeflow_errors_total` | Counter | Erreurs par type/règle |
| `eyeflow_llm_call_duration_ms` | Histogram | Latence des appels LLM |
| `eyeflow_fallback_total` | Counter | Activations du FallbackEngine |
| `eyeflow_postcondition_failures` | Counter | Échecs de postcondition |
| `eyeflow_node_heartbeat` | Gauge | Santé des nœuds SVM |
| `eyeflow_buffer_depth` | Gauge | Événements en attente (offline) |

### Dashboard Grafana inclus

EyeFlow fournit un dashboard Grafana préconfigué :

```bash
# Importer le dashboard
curl -X POST http://grafana:3000/api/dashboards/import \
  -H "Content-Type: application/json" \
  -d @eyeflow-grafana-dashboard.json
```

---

## Vérification indépendante

N'importe quel auditeur peut vérifier l'intégrité d'une exécution :

```bash
# Récupérer l'audit d'une exécution
curl http://localhost:3000/api/audit/{executionId} \
  -H "Authorization: Bearer $TOKEN" > audit.json

# Vérifier la chaîne de hashes
eyeflow-cli audit verify --file audit.json

# Vérifier la signature du nœud SVM
eyeflow-cli audit verify-signature \
  --file audit.json \
  --pubkey node-prod-01.ed25519.pub
```

Sortie :
```
✅ Chain integrity: VALID (12 instructions, 0 breaks)
✅ Node signature: VALID (node-prod-01)
✅ Rule signature: VALID (admin@company.com)
✅ Timestamp coherence: VALID
Audit entry is cryptographically sound.
```

---

## Conformité réglementaire

### RGPD — Traçabilité des décisions automatisées

L'article 22 RGPD exige la traçabilité des décisions automatisées sur données personnelles. EyeFlow fournit :
- Log de chaque décision avec heure et règle précise
- Export structuré pour réponse aux demandes d'accès (DSAR)
- Pseudo-anonymisation configurable dans les logs

### NIS2 — Résilience des infrastructures critiques

- Audit trail complet des configurations modifiées
- Log des révocations de capabilities
- Alertes sur comportements anormaux
- Rapports de disponibilité par période

### ISO 13485 / IEC 62304 (Médical)

- Traçabilité exigences → code → exécution
- Validation de chaque lot de déploiement
- Documentation de la vérification formelle Z3

---

## Prochaines étapes

👉 [Sécurité](./security) — modèle de menace et protections  
👉 [Contrôle physique](./physical-control) — logs des actions physiques  
👉 [Développeurs — Déploiement](../for-developers/deployment) — configuration InfluxDB/Grafana
