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

## Test cases (TODO)

- TODO: Add acceptance tests for each criterion, including the edge cases above.
- TODO: Add boundary, retry/idempotency and authorization tests where applicable.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
