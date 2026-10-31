# ADR 0005: Investigate with scoped reads; persist drafts for user approval

Status: accepted; golden-rule read exception approved by the user on 2026-10-30, implemented and sandbox-tested by 2026-10-31.

## Tools and ownership

Claude uses Niryat read tools over the user's ledger, FIRA and rules-derived views, plus five PayPal Agent Toolkit reads: `get_invoice`, `list_invoices`, `get_dispute`, `list_disputes` and `list_transactions`. Only Niryat wrappers are registered with the Claude Agent SDK. No Toolkit write tool or Toolkit MCP server is exposed. Configuration discovery is insufficient: the wrapper checks its allowlist before every dispatch.

Inputs pass zod and must reference the run's known invoice, capture and dispute IDs. Transaction date ranges stay inside the requested month, at most 31 days; PayPal reads are capped at 15 per run. Outputs pass zod, are projected and filtered to the user's known records. PayPal names, emails, addresses, links and raw bodies are dropped before reaching Claude. The transparency log records only item/byte summaries for Toolkit responses. One seller serves the deployment; ownership filtering is essential, not optional.

The user-approved golden-rule exception applies only to Niryat's in-product allowlisted reads, with logging and filtering. It does not authorize coding assistants to call PayPal or authorize any model to execute a write.

## Drafts and deterministic figures

`propose_reminder`, `suggest_task` and `write_summary` validate known entities and collect drafts in memory. They receive a narrow data source, not a database or PayPal write client. Reminder drafts can only advise send/hold for an existing rule-due candidate. Code persists actions as `proposed`, deduplicated by user/invoice/stage, then creates validated tasks. Only authenticated user approval can claim and execute an action.

Summary numbers come from SQL aggregates over PayPal-sourced records and pure rules. Generated advice, reasons and narrative contain no digits; code adds invoice/dispute labels, amounts, dates and citations. Extraction is a separate draft tool: numeric fields are permitted only as structured values checked against verbatim source text. Extracting or discarding saves no client or invoice; the user submits the forms, chooses legal fields and separately approves sending.

Every system and agent tool call is logged with ordered sequence, validated input/output and outcome. Pasted extraction text is not retained in the log; only found field names are recorded. Prompt-injection text cannot expand tool names or entity sets.

## SDK isolation and budget

The SDK gets `tools: []`, a built-in deny list, only Niryat's MCP server, strict MCP configuration, no filesystem settings or persisted session, and a minimal subprocess environment. PayPal/database/storage credentials stay outside that environment. Bare `allowedTools` entries can bypass `canUseTool`; the observed SDK warning is not a per-call authorization guarantee. Registry dispatch, zod handlers and ownership projections remain the enforcement points, with all execution/approval tools absent.

Runs have bounded turns and cost. The monthly spend cap is deployment-wide, based on stored cost estimates; one in-flight run can overshoot it. Missing/failed/budget-exhausted AI still produces deterministic standard-reminder proposals with `agent: null`. Accepted drafts and reported costs survive later SDK errors. Summaries label AI failure accurately.

Hold advice remains advisory and can be imperfect. P5-13 demonstrated a client-level hold for a dispute on another invoice; its simulated-date run also used the imprecise phrase "payment today". This is not a reliable payment-in-progress signal. See [verification limits](../verification.md#v03-invoicing-and-reminders) and [Phase 7 reliability checks](../build-flow.md#phase-7-judge-mode-hosting-and-freeze-nov-58).
