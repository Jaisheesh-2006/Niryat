# ADR 0004: Approved REST reminders with PayPal's standard wording

Status: accepted; user decisions 2026-10-30, implemented and sandbox-tested by 2026-10-31.

## Decision

Approved reminders use the existing typed REST client: `POST /v2/invoicing/invoices/{invoice_id}/remind`. The immutable request body is exactly `{ send_to_invoicer: false, send_to_recipient: true }`. Omit `subject`, `note` and additional recipients. Claude supplies send/hold advice and a reason inside Niryat; PayPal supplies its standard notification wording. There is no email draft, template selector or separate email channel.

The user reviews the proposal and explicitly approves it. The handler checks ownership, invoice IDs, payload shape and current local unpaid state. A hold recommendation does not block the user's choice or execute anything. A paid invoice is rejected as no longer needing a reminder.

## Corrected rationale

The initial claim that the Toolkit could not supply a request ID or wording was incorrect. Published Toolkit 1.11.0 forwards `subject`/`note`, and `configuration.context.request_id` adds `PayPal-Request-Id`. Neither fact proves this endpoint's idempotency or delivery of custom wording. The checked reminder reference says PayPal replaces custom wording with its own. The user's REST and standard-wording decisions stand. Exact-version findings and primary references are in [tooling sources](../tooling-sources.md#invoicing-v2-reminders).

## Failure and retry policy

Until endpoint idempotency is established, each reminder gets at most one approval claim, from `proposed`, and one reminder POST. Transport retries and 401 refresh-and-resend are disabled for this call. An interrupted response, HTTP 5xx, unreadable response or unclassified send failure becomes `reminder_outcome_unknown`; a crash after claim can leave `approved`. Neither state permits another send or rejection as definitely unsent. Definitive failures also cannot be resent, but may be rejected. Other action types retain their existing retry rules.

This can leave a reminder unsent after a failure. It avoids duplicate notifications without claiming that the request-ID header guarantees deduplication. Job recovery must preserve that restriction; it must not reset or replay a claimed reminder.

## Acceptance versus delivery

The API documents HTTP 204 as request acceptance, not proof of receipt. The earlier sandbox spike observed 204. In P5-13 the UI showed acceptance and the buyer's sandbox inbox separately showed `Reminder from Ananya Rao (2026-27/0006)`, at 1:08 p.m. on 2026-10-31 as displayed. This run's raw HTTP status was not captured. External mailbox delivery and message-body wording were not inspected. See [V03](../verification.md#v03-invoicing-and-reminders).

Toolkit reads are in use under [ADR 0005](0005-agent-boundary.md); only Toolkit writes remain deferred. No new dependency or mail service is needed for this decision.
