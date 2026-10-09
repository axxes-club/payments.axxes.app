import {paymentsAdmission} from "@/lib/security-rate-limit";
import { apiCaller, json, stripe, subscriptionSnapshot } from "@/lib/stripe";
import { ownsSubscription } from "@/lib/payment-policy";
// Lists a product's subscriptions for one of its references (newest first), so products need not store
// Stripe IDs. ?reference=<ref>&mode=live|test; the administrative key must also pass ?product=<key>.
// Backed by Stripe search, which can lag new subscriptions by about a minute; use events for fresh state.
export async function GET(request: Request) {
  if(!apiCaller(request,"live") && !apiCaller(request,"test"))return json({error:"Unauthorized"},401);
  if(!await paymentsAdmission(request))return json({error:"Too many requests or admission storage unavailable"},429);
  const params = new URL(request.url).searchParams;
  const mode = params.get("mode") === "test" ? "test" : "live";
  const caller = apiCaller(request, mode);
  if (!caller) return json({ error: "Unauthorized" }, 401);
  const product = caller.admin ? params.get("product") : caller.product;
  const reference = params.get("reference") ?? "";
  if (!product || !/^[a-z][a-z0-9_-]{0,63}$/.test(product) || !reference || reference.length > 200 || /['\\]/.test(reference))
    return json({ error: "Provide a product and reference" }, 400);
  try {
    const found = await stripe(mode).subscriptions.search({ limit: 20,
      query: `metadata['source']:'axxes_payments' AND metadata['product']:'${product}' AND metadata['reference']:'${reference}'` });
    const data = found.data.filter((s) => ownsSubscription(s) && s.metadata.product === product && s.metadata.reference === reference)
      .sort((a, b) => b.created - a.created).map(subscriptionSnapshot);
    return json({ mode, data });
  } catch (error) {
    console.error("subscription_search_failed", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "Subscriptions unavailable" }, 502);
  }
}
