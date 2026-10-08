import { notFound, redirect } from "next/navigation";
import EmbeddedPayment from "@/components/embedded-payment";
import { publicKey, purchase } from "@/lib/stripe";
export const dynamic = "force-dynamic";
export default async function Checkout({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await purchase(id).catch(() => null);
  if (!result) notFound();
  const { mode, session } = result;
  if (session.status !== "open") redirect(`/checkout/${id}/complete`);
  if (!session.client_secret) notFound();
  return <main className="checkout-shell">{mode === "test" && <div className="test-banner">Sandbox payment · No real money will be charged</div>}
    <div className="checkout-intro"><span className="eyebrow">AXXES PAYMENTS</span><h1>Make it yours.</h1><p>Review your purchase and pay securely, right here.</p></div>
    <div className="payment-card"><EmbeddedPayment id={id} clientSecret={session.client_secret} publicKey={publicKey(mode)} /></div>
    <p className="secure-note">Secure payment processing by Stripe. Your card details go directly to Stripe.</p>
  </main>;
}
