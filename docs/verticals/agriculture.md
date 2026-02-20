---
id: agriculture
sidebar_position: 3
title: Secteur agriculture
description: EyeFlow pour l'agriculture de précision — irrigation intelligente, dosage phytosanitaire, monitoring sol/météo, déploiement offline Raspberry Pi terrain.
---

# EyeFlow — Agriculture de précision

EyeFlow connecte les données terrain (sol, météo, capteurs IoT) à des **décisions agronomiques reproductibles** déployables offline sur Raspberry Pi ou MCU, sans dépendre d'un cloud.

---

## Pourquoi EyeFlow en agriculture ?

| Défi agricole | Solution EyeFlow |
|--------------|-----------------|
| Connectivité terrain intermittente | Exécution offline + buffer + réconciliation |
| Décisions dosage phytosanitaire réglementées | Déterminisme compilé + audit trail |
| Matériel bas coût (Raspberry Pi, Arduino) | SVM Rust ARMv7 / Embassy MCU |
| Diversité protocoles (MQTT, LoRaWAN, Modbus) | 11 sources d'événements supportées |
| Traçabilité pour certification bio/HVE | Chaîne audit SHA-256 par action |
| Intégration météo en temps réel | Source HTTP webhook + API météo |

---

## Catalog agriculture — Capabilities

| Capability | Version | Description |
|-----------|---------|-------------|
| `irrigation.zone_control` | 1.2.0 | Ouverture/fermeture zone d'irrigation précision |
| `irrigation.schedule_optimize` | 1.0.0 | Optimisation planning selon prévisions météo |
| `pesticide.dose_control` | 1.1.0 | Dosage phytosanitaires avec seuils réglementaires |
| `fertilizer.dose_control` | 1.0.0 | Dosage fertilisants selon analyse sol |
| `soil.moisture_read` | 1.3.0 | Lecture humidité sol multi-points |
| `soil.nutrient_read` | 1.0.0 | Analyse NPK sol (capteurs embarqués) |
| `weather.forecast_integration` | 1.2.0 | Intégration prévisions météo (Météo-France, OpenMeteo) |
| `harvest.schedule_optimize` | 1.0.0 | Optimisation calendrier récolte |
| `traceability.log_action` | 1.0.0 | Log action pour certification bio/HVE/GlobalGAP |
| `alert.agronomist` | 1.0.0 | Notification agronomiste avec contexte complet |

---

## Exemple 1 : Irrigation précision adaptative

### Règle métier
```
Chaque matin à 5h, consulter les prévisions météo et les mesures
d'humidité sol des 4 zones d'irrigation.
Si une zone est en dessous du seuil d'humidité et qu'aucune pluie
n'est prévue dans les 12h, irriguer avec le volume optimal calculé
selon l'évapotranspiration de la journée.
```

### Programme compilé
```
[CRON 05:00 daily timezone=Europe/Paris]
 → [LOAD_RESOURCE weather.forecast_integration hours=12]
 → [LOAD_RESOURCE soil.moisture_read zones=["Z1","Z2","Z3","Z4"]]
 → [EVAL rain_probability < 30 (pour chaque zone)]
      AND soil.moisture_zone_i < threshold_zone_i
       true:
        → [LLM_CALL model=gpt-4o-mini temp=0.0
            fewShot=frozen(calibré sur données histórico)
            output={volume_m3: number, duration_min: number}]
        → [CALL_ACTION irrigation.zone_control
            zone=zone_i volume=computed
            postcondition="soil.moisture > target" timeout=120min]
        → [CALL_ACTION traceability.log_action type=irrigation]
       false:
        → [CALL_ACTION traceability.log_action type=no_irrigation reason=rain_forecast]
```

---

## Exemple 2 : Alerte phytosanitaire

### Règle métier
```
Surveiller les conditions favorables aux maladies fongiques
(humidité air > 85% ET température 15-25°C pendant > 6h consécutives).
Si les conditions sont réunies, analyser le risque par culture et parcelle,
proposer un traitement préventif adapté dans les seuils réglementaires.
```

### Garde-fous dosage phytosanitaire
```json
{
  "action": "pesticide.dose_control",
  "preconditions": [
    {
      "check": "product.authorized_in_zone == true",
      "description": "Produit autorisé dans la zone réglementaire"
    },
    {
      "check": "dose_kg_ha <= product.max_dose_regulation",
      "description": "Dose inférieure au maximum réglementaire"
    },
    {
      "check": "days_since_last_application >= product.min_interval_days",
      "description": "Délai minimum entre applications respecté"
    }
  ],
  "cancellationWindow": {
    "durationMs": 120000,
    "requiresAcknowledgment": true
  }
}
```

---

## Déploiement terrain — Raspberry Pi hors réseau

### Architecture offline
```
┌─────────────────────────────────────────────┐
│  Parcelle  (zone sans réseau mobile)        │
│                                             │
│  Raspberry Pi 3B+ (ARMv7)                  │
│  EyeFlow SVM — offline mode                 │
│       ↓ GPIO / I2C                          │
│  Capteurs sol (humidité, NPK, T°)           │
│  Électrovannes irrigation                   │
│                                             │
│  Buffer local : 72h d'événements            │
│  Programmes chargés : 3 règles              │
└─────────────────────────────────────────────┘
         ↕ WiFi (quand dispo) / 4G routeur
┌─────────────────────────────────────────────┐
│  EyeFlow Server (cloud ou ferme)            │
│  → Mise à jour programmes                   │
│  → Récupération audit logs                  │
│  → Dashboard exploitant                     │
└─────────────────────────────────────────────┘
```

### Cross-compilation ARMv7
```bash
rustup target add armv7-unknown-linux-gnueabihf

cargo build --release \
  --target armv7-unknown-linux-gnueabihf

# Déploiement OTA
eyeflow-cli deploy \
  --node node-farm-01 \
  --binary target/armv7-unknown-linux-gnueabihf/release/eyeflow-svm
```

---

## Traçabilité certification

Pour les certifications **bio, HVE, GlobalGAP** — chaque action est loggée :

```json
{
  "timestamp": "2026-02-20T05:47:23Z",
  "parcelle": "P-04-NW",
  "action": "irrigation",
  "volume_m3": 12.4,
  "duration_min": 45,
  "trigger": "soil_moisture_deficit",
  "weather_used": { "rain_forecast_12h": 5, "etp_mm": 4.2 },
  "operator": "auto",
  "auditHash": "sha256:f3a1b2..."
}
```

Export annuel pour audit : `eyeflow-cli audit export --format globalGAP --year 2025`

---

## Prochaines étapes

👉 [Sources d'événements](../concepts/event-sources) — MQTT, LoRa, capteurs terrain  
👉 [Exécution distribuée](../concepts/distributed-execution) — offline Raspberry Pi  
👉 [Secteur finance](./finance) — des champs aux marchés financiers
