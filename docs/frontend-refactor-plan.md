# Frontend refactor plan

Status: F0–F11 implemented; F12 source review, fixes, documentation and automated checks passed (2026-11-02). Initial required commands ran in order: format; web tests (357 passed); shared tests (110 passed); API tests with U1 (444 passed, 193 database-dependent tests skipped); verify (27/27 tasks, 24 cached; cached DB suite includes 75 skipped tests); build (9/9 tasks, 8 cached; Google Fonts succeeded). User browser findings then authorized centered public content, full-width/padded app content, a bottom-aligned footer, drag-resizable desktop sidebar and first-login fixes (submit waits for hydration; success starts a fresh document navigation). Follow-up checks pass: 361 web tests, verify 27/27 tasks (24 cached), build 9/9 tasks (8 cached). The user approved direct source review against FP §3.5/§4.15 because the two named design skills are unavailable. The updated shell import graph reaches 12 local files and no sponsor package; all 14 pre-move routes and test files remain, plus Today and Disclaimer (16 routes). Light/dark token contrast and reduced-motion source checks pass. Browser retests and the remaining §8 checks await user verification, so the phase exit gate stays open. These changes preserve rules, API contracts and the approval workflow; U1 changes only the PayPal sign-in landing route.

Sources of truth:
- [Frontend plan](frontend-plan.md) ("FP" below). §4 is the visual specification: tokens, type, spacing, component looks and page blueprints. This plan does not repeat its values; tasks cite FP sections. Where this plan's §2 decisions differ from FP, **this plan wins**. F12 then updates FP to match.
- [PLAN §3, §16, §23](PLAN.md): the "how it works" steps, the demo script (the design brief) and the disclaimer text.
- [build flow](build-flow.md): feature freeze **Nov 8**; Phase 7 (hosting, judge mode) runs Nov 5–8 in parallel and must not be blocked.
- `AGENTS.md` (root and [apps/web](../apps/web/AGENTS.md)), especially **Golden rules** and **Design (LLD)**.

**Exit gate (F12 only):** the full demo script (PLAN §16) runs through the restyled UI. `pnpm verify` and `pnpm build` pass, and the user has confirmed the §8 manual checks.

---

## 0. Scope

### Builds

1. A design foundation in one `globals.css`: FP §4.2 tokens, §4.4 type, §4.5 scales, element-level restyle, about 15 house classes, and IBM Plex fonts.
2. Route groups `(public)` and `(app)`. An `/auth/me` gate in the `(app)` layout. A sidebar on desktop and a popover menu on mobile, with an approvals badge, a footer and a skip link. Root `error.tsx`, `not-found.tsx`, and `(app)/loading.tsx`.
3. Shared display helpers and components: date and money formatting, status tones, icons, `StatusBadge`, `PageHeader`, `EmptyState`, `ApprovalCard` and `CardBoundary`.
4. A pending-state fix: buttons stay disabled until `router.refresh()` has rendered the new state.
5. A new `/overview` ("Today") page as the signed-in home.
6. Restyled pages: public home, login, signup and a new disclaimer page; the demo-path pages (health check, invoices, monthly close, FIRA); then the rest.

### Not building

| Item                                                                                                     | Why                                                                                 |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Tailwind, shadcn, component libraries, any new npm dependency                                            | FP §1.1. Fonts come from `next/font` (part of `next`); icons are copied inline      |
| Server Actions, React Query/SWR, `cacheComponents`/PPR, `proxy.ts`                                       | FP §1 table                                                                         |
| Theme toggle, toasts, illustrations, page transitions, Storybook                                         | FP §1 table                                                                         |
| `/invoices/[id]` route, breadcrumbs                                                                      | FP §4.9 makes it optional; D10 keeps invoice cards                                  |
| A second approvals badge in the mobile top bar                                                           | D6: the badge renders once, inside the single nav. Skipped to avoid a second fetch  |
| Overdue tone for tasks; "in N days" on deadlines                                                         | D8: the API returns no day counts for these, and the web must not compute deadlines |
| Counting invoice-send and refund approvals in the badge                                                  | D7 / U4                                                                             |
| "Try as judge" button, last-sync indicator, rate limits                                                  | Phase 7                                                                             |
| AG Studio categorical palette work beyond documented theme params                                        | F11: optional, only if the installed types expose a palette param                   |
| Restyling Bryntum's internals                                                                            | FP §4.14: frame it in a card only                                                   |
| Any change to the approval logic in `ActionButtons` (one-attempt reminder rule, `approvalStarted` guard) | FP §1 table. F6 adds only the transition; F7 restyles only                          |
| Browser verification by the agent                                                                        | AGENTS.md: the user runs §8                                                         |

## 1. What this builds on (verified in the tree on 2026-11-01)

