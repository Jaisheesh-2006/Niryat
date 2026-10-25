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
          <SignOutButton />
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
