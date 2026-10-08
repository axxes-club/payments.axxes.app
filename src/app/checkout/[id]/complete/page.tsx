import Link from "next/link";
import { notFound } from "next/navigation";
import { purchase } from "@/lib/stripe";
import { paymentState } from "@/lib/payment-policy";
import RefreshPayment from "@/components/refresh-payment";
import { allowedReturnUrl, registry, returnLink } from "@/lib/products";
export const dynamic = "force-dynamic";
export default async function Complete({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await purchase(id).catch(() => null);
  if (!result) notFound();
  const state = paymentState(result.session);
  const product = result.session.metadata?.product ?? "";
  // Re-checked at render so a registry change also withdraws old return links.
  const back = allowedReturnUrl(result.session.metadata?.return_url, product, registry());
  const backName = back ? registry()[product]?.name : null;
  const titles = { no_payment_due: "Your order is confirmed.", paid: "You’re all set.", processing: "Confirming your payment.", expired: "This payment link has expired.", open: "Your payment is still open." };
  return <main className="landing"><span className="eyebrow">{result.mode === "test" ? "SANDBOX PAYMENT" : "AXXES PAYMENTS"}</span>
    <h1>{titles[state]}</h1>
    <p>{state === "no_payment_due" ? "No payment was due. Return to your AXXES product or service to continue." : state === "paid" ? "Your payment has been confirmed. Return to your AXXES product or service to continue." : state === "expired" ? "Request a new payment link from the AXXES product or service you were purchasing." : state === "open" ? "Continue checkout to complete your purchase." : "We’re waiting for confirmation from the payment processor."}</p>
    {state === "processing" && <RefreshPayment />}
    {state === "open" ? <Link className="button" href={`/checkout/${id}`}>Continue checkout →</Link> : back ? <a className="button" href={returnLink(back, id)}>Return to {backName} →</a> : <a className="button" href="https://axxes.app">Explore AXXES →</a>}
  </main>;
}
