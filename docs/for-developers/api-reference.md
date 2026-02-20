---
id: api-reference
sidebar_position: 2
title: Référence API REST
description: Tous les endpoints REST exposés par eyeflow-server — compilation, déploiement, exécution, audit, connecteurs et WebSocket.
---

# Référence API REST

**Base URL :** `http://localhost:3000/api`  
**Auth :** `Authorization: Bearer <JWT>`  
**Format :** `Content-Type: application/json`

---

## Authentification

### `POST /auth/login`

Obtenir un token JWT.

**Request:**
```json
{
  "email": "admin@example.com",
  "password": "secret"
}
```

**Response 200:**
```json
{
  "access_token": "eyJhbGci...",
  "expires_in": 86400,
  "token_type": "Bearer"
}
```

---

## Règles & Compilation

### `POST /rules`

Soumettre une règle en langage naturel pour compilation.

**Request:**
```json
{
  "name": "surveillance_cuve_chimique",
  "description": "string",
  "naturalLanguage": "Si la température de la cuve dépasse 85°C, fermer la vanne V-01 et alerter l'opérateur.",
  "targetNodeIds": ["svm-nœud-usine-A"],
  "priority": "HIGH",
  "sector": "INDUSTRIAL"
}
```

**Response 202:**
```json
{
  "id": "rule-abc123",
  "status": "COMPILING",
  "compilationId": "comp-xyz789",
  "estimatedCompileTimeMs": 4200
}
```

---

### `GET /rules/:id`

Obtenir l'état et les métadonnées d'une règle.

**Response 200:**
```json
{
  "id": "rule-abc123",
  "name": "surveillance_cuve_chimique",
  "status": "COMPILED",
  "compiledAt": "2024-10-15T14:23:45.000Z",
  "irVersion": "2.4.0",
  "z3Verified": true,
  "signature": "dGhpcyBpcyBhIGZha2Ugc2lnbmF0dXJl",
  "deployedNodes": ["svm-nœud-usine-A"]
}
```

---

### `GET /rules/:id/ir`

Obtenir le programme LLM-IR compilé (protobuf ou JSON selon `Accept`).

**Headers:**
- `Accept: application/json` → JSON human-readable
- `Accept: application/octet-stream` → binaire protobuf

**Response 200 (`application/json`):**
```json
{
  "version": "2.4.0",
  "ruleId": "rule-abc123",
  "capabilities": ["valve_control", "sensor_read", "alert_send"],
  "instructions": [
    {
      "id": "instr-001",
      "opcode": "LOAD_RESOURCE",
      "operands": ["sensor:temperature_cuve"],
      "timeout_ms": 2000
    },
    {
      "id": "instr-002",
      "opcode": "EVAL",
      "condition": "ctx.temperature_cuve > 85.0",
      "successTarget": "instr-003",
      "failureTarget": "instr-end"
    },
    {
      "id": "instr-003",
      "opcode": "CALL_ACTION",
      "capability": "valve_control",
      "operands": {"valve_id": "V-01", "action": "CLOSE"},
      "fallbackStrategy": "RETRY_ONCE_THEN_ALERT"
    }
  ]
}
```

---

### `POST /rules/:id/validate`

Déclencher une validation humaine et Z3.

**Request:**
```json
{
  "validatorUserId": "user-operator-42"
}
```

**Response 200:**
```json
{
  "validationId": "val-111",
  "status": "PENDING_HUMAN",
  "z3Result": {
    "verified": true,
    "proofMs": 87,
    "constraints": 12
  }
}
```

---

### `POST /rules/:id/deploy`

Déployer le programme LLM-IR sur les nœuds SVM cibles.

**Request:**
```json
{
  "strategy": "ROLLING",
  "targetNodeIds": ["svm-nœud-usine-A", "svm-nœud-usine-B"],
  "rolloutPercent": 100
}
```

