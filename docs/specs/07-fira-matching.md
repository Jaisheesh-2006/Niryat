# 7. FIRA matching

Status: planned; scaffold only. Source: [PLAN section 5](../PLAN.md#5-v1-features-in-order-of-importance).

## Goal

Match uploaded FIRA lines to payments and obtain confirmation for uncertain results.

## User story

As an Indian freelancer paid through PayPal, I want to link proof of remittance to my payments so I can prepare reliable records for my CA.

## Acceptance criteria

- [ ] Parser extracts date, amount, currency, reference and purpose code from a real (redacted) PayPal FIRA
- [ ] Matches show a confidence level; low-confidence matches need user confirmation
- [ ] Every invoice shows FIRA status: matched / pending / missing

## Data & APIs used

fira_documents, fira_lines, matches, payments; uploaded PDF storage and extraction.

## Edge cases

Unreadable or duplicate PDFs; fee/FX/date gaps; multiple candidate payments; consent and redaction.

## Test cases (TODO)

- TODO: Add acceptance tests for each criterion, including the edge cases above.
- TODO: Add boundary, retry/idempotency and authorization tests where applicable.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
