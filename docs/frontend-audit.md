# Frontend audit

Date: 2026-11-09. Scope: `apps/web` at commit `e20c47a`, read-only review ahead of a frontend redesign that must preserve existing functionality. Nothing was run in a browser; tests and build were not run for this audit. Behaviour requirements for the redesign live in [ux-requirements.md](ux-requirements.md).

## 0. Headline: a re-skin, not a rebuild

The mockups in `Niryat themes/` (checked: Theme 1 and Theme 3, "01 Today") keep the current information architecture, navigation groups, cards, approval card, deadline list, recent-invoices table and copy. They change the visual treatment only: tokens, uppercase eyebrow labels, badge dots, arrow links, accent card edges and a light sidebar.
- The work is mostly `apps/web/src/app/globals.css` plus small class and markup tweaks, not new pages or components.
- Pages and components are already server-first and covered by 47 web test files.
- A rewrite would put at risk the behaviour that matters most: approval focus handling, independent card loading and failure, the role gate and the URL contract (§4).

Recommendation: pick one theme, express it as `--niryat-*` token values, restyle, then fix the structural gaps in §11.

## 1. Routes and page templates

Next.js 16.4.3 App Router, React 19.3, webpack for dev and build. Route groups do not change URLs.

| Group              | Layout                                                                 | Routes                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `(public)`         | Centred page, header with sign-in links, public footer                 | `/`, `/login`, `/signup`, `/ca/login`, `/ca/signup`, `/disclaimer`                                                                                          |
| `(app)` freelancer | Checks `/auth/me` (sends CAs to `/ca`), sidebar, skip link, app footer | `/overview` (Today), `/profile`, `/health-check`, `/clients`, `/invoices`, `/close`, `/tasks`, `/fira`, `/dashboard`, `/calendar`, `/gstr1`, `/advance-tax` |
| `(ca)`             | Same shell, CA navigation, checks the CA role                          | `/ca`, `/ca/calendar`, `/ca/requests`, `/ca/clients/[id]`                                                                                                   |
| Root               | Fonts, metadata, `globals.css`                                         | `error.tsx`, `not-found.tsx`, `(app)/loading.tsx`                                                                                                           |
- `src/proxy.ts` redirects by the role segment of the session cookie. It is a navigation hint only; the API enforces access.
- Every page follows one pattern: `PageHeader`, optional glossary `<details>`, then cards or tables. There are no per-page templates beyond that.
- URL state: `/advance-tax?taxYear&estimatedTax&<CURRENCY>=rate`, `/gstr1?period`, `/ca/clients/[id]?period`, `/login?error`, `/signup?error`.

## 2. Component hierarchy

```
RootLayout (fonts, metadata)
├─ PublicLayout → Brand, PublicAuthLinks, SiteFooter
│   └─ auth pages → AuthForm, JudgeEntry, PayPalLoginError, AuthAside
└─ AppLayout / CaLayout (near-identical copies)
    ├─ topbar (mobile) + popover nav: Brand, NavLinks (+ ApprovalsBadge), SignOutButton
    ├─ SidebarResize (desktop, 224–384px)
    └─ main → page → PageHeader / CardBoundary + Suspense / feature components
```

**Reusable building blocks:** `PageHeader`, `EmptyState`, `StatusBadge`, `CardBoundary`, `Term` (glossary abbreviations), `ApprovalCard` + `ActionButtons`, `SyncFreshness`, `Brand`, `icons.tsx` (inline SVG, no icon library).

**Feature components:** `ExtractPanel` (contains `ClientForm` and `InvoiceForm`), `ProfileForm`, `CaShareCard`, `FiraUpload`, `FiraLineButtons`, `RefundForm`, `TaskDoneButton`, `TaskPlanForm`, `CloseButton`, `CloseRefresher` (refreshes every 3 seconds), `Gstr1Report`, `Gstr1Download`, `CalendarView` (Bryntum), `Dashboard` / `CaDashboard` (AG Studio), and the CA request, invitation and stop-managing buttons.

