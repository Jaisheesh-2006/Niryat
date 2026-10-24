# 5. Real-time payment tracking

Status: planned; scaffold only. Source: [PLAN section 5](../PLAN.md#5-v1-features-in-order-of-importance).

## Goal

Reconcile webhook payments and transaction history, preserving gross, fee, net and currency.

## User story

As an Indian freelancer paid through PayPal, I want to see receipts, fees and partial payments together so I can prepare reliable records for my CA.

## Acceptance criteria

- [ ] Webhook receiver verifies PayPal signatures and records invoice-paid / capture events
- [ ] Nightly sync via transaction history catches anything webhooks missed
- [ ] Each payment shows gross, fee, net and linked invoice; partial payments roll up correctly

## Data & APIs used

invoices, payments; verified webhooks; Server SDK transaction search for backfill.

## Edge cases

Duplicate or out-of-order events; invalid signatures; partial payments; missing conversion details; replayed sync.

## Test cases (TODO)

- TODO: Add acceptance tests for each criterion, including the edge cases above.
- TODO: Add boundary, retry/idempotency and authorization tests where applicable.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