| Area                       | Where                                                                                                                                                                                                                                                                                  | Notes                                                                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versions                   | `apps/web/package.json`                                                                                                                                                                                                                                                                | Next 16.4.3 (`next build --webpack`), React 19.3.1, zod 4.6.7, TypeScript 7.0.2, Node 24                                                                                                                         |
| Next docs                  | `apps/web/node_modules/next/dist/docs/`                                                                                                                                                                                                                                                | Version-matched. Read the relevant file before using any Next API (error, loading, route groups, layout, font, `catchError`)                                                                                     |
| Root layout                | `app/layout.tsx` (34 lines)                                                                                                                                                                                                                                                            | A flat `<nav>` of 12 links plus `SignOutButton`, shown to everyone; `<main>`; static `metadata`                                                                                                                  |
| CSS                        | `app/globals.css` (106 lines)                                                                                                                                                                                                                                                          | Tokens `--niryat-primary/accent/overdue/upcoming/past/event-text` with dark variants; calendar `.niryat-*` and `.b-cal-event` overrides; `.dashboard-studio` height and `main:has(.dashboard-studio)` full width |
| Server data                | `lib/api.ts` `apiGet(path, schema)`                                                                                                                                                                                                                                                    | Forwards the cookie, `no-store`; 401 → `redirect("/login")`; 404 → `null`; other errors throw `Error("API <path> failed with status <n>")`; zod-parses                                                           |
| Mutations                  | `lib/forms.ts` `sendJson`, `sendPdf`; `daysRemainingLabel(days)`                                                                                                                                                                                                                       | Client components POST to `/api/*` (Next rewrite); `daysRemainingLabel` gives `Due today` / `Overdue by N days` / `N`                                                                                            |
| `router.refresh()` callers | `ActionButtons` (both paths), `ClientForm`, `InvoiceForm`, `RefundForm`, `FiraUpload`, `FiraLineButtons`, `TaskDoneButton`, `CloseButton`; `router.push` in `AuthForm` (`/profile`), `ProfileForm` (`/health-check`), `SignOutButton`                                                  | Each calls `setSubmitting(false)` before the refresh: the stale-props flicker. `ExtractPanel` and `Gstr1Download` set state only and do not refresh                                                              |
| Session user               | `GET /auth/me` → `{ id, email }` or 401 `{ error: "unauthenticated" }` (`apps/api/src/routes/auth.ts:118`)                                                                                                                                                                             | `users.email` is `NOT NULL` (`packages/db/src/schema.ts:21`), and PayPal sign-in without an email is refused (`no_email`), so the email is **always present**. This resolves FP §3.2's open question             |
| PayPal sign-in landing     | `apps/api/src/routes/auth.ts:71` redirects to `${appUrl}/profile`; asserted at `auth.test.ts:186,195`                                                                                                                                                                                  | See U1                                                                                                                                                                                                           |
| Approvals                  | `GET /close` → `closePageSchema { runs, approvals: reminderActionSchema[] }`; reminder actions carry `invoiceId`, `invoiceNumber`, `payload.stage`, `payload.agent`                                                                                                                    | Invoice-send and refund actions live on `invoiceViewSchema.action` / `.refundActions` (from `/invoices`). Reminder actions carry **no** client name or amount                                                    |
| Ordering                   | `listInvoices`: newest first (`fy desc, seq desc`); runs: `startedAt desc`                                                                                                                                                                                                             | Overview "recent invoices" = the first five                                                                                                                                                                      |
| Tasks                      | `taskSchema { type, status, message, dueDate, invoiceId, sourceRuleId, doneAt }`                                                                                                                                                                                                       | **No** days-remaining or overdue field                                                                                                                                                                           |
| Calendar                   | `calendarEventSchema { id, date, kind, title, state, href, ruleId }`; titles already carry an `Overdue: ` / `Upcoming: ` / `Past: ` prefix                                                                                                                                             | The calendar page builds "overdue + next 10 upcoming" inline                                                                                                                                                     |
| Anchors                    | Calendar events and the tasks page link to `/invoices#invoice-<id>`                                                                                                                                                                                                                    | Every invoice must keep a visible element with `id="invoice-<id>"`                                                                                                                                               |
| Error boundary API         | Next 16.4 `error.js` props are `{ error: unknown, retry }` (`reset` still exists but is discouraged). `error.js` does **not** wrap the `layout.js` of its own segment. `catchError` from `next/error` builds component-level boundaries and passes `redirect()` / `notFound()` through | FP §4.11 says `reset`; this plan uses `retry`                                                                                                                                                                    |
| Layouts                    | Next docs: layouts do not re-render on navigation, only on full loads and `router.refresh()`                                                                                                                                                                                           | The `(app)` gate and the badge refresh on approve, close and every other `router.refresh()`                                                                                                                      |
| Intl                       | Checked in Node 24 and TS 7: `Intl.NumberFormat("en-IN", { style: "currency", currency }).format("12345678901.235")` → `₹12,34,56,78,901.24` (exact decimal-string input, no float); USD `$`, CAD `CA$`, AUD `A$`, EUR `€`, GBP `£`. `en-IN` short month for September is **`Sept`**   | Never hard-code month abbreviations in tests; avoid September in fixtures, or assert ICU's output                                                                                                                |
| AG Studio theme            | `studioTheme.withParams({ accentColor, chartAxisLineColor })` in `components/Dashboard.tsx`; installed `.d.ts` declares `backgroundColor`, `foregroundColor`, `chartAxisLineColor` and `fontFamily` params                                                                             | Confirm by typecheck in F11                                                                                                                                                                                      |
| Tests                      | Vitest; pages are tested with `renderToStaticMarkup` and `vi.mock("../../lib/api")`; `ActionButtons.test.tsx`, `ClientForm.test.tsx` and `CalendarView.test.tsx` mock `react`'s `useState`/`useRef`/`useEffect`/`useId` with a hook cursor                                             | Adding `useTransition` needs those mocks extended (F6). Markup-exact assertions are listed in §4.7                                                                                                               |
| Repository                 | `origin` = `https://github.com/Jaisheesh-2006/Niryat`                                                                                                                                                                                                                                  | Footer "Source (MIT)" link; see U3                                                                                                                                                                               |

## 2. Decisions (locked; do not re-decide)

| #   | Topic                          | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Dependencies                   | None added. Fonts: `next/font/google` `IBM_Plex_Sans` (400/500/600) and `IBM_Plex_Mono` (400/500), with CSS variables `--niryat-font-sans` / `--niryat-font-mono`. The build fetches them once and needs network. If `pnpm build` cannot reach Google Fonts, **stop and report**; do not switch to local font files without the user's approval. Icons: about 22 Lucide SVGs copied into `components/icons.tsx`, with the ISC notice in a comment (FP §4.12)                                                                                                      |
| D2  | Route groups                   | `app/(public)/`: `page.tsx` (`/`), `login`, `signup`, `disclaimer` (new). `app/(app)/`: `overview` (new) and the 11 existing signed-in routes. URLs do not change. The root `app/layout.tsx` keeps `<html>`, `<body>`, fonts, `globals.css` and the metadata template, and loses the nav. Move with `git mv`; the colocated tests move with their pages                                                                                                                                                                                                           |
| D3  | Auth gate                      | `(app)/layout.tsx` (async server component): `const me = await apiGet("/auth/me", sessionUserSchema); if (!me) redirect("/login")`. A 401 already redirects inside `apiGet`. Only `me.email` reaches the browser (FP §3.5). Each page's own `apiGet` still redirects on a 401, and the API remains the security boundary                                                                                                                                                                                                                                          |
| D4  | Error and loading files        | **`app/error.tsx`** (root, client component): it covers failures in the `(app)` layout's own fetch, which an `(app)/error.tsx` would not catch. Props are `{ error: unknown; retry: () => void }`; render no `error` fields. **`app/not-found.tsx`**. **`app/(app)/loading.tsx`**: shown on navigation between app pages. No `global-error.tsx`, since the root layout does no I/O                                                                                                                                                                                |
| D5  | Partial failures               | Every overview card and the approvals badge render inside `<CardBoundary>` (a `catchError` boundary) wrapped in `<Suspense>`. One failing endpoint shows that card's fallback (§4.6) and leaves the rest of the page working. The badge's fallback renders nothing. Do not hand-write `try/catch` around `apiGet` (it would swallow `redirect()`)                                                                                                                                                                                                                 |
| D6  | One nav element                | The sidebar and the mobile menu are **the same** `<aside id="nav-menu" popover="auto">`. Below 1024px it is a native popover, opened by `<button popoverTarget="nav-menu">` in the top bar. At 1024px and up, author CSS overrides the UA popover styles (`display`, `position`, `inset`, `margin`, `border`, `padding`, background) for both `:not(:popover-open)` and `:popover-open`, and hides `::backdrop`, so it renders as the sticky sidebar. The nav, the account block and the badge therefore each render once. The top bar is hidden at 1024px and up |
| D7  | Approvals count                | Count = `closePageSchema.approvals` with `status === "proposed"` (reminder proposals, where the monthly-close promise lives). The sidebar badge on "Monthly close" and the overview "Approvals waiting" tile show the same number. Invoice-send and refund approvals are created and approved on `/invoices` in the same flow and are not counted (U4)                                                                                                                                                                                                            |
| D8  | Tones (FP §4.3), with fixes    | Use FP §4.3 as written, except: **tasks** `open` → neutral, `done` → success, with no overdue tone (the task API carries no day count). **FIRA line with no match** → danger, label `Flagged` (FP omits it). The overview health tile's tone comes from its highest flag severity (`high` → danger, `medium` → attention, `low`/none → success). The web never invents thresholds                                                                                                                                                                                 |
| D9  | Formatting                     | One module, `lib/format.ts` (§4.3), used for every displayed date, month, date-time and money amount, **including GSTR-1 and advance tax**. Delete advance tax's local `inr()` helper. Keep raw ISO values in `<time dateTime>`. Exchange rates, FIRA confidence, percentages and counts are not money. `"Not provided by PayPal"` and other null labels stay. Display only: no compliance figure is computed in the web                                                                                                                                          |
| D10 | Invoices layout                | **One card per invoice, not a table.** The card carries `id="invoice-<id>"`. Its header row (number in mono, client, date, amount, status badge, FIRA badge, RBI days label) and any approval cards and dispute alerts are always visible. Payments, refunds, `RefundForm`, realisation, credit notes and dispute details sit in a `<details>` titled `Details`. A `<details>` inside a table row cannot span the row, and the anchor links must land on visible content. Add a `:target` outline. This replaces FP §4.13's table                                 |
| D11 | Pending state (FP §3.4)        | React 19 transitions. For simple callers, replace the `submitting` state with `const [isPending, startTransition] = useTransition()` (pattern in §4.5). In `ActionButtons`, **add** the transition around each `router.refresh()` and include `isPending` in every `disabled` condition and the reminder guard. Keep `submitting`, `approvalStarted` and the `try/catch` around refresh exactly as they are                                                                                                                                                       |
| D12 | CSS approach                   | Element-level styles restyle every page without markup changes. Default `button` looks secondary; `form button[type="submit"]` looks primary. House classes (§4.4) are added only where a task says. Raw hex appears only in `:root` token definitions. Tones are a `data-tone` attribute, not four classes. Keep every existing `--niryat-*` name and the `.niryat-*` / `.b-cal-event` / `.dashboard-studio` rules                                                                                                                                               |
| D13 | Copy                           | Keep every string that tests, the Phase 6 acceptance strings, `PayPalLoginError`, `ActionButtons`, close `aiLabels` and `DASHBOARD_EMPTY` currently produce, unless §4.6 names its replacement. New strings are exactly those in §4.6                                                                                                                                                                                                                                                                                                                             |
| D14 | Approval titles                | Built only from fields the action or invoice already carries (§4.6). `ApprovalCard` takes a ready-made `title`; pages build it with `approvalTitle` from `lib/status.ts`. No amounts are parsed from `action.payload`. On `/close` and the overview, cards have no facts row, because reminder actions carry no amount or date and the summary's deadlines can be stale                                                                                                                                                                                           |
| D15 | GSTR-1 and advance-tax actions | The download and estimate buttons stay at the end of their forms, because they submit the inputs above them. FP §4.9's header action applies to Invoices (the `New invoice` summary), Monthly close (`CloseButton`), Clients (`Add client` summary), FIRA (none; the upload card comes first) and Health check (`Edit profile`, secondary link)                                                                                                                                                                                                                   |
| D16 | Clients layout                 | One card per client, keeping its five-condition table (results as badges) and the `Edit answers` details. `Add a client` goes in a `<details>`, open only when there are no clients. This replaces FP §4.13's single table                                                                                                                                                                                                                                                                                                                                        |
| D17 | Tooling                        | Add two lines to `apps/web/AGENTS.md` (F0). The next-devtools MCP is added only if the user approves U2. The plan does not depend on it                                                                                                                                                                                                                                                                                                                                                                                                                           |

