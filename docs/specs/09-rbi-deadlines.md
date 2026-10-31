# 9. RBI deadline tracker with PayPal reminders

Status: built and user-verified (2026-10-31). `realisationDeadline` reads its period from YAML `params`; calendar-month clamping, the inclusive deadline day and the uncertain historical window are documented in [rules sources](../rules-sources.md#rbi--fema). Reminders use approved REST requests ([ADR 0004](../decisions/0004-reminders-via-rest.md)).

## Goal

Track versioned realisation deadlines and propose approved PayPal reminders.

## User story

As an Indian freelancer paid through PayPal, I want to know when payment is due and approve reminders so I can prepare reliable records for my CA.

## Acceptance criteria

- [x] Each unpaid invoice shows days remaining
- [x] Reminder proposals at 60 and 30 days before the deadline; sent via PayPal after approval
- [x] Deadline value changes in one place (the rules file)

## Data & APIs used

invoices, payments, tasks, agent_actions; `RBI_REALISATION`; Invoicing v2 REST reminder API. Stage 60 covers 31–60 days remaining and stage 30 covers 0–30; overdue invoices create tasks instead of reminder candidates. Proposals deduplicate by user, invoice and stage, including rejected proposals. An older pending stage remains immutable when a later stage is proposed.

## Edge cases

Part-paid or refunded invoices; changed rule effective date; reminders already sent; rejected approval; overdue invoices.

## Test cases

- [Deadline rule](../../packages/rules/src/rbi-deadline.test.ts): YAML-only period change, invalid/missing params, non-INR/INR periods, month-end and leap-year clamps, day zero, stage boundaries, overdue dates and the inclusive 2025-11-14–2026-06-04 uncertainty window. The window is flagged, not silently assigned a confirmed historical period.
- [Invoice routes](../../apps/api/src/routes/invoices.test.ts): owner-scoped deadline display, overdue task dedupe, no deadline after full payment and a restored deadline after refund shortfall. [Realisation rules](../../packages/rules/src/realisation.test.ts) cover part-paid/refunded amounts and bank-review qualifications.
- [Candidate selection](../../apps/api/src/reminders.test.ts), [reminder storage](../../packages/db/src/agent-runs.test.ts) and [close orchestration](../../apps/api/src/close.test.ts): due sent/part-paid invoices only, no existing stage key, rejection stays final, no-advice proposals survive AI failure/budget exhaustion, and hold advice remains advisory.
- [Approval routes](../../apps/api/src/routes/invoices.test.ts) and [REST transport](../../packages/paypal/src/rest/client.test.ts): exact standard flags, one user approval claim and one POST, paid-after-proposal rejection, unknown outcomes blocked across restart, no retry after network/HTTP/read failure and no cross-user execution. [Web tests](../../apps/web/src/lib/forms.test.ts) cover due/overdue labels and standard-reminder states.
- P5-13 user evidence: deadline 2027-07-31; 45-day `asOf` produced stage 60, 30-day `asOf` produced stage 30; approved reminder reached the buyer's sandbox notifications; repeated/rejected stages did not duplicate. The paid invoice left the candidate list, and a separate unpaid invoice received hold advice for the same client's dispute. Exact reminder HTTP status remains unrecorded; see [V03](../verification.md#v03-invoicing-and-reminders).

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
