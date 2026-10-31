# 4. PayPal export invoicing (one-time, recurring, milestone)

Status: invoicing built (2026-10-27); extraction built and user-verified (2026-10-31), with verbatim source quotes verified by code and confirmation before saving. Recurring-cycle numbering remains pending (see India sandbox limitations).

## Goal

Prepare confirmed export invoice data and approved PayPal invoices for each billing type.

## User story

As an Indian freelancer paid through PayPal, I want to review extracted details and send compliant invoices so I can prepare reliable records for my CA.

## Acceptance criteria

- [x] Extraction shows source text beside each extracted field; user confirms before saving
- [x] GST invoice PDF generated with all mandatory export fields
- [x] One-time PayPal invoice created and sent from the India sandbox account to a US sandbox buyer
- [x] Recurring series and partial-payment invoices work (or are documented as unavailable for India accounts)
- [ ] Invoice numbers are unique and consecutive per financial year, including recurring cycles

## Data & APIs used

clients, invoices, profiles, agent_actions, agent_runs and agent_tool_calls; Claude Agent SDK extraction; Invoicing v2 REST; PDF storage; approval queue.

## Edge cases

Duplicate requests; fiscal-year rollover; rejected extraction; unavailable India recurring/partial payments; attachment fallback.

## India sandbox limitations

Confirmed on 2026-10-25 for an India seller and US buyer ([findings](../paypal-sandbox-findings.md)):
- **Partial payments are unavailable** ("not available in your country"), so milestone invoices are documented as unavailable. Any alternative, such as one invoice per milestone, is a product decision.
- **Recipients inside India are blocked** on send (HTTP 406 `INR_FOREIGN_CURRENCY_BLOCKED`). Check the recipient's country (spec 03) before sending.
- **No attachment upload.** Host the GST invoice PDF and link it in `detail.note`.
- One-time invoices, recurring series (create + activate) and reminders work.
- **Recurring-cycle numbering remains pending.** In P3-1, PayPal accepted a series request containing `recurring_info.detail.invoice_number` but omitted it on read-back; the generated-cycle identifiers were not established. In the user's P3-15 run (2026-10-27), the active monthly series listed its first invoice as `2026-27/0002`, with the next occurrence on 2026-11-27. This does not establish later-cycle numbering or cycle adoption into Niryat. The handler stores the series ID, without fetching generated invoice IDs; recurring payment linking is not fully verified. See [verification V04](../verification.md#v04-recurring-invoices).
- **PDF limits:** Latin-1 printable text, values in the invoice currency without INR conversion, and no digital signature. PDFs are stored privately in S3-compatible storage and served through a file-token link; local storage details are in [local storage](../local-storage.md).
- P5-13 extraction, confirmation, Discard and amount-regression checks are user-confirmed (2026-10-31), and approved invoices reached the sandbox buyer. The historical P5-7 HTTP 422's detailed issue remains unavailable; the later successful run does not diagnose that earlier response. See [V03](../verification.md#v03-invoicing-and-reminders).

## Test cases

- [Extraction verification](../../apps/api/src/extraction.test.ts), [extraction route/service](../../apps/api/src/routes/extract.test.ts) and [agent extraction tool](../../packages/agent/src/extraction.test.ts) cover source quotes, complete amount/email tokens, separator/sign/currency-prefix regressions, user isolation, AI budget/failure handling and field-name-only logs. [Form tests](../../apps/web/src/lib/forms.test.ts) map rejected extraction to Discard without a save request, require client confirmation, leave export answers and SAC blank, and match existing clients. Browser acceptance is recorded in V03.
- [Invoice-number rules](../../packages/rules/src/invoice-number.test.ts) cover financial-year rollover, sequences and the permitted number format; [export-invoice rules](../../packages/rules/src/export-invoice.test.ts) cover mandatory fields, LUT endorsement, blocked exports and printable text. [PDF rendering](../../apps/api/src/pdf.test.ts) covers document output.
- [Invoice storage](../../packages/db/src/invoices.test.ts) covers consecutive allocation across users sharing the configured seller, concurrent issues, rollback without gaps, action transitions and per-user read isolation. Allocation includes numbers in Niryat's database, not invoices created independently in PayPal.
- [Invoices API](../../apps/api/src/routes/invoices.test.ts) covers one-time and recurring proposals, approval/rejection, ownership, retries after partial execution, unavailable configuration, PDF access and upload failure. [Approval runner](../../packages/agent/src/index.test.ts) covers claim-before-execute and failure handling.
- [REST client](../../packages/paypal/src/rest/client.test.ts), [invoice payloads](../../packages/paypal/src/rest/invoicing.test.ts) and [file storage](../../apps/api/src/files.test.ts) cover validation, token caching, retries, request IDs, attachment-link payloads and storage errors. [Web forms](../../apps/web/src/lib/forms.test.ts) and [client form](../../apps/web/src/components/ClientForm.test.tsx) cover inputs and blocked-invoice reasons.
- User-confirmed P3-15 (2026-10-27): PDF opens, India recipient is blocked, approved one-time invoice reaches the buyer and is paid, and a monthly two-invoice series is active. P5-13 (2026-10-31) adds extraction review, prefill, existing-client matching, Discard, positive/negative amount regressions and approved buyer delivery.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
