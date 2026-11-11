# 13. Advance tax estimator

Status: implemented; profile persistence, estimate/threshold behavior, labels and calendar dates user-confirmed (2026-11-01). Source: [PLAN section 5](../PLAN.md#5-v1-features-in-order-of-importance).

## Goal

Prepare sourced advance-tax estimates and payment dates for CA review.

## User story

As an Indian freelancer paid through PayPal, I want to estimate advance tax and its payment dates so I can prepare reliable records for my CA.

## Acceptance criteria

- [x] Eligibility for presumptive taxation determined from profile and receipts
- [x] Amount and dates shown; dates appear in the compliance calendar
- [x] Clear "estimate — confirm with your CA" label

## Data & APIs used

`GET /advance-tax` supplies the `/advance-tax` GET form. Invoice-linked payment gross minus refunds is selected by IST receipt date in the tax year. User-entered rates convert each currency through rules; missing rates leave eligibility uncertain. Negative net receipts remain visible but contribute zero to the INR total. The profile's specified-profession answer and YAML receipt limits determine eligible/not-eligible/uncertain results, assuming a resident individual.

U3–U4: exchange rates are request-only, never fetched, stored or AI-generated. The user supplies estimated tax; Niryat computes no income-tax slabs, rebates, surcharge, cess or total tax liability. PRESUMPTIVE_TAX supplies deemed income when eligible; ADVANCE_TAX_DATES supplies dates and cumulative instalment amounts. The estimate/CA label remains beside amounts. Unknown profession/cash share and missing rates are explained rather than assumed.

P6-11 exposed a Next development query-proxy validation bug. The page now validates a plain copy; regression cases cover the empty query and both acceptance estimates. The user confirmed step 5 after the fix, then calendar step 6. See [P6-11 evidence](../verification.md#v16-phase-6-acceptance).

## Edge cases

Uncertain eligibility; missing receipts; refunds; changes in applicable law; unknown scheme selection.

## Test cases

- [Rules](../../packages/rules/src/advance-tax.test.ts): valid/invalid tax years, all eligibility branches and boundaries, YAML-driven parameters, four/one instalments, missing estimates, threshold equality and exact rounding.
- [Receipts](../../apps/api/src/advance-tax.test.ts): IST year boundary, refunds/negative net receipts, rates and rules-derived results.
- [Route](../../apps/api/src/routes/advance-tax.test.ts): session/profile gates, eligibility branches, invalid/duplicate queries, all currencies and user-scoped reads.
- [Page](../../apps/web/src/app/(app)/advance-tax/page.test.tsx): Next development proxy regression, valid/missing rates and rejection of malformed currency inputs before API calls. [Calendar builder](../../apps/api/src/calendar.test.ts) verifies the shared tax dates.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
