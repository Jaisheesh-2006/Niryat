import Link from "next/link";

export function SiteFooter({ variant }: { variant: "app" | "public" }) {
  return (
    <footer className="site-footer">
      PayPal sandbox only · Not tax or legal advice · Rules checked against primary sources, not
      reviewed by a CA · <Link href="/disclaimer">Disclaimer</Link> ·{" "}
      <a href="https://github.com/Jaisheesh-2006/Niryat">Source (MIT)</a>
      {variant === "public" && " · Built for the PayPal AI Hackathon 2026"}
    </footer>
  );
}
