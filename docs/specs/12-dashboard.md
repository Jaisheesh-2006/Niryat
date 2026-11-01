# 12. Dashboard with plain-English questions

Status: implemented; seven widget groups, theme and the requested nine-question acceptance check user-confirmed (2026-11-01). Sponsor licence coverage remains unverified. Source: [PLAN section 5](../PLAN.md#5-v1-features-in-order-of-importance).

## Goal

Present PayPal-backed widgets and supported natural-language questions.

## User story

As an Indian freelancer paid through PayPal, I want to ask questions about my income and fees so I can prepare reliable records for my CA.

## Acceptance criteria

- [x] Core widgets: income, PayPal fees, FX, refunds/disputes, health score, FIRA status, unpaid invoices
- [x] At least three natural-language questions work reliably in the demo
- [x] Custom theme matching Niryat branding

## Data & APIs used

`GET /dashboard` projects the user's ledger and health figures; `/dashboard` uses AG Studio/React 3.0.0 with Niryat theme tokens. Refunds and disputes occupy separate tiles within the seven required widget groups. FX shows PayPal-supplied rates and missing-rate counts; it does not calculate FX loss or invent rates. Display aggregations use numbers; compliance calculations remain exact in rules (U3).

AG Studio's Agent Framework calls the server-only Claude Messages adapter through `POST /dashboard/turn`. The server controls the model, session, budget, concurrency and run/tool logs; no PayPal action is exposed. The proxy projects no client emails/addresses or health-flag citations. Ledger aggregates, client names and statuses do go to Anthropic. Edit mode exposes the AI Assistant and widget layout controls. Digit-containing model prose becomes the figure note; tool arguments remain intact.

Initial live attempts failed with `dashboard_llm_reply_invalid` while the user configured Sonnet 5.5. Thinking-block incompatibility was the likely cause, not confirmed from a retained provider body. The current wire subset supports text/tool calls, not thinking. After guidance to use a model with thinking off by default, the user confirmed the requested 9/9 fresh-session questions. The final configured model was not independently inspected. Budget exhaustion and restoration also passed. Full attempt transcripts are not retained; see [P6-11 evidence](../verification.md#v16-phase-6-acceptance).

## Edge cases

Empty data; inaccessible client records; unsupported questions; missing FX data; expired sponsor licence.

## Test cases

- [Rows](../../apps/api/src/dashboard.test.ts): refund signs, IST month/year, rule-derived deadlines, empty data and exclusion of email/address fields.
- [Routes](../../apps/api/src/routes/dashboard.test.ts): authentication/isolation, monthly budget, concurrent turns, size limits, provider failure, stored runs/charges and sanitized logs without keys or model text.
- [Widgets](../../apps/web/src/lib/dashboard.test.ts): all required groups, existing source-field references, negative refunds, missing FX and health figures without citations.
- [Claude translation](../../packages/agent/src/dashboard-llm.test.ts): text/tool/result round-trips, digit replacement, truncated calls, unsupported replies and secret-safe errors using fake HTTP.
- [Browser adapter](../../apps/web/src/lib/dashboard-adapter.test.ts): events, completion, abort, coded errors, response validation and exact three prompt starters. Live repeatability and budget behavior are user-confirmed; no live assistant-run AI test was used.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
