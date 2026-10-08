import { parseRegistry } from "@/lib/products";
const registryValid = (raw: string | undefined) => { try { parseRegistry(raw); return true; } catch { return false; } };
export function GET() {
  const env = process.env;
  const ready = [
    env.STRIPE_SECRET_KEY?.startsWith("sk_live_"),
    env.STRIPE_PUBLISHABLE_KEY?.startsWith("pk_live_"),
    env.STRIPE_TEST_SECRET_KEY?.startsWith("sk_test_"),
    env.STRIPE_TEST_PUBLISHABLE_KEY?.startsWith("pk_test_"),
    env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_"),
    env.STRIPE_TEST_WEBHOOK_SECRET?.startsWith("whsec_"),
    (env.PAYMENTS_API_KEY_LIVE?.length ?? 0) >= 32,
    (env.PAYMENTS_API_KEY_TEST?.length ?? 0) >= 32,
    registryValid(env.PAYMENTS_PRODUCTS),
  ].every(Boolean);
  return Response.json({ service: "axxes-payments", ready }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
