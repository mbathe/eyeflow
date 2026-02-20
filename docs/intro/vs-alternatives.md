---
id: vs-alternatives
sidebar_position: 3
title: EyeFlow vs. les alternatives
description: Comparaison technique approfondie entre EyeFlow et les alternatives d'automatisation IA — n8n, AutoGen, LangGraph, CrewAI, SCADA, OpenClaw.
---

# EyeFlow vs. les alternatives

## Philosophies fondamentalement différentes

Il existe deux grandes familles d'approches pour automatiser des processus avec l'IA :

<div className="ef-compare">
<div className="old">

#### ❌ Approche agent dynamique
Le LLM prend des décisions à **chaque exécution**.  
Le programme est une séquence de prompts interpetés dynamiquement.

**Systèmes** : AutoGen, CrewAI, LangGraph, n8n AI, Zapier AI, Dify

</div>
<div className="new">

#### ✅ Approche compilateur statique
Le LLM intervient **une seule fois** à la compilation.  
Le programme est un binaire vérifié et signé, exécuté sans LLM.

**Système** : EyeFlow

</div>
</div>

---

## EyeFlow vs. n8n / Make / Zapier AI

Ces outils excellent pour les intégrations légères et les workflows non-critiques. Là où ils atteignent leurs limites :

| Critère | n8n · Make · Zapier AI | EyeFlow |
|---------|----------------------|---------|
| **Exécution LLM** | À chaque run | Uniquement à la compilation |
| **Reproductibilité** | Non garantie | Déterministe prouvé |
| **Latence** | 1–10s (appels LLM) | < 10ms (SVM locale) |
| **Coût opérationnel** | Tokens LLM récurrents | Zéro token à l'exécution |
| **Audit formel** | Logs textuels | Chaîne hash SHA-256 immuable |
| **Vérification formelle** | Aucune | Z3 Theorem Prover |
| **Déploiement MCU** | Impossible | STM32, nRF52 (Embassy) |
| **Certifiable** | Non | IEC 62304, SIL2 |
| **Contrôle physique** | Risqué | TimeWindow + postconditions |
| **Offline** | Non | Buffer local + réconciliation |

**Quand utiliser n8n/Make :** intégrations SaaS légères, notifications, synchronisations de données non-critiques.  
**Quand utiliser EyeFlow :** processus critiques, edge, certifiable, déterministe.

---

## EyeFlow vs. AutoGen / CrewAI / LangGraph

Ces frameworks permettent de créer des agents LLM collaboratifs. Très puissants pour l'exploration et la recherche — mais :

| Critère | AutoGen · CrewAI · LangGraph | EyeFlow |
|---------|------------------------------|---------|
| **Paradigme** | Agent dynamique | Compilateur statique |
| **Boucle LLM** | Non bornée | Bornée (`max_iterations`) · vérifiée Z3 |
| **Hallucinations runtime** | Possible | Impossible (pas de LLM runtime) |
| **Permissions** | Non vérifiées formellement | Catalog signé Ed25519 |
| **Contrôle actionneurs** | Non sécurisé | TimeWindow + fenêtre d'annulation |
| **Traçabilité** | Logs non-immuables | Chaîne crypto + Kafka audit |
| **Performance** | 1–30s par étape | < 10ms por instruction SVM |
| **Déploiement embarqué** | Impossible (Python requis) | Rust no-std, STM32, nRF52 |
| **Certification** | Impossible | Rapports Z3 fournis |

**Quand utiliser AutoGen/CrewAI :** recherche, exploration de données, tâches de bureau non-critiques.  
**Quand utiliser EyeFlow :** production critique, edge, certifiable, contrôle physique.

---

## EyeFlow vs. SCADA / PLC classiques (Siemens, ABB, Schneider)

Les systèmes SCADA/PLC sont les standards de l'industrie pour le contrôle de processus. EyeFlow ne les remplace pas — il les complète :

| Critère | SCADA / PLC | EyeFlow |
|---------|-------------|---------|
| **Configuration** | Ladder logic, FBD, ingénieurs spécialisés | Langage naturel compilé |
| **Compréhension sémantique** | Aucune | LLM statique (compilé) |
| **Flexibilité** | Faible (reconfiguration longue) | Haute (recompilation rapide) |
| **Protocoles supportés** | OPC-UA, Modbus (partiellement) | 11 sources : Kafka, MQTT, Modbus, OPC-UA, HTTP, Cron, FS, CDC, Email, BLE, AMQP |
| **Vision par caméra** | Via modules propriétaires | Natif (capability `VISION_CAPTURE`) |
| **Déploiement MCU open** | Propriétaire | Rust Embassy open-source |
| **Coût licence** | Élevé (>100k€ pour grands déploiements) | Open-source |

**Complémentarité :** EyeFlow peut piloter un PLC via Modbus/OPC-UA tout en apportant la couche sémantique de décision.

---

## EyeFlow vs. OpenClaw

OpenClaw est un système de compilation de règles métier comparable dans sa philosophie (LLM-as-compiler), mais avec des différences architecturales importantes :

| Critère | OpenClaw | EyeFlow |
|---------|---------|---------|
| **Format binaire** | Propriétaire JSON-based | LLM-IR protobuf signé Ed25519 |
| **Vérification formelle** | Contraintes simples | Z3 Theorem Prover (invariants SMT) |
| **Exécution MCU** | Non | Rust Embassy (STM32, nRF52) |
| **CompiledLLMContext** | Partiel | Complet (few-shot, dynamic slots, outputSchema, temperature calibration) |
| **PriorityPolicy** | Non | 5 niveaux (CRITICAL → BACKGROUND) · ResourceArbiter Tokio |
| **Multi-LLM pipeline** | Non | Oui (Gemini → Claude → local fallback) |
| **Sources événements** | 4 types | 11 types (Kafka, MQTT, Modbus, OPC-UA, CDC...) |
| **Secteurs verticaux** | Générique | 5 catalogs spécialisés avec capabilities signées |
| **Audit crypto** | Hash simple | Chaîne Merkle + signatures par instruction |
| **Licence** | Propriétaire | Open-source |

---

## Matrice de décision

```
Besoin de certifier médicalement ou SIL ?
├── Oui → EyeFlow (seule option viable)
└── Non
    ├── Déploiement MCU / edge sans réseau ?
    │   ├── Oui → EyeFlow
    │   └── Non
    │       ├── Processus critiques avec actionneurs physiques ?
    │       │   ├── Oui → EyeFlow
    │       │   └── Non
    │       │       ├── Workflows office / SaaS non-critiques ?
    │       │       │   └── n8n / Make / Zapier
    │       │       └── Exploration / recherche agentic ?
    │       │           └── AutoGen / LangGraph
    │       └── (avec déterminisme requis) → EyeFlow
    └── Contrôle industriel existant à compléter ?
        └── EyeFlow + PLC Modbus/OPC-UA
```

---

## Prochaines étapes

👉 [Compilation sémantique en détail](../concepts/semantic-compilation) — les 6 phases  
👉 [Quickstart](../getting-started/quickstart) — démarrer en 10 minutes  
👉 [Secteurs verticaux](../verticals/medical) — cas d'usage concrets par secteur
