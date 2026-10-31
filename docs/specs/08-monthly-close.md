# 8. Monthly close agent (acts in PayPal)

Status: built (2026-10-31); Claude investigates with read-only tools and drafts proposals; reminders run through REST Invoicing v2 ([ADR 0004](../decisions/0004-reminders-via-rest.md)); hosted Render deployment is Phase 7. The user verified the scheduled CLI fallback and manual close; Workflows dev and hosted scheduling remain unverified.

## Goal

Propose monthly-close work and execute PayPal actions only after user approval.

## User story

As an Indian freelancer paid through PayPal, I want to review and approve monthly-close actions so I can prepare reliable records for my CA.

## Acceptance criteria

- [x] Runs on schedule and via a "Close this month" button
- [x] Proposed PayPal actions shown as an approval list; nothing runs without approval
- [x] Every number in the summary comes from PayPal data and the rules engine
- [x] Every tool call is logged for transparency

## Data & APIs used

agent_actions, agent_runs, agent_tool_calls, tasks and monthly ledger; Claude Agent SDK; five scoped PayPal Agent Toolkit reads; REST reminder handler; Render Workflows task plus monthly cron; approval queue. See [agent boundary](../decisions/0005-agent-boundary.md).

## Edge cases

Concurrent or retried runs; rejected proposals; revoked approval; budget exhaustion; missing FIRA; no duplicate action execution.

## Test cases

- [Close orchestration](../../apps/api/src/close.test.ts): ordered system/agent calls, fake PayPal reads before drafts, dispute hold advice, task/focus persistence, SQL ledger totals, rule deadlines, missing/current-month FIRA, unavailable/failed/budget-exhausted AI, immutable proposals, audit failures and per-user isolation. Deterministic figures survive AI failure; free-text notes are digit-free.
- [Run storage](../../packages/db/src/agent-runs.test.ts) and [close routes](../../apps/api/src/routes/close.test.ts): one concurrent run per user/kind, stale-run replacement, owner-scoped history, sequenced logs, deployment-wide spend and HTTP 202 background dispatch. [Worker tests](../../apps/worker/src/index.test.ts) and [trigger tests](../../apps/worker/src/trigger.test.ts) cover scheduling inputs and dispatch with fakes.
- [Invoice/approval routes](../../apps/api/src/routes/invoices.test.ts): rejected proposals stay rejected, parallel approval executes once, payload/ownership checks precede writes, and failed/interrupted reminders cannot be resent. "Revoked approval" means rejecting a proposed action or a definitively failed reminder; an already claimed or unknown-outcome reminder cannot be revoked as unsent.
- [Agent tools](../../packages/agent/src/close-agent.test.ts), [PayPal projections](../../packages/agent/src/paypal-tools.test.ts) and [SDK wrapper](../../packages/agent/src/claude.test.ts): known entities only, draft-only tools, injection containment, five-read allowlist, ownership filtering, read limits, isolated subprocess environment, no built-in tools and retained drafts/cost on SDK failure.
- [Web forms](../../apps/web/src/lib/forms.test.ts) and [approval UI](../../apps/web/src/components/ActionButtons.test.tsx): running/budget/failure messages, tool logs, standard-reminder wording, internal advice and approval controls that remain locked until refreshed state is known.
- User-confirmed P5-13 (2026-10-31): scheduled CLI approval list, manual close and concurrent-run message, summary/invoice figures, approved reminder and sandbox notification, rejection dedupe, budget fallback and client-level hold advice with a separate suggested dispute-review task. See [V03](../verification.md#v03-invoicing-and-reminders) and [V11](../verification.md#v11-hosted-resources) for the accepted fallback and evidence limits.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
