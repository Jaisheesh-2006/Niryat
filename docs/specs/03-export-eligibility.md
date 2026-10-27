# 3. Export eligibility check

Status: built (2026-10-27); the invoice route's blocking behaviour is user-verified in the Phase 3 sandbox run.

## Goal

Check every statutory export condition before enabling zero-rated invoicing.

## User story

As an Indian freelancer paid through PayPal, I want to understand whether a job qualifies as an export so I can prepare reliable records for my CA.

## Acceptance criteria

- [x] Each condition shown as pass/fail with its legal reference
- [x] A failing check blocks the zero-rated export invoice path and explains why

## Data & APIs used

clients.export_check_result, profiles; EXPORT_CONDITIONS; no external API.

## Edge cases

Unknown place of supply; related establishments; incomplete answers; failed conditions must block the path.

## Test cases

- [Export-condition rules](../../packages/rules/src/export-conditions.test.ts) cover all five conditions, citations, India recipients, incomplete answers and unknown foreign-exchange permission.
- [Clients API](../../apps/api/src/routes/clients.test.ts) and [client storage](../../packages/db/src/clients.test.ts) cover saved results, recomputation, validation and per-user isolation; [client form](../../apps/web/src/components/ClientForm.test.tsx) covers create and edit submission.
- [Invoices API](../../apps/api/src/routes/invoices.test.ts) covers an India recipient being blocked with reasons, without storing an invoice, consuming a number or calling PayPal.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
