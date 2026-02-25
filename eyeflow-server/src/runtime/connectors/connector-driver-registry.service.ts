/**
 * ConnectorDriverRegistry
 *
 * Central registry that maps connector type strings → IConnectorDriver instances.
 *
 * Lookup rules:
 *   1. Walk registered drivers in registration order.
 *   2. Return the first driver for which canHandle(type) returns true.
 *   3. Drivers are registered from most-specific to least-specific:
 *       sql, mongo, kafka, mqtt, smtp, slack, stripe, s3, localFile, …
 *       HttpGenericDriver  ← LAST (canHandle always returns true → final fallback)
 *
 * Custom connectors
 * ─────────────────
 * Any connector whose type is not matched by a specific driver falls through to
 * HttpGenericDriver. As long as the connector configuration contains a { baseUrl }
 * and optional auth fields, the generic driver constructs valid HTTP calls from
 * the `operationConfig` provided in the IR instruction.
 *
 * Extending at runtime
 * ────────────────────
 * Third-party modules (e.g. edge-node extensions) may call:
 *   registry.register(new MyCustomDriver(), { prepend: true })
 * to take priority over built-in drivers for their connector type.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IConnectorDriver } from './connector-driver.interface';
import { ConnectorPayload, ConnectorQueryOptions, ConnectorActionDescriptor } from './connector-payload.interface';
import { ExecutorContext } from '../executors/executor.interface';

// Built-in drivers
import { SqlDriver }       from './drivers/sql.driver';
import { MongoDriver }     from './drivers/mongo.driver';
import { KafkaDriver }     from './drivers/kafka.driver';
import { MqttDriver }      from './drivers/mqtt.driver';
import { SmtpDriver }      from './drivers/smtp.driver';
import { SlackDriver }     from './drivers/slack.driver';
import { StripeDriver }    from './drivers/stripe.driver';
import { S3Driver }        from './drivers/s3.driver';
import { LocalFileDriver } from './drivers/local-file.driver';
import { HttpGenericDriver } from './drivers/http-generic.driver';

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ConnectorDriverRegistry implements OnModuleInit {
  private readonly logger = new Logger(ConnectorDriverRegistry.name);
  private readonly _drivers: IConnectorDriver[] = [];

  onModuleInit(): void {
    this._registerBuiltIns();
    this.logger.log(`ConnectorDriverRegistry initialised with ${this._drivers.length} drivers`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register a driver.
   * @param driver   Driver instance to register
   * @param opts.prepend  When true, the driver is checked before all existing drivers
   *                      (useful for hot-loading custom drivers from plugins)
   */
  register(driver: IConnectorDriver, opts: { prepend?: boolean } = {}): void {
    if (opts.prepend) {
      this._drivers.unshift(driver);
    } else {
      this._drivers.push(driver);
    }
    this.logger.debug(`Registered driver ${driver.constructor.name}`);
  }

  /**
   * Resolve the driver for a given connector type.
   * Throws if no driver can handle the type (should never happen because
   * HttpGenericDriver is the universal fallback).
   */
  resolve(connectorType: string): IConnectorDriver {
    const driver = this._drivers.find((d) => d.canHandle(connectorType));
    if (!driver) {
      throw new Error(
        `ConnectorDriverRegistry: no driver for connector type '${connectorType}'. ` +
        `Register a custom driver or ensure HttpGenericDriver is set up.`,
      );
    }
    return driver;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Convenience pass-through methods called by ConnectorExecutor
  // ─────────────────────────────────────────────────────────────────────────

  async query(
    connectorType: string,
    options: ConnectorQueryOptions,
    connCfg: Record<string, unknown>,
    ctx: ExecutorContext,
  ): Promise<ConnectorPayload> {
    const driver = this.resolve(connectorType);
    return driver.query(options, connCfg, ctx);
  }

  async executeAction(
    connectorType: string,
    action: ConnectorActionDescriptor,
    connCfg: Record<string, unknown>,
    ctx: ExecutorContext,
  ): Promise<ConnectorPayload> {
    const driver = this.resolve(connectorType);
    return driver.executeAction(action, connCfg, ctx);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Built-in registration
  // ─────────────────────────────────────────────────────────────────────────

  private _registerBuiltIns(): void {
    // Specific drivers first (most precise match)
    this.register(new SqlDriver());
    this.register(new MongoDriver());
    this.register(new KafkaDriver());
    this.register(new MqttDriver());
    this.register(new SmtpDriver());
    this.register(new SlackDriver());
    this.register(new StripeDriver());
    this.register(new S3Driver());
    this.register(new LocalFileDriver());

    // Generic HTTP driver LAST — canHandle() always returns true → universal fallback.
    // This covers: rest_api, webhook, graphql, shopify, hubspot, teams, whatsapp,
    // influxdb, google_drive, dropbox, dynamodb, firestore,
    // AND any user-defined custom connector type.
    this.register(new HttpGenericDriver());
  }
}
