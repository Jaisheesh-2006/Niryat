# 2. Purpose code advisor

Status: built (2026-10-26); suggestions come from a keyword table, AI suggestions are deferred to Phase 5.

## Goal

Suggest a sourced purpose code and flag a mismatch with the profile.

## User story

As an Indian freelancer paid through PayPal, I want to confirm the purpose code for my work so I can prepare reliable records for my CA.

## Acceptance criteria

- [x] Curated table of the most common service purpose codes, with descriptions and sources
- [x] Suggestion + one-line reason + "confirm with your bank" note
- [x] Mismatch warning feeds into the health score

## Data & APIs used

profiles; curated PURPOSE_CODES table; AI classification (no PayPal mutation).

## Edge cases

Ambiguous work descriptions; multiple services; missing code; bank confirmation; no invented code; only codes PayPal India offers, never P0104 (goods) or P0301 (travel); work whose Annex code PayPal lacks (P0807, P1014, P1015, P1016, P1022) gets the nearest offered code ([rules sources](../rules-sources.md#rbi--fema)).

## Test cases

- [Purpose-code rules](../../packages/rules/src/purpose-codes.test.ts) cover the catalogue, suggestions, reasons, bank note, ambiguous work and mismatch flags; [public API](../../apps/api/src/index.test.ts) covers the cited catalogue without credentials.
- [Health rules](../../packages/rules/src/health.test.ts) and [health-check API](../../apps/api/src/routes/health-check.test.ts) cover the mismatch penalty, demo suggestion and report isolation.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
