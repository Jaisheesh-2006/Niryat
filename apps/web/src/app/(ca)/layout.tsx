import { sessionUserSchema } from "@niryat/shared";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BrandMark, Menu } from "../../components/icons";
import { NavLinks } from "../../components/NavLinks";
import { SidebarResize } from "../../components/SidebarResize";
import { SignOutButton } from "../../components/SignOutButton";
import { SiteFooter } from "../../components/SiteFooter";
import { apiGet } from "../../lib/api";

export default async function CaLayout({ children }: Readonly<{ children: ReactNode }>) {
  const me = await apiGet("/auth/me", sessionUserSchema, "/ca/login");
  if (me?.role !== "ca") redirect("/ca/login");

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link href="/ca" className="brand-link">
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
        <Link href="/ca" className="brand-link">
          <BrandMark />
          Niryat
        </Link>
        <span className="sandbox-pill">Sandbox</span>
        <NavLinks audience="ca" />
        <div className="nav-account">
          <p className="account-email" title={me.email}>
            {me.email}
          </p>
          <SignOutButton loginPath="/ca/login" />
        </div>
      </aside>
      <SidebarResize />
      <div className="content">
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter variant="app" />
      </div>
    </div>
  );
}
