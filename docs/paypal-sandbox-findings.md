# PayPal India sandbox findings

Spike for the Day-1 checklist in [PLAN §21](PLAN.md#21-day-1-verification-checklist). Sandbox only; no product code was changed.
- Script: [scripts/spikes/paypal-india-check.ts](../scripts/spikes/paypal-india-check.ts)
- Last run: 2026-10-24, `https://api-m.sandbox.paypal.com`, India business seller to a US personal buyer. The REST app had Invoicing and Transaction Search enabled when it was created.
- Status: **8 of 8 answered.** #6's fee and net come from the payment itself. Transaction search has not indexed that payment yet; it is still needed for reconciliation.

## Result table

Verdicts: **works**, **partial**, **doesn't** (confirmed unsupported), **not yet tested** (blocked by setup).

| #   | Capability                                   | Verdict                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | OAuth token from `PAYPAL_CLIENT_ID`/`SECRET` | **works**                               | HTTP 200. 31 scopes, including `invoicing` and `reporting/search/read`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2   | Create + send USD invoice to a US buyer      | **works**                               | Create returned HTTP 201 and send returned HTTP 200. Invoice `INV2-JMTQ-SZYC-WXH2-FSFR` read back as `SENT`, 100.00 USD. `detail.note` and `detail.terms_and_conditions` (LUT wording) were accepted. The US buyer then paid it from the sandbox pay link (`detail.metadata.recipient_view_url`), and it read back as `PAID`, 100.00 USD, PayPal payment `8T315006AD0597744`.                                                                                                                                                                                                                                                                                                     |
| 3   | Invoice with partial payments allowed        | **doesn't**                             | HTTP 400 `INVALID_REQUEST` on `/configuration/partial_payment/allow_partial_payment`: "Partial payments are not available in your country." (debug_id `f8681207b0a2a`). It failed the same way with an India buyer and a US buyer, so it depends on the seller's country.                                                                                                                                                                                                                                                                                                                                                                                                         |
| 4   | Recurring invoice series (create + activate) | **works**                               | `POST /v2/invoicing/recurring-invoices` returned HTTP 201 and created series `RI-1RG15911RK697144M`.`POST …/activate` returned HTTP 204, and the series read back as `ACTIVE`. It is monthly and capped at 2 cycles.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 5   | Send invoice reminder                        | **works**                               | `POST /v2/invoicing/invoices/INV2-JMTQ-SZYC-WXH2-FSFR/remind` returned HTTP 204. Whether the reminder reached the buyer is not checked; see Sandbox Notifications.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 6   | Fee + net for the seller                     | **works** (per payment); search pending | `GET /v2/payments/captures/8T315006AD0597744` returned HTTP 200, `COMPLETED`. `seller_receivable_breakdown` gave gross 100.00 USD, `paypal_fee` 4.96 USD and `net_amount` 95.04 USD, with `invoice_id` `INV2-JMTQ-SZYC-WXH2-FSFR`, created 2026-10-24T17:30:49Z. There was no exchange-rate or conversion block; the seller's balance stays in USD. **Transaction search** (HTTP 200) has not indexed this sale yet. Its index stayed at `2026-10-24T16:29:59Z` across two runs. The only row it returned was `T1900` (account correction), +5,000.00 USD, which looks like the starting balance of a new sandbox account. The script judges fees only on payment rows (`T00xx`). |
| 7   | Disputes list (Disputes v1)                  | **works** (read only)                   | `GET /v1/customer/disputes` returned HTTP 200 with zero items. Opening a dispute from the buyer account is unverified.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 8   | Invoice attachment upload                    | **partial**                             | No upload exists. `POST /v2/invoicing/invoices/{id}/attachments` on a real draft returned HTTP 404. A draft carrying `detail.attachments[{ id, reference_url }]` with an ID PayPal never issued was accepted (HTTP 201) and stored 1 attachment. PayPal therefore stores attachments as unvalidated references. Whether a buyer can open such a link was not checked.                                                                                                                                                                                                                                                                                                             |

## What this means for Niryat

- **Invoicing works for exports (#2, #4, #5).** One-time invoices, recurring series and reminders all work from an India seller to a foreign buyer.
- **India sellers cannot invoice customers inside India.** An earlier run with an India-located buyer got HTTP 406 `INR_FOREIGN_CURRENCY_BLOCKED` on send: "We're unable to send invoices to customers within India." That fits the export-only scope. Validate the recipient's country before sending, rather than surfacing PayPal's error.
- **Partial payments are unavailable for India sellers (#3).** Feature 04 has to record this limitation and keep the rest of invoicing ([paypal.md](paypal.md)).
- **Fee and net (#6):** read them from the capture's `seller_receivable_breakdown` (`gross_amount`, `paypal_fee`, `net_amount`), keyed by `invoice_id`. Do not compute them or wait for transaction search, which lagged more than an hour behind a payment here. Use search only for nightly reconciliation.
- **Timestamps:** the invoice's `payments.transactions[].payment_date_time` read `2026-10-24T10:30:50Z` for a capture created at `17:30:49Z`. That is exactly 7 hours earlier, which suggests Pacific time labelled as UTC. Take payment times from the capture, not the invoice, until this is understood.
- **Attachments (#8):** do not rely on `detail.attachments` for the export invoice PDF. Arbitrary references are stored but not validated, and there is no upload. Use the documented fallback: link the PDF in `detail.note`.
- These are sandbox API answers. Confirm the India restrictions (#3 and the domestic-recipient block) with PayPal India before treating them as live-account behaviour.

## Remaining

1. **#6, search side (optional):** fee and net are confirmed from the capture. Once the script's #6 index time passes 2026-10-24T17:30:49Z, rerun it to confirm transaction search also shows the sale's `fee_amount`. That covers the nightly reconciliation path.
2. **#7, optional:** the buyer opens a dispute on that payment, then rerun to confirm it is listed.
3. **#8, optional:** open the sent invoice as the buyer and check whether a `reference_url` attachment shows up. A draft with an attachment would need to be sent for this. The spike deletes its attachment draft, so this needs a manual test.

## Setup gotchas (observed 2026-10-24)

- **App features must be enabled on the sandbox REST app.** Without Invoicing and Transaction Search, every call returns HTTP 403 `NOT_AUTHORIZED`, which says nothing about India. The script detects a missing scope and marks the check blocked.
- **Enabling features does not change a token you already have.** PayPal returns the same cached client-credentials token on every request until it expires, about 9 hours (`expires_in=32400`). Two token requests in a row returned an identical token fingerprint, and scopes are fixed when a token is issued. Either wait for the old token to expire, or use a new app, which is what worked here. PayPal's REST auth docs describe no way to revoke a client-credentials token early.
- **The buyer's country comes from its sandbox account, not its email.** Sandbox accounts default to the developer's country. A `personal.example.com` buyer created in India triggered the domestic-recipient block. Create the buyer explicitly with country United States.

## Documented surface

These come from PayPal's developer reference, read on 2026-10-24.
- **Recurring series:** [recurring-invoices create](https://developer.paypal.com/api/invoicing/v2/recurring-invoices-create), get, update, search and `POST …/{id}/activate`.
  - The body needs `plan_detail.frequency` (`interval_unit` DAY/WEEK/MONTH/YEAR, `interval_count`) and `recurring_info` (`detail.currency_code`, one `primary_recipients` entry).
  - Series are created as DRAFT and then activated.
  - An earlier version of this doc wrongly said no recurring resource exists. The reference and #4 show it does.
- **Attachments:** [`detail.attachments`](https://developer.paypal.com/api/invoicing/v2/definitions/detail) is "an array of PayPal IDs for the files that are attached to an invoice". Each entry has `id`, `reference_url`, `content_type`, `size` and `create_time`. No upload endpoint is documented.
- **Net:** the capture (`GET /v2/payments/captures/{id}`) returns `seller_receivable_breakdown.net_amount` directly (observed in #6). `GET /v1/reporting/transactions` returns only `transaction_amount` and `fee_amount`, so the spike derives net there as gross + (negative) fee.

## Rerun

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file=.env scripts/spikes/paypal-india-check.ts
```

The script prints one line of evidence per check. It never prints tokens, secrets or the full buyer email.

Each rerun creates new sandbox objects:
- Checks 2–5 email the buyer.
- Check 4 creates and activates another two-cycle monthly series.
- Check 8 creates a draft and deletes it.

Left in the seller sandbox account, all harmless:
- Sent invoices from #2 and #4.
- Active series `RI-1RG15911RK697144M`, which will generate one more invoice next month.
- An unsent draft, `INV2-XKTJ-MQVB-D825-RKGE`, from the India-buyer run.

## Notes for the spike

- Nothing was installed. The script uses `fetch` and the root `zod` dependency. The Server SDK stays uninstalled until its spec says otherwise ([AGENTS.md](../AGENTS.md)). Transaction Search is called through its REST endpoint, the same service the SDK wraps.
- `packages/paypal/rest` has no implementation, so the script has its own thin transport and reuses only that package's path type.
- `scripts/tsconfig.json` includes `*.mts` only, so it does not cover this script. The script type-checks cleanly against the base config when run ad hoc.
