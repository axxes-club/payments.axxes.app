import "server-only";
import Stripe from "stripe";
import { ownsSession, ownsSubscription, type Mode } from "./payment-policy";
import { registry, resolveCaller, type Caller } from "./products";
const clients = new Map<Mode, Stripe>();
export function stripe(mode: Mode) {
  if (!clients.has(mode)) {
    const key = process.env[mode === "live" ? "STRIPE_SECRET_KEY" : "STRIPE_TEST_SECRET_KEY"];
    if (!key?.startsWith(mode === "live" ? "sk_live_" : "sk_test_")) throw new Error("Payments configuration unavailable");
    clients.set(mode, new Stripe(key, { maxNetworkRetries: 2, timeout: 15000 }));
  }
  return clients.get(mode)!;
}
export function publicKey(mode: Mode) {
  const key = process.env[mode === "live" ? "STRIPE_PUBLISHABLE_KEY" : "STRIPE_TEST_PUBLISHABLE_KEY"];
  if (!key?.startsWith(mode === "live" ? "pk_live_" : "pk_test_")) throw new Error("Payments configuration unavailable");
  return key;
}
export function sessionMode(id: string): Mode {
  if (!/^cs_(test|live)_[A-Za-z0-9]{20,250}$/.test(id)) throw new Error("Invalid checkout");
  return id.startsWith("cs_test_") ? "test" : "live";
}
export function apiCaller(request: Request, mode: Mode): Caller | null {
  return resolveCaller(request.headers.get("authorization"), mode, { live: process.env.PAYMENTS_API_KEY_LIVE, test: process.env.PAYMENTS_API_KEY_TEST }, registry());
}
export async function purchase(id: string) {
  const mode = sessionMode(id);
  const session = await stripe(mode).checkout.sessions.retrieve(id);
  if (!ownsSession(session)) throw new Error("Checkout not found");
  return { mode, session };
}
export async function subscriptionFor(id: string, mode: Mode) {
  if (!/^sub_[A-Za-z0-9]{8,250}$/.test(id)) throw new Error("Invalid subscription");
  const subscription = await stripe(mode).subscriptions.retrieve(id);
  if (!ownsSubscription(subscription)) throw new Error("Subscription not found");
  return subscription;
}
/** What a product needs to grant or withdraw access. No card or customer PII. */
export function subscriptionSnapshot(s: Stripe.Subscription) {
  const item = s.items.data[0];
  return { id: s.id, status: s.status, product: s.metadata.product, reference: s.metadata.reference,
    price: item?.price.id ?? null, lookup_key: item?.price.lookup_key ?? null, interval: item?.price.recurring?.interval ?? null, interval_count: item?.price.recurring?.interval_count ?? null,
    current_period_end: item?.current_period_end ?? null, cancel_at_period_end: s.cancel_at_period_end,
    trial_end: s.trial_end, canceled_at: s.canceled_at, ended_at: s.ended_at };
}
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