## 3. Open items for the user (recommended answers are already in §2)

| #   | Question                                                         | Recommended (encoded)                                                                                                                                   | Alternative and its cost                                                                                          | Blocks        |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------- |
| U1  | Should PayPal sign-in also land on `/overview`?                  | Yes: change `auth.ts:71` from `/profile` to `/overview` and update the two expectations at `auth.test.ts:186,195`. It is the only API edit in this plan | Keep `/profile`: email sign-in lands on Today and PayPal sign-in lands on Profile (inconsistent in the video)     | F8            |
| U2  | Add `next-devtools-mcp` to `.mcp.json` and `.codex/config.toml`? | Optional. If yes, pin the exact registry version, record it in `docs/tooling-sources.md`, and check that the Windows `npx` invocation works             | Skip it: agents read the bundled docs and the user pastes dev-server errors                                       | F0 (optional) |
| U3  | Is the GitHub repository public (footer `Source (MIT)` link)?    | Link to `https://github.com/Jaisheesh-2006/Niryat`; the hackathon requires a public repository                                                          | Omit the link until it is public                                                                                  | F5            |
| U4  | Count only reminder approvals in the badge and the Today tile?   | Yes (D7)                                                                                                                                                | Also count proposed `invoice.action` and `refundActions`: the layout must then fetch `/invoices` on every refresh | F5, F8        |
| U5  | Baseline screenshots                                             | The user takes light and dark screenshots of every page before F1, and after F10/F11, for the critique                                                  | Skip the before/after critique                                                                                    | F0, F12       |

## 4. Shared contracts (define once; tasks reference them)

### 4.1 File map

```
app/layout.tsx                 root: html/body, fonts, globals.css, metadata { title: { default: "Niryat", template: "%s · Niryat" }, description }
app/error.tsx                  NEW client, D4
app/not-found.tsx              NEW
app/(public)/layout.tsx        NEW public header + <main id="main"> + SiteFooter variant="public"
app/(public)/page.tsx          moved from app/page.tsx
app/(public)/{login,signup}/page.tsx           moved
app/(public)/disclaimer/page.tsx               NEW
app/(app)/layout.tsx           NEW D3 gate + shell (skip link, top bar, nav aside, <main id="main">, SiteFooter)
app/(app)/loading.tsx          NEW
app/(app)/overview/page.tsx    NEW (+ page.test.tsx)
app/(app)/{profile,health-check,clients,invoices,close,tasks,fira,dashboard,calendar,gstr1,advance-tax}/page.tsx (+ existing tests)   moved
components/icons.tsx           NEW: Icon components + BrandMark
components/{StatusBadge,PageHeader,EmptyState,ApprovalCard,CardBoundary,NavLinks,ApprovalsBadge,SiteFooter}.tsx   NEW
lib/format.ts, lib/status.ts   NEW (+ tests)
lib/calendar.ts                add deadlineList (moved from the calendar page)
packages/shared/src/index.ts   add sessionUserSchema
```

Components stay flat in `components/`, matching the existing convention. The nav groups (FP §3.1) and icons are a `const` array inside `NavLinks.tsx`.

### 4.2 `@niryat/shared`

`sessionUserSchema = z.object({ id: z.uuid(), email: z.email() })`, plus `export type SessionUser`. Web-only consumer; the API's response shape does not change.

### 4.3 `lib/format.ts` (pure; all IST, `en-IN`)

```ts
export function formatDate(value: string): string; // ISO date or datetime → "12 Aug 2026"
export function formatMonth(value: string): string; // "2026-10" | "2026-10-01" → "October 2026"
export function formatDateTime(value: string): string; // ISO datetime → "12 Aug 2026, 14:05 IST" (24-hour)
export function formatMoney(amount: string, currency: string): string; // "1234.5","USD" → "$1,234.50"; "123456","INR" → "₹1,23,456.00"
```

- Dates: `Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })`. A date-only string parses as UTC midnight, which is the same IST day. Datetimes convert to IST. An invalid value throws a `RangeError` (API values are zod-validated, so this is a bug signal).
- Money: pass the **string** to `Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount)`; no `Number()`. Validate `amount` against `/^-?\d{1,15}(\.\d{1,4})?$/` first, else `RangeError("Invalid amount")`; never format `NaN`.
- Build formatters once at module level (immutable, so they are not "mutable module state").

