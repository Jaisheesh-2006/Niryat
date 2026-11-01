# 10. GSTR-1 export data

Status: implemented; reconciliation and registration gating user-confirmed (2026-11-01). Offline-tool import remains blocked before CSV validation. Source: [PLAN section 5](../PLAN.md#5-v1-features-in-order-of-importance).

## Goal

Prepare reconciled GSTR-1 export data for the selected reporting period.

## User story

As an Indian freelancer paid through PayPal, I want to prepare export data for my GST return so I can prepare reliable records for my CA.

## Acceptance criteria

- [ ] Output matches the GST offline tool format (CSV/JSON — format to be verified on Day 1)
- [x] Totals reconcile with PayPal invoices and refunds for the period
- [x] Shown only for GST-registered users

## Data & APIs used

`GET /gstr1` previews the selected period; `POST /gstr1/file` generates the ten-column Table 6A CSV. Both require a session and GST registration. Invoice dates select invoices; IST receipt dates select refunds. GSTR1_6A and CREDIT_NOTE supply calculations and citations.

Only invoices covered by the profile's inclusive LUT dates enter the WOPAY file. Uncovered invoices are listed with an explanation. The user supplies each invoice's INR exchange rate and applicable IGST percentage separately; neither is inferred, fetched or stored. No IGST is charged in this file. Refunds reduce the separate reconciliation totals; credit-note data is listed for Table 9B, outside the CSV (U2–U3).

P6-11: profile persistence, per-currency reconciliation and the not-registered view passed. Returns Offline Tool V3.2.4 rejected the synthetic GSTIN before import; December was also unavailable for the selected October–December quarter. The downloaded CSV was never parsed by the tool. Criterion 1 stays open; this is neither an import pass nor evidence that the CSV was rejected. See [V10](../verification.md#v10-gstr-1-format) and [P6-11 evidence](../verification.md#v16-phase-6-acceptance).

## Edge cases

Unregistered profiles; empty periods; refunds across periods; rounding and currency reconciliation; rejected portal format.

## Test cases

- [Rules](../../packages/rules/src/gstr1.test.ts): monthly/quarterly periods and year boundaries; inclusive LUT coverage; invalid dates/rates; explicit GST percentage; exact rounding, large values and empty periods.
- [Preview/CSV](../../apps/api/src/gstr1.test.ts): per-currency reconciliation, cross-period refunds by IST date, exclusions, exact header/order, dates, CRLF and supplied rates.
- [Routes](../../apps/api/src/routes/gstr1.test.ts): authentication, registration/frequency gates, malformed inputs and missing rates; stored-ledger reconciliation and user isolation.
- [Web](../../apps/web/src/app/gstr1/page.test.tsx): period navigation, registration messages, rate labels without defaults, LUT exclusions, empty periods and disabled downloads. Offline-tool parser acceptance remains manual.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
