import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// Neel type: Figtree for text and tabular figures; Bricolage Grotesque (optical size on) for titles.
const sans = Figtree({
  subsets: ["latin"],
  display: "swap",
  variable: "--niryat-font-sans",
});
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
  variable: "--niryat-font-display",
});

export const metadata: Metadata = {
  title: { default: "Niryat", template: "%s · Niryat" },
  description: "Export compliance for Indian freelancers paid through PayPal.",
};
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