There are 31 client components; everything else renders on the server.

**Repeated markup to extract before restyling:**
- The citation line "Rule X: source. Verify with your CA." appears about 12 times.
- The glossary `<details>` block appears on 6 pages.
- The health-flag card is copied between `/health-check` and `/ca/clients/[id]`.
- The deadline table is copied across `/calendar`, `/ca/calendar` and `/ca/clients/[id]`.
- `(app)/layout.tsx` and `(ca)/layout.tsx` are about 90% identical.

Extracting these first means each visual change happens in one place.

## 3. Styling, fonts and tokens

- **One global stylesheet:** `globals.css`, 2,515 lines of plain CSS. No Tailwind, CSS modules or CSS-in-JS. Sections: Base, Forms, Buttons, Tables, Disclosures, Cards, Tones, Approval voucher, Overview, Page details, Loading, App shell, Public, Sponsor widgets, Breakpoints.
- **Tokens:** `--niryat-*` custom properties on `:root` for colour (surfaces, text, primary, accent, danger, attention, deadline categories, banyan sidebar), spacing (`space-1` to `space-8`, 4–64px), radii, shadows and two SVG masks (chevron, guilloche security-print pattern).
- **Variants** use data attributes: `data-variant` (primary, secondary, ghost), `data-tone` (success, attention, danger, neutral), `data-status`.
- **Fonts** load through `next/font/google`: IBM Plex Sans 400/500/600, IBM Plex Mono 400/500 and Anek Devanagari as the display face (variable width, Latin and Devanagari).
- **Dark mode** follows the OS only (`prefers-color-scheme`); there is no toggle. Dark mode removes all shadows.
- **Constraint:** token names are shared with AG Studio (`components/Dashboard.tsx` theme parameters) and Bryntum, so rename them only together with those files.
- **Weak points:**
  - Font sizes are in px (83 declarations) with no type-scale tokens; typography is hard-coded per selector.
  - Five raw hex values sit outside the token block.
  - Two inline `style={{ width }}` meters (health check and Today).
  - The visual source of truth is `docs/frontend-plan.md` §4 (per `apps/web/AGENTS.md`); update it when the theme changes.

## 4. API integrations and data

**How the frontend reaches the backend:**
- **Server components** call `apiGet()` in `lib/api.ts`: a direct fetch to the API with the forwarded session cookie and `no-store`. A 401 redirects to the login page, a 404 becomes `null`, and the body is validated with the zod schemas from `@niryat/shared`.
- **Client components** call `sendJson()` / `sendPdf()` in `lib/forms.ts`, posting to `/api/*`, which `next.config.ts` rewrites to the API. `lib/forms.ts` also maps API error codes to user-facing messages.
- **Direct fetches outside the helpers:** the advance-tax page (it needs the error body), `Gstr1Report`, `Gstr1Download` (file download), `JudgeEntry` (`/api/judge-mode`) and the AG Studio AI adapter (`/api/dashboard/turn`).

**Reads per page (GET):**

| Page        | Reads                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------- |
| App layouts | `/auth/me`; the nav badge reads `/close`                                                  |
| Today       | `/close`, `/calendar`, `/health-check`, `/tasks`, `/invoices`, `/sync-status`             |
| Invoices    | `/invoices`, `/clients`, `/close`, `/sync-status`                                         |
| Profile     | `/profile`, `/purpose-codes`, `/ca-link`                                                  |
| CA client   | `/ca/portfolio`, then `/invoices`, `/health-check`, `/calendar`, `/gstr1` with `?client=` |

Every other page reads the one endpoint with its own name.

**Writes:**
- Auth: login and signup for both roles, demo (judge) sign-in, logout, PayPal OAuth start.
- Approvals: `actions/:id/approve|reject`.
- Clients (POST, PUT), invoices, AI extraction, profile (PUT).
- Payment proof: PDF upload, line confirm or reject. Refunds. Tasks: `done`, `plan`. Monthly close.
- CA link create and end, CA invitation claim and request decisions, CA stop-managing.
- GSTR-1 file download.

