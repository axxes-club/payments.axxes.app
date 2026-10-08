import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type Stripe from "stripe";
const schema = z.object({
  mode: z.enum(["live", "test"]).default("live"),
  product: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  reference: z.string().min(1).max(200),
  description: z.string().min(1).max(200).optional(),
  amount: z.number().int().min(50).max(99999999).optional(),
  currency: z.enum(["usd", "eur", "gbp", "cad"]).default("usd"),
  quantity: z.number().int().min(1).max(99).default(1),
  priceId: z.string().regex(/^price_[A-Za-z0-9]+$/).optional(),
  purchase: z.enum(["payment", "subscription"]).default("payment"),
  email: z.email().optional(),
  returnUrl: z.url().max(450).optional(),
  trialDays: z.number().int().min(1).max(30).optional(),
}).strict().superRefine((v, ctx) => {
  if (v.priceId ? v.amount !== undefined : v.amount === undefined || !v.description)
    ctx.addIssue({ code: "custom", message: "Supply a Stripe price or an amount and description" });
  if (v.purchase === "subscription" && !v.priceId)
    ctx.addIssue({ code: "custom", message: "Subscriptions require a recurring Stripe price" });
  if (v.trialDays && v.purchase !== "subscription")
    ctx.addIssue({ code: "custom", message: "Trials apply only to subscriptions" });
  if (v.amount && v.amount * v.quantity > 99999999)
    ctx.addIssue({ code: "custom", message: "Quote total exceeds the supported limit" });
});
export const parseQuote = (value: unknown) => schema.parse(value);
export type Mode = "live" | "test";
export function authorized(header: string | null, mode: Mode, keys: { live?: string; test?: string }) {
  const expected = keys[mode];
  if (!expected || expected.length < 32 || !header?.startsWith("Bearer ")) return false;
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(header.slice(7)), hash(expected));
}
export function providerIdempotencyKey(request: string, mode: Mode, caller: string) {
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  return `${mode}:${hash(caller)}:${hash(request)}`;
}
export function ownsSession(s: { metadata?: Record<string, string> | null; ui_mode?: string | null }) {
  return s.metadata?.source === "axxes_payments" && s.ui_mode === "embedded_page";
}
export function paymentState(s: { status: string | null; payment_status: string }) {
  if (s.status === "complete" && s.payment_status === "no_payment_required") return "no_payment_due";
  if (s.status === "expired") return "expired";
  if (s.status === "complete" && s.payment_status === "paid") return "paid";
  return s.status === "complete" ? "processing" : "open";
}
export function checkoutParams(value: unknown): Stripe.Checkout.SessionCreateParams {
  const q = parseQuote(value);
  return { ui_mode: "embedded_page", redirect_on_completion: "never", mode: q.purchase,
    allowed_payment_method_types: ["card"],
    customer_email: q.email,
    branding_settings: { display_name: "AXXES", background_color: "#ffffff", button_color: "#3247ef" },
    metadata: { source: "axxes_payments", product: q.product, reference: q.reference, ...(q.returnUrl ? { return_url: q.returnUrl } : {}) },
    ...(q.purchase === "subscription" ? { subscription_data: {
      metadata: { source: "axxes_payments", product: q.product, reference: q.reference },
      ...(q.trialDays ? { trial_period_days: q.trialDays } : {}),
    } } : {}),
    line_items: [q.priceId ? { price: q.priceId, quantity: q.quantity } : {
      quantity: q.quantity, price_data: { currency: q.currency, unit_amount: q.amount!, product_data: { name: q.description! } }
    }],
  };
}
export function ownsSubscription(s: { metadata?: Record<string, string> | null }) {
  return s.metadata?.source === "axxes_payments" && !!s.metadata.product;
}
