---
id: connectors-custom
sidebar_position: 6
title: Créer un connecteur custom
description: Guide complet pour implémenter, tester, signer et enregistrer une capability custom dans EyeFlow.
---

# Créer un connecteur custom

Ce guide explique comment créer une capability personnalisée — c'est-à-dire un connecteur d'action qui peut être appelé depuis un programme LLM-IR compilé.

---

## Anatomie d'une capability

Une capability EyeFlow est composée de :

1. **Un fichier de déclaration JSON** — métadonnées, préconditions, postconditions, rollback
2. **Un handler TypeScript** — logique d'exécution concrète
3. **Une signature Ed25519** — garantit l'immutabilité

```
eyeflow-server/src/catalog/capabilities/
├── valve_control/
│   ├── capability.json     ← déclaration
│   └── handler.ts          ← logique
└── my_custom_pump/
    ├── capability.json
    └── handler.ts
```

---

## 1. Fichier de déclaration `capability.json`

```json
{
  "id": "custom_pump_centrifuge",
  "version": "1.0.0",
  "sector": "INDUSTRIAL",
  "description": "Contrôle des pompes centrifuges séries Grundfos CM",
  "handler": "capabilities/custom_pump_centrifuge/handler.ts",
  "parameters": {
    "pump_id": {
      "type": "string",
      "description": "Identifiant de la pompe (ex: PUMP-01)",
      "required": true
    },
    "action": {
      "type": "string",
      "enum": ["START", "STOP", "SET_SPEED"],
      "required": true
    },
    "speed_rpm": {
      "type": "number",
      "description": "Vitesse en tr/min (requis si action=SET_SPEED)",
      "minimum": 0,
      "maximum": 3600
    }
  },
  "preconditions": [
    {
      "id": "pre_pump_not_emergency_stopped",
      "description": "La pompe ne doit pas être en arrêt d'urgence",
      "check": "ctx.pump_status !== 'EMERGENCY_STOP'",
      "errorCode": "PUMP_EMERGENCY_STOP",
      "severity": "BLOCKING"
    },
    {
      "id": "pre_no_cavitation_risk",
      "description": "Le niveau d'aspiration est suffisant",
      "check": "ctx.suction_level_m > 0.5",
      "errorCode": "INSUFFICIENT_SUCTION_LEVEL",
      "severity": "BLOCKING"
    }
  ],
  "postconditions": [
    {
      "id": "post_pump_state_changed",
      "description": "L'état de la pompe a changé comme attendu",
      "check": "ctx.pump_status === params.action",
      "pollingIntervalMs": 500,
      "timeoutMs": 5000
    }
  ],
  "rollbackStrategy": "IDEMPOTENT_REVERSE",
  "rollbackAction": {
    "action": "STOP",
    "pump_id": "$params.pump_id"
  },
  "timeoutMs": 8000,
  "physicalControlWindow": {
    "cooldownMs": 2000,
    "maxFrequencyPerMinute": 10
  },
  "auditLevel": "FULL"
}
```

---

## 2. Handler TypeScript

