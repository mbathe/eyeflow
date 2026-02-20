---
id: capability-catalog
sidebar_position: 3
title: Catalog de capabilities
description: Gouvernance des capabilities — signature Ed25519, versionnage, préconditions/postconditions/rollback, révocation à chaud et 5 secteurs verticaux.
---

# Catalog de capabilities

Le **Catalog de capabilities** est le registre central de toutes les actions qu'un programme EyeFlow peut exécuter. Chaque capability est **signée, versionnée et révocable** — c'est la seule porte d'entrée vers le monde physique ou numérique.

:::warning Règle absolue
Un programme LLM-IR ne peut exécuter que des actions définies dans le Catalog. Il est **impossible** d'exécuter une action non enregistrée, même si le LLM en génère une.
:::

---

## Structure d'une CatalogCapability

```typescript
interface CatalogCapability {
  id: string;           // Ex: "actuator.valve_control"
  version: string;      // semver: "1.2.0"
  name: string;
  description: string;
  sector: CapabilitySector;
  
  // Permissions requises pour utiliser cette capability
  requiredPermissions: PermissionFlags;
  
  // Contrat sémantique
  preconditions:  PreCondition[];   // Doit être vrai avant exécution
  postconditions: PostCondition[];  // Doit être vrai après exécution
  rollback?:      RollbackConfig;   // Action d'annulation si postcondition échoue
  
  // Signature
  signature:    Buffer;   // Ed25519 sur le hash du contenu
  signedBy:     string;   // ID de l'administrateur signataire
  signedAt:     Date;
  
  // Lifecycle
  status: 'active' | 'deprecated' | 'revoked';
  revokedAt?: Date;
  revokeReason?: string;
}
```

---

## Contrat sémantique

Chaque capability déclare un **contrat formel** vérifié à l'exécution.

### Exemple : valve_control

```json
{
  "id": "actuator.valve_control",
  "version": "1.2.0",
  "preconditions": [
    {
      "type": "sensor_reading_available",
      "description": "Lecture capteur pression disponible et récente (< 30s)",
      "check": "context.lastPressureReading != null && age(context.lastPressureReading) < 30000"
    },
    {
      "type": "no_active_emergency",
      "description": "Pas d'arrêt d'urgence actif",
      "check": "context.emergencyStopActive == false"
    }
  ],
  "postconditions": [
    {
      "type": "valve_state_confirmed",
      "description": "La vanne confirme son nouvel état dans les 10 secondes",
      "check": "valve.actualState == requestedState",
      "timeoutMs": 10000
    }
  ],
  "rollback": {
    "action": "actuator.valve_control",
    "params": { "state": "previous" },
    "maxRetries": 2
  }
}
```

### Vérification runtime

```
Avant CALL_ACTION valve_control :
  ✅ context.lastPressureReading != null → OK
  ✅ age(reading) = 12s < 30s → OK
  ✅ emergencyStopActive = false → OK
  
→ Action exécutée

Après CALL_ACTION valve_control :
  ⏳ Attente confirmation valve... (max 10s)
  ✅ valve.actualState == "closed" → postcondition OK
  
→ Suite du programme
```

Si la postcondition échoue → **rollback automatique** puis escalade au programme appelant.

---

## Signature Ed25519

Signer une nouvelle capability :

```bash
eyeflow-cli catalog sign \
  --capability valve_control.json \
  --private-key admin.ed25519.key \
  --output valve_control.signed.json
```

Vérifier :
```bash
eyeflow-cli catalog verify \
  --capability valve_control.signed.json \
  --public-key admin.ed25519.pub
```

La SVM vérifie chaque capability au chargement du programme. Une capability avec signature invalide bloque l'exécution.

---

## Versionnage

| Changement | Version impact |
|-----------|----------------|
| Ajout d'un paramètre optionnel | PATCH |
| Modification d'une précondition | MINOR |
| Changement d'interface (paramètres requis) | MAJOR |
| Modification du rollback | MINOR |
| Restriction de permissions | MAJOR |

