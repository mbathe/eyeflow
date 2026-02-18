# 🏗️ ARCHITECTURE TECHNIQUE : EYEFLOW

**Version :** 1.0 (Février 2026)  
**Objet :** Design détaillé du moteur de conversion Règles Naturelles → DAG → Exécution

---

## 1. FLUX GLOBAL : DE LA RÈGLE AU DAG

```
┌─────────────────────────────────────────────────────────────────────┐
│                    UTILISATEUR (Chat Interface)                     │
│  "Si stock < 10, commande 50 unités et alerte le manager"          │
└────────────────────────┬────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────────┐
│        1️⃣ NATURAL LANGUAGE INTERPRETER (LLM + Prompting)           │
│                                                                     │
│  - Parse la règle naturelle                                         │
│  - Identifie: Trigger, Conditions, Actions                          │
│  - Extraite les paramètres (10, 50, "manager", etc.)                 │
└────────────────────────┬────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────────┐
│                  2️⃣ STRUCTURE INTERMEDIAIRE                         │
│                                                                     │
│  {                                                                  │
│    trigger: { type: "monitor", source: "inventory", condition: "<10" },
│    actions: [                                                       │
│      { type: "api_call", service: "supplier", action: "order", qty: 50 },
│      { type: "notify", service: "teams", message: "..." }          │
│    ]                                                                │
│  }                                                                  │
└────────────────────────┬────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────────┐
│         3️⃣ CONNECTOR CATALOG VALIDATOR (Avant exécution)            │
│                                                                     │
│  - Vérifie que tous les connecteurs existent                        │
│  - Vérifie les permissions utilisateur                              │
│  - Valide les paramètres (types, valeurs min/max)                   │
│  - Teste les credentials (si besoin)                                │
└────────────────────────┬────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────────┐
│              4️⃣ DAG GENERATOR (Directed Acyclic Graph)              │
│                                                                     │
│  Node 1: Monitor(inventory, interval=5min)                          │
│  Node 2: Condition(stock < 10)                                      │
│  Node 3: Order(supplier_api, qty=50)  [if Node 2 = true]           │
│  Node 4: Notify(teams, msg="Stock low") [if Node 3 = success]      │
│                                                                     │
│  Edges: 1→2→3→4                                                     │
└────────────────────────┬────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────────┐
│             5️⃣ DATABASE (PostgreSQL + pgvector)                     │
│                                                                     │
│  - Stocker le DAG (JSON)                                            │
│  - Historique des exécutions                                        │
│  - Logs + audit trail                                               │
└────────────────────────┬────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────────┐
│         6️⃣ DAG EXECUTOR (Agent Runtime - Python/Node)              │
│                                                                     │
│  - Exécute chaque node du DAG                                       │
│  - Gestion des erreurs + retry logic                                │
│  - Logging en temps réel                                            │
│  - Validation pendant l'exécution (2ème validation)                 │
└────────────────────────┬────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────────┐
│              💾 MONITORING + AUDIT TRAIL                            │
│                                                                     │
│  - Dashboard en temps réel (Live Feed)                              │
│  - Historique complet de chaque exécution                           │
│  - Logs immuables pour compliance                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. COMPOSANTS CLÉS

### 2.1. Natural Language Interpreter

**Responsabilité :** Parser la règle naturelle → Structure JSON

**Technologie :** Claude 3.5 Sonnet + LangGraph

**Input :**
```
"Si stock de produit X passe sous 10, commande 50 unités et alerte le manager sur Teams"
```

**Output :**
```json
{
  "rule_id": "rule_12345",
  "rule_name": "Auto-restock Product X",
  "trigger": {
    "type": "monitor",
    "connector": "shopify_inventory",
    "path": "products[name='Product X'].stock",
    "condition": "< 10",
    "poll_interval_seconds": 300
  },
  "actions": [
    {
      "id": "action_1",
      "type": "api_call",
      "connector": "supplier_api",
      "operation": "create_order",
      "parameters": {
        "product_id": "X",
        "quantity": 50
      }
    },
    {
      "id": "action_2",
      "type": "notification",
      "connector": "teams",
      "channel": "managers",
      "message": "Auto-restock triggered for Product X: ordered 50 units"
    }
  ],
  "error_handling": {
    "retry_count": 3,
    "retry_delay_seconds": 60,
    "on_failure": "notify_admin"
  }
}
```

**Prompt Principal :**
```
Tu es un expert en automatisation. Analyse cette règle naturelle et extrais:
1. Le TRIGGER (quoi surveiller, quelle condition)
2. Les SOURCES (d'où viennent les données)
3. Les ACTIONS (que faire si trigger)
4. Les PARAMETRES (valeurs, IDs, etc)

Règle: {user_input}

Disponible connecteurs: {CATALOG}

Réponds en JSON stricte.
```

---

### 2.2. Connector Catalog

**Responsabilité :** Répertorf tous les connecteurs disponibles

**Structure :**
```json
{
  "connectors": [
    {
      "id": "shopify_inventory",
      "name": "Shopify Inventory",
      "category": "ecommerce",
      "operations": [
        {
          "op_id": "get_stock",
          "description": "Get current stock level",
          "method": "GET",
          "endpoint": "/admin/api/2024-01/inventory_levels.json",
          "required_params": ["product_id"],
          "returns": { "type": "number", "field": "available" }
        }
      ],
      "auth": "oauth2",
      "rate_limit": "2 req/sec",
      "cost": "free"
    },
    {
      "id": "teams_notifications",
      "name": "Microsoft Teams",
      "category": "communication",
      "operations": [
        {
          "op_id": "send_message",
          "description": "Send message to channel",
          "method": "POST",
          "endpoint": "https://outlook.webhook.office.com/webhookb2/...",
          "required_params": ["channel", "message"],
          "returns": { "type": "boolean" }
        }
      ]
    }
  ]
}
```

**Stockage :** Base de données (ou fichier JSON mis à jour)

---

### 2.3. Validator (Avant exécution)

**Responsabilité :** Vérifier que la règle est exécutable

**Checks :**
- ✅ Tous les connecteurs existent dans le catalog
- ✅ L'utilisateur a les permissions pour utiliser ces connecteurs
- ✅ Les credentials sont présentes (API keys, OAuth tokens)
- ✅ Les paramètres ont les bons types
- ✅ Test de connexion aux APIs (optionnel mais recommandé)

**Output :**
```json
{
  "status": "valid",
  "warnings": [],
  "errors": [],
  "estimated_cost": 0.05,
  "success_rate": 0.95
}
```

---

### 2.4. DAG Generator

**Responsabilité :** Convertir la structure JSON en DAG exécutable

**Nodes :**
```typescript
interface DagNode {
  id: string;
  type: "monitor" | "condition" | "action" | "branch" | "merge";
  connector_id: string;
  operation: string;
  parameters: Record<string, any>;
  retry_policy?: {
    max_retries: number;
    delay_seconds: number;
  };
  timeout_seconds?: number;
}

interface DagEdge {
  from_node: string;
  to_node: string;
  condition?: string; // "on_success", "on_failure", "on_value_match"
}

interface Dag {
  dag_id: string;
  version: number;
  nodes: DagNode[];
  edges: DagEdge[];
  created_at: timestamp;
  created_by: user_id;
}
```

**Exemple :**
```json
{
  "dag_id": "restock_dag_12345",
  "nodes": [
    {
      "id": "node_1",
      "type": "monitor",
      "connector_id": "shopify_inventory",
      "operation": "get_stock",
      "parameters": { "product_id": "X" },
      "timeout_seconds": 30
    },
    {
      "id": "node_2",
      "type": "condition",
      "connector_id": "logic_engine",
      "operation": "evaluate",
      "parameters": { "value": "$node_1.stock", "operator": "<", "threshold": 10 }
    },
    {
      "id": "node_3",
      "type": "action",
      "connector_id": "supplier_api",
      "operation": "create_order",
      "parameters": { "product_id": "X", "quantity": 50 },
      "retry_policy": { "max_retries": 3, "delay_seconds": 60 }
    },
    {
      "id": "node_4",
      "type": "action",
      "connector_id": "teams_notifications",
      "operation": "send_message",
      "parameters": { "channel": "managers", "message": "Order placed" }
    }
  ],
  "edges": [
    { "from": "node_1", "to": "node_2", "condition": "always" },
    { "from": "node_2", "to": "node_3", "condition": "on_true" },
    { "from": "node_3", "to": "node_4", "condition": "on_success" }
  ]
}
```

---

### 2.5. DAG Executor (Moteur de Runtime)

**Technologie :** LangGraph (gestion des cycles) ou Airflow lite

**Logique :**
```python
class DagExecutor:
    def execute(dag: Dag, user_id: str):
        # 1. Charger le DAG depuis DB
        # 2. Valider les credentials
        # 3. Exécuter topologiquement
        # 4. Gérer les erreurs et retry
        # 5. Stocker les résultats
        
        execution_log = []
        for node in dag.nodes (topological_order):
            result = execute_node(node, context)
            execution_log.append({
                "node_id": node.id,
                "status": result.status,
                "duration_ms": result.duration,
                "output": result.output,
                "timestamp": now()
            })
            
            if result.status == "failure":
                handle_retry(node, execution_log)
            
            # Valider pendant l'exécution
            if not validate_node_output(node, result):
                log_error("Output validation failed")
        
        # 6. Stocker dans DB
        store_execution(dag_id, execution_log)
```

---

## 3. FLUX COMPLET AVEC EXEMPLE

**Utilisateur dit :**
```
"Chaque jour à 9h, email-moi un résumé des commandes grandes que 1000€"
```

**Process :**

| Étape | Composant | Input | Output |
|-------|-----------|-------|--------|
| 1 | NLI | "Chaque jour à 9h..." | JSON structure + trigger "schedule" |
| 2 | Catalog | Connecteurs nécessaires | Verify: Shopify Orders + Email valides |
| 3 | Validator | Les 2 connecteurs | ✅ Valid, credentials OK |
| 4 | DAG Gen | JSON + Catalog | DAG avec 3 nodes (Schedule → Filter → Email) |
| 5 | DB Store | DAG | rule_id: "daily_large_orders" |
| 6 | Executor | DAG + credentials | Exécute à 9h, maile résumé |
| 7 | Monitor | Exécution | Live feed + audit trail |

---

## 4. ARCHITECTURE SYSTÈME

```
┌──────────────────────────────────────────────────────────────────┐
│                    EYEFLOW DASHBOARD (React)                     │
│  - Chat Interface (WebSocket)                                    │
│  - Rule Creator / Editor                                         │
│  - Live Feed (exécutions)                                        │
│  - Audit Trail / History                                         │
└────────────────┬─────────────────────────────────────────────────┘
                 │
         ┌───────▼─────────┐
         │   API Gateway   │
         │   (NestJS)      │
         └───────┬─────────┘
                 │
    ┌────────────┴────────────────────┬─────────────────┐
    │                                 │                 │
┌───▼────────────┐  ┌────────────────▼──┐  ┌──────────▼────────────┐
│ Chat Handler   │  │ Rule Manager       │  │ Executor Service      │
│ (NLI Router)   │  │ (Validation +      │  │ (DAG Runner)          │
│                │  │  DAG Generation)   │  │                       │
└────────────────┘  └────────────────────┘  └───────────────────────┘
         │                    │                       │
         └────────────────────┴───────────────────────┘
                              │
                    ┌─────────▼────────────┐
                    │  PostgreSQL + Vector │
                    │  - Rules/DAGs        │
                    │  - Execution logs    │
                    │  - Audit trail       │
                    │  - Embeddings (RAG)  │
                    └──────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ CONNECTORS LAYER (Async Tasks / Worker Queues - Bull/RabbitMQ)   │
│ ┌──────────────┐ ┌──────────────┐ ┌───────────────┐             │
│ │Shopify API   │ │Teams API     │ │Email Service  │ ...         │
│ └──────────────┘ └──────────────┘ └───────────────┘             │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. TECHNOLOGIES PROPOSÉES

| Composant | Technologie | Raison |
|-----------|-------------|--------|
| Chat + NLI | Claude 3.5 Sonnet + LangGraph | Raisonnement complexe + gestion des cycles |
| Web Frontend | React + Socket.io | Real-time live feed |
| Backend API | NestJS | Scalabilité + TypeScript type-safe |
| DAG Executor | LangGraph ou Temporal | Orchestration résiliente |
| Queue Jobs | Bull (Redis) ou RabbitMQ | Traiter async les exécutions |
| Database | PostgreSQL + pgvector | Persistance + RAG (embeddings) |
| Logging | Winston + ELK stack | Audit trail immuable |
| Authentication | JWT + OAuth2 | Sécurité des credentials |

---

## 6. POINTS CRITIQUES

- **Isolation des exécutions :** Chaque DAG = sandbox isolé
- **Gestion des erreurs :** Retry logic + fallback notifications
- **Performance :** < 5s entre trigger détecté et action exécutée
- **Coût :** Tracker les appels API pour facturation
- **Compliance :** Audit trail pour régulations (GDPR, SOX)

---

*Prochaines étapes :*
1. Finir les services NestJS (agents, actions, jobs)
2. Implémenter le NLI (intégration Claude)
3. Créer le DAG Generator
4. Build le Chat interface
