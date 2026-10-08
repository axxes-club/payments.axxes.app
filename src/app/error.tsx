"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="landing"><h1>Let’s try again.</h1><p>We couldn’t load your payment. Your payment status will be checked when you retry.</p><button className="button" onClick={reset}>Try again →</button></main>; }
