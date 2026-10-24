# 8. Monthly close agent (acts in PayPal)

Status: planned; scaffold only. Source: [PLAN section 5](../PLAN.md#5-v1-features-in-order-of-importance).

## Goal

Propose monthly-close work and execute PayPal actions only after user approval.

## User story

As an Indian freelancer paid through PayPal, I want to review and approve monthly-close actions so I can prepare reliable records for my CA.

## Acceptance criteria

- [ ] Runs on schedule and via a "Close this month" button
- [ ] Proposed PayPal actions shown as an approval list; nothing runs without approval
- [ ] Every number in the summary comes from PayPal data and the rules engine
- [ ] Every tool call is logged for transparency

## Data & APIs used

agent_actions, tasks and monthly ledger; Claude Agent SDK, PayPal Agent Toolkit, Render Workflows; approval queue.

## Edge cases

Concurrent or retried runs; rejected proposals; revoked approval; budget exhaustion; missing FIRA; no duplicate action execution.

## Test cases (TODO)

- TODO: Add acceptance tests for each criterion, including the edge cases above.
- TODO: Add boundary, retry/idempotency and authorization tests where applicable.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
