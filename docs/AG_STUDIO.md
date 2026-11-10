# AG Studio in Niryat

Niryat is our entry for **Best Use of AG Grid**. It uses [AG Studio](https://www.ag-grid.com/studio/), AG Grid's embeddable dashboard product (`ag-studio` and `ag-studio-react` 3.0.0).

## Summary for reviewers

Indian freelancers paid through PayPal must collect payment proof (FIRA) for every foreign receipt and get each export invoice paid within the RBI deadline. They also pay PayPal fees and exchange-rate costs that they rarely see in one place. Niryat reads the freelancer's PayPal sandbox ledger and puts those figures into **two AG Studio dashboards**. The **AG Studio AI Assistant**, powered by Claude through our own adapter, answers plain-English questions by building new widgets.

### See it in two minutes

1. Open https://niryat-web.onrender.com and click **Try as freelancer (demo)**. Then open **Dashboard** (`/dashboard`).
2. The page opens with eight widgets built from the freelancer's PayPal payments, refunds, disputes and invoices, beside the open AI Assistant (the Filters, Compose and Data panels start collapsed). Pick a starter, such as _"Which unpaid invoices are closest to their RBI deadline?"_. Claude replies by adding or changing a widget, not with a paragraph of numbers.
3. Click a client in the **Filter by: Client** row. Every widget narrows to that client, including payment, refund and dispute widgets that come from other sources. Ask _"What is a FIRA?"_: Claude calls Niryat's own `explain_term` tool and answers from the app's glossary.
4. Reload the page. The filter, and any widget you or Claude added, are still there. **Reset layout** restores the default.
5. Sign out, click **Try as CA (demo)** and open `/ca`. A chartered accountant sees the same tools across three freelancer clients who shared their records.

All records are synthetic sandbox data. Nothing on these pages sends money or calls PayPal on its own.

### What we built with AG Studio

| Dashboard                | Who uses it                                                                     | Widgets (AG Studio type)                                                                                                                                                                                                                                                                                                         | Code                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Freelancer, `/dashboard` | The freelancer, about their own PayPal income                                   | Client filter (`button-filter`). Income by month and currency, PayPal fees by month and currency, invoices by payment-proof status, disputes by status (`column-chart-grouped`). Health score (`value`). Unpaid invoices sorted by days to the RBI deadline, payments with and without a PayPal exchange rate, refunds (`grid`). | [Dashboard.tsx](../apps/web/src/components/Dashboard.tsx), [dashboard.ts](../apps/web/src/lib/dashboard.ts)           |
| CA portfolio, `/ca`      | A chartered accountant, across the freelancers who accepted their share request | Freelancer filter (`button-filter`). Clients sorted by overdue count (`grid`). PayPal fees by freelancer and currency, missing payment proof by freelancer (`bar-chart-grouped`). Received per month by freelancer (`column-chart-stacked`). The ten unpaid invoices nearest their RBI deadline (`grid`).                        | [CaDashboard.tsx](../apps/web/src/components/CaDashboard.tsx), [ca-dashboard.ts](../apps/web/src/lib/ca-dashboard.ts) |

### AG Studio features we use

- **React embedding:** `AgStudioProvider` and `AgStudio`, opened in `mode="edit"`, so users can move, resize, retitle and add widgets themselves. The initial `panels` state collapses the Filters, Compose and Data panels so the widgets have room; the AI Assistant starts open.
- **Typed data sources** (`AgDataSourcesDefinition`): four freelancer sources (payments, invoices, disputes, health) and the CA's portfolio sources. Every field has a readable name and an AG Studio format (`decimalFormat`, `dateFormat`, `integerFormat`, `textFormat`), so the assistant sees business terms such as "Amount after fees" and "RBI deadline".
- **Declarative report state** (`AgReportState`): pages, widgets, data mapping (`categoryKey`, `valueKey`, `legendKey`), `sum` and `count` aggregations, single-field sort, a 24-column `widgetLayout`, and per-widget filters (`isIn`, `greaterThan`). For example, the refunds grid filters `kind` to `refund`, and the unpaid grid shows only invoices with an unpaid amount above zero.
- **Data model with relationships** (`relationships`): freelancer payments and disputes join their invoice (`many-to-one`); in the CA portfolio, each client row joins that freelancer's payments, invoices and unpaid invoices (`one-to-many`). This lets one filter reach every source, and lets the assistant build widgets that combine sources.
- **Filter widgets** (`button-filter`): a Client filter on the freelancer dashboard and a Freelancer filter on the CA dashboard. The CA filter shows names through the field's `createValueFormatter`, while it filters on IDs.
- **Saved layouts:** `onStateUpdated` saves the full `AgReportState` (widgets, layout, filters) in the browser, and it is passed back as `initialState` on the next visit. **Reset layout** clears it. The storage key includes a hash of the default layout, so a changed default retires older saved layouts ([dashboard-layout.ts](../apps/web/src/lib/dashboard-layout.ts)).
- **Error handling:** `onErrorRaised` logs AG Studio configuration errors. If a saved layout fails fatally, the dashboard falls back to the default.
- **Theming:** `studioTheme.withParams` binds AG Studio's accent, surface, text, border, radius, padding, font and the four chart palette colours to Niryat's design tokens (CSS variables), so the dashboards match the rest of the app.
- **AI Assistant:** `AgStudioAiModule` with `createAiHarness`, a custom `AgLlmAdapter` and role-specific prompt starters (three for freelancers, three for CAs). The harness is built from AG's five built-in agents with `directLlmRunner`. The lead agent also gets a Niryat tool, `explain_term`, defined with `api.defineAiTool`: a client-side tool that answers "what is a FIRA / LUT / GSTR-1?" from the app's own glossary, so Claude does not define compliance terms from memory.
- **Licensing:** `licenseKey` is passed from the server-side `AG_STUDIO_LICENSE_KEY` setting; without it, AG Studio runs in trial mode.

### How the AI Assistant works: AG Studio, backed by Claude

AG Studio's assistant works through function calls: its main agent hands work to page and widget agents. We kept that loop and replaced the model with Claude, so that no AI key reaches the browser.
1. **Browser adapter** ([dashboard-adapter.ts](../apps/web/src/lib/dashboard-adapter.ts)): implements `AgLlmAdapter.executeTurn`. It sends each AG Studio turn to `POST /api/dashboard/turn`, checks the reply with zod and replays it as AG Studio events (`TEXT_MESSAGE_CHUNK`, `TOOL_CALL_START/ARGS/END`). Errors become AG Studio `failed` or `cancelled` responses with plain messages, such as a rate-limit message that gives the wait time.
2. **Server proxy** ([routes/dashboard.ts](../apps/api/src/routes/dashboard.ts)): requires a signed-in freelancer or CA, caps the body at 256 KB and checks the monthly AI budget. It allows one turn per user at a time (`dashboard_busy`) and records every widget tool call the model makes, logging argument names only.
3. **Claude translation** ([dashboard-llm.ts](../packages/agent/src/dashboard-llm.ts)): converts AG Studio's `function_call` and `function_call_output` items, tool list and `toolChoice` into Anthropic Messages `tool_use`, `tool_result` and `tool_choice`, then converts the reply back.

The instructions are deliberate. Claude must **put every amount, count and date in a widget, never in prose**, so the figures come from the user's data rather than the model's wording. All data, including client names, is treated as data, never as instructions, which guards against prompt injection. "This year" means the Indian financial year (April to March). In the CA version, freelancers and currencies are never added together. The assistant has **no PayPal tools**; it can only arrange the data Niryat already loaded.

### Why this is more than a chart page

- **Real compliance data:** every deadline, health score and payment-proof status comes from Niryat's cited rules package (`packages/rules`). AG Studio only groups and totals these values for display, and amounts in different currencies are never added together.
- **Privacy by role:** the CA dashboard loads only freelancers whose share invitation was accepted, and leaves customer emails and addresses out of its data sources ([api/ca-dashboard.ts](../apps/api/src/ca-dashboard.ts)).
- **One theme, isolated styles:** a zero-specificity `:where()` reset in `globals.css` stops app-wide styles from leaking into AG Studio panels.
- **Fallback:** `/ca` keeps a server-rendered client table under the dashboard for navigation and as a no-JavaScript fallback.

### Tests

[dashboard-layout.test.ts](../apps/web/src/lib/dashboard-layout.test.ts) covers saving, restoring, clearing, the default-layout key and storage that is broken or blocked. [lib/dashboard.test.ts](../apps/web/src/lib/dashboard.test.ts) and [lib/ca-dashboard.test.ts](../apps/web/src/lib/ca-dashboard.test.ts) check that every widget references a field that exists in its source. [dashboard-adapter.test.ts](../apps/web/src/lib/dashboard-adapter.test.ts) covers the adapter's events and errors, including 429 and 413. [routes/dashboard.test.ts](../apps/api/src/routes/dashboard.test.ts) covers sessions, the budget, busy turns, CA scope and logging. [dashboard-llm.test.ts](../packages/agent/src/dashboard-llm.test.ts) covers the AG Studio-to-Claude translation. The tests call no live model and no PayPal service.

### Known limits

- Saved layouts live in the browser, so they don't follow a user to another device. On the shared judge accounts, each judge's browser keeps its own layout.

- The API returns each assistant turn in one piece. The browser then replays it as events, so text does not stream word by word.
- Each turn is charged at a flat USD 0.05 against the monthly AI budget, not by tokens.
- The data is a snapshot taken when the page loads; reload to see new PayPal activity.
- The user has confirmed that the AG Studio licence covers judging through 2026-12-15 ([V15](verification.md#v15-sponsor-licences)).

## Change log (engineering evidence)

Each entry below records a dated change, its verification and any checks still open.

Initial record 2026-11-04: [A1 and A2](IMPROVEMENTS.md#a1-security-quick-fixes-p0). Later tasks are dated separately below.

## D1/D2: plain wording around both dashboards

Recorded 2026-11-05. The user approved D2's 36 rules-message changes in the [review log](IMPROVEMENTS.md#d2-review-log) before UI/API wording work began. The freelancer `/dashboard` and CA `/ca` pages now explain payment proof (FIRA) and the RBI export-payment deadline using the shared, no-JavaScript [glossary](../apps/web/src/lib/glossary.ts) and [Term](../apps/web/src/components/Term.tsx). [Freelancer sources/state](../apps/web/src/lib/dashboard.ts) uses “Amount before fees”, “Amount after fees”, “Exchange rate” and “Payment proof status”. [CA sources/state](../apps/web/src/lib/ca-dashboard.ts) uses “Missing payment proof” and the prompt “Which clients are missing payment proof?”. Existing field IDs, projections, aggregations, widgets, chart mappings, access checks and model boundaries are retained. [Calendar labels](../apps/api/src/calendar.ts) inherited by portfolio deadlines now put plain words before legal abbreviations. These changes help users understand the same figures; no Studio package, configuration or licence behavior changed.

Step 2 web tests passed 540/540; step 3 passed 541/541, including a new static home-page wording/glossary test. The final checks and exact manual steps are recorded in [D2 verification](IMPROVEMENTS.md#d2-verification-and-manual-checks). No live model/PayPal call, deployment or browser/helper connection was used. Browser layout, the revised CA prompt and licence/trial coverage remain **awaiting user verification**. Open `/dashboard` as a freelancer and `/ca` as a CA with an accepted share, after following those prerequisites; confirm the explanations and renamed labels while figures and client scope match the existing records.

## A1: shared security headers

[Next configuration](../apps/web/next.config.ts) applies four security headers to every web path, including `/dashboard`. The content security policy contains only `frame-ancestors 'none'`; it adds no script or style restrictions. This follows A1's requirement to keep AG Studio's injected styles outside a new restrictive policy. The exact headers and checks are recorded in [Render's A1 entry](RENDER.md#a1-production-mode-and-security-headers).

## A2: dashboard AI request limit

The dashboard assistant's `POST /dashboard/turn` shares a budget of six requests per minute with `POST /extract` and `POST /close`. The key includes the AI route group, client IP and verified session user ID. Requests over that budget return HTTP 429 with `{ "error": "rate_limited" }` and `Retry-After: 60`, before the dashboard route invokes the model.

Implementation: [rate-limit middleware](../apps/api/src/rate-limit.ts), [app registration](../apps/api/src/index.ts), [server composition](../apps/api/src/server.ts) and [dashboard route](../apps/api/src/routes/dashboard.ts). [Rate-limit tests](../apps/api/src/rate-limit.test.ts) cover the shared AI budget, user/IP isolation and forged forwarding headers. The [Render record](RENDER.md#a2-rate-limits-and-client-ip-trust) explains the private connection needed to preserve the browser's client IP.

## Verification and pending checks

A1's recorded web suite passed 362 tests. After A2's review fix, the web suite passed 363 tests and the API suite passed 457; `pnpm verify` passed all 27 tasks and `pnpm build` passed all nine tasks. Database-dependent tests remained skipped; see [validation details](RENDER.md#recorded-automated-validation).

Browser verification is pending. Follow the [manual checks](RENDER.md#manual-checks-awaiting-user-verification), then open `/dashboard` with an existing signed-in account and ledger data. Expect the dashboard and its existing edit controls to render. Confirm the response headers on that page. These results do not establish browser compatibility or licence/trial coverage; [V15](verification.md#v15-sponsor-licences) remains open.

## B6: CA portfolio dashboard

Recorded 2026-11-05. [B6](IMPROVEMENTS.md#b6-ca-portfolio-ag-studio-dashboard-p1-ag-studio-prize) adds the second AG Studio use at `/ca`: five widgets across accepted freelancer shares, with the existing B5 table retained as a server-rendered navigation/fallback. [CaDashboard](../apps/web/src/components/CaDashboard.tsx) reuses the freelancer component's theme/modules and the existing Claude adapter, edit mode and licence prop. [CA sources/state](../apps/web/src/lib/ca-dashboard.ts) supplies clients, current-financial-year PayPal fees, monthly receipts stacked by freelancer, the nearest ten unpaid invoice deadlines, missing FIRA counts and three portfolio prompt starters. Grouping uses freelancer IDs with name formatters; currencies remain separate. No package or licence configuration changed. Widget contracts were checked against installed AG Studio 3.0.0 declarations/implementation and the official [widget guide](https://www.ag-grid.com/studio/javascript/building-widgets/).

[API loading](../apps/api/src/ca-dashboard.ts) reuses B5's accepted-link records and existing deterministic dashboard projections. `GET /ca/dashboard` exposes only linked clients; invoice/payment rows add freelancer identity without customer emails/addresses, actions, PDF URLs or health citations. Portfolio identity fields remain available for B5's table, while Studio sources omit those emails. Missing names use “Unnamed freelancer”. All compliance calculations still come from rules; JavaScript aggregates are for display only.

[Dashboard turns](../apps/api/src/routes/dashboard.ts) now accept CA sessions, infer the portfolio instruction variant from the signed role, and store charged `dashboard` runs under the CA user ID. Query scope/client selection is rejected. The same model adapter, figure/data instructions, budget, concurrency, sanitized logging and no-PayPal-tool boundary apply. [Rate limiting](../apps/api/src/rate-limit.ts) recognizes CAs on this route and keeps the existing six-per-minute IP/user limit. Freelancer turns retain their instructions and behaviour.

Verification (2026-11-05): focused API integration 96/96; full API 753/753 in 36 files and DB 176/176 in eight files, zero skips; web 514/514 in 39 files; final `corepack.cmd pnpm verify` 27/27 tasks (24 cached) and `corepack.cmd pnpm build` 9/9 (eight cached, fresh Next build); `git diff --check` passed. Direct Vitest integration commands used only disposable PostgreSQL 17 `niryat_test`, avoiding private environment-file loaders. Coverage includes source/widget field consistency, financial-year/kind filters, currency/identity separation, nearest-ten and empty sources, accepted-link isolation/revocation, CA runs/concurrency/logging, unchanged freelancer turns, rate limiting, licence forwarding and the retained table. Exact results, logs and [manual checks](IMPROVEMENTS.md#b6-ca-portfolio-ag-studio-dashboard-p1-ag-studio-prize) are recorded in B6. Browser questions/visuals, hosted behaviour and [V15 licence/trial coverage](verification.md#v15-sponsor-licences) remain awaiting user verification. Loaded data is a snapshot until reload; the B5 latest-50 reminder limitation and existing buffered AI/flat-charge limits remain. No live model or PayPal service was called during verification.


## C3 review fix 1: old overdue portfolio deadlines

Recorded 2026-11-05. The shared [calendar builder](../apps/api/src/calendar.ts) now retains unresolved overdue RBI/dispute events beyond its historical display window. [CA dashboard loading](../apps/api/src/ca-dashboard.ts) passes those events to the existing [portfolio projection](../apps/api/src/dashboard.ts), so the clients grid/table's earliest non-past deadline can now correctly be an older overdue event. No Studio configuration, source fields, AI behavior, licence, package or legal calculation changed. The ordered issue-1 focused checks passed 28/28 tests (60.11s), covering the builder, owner/CA calendar routes and dashboard projections; full-task verification is recorded in the [Bryntum review-fix entry](BRYUNTUM.md#c2c3-review-fixes-issue-1-then-issue-2). Browser verification remains pending: follow that entry's startup/account/URL steps, then open `/ca` and compare the affected client's next-deadline field with its old overdue calendar event. No hosted or licence-coverage result is claimed.

## A5 synthetic judge records (2026-11-05)

A5 populates the existing freelancer dashboard and CA portfolio through apps/api/src/seed-judge.ts and packages/db/src/seed-judge.ts: three freelancer ledgers, fee/net values, a refund, a dispute and proven accepted CA links. No Studio component, widget, AI proxy, licence, model or dependency changed. Judge entry on home and both login pages uses existing role sessions; all demo records are shared and synthetic. Buyer login is supplied privately. Reruns preserve edits and original dates.

Focused seed/session/close integration passes 10/10; full DB passes 180/180 without skips. Full API/web/verify/build and root seed-command results are recorded in IMPROVEMENTS A5. Populated widgets, CA switching, live prompts and licence coverage remain awaiting user verification; exact startup/URLs/actions/expected results are in A5's manual checklist. No browser/helper or sponsor-service call, deployment or feature tick.

A5 final result (2026-11-06): full API 792/792 and DB 180/180 without skips; web 559/559, verify 27/27, build 9/9 (fresh Next build also passed). Root seed command passed twice with unchanged fixture counts on a disposable DB; container removed. No Studio behavior or licence change, live prompt/browser verification or deployment. Exact evidence and pending user checks remain in IMPROVEMENTS A5.

## Niryat Neel visual system (2026-11-09)

The dashboards' theme in [Dashboard.tsx](../apps/web/src/components/Dashboard.tsx) is unchanged in code, but the tokens it reads now carry Neel values ([globals.css](../apps/web/src/app/globals.css); mapping in [IMPLEMENTATION-FRONTEND.md](IMPLEMENTATION-FRONTEND.md)). Why: the user approved the Niryat Neel design system as the frontend's visual source of truth. Effect: `--niryat-primary` (accent and palette fill 1) is indigo `#3b348c` / lavender `#a9a2f5` in dark; `--niryat-accent` (fill 2) is marigold `#f2a93b`; surface, text, muted, neutral-strong and danger follow Neel; `--niryat-font-sans` is now Figtree instead of IBM Plex Sans. No AG Studio package, licence, widget or AI Assistant change.

Verification: `corepack.cmd pnpm verify` 27/27 (web 570/570); `corepack.cmd pnpm build` 9/9 with a fresh Next build. Pending user verification: `/dashboard` and `/ca` in light and dark, checking chart colours and text contrast.

Follow-up (2026-11-09): [Dashboard.tsx](../apps/web/src/components/Dashboard.tsx) palette fill and stroke 2 now read `--niryat-cat-paypal` (`#2f6a8a` / `#9ed0ea`) instead of `--niryat-accent`, because Neel reserves marigold for actions waiting for the user's decision. Verification: web 570/570, `corepack.cmd pnpm verify` 27/27, `corepack pnpm build` 9/9. Pending user verification: `/dashboard` and `/ca` charts in light and dark; in dark, series 1 (lavender) and series 2 (light blue) are close in lightness, so check they are told apart by legend and position.

Light theme only (2026-11-09): the user removed dark mode, so the dashboards always use the light Neel values; the dark values and dark checks above no longer apply.

## Licence coverage confirmed (2026-11-09)

The user confirmed that the AG Studio licence and the December AI budget, which limits dashboard questions, last through judging on 2026-12-15. No dates, terms, key or amount were supplied or inspected. Recorded in [V15](verification.md#v15-sponsor-licences) and [V17](verification.md#v17-submission-materials-and-rehearsal). Docs only: no code, configuration or deployment change. H3's weekly check that the dashboard still renders remains with the user.

## G5 fix: Studio theme and style isolation (2026-11-09)

The user's hosted G5 rehearsal found that the dashboard didn't match the design system. Cause: house element styles in `apps/web/src/app/globals.css` leaked into Studio's panels. For example, `button { margin-top: 16px }` pushed the AI Assistant header controls out of the header. Changes:
- `globals.css` resets margins, button minimum height and shadow inside `.dashboard-studio`. The selectors use zero-specificity `:where()`, so Studio's own rules still win ties.
- The shared `theme` in `apps/web/src/components/Dashboard.tsx` now uses design tokens for base font size, borders, radii, widget padding and widget title size and weight. The extra outer wrapper border is removed. The theme is shared, so the freelancer `/dashboard` and the CA `/ca` both change.

Web typecheck, tests (570/570) and `pnpm build` (9/9 tasks) pass. The browser check is awaiting user verification: after redeploying, open `/dashboard` as Ananya and `/ca` as the CA. Expect the AI Assistant header controls inside the header, widget titles at a readable size without truncation, and Studio panels using Niryat's border colour and radii.

## Hosted review fixes: panels and CA sort (2026-11-10)

A read-only headless-Chrome review of the hosted site found two AG Studio problems:
- All four Studio panels (AI Assistant, Filters, Compose, Data) opened at once and squeezed the widget canvas to almost nothing on `/dashboard` and `/ca`, even at 1920px.
- On `/ca`, AG Studio rejected the `clients` widget with "Sort definition has too many fields".

Changes:
- `DASHBOARD_PANELS` in `apps/web/src/lib/dashboard.ts` sets the initial `AgReportState.panels` to collapse `filters`, `edit` and `data`. Both dashboards use it, and the AI Assistant stays open. The panel IDs come from the installed `ag-studio` 3.0.0 types (`AgEditModePanelType`, `AgPanelState.collapsed`).
- The CA `clients` grid in `apps/web/src/lib/ca-dashboard.ts` sorts by overdue count only. `ca-dashboard.test.ts` now fails if any widget sorts on more than one field.

`pnpm verify` passes (27/27 tasks). Awaiting user verification after redeploy: as Ananya, `/dashboard` shows the widgets beside the open AI Assistant, with the other three panels collapsed but available. As the CA, `/ca` shows the Clients grid, with no console error about the sort definition.

## Deeper integration: relationships, filters, saved layouts and a Niryat AI tool (2026-11-10)

Goal: show judges more than an embedded chart page. All of the following uses AG Studio 3.0.0 APIs, checked against the installed type definitions. The ag-mcp server indexes AG Grid documentation only, so it could not be used for AG Studio.
- **Relationships:** `dashboardSources` declares payments→invoices and disputes→invoices (`many-to-one`). `caDashboardSources` declares clients→payments/invoices/unpaid (`one-to-many`).
- **Filter widgets:** a `button-filter` on `invoices.clientName` (freelancer) and on `clients.freelancerId` (CA), each in an 8-track row above the widgets. It has no widget title, because a title clipped the buttons.
- **Saved layouts:** `StudioDashboard` in `apps/web/src/components/Dashboard.tsx` is now shared by both dashboards. It reads the saved state after mount, writes it on `onStateUpdated`, and remounts Studio on **Reset layout**. `onErrorRaised` logs errors, and a fatal error on a saved layout resets it.
- **AI tool:** `explain_term` (`api.defineAiTool`, client-side) is added to AG's lead agent, together with one extra instruction line. The other four built-in agents are unchanged. The tool sends nothing extra to the server; its result reaches Claude through the existing proxy.
- **Skipped:** saving AI chat history (`AgAiHistoryStore`). It would leave financial questions and answers in the browser after sign-out, and judges rarely reload mid-chat. The three prompt starters are unchanged, because the spec records exactly three as user-accepted.

Verification:
- `pnpm --filter @niryat/web test`: 579/579 passed. Typecheck passed.
- A headless-Chrome harness rendered the real `Dashboard` and `CaDashboard` components (bundled with esbuild) with synthetic data and a fake `/api/dashboard/turn`:
  - Clicking one client also filtered the Refunds and FX grids (payments source) and the unpaid grid (invoices source).
  - The selection survived a reload. **Reset layout** cleared it and the saved key.
  - The CA filter showed freelancer names and filtered the unpaid grid.
  - Asking "What is a FIRA?" sent requests that pass the server's `dashboardTurnRequestSchema`, with `explain_term` listed. The tool returned the glossary text, and the chat showed the tool step and the answer.
  - No AG Studio configuration errors were raised.

Awaiting user verification on the hosted site after deploy:
- As Ananya on `/dashboard`: click a client and check that every widget narrows. Reload: the filter is kept. Click **Reset layout**: the default returns.
- Ask "What is a FIRA?": the answer shows an `explain_term` step.
- As the CA on `/ca`: the Freelancer filter shows names and narrows the widgets.

The live Claude answer was not exercised.
