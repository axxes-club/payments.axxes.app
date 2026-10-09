import {paymentsAdmission} from "@/lib/security-rate-limit";
import { apiCaller, json, subscriptionFor, subscriptionSnapshot } from "@/lib/stripe";
import { mayActFor } from "@/lib/products";
import { stripe } from "@/lib/stripe";
import { changeRefusal, parseChange } from "@/lib/payment-policy";
// Subscription IDs carry no environment, so the caller names it: ?mode=test (default live).
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if(!apiCaller(request,"live") && !apiCaller(request,"test"))return json({error:"Unauthorized"},401);
  if(!await paymentsAdmission(request))return json({error:"Too many requests or admission storage unavailable"},429);
  const { id } = await context.params;
  const mode = new URL(request.url).searchParams.get("mode") === "test" ? "test" : "live";
  const caller = apiCaller(request, mode);
  if (!caller) return json({ error: "Unauthorized" }, 401);
  try {
    const subscription = await subscriptionFor(id, mode);
    if (!mayActFor(caller, subscription.metadata.product)) return json({ error: "Subscription unavailable" }, 404);
    return json({ mode, ...subscriptionSnapshot(subscription) });
  } catch { return json({ error: "Subscription unavailable" }, 404); }
}

// Moves a subscription to another of the same product's recurring prices in place. Stripe prorates
// the difference on the next invoice, so an upgrade never needs a second subscription.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if(!apiCaller(request,"live") && !apiCaller(request,"test"))return json({error:"Unauthorized"},401);
  if(!await paymentsAdmission(request))return json({error:"Too many requests or admission storage unavailable"},429);
  const { id } = await context.params;
  let change;
  try { change = parseChange(await request.json()); } catch { return json({ error: "Invalid request" }, 400); }
  const caller = apiCaller(request, change.mode);
  if (!caller) return json({ error: "Unauthorized" }, 401);
  let subscription;
  try { subscription = await subscriptionFor(id, change.mode); } catch { return json({ error: "Subscription unavailable" }, 404); }
  if (!mayActFor(caller, subscription.metadata.product)) return json({ error: "Subscription unavailable" }, 404);
  try {
    const client = stripe(change.mode);
    const price = (await client.prices.list({ lookup_keys: [change.lookupKey], active: true, limit: 1 })).data[0];
    const refusal = changeRefusal(subscription, price);
    if (refusal) return json({ error: refusal }, 409);
    if (subscription.items.data[0].price.id === price.id) return json({ mode: change.mode, ...subscriptionSnapshot(subscription) });
    const updated = await client.subscriptions.update(subscription.id, {
      items: [{ id: subscription.items.data[0].id, price: price.id }],
      proration_behavior: "create_prorations",
    });
    return json({ mode: change.mode, ...subscriptionSnapshot(updated) });
  } catch {
    return json({ error: "The subscription could not be changed" }, 502);
  }
}
