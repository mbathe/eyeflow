---
id: architecture
sidebar_position: 1
title: Architecture système
description: Architecture complète d'EyeFlow — NestJS compilateur, SVM Rust, LLM service Python, protobuf, Kafka, Vault, WebSocket TLS et déploiement edge/MCU.
---

# Architecture système

Cette page décrit l'architecture complète de la plateforme EyeFlow, les responsabilités de chaque composant et leurs interactions.

---

## Vue d'ensemble des composants

```
┌──────────────────────────────────────────────────────────────────────┐
│                          PLAN DE CONTRÔLE                            │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              eyeflow-server (NestJS TypeScript)             │    │
│  │                                                             │    │
│  │  CompilerModule          IRGeneratorModule                  │    │
│  │  ├─ NlpParserService     ├─ AstToIrService                  │    │
│  │  ├─ AstBuilderService    ├─ DagOptimizerService             │    │
│  │  ├─ DagBuilderService    ├─ SemanticContextBindingService   │    │
│  │  ├─ Z3VerifierService    ├─ PriorityPolicyInjectorService   │    │
│  │  └─ IrSignerService      └─ IrSerializerService             │    │
│  │                                                             │    │
│  │  CatalogModule           SvmRegistryModule                  │    │
│  │  RulesModule             AuditModule                        │    │
│  │  AuthModule              WebSocketGateway                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│  ┌──────────────┐   ┌────────┴──────────┐   ┌──────────────────┐  │
│  │  PostgreSQL  │   │  Apache Kafka     │   │  HashiCorp Vault  │  │
│  │  (state)     │   │  (audit + events) │   │  (secrets)        │  │
│  └──────────────┘   └───────────────────┘   └──────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                          SERVICES IA                                  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │              eyeflow-llm-service (Python FastAPI)             │  │
│  │  Providers: OpenAI · Anthropic · Google · Local (Ollama)      │  │
│  │  CompiledContext forwarding · logit_bias · schema validation   │  │
│  └───────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                       PLAN D'EXÉCUTION                               │
│                                                                      │
│  SVM Nœud Linux x86/ARM               SVM Nœud MCU Embassy          │
│  ┌─────────────────────────┐         ┌──────────────────────┐       │
│  │  eyeflow-svm (Rust)     │         │  eyeflow-svm-mcu     │       │
│  │  ── Scheduler Tokio     │         │  (Rust no-std)       │       │
│  │  ── ResourceArbiter     │         │  ── Embassy executor │       │
│  │  ── VaultClient         │         │  ── GPIO/SPI/I2C     │       │
│  │  ── FallbackEngine      │         │  Pas de Vault/Kafka  │       │
│  │  ── AuditChain          │         │  L1 memory only      │       │
│  │  ── Kafka producer      │         └──────────────────────┘       │
│  └─────────────────────────┘                                        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## eyeflow-server — Compilateur NestJS

**Langage :** TypeScript / NestJS  
**Port :** 3000  
**Responsabilités :**
- API REST pour soumission et gestion des règles
- Pipeline de compilation en 6 phases (NLP → LLM-IR signé)
- Catalogue de capabilities (signatures, versionnage, révocation)
- Registre des nœuds SVM (heartbeat, déploiement)
- Stockage des programmes compilés (PostgreSQL)
- Publication des audits (Kafka topic `eyeflow.audit`)

**Structure des modules :**
```
src/
├── compiler/
│   ├── nlp/           # Phase 1: NLP → AST
│   ├── ast/           # Phase 2: AST → DAG
│   ├── validation/    # Phase 3: Human validation
│   ├── z3/            # Phase 4: Z3 verification
│   └── ir-generator/  # Phases 5+6: Context injection + IR
├── catalog/           # Catalog capabilities
├── rules/             # CRUD règles + déploiement
├── svm-registry/      # Registre nœuds SVM
├── audit/             # Audit trail + export
├── auth/              # JWT + RBAC
└── websocket/         # Gateway WebSocket SVM
```

---

## eyeflow-svm-node — SVM Rust

**Langage :** Rust (édition 2021)  
**Runtime :** Tokio async  
**Connexion :** WebSocket TLS vers eyeflow-server  
**Responsabilités :**
- Chargement et vérification de signature des programmes LLM-IR
- Scheduling d'exécution avec PriorityPolicy
- Exécution des instructions (opcodes LLM-IR)
- ResourceArbiter (sémaphores par ressource physique)
- FallbackEngine (5 stratégies d'erreur)
- VaultClient (résolution secrets Vault)
- AuditChain (SHA-256 par instruction, publication Kafka)
- Buffer offline (Kafka/SQLite selon config)

---

## eyeflow-llm-service — Service LLM Python

**Langage :** Python 3.11 / FastAPI  
**Port :** 8001  
**Responsabilités :**
- Abstraction multi-provider (OpenAI, Anthropic, Google, Ollama)
- Forwarding du `CompiledLLMContext` avec contexte figé
- Application du `logit_bias` pour génération contrainte
- Validation de la réponse contre `outputSchema`
- Retry et fallback provider

---

## eyeflow-dashboard — Interface React

**Langage :** TypeScript / React 18  
**Port :** 3001  
**Fonctionnalités :**
- Éditeur de règles avec auto-complétion
- Visualisation DAG interactif
- Monitoring temps réel des exécutions
- Audit trail avec vérification hash
- Gestion du catalog de capabilities
- Vue cluster multi-nœuds

---

## Flux de compilation (diagramme de séquence)

```
Client          Server          Z3          LLM Service      SVM
  │                │               │               │           │
  │ POST /compile  │               │               │           │
  ├───────────────►│               │               │           │
  │                │ NLP→AST       │               │           │
  │                ├── LLM Call ──────────────────►│           │
  │                │◄──────────────────────────────┤           │
  │                │ AST→DAG       │               │           │
  │                │ Human validation (async)       │           │
  │                │ Z3 Verify ───►│               │           │
  │                │◄──────────────┤               │           │
  │                │ Inject CompiledLLMContext      │           │
  │                │ Inject PriorityPolicy          │           │
  │                │ Serialize + Sign (Ed25519)     │           │
  │ compilationId  │               │               │           │
  │◄───────────────┤               │               │           │
  │                │               │               │           │
  │ POST /deploy   │               │               │           │
  ├───────────────►│               │               │           │
  │                │ Push binary ──────────────────────────────►│
  │                │◄──────────────────────────────────────────┤
  │ deployed       │               │               │           │
  │◄───────────────┤               │               │           │
