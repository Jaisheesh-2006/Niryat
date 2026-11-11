# 6. Refunds and disputes handling

Status: built (2026-10-30); refunds and open disputes appear in the dashboard tiles (spec 12, user-confirmed 2026-11-01) and the monthly close summary (spec 08). Source: [PLAN section 5](../PLAN.md#5-v1-features-in-order-of-importance).

## Goal

Reflect refunds and disputes in invoice, GST and realisation records.

## User story

As an Indian freelancer paid through PayPal, I want to understand the compliance impact of a refund or dispute so I can prepare reliable records for my CA.

## Acceptance criteria

- [x] A sandbox refund updates the invoice, GST data and realised amount
- [x] A sandbox dispute creates an alert and a task with its compliance impact
- [x] Both appear in the dashboard and monthly close summary

## Data & APIs used

invoices, payments, disputes, tasks; refund events and Server SDK refunds; Disputes v1 REST; CREDIT_NOTE and REALISATION_ADJUSTMENT.

## Edge cases

Partial or repeated refunds; dispute won/lost; duplicate events; missing invoice link; refund after reporting period.

## Test cases

- Partial and repeated refunds, full-refund roll-up, copied fee/net and missing invoice links: [DB invoice tests](../../packages/db/src/invoices.test.ts).
- Approval, rejection, owner isolation, remaining-balance limits and stable request IDs on retry: [invoice route tests](../../apps/api/src/routes/invoices.test.ts).
- Signature verification, duplicate and overlapping refund events, refund-before-payment ordering and stale dispute updates: [webhook tests](../../apps/api/src/routes/webhooks.test.ts).
- Won/lost disputes and pending-bank realisation without double subtraction: [realisation tests](../../packages/rules/src/realisation.test.ts). A lost outcome cannot be forced on demand in the sandbox.
- Refund after the reporting period, original-invoice financial year and inclusive declaration deadline: [credit-note tests](../../packages/rules/src/credit-note.test.ts).
- Reconciliation and task deduplication: [sync tests](../../apps/api/src/sync.test.ts) and [DB invoice tests](../../packages/db/src/invoices.test.ts).
- User-confirmed refund, dispute and replay results: [verification V06](../verification.md#v06-events-refunds-disputes-and-history).

## Limitations

Hosted refund (2026-11-09) and dispute (2026-11-10) webhook delivery, the refund payload and its HTTP 200 result are recorded in V06. Dashboard and monthly-close display are built. See [Phase 4 status](../build-flow.md#phase-4-corrections-and-proof-specs-0607-oct-31nov-2).

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