**Tests** (`format.test.ts`, run with `TZ=UTC` stubbed as in `tasks/page.test.tsx`):
1. `formatDate("2026-08-12")` → `12 Aug 2026`.
2. The IST boundary: `2026-10-29T18:29:59Z` → `29 Oct 2026`; `2026-10-29T18:30:00Z` → `30 Oct 2026`; `2026-12-31T18:30:00Z` → `1 Jan 2027`.
3. `formatMonth("2026-10")` and `formatMonth("2026-10-01")` → `October 2026`.
4. `formatDateTime("2026-08-12T08:35:00Z")` → `12 Aug 2026, 14:05 IST`.
5. Money: USD, CAD (`CA$`), AUD (`A$`), EUR, GBP and INR with Indian grouping (`₹1,23,456.00`); 12-digit integer part exact; `"0.5"` → two decimals; `"abc"` and `""` throw.
6. Invalid dates throw.

### 4.4 CSS contract (`globals.css`)

Tokens: every FP §4.2 row, light and dark, plus `--niryat-space-1…8`, radii and shadows (FP §4.5). Dark mode uses `@media (prefers-color-scheme: dark)` only. `--niryat-overdue: var(--niryat-danger)`.

| Selector                                                                                                                   | Purpose (look per FP)                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| element level: `body`, headings, `p`, `a`, `label`, inputs, `button`, `table`, `details`, `pre`, `:focus-visible`          | FP §4.4, §4.11 Forms/Tables. `outline` focus ring, never `box-shadow`. Delete the per-cell borders. Keep `[role="alert"]` danger-strong |
| `.btn` + `data-variant="primary\|secondary\|ghost\|danger"`                                                                | FP §4.11 Buttons; `[aria-busy="true"]` shows the spinner                                                                                |
| `.card`, `.card-header`                                                                                                    | FP §4.11 Cards                                                                                                                          |
| `.badge[data-tone]`                                                                                                        | FP §4.11 Badges; the tone sets the soft/strong token pair and the dot                                                                   |
| `.banner[data-tone]`                                                                                                       | FP §4.11 Banners                                                                                                                        |
| `.suggestion`                                                                                                              | FP §4.11 Claude suggestion block                                                                                                        |
| `.table-wrap`                                                                                                              | `overflow-x: auto` card wrapper                                                                                                         |
| `.num`, `.mono`                                                                                                            | Right-aligned tabular figures; identifiers in mono 13px with `user-select: all`                                                         |
| `.page-header`, `.empty-state`, `.stat-grid`, `.stat-tile`, `.overview-grid`                                               | FP §4.9, §4.11, §4.13 overview                                                                                                          |
| `.app-shell`, `.topbar`, `#nav-menu`, `.nav-item`, `.nav-group`, `.sandbox-pill`, `.skip-link`, `.site-footer`, `.content` | FP §4.6–4.10; D6                                                                                                                        |
| `.spinner`, `.skeleton`, `.visually-hidden`                                                                                | FP §4.5 motion; stops under `prefers-reduced-motion: reduce`                                                                            |
| `.form-grid`                                                                                                               | Pairs short fields from 640px                                                                                                           |
| `.content:has(.dashboard-studio, .calendar-card)`                                                                          | Full-width pages (replaces `main:has(.dashboard-studio)`)                                                                               |

### 4.5 Component and helper contracts

```ts
type Tone = "success" | "attention" | "danger" | "neutral";
StatusBadge({ tone, children, busy }: { tone: Tone; children: ReactNode; busy?: boolean }) // busy → spinner + aria-busy
PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) // renders the page's only <h1>
EmptyState({ icon, title, children, action }: { icon: ComponentType; title: string; children: ReactNode; action?: ReactNode })
ApprovalCard({ action, title, kind, facts }: {
  action: Action; title: string; kind?: string;
  facts?: readonly { label: string; value: ReactNode }[];
}) // server component: frame (left edge by data-status), badge from actionTone(action.status), H3 title, facts <dl>, then <ActionButtons action={action} />
CardBoundary // catchError(fallback); props { title: string; quiet?: boolean } — quiet renders nothing (badge)
NavLinks({ badge }: { badge: ReactNode }) // client; usePathname; aria-current="page" when pathname === href or startsWith(href + "/"); closes #nav-menu on pathname change only if it matches(":popover-open")
ApprovalsBadge() // async server: apiGet("/close") → proposed count; renders nothing at 0
SiteFooter({ variant }: { variant: "app" | "public" })
// lib/status.ts — label + tone for enums shown on two or more pages
invoiceStatus: Record<InvoiceStatus, { label: string; tone: Tone }>   // labels = current invoices page statusLabels
invoiceFira:   Record<FiraStatus, { label: string; tone: Tone }>      // labels = current firaLabels
actionTone(status: ActionStatus): Tone; actionStatusLabel(status): string
approvalTitle(input: { action: Action; invoiceNumber: string; clientName?: string }): string  // §4.6
// lib/calendar.ts
deadlineList(events: readonly CalendarEvent[], upcomingLimit: number): CalendarEvent[] // all overdue, then the next N upcoming, sorted by date then id (moved unchanged from calendar/page.tsx)
```

Enums shown on one page only keep their label maps on that page, with tones beside them.

**Pending pattern (D11).** Shown once; it is the subtle part:

```ts
startTransition(async () => {
  const result = await sendJson(url, "POST", body);
  if (!result.ok) {
    setMessage(result.message);
    return;
  }
  startTransition(() => router.refresh()); // after an await, React needs the inner wrap to keep the refresh in this transition
});
```

`isPending` stays true until the refreshed server props commit. Confirm this "updates after await" caveat against the React 19 docs (Context7) before implementing. `CloseButton` keeps its `pending` ref (double-click guard) and its `Closing…` label while `isPending`.

### 4.6 Exact new strings

