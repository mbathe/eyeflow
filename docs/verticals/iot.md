---
id: iot
sidebar_position: 5
title: Secteur IoT
description: EyeFlow pour l'IoT — gestion de flotte d'appareils, mises à jour OTA sécurisées, télémétrie multi-protocoles, edge AI embarqué STM32/nRF52.
---

# EyeFlow — Internet of Things (IoT)

EyeFlow unifie la gestion de flottes IoT hétérogènes avec une **couche sémantique déterministe** : décisions locales sur MCU, synchronisation cloud, OTA sécurisé et télémétrie multi-protocoles.

---

## Pourquoi EyeFlow en IoT ?

| Défi IoT | Solution EyeFlow |
|---------|-----------------|
| Logique décisionnelle sur MCU | SVM Embassy Rust (STM32, nRF52) — no-std |
| Hétérogénéité protocolaire (MQTT, BLE, LoRa) | 11 sources d'événements unifiées |
| OTA sécurisé | Signature Ed25519 sur chaque binaire déployé |
| Edge AI sans cloud | LLM compilé statiquement dans le firmware |
| Flotte de milliers d'appareils | Multi-nœuds + synchronisation cluster |
| Consommation énergie contrainte | SVM no-std < 50KB flash, < 16KB RAM |

---

## Catalog IoT — Capabilities

| Capability | Version | Description |
|-----------|---------|-------------|
| `device.firmware_update` | 1.2.0 | Mise à jour OTA signée + rollback automatique |
| `device.telemetry_collect` | 1.4.0 | Collecte et agrégation télémétrie multi-protocoles |
| `device.reboot` | 1.0.0 | Reboot distant avec watchdog |
| `device.config_update` | 1.1.0 | Mise à jour configuration sans redémarrage |
| `network.topology_map` | 1.0.0 | Cartographie réseau mesh IoT |
| `alert.threshold_monitor` | 1.3.0 | Alertes seuils multi-capteurs |
| `power.sleep_schedule` | 1.0.0 | Gestion veille / réveil pour économie énergie |
| `data.compress_upload` | 1.0.0 | Compression et upload par batch |
| `security.key_rotation` | 1.0.0 | Rotation clés cryptographiques OTA |
| `diagnosis.self_test` | 1.0.0 | Auto-diagnostic matériel |

---

## Exemple 1 : Gestion flotte compteurs intelligents

### Règle métier
```
Surveiller 10,000 compteurs déployés sur le terrain.
Si un compteur n'envoie pas de données pendant > 30 minutes,
analyser son historique pour déterminer si c'est une panne
ou une coupure réseau planifiée.
Si c'est une panne probable, créer un ticket d'intervention.
```

### Programme compilé
```
[EVENT mqtt.heartbeat ABSENCE timeout=30min per_device]
 → [LOAD_RESOURCE device.telemetry_collect
     device_id=event.device_id history=7d]
 → [LLM_CALL model=gemini-flash temp=0.1
     fewShot=frozen(panne vs coupure réseau)
     output={diagnosis: enum[hardware_fault, network_outage, planned_maintenance]}]
 → [EVAL diagnosis == hardware_fault]
      true:
       → [CALL_ACTION alert.threshold_monitor
           type=incident severity=medium]
       → [EMIT_EVENT field_service.ticket_create]
      false:
       → [CALL_ACTION device.telemetry_collect log=true]
```

---

## Exemple 2 : OTA sécurisé avec rollback

### Règle métier
```
Quand une nouvelle version de firmware est disponible,
déployer d'abord sur 1% de la flotte (canaries),
attendre 4h et analyser les métriques de santé.
Si tout est nominal, déployer sur l'ensemble de la flotte.
Si des erreurs sont détectées, rollback automatique.
```

### Postconditions OTA
```json
{
  "action": "device.firmware_update",
  "postconditions": [
    {
      "check": "device.firmware_version == target_version",
      "timeoutMs": 30000,
      "description": "Version firmware confirmée"
    },
    {
      "check": "device.self_test_passed == true",
      "timeoutMs": 10000,
      "description": "Auto-test post-flash réussi"
    }
  ],
  "rollback": {
    "action": "device.firmware_update",
    "params": { "version": "previous" },
    "alertOnRollback": true
  }
}
```

---

## Déploiement STM32F4 — Exemple firmware

```toml
# Cargo.toml
[dependencies]
embassy-stm32 = { version = "0.1", features = ["stm32f401cc"] }
embassy-executor = { version = "0.5", features = ["arch-cortex-m"] }
eyeflow-svm-embedded = { version = "0.1", default-features = false, features = ["stm32"] }

[profile.release]
opt-level = "z"   # Tail-call optimisations pour taille minimale
lto = true        # Link-Time Optimization
```

### Taille du firmware EyeFlow sur STM32F4
| Composant | Flash |
|-----------|-------|
| SVM core (no-std) | 28 KB |
| 1 programme compilé (règle simple) | 4 KB |
| Embassy Tokio runtime | 8 KB |
| **Total** | **40 KB** |

Compatible STM32F401 (256KB flash) avec largement assez de marge.

---

## Topologie IoT multi-nœuds

```
┌────────────────────────────────────────────────────────┐
│  Cloud / On-premise                                    │
│  EyeFlow Server + Dashboard                           │
│       ↓↑ mTLS WebSocket                                │
├────────────────────────────────────────────────────────┤
│  Gateway terrain (Raspberry Pi 4)                     │
│  EyeFlow SVM — 50 programmes chargés                  │
│  Buffer 72h offline                                   │
│       ↓↑ MQTT / BLE / LoRaWAN                          │
├────────────────────────────────────────────────────────┤
│  Dispositifs IoT Edge (STM32F4, nRF52840)             │
│  EyeFlow SVM embedded — 1-4 programmes               │
│  Décisions locales < 1ms (pas de réseau requis)       │
│       ↓↑ GPIO / SPI / I2C / UART                       │
├────────────────────────────────────────────────────────┤
│  Capteurs / Actionneurs physiques                     │
└────────────────────────────────────────────────────────┘
```

---

## Sécurité IoT

- **Firmware signed** : chaque binaire vérifié Ed25519 avant exécution
- **Secure boot** : intégration TrustZone / secure element (ATECC608)
- **Key rotation** : capability `security.key_rotation` pour rotation sans reflash
- **Chiffrement transport** : TLS 1.3 (DTLS pour contraintes MCU)
- **Device identity** : certificats x509 par device, révocables

---

## Prochaines étapes

👉 [Exécution distribuée](../concepts/distributed-execution) — cross-compilation et MCU Embassy  
👉 [Sécurité](../concepts/security) — modèle de sécurité IoT  
👉 [Architecture](../for-developers/architecture) — vue d'ensemble système complète
