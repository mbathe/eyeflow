---
id: svm-runtime
sidebar_position: 4
title: SVM — Semantic Virtual Machine
description: Architecture de la SVM Rust — scheduler Tokio, 3 couches mémoire, FallbackEngine 5 stratégies, ResourceArbiter PriorityPolicy, exécution embedded Embassy.
---

# SVM — Semantic Virtual Machine

La **Semantic Virtual Machine** est le moteur d'exécution Rust qui exécute les programmes LLM-IR. Conçue pour la fiabilité et la performance, elle s'exécute aussi bien sur un serveur Linux que sur un microcontrôleur STM32 sans OS.

---

## Architecture générale

```
┌─────────────────────────────────────────────────────────────────┐
│                     SVM (Rust + Tokio)                         │
│                                                                 │
│  ┌──────────────────┐   ┌─────────────────────────────────┐   │
│  │  Program Loader  │   │         Scheduler               │   │
│  │  ─────────────   │   │  ──────────────────────────     │   │
│  │  Verify signature│   │  Priority queue (5 niveaux)     │   │
│  │  Check IR version│   │  ResourceArbiter (Semaphore)    │   │
│  │  Load binary     │   │  Tokio async tasks              │   │
│  └──────────────────┘   └─────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Instruction Executor                        │  │
│  │  LOAD_RESOURCE │ EVAL │ LLM_CALL │ CALL_ACTION │ BRANCH  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────┐   ┌────────────────┐   ┌─────────────────┐  │
│  │  Memory (3)  │   │  VaultClient   │   │  FallbackEngine │  │
│  │  ──────────  │   │  ────────────  │   │  ─────────────  │  │
│  │  L1: In-proc │   │  Secrets mgmt  │   │  5 stratégies   │  │
│  │  L2: Redis   │   │  Dynamic slots │   │  RETRY / DEGRADE│  │
│  │  L3: Kafka   │   │  Ed25519 keys  │   │  FALLBACK / SKIP│  │
│  └──────────────┘   └────────────────┘   └─────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │               Audit Chain                                │  │
│  │  Hash SHA-256 chaîné par instruction · Kafka publish     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Scheduler et PriorityPolicy

La SVM utilise un **scheduler à priorités** basé sur Tokio. Chaque instruction dispose d'une `PriorityPolicy` injectée à la compilation.

### Les 5 niveaux de priorité

| Niveau | Valeur | Préemptible | MaxWait | Usage typique |
|--------|--------|-------------|---------|---------------|
| CRITICAL | 0 | ❌ Non | 500ms | Medical · Safety · SIL |
| HIGH | 64 | ❌ Non | 2000ms | Actionneurs physiques |
| NORMAL | 128 | ✅ Oui | 10000ms | Règles métier standard |
| LOW | 192 | ✅ Oui | 30000ms | Synchronisation données |
| BACKGROUND | 255 | ✅ Oui | 120000ms | Analytics · Reporting |

### ResourceArbiter

Pour éviter les accès concurrents sur une même ressource physique (ex: deux règles commandant la même vanne), la SVM utilise un `ResourceArbiter` :

```rust
type ResourceArbiter = Arc<RwLock<HashMap<String, Arc<Semaphore>>>>;

