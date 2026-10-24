# 3. Export eligibility check

Status: planned; scaffold only. Source: [PLAN section 5](../PLAN.md#5-v1-features-in-order-of-importance).

## Goal

Check every statutory export condition before enabling zero-rated invoicing.

## User story

As an Indian freelancer paid through PayPal, I want to understand whether a job qualifies as an export so I can prepare reliable records for my CA.

## Acceptance criteria

- [ ] Each condition shown as pass/fail with its legal reference
- [ ] A failing check blocks the zero-rated export invoice path and explains why

## Data & APIs used

clients.export_check_result, profiles; EXPORT_CONDITIONS; no external API.

## Edge cases

Unknown place of supply; related establishments; incomplete answers; failed conditions must block the path.

## Test cases (TODO)

- TODO: Add acceptance tests for each criterion, including the edge cases above.
- TODO: Add boundary, retry/idempotency and authorization tests where applicable.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
