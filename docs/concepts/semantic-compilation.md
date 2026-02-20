---
id: semantic-compilation
sidebar_position: 1
title: Compilation sémantique
description: Les 6 phases de transformation d'une règle en langage naturel vers un binaire LLM-IR signé et vérifiable formellement.
---

# Compilation sémantique

La compilation sémantique est le cœur d'EyeFlow. Elle transforme une description en langage naturel en un **programme exécutable, déterministe et formellement vérifié** en 6 phases.

---

## Vue d'ensemble du pipeline

```
Phase 1: NLP → AST
  Extraction des entités, conditions, actions, temporalité

Phase 2: AST → DAG
  Construction du graphe d'exécution avec dépendances

Phase 3: Validation humaine
  Interface de confirmation avant vérification formelle

Phase 4: Vérification formelle Z3
  SMT solver : invariants, conflits, boucles, permissions

Phase 5: Injection des contextes
  CompiledLLMContext (§3.4) + PriorityPolicy (§6.5)

Phase 6: Sérialisation et signature
  Binaire protobuf + hash SHA-256 + signature Ed25519
```

---

## Phase 1 — NLP → AST

### Extraction sémantique

Le compilateur envoie la règle au LLM avec une **génération contrainte** (logit_bias token masking) pour garantir une sortie strictement structurée.

Exemple d'entrée :
```
"Si la température dépasse 85°C, fermer la vanne V-04 et envoyer une alerte."
```

AST généré :
```json
{
  "type": "ConditionalRule",
  "trigger": {
    "type": "SensorThreshold",
    "sensor": "temperature",
    "operator": "gt",
    "value": 85,
    "unit": "celsius"
  },
  "actions": [
    { "type": "ActuatorControl", "target": "V-04", "command": "close" },
    { "type": "Notification", "channel": "alert", "severity": "high" }
  ]
}
```

### Génération contrainte (§3.3)

EyeFlow utilise le **masquage logit_bias** pour contraindre le LLM à produire des tokens valides uniquement :

```typescript
const logitBias: Record<string, number> = {};
// Tokens interdits → score -100 (jamais générés)
FORBIDDEN_TOKENS.forEach(token => { logitBias[token] = -100; });
// Tokens requis → score +20 (fortement favorisés)  
REQUIRED_STRUCTURE.forEach(token => { logitBias[token] = 20; });
```

Cette technique garantit que la sortie LLM est **toujours un JSON valide** conforme au schéma AST défini, éliminant les hallucinations structurelles.

---

## Phase 2 — AST → DAG

L'AST est transformé en un **Directed Acyclic Graph** d'instructions LLM-IR.

Chaque nœud du DAG est une instruction :
- `LOAD_RESOURCE` — lecture de capteur, base de données, API
- `EVAL` — évaluation de condition (branchement)
- `LLM_CALL` — appel LLM avec contexte figé
- `CALL_ACTION` — exécution via CatalogCapability
- `CALL_SERVICE` — appel service externe
- `RETURN` — fin du programme

L'optimiseur identifie les instructions parallélisables et les regroupe :

```
LOAD_RESOURCE(capteur_1)   ──┐
LOAD_RESOURCE(capteur_2)   ──┼─→ EVAL(condition_composite)
LOAD_RESOURCE(capteur_3)   ──┘
```

---

## Phase 3 — Validation humaine

Avant de passer à la vérification formelle, le compilateur présente à l'opérateur :

1. **Le DAG visuel** — graphe interactif dans le dashboard
2. **La sémantique extraite** — résumé en langage naturel de ce qui sera exécuté
3. **Les capabilities requises** — liste des permissions demandées
4. **Les risques détectés** — actions physiques irréversibles signalées

L'opérateur peut **modifier le DAG** avant validation (édition des conditions, ajout d'étapes, modification des seuils).

---

## Phase 4 — Vérification formelle Z3

Une fois validé, le programme passe par **Z3 Theorem Prover** (Microsoft Research).

### Invariants vérifiés

| Invariant | Description |
|-----------|-------------|
| Unreachable code | Branches ne pouvant jamais être atteintes |
| Condition contradiction | `A AND NOT A`, `x > 5 AND x < 3` |
| LLM loops bounded | `max_iterations` présent sur toute boucle LLM |
| Permission coherence | Pas de `CALL_ACTION X` sans capability `X` déclarée |
| Physical action guards | `CALL_ACTION actuator.*` précédé d'un `LOAD_RESOURCE` |
| Output schema coverage | Enum LLM couvre tous les branchements downstream |

### Format du rapport

```json
{
  "z3Version": "4.13.0",
  "invariantsChecked": 12,
  "conflicts": 0,
  "unreachableBranches": 0,
  "proofTime": "340ms",
  "status": "SATISFIABLE",
  "signature": "allowed"
}
```

Si Z3 retourne `UNSATISFIABLE`, la signature est refusée et un rapport détaillé est retourné au compilateur avec la contradiction trouvée.

---

## Phase 5 — Injection des contextes

### CompiledLLMContext (§3.4)

Pour chaque instruction `LLM_CALL` du DAG, le compilateur injecte un contexte figé :

```typescript
interface LlmCompiledContext {
  model: string;           // Modèle exact utilisé
  temperature: number;     // Calibrée au type de tâche
  maxTokens: number;
  systemPrompt: string;    // Prompt anti-hallucination structuré
  fewShotExamples: LlmFewShotExample[];
  outputSchema: object;    // JSON Schema pour logit_bias
  dynamicSlots: LlmDynamicSlot[];  // Vault ou runtime
  promptTemplate?: string;
}
```

**Calibration automatique de la température :**
| Type de tâche | Temperature |
|---------------|-------------|
| Extraction de données | 0.0 |
| Validation / classification | 0.1 |
| Raisonnement structuré | 0.3 |
| Génération de texte | 0.7 |

### PriorityPolicy (§6.5)

Chaque instruction reçoit une politique de priorité dérivée heuristiquement :

```typescript
interface PriorityPolicy {
  priorityLevel: number;  // 0=CRITICAL, 64=HIGH, 128=NORMAL, 192=LOW, 255=BACKGROUND
  preemptible: boolean;
  maxWaitMs: number;
}
```

Heuristiques :
- Mots-clés `safety`, `medical`, `SIL` → `CRITICAL (0)`, non-préemptible, 500ms
- `CALL_ACTION` → `HIGH (64)`, non-préemptible, 2000ms
- `analytics`, `reporting` → `BACKGROUND (255)`, préemptible
- Défaut : `NORMAL (128)`, préemptible, 10000ms

---

## Phase 6 — Sérialisation et signature

Le DAG annoté est sérialisé en **protobuf binaire** (format LLM-IR) et signé :

```
Binaire protobuf
      │
      ├─→ SHA-256 hash  ─→ stocké dans le manifest
      │
      └─→ Ed25519 signature (clé Admin) ─→ attachée au binaire
```

La SVM vérifie la signature avant tout chargement. Un binaire modifié (même d'un bit) est **rejeté immédiatement**.

---

## Reproductibilité garantie

Même règle, même contexte, même entrée → **exactement le même résultat**.

Cela est possible parce que :
1. Le LLM n'intervient qu'à la compilation (non à l'exécution)
2. Le `CompiledLLMContext` est figé dans le binaire
3. La SVM est un exécuteur déterministe sans état global

---

## Prochaines étapes

👉 [Format LLM-IR](./llm-ir) — structure du binaire protobuf  
👉 [Catalog de capabilities](./capability-catalog) — signatures et versionnage  
👉 [SVM Runtime](./svm-runtime) — exécution des instructions
