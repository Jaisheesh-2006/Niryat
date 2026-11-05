# Bryntum change record

Initial record 2026-11-04: [A1 and A2](IMPROVEMENTS.md#a1-security-quick-fixes-p0). C1 is recorded below on 2026-11-05. This file retains the existing `BRYUNTUM.md` filename.

## A1: shared security headers

[Next configuration](../apps/web/next.config.ts) applies four security headers to every web path, including `/calendar`. The content security policy contains only `frame-ancestors 'none'`; it adds no script or style restrictions. This follows A1's requirement to keep Bryntum's injected styles outside a new restrictive policy. See [Render's A1 entry](RENDER.md#a1-production-mode-and-security-headers) for the exact headers and source tests.

## A2: shared API protection

A2 adds limits to authentication, AI and reserved sharing POST routes. `GET /calendar` is outside those rate-limit groups. The [Render record](RENDER.md#a2-rate-limits-and-client-ip-trust) documents the client-IP trust fix and private web-to-API connection used by the shared application.

## Verification and pending checks

A1's recorded web suite passed 362 tests. After A2's review fix, the web suite passed 363 tests; `pnpm verify` passed all 27 tasks and `pnpm build` passed all nine tasks. These checks include the existing calendar tests and compilation, not a live Bryntum browser check. See [validation details](RENDER.md#recorded-automated-validation) for the existing database-test skips.

Browser verification is pending. Follow the [manual checks](RENDER.md#manual-checks-awaiting-user-verification), then open `/calendar` with an existing signed-in account containing calendar data. Expect the existing calendar and list to render; switch between the existing month/list views and inspect the document response headers. Licence/trial dates and judging coverage remain unverified in [V15](verification.md#v15-sponsor-licences).

## C1: category resources, filter sidebar and views

Recorded 2026-11-05. C1 adds real Bryntum resources and its built-in filter sidebar so users can show or hide deadline categories. [calendar.ts](../apps/web/src/lib/calendar.ts) defines the four resources once and exhaustively maps all seven event kinds: LUT renewal, GSTR-1 and credit-note declaration to GST; advance tax to Income tax; RBI deadlines to RBI payment deadlines; disputes and recurring invoices to PayPal. Every mapped event carries `resourceId`. Resource colours use the `--niryat-cat-*` light/dark tokens in [globals.css](../apps/web/src/app/globals.css). Removed the old state background overrides so they do not conceal category colours; state title prefixes and `cls` remain, keeping colour from being the only signal.

[CalendarView.tsx](../apps/web/src/components/CalendarView.tsx) explicitly opens the built-in sidebar/resource filter and enables agenda, week, month, year and list. Month remains the default; day stays disabled and the calendar stays read-only. Config names and resource fields were checked against the installed Calendar/React 7.3.8 declarations (`CalendarConfig`, `SidebarConfig`, `ResourceModelConfig` and `BryntumCalendarProps`). The [server-rendered deadline list](../apps/web/src/app/(app)/calendar/page.tsx), API contracts and compliance calculations are unchanged. No dependency, licence or hosting setup changed.

The installed `YearViewConfig` supports a calendar year, with no typed April-start setting. The user approved the standard January–December year view on 2026-11-05; inspecting an April–March financial year requires two year pages. No custom fiscal-year view was added. Recurring invoice dates remain expectations; licence/trial coverage is still unverified. Tooltips, CA multi-client calendars and dragging remain C2/C3/C4 work.

### C1 automated checks

- `corepack.cmd pnpm --filter @niryat/web test`: PASS, 515/515 tests in 39 files. Mapping tests cover every schema kind, category membership, inherited resource colour, all three state classes, dates/titles/links and empty data. Wrapper tests cover resource/filter wiring, the five modes, read-only/default settings and guarded navigation. Existing page tests still cover the server-rendered fallback.
- `corepack.cmd pnpm verify`: PASS, 27/27 tasks (24 cached), 10.79 seconds. Root formatting, scaffold and 14 script tests passed; web checks ran fresh. Cached DB/API suites include 97/249 skipped integration tests. No fresh database integration run is claimed for this web-only change.
- `corepack.cmd pnpm build`: PASS, 9/9 tasks (eight cached, fresh Next production build), 1m0.634s. The existing sandbox Git dirty-hash warning was nonfatal. `git diff --check`: PASS. Logs: `.tmp/c1-web.log`, `.tmp/c1-verify.log`, `.tmp/c1-build.log`. No browser/helper connection, live PayPal call, deployment, commit or publication was performed.

### C1 manual checks — awaiting user verification

1. Prerequisites: the existing local API/database setup, current migrations, and a freelancer account with calendar events. For all four category checks, use an account with GST registration, LUT expiry and filing frequency, an unpaid export invoice and a dispute or recurring invoice. Advance-tax dates appear automatically. Do not create or send PayPal activity for this check; existing records suffice. The user supplies configuration; this task does not change it.
2. From the repository root run `corepack.cmd pnpm dev` (Linux: `corepack pnpm dev`). Sign in at `http://localhost:3000/login`, then open `http://localhost:3000/calendar`. Expect Month initially, an open sidebar and GST, Income tax, RBI payment deadlines and PayPal category choices.
3. Navigate to a month containing events. Untick each category and confirm only its events disappear; tick it again and confirm they return. Untick all, then restore all. Confirm the deadline list below stays unchanged by calendar filters.
4. Switch through Agenda, Week, Month, Year and List; Day must not appear. Year shows January–December. To inspect April 2026–March 2027, inspect April–December 2026, navigate to 2027, then inspect January–March. Test filters in each view, including an empty period.
5. Confirm titles retain Overdue/Upcoming/Past prefixes where applicable, category colours remain consistent across states, and event clicks open their existing local pages. Try dragging/resizing and double-clicking empty cells: no event is moved or created. Check keyboard operation, a narrow viewport and both system colour schemes for readable category colours and labels.
6. Disable JavaScript and reload `/calendar`: the overdue and next-ten-upcoming list still renders with its links. Re-enable JavaScript afterwards. These browser checks have not been performed by the coding assistant.
