# 9. RBI deadline tracker with PayPal reminders

Status: planned; scaffold only. Source: [PLAN section 5](../PLAN.md#5-v1-features-in-order-of-importance).

## Goal

Track versioned realisation deadlines and propose approved PayPal reminders.

## User story

As an Indian freelancer paid through PayPal, I want to know when payment is due and approve reminders so I can prepare reliable records for my CA.

## Acceptance criteria

- [ ] Each unpaid invoice shows days remaining
- [ ] Reminder proposals at 60 and 30 days before the deadline; sent via PayPal after approval
- [ ] Deadline value changes in one place (the rules file)

## Data & APIs used

invoices, payments, tasks, agent_actions; RBI_REALISATION; Toolkit or Invoicing v2 reminder API.

## Edge cases

Part-paid or refunded invoices; changed rule effective date; reminders already sent; rejected approval; overdue invoices.

## Test cases (TODO)

- TODO: Add acceptance tests for each criterion, including the edge cases above.
- TODO: Add boundary, retry/idempotency and authorization tests where applicable.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
