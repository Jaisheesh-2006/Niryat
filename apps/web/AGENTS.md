# Web conventions

Follow the root AGENTS.md and the selected feature spec.
Use App Router and server components by default; add client boundaries only when needed.
Biome owns formatting/linting. No ESLint or Prettier.
Keep legal/numeric decisions in packages/rules, reached through validated API contracts.
Pages include dashboard, calendar, GSTR-1 and advance tax alongside the earlier profile/invoice/close flows.
AG Studio/React 3.0.0 powers the dashboard; edit mode exposes its AI Assistant through the server-only Claude proxy. The web server passes AG_STUDIO_LICENSE_KEY to the browser by design; absent keys use trial behavior.
Bryntum Calendar/React 7.3.8 uses the trial alias and a client-only read-only wrapper. BRYNTUM_LICENSE_KEY is a hosting placeholder, not consumed by this wrapper. Trial dates and judging coverage remain unverified (docs/verification.md V15).
Never send private credentials or unencrypted profile data to the browser.
Run pnpm --filter @niryat/web test and pnpm build after web changes.
