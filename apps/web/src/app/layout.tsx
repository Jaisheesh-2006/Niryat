import type { Metadata } from "next";
import { Anek_Devanagari, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import type { ReactNode } from "react";
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
// Display face from Ek Type (Mumbai): Latin headings plus the Devanagari wordmark.
const display = Anek_Devanagari({
  subsets: ["latin", "devanagari"],
  axes: ["wdth"],
  display: "swap",
  variable: "--niryat-font-display",
});

export const metadata: Metadata = {
  title: { default: "Niryat", template: "%s · Niryat" },
  description: "Export compliance for Indian freelancers paid through PayPal.",
};
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
