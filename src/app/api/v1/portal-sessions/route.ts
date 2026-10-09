import {paymentsAdmission} from "@/lib/security-rate-limit";
import { z } from "zod";
import { apiCaller, json, stripe, subscriptionFor } from "@/lib/stripe";
import { allowedReturnUrl, mayActFor, registry } from "@/lib/products";
const schema = z.object({
  mode: z.enum(["live", "test"]).default("live"),
  subscription: z.string(),
  returnUrl: z.url().max(450),
}).strict();
// To open the portal by reference instead, list subscriptions first (GET /api/v1/subscriptions?reference=).
// Lets a buyer update their card or cancel. The product must already have checked that the signed-in
// user owns this subscription; the link is a short-lived bearer capability for that Stripe customer.
export async function POST(request: Request) {
  if(!apiCaller(request,"live") && !apiCaller(request,"test"))return json({error:"Unauthorized"},401);
  if(!await paymentsAdmission(request))return json({error:"Too many requests or admission storage unavailable"},429);
  let body;
  try { body = schema.parse(JSON.parse(await request.text())); } catch { return json({ error: "Invalid request" }, 400); }
  const caller = apiCaller(request, body.mode);
  if (!caller) return json({ error: "Unauthorized" }, 401);
  try {
    const subscription = await subscriptionFor(body.subscription, body.mode);
    const product = subscription.metadata.product;
    if (!mayActFor(caller, product)) return json({ error: "Subscription unavailable" }, 404);
    const returnUrl = allowedReturnUrl(body.returnUrl, product, registry());
    if (!returnUrl) return json({ error: "Return URL origin is not registered for this product" }, 400);
    const configuration = process.env[body.mode === "live" ? "STRIPE_PORTAL_CONFIGURATION" : "STRIPE_TEST_PORTAL_CONFIGURATION"];
    const customer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const portal = await stripe(body.mode).billingPortal.sessions.create({ customer, return_url: returnUrl, ...(configuration ? { configuration } : {}) });
    return json({ url: portal.url }, 201);
  } catch (error) {
    console.error("portal_create_failed", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "Subscription unavailable" }, 404);
  }
}
