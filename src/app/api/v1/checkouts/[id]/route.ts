import {paymentsAdmission} from "@/lib/security-rate-limit";
import { expireCheckout } from "@/lib/checkout-expiration";
import { paymentState, ownsSession } from "@/lib/payment-policy";
import { apiCaller, json, purchase, sessionMode, stripe } from "@/lib/stripe";
import { mayActFor } from "@/lib/products";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if(!apiCaller(request,"live") && !apiCaller(request,"test"))return json({error:"Unauthorized"},401);
  if(!await paymentsAdmission(request))return json({error:"Too many requests or admission storage unavailable"},429);
  const { id } = await context.params;
  let mode;
  try { mode = sessionMode(id); } catch { return json({ error: "Not found" }, 404); }
  const caller = apiCaller(request, mode);
  if (!caller) return json({ error: "Unauthorized" }, 401);
  try {
    const { session: s } = await purchase(id);
    if (!mayActFor(caller, s.metadata?.product)) return json({ error: "Checkout unavailable" }, 404);
    return json({ id: s.id, mode, state: paymentState(s), payment_status: s.payment_status,
      product: s.metadata?.product, reference: s.metadata?.reference, amount_total: s.amount_total,
      currency: s.currency, subscription: typeof s.subscription === "string" ? s.subscription : null });
  } catch { return json({ error: "Checkout unavailable" }, 404); }
}

/** Expires this product's open checkout; a completion race returns the completed status. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if(!apiCaller(request,"live") && !apiCaller(request,"test"))return json({error:"Unauthorized"},401);
  if(!await paymentsAdmission(request))return json({error:"Too many requests or admission storage unavailable"},429);
  const { id } = await context.params;
  let mode;
  try { mode = sessionMode(id); } catch { return json({ error: "Not found" }, 404); }
  const caller = apiCaller(request, mode);
  if (!caller) return json({ error: "Unauthorized" }, 401);
  try {
    const s = await expireCheckout(stripe(mode).checkout.sessions, id, caller);
    if (!ownsSession(s)) return json({ error: "Checkout unavailable" }, 404);
    return json({ id: s.id, mode, state: paymentState(s), product: s.metadata?.product,
      reference: s.metadata?.reference, amount_total: s.amount_total, currency: s.currency,
      subscription: typeof s.subscription === "string" ? s.subscription : null });
  } catch { return json({ error: "Checkout could not be expired; retry later" }, 502); }
}
