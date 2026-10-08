import type Stripe from "stripe";
import { json, stripe } from "@/lib/stripe";
import type { Mode } from "@/lib/payment-policy";
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing signature" }, 400);
  const body = await request.text();
  if (body.length > 1048576) return json({ error: "Request too large" }, 413);
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
  // Audit only. Selling apps must verify payment through the authenticated status API.
  console.info("stripe_event", { id: event.id, type: event.type, live: event.livemode });
  return json({ received: true });
}
