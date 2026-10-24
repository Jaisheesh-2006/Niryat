# 10. GSTR-1 export data

Status: planned; scaffold only. Source: [PLAN section 5](../PLAN.md#5-v1-features-in-order-of-importance).

## Goal

Prepare reconciled GSTR-1 export data for the selected reporting period.

## User story

As an Indian freelancer paid through PayPal, I want to prepare export data for my GST return so I can prepare reliable records for my CA.

## Acceptance criteria

- [ ] Output matches the GST offline tool format (CSV/JSON — format to be verified on Day 1)
- [ ] Totals reconcile with PayPal invoices and refunds for the period
- [ ] Shown only for GST-registered users

## Data & APIs used

invoices, payments, profiles; GSTR1_6A and CREDIT_NOTE; GST offline-tool upload format.

## Edge cases

Unregistered profiles; empty periods; refunds across periods; rounding and currency reconciliation; rejected portal format.

## Test cases (TODO)

- TODO: Add acceptance tests for each criterion, including the edge cases above.
- TODO: Add boundary, retry/idempotency and authorization tests where applicable.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
