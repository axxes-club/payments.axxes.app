import {paymentsAdmission} from "@/lib/security-rate-limit";
import { parseQuote, checkoutParams, providerIdempotencyKey } from "@/lib/payment-policy";
import { apiCaller, json, stripe } from "@/lib/stripe";
import { allowedReturnUrl, mayActFor, registry } from "@/lib/products";
export async function POST(request: Request) {
  if(!apiCaller(request,"live") && !apiCaller(request,"test"))return json({error:"Unauthorized"},401);
  if(!await paymentsAdmission(request))return json({error:"Too many requests or admission storage unavailable"},429);
  const raw = await request.text();
  if (raw.length > 16384) return json({ error: "Request too large" }, 413);
  let quote;
  try { quote = parseQuote(JSON.parse(raw)); } catch { return json({ error: "Invalid payment quote" }, 400); }
  const caller = apiCaller(request, quote.mode);
  if (!caller) return json({ error: "Unauthorized" }, 401);
  if (!mayActFor(caller, quote.product)) return json({ error: "This key cannot sell that product" }, 403);
  if (quote.returnUrl && !allowedReturnUrl(quote.returnUrl, quote.product, registry()))
    return json({ error: "Return URL origin is not registered for this product" }, 400);
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9_-]{12,100}$/.test(key)) return json({ error: "Provide an Idempotency-Key of 12–100 letters, digits, underscores or hyphens" }, 400);
  try {
    if (quote.lookupKey) {
      const price = (await stripe(quote.mode).prices.list({ lookup_keys: [quote.lookupKey], active: true, limit: 1 })).data[0];
      if (!price) return json({ error: "Unknown price" }, 400);
      quote = { ...quote, priceId: price.id, lookupKey: undefined };
    }
    const session = await stripe(quote.mode).checkout.sessions.create(checkoutParams(quote), {
      idempotencyKey: providerIdempotencyKey(key, quote.mode, request.headers.get("authorization")!),
    });
    return json({ id: session.id, mode: quote.mode, checkout_url: `https://payments.axxes.app/checkout/${session.id}` }, 201);
  } catch (error) {
    console.error("checkout_create_failed", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "Unable to create checkout. Verify the price and idempotency key." }, 502);
  }
}
