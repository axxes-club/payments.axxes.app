import { paymentState } from "@/lib/payment-policy";
import { apiCaller, json, purchase, sessionMode } from "@/lib/stripe";
import { mayActFor } from "@/lib/products";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
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
