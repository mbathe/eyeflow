---
id: distributed-execution
sidebar_position: 6
title: Exécution distribuée
description: Topologie multi-nœuds EyeFlow — load balancing, résilience offline, buffer Kafka local, réconciliation, déploiement MCU Embassy STM32/nRF52.
---

# Exécution distribuée

EyeFlow est conçu pour fonctionner dans des environnements **distribués, intermittents et edge-first**. Un seul cluster peut orchestrer des serveurs Linux, des Raspberry Pi et des microcontrôleurs STM32 simultanément.

---

## Topologie multi-nœuds

```
                  ┌─────────────────────┐
                  │   EyeFlow Server    │
                  │   (NestJS)          │
                  │   Compilateur       │
                  │   API REST          │
                  │   Dashboard React   │
                  └────────┬────────────┘
                           │ WebSocket TLS
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌─────────────┐  ┌─────────────┐  ┌──────────────┐
    │ node-prod-01│  │ node-edge-01│  │ node-mcu-01  │
    │ x86_64      │  │ ARM64 RPi4  │  │ STM32F4      │
    │ Linux       │  │ Linux       │  │ Embassy RTOS │
    │ 5 règles    │  │ 3 règles    │  │ 1 règle      │
    │ 🟢 Online   │  │ 🟠 Offline  │  │ 🟢 Online   │
    └─────────────┘  └─────────────┘  └──────────────┘
```

---

## Déploiement d'un programme

Un programme compilé peut être déployé sur plusieurs nœuds simultanément :

```bash
curl -X POST http://localhost:3000/api/rules/{id}/deploy \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "nodeIds": ["node-prod-01", "node-edge-01"],
    "strategy": "rolling",
    "rollbackOnError": true
  }'
```

### Stratégies de déploiement

| Stratégie | Comportement |
|-----------|-------------|
| `immediate` | Déploiement simultané sur tous les nœuds |
| `rolling` | Déploiement progressif : 1 nœud → observer 60s → suivant |
| `canary` | 10% du trafic vers le nouveau programme, puis 100% si OK |
| `blue_green` | Bascule atomique entre deux versions |

---

## Résilience offline

Chaque nœud SVM est **autonome** : il peut fonctionner sans connexion au serveur central.

### Comportement offline

1. Le nœud détecte la perte de connexion
2. Il continue d'exécuter les règles déjà chargées localement
3. Les événements entrants sont bufferisés dans le **Kafka local embarqué**
4. Les actions d'audit sont stockées localement (chaîne hash maintenue)
5. À la reconnexion : **réconciliation automatique**

### Buffer local

```toml
# eyeflow-svm.toml
[offline]
buffer_backend = "kafka_embedded"  # ou "sqlite" pour MCU
max_buffer_size_mb = 512
max_buffer_age_hours = 72
reconcile_on_reconnect = true
```

### Réconciliation

À la reconnexion, le nœud envoie le différentiel :
- Exécutions bufferisées (avec leurs chaînes d'audit)
- État actuel de chaque règle
- Événements manqués (si le nœud a de nouvelles données)

Le serveur central **merge** ces données et met à jour le tableau de bord.

---

## Synchronisation des programmes

Quand un nouveau programme est compilé, il est poussé vers les nœuds **dès qu'ils sont connectés** :

```
Server: nouveau programme v2.1.0 compilé
  │
  ├─ node-prod-01 (online) → reçoit immédiatement
  ├─ node-edge-01 (offline) → mis en file d'attente
  │     └── reconnexion 4h plus tard → reçoit + applique
  └─ node-mcu-01 (online) → reçoit via canal série compressé
```

---

## Déploiement MCU — Embassy (no-std)

EyeFlow prend en charge le déploiement sur microcontrôleurs via **Embassy**, le framework async Rust pour embedded.

### Architectures supportées

| MCU | Architecture | Flash requis | RAM requis |
|-----|-------------|-------------|-----------|
| STM32F4xx | Cortex-M4 | 64 KB | 16 KB |
| STM32H7xx | Cortex-M7 | 128 KB | 32 KB |
| nRF52840 | Cortex-M4 | 48 KB | 12 KB |
| RP2040 | Cortex-M0+ | 32 KB | 8 KB |

### Cross-compilation

```bash
# Installer la toolchain ARM
rustup target add thumbv7em-none-eabihf

# Compiler pour STM32F4
cd eyeflow-svm-node
cargo build --release \
  --target thumbv7em-none-eabihf \
  --features embassy-stm32 \
  --no-default-features

# Flasher
probe-rs flash \
  --chip STM32F401CC \
  target/thumbv7em-none-eabihf/release/eyeflow-svm
```

### Contraintes MCU

- Les instructions `LLM_CALL` sont désactivées (ou déléguées via UART à un gateway)
- Mémoire L1 uniquement (pas de Redis/Kafka)
- Maximum 4 règles simultanées (selon la RAM disponible)
- Sources d'événements : GPIO, SPI, I2C, UART, DAC, ADC uniquement

### Exemple : règle STM32 pour contrôle température

```rust
// Dans la règle compilée pour MCU, uniquement des instructions MCU-safe :
// LOAD_RESOURCE adc.read_channel(0) → température
// EVAL temp > 80.0
//   true → CALL_ACTION gpio.set_pin(PIN_RELAY, HIGH)
//   false → CALL_ACTION gpio.set_pin(PIN_RELAY, LOW)
```

---

## Monitoring multi-nœuds

```
┌──────────────────────────────────────────────────┐
│  Cluster Overview                                │
├──────────────────────────────────────────────────┤
│  Nœuds actifs : 7/9          Santé : 77%        │
│  Exécutions/min : 1,247      Erreurs : 0.02%    │
├──────────────────────────────────────────────────┤
│  node-prod-01  🟢  CPU:12%  RAM:48MB  5 règles  │
│  node-prod-02  🟢  CPU:8%   RAM:44MB  5 règles  │
│  node-edge-01  🟢  CPU:6%   RAM:22MB  3 règles  │
│  node-edge-02  🟠  OFFLINE  Buffer: 1,240 evts  │
│  node-farm-01  🟢  CPU:4%   RAM:18MB  2 règles  │
│  node-mcu-01   🟢  —        Flash:32KB 1 règle  │
│  node-mcu-02   🔴  FAILED   Erreur firmware     │
└──────────────────────────────────────────────────┘
```

---

## Prochaines étapes

👉 [Contrôle physique](./physical-control) — sécurité des actionneurs  
👉 [Sources d'événements](./event-sources) — déclencheurs multi-protocoles  
👉 [SVM Runtime](./svm-runtime) — scheduler et ResourceArbiter
