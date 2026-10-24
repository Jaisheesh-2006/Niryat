# ADR 0002: Three PayPal integration layers

Status: accepted.

Use the TypeScript Server SDK for transaction search/refunds, PayPal Agent Toolkit for AI-facing approved actions, and typed REST for Invoicing v2/Disputes v1. This covers the SDK gaps while preserving clear ownership of deterministic ledger access and agent actions.

Keep adapters unimplemented until their specs are selected. Every PayPal action requires user approval. Sandbox availability must be tested with an India seller; see [PayPal guide](../paypal.md).
