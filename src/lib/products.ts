import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Mode } from "./payment-policy";

// Products that sell through Payments. Configured in payments-env as PAYMENTS_PRODUCTS (JSON), never in source:
// each product gets its own API key per environment (it can only create and read its own purchases), the origins
// buyers may be returned to, and where signed events go.
const secret = z.string().min(32);
const product = z.object({
  name: z.string().min(1).max(60),
  keys: z.object({ live: secret.optional(), test: secret.optional() }).strict(),
  returnOrigins: z.array(z.url().refine((u) => { const p = new URL(u); return p.protocol === "https:" && p.origin === u; }, "Origins must be bare https origins")).max(10),
  events: z.object({ live: z.url().optional(), test: z.url().optional() }).strict().optional(),
  eventSecret: secret.optional(),
}).strict().refine((p) => !p.events || p.eventSecret, "Events need an eventSecret");
const registrySchema = z.record(z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), product);
export type ProductConfig = z.infer<typeof product>;
export type Registry = z.infer<typeof registrySchema>;

export function parseRegistry(raw: string | undefined): Registry {
  if (!raw) return {};
  return registrySchema.parse(JSON.parse(raw));
}

let cached: { raw: string | undefined; registry: Registry } | undefined;
export function registry(): Registry {
  const raw = process.env.PAYMENTS_PRODUCTS;
  if (!cached || cached.raw !== raw) cached = { raw, registry: parseRegistry(raw) };
  return cached.registry;
}

const digest = (s: string) => createHash("sha256").update(s).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

/** The administrative key may act for any product; a product key only for its own product. */
export type Caller = { admin: true } | { admin: false; product: string };
export function resolveCaller(header: string | null, mode: Mode, admin: { live?: string; test?: string }, products: Registry): Caller | null {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  if (token.length < 32) return null;
  const adminKey = admin[mode];
  if (adminKey && adminKey.length >= 32 && same(token, adminKey)) return { admin: true };
  for (const [key, config] of Object.entries(products)) {
    const expected = config.keys[mode];
    if (expected && same(token, expected)) return { admin: false, product: key };
  }
  return null;
}
export const mayActFor = (caller: Caller, productKey: string | undefined) => !!productKey && (caller.admin || caller.product === productKey);

/** A return URL is accepted only when its origin is registered for the purchasing product. */
export function allowedReturnUrl(url: string | undefined, productKey: string, products: Registry): string | null {
  if (!url) return null;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  const config = products[productKey];
  if (!config || parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  return config.returnOrigins.includes(parsed.origin) ? parsed.toString() : null;
}

/** Appends the checkout ID so the product can verify the purchase server-side when the buyer returns. */
export function returnLink(url: string, checkoutId: string) {
  const u = new URL(url);
  u.searchParams.set("axxes_checkout", checkoutId);
  return u.toString();
}

// Outbound events: `AXXES-Payments-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`.
export function signEvent(body: string, eventSecret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", eventSecret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}
/** Reference verifier; products copy this. Rejects signatures older than `toleranceSeconds`. */
export function verifyEvent(body: string, header: string | null, eventSecret: string, toleranceSeconds = 300, now = Math.floor(Date.now() / 1000)) {
  const parts = Object.fromEntries((header ?? "").split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1 || Math.abs(now - t) > toleranceSeconds) return false;
  const expected = createHmac("sha256", eventSecret).update(`${t}.${body}`).digest("hex");
  return parts.v1.length === expected.length && timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
}
