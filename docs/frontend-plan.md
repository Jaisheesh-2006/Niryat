# Frontend plan

How to turn Niryat's working-but-plain web app into a product a judge remembers, in the days left before the **Nov 8 feature freeze**. [PLAN](PLAN.md) and [build flow](build-flow.md) still own scope and dates; this plan changes how pages look and behave, never what the rules, API or approval workflow do. §4 is the design specification: agents and people implement against it.

Implementation contracts and task order live in [frontend-refactor-plan](frontend-refactor-plan.md), whose locked decisions take precedence. F12 source review corrections are reflected below; browser acceptance remains with the user under that plan's §8.

## 1. Why, and what not to do

**Design is one of five equally weighted judging criteria:** "a complete, coherent product experience — not just a technical proof of concept" ([rules](paypal-hackathon-rules.md)). Judges may score from the video alone, so **the 3-minute demo path ([PLAN §16](PLAN.md#16-demo-script-3-minutes)) is the design brief**. Every page on that path must look like one product; off-path pages only need to not look broken.

"Best use of Next.js" is not a goal judges score. Use a Next feature only where it fixes something a user sees. Explicitly out of scope, with the reason:

| Not doing                                                                          | Why                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tailwind, shadcn/ui, a component library                                           | See §1.1.                                                                                                                                                                                           |
| Server Actions                                                                     | Mutations go to the Hono API through the `/api` rewrite (`sendJson` + `router.refresh()`). A second mutation path would duplicate the API's auth and validation.                                    |
| React Query, SWR, a state library                                                  | The data is per user and fetched on the server with `no-store`. Server components plus `router.refresh()` already cover it.                                                                         |
| `cacheComponents`, PPR, ISR                                                        | Every page is per user and uncached by design, so caching would gain nothing and could serve one user's data to another.                                                                            |
| `proxy.ts` auth gate                                                               | The `(app)` layout's `/auth/me` call (§3.2) gates every signed-in page, and the API stays the security boundary. A proxy would add a cookie-name dependency on `apps/api` and protect nothing more. |
| Theme toggle, toasts, illustrations, page-transition animation, marketing sections | Dark mode follows the OS; messages stay inline (toasts are easy to miss and hard to make accessible); none of the rest is on the demo path.                                                         |
| Storybook, visual-regression infrastructure                                        | Tooling for a long-lived product; there is no time to repay the setup.                                                                                                                              |
| Changing approval logic in `ActionButtons`                                         | It encodes the one-attempt reminder rule and has 500 lines of tests. Restyle it; do not restructure it.                                                                                             |

### 1.1 Would Tailwind and shadcn/ui look better?

**Not by themselves.** shadcn apps look good because of a handful of design decisions: quiet neutral colours, 14px dense type, 6–10px radii, thin borders, one consistent focus ring, a strict spacing scale. Those are decisions, not code. §4 makes the same kind of decisions for Niryat's own palette, and plain CSS applies them just as well.

What switching would cost here:
1. **Every element restyled by editing markup.** 12 pages and 17 components (about 30 TSX files) would need `className` edits. Element-level CSS restyles all of them from one file with no markup change (slice 1, §5), in the same week as Phase 7 hosting.
2. **Global reset risk.** Tailwind's preflight resets headings, lists, borders and buttons globally. Bryntum and AG Studio were themed and checked against the current base, so they would need rechecking. That is a risk, not a certainty.
3. **More dependencies.** shadcn components typically pull in `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` and an animation package. AGENTS.md requires a stated reason for each, plus the release-age check. Installing would be clean, though: on Nov 1 npm showed no install scripts in `tailwindcss`, `@tailwindcss/postcss` or `@tailwindcss/oxide` 4.3.3 (prebuilt binaries ship as optional dependencies), so no `allowBuilds` exception like Bryntum's would be needed.
4. **Sameness.** shadcn's defaults are the most common look among hackathon entries and AI-generated apps. Judges will see many of them. Niryat stands out through its palette, its type and the approval card, not through the kit.
5. **What shadcn adds that plain CSS lacks** is accessible complex widgets: dialog, dropdown menu, combobox, tooltip, toast. The demo path needs none of them; native `<dialog>`, the `popover` attribute, `<details>` and `<select>` cover what it does need.

**AI fluency** is the honest argument for Tailwind: agents write it well from memory. With a written token and component spec (§4), they write about 15 house classes just as consistently.

**Decision:** plain CSS for the hackathon. Revisit after judging if the product gains complex widgets (a CA dashboard, multiple users). The §4 tokens map one-to-one to Tailwind v4's `@theme inline { --color-primary: var(--niryat-primary); … }`, so nothing here is thrown away.

## 2. Pre-refactor baseline (Nov 1)

- **12 routes**, all async server components that fetch through `apiGet` (cookie forwarded, zod-parsed, 401 → `/login`). 17 small client components handle mutations. This architecture is sound; keep it.
- **One 106-line `globals.css`.** It has colour tokens with dark-mode variants (`--niryat-primary` green `#1f6f5c`, `--niryat-accent` saffron `#e07a1f`, `--niryat-overdue`, `--niryat-upcoming`, `--niryat-past`, `--niryat-event-text`) and element-level styles, but no layout system, spacing scale, type scale or component classes.
- **The layout's nav shows all 12 links to everyone**, including logged-out visitors, in a flat row with no active state. Sign-in lands on `/profile`; `/` is a two-line static page.
- **There are no `loading.tsx`, `error.tsx` or `not-found.tsx` files.** Navigation blocks with no feedback while the API responds, and an API failure shows Next's default error screen.
- **Formatting is inconsistent:** dates use `en-CA` (2026-11-01) on some pages and `en-IN` long form on others; amounts render as raw `USD 1234.00`.
- **Pending states end too early:** `setSubmitting(false)` runs before `router.refresh()` finishes, so buttons briefly re-enable over stale props.
- **Sponsor widgets** are route-scoped client components. The Bryntum calendar is already `dynamic(..., { ssr: false })`, and AG Studio is themed from the tokens.
- **Good foundations to keep:** semantic HTML, `role="alert"` errors, honest, specific copy ("Nothing is sent to PayPal until you approve it"), and labels that never rely on colour alone.

## 3. Engineering decisions

### 3.1 Information architecture

Group the 12 routes by the job the user is doing, in demo order, not by feature:

| Group             | Routes                                              |
| ----------------- | --------------------------------------------------- |
| (none)            | `/overview` (new), labelled "Today"                 |
| Set up            | `/profile`, `/health-check`, `/clients`             |
| Bill and get paid | `/invoices`                                         |
| Close the month   | `/close`, `/tasks`, `/fira`                         |
| Reports           | `/dashboard`, `/calendar`, `/gstr1`, `/advance-tax` |

The pending-approvals count belongs in the nav (a badge on Monthly close), because user approval is the product's core promise.

User browser follow-up (2026-11-02): the desktop sidebar is now resizable by dragging its right edge or using Left/Right/Home/End on the separator (224–384px, default 248). Its dynamic CSS width property is authorized for this interaction; mobile keeps the native popover. Email sign-in/sign-up wait for hydration and start a fresh document navigation after success. The public container is centered, app content fills its column, and a flex main keeps the footer at the bottom of short pages without covering long content. These corrections supersede the original fixed-width layout below.

### 3.2 Routing and layouts (App Router)

- **Route groups** `app/(app)/` for signed-in pages and `app/(public)/` for `/`, `/login`, `/signup` and `/disclaimer`. URLs do not change. Moving files changes relative imports and moves the colocated `page.test.tsx` files with them, so update both in the same commit.
- **The `(app)/layout.tsx` calls `apiGet("/auth/me", sessionUserSchema)` once.** A 401 or missing session redirects to `/login` before any app chrome renders; on success it supplies the required account email shown in the sidebar. Email is always present, including for PayPal sign-in, and the shared zod schema validates it. The reminder-only approvals badge reads `/close` inside its own `CardBoundary` and `<Suspense>`, so the shell never waits for it and a badge failure renders nothing. `router.refresh()` after an approval re-renders the layout, so the badge stays current.
- **`(app)/loading.tsx`, root `app/error.tsx` and root `app/not-found.tsx`** provide streaming feedback, a recoverable error with `retry`, and the missing-page screen. The root error boundary also covers failures in the app layout's own fetch; an error boundary inside `(app)` would not. It shows no error fields, response bodies or values. Every overview tile and card has its own `CardBoundary` and `<Suspense>`.
- **`/overview` as the signed-in home** (email and PayPal sign-in both land here). It fetches from existing endpoints in parallel, one `<Suspense>` boundary per card: approvals (`/close`), deadlines (`/calendar`), health (`/health-check`), tasks (`/tasks`), recent invoices (`/invoices`). No new API is needed. The Phase 7 "last successful sync" indicator goes here when it exists.
- **`metadata.title.template`** (`"%s · Niryat"`) and a `title` per page, so tabs and the video read clearly.
- **`next/font/google`** for the typefaces in §4.4: self-hosted at build time, no layout shift. The build needs network access to fetch them once. If Google Fonts cannot be fetched, stop and report; switching to local font files requires the user's approval (D1).

### 3.3 Shared components (only those already used three or more times)

| Component                           | Replaces                                                                            | Used on                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `StatusBadge`                       | the `statusLabels` / `firaLabels` maps rendered as plain text; tone mapping in §4.3 | invoices, close, tasks, FIRA, clients, health check                                                 |
| `formatMoney` (lib function)        | `{currency} {amount}` strings; `Intl.NumberFormat("en-IN", { style: "currency" })`  | invoices, overview, GSTR-1, advance tax                                                             |
| `formatDate` (lib, not a component) | the mixed `en-CA` / `en-IN` calls; one IST formatter (§4.11)                        | close, FIRA, tasks, invoices, overview                                                              |
| `PageHeader`                        | bare `<h1>` + intro `<p>`                                                           | every page                                                                                          |
| `EmptyState`                        | "No PayPal actions to approve." style lines                                         | close, invoices, tasks, dashboard, clients                                                          |
| `NavLinks` (client)                 | the layout's flat `<Link>` list                                                     | sidebar and mobile menu (`usePathname` for `aria-current`, closes the mobile popover on navigation) |
| `Icon` set (`components/icons.tsx`) | none yet                                                                            | nav, buttons, empty states (§4.12)                                                                  |

`lib/format.ts` exports `formatMoney(amount, currency)`, `formatDate`, `formatMonth` and `formatDateTime`; these are display formatting only. Money stays a validated decimal string, without conversion through `Number`. Already currency-prefixed credit-note strings from rules retain their formatting. Any compliance figure still comes from `packages/rules` through the API.

### 3.4 Approval behaviour

- **Pending state through `useTransition`:** wrap `router.refresh()` in `startTransition` so `isPending` covers the refresh and the button never re-enables over stale props. Keep the existing `approvalStarted` ref guard for reminders. Apply the same fix to the other `router.refresh()` callers: ClientForm, InvoiceForm, RefundForm, FiraUpload, FiraLineButtons, TaskDoneButton, CloseButton.
- After a decision, move focus to the result message, which already has `role="alert"` / status text.
- The card's plain-English summary (§4.13) uses only fields the action or invoice already carries. It never computes a new amount or date.

### 3.5 Quality bars (non-negotiable)

- **Accessibility:** a skip link, `aria-current="page"` on the active nav item, a visible focus ring, WCAG AA contrast in both themes (measured in §4.2), status never shown by colour alone, labelled form errors through `aria-describedby`, and `prefers-reduced-motion` respected. Existing semantics stay.
- **Security:** nothing new reaches the browser beyond the account email; server components keep fetching with the forwarded cookie.
- **Performance:** AG Studio and Bryntum stay route-scoped. Compare `pnpm build` route sizes before and after; the shell must not import either.
- **Tests:** existing component tests keep passing unchanged in behaviour. Test new logic and accessibility regressions: formatting (currency, Indian grouping, rounding and IST boundaries), `NavLinks` active state, approval focus, and pending forms. Preserve the pre-move route and test coverage.

## 4. Design specification

> **Superseded 2026-11-09 by Niryat Neel.** The approved Neel design system replaces the colours, type, shell and approval-card styling below; the token mapping, component decisions and what was deliberately kept are in [IMPLEMENTATION-FRONTEND.md](IMPLEMENTATION-FRONTEND.md). Niryat ships the light theme only (user decision, 2026-11-09); dark-mode guidance below no longer applies. Copy rules, quality bars and page blueprints below still apply where Neel is silent.

### 4.0 Visual refresh: "export voucher" (2026-11-08)

The user asked for a less basic look, so this refresh supersedes the subsections below where they differ. The calm-ledger rules (§4.1), status tones, copy rules and quality bars are unchanged; no rules, API contract or approval logic changed.
1. **Banyan shell.** The desktop sidebar, mobile top bar and menu sheet use `--niryat-banyan` (deep green) with light text, a mint active indicator (`--niryat-mint`, inset 2px edge) and the saffron approvals count. Content stays on warm paper.
2. **Display type and a Devanagari wordmark.** Anek Devanagari (Ek Type, Mumbai) loads through `next/font/google` as `--niryat-font-display` (variable weight and `wdth`; Latin and Devanagari subsets; no new npm dependency). It sets page titles, the public hero, section titles, stat values and the wordmark. The `Brand` component shows "Niryat" with "निर्यात" (Hindi for export) beneath it; the Devanagari is `aria-hidden`, so the link reads "Niryat". IBM Plex Sans and Mono still carry body text, tables, forms and identifiers.
3. **Approval voucher (the signature).** Approval cards read as a cheque voucher: the saffron (or danger) edge, a faint guilloche security print fading down from the header, and a perforated tear line with half-moon notches above the decision row ("Nothing is sent to PayPal until you approve" with a lock icon, then Reject and Approve). A container query stacks the decision row on narrow cards, with Approve first below 420px. Done and rejected cards stay one line. Markup is unchanged; it is CSS on the existing `ApprovalCard`/`ActionButtons` classes.
4. **Page polish.** Today's stat tiles gain icons, a health meter and a hover lift; upcoming deadlines become a timeline list; tables sit flush in cards; definition lists become key/value grids; rule citations carry a `§` marker (`.citation`); loose glossary lines sit in a "Key terms" panel (`.terms`); header disclosures (New invoice, Add a client) read as primary buttons until opened; sign-in and sign-up pages pair the form with a banyan panel (`AuthAside`) of three plain promises.
5. **Public home.** An eyebrow, the existing headline in the display face, and beside it a static example approval card on a banyan panel, labelled "Example approval". "How it works" is a numbered five-step sequence; the three commitments each gain one plain sentence. The demo entry ("Explore with demo data") puts **Try as freelancer** first as the primary button.

New tokens (light / dark), all measured against WCAG 2.2 on 2026-11-08: `--niryat-banyan` `#0f2a22` / `#0b1311`; `--niryat-banyan-raised` `#173a2f` / `#15211d`; `--niryat-on-banyan` `#e8f1ec` (13.3:1 / 16.3:1 on banyan); `--niryat-on-banyan-muted` `#9dbcb0` (7.5:1 / 9.2:1); nav text at 84% opacity 9.7:1; `--niryat-mint` `#7dd3b7` focus ring and active edge on banyan 8.6:1; `--niryat-brand-saffron` `#f08a2c` approvals count on banyan 6.1:1 with `on-accent` text 6.9:1; `--niryat-brand-green` `#1f6f5c` keeps the mark's square fixed across themes. `--niryat-bg` (light) moves from `#f6f6f2` to `#f3f3ee` so white cards lift off the page: text 15.0:1, muted 5.6:1. Radius is now 8 for controls and 12 for cards; cards use a two-layer shadow in light mode and borders only in dark mode, where the sidebar, hero panel and auth panel add a 1px outline.

### 4.1 Direction: "calm ledger"

Niryat should feel like a precise, trustworthy financial document, not a marketing site. Three rules decide most choices:
1. **Warm paper neutrals** carry the page. Colour is rare, so it means something.
2. **Deep green (`primary`)** is trust and "done right": primary buttons, the active nav item, success states.
3. **Saffron (`accent`)** appears only where **the user must act**: approvals waiting, medium-severity flags, "needs confirmation". It is the existing brand accent, and tying it to the approval promise makes the product's core idea visible. Green with saffron nods to India without using the flag.

Do not use PayPal blue or PayPal logos as Niryat's own brand. That is the sponsor's identity, and imitating it would make Niryat look like a PayPal page. Name PayPal in text wherever an action touches it.

### 4.2 Colour tokens

Keep every existing `--niryat-*` name: AG Studio and Bryntum already read them. `--niryat-overdue` becomes an alias of `--niryat-danger`. Dark mode stays under `@media (prefers-color-scheme: dark)`, with no toggle.

| Token                                                                  | Light                  | Dark      | Use                                                                                                                          |
| ---------------------------------------------------------------------- | ---------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `--niryat-bg`                                                          | `#f3f3ee` (§4.0)       | `#101413` | Page background (content column)                                                                                             |
| `--niryat-surface`                                                     | `#ffffff`              | `#171c1a` | Cards, sidebar, top bar, inputs                                                                                              |
| `--niryat-sunken`                                                      | `#efefe9`              | `#0c0f0e` | Table headers, code / JSON, hover rows, skeletons                                                                            |
| `--niryat-border`                                                      | `#e2e2da`              | `#262c2a` | Card and divider lines (decorative)                                                                                          |
| `--niryat-border-strong`                                               | `#8c948f`              | `#6a736f` | Input and secondary-button borders (must be ≥ 3:1)                                                                           |
| `--niryat-text`                                                        | `#1b1f1d`              | `#e7ebe9` | Body text and headings                                                                                                       |
| `--niryat-muted`                                                       | `#5a625e`              | `#a1aaa6` | Descriptions, captions, table headers, group labels                                                                          |
| `--niryat-primary` (existing)                                          | `#1f6f5c`              | `#7dd3b7` | Primary buttons, links, active nav icon, focus ring                                                                          |
| `--niryat-primary-hover`                                               | `#185a4a`              | `#9fe3cc` | Primary button hover                                                                                                         |
| `--niryat-primary-soft`                                                | `#e3f1ec`              | `#15312a` | Active nav background, success badge background                                                                              |
| `--niryat-primary-strong`                                              | `#175646`              | `#9fe3cc` | Text on `primary-soft`                                                                                                       |
| `--niryat-on-primary`                                                  | `#ffffff`              | `#0e241d` | Text on `primary`                                                                                                            |
| `--niryat-accent` (existing)                                           | `#e07a1f`              | `#ffb46a` | Approval count badge, approval-card edge, "needs you" marks. **Never as text on the page background** (2.78:1 in light mode) |
| `--niryat-on-accent`                                                   | `#2a1603`              | `#2a1603` | Text on `accent`                                                                                                             |
| `--niryat-attention-soft`                                              | `#fcefe1`              | `#3a2512` | Attention badge and banner background                                                                                        |
| `--niryat-attention-strong`                                            | `#8a4508`              | `#ffc690` | Text on `attention-soft`                                                                                                     |
| `--niryat-danger`                                                      | `#b42318`              | `#ffb4ab` | Danger button, error text, overdue                                                                                           |
| `--niryat-on-danger`                                                   | `#ffffff`              | `#3b0a06` | Text on `danger`                                                                                                             |
| `--niryat-danger-soft`                                                 | `#fdebe9`              | `#3d1714` | Danger badge and banner background                                                                                           |
| `--niryat-danger-strong`                                               | `#9a1d14`              | `#ffc4bc` | Text on `danger-soft`                                                                                                        |
| `--niryat-neutral-soft`                                                | `#eeeeea`              | `#262c2a` | Neutral badge background, sandbox pill                                                                                       |
| `--niryat-neutral-strong`                                              | `#4b5250`              | `#c3c8d1` | Text on `neutral-soft`                                                                                                       |
| `--niryat-overdue` (existing)                                          | `var(--niryat-danger)` | same      | Calendar overdue events                                                                                                      |
| `--niryat-upcoming`, `--niryat-past`, `--niryat-event-text` (existing) | unchanged              | unchanged | Calendar events                                                                                                              |

**Contrast, measured Nov 1** (WCAG ratios; text needs 4.5, UI boundaries 3): text on bg 15.4 / 15.4 (light / dark), muted on surface 6.3 / 7.2, on-primary on primary 6.0 / 9.2, attention-strong on soft 6.3 / 9.5, danger-strong on soft 7.1 / 10.4, on-accent on accent 5.7 / 9.9, input border 3.1 / 3.5, calendar past event text 4.8 / 9.5. Re-measure any value you change.

**Charts (AG Studio):** series order primary, accent, neutral-strong, danger; refunds and disputes use danger. Settle the full categorical palette in slice 4 with the `dataviz` skill.

### 4.3 Status tones

Four tones only (`success`, `attention`, `danger`, `neutral`), each a badge with a soft background, strong text and a 6px leading dot. Every badge also carries its text label, so colour is never the only signal.

| Data (enum in `packages/shared`) | success                     | attention                                | danger               | neutral                                           |
| -------------------------------- | --------------------------- | ---------------------------------------- | -------------------- | ------------------------------------------------- |
| Invoice status                   | `paid`                      | `partially_paid`, `partially_refunded`   | —                    | `issued`, `sent`, `refunded`                      |
| Invoice FIRA status              | `matched`                   | —                                        | `missing`            | `pending`                                         |
| Close FIRA coverage              | `covered`                   | —                                        | `missing`            | `not_due`, `not_needed`                           |
| FIRA line                        | `matched`                   | `needs_confirmation`                     | no match ("Flagged") | —                                                 |
| Approval (`actionStatusSchema`)  | `done`                      | `proposed` ("Waiting for your approval") | `failed`             | `approved` ("Sending…", with spinner), `rejected` |
| Health flag severity             | —                           | `medium`                                 | `high`               | `low`                                             |
| Export condition                 | `pass`                      | `unknown`                                | `fail`               | —                                                 |
| Advance-tax state                | `eligible`                  | `uncertain`                              | —                    | `not_eligible`                                    |
| Agent run                        | `completed`                 | —                                        | `failed`             | `running` (spinner)                               |
| Task                             | `done`                      | —                                        | —                    | `open` (API carries no day count)                 |
| Calendar event state             | `upcoming` (existing green) | —                                        | `overdue`            | `past`                                            |

The RBI "days left" cell uses the label from `daysRemainingLabel` and takes danger only when the API reports zero or fewer days. No 60/30-day thresholds are hard-coded in the web app; those numbers live in `packages/rules`.

### 4.4 Typography

- **Typefaces:** IBM Plex Sans (400, 500, 600) for UI and IBM Plex Mono (400, 500) for identifiers: invoice numbers, PayPal IDs, rule IDs, purpose codes, JSON payloads. Load both through `next/font/google` as CSS variables `--niryat-font-sans` and `--niryat-font-mono`, falling back to `system-ui` and `ui-monospace`. Plex reads as documentary and precise, fitting a compliance product, and its figures align in tables. Since §4.0, Anek Devanagari (`--niryat-font-display`, used through `--niryat-display`) sets Display, H1, section titles, stat values and the wordmark, at `wdth` 104–112.
- **Numbers:** `font-variant-numeric: tabular-nums` on tables, money, stat values and dates.
- **Scale** (size / line height / weight):

| Role    | Desktop                                   | Mobile                 | Use                                            |
| ------- | ----------------------------------------- | ---------------------- | ---------------------------------------------- |
| Display | 48 / 52 / 600 (hero 56 / 58)              | 36 / 40 (hero 38 / 42) | Health score, public hero                      |
| H1      | 34 / 40 / 600                             | 28 / 34                | Page title (one per page)                      |
| H2      | 18 / 26 / 600                             | 17 / 24                | Section and card titles                        |
| H3      | 16 / 24 / 600                             | same                   | Sub-sections, approval card title              |
| Body    | 16 / 24 / 400                             | same                   | Prose, descriptions                            |
| Small   | 14 / 20 / 400–500                         | same                   | Tables, form labels (500), nav, buttons (500)  |
| Caption | 13 / 18 / 400                             | same                   | Hints, footer, timestamps, rule citations      |
| Label   | 12 / 16 / 600, uppercase, 0.06em tracking | same                   | Sidebar group labels and stat-tile labels only |

Headings and buttons use sentence case ("Run monthly close", not "Run Monthly Close"). Prose lines stop at 68ch.

### 4.5 Spacing, radius, elevation, motion

- **Spacing:** a 4px scale, `--niryat-space-1` to `-8` = 4, 8, 12, 16, 24, 32, 48, 64. Card padding 24 (16 on mobile). Gap between cards 16 (24 on the overview grid). Section gap 32.
- **Radius:** 8 for controls (inputs, buttons, nav items), 12 for cards, 10 for banners, 999 for badges and pills (§4.0).
- **Elevation:** light mode gives cards a border plus `--niryat-shadow-card` (two soft layers), linked tiles lift to `--niryat-shadow-raised` on hover, and popovers use `0 8px 24px rgb(16 24 20 / 0.12)`. Dark mode uses borders only, no shadows.
- **Motion:** 120–150ms ease-out on colour and background only, a 700ms linear spinner, and a skeleton pulse. Under `prefers-reduced-motion: reduce`, the spinner and pulse stop and the text label remains.

### 4.6 Layout and breakpoints

| Breakpoint | Layout                                                                          |
| ---------- | ------------------------------------------------------------------------------- |
| < 640px    | Single column; content padding 16; forms stack; tables scroll inside their card |
| 640–1023px | Top bar + menu; form fields pair up (2 columns) where short                     |
| ≥ 1024px   | Fixed 248px sidebar + content column; content padding 32                        |
| ≥ 1280px   | Overview uses an 8/4 split, with recent invoices spanning the row               |

The content column has `--niryat-bg`, fills the width remaining beside the sidebar and has 32px side padding (16px below 640px). Public pages use a centered `max-width: 72rem` container. Forms cap at 40rem and prose at 68ch. Both shells keep the footer below long content and at the viewport bottom on short pages. Dashboard and Calendar use the available full column width.

```
≥1024px app shell
┌──────────────────────┬──────────────────────────────────────────────────────────┐
│ [N] Niryat           │  Invoices                                 [+ New invoice] │
│ [SANDBOX]            │  Bill clients abroad through PayPal.                      │
│                      │                                                           │
│ ⌂  Today             │  ┌─────────────────────────────────────────────────────┐  │
│                      │  │ card                                                │  │
│ SET UP               │  │                                                     │  │
│ ◯  Profile           │  └─────────────────────────────────────────────────────┘  │
│ ◯  Health check      │                                                           │
│ ◯  Clients           │                                                           │
│ BILL AND GET PAID    │                                                           │
│ █  Invoices  ◀active │                                                           │
│ CLOSE THE MONTH      │                                                           │
│ ◯  Monthly close  (2)│                                                           │
│ ◯  Tasks             │                                                           │
│ ◯  FIRA              │                                                           │
│ REPORTS              │                                                           │
│ ◯  Dashboard         │                                                           │
│ ◯  Calendar          │                                                           │
│ ◯  GSTR-1            │  ───────────────────────────────────────────────────────  │
│ ◯  Advance tax       │  PayPal sandbox only · Not tax or legal advice · Rules     │
│──────────────────────│  checked against primary sources, not reviewed by a CA ·  │
│ ananya@example.com   │  Disclaimer · Source (MIT)                                │
│ [↪ Sign out]         │                                                           │
└──────────────────────┴──────────────────────────────────────────────────────────┘
```

### 4.7 Sidebar (≥ 1024px)

- **Container:** `<nav aria-label="Main">` inside the single `<aside id="nav-menu" popover="auto">`, initially 248px wide, `--niryat-banyan` with `--niryat-on-banyan` text since §4.0 (items: 84% light text, muted icons, a 6% white hover, and for the active item a 10% white background, white 600 text, a mint icon and a 2px mint inset edge), `position: sticky; top: 0; height: 100dvh`, padding 16. A keyboard-accessible separator lets users drag the desktop width between 224px and 384px; the width remains during app navigation and resets on reload. Only the link area scrolls, keeping brand and account visible. Desktop CSS overrides both open and closed popover styles and hides the backdrop; mobile uses this same element as its menu sheet, without the resize control.
- **Brand row** (56px tall): a 28px rounded square mark (`primary` fill with a saffron arrow pointing up-right for "export", inline SVG) plus the "Niryat" wordmark in Plex Sans 18/600. It links to `/overview`.
- **Sandbox pill** below the brand: "Sandbox", label style, `neutral-soft` background, `neutral-strong` text, 1px border. It is always visible, so judges and the video never mistake this for live money.
- **Skip link** before the nav: "Skip to content" → `#main`, visible on focus.
- **Items:** 36px tall, radius 6, padding 0 10, a 2px gap between items, an 18px icon with a 10px gap, Small 14/500 text.
  - Hover: `--niryat-sunken` background.
  - Active (`aria-current="page"`, matched by path prefix): `primary-soft` background, `primary-strong` text and 600 weight, `primary` icon.
  - Focus-visible: the global focus ring.
- **Group labels:** Label style, `--niryat-muted`, 20px above and 8px below. "Today" sits first with no group label.
- **Approvals badge** on Monthly close: right-aligned, min 20×20, radius 999, `accent` fill, `on-accent` text 12/600. It shows only when the count is above 0, and carries visually hidden text: "2 approvals waiting".
- Count only `/close` reminder actions with `status === "proposed"`, matching Today's approvals tile. Invoice-send and refund proposals stay on Invoices and are not counted.
- **Account block**, pinned to the bottom with a top border: the email (Caption, `--niryat-muted`, truncated with the full value in `title`), then a ghost "Sign out" button with an icon (the existing `SignOutButton`, restyled).

### 4.8 Top bar and mobile menu (< 1024px)

- **Bar:** 56px, `--niryat-surface`, bottom border, `position: sticky; top: 0`. Mark, wordmark, Sandbox pill and a secondary "Menu" button with a menu icon. No top-bar approvals badge: the badge renders once inside the nav.
- **Menu:** the button has `popovertarget="nav-menu"`; the single nav aside is `popover="auto"`, with native light-dismiss and Escape. The panel is a left sheet, `position: fixed; inset: 0 auto 0 0; width: min(20rem, 85vw)`, with the backdrop token at `rgb(0 0 0 / 0.4)`. The nav and account block are not duplicated. `NavLinks` calls `hidePopover()` on navigation and pathname changes.

### 4.9 Page header

- `PageHeader({ title, description?, actions? })`: H1, then the description in Body `--niryat-muted` (max 68ch), with actions right-aligned on desktop and wrapping below on mobile. 32px top padding (20 mobile), 24px bottom margin.
- **One primary action per page, at most:**

| Page          | Header action                         |
| ------------- | ------------------------------------- |
| Invoices      | New invoice disclosure                |
| Monthly close | Run monthly close                     |
| Clients       | Add a client disclosure               |
| Health check  | Edit profile (secondary)              |
| FIRA          | None; upload card comes first         |
| GSTR-1        | None; download submits its rate form  |
| Advance tax   | None; estimate submits its input form |
- Download and estimate buttons stay at the ends of their forms (D15). No breadcrumbs or invoice-detail route; visible invoice cards are the anchor targets (D10).

### 4.10 Footer

- **App footer**, at the bottom of the content column (not the sidebar, not sticky): `<footer>`, 48px top margin, 1px top border, padding 16 0 24, Caption `--niryat-muted`, items separated by " · ":
  - PayPal sandbox only
  - Not tax or legal advice
  - Rules checked against primary sources, not reviewed by a CA
  - Disclaimer (link to `/disclaimer`)
  - Source (MIT) (link to the public repository)

  These lines restate [PLAN §23](PLAN.md#23-disclaimer) and the stated limitations; keep the wording in sync with that section.
- **Public footer**, on `/`, `/login`, `/signup` and `/disclaimer`: the same line, plus "Built for the PayPal AI Hackathon 2026". No third-party logos.

### 4.11 Components

**Buttons.** One `.btn` base: 36px tall (40 on public pages), padding 0 14, radius 6, Small 14/500, 8px icon gap.

| Variant     | Style                                                    | Use                                              |
| ----------- | -------------------------------------------------------- | ------------------------------------------------ |
| `primary`   | `primary` fill, `on-primary` text, hover `primary-hover` | Approve, submit, the page's main action          |
| `secondary` | `surface` fill, `border-strong` border, `text`           | Reject, cancel, Log in with PayPal               |
| `ghost`     | transparent, hover `sunken`                              | Sign out, row actions, "Show the PayPal request" |
| `danger`    | `danger` fill, `on-danger` text                          | Approve refund only                              |
- Disabled: 0.5 opacity and `cursor: not-allowed`.
- Pending: `aria-busy="true"`, a 14px spinner before the label and the label changed to a verb ("Sending to PayPal…").

**Forms.**
- Label above the field (Small 14/500, `text`), hint below (Caption, `muted`).
- Inputs and selects: 36px (40 public), padding 0 12, `surface` background, `border-strong` border, radius 6. Hover border `muted`. Focus: `outline: 2px solid var(--niryat-primary); outline-offset: 2px`. Use `outline`, not `box-shadow`, so the ring survives forced-colours mode.
- Invalid (`aria-invalid="true"`): `danger` border, with the message below in `danger-strong`, linked by `aria-describedby`.
- Mark optional fields with a muted "(optional)" and leave required fields unmarked.
- Checkboxes and radios stay native, with `accent-color: var(--niryat-primary)`.
- Textarea (paste-an-email in ExtractPanel): at least 6 rows, resize vertical.
- File input: style `::file-selector-button` as a secondary button.
- Forms sit in cards with an H2 per section. Short fields pair up from 640px (currency + amount, LUT from + to).
- The primary submit is left-aligned at the end; an inline result message sits next to it.

**Cards.** `surface`, 1px `border`, radius 10, padding 24, light shadow (§4.5). An optional header row has an H2 (or H3 when nested) and right-aligned ghost actions. Cards never nest more than one level.

**Badges.** 22px tall, padding 0 8, radius 999, Caption 12/500, 6px dot, tone colours from §4.2 (`*-soft` background, `*-strong` text). The text is the existing human labels ("Sent through PayPal", "Missing from FIRA").

**Tables.**
- Wrapped in a card with `overflow-x: auto`.
- `th`: Small 13/600 `muted`, sentence case, `sunken` background, sticky top.
- Rows: 44px tall, Small 14 text, a 1px `border` bottom, hover `sunken`.
- Numeric columns right-aligned with tabular figures; identifier columns in mono 13px.
- The last column holds row actions as ghost buttons.
- The current per-cell borders in `globals.css` go away; horizontal rules only.

**Money and dates.**
- Money: `Intl.NumberFormat("en-IN", { style: "currency", currency })`, which gives `$1,234.00`, `A$1,234.00`, `CA$1,234.00` and `₹1,23,456.00` with Indian grouping. Right-aligned in tables.
- Refund amounts use `formatMoney` in the labelled refunds section; preserve the record's sign. A refunded invoice has a neutral status badge (a refund is not an error).
- Dates in IST: "12 Aug 2026" (`day: "numeric", month: "short", year: "numeric"`); months "October 2026"; times "12 Aug 2026, 14:05 IST".
- Days left: the API's value through `daysRemainingLabel`.

**Identifiers.** Mono 13px with `user-select: all`, shown in full (judges copy PayPal IDs).

**Banners.** A full-width strip inside the content: radius 10, padding 12 16, an 18px icon and Small text, tone `*-soft` / `*-strong`.

| Kind              | Use                                                                       | ARIA            |
| ----------------- | ------------------------------------------------------------------------- | --------------- |
| neutral + spinner | Run in progress ("Closing October 2026… this page updates automatically") | `role="status"` |
| attention         | AI unavailable or budget used                                             | —               |
| danger            | Failed attempts                                                           | `role="alert"`  |

**Claude suggestion block.** It separates AI advice from facts: a dashed 1px `border-strong` border (dashed means "suggestion, not fact"), `sunken` background, radius 10, padding 12 16. A label row reads "Suggestion from Claude" (Caption 600 with a lightbulb icon), then the advice in Body. It is used in the approval card, the "What to do first" list and the purpose-code suggestion.

**Disclosure / JSON.** `<details>` with a ghost-style `<summary>` ("Show the PayPal request"); the body is mono 13px on `sunken`, radius 6, padding 12, `max-height: 16rem; overflow: auto`.

**Empty state.** Centred in its card, padding 32: a 32px muted icon, H3 title, one Body sentence in `muted`, and at most one primary action.

| Page                      | Title              | Sentence                                                          | Action      |
| ------------------------- | ------------------ | ----------------------------------------------------------------- | ----------- |
| Invoices                  | No invoices yet    | Paste a client email and Claude fills in the invoice for you.     | New invoice |
| Monthly close (approvals) | Nothing to approve | Niryat proposes PayPal reminders here when a deadline gets close. | —           |

**Loading** (`(app)/loading.tsx`): skeleton blocks in `sunken` with a pulse, shaped like a page header (a 30px bar at 40% width plus a 16px bar at 60%) and two cards. It carries `aria-busy="true"` and visually hidden text: "Loading".

**Error** (root `app/error.tsx`): a card with a danger icon and the H2 "Couldn't load this page", then: "Niryat couldn't reach its server. Nothing was sent to PayPal." Two buttons: primary "Try again" (`retry`) and secondary "Go to Today". No error details. Card failures show "Couldn't load this card. Nothing was sent to PayPal." with a ghost "Try again" button; badge failures render nothing.

**Not found:** H1 "Page not found", one sentence, a link to Today.

### 4.12 Icons

About 20 Lucide icons, copied as inline SVG components into `components/icons.tsx` (Lucide is ISC-licensed; keep its licence notice in a comment). That avoids a dependency for a few lines. Use a 1.5px stroke, `currentColor`, 18px in the nav, 16px in buttons and badges, and `aria-hidden="true"` (labels carry the meaning).

| Where         | Lucide icon                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Today         | `house`                                                                                                                   |
| Profile       | `user-round`                                                                                                              |
| Health check  | `shield-check`                                                                                                            |
| Clients       | `users`                                                                                                                   |
| Invoices      | `file-text`                                                                                                               |
| Monthly close | `calendar-check`                                                                                                          |
| Tasks         | `list-checks`                                                                                                             |
| FIRA          | `file-check`                                                                                                              |
| Dashboard     | `chart-column`                                                                                                            |
| Calendar      | `calendar-days`                                                                                                           |
| GSTR-1        | `file-spreadsheet`                                                                                                        |
| Advance tax   | `calculator`                                                                                                              |
| UI            | `menu`, `log-out`, `plus`, `upload`, `download`, `external-link`, `lightbulb`, `triangle-alert`, `circle-check`, `loader` |

Check the names against Lucide at copy time.

### 4.13 Page blueprints, in demo order

**`/` (public).**
- Header: 64px; mark and wordmark left; "Sign in" (ghost) and "Create account" (primary) right.
- Hero, left-aligned, max 40rem:
  - Display headline: "Run your export business on PayPal. Niryat keeps it legal in India."
  - Lead (18px, `muted`): "GST-ready invoices, FIRA matching, RBI deadlines and advance tax, built from your PayPal activity. You approve every action."
  - Buttons: "Create account" (primary, large), "Log in with PayPal" (secondary). The Phase 7 "Try as judge" button goes first, primary, when it exists.
- **How it works:** five steps in a row (stacked on mobile), each an icon, a step title and one Caption line: Sign in → Bill → Get paid → Handle changes → Close the month (from [PLAN §3](PLAN.md#3-how-it-works)).
- **Three trust points** as cards: "You approve every PayPal action", "Rules cite primary sources", "Sandbox only; nothing is filed for you".
- Public footer.

**`/login`, `/signup`.**
- A centred 400px card on `bg`: mark above, H1 "Sign in" / "Create account", the existing PayPalLoginError as a danger banner, then the email and password form with a full-width primary button.
- Below the form: a divider reading "or", then "Log in with PayPal" as a full-width secondary button. Text only; use PayPal's official button artwork only if its brand guidelines are followed.
- The switch link sits at the bottom.

**`/overview` (Today).**

```
Today                                             Sunday, 1 Nov 2026
┌ APPROVALS WAITING ┐┌ NEXT DEADLINE ───┐┌ HEALTH SCORE ┐┌ OPEN TASKS ┐
│ 2                 ││ 15 Nov 2026      ││ 62 / 100     ││ 3          │
│ Review in Monthly ││ GSTR-1 due       ││ 2 high flags ││ View tasks │
│ close →           ││ →                ││ →            ││ →          │
└───────────────────┘└──────────────────┘└──────────────┘└────────────┘
┌ Waiting for your approval ─────────────────┐┌ Upcoming deadlines ───────┐
│ approval cards, compact (max 3) + "All →"  ││ 5 rows: date, title, badge │
└────────────────────────────────────────────┘└────────────────────────────┘
┌ Recent invoices ────────────────────────────────────────────────────────┐
│ 5 rows of the invoices table + "All invoices →"                         │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Stat tiles:** a Label-style label, a value at 30/600 with tabular figures, and a Caption sub-line; the whole tile is a link.
- The approvals tile gets a 3px `accent` left edge when its value is above 0.
- The health tile's tone comes from its highest flag severity (data from the API), not from score bands invented in the UI.
- Grid: 4 tiles across from 1024px, 2 across from 640px; the lower row is 8/4 columns from 1280px.

**Health check.**
- Score card: Display "62 / 100", a 8px progress bar (`primary` on `sunken`, `role="img"` with an aria-label repeating the score), and "Checked on 1 Nov 2026" as a Caption.
- **Red flags,** sorted high → low: each is a row card with its severity badge, the message in Body 500, and a citation line in Caption ("Rule `R-LUT-01` · source link", rule ID in mono), followed by the existing note in `muted` italic. These flags are the demo's opening hook (LUT expired, purpose code).
- **Purpose code:** the suggested code in mono 20/600 ("P0802") with its label, the reason in a Claude suggestion block, and the existing note below.

**Invoices.**
- A "New invoice" card holds ExtractPanel (paste email → fields filled) and InvoiceForm. It is collapsed into a `<details>` when invoices exist, open when there are none.
- One card per invoice, with a visible `id="invoice-<id>"` target and a `:target` outline. Number (mono), client, date, amount, status/FIRA badges, RBI deadline, approval cards and dispute alerts stay visible.
- A `Details` disclosure contains type, recurrence, paid so far, PDF link, payments and refunds tables, RefundForm, realisation, credit notes and dispute details. No invoice table-row expansion or `/invoices/[id]` route.
- Refund proposals label the invoice total `Invoice amount`; the requested refund remains visible in the PayPal request disclosure. Other approvals label the total `Amount`.

**Approval card** (used on Invoices, Monthly close and Today).

```
▌ ● Waiting for your approval                    Reminder · 30-day stage
▌ Send PayPal's standard reminder for INV-0007 to Acme Inc.
▌ Amount  $1,200.00    Invoice date  12 Aug 2026    RBI deadline  Overdue by 3 days
▌ ┌╌╌ [bulb] Suggestion from Claude ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐
▌ ╎ Hold: the client paid a related invoice yesterday, so wait a week.      ╎
▌ └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
▌ ▸ Show the PayPal request
▌ Nothing is sent to PayPal until you approve.        [Reject] [Send reminder]
```

(The lightbulb is the `lightbulb` icon, not an emoji.)
- A card with a 3px left edge in `accent` while `proposed`, `danger` when `failed`, none otherwise.
- Header: the status badge, plus the action kind in Caption on the right.
- Title in H3: a verb plus object, built only from fields the action and invoice carry.
- A one-line definition grid, then the Claude suggestion block when advice exists, then the request disclosure.
- Footer: the reassurance Caption on the left; Reject (secondary) and Approve (primary, or danger for refunds) on the right.
- Approve labels stay the existing ones ("Approve and send to PayPal").
- Done and rejected cards collapse to one line: badge, title, date.

**Monthly close.**
- Header action: "Run monthly close" (CloseButton). While running, a neutral banner with a spinner (CloseRefresher keeps polling).
- **What to do first:** an ordered list, each item a row with a 24px saffron-outlined number circle, the label in Body 500 and the reason in `muted`. A Caption at the end: "Priorities suggested by Claude".
- **Waiting for your approval:** approval cards, or the empty state.
- **Needs attention:** failed or uncertain reminder cards, under a danger banner explaining "Check PayPal before taking further action".
- **History:** `<details>` holding a table of earlier reminders and runs (date, kind, status badge, AI status).

**FIRA.**
- An upload card: file input, the "this is my own FIRA" consent checkbox, primary "Upload FIRA".
- One card per document, headed "FIRA for <month>" with its uploaded date.
- Match lines table: date, amount, reference (mono, with source-text disclosure), purpose code, matched payment, state badge, **Reason**, confidence and actions. A line without a match is danger with the text "Flagged". The flagged line must read clearly at 1440px; narrow screens scroll within the table wrapper.

**Tasks.** A table: due date, task, source rule (mono rule ID), a status badge, an "Open invoice" link when available and a "Mark done" ghost button. Open tasks are neutral and done tasks success; the API carries no day count, so the web does not invent an overdue tone. A `<details>` holds completed tasks with formatted completion dates.

**Calendar.** The legend renders as badges (overdue, upcoming, past), then the Bryntum calendar in a full-width card with a fixed height (40rem), then the existing deadline list as a table below.

**Dashboard.** Full width; the page header has a description of the questions the AI can answer; AG Studio sits in a card. The empty state replaces the current bare `DASHBOARD_EMPTY` line.

**Clients.** One card per client, with name, country (`Intl.DisplayNames`), email, address, its five-condition export-check table (pass / unknown / fail badges), citation and `Edit answers` disclosure. The header's "Add a client" form disclosure is open only when there are no clients (D16).

**GSTR-1, Advance tax.** Input and period-selection forms sit in cards, with download and estimate buttons at the ends of their forms. Results use formatted money/dates and right-aligned numeric columns; totals rows are 600 weight with a 2px top border. Every Phase 6 message and null-value label stays unchanged (D9, D15).

**Profile.** One form split into section cards: Business, GST and LUT, Work and purpose code. Short fields pair up on wider screens, and the save button sits at the end.

**Disclaimer** (public route). Prose at 68ch with the [PLAN §23](PLAN.md#23-disclaimer) text. It covers: not tax advice, no CA review, one seller per deployment, sandbox only.

### 4.14 Sponsor widgets

- **AG Studio:** keep `studioTheme.withParams` and add `backgroundColor: var(--niryat-surface)`, `foregroundColor: var(--niryat-text)` and `chartAxisLineColor: var(--niryat-muted)`, all documented parameters (see [tooling sources](tooling-sources.md)). Check font-family support through Context7 before adding it.
- **Bryntum:** the existing event classes keep working through the unchanged token names. Check its theming variables through Context7 before restyling its chrome; otherwise frame it in a card and leave the inside alone.

### 4.15 Voice and copy

- Name PayPal in every action that touches it ("Send to PayPal", "PayPal's standard reminder").
- Label AI output "Suggestion from Claude" or "Claude suggests"; never present it as fact.
- Prefer verbs on buttons, sentence case everywhere, and amounts always with their currency.
- Reassure at decision points ("Nothing is sent to PayPal until you approve.").
- Errors say what happened and what is safe: "Nothing was sent to PayPal."
- Use glossary terms consistently: LUT, FIRA, GSTR-1, RBI realisation deadline ([glossary](glossary.md)).

### 4.16 Recording the video

- Light mode, browser window at 1440×900, 100% zoom, bookmarks bar hidden.
- Use a seeded account whose sample names are realistic and plainly fictional.
- Start each scene with its page already loaded; the skeletons should appear only where showing streaming is the point.

## 5. Original slice outline (implementation tasks F0–F12 take precedence)

Follow [frontend-refactor-plan §7](frontend-refactor-plan.md#7-tasks-in-order) for task scope/order. Its §5 defers formatting, automated validation and browser handoff until F12; commits are made only when requested. The table below is the original estimate, not a second workflow.

| #   | Slice                                                                                                                           | Est.   | Done when                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| 0   | AI tooling setup (§6); baseline screenshots of every page, light and dark, taken by the user                                    | 0.5 d  | Agents can read the bundled Next docs and dev-server errors                   |
| 1   | §4.2 tokens, §4.4 fonts, §4.5 scales, element-level restyle, `.btn` `.card` `.badge` `.table` `.banner` classes, title template | 1 d    | All pages restyled with no markup changes; contrast re-measured               |
| 2   | Route groups, `/auth/me` layout gate, sidebar, top bar and footer (§4.6–4.10), icons, `loading` / `error` / `not-found`         | 0.75 d | Logged-out visitors see no app chrome; slow or failed API calls show feedback |
| 3   | §3.3 shared components, approval card (§4.13), `useTransition` pending fix (§3.4)                                               | 1 d    | Demo-path pages use them; no stale-props flicker                              |
| 4   | `/overview`, public home, login and signup, health check, invoices, close, FIRA blueprints, disclaimer page                     | 1.5 d  | The full demo script runs through the restyled UI                             |
| 5   | Accessibility and dark-mode pass, 390px check, build-size check, copy pass                                                      | 0.5 d  | Checklist in §7 is ready for the user                                         |

**Cut line:** if slice 4 is not done by **Nov 6**, ship slices 1–3 plus the demo-path pages (home, health check, invoices, close, FIRA), leaving the other pages with the slice 1 restyle. Phase 7 (hosting, judge mode) still needs Nov 5–8 in parallel, so this plan must not block it.

## 6. AI tooling: skills and MCP servers

### 6.1 Version-matched Next.js docs (highest value, zero install)

Next 16.4.3 ships its documentation in `apps/web/node_modules/next/dist/docs/`. Vercel's agent evals found bundled docs beat knowledge skills (100% vs up to 79% pass rate). Add one line to [apps/web/AGENTS.md](../apps/web/AGENTS.md) telling agents to read the relevant guide there before using any Next API, and one line pointing at §4 of this plan as the design source of truth. Claude Code and Codex both read AGENTS.md. (`next dev` can also manage the docs block itself; either way, commit the result so the tree stays clean.)

### 6.2 MCP servers

| Server                                     | Claude (`.mcp.json`) | Codex (`.codex/config.toml`) | Use                                                                                                                                                                                                                                                                                       |
| ------------------------------------------ | -------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **context7**                               | already configured   | already configured           | React 19.3, Next 16.4, AG Studio 3, Bryntum 7.3 API docs                                                                                                                                                                                                                                  |
| **next-devtools-mcp**                      | add                  | add                          | Reads the running dev server's `/_next/mcp` endpoint: compile and runtime errors, routes, logs. No browser involved. Pin an exact version (the repo pins everything; the docs' `@latest` conflicts with that) and check the `npx` command on Windows (it may need `npx.cmd` or `cmd /c`). |
| Playwright MCP or Chrome DevTools MCP      | opt-in only          | opt-in only                  | Screenshots and accessibility snapshots. **AGENTS.md reserves browser verification for the user**, so add these only if the user explicitly asks. Until then the user supplies screenshots.                                                                                               |
| Figma (connected on the claude.ai account) | optional             | —                            | Only if someone wants to sketch `/overview` or the approval card before coding. The §4 wireframes are enough to code from.                                                                                                                                                                |

Not recommended: the shadcn MCP (no shadcn, §1.1), Vercel MCP (hosting is Render).

Proposed entries, for review before adding (exact version to be resolved from the registry at install time and recorded in [tooling sources](tooling-sources.md)):

```json
"next-devtools": { "command": "npx", "args": ["-y", "next-devtools-mcp@<exact-version>"] }
```

```toml
[mcp_servers.next-devtools]
command = "npx"
args = ["-y", "next-devtools-mcp@<exact-version>"]
```

### 6.3 Skills to load per slice (Claude Code)

| When        | Skill                                                                   | Why                                                                                                     |
| ----------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Slice 1     | `design:design-system`                                                  | Check §4.2–4.5 against the implemented CSS; flag drift                                                  |
| Slices 1, 4 | `design:design-critique`                                                | Critique the user's before and after screenshots of each demo page                                      |
| Slice 4     | `dataviz`                                                               | Overview stat tiles, the health bar and the AG Studio series palette                                    |
| Slices 4, 5 | `design:ux-copy`                                                        | Empty, error and loading states; approval-card summaries                                                |
| Slice 5     | `design:accessibility-review`                                           | WCAG pass on the shell, forms and approval card                                                         |
| Every slice | `context7-mcp`                                                          | Before any React, Next, AG Studio or Bryntum API use                                                    |
| Every slice | `ponytail-review` or `code-review`                                      | Review each slice's diff before commit                                                                  |
| Optional    | `next-dev-loop` (`npx skills add vercel/next.js --skill next-dev-loop`) | Verifies edits against the dev server **and a browser**, so only with the user's explicit opt-in (§6.2) |

A general frontend-design skill (for example Anthropic's `frontend-design` plugin, if your marketplace offers it) is no longer needed for visual direction: §4 sets it. If you use one, keep its output inside §4.

**Codex:** it has no Claude skills. It gets the same results from AGENTS.md (§6.1), the two MCP servers, and a short prompt per slice.

### 6.4 How to prompt an agent for a slice

Give it:
- the slice row from §5;
- the §4 subsections it implements;
- the files it touches;
- the instruction: "restyle only; do not change data fetching, API calls or approval logic; use only §4.2 tokens, no raw hex values in components".

Ask it to run `pnpm --filter @niryat/web test`, `pnpm verify` and `pnpm build`, and to list the manual browser checks for the user instead of running them.

## 7. Manual checks for the user (browser)

Start with `pnpm dev` (web on http://localhost:3000, API on :3001) and sign in with a sandbox account that has invoices, a FIRA and a pending reminder.
On restricted PowerShell use `corepack.cmd pnpm dev`. If the combined launch fails, run `corepack.cmd pnpm --filter @niryat/api dev` and `corepack.cmd pnpm --filter @niryat/web dev` in separate terminals. Use your existing configured local database/storage and sandbox account; supply credentials yourself. Start at http://localhost:3000/login. The complete F12 handoff, including reduced motion, radio labels, invoice anchors, error recovery, menu dismissal and the demo script, is [frontend-refactor-plan §8](frontend-refactor-plan.md#8-manual-checks-for-the-user-browser-f12-only). Every browser check remains awaiting user verification.
- [ ] Logged out, `/` shows the public page with no app chrome; `/invoices` redirects to `/login`.
- [ ] After sign-in you land on `/overview`; each card loads independently, and the approvals badge matches the count on `/close`.
- [ ] The sidebar highlights the current page; the Sandbox pill and footer lines are visible on every app page.
- [ ] With the API stopped, any app page shows the error card with a working "Try again", not Next's default error.
- [ ] Approving a reminder: the button stays disabled until the page shows the new status, focus moves to the result message, and the sidebar badge count drops.
- [ ] Amounts read `$1,234.00` / `₹1,23,456.00` (Indian grouping) with aligned digits; dates read "12 Aug 2026" on every page.
- [ ] Every badge has a text label; the Claude suggestion block is visibly distinct from facts.
- [ ] Dark mode (OS setting): text, badges, AG Studio and Bryntum are legible.
- [ ] At 390px wide: the Menu button opens the nav sheet, choosing a link closes it, tables scroll inside their card, and nothing scrolls the page sideways.
- [ ] Keyboard only: skip link, nav, forms and approval buttons are reachable, with a visible focus ring.
- [ ] Run the full demo script end to end at 1440×900 in light mode for the video.

Report these as awaiting user verification until confirmed.