| Where                                                      | Text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nav (in order; group labels uppercase in CSS, not in text) | `Today`; group `Set up`: `Profile`, `Health check`, `Clients`; group `Bill and get paid`: `Invoices`; group `Close the month`: `Monthly close`, `Tasks`, `FIRA`; group `Reports`: `Dashboard`, `Calendar`, `GSTR-1`, `Advance tax`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Shell                                                      | Skip link `Skip to content`; pill `Sandbox`; menu button `Menu`; brand link label `Niryat`, linking to `/overview`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Badge (visually hidden)                                    | `1 approval waiting` / `<n> approvals waiting`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| App footer (joined by `·`)                                 | `PayPal sandbox only` · `Not tax or legal advice` · `Rules checked against primary sources, not reviewed by a CA` · `Disclaimer` (→ `/disclaimer`) · `Source (MIT)` (→ repository, U3). Public footer appends ` · Built for the PayPal AI Hackathon 2026`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Error (`app/error.tsx`)                                    | H2 `Couldn't load this page`; `Niryat couldn't reach its server. Nothing was sent to PayPal.`; buttons `Try again` (`retry`), `Go to Today` (link `/overview`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Card fallback                                              | `Couldn't load this card. Nothing was sent to PayPal.` with a ghost button `Try again`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Not found                                                  | H1 `Page not found`; `This page doesn't exist or has moved.`; link `Go to Today`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Loading                                                    | Visually hidden `Loading`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Empty states                                               | Invoices: `No invoices yet` / `Paste a client email and Claude fills in the invoice for you.` Approvals (close and overview): `Nothing to approve` / `Niryat proposes PayPal reminders here when a deadline gets close.` (replaces `No PayPal actions to approve.`) Dashboard: `Nothing to chart yet` / the existing `DASHBOARD_EMPTY` text. Tasks: `No open tasks` / `Niryat adds tasks when a refund, dispute, FIRA or deadline needs you.`                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Approval titles (`approvalTitle`)                          | `send_invoice`: `Send invoice <number> to <client> through PayPal`. `create_recurring_series`: `Start the PayPal recurring series for invoice <number>`. `refund_payment`: `Refund a payment on invoice <number> through PayPal`. `send_invoice_reminder`: `Send PayPal's standard reminder for invoice <number>`, with kind `Reminder · <stage>-day stage` (stage via `reminderStageSchema.parse`, as the pages do now). Footer caption on proposed cards: `Nothing is sent to PayPal until you approve.` Suggestion label: `Suggestion from Claude`                                                                                                                                                                                                                                                                                                                                            |
| Close button                                               | `Run monthly close` (replaces `Close this month`; `Closing…` stays)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Close sections                                             | H2s `What to do first`, `Waiting for your approval`, `Needs attention` (replaces the H3 `Reminder attempts needing attention`; danger banner text `Check PayPal before taking further action.`), and `<details>` summary `History` (holds `Earlier reminders` and `Runs`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Overview                                                   | H1 `Today`, description = `formatDate(now)`. Tiles: `Approvals waiting` (`Review in Monthly close`); `Next deadline` (value `formatDate(date)`, sub = event title; `None scheduled` when there is none; when k > 0 overdue, a danger badge `<k> overdue`); `Health score` (`<score> / 100`, sub `<n> high-priority flags` / `No high-priority flags`; no profile → value `—`, sub `Complete your profile`, link `/profile`); `Open tasks` (`View tasks`). Cards: `Waiting for your approval` (link `All approvals`), `Upcoming deadlines`, `Recent invoices` (link `All invoices`)                                                                                                                                                                                                                                                                                                               |
| Public home                                                | H1 `Run your export business on PayPal. Niryat keeps it legal in India.`; lead `GST-ready invoices, FIRA matching, RBI deadlines and advance tax, built from your PayPal activity. You approve every action.`; buttons `Create account` (→ `/signup`), `Log in with PayPal` (→ `/api/auth/paypal/start`); header `Sign in` (→ `/login`). H2 `How it works`, steps: `Sign in` / `With PayPal: health check, purpose code and LUT.`; `Bill` / `PayPal invoices, one-time or recurring.`; `Get paid` / `PayPal webhooks record fee, net and FX.`; `Handle changes` / `PayPal refunds and disputes update GST and RBI status.`; `Close the month` / `FIRA matching, GSTR-1 data, advance tax and PayPal reminders.` (no "milestone": unavailable for India sellers, spec 04). Trust cards: `You approve every PayPal action`, `Rules cite primary sources`, `Sandbox only; nothing is filed for you` |
| Login/signup                                               | Divider `or`. The PayPal link text stays `Log in with PayPal`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Disclaimer                                                 | H1 `Disclaimer`; body = PLAN §23 verbatim, as paragraphs. Keep it in sync with PLAN                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### 4.7 Tests whose assertions will change (update the assertion; keep the intent)

| Test                                                                       | Current assertion                                     | Change in                                                           |
| -------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| `index.test.tsx` home                                                      | `<h1>Niryat</h1>`; imports `./app/page`               | F4 (path), F9 (headline; keep the signup and login href checks)     |
| `tasks/page.test.tsx`                                                      | `2026-10-29` etc. (`en-CA`)                           | F4 (paths), F11 (`29 Oct 2026` …; keep all four IST boundary cases) |
| `ActionButtons.test.tsx:420`                                               | `<h2>${label}</h2>` from the tasks page               | F11 (label in a table cell)                                         |
| `ActionButtons.test.tsx:498`                                               | `<dt>Receive full payment by</dt><dd>2026-10-30</dd>` | F10 (formatted date; label unchanged)                               |
| `ActionButtons.test.tsx:396`                                               | `No PayPal actions to approve.`                       | F10 (`Nothing to approve`)                                          |
| `ActionButtons.test.tsx:248–257`                                           | `CloseButton` labels                                  | F6/F10 (`Run monthly close`; `Closing…` unchanged)                  |
| `calendar/page.test.tsx:57`                                                | `<time dateTime="2026-11-01">2026-11-01</time>`       | F11 (`1 Nov 2026` text, same `dateTime`)                            |
| `gstr1/page.test.tsx:110` and its element-tree walks                       | `<h2>${label}</h2>`, child structure                  | F11 (keep the `<h2>` class-free; adjust the tree walks)             |
| React hook mocks in `ActionButtons`, `ClientForm` and `CalendarView` tests | `useState`/`useRef`/`useEffect` cursor                | F6 (add `useTransition: () => [false, (fn) => fn()]`; reset as now) |
| All page tests                                                             | `vi.mock("../../lib/api")` / `../../lib/env` paths    | F4 (one more `../`)                                                 |

## 5. Rules for every task (give these to the model with each task)

- Read root `AGENTS.md` (Golden rules, Design (LLD)) and `apps/web/AGENTS.md` before editing. Before using a Next API, read its file under `apps/web/node_modules/next/dist/docs/`. Check React 19, AG Studio and Bryntum APIs with Context7; the installed version wins.
- **Restyle only.** Do not change data fetching, endpoints, request bodies, zod schemas, `sendJson` or approval logic, except where a task says so (F5 `/auth/me`, F6 transitions, F8 landing, U1).
- Visual values come from FP §4 and the §4.4 tokens. No raw hex, inline colour or `style` outside `globals.css`, except the dynamic `width` on the health progress bar.
- No new dependency. No `any`, no `as` on external data, no `!` on external data. TypeScript strict.
- Accessibility (FP §3.5): one `<h1>` per page; a text label on every status; `aria-current`; visible `outline` focus; `aria-describedby` on field errors where the component already shows them; `prefers-reduced-motion`; existing `role="alert"` stays.
- Nothing new reaches the browser except the account email. AG Studio and Bryntum imports stay in `Dashboard.tsx`, `CalendarView.tsx` and their `lib/` adapters; the shell and layouts must not import them.
- Keep the D13 strings. When a task changes a §4.7 assertion, change only that assertion and say so in the commit.
- No browser checks, MCP browser tools or dev-server screenshots by the agent. Hand the §8 manual checks to the user in F12.
- Touch only the files a task lists. If another file must change, stop and say why. Quote paths with parentheses in the shell (`'apps/web/src/app/(app)'`).
- **Final checks run only in F12 (user decision, 2026-11-01).** Defer formatting commands, test runs, lint/typechecks, `pnpm verify`, `pnpm build`, import-graph checks and user browser checks until F12; do not run them during F0–F11. Implement each task's specified tests with its code, but report validation as pending until F12. Use `corepack.cmd pnpm` on restricted PowerShell.
- Keep one commit per task when commits are requested. Tick no spec checkbox: this work has no spec criteria.

## 6. Prerequisites

- Keep unrelated work separate and retain any recorded baseline check results. New validation runs are deferred to F12.
- **(user)** U1–U4 answered, or the recommended answers accepted; U5 baseline screenshots taken.

## 7. Tasks (in order)

```
F0 tooling ─→ F1 tokens/CSS ─→ F2 format/status libs ─→ F3 icons + small components ─┐
                         F4 route-group move (pure) ─────────────────────────────────┴→ F5 shell + error/loading ─→ F6 pending ─→ F7 approval card ─┬→ F8 overview
                                                                                                                                                    ├→ F9 public pages
                                                                                                                                                    ├→ F10 demo-path pages
                                                                                                                                                    └→ F11 other pages ─→ F12 pass + docs
```

F2, F3 and F4 are independent after F1. F8–F11 can run in parallel after F7.

**Estimates and cut line.** F0–F5: about 2 days (Nov 1–3). F6–F7: 0.75 days. F8–F10: 1.5 days (by Nov 5). F11: 0.75 days. F12: 0.5 days. **If F10 is not done by Nov 6, ship F0–F10 and skip F11**: those pages keep the F1 restyle and the F2 formatting only where F4/F5 already touched them. Phase 7 needs Nov 5–8 in parallel; do not delay it for F11.

---

### F0: Tooling and baseline

**Files:** `apps/web/AGENTS.md`. With U2 approval only: `.mcp.json`, `.codex/config.toml`, `docs/tooling-sources.md`.

**Steps**
1. Add to `apps/web/AGENTS.md`: "Before using a Next.js API, read its guide in `node_modules/next/dist/docs/` (version-matched)." and "Visual design source of truth: docs/frontend-plan.md §4; implementation order and contracts: docs/frontend-refactor-plan.md."
2. With U2 approval: add the `next-devtools` server, pinned to an exact version, to both configs, and record the version and date in tooling-sources.
3. **(user)** Baseline screenshots (U5).

**Done when:** the tooling edits are implemented. Validation is deferred to F12.

---

### F1: Tokens, fonts and element-level restyle

**Files:** `app/globals.css`, `app/layout.tsx` (fonts and metadata template only; the nav stays until F5).

**Requirements**
- All of §4.4: every FP §4.2 token, light and dark, keeping the old names. The FP §4.4 type scale, including mobile sizes under 640px. FP §4.5 spacing, radius, elevation and motion. Element-level styles for every native element the pages use. All the house classes in §4.4 (they are unused until later tasks, but define them now so the visual system lives in one file and one commit).
- The fonts per D1 on `<html className>`. Body uses `var(--niryat-font-sans), system-ui, sans-serif`; `.mono`, `pre` and `code` use `var(--niryat-font-mono), ui-monospace, monospace`.
- `metadata.title = { default: "Niryat", template: "%s · Niryat" }`.
- Keep the calendar and dashboard rules working. `main` keeps a sensible max width until F5 replaces it with `.content`.
- Re-measure contrast for any token value you change (FP §4.2 lists the measured pairs). With no changes, the FP ratios stand.

**Done when:** F1 requirements are implemented without changing web tests. Validation and the user's two-page light/dark spot-check are deferred to F12.

---

### F2: Formatting and status libraries

**Files:** create `lib/format.ts` and `format.test.ts`, `lib/status.ts` and `status.test.ts`.

**Requirements:** §4.3 and §4.5 (`lib/status.ts` part, with D8 tones). `invoiceStatus` / `invoiceFira` labels are copied verbatim from the current invoices page maps. `approvalTitle` produces exactly the §4.6 strings.

**Tests:** §4.3 tests 1–6. `approvalTitle` for all four `paypalAction`s, including the stage caption. `actionTone` for all five statuses matches FP §4.3. The invoice maps cover every enum value (type-level `Record` plus one runtime check).

**Done when:** the libraries and specified tests are implemented; no page uses the libraries yet. Validation is deferred to F12.

---

### F3: Icons and small shared components

**Files:** create `components/icons.tsx`, `StatusBadge.tsx`, `PageHeader.tsx`, `EmptyState.tsx`, `CardBoundary.tsx`.

**Requirements**
- Icons: the FP §4.12 table plus `BrandMark` (a 28px primary square with a saffron up-right arrow). Check each name against Lucide at copy time. Each icon is `aria-hidden="true"`, uses `currentColor` and a 1.5 stroke, and takes a `size` prop (default 16). Keep the ISC licence comment.
- Components per §4.5. `CardBoundary` uses `catchError` from `next/error` (read `04-functions/catchError.md` first). Its fallback is the §4.6 card fallback with `retry`; with `quiet`, it renders `null`. It never renders the error.

**Tests:** `StatusBadge` renders its text and `data-tone`; with `busy`, it renders the spinner and `aria-busy`. `PageHeader` renders exactly one `<h1>`. One test that `CardBoundary`'s fallback text contains no error message (render the fallback function directly).

**Done when:** the components and specified tests are implemented. Validation is deferred to F12.

---

### F4: Route-group move (no visual change)

**Files:** `git mv` per §4.1: the three public routes into `app/(public)/` and the 11 app routes into `app/(app)/`, with their colocated tests. Fix relative imports in the moved pages and tests, `components/ActionButtons.test.tsx` (`../app/(app)/…`), `components/PayPalLoginError.test.tsx` (`../app/(public)/…`) and `index.test.tsx` (`./app/(public)/page`).

**Requirements:** no layout files yet, no markup change and no URL change. `vi.mock` paths must match the paths the moved pages import.

**Done when:** the route move preserves existing URLs, markup and test assertions. In F12, compare existing test and route coverage with the pre-move baseline, accounting for additions required by later tasks.

---

### F5: App shell, auth gate, error and loading

**Depends on:** F1, F3, F4.

**Files:** `packages/shared/src/index.ts` (+ test) for §4.2; `app/layout.tsx` (remove the nav and `<main>`); create `app/(app)/layout.tsx`, `app/(public)/layout.tsx`, `app/(app)/loading.tsx`, `app/error.tsx`, `app/not-found.tsx`, `components/NavLinks.tsx` (+ test), `ApprovalsBadge.tsx`, `SiteFooter.tsx`; `components/SignOutButton.tsx` (restyle as a ghost `.btn` with the `log-out` icon; logic unchanged).

**Requirements**
- D3, D4, D5 (badge), D6 and D7; FP §4.6–4.10 visuals.
- `(app)/layout.tsx` structure: skip link → top bar (BrandMark, wordmark, Sandbox pill, Menu button) → `<aside id="nav-menu" popover="auto">` (brand row, pill, `<NavLinks badge={<CardBoundary title="Approvals" quiet><Suspense fallback={null}><ApprovalsBadge /></Suspense></CardBoundary>} />`, account block with the email (with `title` holding the full value) and `SignOutButton`) → `.content` with `<main id="main" tabIndex={-1}>` and `SiteFooter variant="app"`.
- `(public)/layout.tsx`: the FP §4.13 public header, `<main id="main">`, and `SiteFooter variant="public"`.
- `loading.tsx`: the FP §4.11 skeleton, with `aria-busy="true"` and the hidden `Loading` text. `error.tsx` and `not-found.tsx`: §4.6 strings. `error.tsx` passes `retry` to `Try again`.
- No page markup changes in this task.

**Tests:** `NavLinks` (mock `next/navigation`'s `usePathname`): `/invoices` marks only Invoices `aria-current="page"`; `/invoices/x` too; `/overview` marks Today; group labels and item order match §4.6; the badge slot renders next to Monthly close. `ApprovalsBadge`: count 0 renders nothing; 2 renders the visible `2` and the hidden `2 approvals waiting`; 1 is singular; only `proposed` statuses are counted. Shared: `sessionUserSchema` rejects a missing email.

**Done when:** the shell, auth gate and specified web/shared tests are implemented. Validation is deferred to F12, including the import-graph check: no file under `app/(app)/layout.tsx`'s imports reaches `ag-studio` or `@bryntum`.

---

### F6: Pending state through transitions

**Files:** `components/ActionButtons.tsx`, `ClientForm.tsx`, `InvoiceForm.tsx`, `RefundForm.tsx`, `FiraUpload.tsx`, `FiraLineButtons.tsx`, `TaskDoneButton.tsx`, `CloseButton.tsx`; the React mocks in `ActionButtons.test.tsx`, `ClientForm.test.tsx` and `CalendarView.test.tsx` (only if `CalendarView` renders a transition consumer).

**Requirements:** D11 and the §4.5 pattern. Labels shown while pending (`Proposing…`, `Reading…`, `Saving…`, `Closing…`) now key off `isPending`. Client-side validation messages in `FiraUpload` stay synchronous and outside the transition. `ActionButtons`: every existing test still passes with only the mock extended. The reminder path still never permits a second approval attempt from stale `proposed` props.

**Tests:** add one test (in `ActionButtons.test.tsx`, using its hook cursor) showing a simple caller's button is `disabled` while `isPending` is true (mock `useTransition` to return `[true, fn]`). Existing reminder tests unchanged.

**Done when:** the transition changes and specified tests are implemented. Validation is deferred to F12.

---

### F7: Approval card

**Depends on:** F2, F3, F6.

**Files:** create `components/ApprovalCard.tsx`; `components/ActionButtons.tsx` (restyle and focus only); `ActionButtons.test.tsx` (new assertions only).

**Requirements**
- `ApprovalCard` per §4.5 and FP §4.13: the left edge is accent while `proposed` and danger when `failed`. `done`/`rejected` collapse to one line (badge, title, `formatDate(action.createdAt)`).
- `ActionButtons`, restyle only: buttons become `.btn` (Approve `primary`, `danger` for `refund_payment`; Reject `secondary`). The JSON goes in a ghost-summary `<details>`. Advice renders in a `.suggestion` block labelled `Suggestion from Claude`, keeping the existing sentences inside it. The `Waiting for your approval` text moves into the card's badge, so do not render it twice in one card. Banners for the failed and unknown-outcome texts. All existing strings stay.
- Focus: once a decision was made in this instance, move focus (`tabIndex={-1}`) to the outcome text when the status changes or an error message appears. Never move focus on first render.

**Tests:** the card shows a `data-status`-driven edge; the refund approve button uses the danger variant; done/rejected render the compact line; existing tests still pass.

**Done when:** the approval card, button changes and specified tests are implemented. Validation is deferred to F12.

---

### F8: Today (`/overview`) and sign-in landing

**Depends on:** F5, F7.

**Files:** create `app/(app)/overview/page.tsx` and `page.test.tsx`; `lib/calendar.ts` (+ test: `deadlineList`); `app/(app)/calendar/page.tsx` (use `deadlineList(events, 10)`, same output); `components/AuthForm.tsx` (`router.push("/overview")`). With U1: `apps/api/src/routes/auth.ts:71` and `auth.test.ts:186,195`.

**Requirements**
- FP §4.13 overview layout and §4.6 strings. Four stat tiles and three cards. Each one is its own async server component in the page file, inside `<CardBoundary title="…"><Suspense fallback={skeleton}>`. Endpoints: approvals `/close` (D7; at most 3 `ApprovalCard`s, plus `All approvals` → `/close`; empty state otherwise); deadlines `/calendar` → `deadlineList(events, 5)` as a table (date, linked title, state badge per FP §4.3); health `/health-check` (`null` → the no-profile tile); tasks `/tasks` (open count); invoices `/invoices` (first 5: number in mono linking to `/invoices#invoice-<id>`, client, date, amount `.num`, status badge).
- The approvals tile has a 3px accent edge when the count is above 0. The health tile tone is per D8. No new API endpoint.
- `export const metadata = { title: "Today" }`.

**Tests** (mock `apiGet` per path): tile values for typical data; no-profile health tile; zero approvals shows the empty state and no accent edge; overdue count badge; recent invoices are capped at 5 in API order; `deadlineList` keeps all overdue events plus N upcoming. Use fake timers for the header date.

**Done when:** the overview, landing changes and specified tests (including API tests with U1) are implemented. Validation is deferred to F12.

---

### F9: Public pages

**Depends on:** F5.

**Files:** `app/(public)/page.tsx`, `login/page.tsx`, `signup/page.tsx`, create `disclaimer/page.tsx`; `components/AuthForm.tsx` and `PayPalLoginError.tsx` (classes only; the error renders as a danger `.banner` with the same text and `role="alert"`); `index.test.tsx` (§4.7).

**Requirements:** FP §4.13 public blueprints and the §4.6 strings. Login and signup: a centred 400px card, a full-width primary submit, the `or` divider, the PayPal link styled as a full-width secondary `.btn` (an `<a>`, still `href="/api/auth/paypal/start"`), and the switch link at the bottom. Keep `method="post"`, field names and `autoComplete` (tested). Remove the `appName` import from home if it becomes unused, and delete `src/index.ts` only if nothing imports it. Set `metadata` titles: `Sign in`, `Create account`, `Disclaimer`.

**Tests:** home has the headline `<h1>` and the `/signup`, `/login` and PayPal hrefs; disclaimer contains the PLAN §23 sentences; existing login, signup and PayPal error tests pass.

**Done when:** the public-page changes and specified tests are implemented. Validation is deferred to F12.

---

### F10: Demo-path pages (health check, invoices, monthly close, FIRA)

**Depends on:** F7. It may be split into one commit per page.

**Files:** `app/(app)/{health-check,invoices,close,fira}/page.tsx`; `components/{ExtractPanel,InvoiceForm,RefundForm,FiraUpload,FiraLineButtons,CloseButton}.tsx` (classes and markup wrappers only); the §4.7 assertions for these pages.

**Requirements** (FP §4.13 per page; D9 formatting throughout; `PageHeader` and `metadata.title` on each page):
- **Health check:** the score card (Display score, an 8px bar with `role="img"` and `aria-label="Health score <score> out of 100"`, `Checked on <formatDate>`). Flags sorted high → medium → low, each with a severity badge, the message, a citation line (rule ID in `.mono`) and the note. Purpose code in mono 20/600 with its label, the reason in a `.suggestion` block, and the note. Header action: `Edit profile` (secondary link).
- **Invoices:** D10 cards. `New invoice` `<details>` holding `ExtractPanel`, open when there are no invoices; the invoices empty state when there are none. Approval cards via `ApprovalCard` with `approvalTitle` and facts (Amount, Invoice date, RBI deadline via `daysRemainingLabel`). This includes `invoice.action`, `refundActions` and the reminder approvals currently joined from `/close`. Dispute alerts stay visible with `role="alert"`. The payments and refunds tables keep their columns, with money as `.num`, IDs as `.mono` and `formatDateTime` for `receivedAt`. Keep the `RefundForm` visibility condition exactly. Citations keep the `Rule <id>: <source>. Verify with your CA.` text.
- **Monthly close:** `CloseButton` in the header actions. The running state shows a neutral banner with a spinner, the existing text and `CloseRefresher`. `What to do first` is an ordered list with saffron-outlined number circles and the `Priorities suggested by Claude.` caption. Then `Waiting for your approval` (cards or the empty state), `Needs attention` (danger banner plus cards; omit the section when empty), the summary (same data, as cards and tables), and `History`. Every existing summary string and the `aiLabels` stay.
- **FIRA:** the upload card first (file input styled through `::file-selector-button`, consent checkbox, primary submit). Per document, a card headed `FIRA for <formatMonth>` with `Uploaded <formatDate>`. The lines table: date, amount, reference (`.mono`, plus the source-text details), purpose code, match, a state badge (D8), a `Reason` column (`line.note`), confidence and actions. The flagged line must be readable at 1440px without horizontal scroll.

**Tests:** the §4.7 assertions for these pages; the invoice card keeps `id="invoice-<id>"`; the `New invoice` details is open only with zero invoices; flags are sorted; the health bar's aria-label; the FIRA flagged-line badge and reason.

**Done when:** the demo-path page changes and specified tests are implemented. Validation is deferred to F12.

---

### F11: Remaining pages (cuttable; see the cut line)

**Depends on:** F7.

**Files:** `app/(app)/{tasks,clients,profile,calendar,dashboard,gstr1,advance-tax}/page.tsx`; `components/{ClientForm,ProfileForm,Gstr1Download,TaskDoneButton,Dashboard,ComplianceCalendar}.tsx` (classes, wrappers and theme params only); the §4.7 assertions for these pages.

**Requirements** (FP §4.13; D9; `PageHeader`; `metadata.title`):
- **Tasks:** a table (due date, task label plus message, source rule `.mono`, status badge per D8, actions: `Open invoice` link and `TaskDoneButton` as a ghost button). Empty state when nothing is open. Completed tasks in `<details>`, with `formatDate(doneAt)`.
- **Clients:** D16. Country via `Intl.DisplayNames`, as now.
- **Profile:** one form split into `<fieldset class="card">` sections (Business; GST and LUT; Work and purpose code), with short fields paired using `.form-grid`. Names, ids, options and selection behaviour are unchanged (`index.test.tsx` covers them).
- **Calendar:** legend items as badges (keep the text and the `niryat-*` classes); Bryntum inside a full-width `.card.calendar-card`; the deadline list as a table with `formatDate` text.
- **Dashboard:** a header description `Ask Claude a question in plain English, or explore the widgets. Figures come from your PayPal records.`; AG Studio in a card; the empty state per §4.6. Add `backgroundColor: "var(--niryat-surface)"`, `foregroundColor: "var(--niryat-text)"` and `chartAxisLineColor: "var(--niryat-muted)"` to `withParams` only if the installed types accept them (typecheck), and `fontFamily` only if its type accepts a CSS string. Change the series palette only if the 3.0.0 theme API exposes one, using FP §4.2 chart order; otherwise skip it and note that.
- **GSTR-1 and advance tax:** D15. Forms in cards; tables with `.num`; totals rows at weight 600 with a 2px top border; every Phase 6 string unchanged; `formatMoney` / `formatDate` per D9 (advance tax's `inr()` is deleted; null still shows `Not available`).

**Tests:** the §4.7 assertions; the tasks IST boundary cases with the new format; GSTR-1 and advance-tax tests still find every Phase 6 string.

**Done when:** the remaining page changes and specified tests are implemented. Validation is deferred to F12.

---

### F12: Accessibility, dark mode, mobile and docs pass

**Files:** fixes in any F1–F11 file; `apps/web/AGENTS.md` (route groups, the shell, `lib/format.ts`); `docs/architecture.md` (only if it describes web routing or the nav); `docs/frontend-plan.md` (apply this plan's corrections: `retry` and the error location (D4), email always present, the single nav and no top-bar badge (D6), the task tone (D8), invoice and client cards (D10, D16), money as a function (D9), header actions (D15)); this plan's status line.

**Steps**
1. Review the diff with `design:accessibility-review` against FP §3.5 and `design:ux-copy` against FP §4.15. Fix the findings.
2. Check the import graph (F5 Done when) and the preserved route/test coverage (F4 Done when).
3. Reduced-motion: the spinner and skeleton stop; their text labels remain.
4. Hand the §8 checklist to the user. Report it as awaiting user verification.

**Done when:** run `pnpm format`, `pnpm --filter @niryat/web test`, `pnpm --filter @niryat/shared test`, API tests with U1 (`pnpm --filter @niryat/api test`), `pnpm verify` and `pnpm build`, in that order. All automated checks pass, all F0–F11 acceptance targets are satisfied, and the docs match the shipped behaviour. Apply D1 if Google Fonts still cannot be fetched. The phase exit gate remains open until the user confirms §8.

## 8. Manual checks for the user (browser, F12 only)

Start the API and web as usual (`pnpm dev`, or separate API and web terminals; web http://localhost:3000, API :3001). Sign in with a sandbox account that has invoices, a FIRA and a pending reminder.
- [ ] Logged out, `/` shows the public page with no app chrome; `/invoices` redirects to `/login`.
- [ ] Email sign-in lands on `/overview` (PayPal sign-in too, with U1). Each card loads independently. The approvals tile, the sidebar badge and the `/close` waiting list show the same count.
- [ ] The sidebar highlights the current page; the Sandbox pill and footer lines appear on every app page; `Disclaimer` opens the PLAN §23 text.
- [ ] Stop the API and reload any app page: the error card appears (not Next's default), and `Try again` works after restarting the API.
- [ ] Approve a reminder: the button stays disabled until the new status shows, focus moves to the outcome text, and the badge count drops.
- [ ] Amounts read `$1,234.00` / `₹1,23,456.00`, with aligned digits in tables. Dates read like `12 Aug 2026` everywhere (September shows as `Sept`). `₹` renders properly in Plex or a fallback font.
- [ ] A calendar or task link to `/invoices#invoice-<id>` scrolls to a visible, outlined invoice card.
- [ ] Every badge has a text label; the Claude suggestion block is visibly distinct from facts.
- [ ] In light mode on `/calendar`, the `Past` legend text uses the muted token and meets 4.5:1 contrast against the page background.
- [ ] On `/profile`, `/clients` and `/invoices`, radio labels sit beside their controls; clicking a label selects its control.
- [ ] On `/invoices`, paste six lines into `Client email or brief`: all six fit before scrolling, and vertical resizing works.
- [ ] Dark mode (OS setting): text, badges, AG Studio and the Bryntum frame are legible.
- [ ] With the OS reduced-motion setting enabled, spinners and skeletons stop animating and their text labels remain.
- [ ] At 390px wide: `Menu` opens the nav sheet; choosing a link closes it; Escape and a backdrop click close it; tables scroll inside their card; nothing scrolls the page sideways.
- [ ] Keyboard only: the skip link, nav, forms and approval buttons are reachable, with a visible focus ring.
- [ ] Run the full PLAN §16 demo script at 1440×900 in light mode.

## 9. Coverage check against the frontend plan

| FP item                                                                                       | Task                             |
| --------------------------------------------------------------------------------------------- | -------------------------------- |
| §3.1 IA and groups; §3.2 route groups, gate, loading/error/not-found, overview, titles, fonts | F4, F5, F8, F1                   |
| §3.3 shared components (`Money` → `formatMoney`, D9)                                          | F2, F3, F5, F7                   |
| §3.4 approval behaviour (transitions, focus, summary from carried fields)                     | F6, F7 (D11, D14)                |
| §3.5 quality bars                                                                             | §5 rules, F5 import check, F12   |
| §4.2–4.5 tokens, tones, type, spacing                                                         | F1, F2 (D8)                      |
| §4.6–4.10 layout, sidebar, top bar, header, footer                                            | F5 (D6), F3                      |
| §4.11 components; §4.12 icons                                                                 | F1 (CSS), F3, F7                 |
| §4.13 blueprints                                                                              | F8, F9, F10, F11 (D10, D15, D16) |
| §4.14 sponsor widgets                                                                         | F11                              |
| §4.15 voice; §4.16 video                                                                      | §4.6 strings, F12; §8 last item  |
| §5 slices and cut line                                                                        | §7 order and cut line            |
| §6 tooling                                                                                    | F0 (U2)                          |
| §7 manual checks                                                                              | §8                               |
