# 6. Refunds and disputes handling

Status: planned; scaffold only. Source: [PLAN section 5](../PLAN.md#5-v1-features-in-order-of-importance).

## Goal

Reflect refunds and disputes in invoice, GST and realisation records.

## User story

As an Indian freelancer paid through PayPal, I want to understand the compliance impact of a refund or dispute so I can prepare reliable records for my CA.

## Acceptance criteria

- [ ] A sandbox refund updates the invoice, GST data and realised amount
- [ ] A sandbox dispute creates an alert and a task with its compliance impact
- [ ] Both appear in the dashboard and monthly close summary

## Data & APIs used

invoices, payments, disputes, tasks; refund events and Server SDK refunds; Disputes v1 REST; CREDIT_NOTE and REALISATION_ADJUSTMENT.

## Edge cases

Partial or repeated refunds; dispute won/lost; duplicate events; missing invoice link; refund after reporting period.

## Test cases (TODO)

- TODO: Add acceptance tests for each criterion, including the edge cases above.
- TODO: Add boundary, retry/idempotency and authorization tests where applicable.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
