# 7. FIRA matching

Status: built (2026-10-30) for the synthetic fixture; real PayPal India FIRA layout acceptance pending; AI extraction deferred to Phase 5. Source: [PLAN section 5](../PLAN.md#5-v1-features-in-order-of-importance).

## Goal

Match uploaded FIRA lines to payments and obtain confirmation for uncertain results.

## User story

As an Indian freelancer paid through PayPal, I want to link proof of remittance to my payments so I can prepare reliable records for my CA.

## Acceptance criteria

- [ ] Parser extracts date, amount, currency, reference and purpose code from a real (redacted) PayPal FIRA
- [x] Matches show a confidence level; low-confidence matches need user confirmation
- [x] Every invoice shows FIRA status: matched / pending / missing

## Data & APIs used

fira_documents, fira_lines, matches, payments; uploaded PDF storage and extraction.

## Edge cases

Unreadable or duplicate PDFs; fee/FX/date gaps; multiple candidate payments; consent and redaction.

## Test cases

- Synthetic layout extraction, required fields, unreadable PDFs and missing text layers: [parser tests](../../apps/api/src/fira.test.ts). The [local sample check](../../apps/api/src/fira.sample.test.ts) currently uses the synthetic PDF.
- Fee/net comparisons, amount/currency mismatches, date-window boundaries, multiple candidates and confidence levels: [matching tests](../../apps/api/src/fira.test.ts). Matching compares the payment currency; it does not convert FX.
- Authentication, consent, size/type limits, private storage, duplicate uploads, confirmation/rejection and cross-user isolation: [FIRA route tests](../../apps/api/src/routes/fira.test.ts).
- Matched/pending/missing states, atomic persistence and per-user reads: [DB FIRA tests](../../packages/db/src/fira.test.ts) and [FIRA route tests](../../apps/api/src/routes/fira.test.ts).
- Demo seed guards, one suggested match, exact matches and a flagged final line: [demo seed tests](../../apps/api/src/seed-fira-demo.test.ts).
- User-confirmed synthetic upload, source-text display, confirmation, invoice status and duplicate rejection: [verification V07](../verification.md#v07-fira-sample).

## Limitations

The deterministic parser fits the synthetic layout recorded in V07, not a verified PayPal India FIRA layout. The real-document criterion remains open until a consented, redacted real FIRA or an official anonymised specimen is inspected and parsed. Do not present the synthetic fixture as bank-issued proof.

Matching against sandbox data uses the D17 demo seed: it mirrors the uploaded lines into a fresh account's ledger, except for the flagged final line. This demonstrates matching behaviour, not independent reconciliation of real remittances. Demo invoices consume that account's invoice numbers. AI extraction and support for other layouts remain deferred to Phase 5.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
