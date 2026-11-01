import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "../../components/icons";
import { SiteFooter } from "../../components/SiteFooter";

export default function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="content">
      <header className="public-header">
        <Link href="/" className="brand-link">
          <BrandMark />
          Niryat
        </Link>
        <div>
          <Link href="/login" className="btn" data-variant="ghost">
            Sign in
          </Link>{" "}
          <Link href="/signup" className="btn" data-variant="primary">
            Create account
          </Link>
        </div>
      </header>
      <main id="main">{children}</main>
      <SiteFooter variant="public" />
    </div>
  );
}
