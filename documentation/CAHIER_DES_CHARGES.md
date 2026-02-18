# 📑 CAHIER DES CHARGES : EYEFLOW

**Version :** 1.0 (Février 2026)  
**Statut :** Document de Spécifications Fonctionnelles et Techniques  
**Objet :** Plateforme d'automatisation agentique proactive et universelle

---

## 1. RÉSUMÉ EXÉCUTIF

Eyeflow est un système d'exploitation intelligent (Agentic OS) conçu pour automatiser des processus métiers et personnels complexes. Contrairement aux assistants classiques, Eyeflow est **proactif** : il surveille des flux de données en temps réel et exécute des actions autonomes sur des logiciels tiers (Web et Desktop) sans intervention humaine, en suivant des règles définies en **langage naturel**.

---

## 2. ANALYSE DES BESOINS

### 2.1. Problématique ciblée

- **Fragmentation :** Les données sont éparpillées (emails, logiciels spécifiques, capteurs)
- **Rigidité :** Les outils actuels (Zapier) sont déterministes et cassent au moindre changement
- **Charge mentale :** Les humains passent trop de temps à surveiller des chiffres et à faire du "copier-coller" entre logiciels

### 2.2. Solution Eyeflow

Une couche d'intelligence "Always-on" capable de lire n'importe quelle source, de raisonner comme un humain, et d'agir physiquement sur les interfaces logicielles.

---

## 3. SPÉCIFICATIONS FONCTIONNELLES (Modèle E.R.A.)

### 3.1. ÉCOUTER (Ingestion de données)

- **Omni-Sources :** Connexion via API (REST, GraphQL), Protocoles industriels (MQTT), et surveillance de fichiers locaux
- **Vision Machine :** Capacité à "lire" l'écran d'un logiciel métier fermé via OCR et analyse d'image
- **Natural Language Trigger :** Définition de seuils en texte ("Si le ton du client devient agressif...", "Si le stock passe sous 10%...")

### 3.2. RAISONNER (Cœur Cognitif)

- **Interpréteur d'Intention :** Traduction du langage naturel en graphes de tâches (DAG)
- **Mémoire Contextuelle :** Utilisation du RAG (Retrieval Augmented Generation) pour que l'agent se souvienne des actions passées et des préférences de l'utilisateur
- **Auto-Correction :** Si une action échoue, l'agent tente une alternative ou demande une précision

### 3.3. AGIR (Exécution d'Actions)

- **Background UI Control :** Manipulation d'applications Windows/Web en arrière-plan via des instances virtuelles (Ghost Mode)
- **Communication :** Envoi automatique sur WhatsApp, Teams, Slack, ou par Email
- **Synthèse :** Génération de rapports structurés (PDF, Excel) et mise à jour de bases de données

---

## 4. ARCHITECTURE TECHNIQUE

### 4.1. Stack Technologique Préconisée

- **Core Engine :** Rust (pour la performance système) ou Node.js (pour la flexibilité)
- **IA Orchestration :** LangGraph (gestion des cycles de décision) + Vercel AI SDK
- **Modèles :** Hybride (Llama 3 en local pour la rapidité, Claude 3.5 Sonnet pour le raisonnement complexe)
- **Automatisation :** Playwright (Web) + UI Automation Framework (Windows)
- **Base de Données :** PostgreSQL avec l'extension `pgvector` pour la mémoire sémantique

### 4.2. Sécurité et Confidentialité

- **Isolation (Sandbox) :** Exécution des tâches dans des environnements isolés pour protéger le système hôte
- **Audit Trail :** Journalisation immuable de chaque "pensée" et action entreprise par l'IA
- **Double Authentification :** Validation humaine (Push notification) requise pour les actions à haut risque (paiements, suppressions)

---

## 5. INTERFACE UTILISATEUR (UX/UI)

### 5.1. Dashboard "Mission Control"

- **Live Feed :** Visualisation en temps réel des données entrantes et des actions sortantes
- **Rule Creator :** Éditeur de règles en langage naturel avec prévisualisation du workflow
- **Ghost View :** Fenêtre miniature permettant de voir l'agent manipuler les logiciels en arrière-plan

### 5.2. SDK Développeurs

- **Plugin System :** Possibilité pour les développeurs tiers de créer de nouveaux connecteurs
- **API d'Action :** Une interface standardisée (basée sur le protocole MCP) pour que n'importe quelle application puisse être pilotée par NEXUS CORE

---

## 6. FEUILLE DE ROUTE (ROADMAP)

### Phase 1 : Le Noyau (Mois 1-3)

- Mise en place de l'orchestrateur et des connecteurs API de base
- Développement de l'interface de création de règles en langage naturel

### Phase 2 : La Main (Mois 4-6)

- Intégration du pilotage d'applications en arrière-plan (Ghost Mode)
- Lancement de la version Alpha pour tests internes

### Phase 3 : L'Écosystème (Mois 7-12)

- Ouverture du SDK pour les développeurs
- Lancement de la version Entreprise avec gestion des rôles et sécurité renforcée

---

## 7. CRITÈRES DE SUCCÈS (KPIs)

- **Temps de réponse :** Traitement d'un événement en moins de 5 secondes
- **Précision d'action :** Taux de succès des automatisations sans erreur > 99%
- **Facilité d'utilisation :** Un utilisateur non-technique doit pouvoir créer un workflow complexe en moins de 2 minutes

---

## 8. STRUCTURE DU PROJET

```
eyeflow/
├── eyeflow-agent/          # Moteur d'agents (Python)
├── eyeflow-server/         # API Backend (NestJS)
│   ├── src/
│   │   ├── agents/         # Gestion des agents
│   │   ├── actions/        # Exécution des actions
│   │   ├── jobs/           # Orchestration des tâches
│   │   └── app.module.ts   # Configuration principale
│   └── test/               # Tests e2e
└── eyeflow-dashboard/      # Interface Utilisateur (React)
```

---

## 9. Points d'attention techniques

- [ ] Intégration complete du système de files de jobs
- [ ] Implémentation du RAG pour la mémoire contextuelle
- [ ] Mise en place du Ghost Mode pour le contrôle d'applications
- [ ] Sécurité : Double authentification et audit trail
- [ ] Performance : < 5 secondes par événement

---

*Document à jour: Février 2026*
