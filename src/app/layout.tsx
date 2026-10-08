import Link from "next/link";
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "AXXES Payments", description: "Secure checkout for AXXES products and services.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><header className="site-header"><Link href="/" className="wordmark">AXXES<span>PAYMENTS</span></Link><a className="header-link" href="https://axxes.app">Part of AXXES ↗</a></header>{children}<footer>© {new Date().getFullYear()} AXXES<span>Built for what’s next.</span></footer></body></html>;
}
