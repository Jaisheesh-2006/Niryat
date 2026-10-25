# 2. Purpose code advisor

Status: planned; scaffold only. Source: [PLAN section 5](../PLAN.md#5-v1-features-in-order-of-importance).

## Goal

Suggest a sourced purpose code and flag a mismatch with the profile.

## User story

As an Indian freelancer paid through PayPal, I want to confirm the purpose code for my work so I can prepare reliable records for my CA.

## Acceptance criteria

- [ ] Curated table of the most common service purpose codes, with descriptions and sources
- [ ] Suggestion + one-line reason + "confirm with your bank" note
- [ ] Mismatch warning feeds into the health score

## Data & APIs used

profiles; curated PURPOSE_CODES table; AI classification (no PayPal mutation).

## Edge cases

Ambiguous work descriptions; multiple services; missing code; bank confirmation; no invented code; only codes PayPal India offers, never P0104 (goods) or P0301 (travel); work whose Annex code PayPal lacks (P0807, P1014, P1015, P1016, P1022) gets the nearest offered code ([rules sources](../rules-sources.md#rbi--fema)).

## Test cases (TODO)

- TODO: Add acceptance tests for each criterion, including the edge cases above.
- TODO: Add boundary, retry/idempotency and authorization tests where applicable.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
