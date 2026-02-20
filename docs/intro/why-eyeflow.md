---
id: why-eyeflow
sidebar_position: 2
title: Pourquoi EyeFlow ?
description: Analyse comparative, ROI et avantages concurrentiels de la compilation sémantique déterministe.
---

# Pourquoi EyeFlow ?

## Le problème que personne ne résout vraiment

Les outils d'automatisation basés sur LLM existants souffrent tous du même défaut fondamental : **le modèle décide à l'exécution**. Cela entraîne :

- Résultats non reproductibles entre deux exécutions identiques
- Impossibilité d'audit formal (que s'est-il passé exactement ?)
- Certification impossible en environnement critique (médical, industriel)
- Coût LLM à chaque exécution (latence + tokens)
- Surface d'attaque par injection de prompt à l'exécution

EyeFlow résout ces problèmes à la racine en **déplaçant toute la logique LLM au moment de la compilation**.

---

## Comparaison directe

### EyeFlow vs. outils no-code LLM (n8n, Make, Zapier AI)

| Critère | n8n / Make / Zapier AI | **EyeFlow** |
|---------|----------------------|-------------|
| LLM à l'exécution | ✅ Oui (décide à chaque run) | ❌ Jamais |
| Reproductibilité | ❌ Non garantie | ✅ 100 % déterministe |
| Audit formel | ❌ Logs textuels seulement | ✅ Chaîne crypto immutable |
| Certifiable IEC / SIL | ❌ Non | ✅ Oui |
| Déploiement MCU | ❌ Non | ✅ STM32, nRF52 |
| Vérification Z3 | ❌ Non | ✅ Avant signature |
| Latence d'exécution | ≥ 1s (appel LLM) | < 10ms (SVM locale) |
| Coût par exécution | Tokens LLM à chaque run | Zero (binaire compilé) |

### EyeFlow vs. frameworks agents (AutoGen, CrewAI, LangGraph)

| Critère | AutoGen / LangGraph | **EyeFlow** |
|---------|---------------------|-------------|
| Paradigme | Agent dynamique | Compilateur statique |
| Boucle LLM | Non bornée (hallucinations possibles) | Bornée + vérifiée Z3 |
| Contrôle physique | Risqué sans garde-fous | TimeWindow + postcondition verify |
| Permissions runtime | Non vérifiées formellement | Catalog signé Ed25519 |
| Offline | Non | Buffer Kafka + réconciliation |
| Traces d'audit | Logs textuels | Hash SHA-256 chaîné |

### EyeFlow vs. solutions industrielles classiques (SCADA, PLC)

| Critère | SCADA / PLC | **EyeFlow** |
|---------|-------------|-------------|
| Configuration | Ingénierie spécialisée longue | Langage naturel compilé |
| Flexibilité sémantique | Faible (ladder logic) | Haute (NLP → AST) |
| Compréhension du contexte | Aucune | LLM statique à la compilation |
| Multi-protocoles | Partiel (OPC-UA, Modbus) | 11 sources : Kafka, MQTT, Modbus, OPC-UA, HTTP, Cron, FS, CDC, Email... |
| Déploiement MCU | Environnements propriétaires | Rust Embassy open-source |

---

## ROI mesurable

### Réduction des coûts LLM

Dans un système classique basé LLM, chaque exécution d'une règle coûte des tokens.  
Avec EyeFlow : **0 token à l'exécution** après compilation.

| Volume d'exécutions/jour | Coût LLM classique (gpt-4o) | Coût EyeFlow |
|--------------------------|------------------------------|--------------|
| 1 000 exécutions | ~2 USD/jour | **0 USD** |
| 50 000 exécutions | ~100 USD/jour | **0 USD** |
| 1 000 000 exécutions | ~2 000 USD/jour | **0 USD** |

*Le LLM est uniquement facturé lors de la (re)compilation d'une règle, ce qui est rare.*

### Réduction des incidents de dérive IA

Les dérives LLM en production (hallucinations, comportements inattendus) coûtent en moyenne :
- 4h d'enquête ingénieur par incident
- Risques juridiques en médical / financier
- Perte de confiance client

EyeFlow élimine cette classe d'incidents par construction (déterminisme prouvé).

### Délai de certification

| Contexte | Sans EyeFlow | Avec EyeFlow |
|---------|--------------|--------------|
| Certification IEC 62304 (médical) | 18-36 mois | 6-12 mois (audit trail fourni) |
| Validation SIL2 (industriel) | 12-24 mois | 4-8 mois (Z3 reports inclus) |
| Conformité SOC2 (finance) | 6-12 mois | 2-4 mois (chaîne crypto) |

---

## Cas d'usage qui nécessitent EyeFlow

### Systèmes critiques

Partout où l'exécution incorrecte d'une règle IA peut entraîner des dommages physiques ou juridiques :

- **Médical** : dosage médicament, alertes patient, coordination soins ICU
- **Industriel** : commande d'actionneurs, gestion soupapes, arrêts d'urgence
- **Agriculture** : irrigation précision, dosage pesticides, seuils phytosanitaires
- **Finance** : validation transactions, détection fraude réglementée, reporting AMF

### Déploiements edge contraints

Partout où il n'y a pas de réseau stable ou de puissance de calcul pour un LLM :

- Raspberry Pi hors réseau (agriculture terrain)
- STM32 embarqué dans un équipement médical
- nRF52 dans un capteur BLE sans cloud

### Audit et conformité

Partout où chaque action doit être prouvée et non-répudiable :

- RGPD (traçabilité des décisions automatisées sur données personnelles)
- NIS2 (résilience des infrastructures critiques)
- ISO 13485 (dispositifs médicaux)
- ISO 26262 (automotive)

---

## Ce que vous gagnez concrètement

:::success Déterminisme
La même règle produit exactement le même résultat le lundi et le vendredi, en production et en staging.
:::

:::info Performance
Exécution < 10ms en local vs ≥ 1s pour un appel LLM. 100x plus rapide pour les règles fréquentes.
:::

:::warning Sécurité formelle
Pas d'injection de prompt à l'exécution. Le programme exécute un binaire signé, pas du texte interprété.
:::

:::danger Certifiabilité
Les rapports Z3, les chaînes d'audit crypto et les traces d'exécution sont fournis dans le format attendu par les certifications IEC / SIL.
:::

---

## Prochaines étapes

👉 [EyeFlow vs. alternatives](./vs-alternatives) — comparaison technique approfondie  
👉 [Comment ça marche : compilation sémantique](../concepts/semantic-compilation) — les 6 phases détaillées  
👉 [Quickstart](../getting-started/quickstart) — en production en 10 minutes