```

---

## Flux d'exécution (diagramme de séquence)

```
EventSource         SVM                  Vault       LLM Service    Kafka
     │               │                     │               │           │
     │ EventPayload   │                     │               │           │
     ├──────────────►│                     │               │           │
     │               │ Verify signature    │               │           │
     │               │ LOAD_RESOURCE       │               │           │
     │               │ EVAL condition      │               │           │
     │               │ LLM_CALL:           │               │           │
     │               │   fetch Vault slot ─►               │           │
     │               │◄────────────────────┤               │           │
     │               │   call LLM ─────────────────────────►           │
     │               │◄────────────────────────────────────┤           │
     │               │ CALL_ACTION         │               │           │
     │               │ AuditChain hash     │               │           │
     │               │ Publish audit ────────────────────────────────►│
     │               │                     │               │           │
```

---

## Technologies utilisées

| Composant | Stack |
|----------|-------|
| eyeflow-server | NestJS 10 · TypeScript 5 · PostgreSQL · Prisma ORM |
| eyeflow-svm-node | Rust 1.75+ · Tokio · Prost (protobuf) · Reqwest |
| eyeflow-llm-service | Python 3.11 · FastAPI · Pydantic · OpenAI SDK |
| eyeflow-dashboard | React 18 · TypeScript · Recharts · TanStack Query |
| Communic. SVM↔Server | WebSocket TLS 1.3 (mTLS) |
| Format data | Protobuf 3 (LLM-IR) · JSON (REST) |
| Secrets | HashiCorp Vault |
| Audit | Apache Kafka + InfluxDB + Grafana |
| Formel | Z3 Theorem Prover 4.13 |

---

## Prochaines étapes

👉 [API Reference](./api-reference) — tous les endpoints REST  
👉 [Déploiement](./deployment) — Docker Compose, Kubernetes, cross-compile  
👉 [Connecteurs](./connectors/overview) — créer des connecteurs custom
