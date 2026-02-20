---
id: what-is-eyeflow
sidebar_position: 1
title: Qu'est-ce qu'EyeFlow ?
description: EyeFlow est un compilateur sémantique qui transforme des règles métier en langage naturel en programmes exécutables déterministes, certifiables et déployables sur systèmes embarqués critiques.
---

# Qu'est-ce qu'EyeFlow ?

**EyeFlow** est une plateforme de **compilation sémantique** : elle transforme des règles métier rédigées en langage naturel en **programmes exécutables, déterministes et signés cryptographiquement**, sans que le LLM n'intervienne jamais à l'exécution.

:::tip Principe fondateur
Le LLM est un **compilateur statique**, pas un décideur dynamique. Une fois compilé, le programme s'exécute de manière **100 % reproductible**, auditée et certifiable IEC 62304 / SIL.
:::

---

## Vue d'ensemble

```
Règle métier (langage naturel)
        │
        ▼
┌─────────────────────────────────┐
│    Compilateur Sémantique       │
│    (NestJS + LLM statique)      │
│                                 │
│  ① NLP → AST                   │
│  ② AST → DAG de tâches          │
│  ③ Validation humaine           │
│  ④ Vérification formelle Z3     │
│  ⑤ Injection CompiledLLMContext │
│  ⑥ PriorityPolicy injection     │
│  ⑦ Binaire LLM-IR signé Ed25519 │
└──────────────┬──────────────────┘
               │  Programme protobuf signé
               ▼
┌──────────────────────────────────┐
│   SVM — Semantic Virtual Machine │
│   (Rust + Tokio)                 │
│   Zéro LLM à l'exécution        │
└──────────┬───────────────────────┘
           │
    ┌──────┴───────┐
    ▼              ▼
Linux Edge     MCU Embassy
(RPi, x86)    (STM32, nRF52)
```

---

## Les 4 piliers

### 1. Déterminisme absolu

Le LLM est invoqué **une seule fois** — à la compilation. Chaque instruction `LLM_CALL` embarque un `CompiledLLMContext` figé :

| Champ | Description |
|-------|-------------|
| `model` | Modèle exact utilisé à la compilation |
| `temperature` | Calibrée au type : 0.0 extraction · 0.3 raisonnement · 0.7 génération |
| `fewShotExamples` | Exemples figés compilés dans le binaire |
| `outputSchema` | JSON Schema pour le masquage `logit_bias` |
| `dynamicSlots` | Slots résolus depuis Vault ou runtime |

À l'exécution, la SVM envoie ce contexte figé — aucune décision dynamique.

### 2. Vérification formelle Z3

Chaque programme passe par **Z3 Theorem Prover** avant signature :

- Détection de code mort (unreachable branches)
- Contradiction de conditions (`temp > 80 AND temp < 20`)
- Boucles LLM bornées (`max_iterations` obligatoire)
- Cohérence des permissions de capabilities

### 3. Catalog de capabilities signé

Toute interaction physique ou numérique passe par une `CatalogCapability` :

- Signature **Ed25519** par l'administrateur
- Sémantique préconditions / postconditions / rollback
- Révocable à chaud sans redéploiement
- 5 secteurs : médical · industriel · agriculture · finance · IoT

### 4. Exécution edge-first

La SVM Rust compile pour plusieurs cibles :

| Plateforme | Support |
|-----------|---------|
| x86_64 Linux | ✅ Production |
| ARM64 / ARMv7 (RPi 4) | ✅ Production |
| STM32F4 (Embassy no-std) | ✅ Sans OS, sans heap |
| nRF52840 (BLE edge) | ✅ Firmware certifiable |

---

## Ce qu'EyeFlow n'est PAS

| Idée reçue | Réalité |
|---|---|
| Orchestrateur IA (AutoGen, CrewAI) | Le LLM ne décide rien à l'exécution |
| No-code LLM (n8n + AI nodes) | Le langage est compilé, pas interprété |
| ChatBot avec outils | Sortie déterministe, pas génératrice |
| Framework de prompt engineering | Prompts figés à la compilation uniquement |

---

## Architecture en couches

```
┌──────────────────────────────────────────────────────┐
│              Interface utilisateur                   │
│  Dashboard React · CLI · API REST NestJS             │
├──────────────────────────────────────────────────────┤
│              Compilateur Sémantique                  │
│  NLP Parser → AST Builder → DAG Optimizer            │
│  Z3 Verifier → CompiledContext Injector              │
│  PriorityPolicy Injector → IR Serializer (protobuf)  │
├──────────────────────────────────────────────────────┤
│              LLM-IR (Binaire protobuf)               │
│  Signé Ed25519 · Versionné semver · SHA-256          │
├──────────────────────────────────────────────────────┤
│              SVM — Semantic Virtual Machine          │
│  Scheduler Tokio · ResourceArbiter (PriorityPolicy) │
│  VaultClient · FallbackEngine (5 stratégies)         │
│  AuditChain crypto · Multi-LLM Pipeline              │
├────────────────────────┬─────────────────────────────┤
│   Linux Edge Runtime   │   MCU Embassy Runtime       │
│   x86 · ARM · RPi      │   STM32 · nRF52 · no-alloc  │
└────────────────────────┴─────────────────────────────┘
```

---

## Pour qui ?

- **Industriels** : automatisation de processus critiques sans dérive LLM
- **Équipes médicales** : workflows IEC 62304 certifiables et auditables
- **DevOps embarqués** : déploiement MCU sans OS ni allocateur dynamique
- **Architectes logiciels** : garanties formelles sur les comportements IA

---

## Prochaines étapes

👉 [Pourquoi EyeFlow ?](./why-eyeflow) — avantages concurrentiels et ROI  
👉 [EyeFlow vs. les alternatives](./vs-alternatives) — comparaison technique  
👉 [Quickstart](../getting-started/quickstart) — opérationnel en 10 minutes
