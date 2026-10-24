# 12. Dashboard with plain-English questions

Status: planned; scaffold only. Source: [PLAN section 5](../PLAN.md#5-v1-features-in-order-of-importance).

## Goal

Present PayPal-backed widgets and supported natural-language questions.

## User story

As an Indian freelancer paid through PayPal, I want to ask questions about my income and fees so I can prepare reliable records for my CA.

## Acceptance criteria

- [ ] Core widgets: income, PayPal fees, FX, refunds/disputes, health score, FIRA status, unpaid invoices
- [ ] At least three natural-language questions work reliably in the demo
- [ ] Custom theme matching Niryat branding

## Data & APIs used

PayPal ledger, profiles, matches, tasks; AG Studio and its agent framework (deferred installation).

## Edge cases

Empty data; inaccessible client records; unsupported questions; missing FX data; expired sponsor licence.

## Test cases (TODO)

- TODO: Add acceptance tests for each criterion, including the edge cases above.
- TODO: Add boundary, retry/idempotency and authorization tests where applicable.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
