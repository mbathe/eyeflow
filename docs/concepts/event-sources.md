---
id: event-sources
sidebar_position: 5
title: Sources d'événements
description: Les 11 types de sources d'événements supportés par EyeFlow — Kafka, MQTT, Modbus, OPC-UA, HTTP webhook, Cron, FS watcher, CDC, Email, BLE, AMQP.
---

# Sources d'événements

EyeFlow supporte **11 types de sources d'événements** pour déclencher l'exécution des règles. Chaque source est un adaptateur qui normalise les données entrantes en un `EventPayload` standard avant dispatching vers la SVM.

---

## Architecture de dispatching

```
Source externe      Adaptateur        EventBus          SVM
    │                   │                │               │
    ├─ Kafka ──────────►│               │               │
    ├─ MQTT ───────────►│               │               │
    ├─ Modbus ─────────►│  normalize    │  match rules  │  execute
    ├─ OPC-UA ─────────►│──────────────►│──────────────►│──────────►
    ├─ HTTP POST ───────►│               │               │
    ├─ Cron ───────────►│               │               │
    ├─ FS Watch ────────►│               │               │
    ├─ CDC (DB) ────────►│               │               │
    ├─ Email ───────────►│               │               │
    ├─ BLE ────────────►│               │               │
    └─ AMQP ───────────►│               │               │
```

---

## 1. Apache Kafka

**Usage :** ingestion haute-fréquence, données de télémétrie, événements d'infrastructure.

```json
{
  "source": "kafka",
  "config": {
    "brokers": ["kafka-01:9092", "kafka-02:9092"],
    "topic": "sensor.readings",
    "groupId": "eyeflow-consumer",
    "fromBeginning": false
  },
  "filter": {
    "key_contains": "TEMP-"
  }
}
```

- Débit : jusqu'à 1M événements/s par nœud SVM
- Offset management : commit après exécution réussie
- Replay : possible pour reprocesser des événements historiques

---

## 2. MQTT (IoT)

**Usage :** capteurs IoT, équipements industriels légers, edge devices.

```json
{
  "source": "mqtt",
  "config": {
    "broker": "mqtt://factory-broker:1883",
    "topic": "factory/line-1/sensors/#",
    "qos": 1,
    "clientId": "eyeflow-svm-01"
  }
}
```

- QoS 0, 1, 2 supportés
- TLS/mTLS pour connexions sécurisées
- Compatible MQTT 3.1.1 et 5.0
- Retain messages : récupération de la dernière valeur au démarrage

---

## 3. Modbus (Industriel)

**Usage :** automates industriels, PLCs, instrumentation terrain.

```json
{
  "source": "modbus",
  "config": {
    "mode": "tcp",
    "host": "plc-01.factory.local",
    "port": 502,
    "unitId": 1,
    "registers": [
      { "address": 100, "type": "holding", "name": "temperature" },
      { "address": 101, "type": "holding", "name": "pressure" },
      { "address": 200, "type": "coil", "name": "pump_status" }
    ],
    "pollIntervalMs": 1000
  }
}
```

- Modbus TCP et Modbus RTU (via gateway)
- Adressage par registres holding, input, coils, discrete inputs
- Polling configurable de 100ms à 3600s

---

## 4. OPC-UA (Automatisation industrielle)

**Usage :** SCADA, DCS, équipements conformes IEC 62541.

```json
{
  "source": "opcua",
  "config": {
    "endpoint": "opc.tcp://scada-server:4840",
    "securityPolicy": "Basic256Sha256",
    "subscriptions": [
      { "nodeId": "ns=2;s=Tank.Temperature", "name": "tank_temp" },
      { "nodeId": "ns=2;s=Tank.Pressure",    "name": "tank_pres" }
    ],
    "publishingIntervalMs": 500
  }
}
```

- Sécurité : None / Basic128Rsa15 / Basic256Sha256
- Subscriptions OPC-UA (push) vs polling configurable
- Support des alarmes OPC-UA (AlarmConditionType)

---

## 5. HTTP Webhook

**Usage :** intégrations SaaS, CI/CD triggers, APIs partenaires.