```typescript
// src/catalog/capabilities/custom_pump_centrifuge/handler.ts

import { CapabilityHandler, CapabilityContext, CapabilityResult } from '@/catalog/types';
import { ModbusClient } from '@/connectors/modbus';
import { Logger } from '@nestjs/common';

const PUMP_MODBUS_REGISTER = {
  START: 0x01,
  STOP: 0x00,
  SET_SPEED: 0x02,
} as const;

const logger = new Logger('PumpCentrifugeHandler');

export const handler: CapabilityHandler = {
  /**
   * Exécution principale de la capability.
   * Cette fonction est appelée par le SVM après validation des préconditions.
   */
  async execute(
    params: { pump_id: string; action: string; speed_rpm?: number },
    ctx: CapabilityContext,
  ): Promise<CapabilityResult> {
    const { pump_id, action, speed_rpm } = params;
    const { nodeConfig } = ctx;

    // Résoudre la configuration Modbus de cette pompe
    const pumpConfig = nodeConfig.pumps[pump_id];
    if (!pumpConfig) {
      throw new Error(`Pompe inconnue: ${pump_id}`);
    }

    const modbus = new ModbusClient({
      host: pumpConfig.modbus_host,
      port: pumpConfig.modbus_port,
      unitId: pumpConfig.unit_id,
    });

    await modbus.connect();

    try {
      if (action === 'START') {
        await modbus.writeSingleCoil(pumpConfig.start_coil, true);
        logger.log(`Pompe ${pump_id} démarrée`);

      } else if (action === 'STOP') {
        await modbus.writeSingleCoil(pumpConfig.start_coil, false);
        logger.log(`Pompe ${pump_id} arrêtée`);

      } else if (action === 'SET_SPEED') {
        if (speed_rpm === undefined) {
          throw new Error('speed_rpm requis pour SET_SPEED');
        }
        // Convertir en valeur registre (0-32767 → 0-3600 rpm)
        const registerValue = Math.round((speed_rpm / 3600) * 32767);
        await modbus.writeSingleRegister(pumpConfig.speed_register, registerValue);
        logger.log(`Pompe ${pump_id} vitesse réglée à ${speed_rpm} rpm`);
      }

      return {
        success: true,
        data: {
          pump_id,
          action,
          speed_rpm,
          executedAt: new Date().toISOString(),
        },
      };
    } finally {
      await modbus.close();
    }
  },

  /**
   * Rollback : appelé si les postconditions échouent ou si une erreur survient.
   * Doit être idempotent.
   */
  async rollback(
    params: { pump_id: string; action: string },
    ctx: CapabilityContext,
  ): Promise<void> {
    logger.warn(`Rollback pompe ${params.pump_id} — arrêt d'urgence`);
    // Appeler l'action STOP de manière idempotente
    await this.execute({ pump_id: params.pump_id, action: 'STOP' }, ctx);
  },
};
```

---

## 3. Déclarer les types partagés

Si la capability utilise des données de contexte (état sensors), déclarez les types dans `src/catalog/types/`:

```typescript
// src/catalog/types/capability-context.ts

export interface CapabilityContext {
  /** ID du nœud SVM qui exécute la capability */
  nodeId: string;
  /** Configuration spécifique au nœud */
  nodeConfig: Record<string, unknown>;
  /** État courant du contexte d'exécution (valeurs sensors chargées en amont) */
  runtimeContext: Record<string, unknown>;
  /** Client Vault pour résoudre les secrets */
  vaultClient: VaultClient;
  /** Logger structuré */
  logger: Logger;
  /** Timestamp Unix de démarrage de l'instruction */
  startedAtMs: number;
}

