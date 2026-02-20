/**
 * Triggers Module — spec §7
 *
 * Open, pluggable event-trigger system.
 *
 * Architecture:
 *   – Every ITriggerDriver is registered as a multi-provider via TRIGGER_DRIVER_TOKEN
 *   – TriggerDriverRegistryService provides lookup / discovery across all drivers
 *   – TriggerActivationService reads TRIGGER opcodes from compiled LLM-IR and
 *     activates the right driver (local or remote via NodesGateway WS)
 *   – TriggerBusService is the RxJS backbone — all driver streams merge here
 *     and are routed to the SVM via registered workflow dispatchers
 *
 * Adding a new driver (zero core modification):
 *   { provide: TRIGGER_DRIVER_TOKEN, useClass: MyNewDriver, multi: true }
 */

import { Module } from '@nestjs/common';
import { TRIGGER_DRIVER_TOKEN } from './interfaces/trigger-driver.interface';

// Core services
import { TriggerBusService }            from './trigger-bus.service';
import { TriggerDriverRegistryService } from './trigger-driver-registry.service';
import { TriggerActivationService }     from './trigger-activation.service';

// Built-in drivers
import { MqttTriggerDriver }          from './drivers/mqtt.trigger-driver';
import { FileSystemTriggerDriver }    from './drivers/filesystem.trigger-driver';
import { HttpWebhookTriggerDriver }   from './drivers/http-webhook.trigger-driver';
import { CronTriggerDriver }          from './drivers/cron.trigger-driver';
import { ImapTriggerDriver }          from './drivers/imap.trigger-driver';
import { WebSocketTriggerDriver }     from './drivers/websocket.trigger-driver';
import { SignalTriggerDriver }        from './drivers/signal.trigger-driver';
import { ModbusBridgeTriggerDriver }  from './drivers/modbus-bridge.trigger-driver';
import { OpcUaBridgeTriggerDriver }   from './drivers/opcua-bridge.trigger-driver';

@Module({
  providers: [
    // ── Core ───────────────────────────────────────────────────────────
    TriggerBusService,
    TriggerDriverRegistryService,
    TriggerActivationService,

    // ── Built-in drivers (multi-provider pattern) ──────────────────────
    { provide: TRIGGER_DRIVER_TOKEN, useClass: MqttTriggerDriver,         multi: true } as any,
    { provide: TRIGGER_DRIVER_TOKEN, useClass: FileSystemTriggerDriver,   multi: true } as any,
    { provide: TRIGGER_DRIVER_TOKEN, useClass: HttpWebhookTriggerDriver,  multi: true } as any,
    { provide: TRIGGER_DRIVER_TOKEN, useClass: CronTriggerDriver,         multi: true } as any,
    { provide: TRIGGER_DRIVER_TOKEN, useClass: ImapTriggerDriver,         multi: true } as any,
    // ── New drivers ────────────────────────────────────────────────────
    { provide: TRIGGER_DRIVER_TOKEN, useClass: WebSocketTriggerDriver,    multi: true } as any,
    { provide: TRIGGER_DRIVER_TOKEN, useClass: SignalTriggerDriver,       multi: true } as any,
    { provide: TRIGGER_DRIVER_TOKEN, useClass: ModbusBridgeTriggerDriver, multi: true } as any,
    { provide: TRIGGER_DRIVER_TOKEN, useClass: OpcUaBridgeTriggerDriver,  multi: true } as any,
  ],
  exports: [
    TriggerBusService,
    TriggerDriverRegistryService,
    TriggerActivationService,
    TRIGGER_DRIVER_TOKEN,
  ],
})
export class TriggersModule {}