**Contracts that must not break:**
- The `@niryat/shared` zod schemas are the data contract. Treat them as read-only during the redesign.
- **The backend generates frontend URLs.** `apps/api/src/calendar.ts` emits `/tasks#task-<id>`, `/gstr1?period=…`, `/advance-tax?taxYear=…` and `/profile`. The frontend links to `/invoices#invoice-<id>` from Tasks and Today. Renaming a route or anchor id breaks links the API produces.

## 5. User workflows to preserve

1. **Sign-in:** email and password for freelancer or CA, PayPal OAuth (freelancer only) and demo buttons (shown only when judge mode is enabled). Success uses `window.location.replace` on purpose, so the new session does not reuse a cached logged-out redirect.
2. **Set up:** profile form (about 22 fields in fieldsets) → health score → clients with a five-condition export check.
3. **Invoicing:** paste a client email → Claude extracts fields with their sources → the user checks the client and invoice forms → an approval card. Nothing reaches PayPal until approved.
4. **Approvals:** approve or reject. After a decision, focus moves to the outcome text and the button stays disabled until the refreshed status arrives. Refund and reminder variants have their own wording.
5. **Monthly close:** start a run → banner with automatic refresh → priorities, approvals, summary figures and a history of agent tool calls.
6. **Payment proof (FIRA):** upload a PDF with a consent checkbox → matched lines → confirm or reject uncertain matches.
7. **Tasks:** mark done, or set a planned date with a form or by dragging in the Bryntum calendar. Legal deadlines cannot move.
8. **Reports:** AG Studio dashboard with a Claude assistant, GSTR-1 preview and download, advance-tax estimate driven by the URL.
9. **CA:** claim an invitation code → accept or decline requests → read-only client records → stop managing.

## 6. Responsive design issues

- **Breakpoints:** min-width 640, 900, 1024 and 1280px; max-width 639 and 1023px; container queries at 420 and 600px. Below 1024px the sidebar becomes a native `popover` menu.
- **Wide tables:** the CA portfolio, invoice payments and CA client invoices tables have 8 columns, and FIRA lines force `min-width: 60rem`. On phones they scroll sideways inside the card. Usable, but they should become stacked rows on mobile.
- **Fixed-height sponsor widgets:** Bryntum 40rem, AG Studio 60rem; both pages drop `max-width` with `:has()`. The month calendar and AG Studio editor are likely cramped below about 768px; check on a real device.
- **Tasks table:** the Actions cell holds a link, a button and a date form, so it overflows on narrow screens.
- **Mobile top bar** has no approvals badge, by design (`apps/web/AGENTS.md`); the mockups agree.
- The browser checklist in `docs/frontend-refactor-plan.md` §8 (390px, dark mode, keyboard) is still unticked. Use it as the redesign's exit gate.

## 7. SEO

Only the public pages matter; everything else is behind sign-in, so keep this small.
- Present: a title template (`%s · Niryat`) and one description.
- Missing:
  - A favicon or `app/icon` (there is no `public/` folder).
  - `robots.txt` disallowing the app routes.
  - Open Graph and Twitter metadata for `/`.
  - `metadataBase`.
- A sitemap is not worth adding for three public pages.

## 8. Accessibility

**Keep (good baseline):**
- Skip link, `aria-current` in the nav, labelled controls, `role="alert"` and `role="status"` messages.
- Focus management on approvals; `fieldset` / `legend` in forms.
- Reduced-motion and forced-colours styles.
- Plain-language glossary through `<abbr>`.
- The deadline table under the Bryntum calendar works as an accessible fallback.

