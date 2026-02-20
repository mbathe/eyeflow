---
id: connectors-overview
sidebar_position: 5
title: Vue d'ensemble des connecteurs
description: Architecture des connecteurs EyeFlow — sources d'événements, capabilities d'action, configuration et connecteurs built-in.
---

# Connecteurs — Vue d'ensemble

Un **connecteur** EyeFlow est un module qui associe une source d'événements externe (capteur, API, MQTT…) ou une action physique (vanne, pompe, API tierce) au moteur de compilation et au SVM Rust. Les connecteurs sont définis comme des **capabilities du catalog** et signés Ed25519.

---

## Deux types de connecteurs

### 1. Connecteurs sources d'événements

Ils produisent des `EventPayload` qui déclenchent l'exécution des règles.

```typescript
interface EventPayload {
  source: string;        // "sensor:temperature_cuve"
  value: unknown;        // valeur brute
  unit?: string;         // "°C", "bar", "pH"
  timestamp: string;     // ISO8601
  nodeId: string;        // SVM nœud émetteur
  metadata?: Record<string, unknown>;
}
```

### 2. Connecteurs d'action (capabilities)

Ils exposent des fonctions exécutables depuis un programme LLM-IR via l'opcode `CALL_ACTION`.

```typescript
interface CatalogCapability {
  id: string;
  version: string;
  sector: 'INDUSTRIAL' | 'MEDICAL' | 'AGRICULTURE' | 'FINANCE' | 'IOT';
  description: string;
  handler: string;         // chemin vers le handler TypeScript
  preconditions: Condition[];
  postconditions: Condition[];
  rollbackStrategy: RollbackStrategy;
  signature: string;       // Ed25519
}
```

---

## Connecteurs sources built-in

| Connecteur | Protocole | Secteurs | Config requise |
|-----------|-----------|---------|---------------|
| `kafka-source` | Apache Kafka | Tous | `brokers`, `topic`, `groupId` |
| `mqtt-source` | MQTT 3.1/5.0 | Industrial, IoT, Agri | `broker`, `topic`, `qos` |
| `modbus-tcp` | Modbus TCP | Industrial | `host`, `port`, `unitId` |
| `opcua-source` | OPC-UA DA | Industrial | `endpoint`, `nodeIds` |
| `http-webhook` | HTTP/HTTPS | Tous | `path`, `method`, `auth` |
| `cron-trigger` | Cron (système) | Tous | `expression` |
| `fs-watch` | inotify/kqueue | IoT, Edge | `path`, `events` |
| `cdc-postgres` | PostgreSQL CDC | Finance | `connectionUrl`, `table` |
| `email-imap` | IMAP | Finance | `host`, `credentials`, `folder` |
| `ble-scanner` | Bluetooth LE | IoT, Medical | `serviceUUIDs`, `interface` |
| `amqp-source` | AMQP 0.9.1 | Finance, IoT | `url`, `queue` |

## Connecteurs d'action built-in

| Capability | Secteur | Description |
|-----------|---------|-------------|
| `valve_control` | Industrial | Commande vannes FOUNDATION Fieldbus |
| `pump_control` | Industrial | Commande pompes centrifuges |
| `modbus_write` | Industrial | Écriture registres Modbus |
| `opcua_write` | Industrial | Écriture nœuds OPC-UA |
| `irrigation_control` | Agriculture | Pilotage électrovannes irrigation |
| `drone_waypoint` | Agriculture | Envoi waypoint drone |
| `patient_alert` | Medical | Alerte patient urgente (HL7 FHIR) |
| `alarm_trigger` | Medical | Déclenchement alarme clinique |
| `gpio_write` | IoT, Industrial | Écriture GPIO Raspberry Pi / STM32 |
| `http_call` | Tous | Appel REST API externe |
| `kafka_publish` | Tous | Publication Kafka |
| `email_send` | Tous | Envoi email SMTP |
| `sms_send` | Tous | Envoi SMS (Twilio/OVH) |
| `slack_message` | Tous | Message Slack |
| `webhook_call` | Tous | Webhook sortant |

---

## Configuration d'une source

Les sources sont configurées dans `config.toml` du nœud SVM :

```toml
[[event_sources]]
id = "temperature-sensor-cuve-01"
connector = "mqtt-source"
enabled = true

[event_sources.config]
broker = "mqtt://192.168.1.10:1883"
topic = "factory/sensors/cuve01/temperature"
qos = 1
client_id = "eyeflow-svm-factory"
username = "eyeflow"
password_vault_path = "eyeflow/data/mqtt/factory-password"

[[event_sources]]
id = "pressure-modbus"
connector = "modbus-tcp"

[event_sources.config]
host = "192.168.1.20"
port = 502
unit_id = 1
registers = [
  { name = "pression_bar", address = 100, type = "float32" }
]
poll_interval_ms = 500
```

---

## Comment les connecteurs d'action sont montés dans le SVM

```
Programme LLM-IR
    │
    │ CALL_ACTION "valve_control" {"valve_id": "V-01", "action": "CLOSE"}
    ▼
SVM Rust (executor)
    │
    │ 1. Résoudre capability depuis le catalog
    │ 2. Vérifier la signature Ed25519
    │ 3. Vérifier les préconditions
    │ 4. Acquérir le ResourcePermit (ResourceArbiter)
    │ 5. Exécuter le handler TypeScript (via worker thread)
    │ 6. Vérifier les postconditions
    │ 7. Enregistrer dans AuditChain
    ▼
Handler ConnectorCapability (TypeScript)
    │
    │ - Connexion FOUNDATION Fieldbus / Modbus / REST
    │ - Timeout + retry intégré
    │ - Résultats sérialisés
    ▼
Résultat → SVM → instruction suivante du programme
```

---

## Versionnage et révocation

```bash
# Enregistrer version 1.1.0 d'une capability
eyeflow catalog register \
  --file valve_control_v1.1.0.json \
  --sign-with /etc/eyeflow/keys/ir_signing.pem

# Les programmes signés avec v1.0.x continuent de fonctionner
# jusqu'à leur révocation explicite

# Révoquer toutes les capabilities < 1.1.0
eyeflow catalog revoke valve_control \
  --version "<1.1.0" \
  --reason "Correctif sécurité CVE-2024-XXXX"
```

La révocation est propagée à tous les nœuds SVM via WebSocket dans les 30 secondes. Les programmes utilisant la capability révoquée ne sont **plus exécutés** jusqu'à leur recompilation.

---

## Métriques connecteurs

Les connecteurs publient automatiquement des métriques dans InfluxDB :

| Métrique | Tags |
|---------|------|
| `connector_call_duration_ms` | `capability_id`, `version`, `status` |
| `connector_precondition_failures` | `capability_id`, `condition` |
| `connector_rollback_count` | `capability_id`, `strategy` |
| `event_source_received` | `source_id`, `connector` |
| `event_source_lag_ms` | `source_id` |

---

## Prochaines étapes

👉 [Créer un connecteur custom](./custom) — implémenter sa propre capability  
👉 [Sources d'événements](../concepts/event-sources) — documentation détaillée de chaque source  
👉 [Catalog de capabilities](../concepts/capability-catalog) — préconditions, postconditions, rollback
