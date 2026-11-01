# 11. Compliance calendar

Status: implemented; P6-11 calendar events, state styling and navigation user-confirmed (2026-11-01). Sponsor licence coverage remains unverified. Source: [PLAN section 5](../PLAN.md#5-v1-features-in-order-of-importance).

## Goal

Show sourced compliance and PayPal deadlines in a calendar.

## User story

As an Indian freelancer paid through PayPal, I want to see upcoming deadlines in one place so I can prepare reliable records for my CA.

## Acceptance criteria

- [x] Events generated automatically from profile, PayPal invoices, disputes and rules
- [x] Overdue and upcoming items are visually distinct
- [x] Clicking an event opens the related invoice/task

## Data & APIs used

`GET /calendar` returns owner-scoped events for `/calendar`. Bryntum Calendar 7.3.8 (trial package and React wrapper) displays read-only month/list views. Rules provide GSTR-1 and advance-tax dates; profile LUT expiry and invoice compliance views provide the other dates. State prefixes accompany colours. A server-rendered linked list retains all overdue and the next ten upcoming events without JavaScript.

Events cover LUT expiry, GSTR-1, advance tax, RBI realisation, credit-note declaration, dispute responses and expected recurring invoices. Recurring cycles are still unlinked; these dates are expectations, not confirmed PayPal issues. FIRA upload tasks remain in Tasks/monthly close. Missing dispute response dates produce no event. Local acceptance recovered a dispute through manual sync; automatic webhook delivery is not established. See [P6-11 evidence](../verification.md#v16-phase-6-acceptance).

## Edge cases

Time zones; overdue items; recurring dates; duplicate events; missing source record.

## Test cases

- [Event builder](../../apps/api/src/calendar.test.ts): exact IDs/titles/links/rules, inclusive window edges, overdue/past states, GST gates, paid invoices, missing dispute dates, month-end recurrence and unique sorted IDs.
- [Route](../../apps/api/src/routes/calendar.test.ts): authentication, empty-profile tax dates and stored-ledger isolation between users.
- [Mapping](../../apps/web/src/lib/calendar.test.ts): all-day dates, state prefixes/classes and links for all three states.
- [Fallback](../../apps/web/src/app/calendar/page.test.tsx): all overdue plus ten upcoming events, empty list, invalid responses and unauthenticated redirect. P6-11 user-confirmed calendar rendering and RBI/GSTR-1 navigation; licence validity is a separate [V15](../verification.md#v15-sponsor-licences) check.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
