---
id: llm-calls
sidebar_position: 8
title: Appels LLM avancés
description: CompiledLLMContext figé, pipeline multi-LLM, boucles de raisonnement bornées, génération contrainte par logit_bias et résolution de slots dynamiques.
---

# Appels LLM avancés

EyeFlow utilise les LLM de manière **radicalement différente** des systèmes agents classiques : les appels LLM sont figés à la compilation et exécutés de façon déterministe à l'exécution.

---

## CompiledLLMContext — Contexte figé

À la compilation, chaque instruction `LLM_CALL` reçoit un `CompiledLLMContext` complet qui est **sérialisé dans le binaire** :

```typescript
interface LlmCompiledContext {
  // Modèle et paramètres
  model:        string;    // "gpt-4o-2024-08-06" — version exacte
  temperature:  number;    // Calibrée au type de tâche
  maxTokens:    number;
  
  // Contexte système
  systemPrompt: string;    // Prompt structuré anti-hallucination
  
  // Exemples figés
  fewShotExamples: LlmFewShotExample[];
  
  // Schéma de sortie
  outputSchema: object;    // JSON Schema — utilisé pour logit_bias
  
  // Slots dynamiques (résolus à l'exécution)
  dynamicSlots: LlmDynamicSlot[];
  
  // Template de prompt optionnel
  promptTemplate?: string;
}
```

### Calibration automatique de la température

Le compilateur calibre automatiquement `temperature` selon le type de tâche détecté :

| Type de tâche | Mots-clés détectés | Temperature |
|---------------|-------------------|-------------|
| Extraction | extrai*, lire, identifier | **0.0** |
| Validation | valid*, vérifie*, classifie* | **0.1** |
| Raisonnement | analyser, diagnostiquer, expliquer | **0.3** |
| Génération | rédige*, créer, générer | **0.7** |

---

## Few-Shot Examples figés

Les exemples few-shot sont compilés dans le binaire et ne changent jamais à l'exécution :

```json
{
  "fewShotExamples": [
    {
      "label": "overpressure_detection",
      "inputJson": "{\"temp\": 145, \"pressure\": 8.2, \"level\": 0.91}",
      "outputJson": "{\"state\": \"overpressure\", \"action\": \"close_valve\"}"
    },
    {
      "label": "normal_state",
      "inputJson": "{\"temp\": 72, \"pressure\": 4.1, \"level\": 0.45}",
      "outputJson": "{\"state\": \"normal\", \"action\": \"log_only\"}"
    }
  ]
}
```

Ces exemples guident le LLM vers des sorties structurées cohérentes, **sans laisser place à l'improvisation**.

---

## Génération contrainte par logit_bias

EyeFlow utilise la fonctionnalité `logit_bias` des APIs LLM pour contraindre les tokens générables :

```typescript
// Construire le logit_bias depuis l'outputSchema
function buildLogitBias(schema: JSONSchema): Record<string, number> {
  const bias: Record<string, number> = {};
  
  if (schema.type === 'object') {
    // Forcer les tokens structurels JSON
    STRUCTURAL_TOKENS.forEach(t => bias[t] = 20);
  }
  
  if (schema.properties?.state?.enum) {
    // Seuls les tokens de l'enum sont autorisés pour ce champ
    const validTokens = schema.properties.state.enum
      .flatMap(v => tokenize(v));
    ALL_TOKENS
      .filter(t => !validTokens.includes(t))
      .forEach(t => bias[t] = -100);  // Interdit
  }
  
  return bias;
}
```

Résultat : le LLM ne peut **physiquement pas** générer une valeur hors domaine.

---

## Dynamic Slots — Résolution à l'exécution

Les `dynamicSlots` permettent d'injecter des données fraîches au moment de l'exécution, **tout en maintenant le déterminisme** (le schéma du slot est figé à la compilation) :

```typescript
interface LlmDynamicSlot {
  slotId:     string;   // Clé dans le template de prompt
  sourceType: 'vault' | 'runtime';
  sourceKey:  string;   // Chemin Vault ou dot-notation runtime
}
```

