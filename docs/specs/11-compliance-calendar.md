# 11. Compliance calendar

Status: planned; scaffold only. Source: [PLAN section 5](../PLAN.md#5-v1-features-in-order-of-importance).

## Goal

Show sourced compliance and PayPal deadlines in a calendar.

## User story

As an Indian freelancer paid through PayPal, I want to see upcoming deadlines in one place so I can prepare reliable records for my CA.

## Acceptance criteria

- [ ] Events generated automatically from profile, PayPal invoices, disputes and rules
- [ ] Overdue and upcoming items are visually distinct
- [ ] Clicking an event opens the related invoice/task

## Data & APIs used

profiles, invoices, disputes, tasks; rules dates; Bryntum Calendar (deferred installation).

## Edge cases

Time zones; overdue items; recurring dates; duplicate events; missing source record.

## Test cases (TODO)

- TODO: Add acceptance tests for each criterion, including the edge cases above.
- TODO: Add boundary, retry/idempotency and authorization tests where applicable.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