Les programmes LLM-IR déclarent la version de capability requise :
```protobuf
capability_id      = "actuator.valve_control"
capability_version = "^1.2.0"  // compatible >= 1.2.0 < 2.0.0
```

---

## Révocation à chaud

Une capability peut être révoquée **sans redéploiement** :

```bash
eyeflow-cli catalog revoke \
  --id "actuator.valve_control" \
  --version "1.1.0" \
  --reason "Vulnérabilité détectée — remplacer par v1.2.0" \
  --private-key admin.ed25519.key
```

La révocation est propagée à tous les nœuds SVM via le canal de synchronisation. Les programmes utilisant la version révoquée sont **immédiatement suspendus** avec une alerte opérateur.

---

## 5 secteurs verticaux

EyeFlow fournit des catalogs préconfigurés pour 5 secteurs :

### 🏥 Médical
| Capability | Description |
|-----------|-------------|
| `medical.patient_alert` | Alerte équipe soignante avec niveau de priorité |
| `medical.medication_dosage` | Calcul et validation de dosage |
| `medical.vital_signs_monitor` | Lecture multi-capteurs patient |
| `medical.icu_coordinate` | Coordination soins ICU multi-intervenants |
| `medical.ehr_update` | Mise à jour dossier patient (conforme HL7) |

### 🏭 Industriel
| Capability | Description |
|-----------|-------------|
| `actuator.valve_control` | Contrôle vanne industrielle |
| `actuator.pump_control` | Démarrage/arrêt pompe avec rampe |
| `actuator.emergency_stop` | Arrêt d'urgence certifié SIL2 |
| `sensor.read_multiple` | Lecture multi-capteurs synchronisée |
| `dcs.log_incident` | Enregistrement incident DCS |

### 🌾 Agriculture
| Capability | Description |
|-----------|-------------|
| `irrigation.zone_control` | Contrôle zone d'irrigation précision |
| `pesticide.dose_control` | Dosage pesticides avec seuils réglementaires |
| `soil.moisture_read` | Lecture humidité sol multi-points |
| `weather.forecast_integration` | Intégration météo pour décision |
| `harvest.schedule_optimize` | Optimisation calendrier récolte |

### 💰 Finance
| Capability | Description |
|-----------|-------------|
| `transaction.validate` | Validation transaction avec règles AMF |
| `fraud.detect` | Détection fraude temps réel |
| `report.generate_regulatory` | Génération rapport réglementaire |
| `compliance.check` | Vérification conformité RGPD/NIS2 |
| `risk.score_calculate` | Calcul score de risque |

### 📡 IoT
| Capability | Description |
|-----------|-------------|
| `device.firmware_update` | Mise à jour firmware OTA sécurisée |
| `device.telemetry_collect` | Collecte télémétrie multi-protocoles |
| `device.reboot` | Reboot distant avec confirmation |
| `network.topology_map` | Cartographie réseau IoT |
| `alert.threshold_monitor` | Surveillance seuils multi-capteurs |

---

## Ajouter une capability personnalisée

```typescript
// eyeflow-server/src/catalog/capabilities/my-custom.capability.ts
import { CatalogCapabilityBuilder } from '@eyeflow/catalog';

export const myCustomCapability = CatalogCapabilityBuilder
  .create('custom.my_action')
  .version('1.0.0')
  .sector('industrial')
  .description('Ma capability personnalisée')
  .precondition('context.connected == true', 'Connexion active requise')
  .postcondition('result.success == true', 'Action confirmée', 5000)
  .rollback('custom.my_action_undo', {})
  .handler(async (params, context) => {
    // Implémentation
    return { success: true };
  })
  .build();
```

---

## Prochaines étapes

👉 [SVM Runtime](./svm-runtime) — comment la SVM exécute les capabilities  
👉 [Sécurité](./security) — modèle de menace et certifications  
👉 [Verticals — Médical](../verticals/medical) — catalog médical en détail