async fn acquire_resource_permit(
    &self,
    resource_key: &str,
    max_wait_ms: u32,
) -> Result<OwnedSemaphorePermit, SvmError> {
    let arbiter = self.resource_arbiter.read().await;
    let semaphore = arbiter.entry(resource_key)
        .or_insert_with(|| Arc::new(Semaphore::new(1)))
        .clone();
    
    let deadline = Duration::from_millis(max_wait_ms as u64);
    timeout(deadline, semaphore.acquire_owned())
        .await
        .map_err(|_| SvmError::ResourceTimeout(resource_key.to_string()))
}
```

Si le timeout est atteint, le `FallbackEngine` prend le relais.

---

## 3 couches mémoire

| Couche | Technologie | Portée | TTL |
|--------|------------|--------|-----|
| L1 — In-process | `HashMap` Rust | Exécution courante | Durée de l'exécution |
| L2 — Shared cache | Redis | Nœud SVM | Configurable (défaut 1h) |
| L3 — Persistent | Kafka topic | Cluster multi-nœuds | Rétention Kafka |

Les instructions `STORE` / `LOAD` adressent les 3 couches de manière transparente selon la portée requise.

---

## FallbackEngine — 5 stratégies

Quand une instruction échoue (timeout, erreur réseau, postcondition non respectée), le `FallbackEngine` applique l'une des 5 stratégies configurées :

| Stratégie | Comportement | Cas d'usage |
|-----------|-------------|-------------|
| `RETRY` | Réessaie N fois avec backoff exponentiel | Erreurs réseau transitoires |
| `FALLBACK_VALUE` | Utilise une valeur par défaut safe | Capteur indisponible |
| `FALLBACK_MODEL` | Bascule vers un LLM alternatif | LLM primaire surchargé |
| `SKIP` | Ignore l'instruction, continue le programme | Instructions non-critiques |
| `ABORT` | Stoppe l'exécution, déclenche rollback | Erreurs critiques |

### Configuration par instruction

```json
{
  "instruction_id": "llm-analysis-01",
  "opcode": "LLM_CALL",
  "retry": {
    "maxRetries": 3,
    "backoffMs": 500,
    "backoffMultiplier": 2.0
  },
  "fallback": {
    "strategy": "FALLBACK_MODEL",
    "alternativeModel": "claude-3-5-sonnet",
    "fallbackOnErrors": ["TIMEOUT", "RATE_LIMIT", "MODEL_UNAVAILABLE"]
  },
  "timeout": {
    "executionTimeoutMs": 5000,
    "onTimeout": "ABORT"
  }
}
```

---

## Exécution d'un LLM_CALL

Quand la SVM rencontre une instruction `LLM_CALL` :

1. **Extraction du CompiledLLMContext** figé dans le binaire
2. **Construction du payload** :
   - Injection des `fewShotExamples` figés
   - Résolution des `dynamicSlots` :
     - Type `vault` → appel `VaultClient::fetch(source_key)`
     - Type `runtime` → extraction par dot-notation depuis le contexte courant
3. **Envoi au LLM service** (HTTP vers `eyeflow-llm-service`)
4. **Validation de la réponse** contre `outputSchema`
5. **Masquage logit_bias** si le modèle le supporte

```rust
async fn exec_llm_call(&self, dm: &DispatchMetadata, ctx: &mut ExecContext) -> Result<Value, SvmError> {
    // 1. Few-shot figés
    let few_shot: Vec<Value> = dm.few_shot_examples.iter()
        .map(|ex| json!({"input": ex.input_json, "output": ex.output_json}))
        .collect();
    
    // 2. Dynamic slots
    let mut slots = serde_json::Map::new();
    for slot in &dm.dynamic_slots {
        let value = match slot.source_type.as_str() {
            "vault"   => self.vault_client.fetch(&slot.source_key).await?,
            "runtime" => extract_dot_path(&ctx.runtime_data, &slot.source_key)?,
            _         => return Err(SvmError::UnknownSlotSource),
        };
        slots.insert(slot.slot_id.clone(), value);
    }
    
    // 3. Envoi
    let payload = json!({
        "model": dm.model,
        "temperature": dm.temperature,
        "systemPrompt": dm.system_prompt,
        "fewShotExamples": few_shot,
        "dynamicSlots": slots,
        "outputSchema": dm.output_schema,
    });
    
    self.http_client.post(&self.llm_service_url).json(&payload).send().await
}
```

---

## Exécution MCU Embassy (no-std)

Sur microcontrôleur, la SVM utilise le profil `no-std` Embassy :

- Pas d'allocateur heap dynamique
- Instructions exécutées sur le stack
- Mémoire L1 uniquement (HashMap statique compilée)
- LLM_CALL désactivé (pas de réseau) ou via gateway série
- `CALL_ACTION` via GPIO, SPI, I2C, UART

```toml
# Cargo.toml pour STM32F4
[features]
default = ["embassy-stm32"]
embassy-stm32 = ["embassy-executor/arch-cortex-m"]
```

---

## Prochaines étapes

👉 [Sources d'événements](./event-sources) — déclencheurs de l'exécution  
👉 [Appels LLM](./llm-calls) — CompiledLLMContext et multi-LLM pipeline  
👉 [Contrôle physique](./physical-control) — TimeWindow et postconditions
