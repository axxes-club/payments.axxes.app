import { parseQuote, checkoutParams, providerIdempotencyKey } from "@/lib/payment-policy";
import { apiAuthorized, json, stripe } from "@/lib/stripe";
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 16384) return json({ error: "Request too large" }, 413);
  let quote;
  try { quote = parseQuote(JSON.parse(raw)); } catch { return json({ error: "Invalid payment quote" }, 400); }
  if (!apiAuthorized(request, quote.mode)) return json({ error: "Unauthorized" }, 401);
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9_-]{12,100}$/.test(key)) return json({ error: "Provide an Idempotency-Key of 12–100 letters, digits, underscores or hyphens" }, 400);
  try {
    const session = await stripe(quote.mode).checkout.sessions.create(checkoutParams(quote), {
      idempotencyKey: providerIdempotencyKey(key, quote.mode, request.headers.get("authorization")!),
    });
    return json({ id: session.id, mode: quote.mode, checkout_url: `https://payments.axxes.app/checkout/${session.id}` }, 201);
  } catch (error) {
    console.error("checkout_create_failed", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "Unable to create checkout. Verify the price and idempotency key." }, 502);
  }
}
