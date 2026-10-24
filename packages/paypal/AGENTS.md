# PayPal conventions

Follow the root AGENTS.md and docs/paypal.md. Sandbox only.
sdk/ owns Server SDK transaction search and refunds.
rest/ owns typed Invoicing v2 and Disputes v1 transport.
webhooks/ owns signature verification; its scaffold fails closed.
Validate request/response boundaries with zod; keep tokens out of logs.
Route every PayPal action through user approval; model approval is insufficient.
Check India seller limitations and test retries/idempotency in the selected spec.
