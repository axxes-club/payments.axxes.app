import "server-only";
import Stripe from "stripe";
import { authorized, ownsSession, type Mode } from "./payment-policy";
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
export function apiAuthorized(request: Request, mode: Mode) {
  return authorized(request.headers.get("authorization"), mode, { live: process.env.PAYMENTS_API_KEY_LIVE, test: process.env.PAYMENTS_API_KEY_TEST });
}
export async function purchase(id: string) {
  const mode = sessionMode(id);
  const session = await stripe(mode).checkout.sessions.retrieve(id);
  if (!ownsSession(session)) throw new Error("Checkout not found");
  return { mode, session };
}
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
