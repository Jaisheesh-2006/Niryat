import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "../components/SignOutButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "Niryat",
  description: "Export compliance for Indian freelancers paid through PayPal.",
};
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
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
          <SignOutButton />
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