### Slot depuis Vault (secrets)

```json
{
  "slotId": "api_endpoint",
  "sourceType": "vault",
  "sourceKey": "industrial/T-04/llm_endpoint"
}
```

La SVM appelle `VaultClient::fetch("industrial/T-04/llm_endpoint")` juste avant l'appel LLM.

### Slot depuis le contexte runtime

```json
{
  "slotId": "current_sensor_values",
  "sourceType": "runtime",
  "sourceKey": "event.payload.sensors"
}
```

La SVM extrait `event.payload.sensors` du contexte d'exécution courant via dot-notation.

---

## Pipeline Multi-LLM

EyeFlow supporte le **chaînage de plusieurs LLMs** dans un seul programme, chacun avec un rôle spécifique :

```
Données brutes
      │
      ▼ LLM_CALL (Gemini Flash) — extraction rapide bon marché
      │ { entity: "tank-T04", metric: "temp", value: 148.5 }
      │
      ▼ LLM_CALL (GPT-4o) — raisonnement approfondi
      │ { diagnosis: "thermal_expansion", severity: "high", root_cause: "..." }
      │
      ▼ LLM_CALL (Claude) — rédaction rapport
        { report: "Suite à l'analyse thermique..." }
```

Configuration dans la règle :

```json
{
  "llmPipeline": [
    {
      "step": "extraction",
      "model": "gemini-1.5-flash",
      "temperature": 0.0,
      "role": "fast_extraction"
    },
    {
      "step": "reasoning",
      "model": "gpt-4o-2024-08-06",
      "temperature": 0.3,
      "role": "deep_analysis",
      "inputFrom": "extraction"
    },
    {
      "step": "reporting",
      "model": "claude-3-5-sonnet",
      "temperature": 0.5,
      "role": "narrative_generation",
      "inputFrom": "reasoning"
    }
  ]
}
```

Les 3 modèles, leurs paramètres et leurs exemples few-shot sont tous **figés dans le binaire**.

---

## Boucles de raisonnement bornées

Pour les tâches qui nécessitent plusieurs itérations LLM (ex: révision progressive d'un diagnostic), EyeFlow impose une borne stricte :

```protobuf
message LoopConfig {
  int32 max_iterations = 1;     // REQUIS — refusé par Z3 si absent
  string exit_condition = 2;    // Condition d'arrêt précoce
  bool   require_progress = 3;  // Arrêt si pas d'amélioration
}
```

Z3 vérifie à la compilation que toute boucle a un `max_iterations > 0`.

```json
{
  "loop": {
    "maxIterations": 3,
    "exitCondition": "diagnosis.confidence > 0.95",
    "requireProgress": true
  }
}
```

Si `requireProgress: true` et que deux itérations consécutives produisent un résultat identique → la boucle s'arrête automatiquement.

---

## Prompt système anti-hallucination

Chaque appel LLM reçoit automatiquement ce prompt système structuré :

```
Tu es un système d'analyse déterministe pour application critique.
Règles absolues :
1. Réponds UNIQUEMENT dans le format JSON spécifié
2. N'invente JAMAIS de données non présentes dans l'input
3. Si tu n'es pas certain, utilise le champ "confidence" < 0.7
4. Ne génère JAMAIS de valeurs hors des enums définis
5. Chaque champ required DOIT être présent dans ta réponse
6. En cas d'ambiguïté, choisis la valeur la plus conservative (sécurité)
7. N'ajoute JAMAIS de champs non définis dans le schéma
8. Ta réponse doit être parseable par JSON.parse() sans erreur
Input : {input_data}
```

---

## Prochaines étapes

👉 [Compilation sémantique](./semantic-compilation) — comment le contexte est injecté pendant la compilation  
👉 [SVM Runtime](./svm-runtime) — résolution des slots à l'exécution  
👉 [Sécurité](./security) — modèle de menace contre l'injection de prompt