**Gaps:**
- `EmptyState` renders an `<h3>` directly under the page `<h1>` on Tasks, Dashboard, CA clients and Invoices, so heading levels skip.
- The AG Studio dashboard has no table alternative to its charts.
- Bryntum loads only `svalbard-light.css`; with a single `.b-` override, the calendar probably stays light in dark mode.
- px font sizes ignore the user's default browser font size (zoom still works).
- The Recent invoices table on Today has `<th>` cells without `scope`.
- The root `error.tsx` is the only error boundary, so a failure in any page replaces the whole app shell and the navigation disappears. Group-level `(app)/error.tsx` and `(ca)/error.tsx` would keep it.
- Labels disagree between nav, heading and browser title: Payment proof / Payment proof / "FIRA"; Advance tax / "Income tax payments"; GST sales return / "GSTR-1".

## 9. Dependencies and constraints

- **Toolchain:** Node 24, pnpm 12, Turborepo, TypeScript 7, Biome (no ESLint or Prettier), Vitest 5, zod 4.
- **Next.js 16.4.3** is pinned through a pnpm release-age exclusion and runs on webpack. `apps/web/AGENTS.md` requires reading the version-matched docs in `node_modules/next/dist/docs/`.
- **Sponsor dependencies (hard constraints):**
  - `@bryntum/calendar` 7.3.8 (trial alias), loaded client-only, brings its own CSS and Font Awesome.
  - `ag-studio` 3.0.0, licence key passed to the browser by design.
  - Both are themed from `--niryat-*` tokens. Sponsor imports must stay out of the shell's import graph.
- **Security headers** (`X-Frame-Options: DENY`, `frame-ancestors 'none'`) block embedding the app in iframes, including design-review tools.
- **Process:** `pnpm --filter @niryat/web test` and `pnpm build` after web changes. Tests assert markup and text, so changing class names or headings needs test updates.

## 10. Frontend vs backend boundary

| Layer                                             | Where                                                                                                                                                                                               | Redesign may touch?                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Frontend presentation                             | `apps/web/src/app`, `apps/web/src/components`, `globals.css`                                                                                                                                        | Yes                                               |
| Frontend view logic (labels, formatting, mapping) | `lib/format.ts` (en-IN, Asia/Kolkata), `lib/status.ts`, `lib/glossary.ts`, `lib/calendar.ts`, `lib/dashboard*.ts`, `lib/forms.ts`                                                                   | Reuse; do not re-derive                           |
| Business rules sitting in the UI (keep identical) | Refund-button eligibility (`app/(app)/invoices/page.tsx`), `isSyntheticJudgePayment`, approval status grouping (Monthly close), health-tile tone (Today), the CA invoice schema with omitted fields | Move to the shared layer if anything; do not drop |
| Contract                                          | `packages/shared` (zod schemas)                                                                                                                                                                     | No                                                |
| Backend                                           | `apps/api` (Hono), `apps/worker`, `packages/db`, `packages/paypal`, `packages/agent`                                                                                                                | No                                                |
| Business and legal logic                          | `packages/rules` and `rules/india-export.yaml`                                                                                                                                                      | No; the UI never computes compliance figures      |

## 11. Recommendations, in order

1. Choose one theme and map it onto the existing `--niryat-*` tokens; add rem-based type-scale tokens at the same time.
2. Extract the duplicated pieces before restyling: one app shell, plus `Citation`, `GlossaryDetails`, `HealthFlagCard` and `DeadlineTable`.
3. Restyle `globals.css` section by section, keeping class and data-attribute names so tests and AG Studio / Bryntum theming keep working.
4. Fix the structural gaps: group-level error boundaries, a Bryntum dark theme, `EmptyState` heading levels, mobile layouts for wide tables, a table alternative on the dashboard.
5. Small SEO pass: `app/icon`, `robots.ts`, Open Graph metadata on `/`.
6. Freeze the URL and anchor contract (§4), then run the `docs/frontend-refactor-plan.md` §8 checklist as the exit gate.

## Limits of this audit

- Only 2 of the 51 mockup screens were inspected; the re-skin conclusion rests on those.
- Request deduplication on Today (three readers of `/close`, two of `/calendar`) was not measured; check API logs before treating it as a problem.
- Mobile and dark-mode findings come from reading CSS, not from a browser.
