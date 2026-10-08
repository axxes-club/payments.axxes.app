import { apiCaller, json, subscriptionFor, subscriptionSnapshot } from "@/lib/stripe";
import { mayActFor } from "@/lib/products";
// Subscription IDs carry no environment, so the caller names it: ?mode=test (default live).
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
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
