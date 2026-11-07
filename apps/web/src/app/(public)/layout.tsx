import type { ReactNode } from "react";
import { Brand } from "../../components/Brand";
import { PublicAuthLinks } from "../../components/PublicAuthLinks";
import { SiteFooter } from "../../components/SiteFooter";

export default function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="content public-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="public-header">
        <Brand href="/" />
        <PublicAuthLinks />
      </header>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter variant="public" />
    </div>
  );
}
