import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "../components/SignOutButton";
import "./globals.css";

const sans = IBM_Plex_Sans({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
  variable: "--niryat-font-sans",
});
const mono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
  variable: "--niryat-font-mono",
});

export const metadata: Metadata = {
  title: { default: "Niryat", template: "%s · Niryat" },
  description: "Export compliance for Indian freelancers paid through PayPal.",
};
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <nav aria-label="Main">
          <Link href="/">Home</Link>
          <Link href="/profile">Profile</Link>
          <Link href="/health-check">Health check</Link>
          <Link href="/clients">Clients</Link>
          <Link href="/invoices">Invoices</Link>
          <Link href="/tasks">Tasks</Link>
          <Link href="/fira">FIRA</Link>
          <Link href="/close">Monthly close</Link>
          <Link href="/gstr1">GSTR-1</Link>
          <Link href="/advance-tax">Advance tax</Link>
          <Link href="/calendar">Calendar</Link>
          <Link href="/dashboard">Dashboard</Link>
          <SignOutButton />
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
