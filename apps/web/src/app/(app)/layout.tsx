import { sessionUserSchema } from "@niryat/shared";
import Link from "next/link";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { ApprovalsBadge } from "../../components/ApprovalsBadge";
import { CardBoundary } from "../../components/CardBoundary";
import { BrandMark, Menu } from "../../components/icons";
import { NavLinks } from "../../components/NavLinks";
import { SignOutButton } from "../../components/SignOutButton";
import { SiteFooter } from "../../components/SiteFooter";
import { apiGet } from "../../lib/api";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const me = await apiGet("/auth/me", sessionUserSchema);
  if (!me) redirect("/login");

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link href="/overview" className="brand-link">
          <BrandMark />
          Niryat
        </Link>
        <span className="sandbox-pill">Sandbox</span>
        <button type="button" className="btn" data-variant="secondary" popoverTarget="nav-menu">
          <Menu />
          Menu
        </button>
      </header>
      <aside id="nav-menu" popover="auto">
        <Link href="/overview" className="brand-link">
          <BrandMark />
          Niryat
        </Link>
        <span className="sandbox-pill">Sandbox</span>
        <NavLinks
          badge={
            <CardBoundary title="Approvals" quiet>
              <Suspense fallback={null}>
                <ApprovalsBadge />
              </Suspense>
            </CardBoundary>
          }
        />
        <div className="nav-account">
          <p className="account-email" title={me.email}>
            {me.email}
          </p>
          <SignOutButton />
        </div>
      </aside>
      <div className="content">
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter variant="app" />
      </div>
    </div>
  );
}
