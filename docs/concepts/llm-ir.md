---
id: llm-ir
sidebar_position: 2
title: Format LLM-IR
description: Structure du format binaire LLM-IR — protobuf, schéma des messages, versionnage semver, matrice de compatibilité et signature Ed25519.
---

# Format LLM-IR

Le **LLM-IR** (LLM Intermediate Representation) est le format binaire dans lequel le compilateur sémantique encode les programmes. C'est l'équivalent du bytecode JVM ou de LLVM IR — mais conçu pour l'exécution de règles métier déterministes.

---

## Structure générale

```protobuf
// llm_ir.proto

syntax = "proto3";

message LlmIRProgram {
  string  program_id    = 1;
  string  name          = 2;
  string  version       = 3;       // semver: "1.2.3"
  int64   compiled_at   = 4;       // Unix timestamp
  string  compiled_by   = 5;       // email ou ID utilisateur
  bytes   signature     = 6;       // Ed25519 sur sha256(program_id+instructions)
  string  ir_version    = 7;       // "2.0" — version du format LLM-IR
  repeated IRInstruction instructions = 8;
  ProgramMetadata metadata = 9;
}

message IRInstruction {
  string  instruction_id  = 1;
  IROpcode opcode         = 2;
  string  comment         = 3;
  DispatchMetadata dispatch_metadata = 4;
  repeated string depends_on = 5;  // IDs des instructions précédentes
  FallbackConfig  fallback    = 6;
  RetryConfig     retry       = 7;
  TimeoutConfig   timeout     = 8;
  PermissionFlags permissions = 9;
  int32   sequence_number = 10;
  bool    is_parallel     = 11;
  string  branch_condition = 12;
  string  branch_true_id  = 13;
  string  branch_false_id = 14;
  PriorityPolicy priority_policy = 15;
}

message DispatchMetadata {
  string  target_service   = 1;
  string  action_name      = 2;
  string  input_schema     = 3;
  string  output_schema    = 4;
  string  capability_id    = 5;
  string  capability_version = 6;
  string  model            = 7;
  float   temperature      = 8;
  int32   max_tokens       = 9;
  string  system_prompt    = 10;
  string  prompt_template  = 11;
  int32   max_retries      = 12;
  int32   timeout_ms       = 13;
  bool    requires_human_validation = 14;
  string  vault_secret_key = 15;
  string  output_format    = 16;
  repeated FewShotExample  few_shot_examples = 17;
  repeated DynamicSlot     dynamic_slots     = 18;
}

message FewShotExample {
  string input_json  = 1;
  string output_json = 2;
  string label       = 3;
}

message DynamicSlot {
  string slot_id    = 1;   // clé dans le template
  string source_type = 2;  // "vault" ou "runtime"
  string source_key  = 3;  // chemin Vault ou dot-notation runtime
}

message PriorityPolicy {
  int32 priority_level = 1;  // 0=CRITICAL, 64=HIGH, 128=NORMAL, 192=LOW, 255=BACKGROUND
  bool  preemptible    = 2;
  int32 max_wait_ms    = 3;
}
```

---

## Opcodes supportés

| Opcode | Description |
|--------|-------------|
| `LOAD_RESOURCE` | Charge une ressource (capteur, DB, API, fichier) |
| `CALL_FUNCTION` | Appel de fonction interne (transformation, calcul) |
| `CALL_SERVICE` | Appel à un service externe (HTTP, gRPC) |
| `CALL_ACTION` | Exécution d'une CatalogCapability (actionneur, notification) |
| `CALL_API` | Appel API REST externe |
| `LLM_CALL` | Appel LLM avec CompiledLLMContext figé |
| `EVAL` | Évaluation de condition pour branchement |
| `BRANCH` | Branchement conditionnel (true/false) |
| `MERGE` | Fusion de branches parallèles |
| `LOOP` | Boucle bornée (max_iterations obligatoire) |
| `RETURN` | Fin du programme (succès ou échec) |
| `EMIT_EVENT` | Émission d'un événement vers Kafka/MQTT |
| `STORE` | Persistance d'une valeur en mémoire SVM |
| `LOAD` | Lecture depuis la mémoire SVM |

---

## Versionnage et compatibilité

Les programmes LLM-IR sont versionnés en **semver** (`MAJOR.MINOR.PATCH`).

### Règles de compatibilité

| Changement | Impact version | Compatibilité SVM |
|-----------|---------------|-------------------|
| Ajout d'instructions optionnelles | PATCH | ✅ Rétrocompatible |
| Modification d'une condition | MINOR | ✅ Rétrocompatible |
| Changement de capability requise | MINOR | ⚠️ Vérifier catalog |
| Changement d'opcode sémantique | MAJOR | ❌ Recompilation requise |
| Changement de schéma LLM | MAJOR | ❌ Recompilation requise |

### Matrice de compatibilité SVM

| Version IR | SVM 1.x | SVM 2.x | SVM 3.x |
|-----------|---------|---------|---------|
| IR 1.0 | ✅ | ✅ | ✅ |
| IR 1.5 | ✅ | ✅ | ✅ |
| IR 2.0 | ❌ | ✅ | ✅ |
| IR 2.5 | ❌ | ✅ | ✅ |
| IR 3.0 | ❌ | ❌ | ✅ |

La SVM vérifie `ir_version` au chargement et refuse les binaires incompatibles.

---

## Signature Ed25519

Chaque programme est signé par la clé privée Ed25519 de l'administrateur EyeFlow :

```
payload = sha256(program_id + compiled_at + instructions_canonical)
signature = Ed25519Sign(admin_private_key, payload)
```

La SVM vérifie :
```rust
Ed25519Verify(admin_public_key, payload, signature) == true
```

Un binaire non signé ou avec une signature invalide est **immédiatement rejeté** — pas de fallback.

---

## Taille et performance

| Métrique | Valeur typique |
|----------|---------------|
| Taille binaire (règle simple) | 2–8 KB |
| Taille binaire (règle complexe multi-LLM) | 15–50 KB |
| Temps de désérialisation | < 1ms |
| Temps de vérification signature | < 1ms |
| Temps d'exécution (sans LLM_CALL) | < 5ms |
| Temps d'exécution (avec 1 LLM_CALL) | 200–800ms |

---

## Inspecter un binaire

```bash
# Via l'API REST
curl http://localhost:3000/api/rules/{id}/ir \
  -H "Authorization: Bearer $TOKEN" | jq .

# Décoder manuellement (outil CLI EyeFlow)
eyeflow-cli ir decode --file programme.bin --pretty

# Vérifier la signature
eyeflow-cli ir verify --file programme.bin --pubkey admin.pub
```

---

## Prochaines étapes

👉 [Catalog de capabilities](./capability-catalog) — signatures et versionnage des capabilities  
👉 [SVM Runtime](./svm-runtime) — exécution des instructions LLM-IR  
👉 [Appels LLM](./llm-calls) — CompiledLLMContext et multi-LLM pipeline