**Response 202:**
```json
{
  "deploymentId": "dep-deploy-001",
  "status": "IN_PROGRESS",
  "targetNodes": 2,
  "pushedNodes": 0
}
```

---

### `DELETE /rules/:id`

Révoquer et supprimer une règle (soft delete + révocation signature).

**Response 200:**
```json
{
  "revoked": true,
  "revokedAt": "2024-10-15T16:00:00.000Z"
}
```

---

## Exécutions

### `GET /executions`

Lister les dernières exécutions.

**Query params:**
| Paramètre | Type | Description |
|-----------|------|-------------|
| `ruleId` | string | Filtrer par règle |
| `nodeId` | string | Filtrer par nœud SVM |
| `status` | string | `SUCCESS`, `FAILED`, `IN_PROGRESS` |
| `limit` | number | Défaut: 50, max: 500 |
| `since` | ISO8601 | Depuis une date |

**Response 200:**
```json
{
  "executions": [
    {
      "id": "exec-555",
      "ruleId": "rule-abc123",
      "nodeId": "svm-nœud-usine-A",
      "status": "SUCCESS",
      "startedAt": "2024-10-15T15:00:01.000Z",
      "durationMs": 312,
      "instructionsExecuted": 5,
      "auditChainHash": "sha256:7f3d2a..."
    }
  ],
  "total": 1,
  "page": 1
}
```

---

### `GET /executions/:id`

Obtenir le détail complet d'une exécution avec la trace d'instructions.

**Response 200:**
```json
{
  "id": "exec-555",
  "ruleId": "rule-abc123",
  "status": "SUCCESS",
  "trace": [
    {
      "instructionId": "instr-001",
      "opcode": "LOAD_RESOURCE",
      "startedAt": "2024-10-15T15:00:01.010Z",
      "durationMs": 45,
      "result": {"temperature_cuve": 87.3},
      "auditHash": "sha256:a1b2c3..."
    },
    {
      "instructionId": "instr-002",
      "opcode": "EVAL",
      "durationMs": 1,
      "result": {"condition": true},
      "auditHash": "sha256:d4e5f6..."
    },
    {
      "instructionId": "instr-003",
      "opcode": "CALL_ACTION",
      "durationMs": 204,
      "result": {"valve_V-01": "CLOSED"},
      "auditHash": "sha256:789abc..."
    }
  ]
}
```

---

### `POST /events/simulate`

Simuler un événement entrant sur un nœud SVM (environnement de test seulement).

**Request:**
```json
{
  "nodeId": "svm-nœud-usine-A",
  "ruleId": "rule-abc123",
  "payload": {
    "source": "sensor:temperature_cuve",
    "value": 92.0,
    "timestamp": "2024-10-15T15:30:00.000Z"
  }
}
```

**Response 200:**
```json
{
  "simulationId": "sim-999",
  "executionId": "exec-sim-999",
  "triggered": true,
  "durationMs": 294
}
```

---

## Catalog de Capabilities

### `GET /catalog`

Lister toutes les capabilities disponibles.

**Response 200:**
```json
{
  "capabilities": [
    {
      "id": "valve_control",
      "version": "1.2.0",
      "sector": "INDUSTRIAL",
      "description": "Contrôle des vannes industrielles",
      "signatureValid": true
    }
  ]
}
```

---

### `POST /catalog`

Enregistrer une nouvelle capability.

**Request:**
```json
{
  "id": "custom_pump_control",
  "version": "1.0.0",
  "sector": "INDUSTRIAL",
  "description": "Contrôle pompes centrifuges",
  "handler": "handlers/pump-control.ts",
  "preconditions": [...],
  "postconditions": [...],
  "rollbackStrategy": "IDEMPOTENT_REVERSE"
}
```

**Response 201:**
```json
{
  "id": "custom_pump_control",
  "signature": "Ed25519:...",
  "registeredAt": "2024-10-15T10:00:00.000Z"
}
```

