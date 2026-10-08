import "server-only";
import type Stripe from "stripe";
import { ownsSession, paymentState, type Mode } from "./payment-policy";
import { registry, signEvent } from "./products";
import { stripe, subscriptionFor, subscriptionSnapshot } from "./stripe";

const CHECKOUT = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"]);
const SUBSCRIPTION = new Set(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed"]);
const INVOICE = new Set(["invoice.paid", "invoice.payment_failed"]);
export const FORWARDED_EVENTS = [...CHECKOUT, ...SUBSCRIPTION, ...INVOICE];

type Outbound = { id: string; type: "checkout.updated" | "subscription.updated"; trigger: string; mode: Mode; created: number;
  product: string; reference: string; checkout?: Record<string, unknown>; subscription?: ReturnType<typeof subscriptionSnapshot> };

/** Builds the product event from Stripe's current state, not the event payload, so a late retry never regresses state. */
export async function productEvent(event: Stripe.Event): Promise<Outbound | null> {
  const mode: Mode = event.livemode ? "live" : "test";
  const base = { id: event.id, trigger: event.type, mode, created: event.created };
  if (CHECKOUT.has(event.type)) {
    const s = await stripe(mode).checkout.sessions.retrieve((event.data.object as Stripe.Checkout.Session).id);
    if (!ownsSession(s)) return null;
    const subscriptionId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
    return { ...base, type: "checkout.updated", product: s.metadata!.product, reference: s.metadata!.reference,
      checkout: { id: s.id, state: paymentState(s), payment_status: s.payment_status, amount_total: s.amount_total, currency: s.currency, subscription: subscriptionId ?? null },
      ...(subscriptionId ? { subscription: subscriptionSnapshot(await subscriptionFor(subscriptionId, mode)) } : {}) };
  }
  let subscriptionId: string | undefined;
  if (SUBSCRIPTION.has(event.type)) subscriptionId = (event.data.object as Stripe.Subscription).id;
  if (INVOICE.has(event.type)) {
    const ref = (event.data.object as Stripe.Invoice).parent?.subscription_details?.subscription;
    subscriptionId = typeof ref === "string" ? ref : ref?.id;
  }
  if (!subscriptionId) return null;
  let subscription;
  try { subscription = await subscriptionFor(subscriptionId, mode); } catch { return null; }
  return { ...base, type: "subscription.updated", product: subscription.metadata.product, reference: subscription.metadata.reference, subscription: subscriptionSnapshot(subscription) };
}

/** Returns false when the product endpoint did not accept it, so Stripe retries the original event. */
export async function deliver(outbound: Outbound): Promise<boolean> {
  const config = registry()[outbound.product];
  const url = config?.events?.[outbound.mode];
  if (!config || !url || !config.eventSecret) return true; // Product takes no events; status API only.
  const body = JSON.stringify(outbound);
  try {
    const response = await fetch(url, { method: "POST", body, redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { "content-type": "application/json", "axxes-payments-signature": signEvent(body, config.eventSecret) } });
    if (!response.ok) console.error("event_delivery_rejected", { id: outbound.id, product: outbound.product, status: response.status });
    return response.ok;
  } catch (error) {
    console.error("event_delivery_failed", { id: outbound.id, product: outbound.product, error: error instanceof Error ? error.name : "UnknownError" });
    return false;
  }
}
