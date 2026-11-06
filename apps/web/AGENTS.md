# Web conventions

Follow the root AGENTS.md and the selected feature spec.
Use App Router and server components by default; add client boundaries only when needed.
Before using a Next.js API, read its guide in `node_modules/next/dist/docs/` (version-matched).
Visual design source of truth: docs/frontend-plan.md §4; implementation order and contracts: docs/frontend-refactor-plan.md.
Biome owns formatting/linting. No ESLint or Prettier.
Keep legal/numeric decisions in packages/rules, reached through validated API contracts.
Pages include dashboard, calendar, GSTR-1 and advance tax alongside the earlier profile/invoice/close flows.
Route groups preserve URLs: src/app/(public) contains home, login, signup and disclaimer; src/app/(app) contains Today (/overview) and the signed-in pages. Email and PayPal sign-in land on /overview.
The root layout owns fonts, metadata and globals.css. The app layout gates with /auth/me (email is required), renders a skip link and a single nav-menu aside (desktop sidebar/mobile native popover), then main and the footer. Only the nav fetches the reminder-only approvals badge; the mobile top bar has no badge. Keep sponsor imports out of the shell's entire import graph.
Desktop SidebarResize adjusts --niryat-sidebar-width (224–384px, default 248) by dragging or Left/Right/Home/End; this dynamic layout property is the user-approved styling exception. Only nav links scroll; brand/account stay visible. Public content is centered; app content fills its column; flex main keeps the footer below content and at the bottom on short pages. AuthForm enables submission after hydration and uses a fresh document navigation after success so new sessions do not reuse cached logged-out redirects.
Use src/lib/format.ts for all displayed dates, months, date-times and money (en-IN, Asia/Kolkata; decimal strings for money). Keep raw ISO values in time dateTime attributes; never compute compliance figures here. Currency-prefixed credit-note strings already formatted by rules stay intact.
Root src/app/error.tsx covers app-layout failures with retry and no error details; src/app/not-found.tsx handles missing pages. App loading.tsx and overview cards retain Loading text when reduced motion stops skeletons. Overview cards and the badge use CardBoundary plus Suspense for independent failures.
Invoices and clients are cards; preserve visible invoice-<id> anchor targets, approvals and dispute alerts. Browser acceptance (including dark mode, mobile and keyboard behavior) belongs to the user; hand off docs/frontend-refactor-plan.md section 8 and leave its phase exit gate open until confirmed.
AG Studio/React 3.0.0 powers the dashboard; edit mode exposes its AI Assistant through the server-only Claude proxy. The web server passes AG_STUDIO_LICENSE_KEY to the browser by design; absent keys use trial behavior.
Bryntum Calendar/React 7.3.8 uses the trial alias and a client-only wrapper. Freelancer task events can move only their planned date; legal deadlines and CA calendars stay read-only. It needs no licence key; the trial covers judging (docs/verification.md V15).
Never send private credentials or unencrypted profile data to the browser.
Run pnpm --filter @niryat/web test and pnpm build after web changes.
