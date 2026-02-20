---
id: roadmap
sidebar_position: 1
title: Feuille de route
description: Roadmap d'implémentation EyeFlow en 4 phases sur 18 mois — compilateur sémantique, SVM Rust, MCU Embassy, 5 secteurs et certifications réglementaires.
---

# Feuille de route — Implémentation

Roadmap officielle EyeFlow organisée en 4 phases sur 18 mois, fidèle au cahier des charges §15.

---

## Vue d'ensemble

```
MOIS  1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18
      ├──────────────┤
      │   PHASE 1    │
      │  Core + Linux│
                     ├──────────────┤
                     │   PHASE 2    │
                     │ MCU + Multi  │
                     │      LLM     │
                                    ├──────────────────────┤
                                    │       PHASE 3        │
                                    │  5 Secteurs + Certs  │
                                         ├──────────────────────┤
                                         │      PHASE 4         │
                                         │  Scale + Marketplace │
```

---

## Phase 1 — Mois 1 à 3 : Fondations

**Objectif :** Compilateur sémantique opérationnel sur Linux x86/ARM + SVM de base

### Compilateur NestJS (eyeflow-server)

| Livrable | Statut | Description |
|---------|--------|-------------|
| Phase 1 NLP → AST | ✅ **Livré** | Parser NL → AST structuré via LLM |
| Phase 2 AST → DAG | ✅ **Livré** | Constructeur de graphe orienté acyclique |
| Phase 3 Validation humaine | ✅ **Livré** | Interface de revue + approbation UI |
| Phase 4 Z3 Verification | ✅ **Livré** | Preuve de non-contradiction Z3 4.13 |
| Phase 5 CompiledLLMContext | ✅ **Livré** | Injection contexte figé avec logit_bias |
| Phase 5 PriorityPolicy | ✅ **Livré** | CRITICAL/HIGH/NORMAL/LOW/BACKGROUND |
| Phase 6 LLM-IR serialization | ✅ **Livré** | Protobuf v3 + signature Ed25519 |

### SVM Rust Linux (eyeflow-svm-node)

| Livrable | Statut | Description |
|---------|--------|-------------|
| Chargement LLM-IR | ✅ **Livré** | Désérialisation protobuf + vérif. signature |
| Scheduler Tokio | ✅ **Livré** | Exécution async avec PriorityPolicy |
| ResourceArbiter | ✅ **Livré** | Sémaphores par ressource physique |
| FallbackEngine | ✅ **Livré** | 5 stratégies: RETRY, ALERT, DEGRADE, HALT, ESCALATE |
| AuditChain | ✅ **Livré** | SHA-256 chaîné par instruction |
| VaultClient | ✅ **Livré** | Résolution secrets Vault via AppRole |
| Kafka publisher | ✅ **Livré** | Audit stream + événements |
| WebSocket TLS | ✅ **Livré** | Connexion mTLS vers eyeflow-server |

### Infrastructure

| Livrable | Statut | Description |
|---------|--------|-------------|
| Docker Compose stack | ✅ **Livré** | PostgreSQL, Kafka, Redis, Vault, InfluxDB |
| Catalog de capabilities | ✅ **Livré** | CRUD + versionnage + révocation |
| Dashboard Vue de base | ✅ **Livré** | Exécutions, audit, monitoring nœuds |

---

## Phase 2 — Mois 4 à 6 : Edge & Multi-LLM

**Objectif :** Déploiement MCU no-std + pipeline multi-LLM + secteurs industrial/medical

### SVM MCU Embassy (eyeflow-svm-mcu)

| Livrable | Statut | Description |
|---------|--------|-------------|
| Portage no-std Rust | 🔄 **En cours** | Suppression std, adaptation heapless |
| Embassy executor | 🔄 **En cours** | Runtime async sur Cortex-M |
| Support STM32F4/H7 | 🔄 **En cours** | Targets thumbv7em-none-eabihf |
| Support nRF52840 | 📋 **Planifié** | BLE + edge computing |
| Support RP2040 | 📋 **Planifié** | Raspberry Pi Pico |
| Mémoire L1 only (40KB) | 📋 **Planifié** | Programme compressé sans Vault |
| Cross-compile CI | 📋 **Planifié** | Pipeline GitHub Actions multi-target |

### Multi-LLM Pipeline

| Livrable | Statut | Description |
|---------|--------|-------------|
| Provider Gemini | 🔄 **En cours** | Google Generative AI |
| Provider Mistral | 📋 **Planifié** | Mistral Large local/API |
| Ollama local | 📋 **Planifié** | Modèles locaux offline |
| Pipeline chaîné | 📋 **Planifié** | Chaîne LLM1 → LLM2 → LLM3 |
| Routage par coût | 📋 **Planifié** | Sélection provider selon budget |
| Bounded loops | 📋 **Planifié** | LoopConfig avec max_iterations |

### Secteurs industrial & medical

| Livrable | Statut | Description |
|---------|--------|-------------|
| Capabilities industrial (10) | 🔄 **En cours** | valve, pump, modbus, opcua, alarm… |
| Capabilities medical (7) | 🔄 **En cours** | patient_alert, hl7_fhir, iv_pump… |
| Connecteur OPC-UA | 📋 **Planifié** | Lecture/écriture nœuds OPC-UA |
| Connecteur Modbus | 📋 **Planifié** | TCP + RTU |
| Physical Control Guard | 🔄 **En cours** | TimeWindow, annulation, SIL |