```json
{
  "source": "http_webhook",
  "config": {
    "path": "/webhooks/github",
    "method": "POST",
    "auth": {
      "type": "hmac_sha256",
      "secret_vault_key": "github/webhook_secret"
    }
  }
}
```

- HMAC-SHA256, Bearer token, IP whitelist
- Réponse synchrone ou asynchrone configurable
- Rate limiting par source

---

## 6. Cron (Planification temporelle)

**Usage :** rapports périodiques, collectes programmées, maintenances planifiées.

```json
{
  "source": "cron",
  "config": {
    "schedule": "0 */4 * * *",
    "timezone": "Europe/Paris",
    "catchupMissed": false
  }
}
```

- Syntaxe cron standard + extensions (secondes, années)
- Support des timezones IANA
- `catchupMissed: true` rejoue les exécutions manquées (ex: après downtime)

---

## 7. Filesystem Watcher

**Usage :** traitement de fichiers déposés (rapports, imports batch, images).

```json
{
  "source": "fs_watch",
  "config": {
    "path": "/data/incoming",
    "pattern": "*.csv",
    "events": ["create", "modify"],
    "debounceMs": 500
  }
}
```

- Inotify (Linux) / FSEvents (macOS) / ReadDirectoryChanges (Windows)
- Debounce configurable pour les écritures longues
- Déplacement automatique vers `/processed` après exécution

---

## 8. CDC — Change Data Capture

**Usage :** réaction aux changements de base de données (PostgreSQL, MySQL, MongoDB).

```json
{
  "source": "cdc",
  "config": {
    "engine": "postgresql",
    "connection": "postgres://user:pass@db:5432/app",
    "slot": "eyeflow_cdc_slot",
    "tables": ["orders", "patients", "transactions"],
    "operations": ["INSERT", "UPDATE"]
  }
}
```

- PostgreSQL logical replication (pgoutput)
- MySQL binlog
- MongoDB Change Streams
- Filtre par table, opération et colonnes modifiées

---

## 9. Email (IMAP/SMTP)

**Usage :** traitement d'emails entrants, alertes reçues par mail, commandes email.

```json
{
  "source": "email",
  "config": {
    "protocol": "imap",
    "host": "mail.company.com",
    "port": 993,
    "tls": true,
    "folder": "INBOX",
    "filter": {
      "from_contains": "@critical-supplier.com",
      "subject_contains": "[ALERT]"
    },
    "markReadAfterProcess": true
  }
}
```

---

## 10. BLE (Bluetooth Low Energy)

**Usage :** capteurs sans fil, wearables médicaux, équipements terrain.

```json
{
  "source": "ble",
  "config": {
    "adapter": "hci0",
    "serviceUuid": "0000181a-0000-1000-8000-00805f9b34fb",
    "characteristicUuid": "00002a6e-0000-1000-8000-00805f9b34fb",
    "scanIntervalMs": 5000
  }
}
```

Disponible uniquement sur les nœuds SVM Linux avec adaptateur BLE (y compris nRF52 en mode périphérique).

---

## 11. AMQP (RabbitMQ, Azure Service Bus)

**Usage :** intégrations enterprise, queues de messages, workflows distribués.

```json
{
  "source": "amqp",
  "config": {
    "url": "amqps://user:pass@rabbitmq:5671",
    "queue": "eyeflow.orders.incoming",
    "prefetch": 10,
    "ackMode": "after_execution"
  }
}
```

---

## Format EventPayload normalisé

Quel que soit la source, la SVM reçoit un `EventPayload` unifié :

```typescript
interface EventPayload {
  id:        string;          // UUID unique
  source:    EventSourceType; // "kafka" | "mqtt" | "modbus" | ...
  timestamp: number;          // Unix ms
  topic?:    string;          // Topic/canal d'origine
  payload:   Record<string, unknown>;  // Données brutes normalisées
  metadata: {
    nodeId:    string;
    sourceConfig: string;    // Hash de config pour traçabilité
  };
}
```

---

## Prochaines étapes

👉 [Exécution distribuée](./distributed-execution) — multi-nœuds, offline, MCU  
👉 [Contrôle physique](./physical-control) — TimeWindow et postconditions  
👉 [Quickstart](../getting-started/quickstart) — configurer votre première source
