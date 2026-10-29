# PayPal India sandbox findings

Spike for the Day-1 checklist in [PLAN §21](PLAN.md#21-day-1-verification-checklist). Sandbox only; no product code was changed.
- Script: [scripts/spikes/paypal-india-check.ts](../scripts/spikes/paypal-india-check.ts)
- Last run: 2026-10-24, `https://api-m.sandbox.paypal.com`, India business seller to a US personal buyer. The REST app had Invoicing and Transaction Search enabled when it was created.
- Status: **8 of 8 answered** (final run 2026-10-25). Webhooks, opening a dispute and Log in with PayPal were outside this spike; see [build flow Phase 0](build-flow.md#phase-0-close-the-day-1-checklist-oct-2425).

## Result table

Verdicts: **works**, **partial**, **doesn't** (confirmed unsupported), **not yet tested** (blocked by setup).

| #   | Capability                                   | Verdict               | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | OAuth token from `PAYPAL_CLIENT_ID`/`SECRET` | **works**             | HTTP 200. 31 scopes, including `invoicing` and `reporting/search/read`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2   | Create + send USD invoice to a US buyer      | **works**             | Create returned HTTP 201 and send returned HTTP 200. Invoice `INV2-JMTQ-SZYC-WXH2-FSFR` read back as `SENT`, 100.00 USD. `detail.note` and `detail.terms_and_conditions` (LUT wording) were accepted. The US buyer then paid it from the sandbox pay link (`detail.metadata.recipient_view_url`), and it read back as `PAID`, 100.00 USD, PayPal payment `8T315006AD0597744`.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 3   | Invoice with partial payments allowed        | **doesn't**           | HTTP 400 `INVALID_REQUEST` on `/configuration/partial_payment/allow_partial_payment`: "Partial payments are not available in your country." (debug_id `f8681207b0a2a`). It failed the same way with an India buyer and a US buyer, so it depends on the seller's country.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 4   | Recurring invoice series (create + activate) | **works**             | `POST /v2/invoicing/recurring-invoices` returned HTTP 201 and created series `RI-1RG15911RK697144M`.`POST …/activate` returned HTTP 204, and the series read back as `ACTIVE`. It is monthly and capped at 2 cycles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 5   | Send invoice reminder                        | **works**             | `POST /v2/invoicing/invoices/INV2-JMTQ-SZYC-WXH2-FSFR/remind` returned HTTP 204. Whether the reminder reached the buyer is not checked; see Sandbox Notifications.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 6   | Fee + net for the seller                     | **works**             | `GET /v2/payments/captures/8T315006AD0597744` returned HTTP 200, `COMPLETED`. `seller_receivable_breakdown` gave gross 100.00 USD, `paypal_fee` 4.96 USD and `net_amount` 95.04 USD, with `invoice_id` `INV2-JMTQ-SZYC-WXH2-FSFR`, created 2026-10-24T17:30:49Z. There was no exchange-rate or conversion block; the seller's balance stays in USD. **Transaction search** has also caught up. The index refresh at `2026-10-25T02:29:59Z` returned the sale as `T0006` `8T315006AD0597744`: 100.00 USD, `fee_amount` −4.96. Its `invoice_id` was the invoice **number** (`SPIKE-MVMO626H-64`), not the `INV2-…` ID. The earlier refresh at `16:29:59Z` had missed it. The other row, `T1900` (+5,000.00 USD, no fee), looks like a new sandbox account's starting balance; the script ignores non-`T00xx` rows for fees. |
| 7   | Disputes list (Disputes v1)                  | **works** (read only) | `GET /v1/customer/disputes` returned HTTP 200 with zero items. Opening a dispute from the buyer account is unverified.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 8   | Invoice attachment upload                    | **partial**           | No upload exists. `POST /v2/invoicing/invoices/{id}/attachments` on a real draft returned HTTP 404. A draft carrying `detail.attachments[{ id, reference_url }]` with an ID PayPal never issued was accepted (HTTP 201) and stored 1 attachment. PayPal therefore stores attachments as unvalidated references. Whether a buyer can open such a link was not checked.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## What this means for Niryat

- **Invoicing works for exports (#2, #4, #5).** One-time invoices, recurring series and reminders all work from an India seller to a foreign buyer.
- **India sellers cannot invoice customers inside India.** An earlier run with an India-located buyer got HTTP 406 `INR_FOREIGN_CURRENCY_BLOCKED` on send: "We're unable to send invoices to customers within India." That fits the export-only scope. Validate the recipient's country before sending, rather than surfacing PayPal's error.
- **Partial payments are unavailable for India sellers (#3).** Feature 04 has to record this limitation and keep the rest of invoicing ([paypal.md](paypal.md)).
- **Fee and net (#6):** read them from the capture's `seller_receivable_breakdown` (`gross_amount`, `paypal_fee`, `net_amount`), keyed by `invoice_id`. Do not compute them or wait for transaction search: one refresh, about an hour after the payment, still missed it, and the next listed refresh that included it was hours later. Use search only for nightly reconciliation. Search's `invoice_id` holds `detail.invoice_number`, which is also the GST invoice number, so reconciliation can join on it.
- **Timestamps:** the invoice's `payments.transactions[].payment_date_time` read `2026-10-24T10:30:50Z` for a capture created at `17:30:49Z`. That is exactly 7 hours earlier, which suggests Pacific time labelled as UTC. Take payment times from the capture, not the invoice, until this is understood.
- **Attachments (#8):** do not rely on `detail.attachments` for the export invoice PDF. Arbitrary references are stored but not validated, and there is no upload. Use the documented fallback: link the PDF in `detail.note`.
- These are sandbox API answers. Confirm the India restrictions (#3 and the domestic-recipient block) with PayPal India before treating them as live-account behaviour.

## Remaining

1. **#7, optional:** the buyer opens a dispute on that payment, then rerun to confirm it is listed.
2. **#8, optional:** open the sent invoice as the buyer and check whether a `reference_url` attachment shows up. A draft with an attachment would need to be sent for this. The spike deletes its attachment draft, so this needs a manual test.

## Disputes and webhooks (2026-10-25)

Checked by hand in the sandbox and with read-only API calls.

| Check                 | Result                                                                                                                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buyer opens a dispute | **Works.** `PP-R-TBU-10194472` was created 2026-10-25T05:42:06Z on payment `8T315006AD0597744` (invoice `INV2-JMTQ-SZYC-WXH2-FSFR`), 100.00 USD. Reason `MERCHANDISE_OR_SERVICE_NOT_RECEIVED`, stage `INQUIRY`, status `WAITING_FOR_SELLER_RESPONSE`, seller response due 2026-11-14. |
| Disputes API reads it | **Works.** It is in `GET /v1/customer/disputes` and in `GET /v1/customer/disputes/{id}`, which gives the disputed transaction and invoice.                                                                                                                                            |
| Refund webhook        | **Delivered**, seen in Dashboard Event Logs. The refund was on invoice `INV2-C4CX-ZELE-MP48-2RSQ`, payment `7A790963PN770190D`, now `REFUNDED`.                                                                                                                                       |
| Dispute webhook       | **Not observed.** Webhook `7S408320GR6347324` subscribes to `CUSTOMER.DISPUTE.CREATED`/`UPDATED`/`RESOLVED`, but no dispute event appeared in Event Logs.                                                                                                                             |

Consequence for spec 06: do not rely on dispute webhooks alone. Poll the Disputes API on a schedule, using `update_time_after`, so a missed event is caught.

Not checked:
- Whether sandbox sends dispute events only once an inquiry escalates to a claim.
- Webhook signature verification.

## Refund and dispute shapes (2026-10-27)

P4-1, spec 06. Two individually user-approved, read-only sandbox MCP calls:
`get_dispute({ dispute_id: "PP-R-TBU-10194472" })` and
`list_disputes({ page_size: 50 })`. Only field names, formats, IDs and status/outcome
codes are recorded here. No application code, PayPal writes or object-storage calls.

### 1. Refund webhook (documented; actual sample unavailable)

The user could not locate the earlier refund event. The historical note above did
not record its exact type, so it does not establish `PAYMENT.CAPTURE.REFUNDED`.
No saved `.tmp/paypal/refund-event.json` was available. On 2026-10-27, the user
approved documented evidence for P4-1, with actual delivery verification deferred
to P4-15 step 3.

The official [Payments v2 schema](https://developer.paypal.com/api/payments/v2/schema.json),
`components.callbacks.capture_refunded`, defines `event_type` as
`PAYMENT.CAPTURE.REFUNDED` and `resource` as the refund schema. Its callback example
has `resource_type` `refund` and `resource_version` `2.0`.

| Path                  | Documented format or example                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `resource.id`         | String identifying the refund, distinct from the top-level webhook event ID                               |
| `resource.links[]`    | Objects with `href`, `rel`, `method`; the example has a GET `up` link ending `/v2/payments/captures/<id>` |
| `resource.invoice_id` | General string; the example does not have `INV2-…` format, so that format is not guaranteed               |

These are documented fields, not observations from this seller's delivery.
P4-15 step 3 must save an actual sandbox capture-refund event, verify the refund
ID, check the capture link and invoice-ID presence/format, and resolve any mismatch
before Phase 4 closes. P4-1's approved completion no longer requires the old event.

### 2. Dispute detail (observed)

`get_dispute` returned `PP-R-TBU-10194472`, status `WAITING_FOR_SELLER_RESPONSE`,
stage `INQUIRY`. Observed top-level fields:
`dispute_id`, `create_time`, `update_time`, `disputed_transactions`, `reason`,
`status`, `dispute_amount`, `dispute_state`, `fund_movements`,
`dispute_life_cycle_stage`, `dispute_channel`, `messages`, `extensions`, `evidences`,
`seller_response_due_date`, `offer`, `refund_details`, `allowed_response_options`,
`links`.

| Path                                            | Observed format                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `disputed_transactions[].seller_transaction_id` | Alphanumeric string; capture ID                                                                        |
| `disputed_transactions[].invoice_number`        | String with `INV2-…` format                                                                            |
| `dispute_amount`                                | Object with `currency_code` (three uppercase letters) and `value` (decimal string, two decimal places) |
| `reason`                                        | Uppercase underscore-separated code string                                                             |
| `status`                                        | Code string; `WAITING_FOR_SELLER_RESPONSE`                                                             |
| `dispute_life_cycle_stage`                      | Code string; `INQUIRY`                                                                                 |
| `dispute_outcome.outcome_code`                  | Absent: no `dispute_outcome` object on this unresolved dispute; documented values below                |
| `seller_response_due_date`                      | RFC 3339 UTC timestamp string, `YYYY-MM-DDTHH:mm:ss.SSSZ`                                              |
| `update_time`                                   | RFC 3339 UTC timestamp string, `YYYY-MM-DDTHH:mm:ss.SSSZ`                                              |

### 3. Dispute list and pagination (observed and documented)

The response has top-level `items` and `links`. Its one item's fields are:
`dispute_id`, `create_time`, `update_time`, `disputed_transactions`, `reason`,
`status`, `dispute_state`, `dispute_amount`, `dispute_life_cycle_stage`,
`dispute_channel`, `seller_response_due_date`, `links`. Both `dispute_id` and
`update_time` are present; timestamps and money use the detail formats above.
The summary's `disputed_transactions[]` has `buyer_transaction_id`,
`buyer.payer_id` and `seller.merchant_id`, but no `seller_transaction_id`.
Read each dispute's detail to obtain the capture ID.

Response-level `links[]` entries have `href`, `rel` and `method`; the observed
relations are `self` and `first`, with absolute URL hrefs. No `rel: "next"` or
top-level `next_page_token` was returned, so multi-page traversal is unverified.
The [list reference](https://developer.paypal.com/api/customer-disputes/v1/disputes-list)
documents a HATEOAS next-page link when more results exist, `page` with
`page_size`, and the deprecated `next_page_token` query parameter carried in links.
The MCP tool exposes `page`, `page_size`, `dispute_state` and
`disputed_transaction_id`, but not `update_time_after`:
filter unverified; use the documented `update_time_after` query parameter.

### 4. Outcome codes (documented)

The [Disputes v1 outcome-code reference](https://developer.paypal.com/api/customer-disputes/v1/definitions/dispute_outcome_code)
lists `RESOLVED_BUYER_FAVOUR`, `RESOLVED_SELLER_FAVOUR`, `RESOLVED_WITH_PAYOUT`,
`CANCELED_BY_BUYER`, `ACCEPTED`, `DENIED` and `NONE` for
`dispute_outcome.outcome_code`. `ACCEPTED` and `DENIED` are deprecated.
The names in D8's `LOST_DISPUTE_OUTCOMES = ["RESOLVED_BUYER_FAVOUR", "ACCEPTED"]`
match the reference; no plan change is needed. This confirms documented names,
not a live lost-dispute response or its money movement.

## Invoicer tax ID (2026-10-26)

Checked by hand with PowerShell REST calls. A draft carrying `invoicer.tax_id` `27ABCDE1234F1Z5` (a synthetic GSTIN) was accepted as `INV2-R497-9J3K-BYTU-YSQH`, and the read-back echoed `tax_id` unchanged. The draft was deleted and never sent. So the GSTIN can go in `invoicer.tax_id` as PLAN §5 maps it. How the buyer sees it was not checked.

## Recurring series generation (2026-10-26)

Checked in the seller's sandbox web UI. Every monthly series from the spike runs (the spike was run several times) is `ACTIVE`, with its next occurrence on 24 or 25 Nov 2026. The Invoices tab lists only the spike's `SPIKE-…` one-time invoices. **No series has generated an invoice yet**, so activating on the start date did not create one immediately. How PayPal numbers a generated cycle invoice is still open.

A daily series was rejected: `plan_detail.frequency` `{ interval_unit: "DAY", interval_count: 1 }` returned HTTP 400 `INVALID_REQUEST`, issue `INVALID_INTEGER_MIN_VALUE` on `/plan_detail/frequency/interval_count` (debug_id `f5363330694b4`). A weekly series is used for the numbering check instead.

**A series cannot carry our invoice number.** Weekly series `RI-4LR45473RT776064X` was created with `recurring_info.detail.invoice_number` `RCHK-…/1`, and the create succeeded. The read-back `recurring_info.detail` held only `currency_code`, `category_code` and `payment_term`: PayPal dropped the number without an error. The DRAFT series has no field linking it to invoices it generates. Activating it with a body-less POST sent as form data returned HTTP 415 `UNSUPPORTED_MEDIA_TYPE` (debug_id `f309592d02c89`); the spike's body-less POST with no content type had returned 204. Re-sent with `Content-Type: application/json` and no body, activation succeeded and the series read back `ACTIVE`. Its first generated invoice, and PayPal's number for it, are due about a week later (check D3, around 2026-11-02).

## Invoice-paid webhook shape (2026-10-26)

A real `INVOICING.INVOICE.PAID` delivery (`event_version` `1.0`, sent 2026-10-25T05:33:39Z, for invoice `INV2-C4CX-ZELE-MP48-2RSQ`) was captured at a request-inspection URL. The invoice is wrapped as `resource.invoice` (`id`, `status`, `detail`, …), not placed directly under `resource`. `resource.invoice.payments.transactions[].payment_id` was `7A790963PN770190D`, the capture ID of that payment, so an invoice-paid event leads straight to the capture. The request carried `paypal-transmission-id`, `paypal-transmission-sig`, `paypal-auth-algo` (`SHA256withRSA`) and `paypal-cert-url` headers.

## Log in with PayPal (separate spike, 2026-10-25)

Tested with [paypal-login-check.ts](../scripts/spikes/paypal-login-check.ts): the authorization-code flow, then `GET /v1/identity/oauth2/userinfo`.

| Account                              | Result                             |
| ------------------------------------ | ---------------------------------- |
| US personal                          | Sign-in and profile retrieval work |
| India business (2 separate accounts) | Profile retrieval fails            |

India business run in detail:
- The code exchange returned HTTP 200 with `openid` and `email` in its scope.
- The reply had **no `id_token`**.
- `userinfo` failed with HTTP 400 `invalid_request`, "Unable to fetch details to serve the request", for both `schema=paypalv1.1` and `schema=openid`.

**Conclusion (superseded 2026-10-29, see below):** in sandbox, Log in with PayPal cannot identify an India business seller. Niryat therefore needs another sign-in method. The decision is recorded in [spec 01](specs/01-health-check.md#india-sandbox-limitations).

### Rerun with PayPal support's isolation steps (2026-10-27)

The script now refreshes the token before calling userinfo, and also tries `GET /v1/identity/openidconnect/userinfo?schema=openid`.

| Account                    | Refresh  | `oauth2/userinfo`         | `openidconnect/userinfo` |
| -------------------------- | -------- | ------------------------- | ------------------------ |
| US personal                | HTTP 200 | HTTP 200 (`paypalv1.1`)   | not reached              |
| India personal             | HTTP 200 | HTTP 200 (`paypalv1.1`)   | not reached              |
| India business (both runs) | HTTP 200 | HTTP 400 for both schemas | HTTP 401                 |
- **The cause is not region.** An India personal account works. (The business-account-type explanation drawn here was wrong; see the next section.)
- **A missing `id_token` is normal.** The two working accounts don't get one either, and their reply scopes match the business account's.
- **A stale token is ruled out.** A freshly refreshed token still fails.
- The `openidconnect` 401 shows nothing about business accounts on their own: the working accounts stopped at the first success and never reached that path.
- Not tested: a US business account, which would show whether every business account fails or only India ones.

Business-run debug IDs: `f708273beeed9` (`paypalv1.1`), `f95855074fd65` (`openid`), `f91405735dde4` (`openidconnect`).

### Root cause: the app owner cannot sign in to its own app (2026-10-29)

PayPal support: "We've seen that error before when API Caller is same as authenticating user." The failing India business runs signed in as the sandbox account that owns the REST app.

Rerun with the same app, signing in as a different India business sandbox account (one that does not own the app):
- Code exchange HTTP 200, refresh HTTP 200, `oauth2/userinfo?schema=paypalv1.1` HTTP 200 (paypal-debug-id `f60639618c4a7`).
- `user_id` present, email present (a `business.example.com` address), no `id_token`.

**Conclusion:** Log in with PayPal works for India business sellers. It fails only when the signing-in account is the one whose client ID and secret make the call. A sign-in app must therefore belong to a different PayPal account from the seller's. An `id_token` is returned only when requested with `response_type=code+id_token`. Niryat doesn't need it.

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