---

## Phase 3 — Mois 7 à 12 : 5 secteurs + certifications

**Objectif :** Couverture complète des 5 secteurs + certifications réglementaires

### Secteur Agriculture

| Livrable | Statut | Description |
|---------|--------|-------------|
| Capabilities agriculture (10) | 📋 **Planifié** | irrigation, drone, pesticide, récolte |
| Connecteur drone | 📋 **Planifié** | MAVLink waypoints |
| Traçabilité GlobalGAP | 📋 **Planifié** | Export rapport réglementaire |
| ARMv7 offline RPi | 📋 **Planifié** | Buffer SQLite + MQTT local |

### Secteur Finance

| Livrable | Statut | Description |
|---------|--------|-------------|
| Capabilities finance (10) | 📋 **Planifié** | fraud, reporting, kyc, swift, fx |
| CDC PostgreSQL | 📋 **Planifié** | Change Data Capture transactions |
| RGPD Art.22 API | 📋 **Planifié** | Décision algorithmique expliquable |
| SOC2 artifacts | 📋 **Planifié** | Export rapport conformité |

### Secteur IoT

| Livrable | Statut | Description |
|---------|--------|-------------|
| Capabilities IoT (10) | 📋 **Planifié** | ota, fleet, gpio, ble, mqtt |
| Connecteur BLE scanner | 📋 **Planifié** | GATT services |
| OTA rollback | 📋 **Planifié** | Rollback firmware avec postconditions |
| 4-tier topology | 📋 **Planifié** | Cloud → Gateway → MCU → Sensors |

### Certifications réglementaires

| Certification | Secteur | Échéance |
|--------------|---------|---------|
| IEC 62304 | Medical | Mois 10 |
| SIL 2 (IEC 61508) | Industrial | Mois 11 |
| ISO 13485 | Medical | Mois 12 |
| NIS2 | Tous | Mois 12 |
| SOC2 Type II | Finance | Mois 12 |
| GlobalGAP | Agriculture | Mois 12 |

### Génération d'artifacts IEC 62304

```bash
# Disponible dès Phase 3 milestone M10
eyeflow audit report \
  --rule <rule-id> \
  --format iec62304 \
  --period 2025-Q1 \
  --out iec62304_rapport.pdf
```

---

## Phase 4 — Mois 13 à 18 : Scale & Marketplace

**Objectif :** Passage à l'échelle, marketplace de capabilities, SLA entreprise

### Performance & Scale

| Livrable | Description | Cible |
|---------|-------------|-------|
| Exécutions concurrentes | Scheduling horizontal | 1000+ exec/s par cluster |
| Latence compilation | Compiler pipeline | < 3s p99 |
| Latence exécution | SVM instruction loop | < 50ms p99 (hors LLM) |
| Latence LLM | Avec CompiledContext | < 800ms p99 |
| Multi-cluster | Fédération de clusters | 10+ clusters |
| WASM sandbox | Isolation capabilities tierce | Isolation complète |

### Marketplace de capabilities

| Livrable | Description |
|---------|-------------|
| Portail marketplace | Catalogue public de capabilities communautaires |
| Revue de sécurité | Pipeline de validation automatique + manuelle |
| Monétisation | Licensing par exécution ou abonnement |
| SDK builder | Wizard de création guidé |
| Tests automatiques | Suite de tests standard pour toute capability |

### Developer Experience

| Livrable | Description |
|---------|-------------|
| VS Code Extension | Complétion, linting règles NL, prévisualisation DAG |
| Playground en ligne | Compiler et tester sans installation |
| SDK Python | Client Python pour data scientists |
| Postman Collection | Collection complète des endpoints |
| MkDocs → Docusaurus migration | ✅ Déjà fait |

### SLA Entreprise

| Niveau | Disponibilité | Support | Prix |
|--------|--------------|---------|------|
| Community | 99% | Forum | Gratuit |
| Professional | 99.5% | Email 48h | Sur devis |
| Enterprise | 99.9% | Slack dédié 4h | Sur devis |
| Critical | 99.99% | 24/7 on-call | Sur devis |

---

## Métriques de succès

| Métrique | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---------|---------|---------|---------|---------|
| Compilation NL → IR | < 5s | < 4s | < 3s | < 2s |
| Exécutions/jour (1 nœud) | 10k | 50k | 200k | 1M |
| Secteurs couverts | 0 | 2 | 5 | 5+ |
| Certifications | 0 | 0 | 6 | 6+ |
| Capabilities built-in | 15 | 35 | 65 | 100+ |
| Nœuds MCU supportés | 0 | 2 | 4 | 8+ |

---

## Contribuer

La feuille de route est publique et ouverte aux contributions de la communauté.

- **Issues** : [github.com/eyeflow/eyeflow/issues](https://github.com/eyeflow/eyeflow/issues)
- **Discussions** : [github.com/eyeflow/eyeflow/discussions](https://github.com/eyeflow/eyeflow/discussions)
- **RFC** : Proposition via Pull Request dans `docs/rfcs/`
- **Capabilities** : Soumission marketplace via `eyeflow catalog submit`

:::info Dates indicatives
Les dates de la roadmap sont des objectifs. La communauté est invitée à voter pour les features prioritaires via GitHub Discussions.
:::
