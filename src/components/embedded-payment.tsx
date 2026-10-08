"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
export default function EmbeddedPayment({ publicKey, clientSecret, id }: { publicKey: string; clientSecret: string; id: string }) {
  const router = useRouter();
  const stripe = useMemo(() => loadStripe(publicKey), [publicKey]);
  return <EmbeddedCheckoutProvider stripe={stripe} options={{ clientSecret, onComplete: () => router.replace(`/checkout/${id}/complete`) }}>
    <EmbeddedCheckout />
  </EmbeddedCheckoutProvider>;
}
