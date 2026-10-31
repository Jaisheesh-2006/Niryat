# ADR 0002: Three PayPal integration layers

Status: accepted.

Use the TypeScript Server SDK for transaction search, capture/refund reads and approved refunds; the PayPal Agent Toolkit for scoped read-only agent tools ([ADR 0005](0005-agent-boundary.md)); and typed REST for Invoicing v2/Disputes v1. Approved reminders use REST and PayPal's standard wording ([ADR 0004](0004-reminders-via-rest.md)). This covers the SDK gaps while preserving ownership of deterministic ledger access and user-approved writes.

All three layers are implemented. Toolkit writes remain deferred. Every PayPal write requires user approval; the in-product read exception is scoped and logged under ADR 0005. Sandbox availability is tested with an India seller; see [PayPal guide](../paypal.md).
