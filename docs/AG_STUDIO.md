# AG Studio change record

Recorded 2026-11-04. Scope: [A1 and A2](IMPROVEMENTS.md#a1-security-quick-fixes-p0) only.

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
