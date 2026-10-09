import { BodyRefusal, readBody } from "@/lib/request-body";
import type Stripe from "stripe";
import { json, stripe } from "@/lib/stripe";
import type { Mode } from "@/lib/payment-policy";
import { deliver, productEvent } from "@/lib/events";
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing signature" }, 400);
  let body: string;
  try { body = await readBody(request, 1048576); } catch (error) {
    return json({ error: "Request body refused" }, error instanceof BodyRefusal ? error.status : 400);
  }
  let event: Stripe.Event | undefined;
  for (const mode of ["live", "test"] as Mode[]) {
    const secret = process.env[mode === "live" ? "STRIPE_WEBHOOK_SECRET" : "STRIPE_TEST_WEBHOOK_SECRET"];
    if (!secret) continue;
    try {
      const candidate = stripe(mode).webhooks.constructEvent(body, signature, secret);
      if (candidate.livemode === (mode === "live")) { event = candidate; break; }
    } catch { /* Try the other configured environment. */ }
  }
  if (!event) return json({ error: "Invalid signature" }, 400);
  console.info("stripe_event", { id: event.id, type: event.type, live: event.livemode });
  // Forward a signed, current-state event to the selling product. A failed delivery returns 502 so Stripe
  // retries; Stripe is the retry queue and Payments keeps no ledger. Products still verify before granting access.
  let outbound;
  try { outbound = await productEvent(event); } catch (error) {
    console.error("event_build_failed", { id: event.id, error: error instanceof Error ? error.name : "UnknownError" });
    return json({ error: "Retry later" }, 502);
  }
  if (outbound && !(await deliver(outbound))) return json({ error: "Product delivery failed" }, 502);
  return json({ received: true });
}
