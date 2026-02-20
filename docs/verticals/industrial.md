---
id: industrial
sidebar_position: 2
title: Secteur industriel
description: EyeFlow pour l'industrie 4.0 — certifiable SIL2, catalog d'actionneurs, intégration SCADA/DCS, Modbus/OPC-UA, contrôle de processus déterministe.
---

# EyeFlow — Secteur industriel

EyeFlow apporte l'**intelligence sémantique** aux systèmes industriels tout en maintenant les garanties de sécurité fonctionnelle exigées par l'industrie : déterminisme, vérification formelle, postconditions sur actionneurs et certification SIL2.

---

## Pourquoi EyeFlow en industrie ?

| Défi industriel | Solution EyeFlow |
|----------------|-----------------|
| Décisions de process déterministes | LLM compilé statiquement — zéro décision dynamique |
| Certification IEC 61508 SIL2 | Rapports Z3, postconditions, arrêts d'urgence certifiés |
| Intégration SCADA/PLC existants | Modbus TCP, OPC-UA, source d'événements native |
| Réaction < 100ms sur alarmes | SVM Rust < 5ms + priorité CRITICAL ResourceArbiter |
| Offline sur équipements terrain | Buffer Kafka local + réconciliation |
| Multi-protocoles hétérogènes | 11 sources : MQTT, Modbus, OPC-UA, Kafka, HTTP... |

---

## Catalog industriel — Capabilities

| Capability | Version | Description |
|-----------|---------|-------------|
| `actuator.valve_control` | 1.2.0 | Contrôle vanne avec postcondition position |
| `actuator.pump_control` | 1.3.0 | Démarrage/arrêt pompe avec rampe de vitesse |
| `actuator.emergency_stop` | 2.0.0 | Arrêt d'urgence certifié SIL2 |
| `actuator.conveyor_control` | 1.0.0 | Contrôle convoyeur (vitesse, sens, arrêt) |
| `sensor.read_multiple` | 1.5.0 | Lecture synchronisée multi-capteurs |
| `sensor.calibration_check` | 1.0.0 | Vérification calibration capteur |
| `dcs.log_incident` | 1.2.0 | Enregistrement incident DCS structuré |
| `dcs.work_order` | 1.0.0 | Création ordre de travail CMMS |
| `vision.defect_detect` | 1.0.0 | Détection défauts par vision industrielle |
| `energy.consumption_log` | 1.0.0 | Logging consommation énergie ISO 50001 |

---

## Exemple 1 : Surveillance cuve chimique

### Règle métier
```
Surveiller en continu la cuve de réaction R-101.
Si température > 140°C ET pression > 8 bar simultanément,
analyser l'état du process pour déterminer la cause,
fermer la vanne d'alimentation V-101 avec confirmation postcondition,
déclencher le refroidissement TC-101 et notifier l'opérateur.
```

### Programme compilé
```
[CRON every=5s / EVENT modbus.R101.*]
 → [LOAD_RESOURCE sensor.read_multiple
     targets=["R101-TEMP","R101-PRES","R101-LVL"]]
 → [EVAL temp > 140 AND pressure > 8.0]
      true:
       → [LLM_CALL model=gpt-4o temp=0.1 priority=HIGH
           fewShot=frozen(5 scénarios chimiques)
           output={cause: enum[runaway,blockage,sensor_fault,normal_transition]}]
       → [CALL_ACTION actuator.valve_control
           target="V-101" command="close"
           priority=CRITICAL maxWait=500ms
           postcondition="pressure_downstream < 5.0" timeout=15s]
       → [CALL_ACTION actuator.pump_control
           target="TC-101" command="start" speed=100]
       → [CALL_ACTION dcs.log_incident priority=HIGH]
       → [CALL_ACTION notification.slack channel="#alarmes-prod"]
      false:
       → [CALL_ACTION dcs.log_incident priority=LOW]
```

### Vérification Z3 automatique
```
✅ Invariant: CALL_ACTION valve_control IMPLIQUE LOAD_RESOURCE précédent
✅ Invariant: cause ∈ {runaway, blockage, sensor_fault, normal_transition}
✅ Invariant: priorité CRITICAL → maxWait ≤ 2000ms
✅ Invariant: postcondition définie sur action physique irréversible
Z3: SATISFIABLE — signature autorisée
```

---

## Exemple 2 : Maintenance prédictive

### Règle métier
```
Chaque jour à 6h, analyser les vibrations des moteurs M-01 à M-08
pour détecter des signes de défaillance imminente.
Si un moteur présente des anomalies vibratoires, calculer
l'urgence de maintenance et créer un ordre de travail CMMS.
```

### Pipeline multi-LLM
```
[LLM_CALL Gemini Flash] → extraction des patterns vibratoires (0.0)
          ↓
[LLM_CALL GPT-4o]      → diagnostic et niveau d'urgence (0.3)
          ↓
[CALL_ACTION dcs.work_order] → création OT avec priorité calculée
```

---

## Intégration SCADA/DCS existant

EyeFlow peut se connecter à votre infrastructure SCADA sans la remplacer :

```json
{
  "source": "opcua",
  "config": {
    "endpoint": "opc.tcp://scada-server:4840",
    "securityPolicy": "Basic256Sha256",
    "certificate": "/certs/eyeflow-opcua.der",
    "subscriptions": [
      { "nodeId": "ns=2;s=R101.Temperature", "name": "temp" },
      { "nodeId": "ns=2;s=R101.Pressure", "name": "pressure" }
    ]
  }
}
```

EyeFlow **enrichit** le SCADA avec une couche sémantique — il ne le remplace pas.

---

## Architecture déploiement industriel

```
┌──────────────────────────────────────────────────────┐
│              Réseau industriel (OT)                  │
│                                                      │
│  PLC Siemens S7-1500  ──OPC-UA──►  EyeFlow SVM       │
│  Modbus RTU capteurs  ──Modbus──►  (node-plant-01)   │
│  SCADA Wonderware     ──OPC-UA──►                    │
│                                        │              │
│                                        │ mTLS WS      │
│                                        ▼              │
│                               EyeFlow Server (DMZ)   │
│                               (Dashboard + Compiler)  │
└──────────────────────────────────────────────────────┘
          ↕ Kafka TLS (audit)
┌──────────────────────────────────────────────────────┐
│  Réseau IT                                           │
│  CMMS (SAP PM)  ◄──── EyeFlow API  ────► InfluxDB   │
│  ERP (SAP)                                Grafana    │
└──────────────────────────────────────────────────────┘
```

---

## Certification SIL2 (IEC 61508)

```bash
eyeflow-cli cert generate \
  --rule-id cmp_01HXYZ... \
  --standard iec61508-sil2 \
  --output ./certification/
```

Génère :
- Analyse de risque FMEA automatisée
- Rapport de vérification formelle Z3
- Matrice couverture test → exigence
- Evidence log pour audit externe

---

## Prochaines étapes

👉 [SVM Runtime](../concepts/svm-runtime) — scheduler CRITICAL et ResourceArbiter  
👉 [Sources d'événements](../concepts/event-sources) — Modbus, OPC-UA en détail  
👉 [Secteur agriculture](./agriculture) — de l'usine au champ