---

## Nœuds SVM

### `GET /nodes`

Lister tous les nœuds SVM enregistrés.

**Response 200:**
```json
{
  "nodes": [
    {
      "id": "svm-nœud-usine-A",
      "hostname": "factory-edge-01",
      "type": "LINUX_X86",
      "status": "ONLINE",
      "lastHeartbeat": "2024-10-15T15:59:30.000Z",
      "irVersion": "2.4.0",
      "loadedRules": 3,
      "cpuPercent": 12,
      "memoryMb": 145
    }
  ]
}
```

---

### `GET /nodes/:id/executions`

Exécutions d'un nœud spécifique.  
→ Mêmes paramètres que `GET /executions` avec filtrage automatique par nœud.

---

## Audit

### `GET /audit`

Requêter le journal d'audit.

**Query params:**
| Paramètre | Type | Description |
|-----------|------|-------------|
| `executionId` | string | Audit d'une exécution |
| `ruleId` | string | Toutes les exécutions d'une règle |
| `since` / `until` | ISO8601 | Fenêtre temporelle |
| `format` | string | `json` (défaut) ou `csv` |

---

### `POST /audit/verify`

Vérifier l'intégrité de la chaîne de hachage d'une exécution.

**Request:**
```json
{
  "executionId": "exec-555"
}
```

**Response 200:**
```json
{
  "valid": true,
  "chainLength": 5,
  "firstHash": "sha256:aaa...",
  "lastHash": "sha256:zzz...",
  "verifiedAt": "2024-10-15T16:00:00.000Z"
}
```

---

## WebSocket API

**URL :** `ws://localhost:3000/ws` (TLS en prod: `wss://...`)

### Topics disponibles

```json
// S'abonner à toutes les exécutions d'une règle
{ "type": "SUBSCRIBE", "topic": "executions", "ruleId": "rule-abc123" }

// S'abonner aux heartbeats d'un nœud
{ "type": "SUBSCRIBE", "topic": "node-status", "nodeId": "svm-nœud-usine-A" }

// S'abonner aux événements d'audit
{ "type": "SUBSCRIBE", "topic": "audit-stream" }
```

### Messages entrants (serveur → client)

```json
// Démarrage d'exécution
{
  "type": "EXECUTION_STARTED",
  "executionId": "exec-777",
  "ruleId": "rule-abc123",
  "nodeId": "svm-nœud-usine-A",
  "timestamp": "2024-10-15T15:00:01.000Z"
}

// Instruction exécutée
{
  "type": "INSTRUCTION_EXECUTED",
  "executionId": "exec-777",
  "instructionId": "instr-003",
  "opcode": "CALL_ACTION",
  "result": {"valve_V-01": "CLOSED"}
}

// Fin d'exécution
{
  "type": "EXECUTION_COMPLETED",
  "executionId": "exec-777",
  "status": "SUCCESS",
  "durationMs": 312
}
```

---

## Codes d'erreur

| Code HTTP | Code interne | Description |
|-----------|-------------|-------------|
| 400 | `INVALID_RULE_SYNTAX` | Règle non parsable |
| 400 | `IR_VALIDATION_FAILED` | Programme IR invalide |
| 401 | `UNAUTHORIZED` | Token manquant ou expiré |
| 403 | `INSUFFICIENT_PERMISSIONS` | RBAC insuffisant |
| 404 | `RULE_NOT_FOUND` | Règle introuvable |
| 409 | `RULE_ALREADY_DEPLOYED` | Redéploiement d'une règle active |
| 422 | `Z3_VERIFICATION_FAILED` | Preuve Z3 échouée |
| 422 | `SIGNATURE_INVALID` | Signature LLM-IR corrompue |
| 500 | `COMPILATION_ERROR` | Erreur interne compilateur |
| 503 | `SVM_NODE_OFFLINE` | Nœud SVM inaccessible |
