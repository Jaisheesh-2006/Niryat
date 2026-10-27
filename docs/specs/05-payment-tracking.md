# 5. Real-time payment tracking

Status: built (2026-10-27); partial payments cannot occur for India sellers, but the roll-up is tested.

## Goal

Reconcile webhook payments and transaction history, preserving gross, fee, net and currency.

## User story

As an Indian freelancer paid through PayPal, I want to see receipts, fees and partial payments together so I can prepare reliable records for my CA.

## Acceptance criteria

- [x] Webhook receiver verifies PayPal signatures and records invoice-paid / capture events
- [x] Nightly sync via transaction history catches anything webhooks missed
- [x] Each payment shows gross, fee, net and linked invoice; partial payments roll up correctly

## Data & APIs used

invoices, payments; verified webhooks; Server SDK transaction search for backfill.

## Edge cases

Duplicate or out-of-order events; invalid signatures; partial payments; missing conversion details; replayed sync.

## Test cases

- [Webhook signature verification](../../packages/paypal/src/webhooks/index.test.ts) and [webhook routes](../../apps/api/src/routes/webhooks.test.ts) cover verification before writes, invalid signatures, malformed events, duplicate/out-of-order deliveries, pending captures and invoice-paid/capture event handling.
- [SDK ledger adapter](../../packages/paypal/src/sdk/index.test.ts) covers gross, fee, net and FX mapping, missing conversion details, and malformed capture data.
- [Invoice and payment storage](../../packages/db/src/invoices.test.ts) covers deduplication, SQL partial-payment roll-up, concurrent payments, unmatched captures, relinking and user isolation.
- [Reconciliation](../../apps/api/src/sync.test.ts) covers missed-payment backfill, replay, already-recorded transactions, skipped captures and failures. Payment-field display is covered by the user's P3-15 browser check below.
- User-confirmed P3-15 (2026-10-27): the webhook recorded one payment on the paid one-time invoice. Later CLI reconciliation returned `{"seen":3,"alreadyRecorded":1,"recorded":0,"skipped":2,"failed":0}`; the invoice retained one payment row. `skipped` means a capture was not found or was not completed; this summary does not distinguish the two. The optional scratch-database webhook-miss run was not performed; backfill is covered by automated tests.

## Limitations

- India sellers cannot accept partial payments; the roll-up is verified with synthetic integration-test captures.
- Recurring-cycle adoption and payment linking remain pending (see [spec 04](04-export-invoicing.md#india-sandbox-limitations)). Unmatched completed captures are stored without an invoice link.
- The `niryat-sync` cron is configured in `render.yaml`; the local CLI run is verified, while hosted scheduling remains a Phase 7 deployment check.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
