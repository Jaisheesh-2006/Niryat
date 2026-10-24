# 13. Advance tax estimator

Status: planned; scaffold only. Source: [PLAN section 5](../PLAN.md#5-v1-features-in-order-of-importance).

## Goal

Prepare sourced advance-tax estimates and payment dates for CA review.

## User story

As an Indian freelancer paid through PayPal, I want to estimate advance tax and its payment dates so I can prepare reliable records for my CA.

## Acceptance criteria

- [ ] Eligibility for presumptive taxation determined from profile and receipts
- [ ] Amount and dates shown; dates appear in the compliance calendar
- [ ] Clear "estimate — confirm with your CA" label

## Data & APIs used

profiles, payments, tasks; PRESUMPTIVE_TAX and ADVANCE_TAX_DATES; no direct filing API.

## Edge cases

Uncertain eligibility; missing receipts; refunds; changes in applicable law; unknown scheme selection.

## Test cases (TODO)

- TODO: Add acceptance tests for each criterion, including the edge cases above.
- TODO: Add boundary, retry/idempotency and authorization tests where applicable.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
