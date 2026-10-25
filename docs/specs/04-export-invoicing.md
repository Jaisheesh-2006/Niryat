# 4. PayPal export invoicing (one-time, recurring, milestone)

Status: planned; scaffold only. Source: [PLAN section 5](../PLAN.md#5-v1-features-in-order-of-importance).

## Goal

Prepare confirmed export invoice data and approved PayPal invoices for each billing type.

## User story

As an Indian freelancer paid through PayPal, I want to review extracted details and send compliant invoices so I can prepare reliable records for my CA.

## Acceptance criteria

- [ ] Extraction shows source text beside each extracted field; user confirms before saving
- [ ] GST invoice PDF generated with all mandatory export fields
- [ ] One-time PayPal invoice created and sent from the India sandbox account to a US sandbox buyer
- [ ] Recurring series and partial-payment invoices work (or are documented as unavailable for India accounts)
- [ ] Invoice numbers are unique and consecutive per financial year, including recurring cycles

## Data & APIs used

clients, invoices, profiles, agent_actions; Invoicing v2 REST; PDF storage; approval queue.

## Edge cases

Duplicate requests; fiscal-year rollover; rejected extraction; unavailable India recurring/partial payments; attachment fallback.

## India sandbox limitations

Confirmed on 2026-10-25 for an India seller and US buyer ([findings](../paypal-sandbox-findings.md)):
- **Partial payments are unavailable** ("not available in your country"), so milestone invoices are documented as unavailable. Any alternative, such as one invoice per milestone, is a product decision.
- **Recipients inside India are blocked** on send (HTTP 406 `INR_FOREIGN_CURRENCY_BLOCKED`). Check the recipient's country (spec 03) before sending.
- **No attachment upload.** Host the GST invoice PDF and link it in `detail.note`.
- One-time invoices, recurring series (create + activate) and reminders work.

## Test cases (TODO)

- TODO: Add acceptance tests for each criterion, including the edge cases above.
- TODO: Add boundary, retry/idempotency and authorization tests where applicable.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