export interface CapabilityResult {
  success: boolean;
  data?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

export interface CapabilityHandler {
  execute(params: unknown, ctx: CapabilityContext): Promise<CapabilityResult>;
  rollback?(params: unknown, ctx: CapabilityContext): Promise<void>;
}
```

---

## 4. Enregistrer la capability dans le module

```typescript
// src/catalog/catalog.module.ts

import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { handler as valveControlHandler } from './capabilities/valve_control/handler';
import { handler as pumpCentrifugeHandler } from './capabilities/custom_pump_centrifuge/handler';

@Module({
  providers: [
    CatalogService,
    // Enregistrement automatique via le répertoire capabilities/
    // Ou manuellement :
    {
      provide: 'CAPABILITY_HANDLERS',
      useValue: {
        valve_control: valveControlHandler,
        custom_pump_centrifuge: pumpCentrifugeHandler,
      },
    },
  ],
  exports: [CatalogService],
})
export class CatalogModule {}
```

---

## 5. Signer et enregistrer

```bash
# Signer le fichier de déclaration
openssl dgst -sha256 -sign /etc/eyeflow/keys/ir_signing.pem \
  -out capability.json.sig \
  src/catalog/capabilities/custom_pump_centrifuge/capability.json

# Convertir en base64
SIG=$(base64 -w 0 capability.json.sig)

# Ajouter la signature dans capability.json
jq --arg sig "$SIG" '. + {"signature": $sig}' \
  capability.json > capability_signed.json

# Enregistrer via CLI
eyeflow catalog register \
  --file capability_signed.json \
  --sign-with /etc/eyeflow/keys/ir_signing.pem

# Vérification
eyeflow catalog get custom_pump_centrifuge
```

---

## 6. Tester la capability

```typescript
// test/capabilities/custom_pump_centrifuge.spec.ts

import { Test } from '@nestjs/testing';
import { CatalogService } from '@/catalog/catalog.service';
import { handler } from '@/catalog/capabilities/custom_pump_centrifuge/handler';

describe('CustomPumpCentrifuge capability', () => {
  let catalogService: CatalogService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [CatalogService],
    }).compile();
    catalogService = module.get(CatalogService);
  });

  it('should start a pump successfully', async () => {
    const mockCtx = {
      nodeId: 'test-node',
      nodeConfig: {
        pumps: {
          'PUMP-01': {
            modbus_host: 'localhost',
            modbus_port: 5020, // simulateur Modbus
            unit_id: 1,
            start_coil: 0,
            speed_register: 10,
          },
        },
      },
      runtimeContext: {
        pump_status: 'STOPPED',
        suction_level_m: 1.2,
      },
      vaultClient: { get: jest.fn() },
      logger: { log: jest.fn(), warn: jest.fn() },
      startedAtMs: Date.now(),
    };

    const result = await handler.execute(
      { pump_id: 'PUMP-01', action: 'START' },
      mockCtx as any,
    );

    expect(result.success).toBe(true);
    expect(result.data?.action).toBe('START');
  });

  it('should validate preconditions before executing', async () => {
    const capability = await catalogService.getCatalogCapability('custom_pump_centrifuge');
    
    // Simuler un état d'arrêt d'urgence
    const ctx = { runtimeContext: { pump_status: 'EMERGENCY_STOP', suction_level_m: 1.0 } };
    
    const precheck = await catalogService.checkPreconditions(capability, {}, ctx as any);
    expect(precheck.passed).toBe(false);
    expect(precheck.failedConditions[0].errorCode).toBe('PUMP_EMERGENCY_STOP');
  });
});
```

---

## 7. Connecteur source custom

Pour créer une source d'événements custom (non couverte par les connecteurs built-in) :

```typescript
// src/event-sources/custom-rs485/source.ts

import { EventSource, EventSourceConfig, EventPayload } from '@/event-sources/types';
import { SerialPort } from 'serialport';

export class RS485Source implements EventSource {
  id = 'rs485-source';
  private port: SerialPort;

  async connect(config: EventSourceConfig): Promise<void> {
    this.port = new SerialPort({
      path: config.device,      // ex: /dev/ttyUSB0
      baudRate: config.baudRate, // ex: 9600
    });
  }

  onEvent(callback: (payload: EventPayload) => void): void {
    this.port.on('data', (data: Buffer) => {
      const value = this.parseRS485Frame(data);
      callback({
        source: `rs485:${this.id}`,
        value,
        timestamp: new Date().toISOString(),
        nodeId: process.env.NODE_ID!,
      });
    });
  }

  private parseRS485Frame(data: Buffer): Record<string, number> {
    // Parsing custom selon le protocole du capteur
    return { raw: data.readFloatBE(0) };
  }

  async disconnect(): Promise<void> {
    await new Promise((res) => this.port.close(res as any));
  }
}
```

---

## Checklist de validation d'une capability

Avant de mettre en production :

- [ ] Préconditions couvrent tous les états dangereux
- [ ] Postconditions vérifiées avec timeout réaliste
- [ ] Stratégie de rollback testée en isolation
- [ ] Timeout global ≤ `instruction_timeout_ms` du SVM config
- [ ] Handler est **idempotent** (appel multiple sans effet de bord)
- [ ] Secrets résolus via Vault (pas de credentials hardcodés)
- [ ] Tests unitaires avec mock Modbus/GPIO/REST
- [ ] Tests d'intégration avec simulateur hardware
- [ ] Signature Ed25519 valide
- [ ] Enregistré dans un environnement de staging avant production
