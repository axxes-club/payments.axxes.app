"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function RefreshPayment() {
  const router = useRouter();
  useEffect(() => { let attempts = 0; const timer = setInterval(() => { router.refresh(); if (++attempts >= 20) clearInterval(timer); }, 3000); return () => clearInterval(timer); }, [router]);
  return <p className="muted">This page checks your payment automatically. You can also refresh it.</p>;
}
