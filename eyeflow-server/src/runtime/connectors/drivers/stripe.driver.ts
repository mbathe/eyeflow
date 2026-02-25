/**
 * StripeDriver — handles 'stripe' connector type.
 * query       → list a Stripe resource (invoices, customers, charges, …)
 * executeAction → stripe_createPaymentIntent, stripe_createCustomer, stripe_createRefund, …
 */

import { ExecutorContext } from '../../executors/executor.interface';
import { BaseConnectorDriver, ConnectorDriverError } from '../connector-driver.interface';
import { ConnectorPayload, ConnectorQueryOptions, ConnectorActionDescriptor } from '../connector-payload.interface';
import { ConnectorDataNormalizer } from '../connector-data-normalizer';

export class StripeDriver extends BaseConnectorDriver {
  canHandle(t: string): boolean { return t === 'stripe'; }

  async query(opts: ConnectorQueryOptions, cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload> {
    const Stripe = this._require('stripe', 'npm install stripe');
    const stripe = new Stripe(this._key(cfg, ctx), { apiVersion: '2023-10-16' });
    const resource = opts.resource; // 'invoices', 'customers', 'charges', …
    const stripeResource = (stripe as any)[resource];
    if (!stripeResource) throw new ConnectorDriverError(`Stripe: unknown resource '${resource}'`, 'CONFIG_ERROR', false);
    const params: Record<string, unknown> = { limit: opts.limit ?? 10 };
    for (const f of opts.filters ?? []) {
      if (f.op === 'eq') params[f.field] = f.value;
    }
    const list = await stripeResource.list(params);
    return ConnectorDataNormalizer.wrap({ data: list.data, has_more: list.has_more }, {
      connectorId: this._connectorId(cfg, ctx),
      connectorType: 'stripe',
      operation: `list_${resource}`,
      source: `stripe:${resource}`,
      extra: { hasMore: list.has_more },
    });
  }

  async executeAction(action: ConnectorActionDescriptor, cfg: Record<string, unknown>, ctx: ExecutorContext): Promise<ConnectorPayload> {
    const Stripe = this._require('stripe', 'npm install stripe');
    const stripe = new Stripe(this._key(cfg, ctx), { apiVersion: '2023-10-16' });
    const p = action.params as Record<string, unknown>;
    const op = action.functionId.replace(/^stripe_/, '');
    let raw: unknown;

    switch (op) {
      case 'createPaymentIntent':
        raw = await stripe.paymentIntents.create({ amount: p['amount'], currency: p['currency'], customer: p['customerId'], metadata: p['metadata'] } as any);
        break;
      case 'getCustomer':
        raw = await stripe.customers.retrieve(p['customerId'] as string);
        break;
      case 'createCustomer':
        raw = await stripe.customers.create({ email: p['email'], name: p['name'], metadata: p['metadata'] } as any);
        break;
      case 'listInvoices':
        raw = await stripe.invoices.list({ customer: p['customerId'] as string, status: p['status'] as any, limit: p['limit'] as number ?? 10 });
        break;
      case 'createRefund':
        raw = await stripe.refunds.create({ payment_intent: p['paymentIntentId'] as string, amount: p['amount'] as number, reason: p['reason'] as any });
        break;
      default: {
        // Generic: stripe[resource][method](params)
        const parts = op.split('_');
        if (parts.length < 2) throw new ConnectorDriverError(`Stripe: unsupported operation '${op}'`, 'UNSUPPORTED_OPERATION', false);
        const resource = parts[0];
        const method = parts.slice(1).join('_');
        const stripeResource = (stripe as any)[resource];
        if (!stripeResource || typeof (stripeResource as any)[method] !== 'function') {
          throw new ConnectorDriverError(`Stripe: stripe.${resource}.${method} is not a function`, 'UNSUPPORTED_OPERATION', false);
        }
        raw = await (stripeResource as any)[method](p);
      }
    }
    return ConnectorDataNormalizer.wrap(raw, {
      connectorId: this._connectorId(cfg, ctx),
      connectorType: 'stripe',
      operation: action.functionId,
    });
  }

  private _key(cfg: Record<string, unknown>, ctx: ExecutorContext): string {
    return (cfg['secretKey'] as string) || ctx.secrets?.['STRIPE_SECRET_KEY'] || '';
  }
}
