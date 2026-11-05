# Niryat

An AI agent for Indian freelancers paid from abroad through PayPal.
It turns invoices, payments, refunds and disputes into export-compliance records for CA review. Every PayPal write requires user approval; legal/numeric logic belongs to sourced rules.

Built for the PayPal AI Hackathon, due November 12, 2026.
**Current status:** Phase 6 reports, calendar and dashboard are implemented; P6-11 local acceptance is recorded (2026-11-01). Table 6A import is blocked before CSV validation, and sponsor trial/judging coverage is unverified. Phase 4 real-FIRA/refund evidence and Phase 7 judge mode/hosting/reliability remain open in [build flow](docs/build-flow.md) and [verification](docs/verification.md#v16-phase-6-acceptance).

## PayPal and AI

Niryat uses the PayPal Developer Platform for approved Invoicing v2 invoice sends and standard reminders, Server SDK capture/refund reads and approved refunds, transaction-search reconciliation, REST Disputes reads and verified webhooks. The PayPal Agent Toolkit supplies five read-only tools, with responses filtered to the user's own records. One sandbox seller serves each deployment; [ADR 0004](docs/decisions/0004-reminders-via-rest.md) explains why approved reminders use REST.

The Claude Agent SDK powers source-quoted invoice extraction and a monthly-close agent that investigates the ledger and PayPal, prioritises work, advises send/hold and drafts tasks. Code validates every draft and computes every figure. Claude has no PayPal write or approval tools; the user confirms forms and approves actions. A shared AI budget bounds spend, and deterministic proposals remain available when AI is unavailable. See [ADR 0005](docs/decisions/0005-agent-boundary.md).

The demo FIRA is a **synthetic sample**, labelled on screen. Niryat parses and matches it to PayPal payments without AI; real-FIRA parser verification remains open.

## Setup

Use Node.js **24 LTS** and the pinned pnpm version through Corepack:

```sh
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

On PowerShell with blocked ps1 scripts, use corepack.cmd pnpm or pnpm.cmd.
Web: http://localhost:3000. API: http://localhost:3001/health returns status ok.
The health endpoint and purpose-code catalogue work without credentials. Sign-in and saved records require the database and private configuration.

If the combined development command does not bring up the API, run `corepack pnpm --filter @niryat/api dev` and `corepack pnpm --filter @niryat/web dev` in separate terminals. Confirm `/health` on port 3001 before using the web proxy. The combined-launch failure's cause remains unconfirmed.

For invoice PDFs during development, use [local S3 storage in Docker](docs/local-storage.md).
It works with the existing storage client and needs no AWS account.

## Commands

```sh
pnpm verify
pnpm build
pnpm --filter @niryat/rules test
pnpm format
pnpm db:generate
pnpm db:migrate
pnpm seed:judge
```

verify runs strict typechecks, Biome, scaffold/guardrail checks and workspace tests. build validates source packages and produces the Next app. db:generate is offline; db:migrate requires DATABASE_URL. seed:judge intentionally does nothing until judge mode lands. Root dev starts only web and API.

## Environment

[.env.example](.env.example) documents configuration keys; supply actual values privately and never commit them. The API and Next development config load the root `.env` when present. For local development, `API_URL=http://localhost:3001` connects web to API; `PUBLIC_APP_URL` is the browser origin and determines the PayPal callback `${PUBLIC_APP_URL}/api/auth/paypal/callback`. The configured callback must match the sandbox app exactly. See [HTTPS development setup](docs/paypal.md#log-in-with-paypal).

Development PayPal MCP uses the checked-in launcher. When you start the server, it uses an inherited sandbox access token or obtains one from sandbox PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in your private repository-root .env. No parent-editor token setup is required. Restart the server after updating credentials. No token is printed, saved or placed in config/arguments. See [setup and client checks](docs/paypal.md#development-mcp).

The optional earlier command remains supported: node --env-file=.env scripts/start-codex-paypal.mts (append claude or vscode for those clients).

## Judge mode and hosting

Judge mode and hosted demo remain TODOs; no judge credentials or button are shipped. render.yaml defines web, API, a monthly-close Workflow, monthly trigger cron, nightly reconciliation and **paid** Postgres. The local scheduled path was verified using `corepack pnpm --filter @niryat/api close:run --as-of 2027-07-01`; Workflows dev and hosted scheduling are unverified. Deployment needs an authorized Render account and the [Phase 7 reliability checks](docs/build-flow.md#phase-7-judge-mode-hosting-and-freeze-nov-58).

AG Studio/React 3.0.0 powers the dashboard's seven widget groups and Agent Framework. Claude builds widgets through Niryat's authenticated `/api/dashboard/turn` proxy, with a shared monthly budget and no browser-visible AI key or PayPal tools. The current adapter supports text/tool calls, not thinking blocks; P6-11 model-compatibility guidance recommended Sonnet 4.6 after Sonnet 5.5 response validation failures. `AG_STUDIO_LICENSE_KEY` is a deliberately browser-visible sponsor licence key.

Bryntum Calendar/React 7.3.8 displays read-only compliance events, state labels and links, with an accessible server-rendered fallback list. It uses the trial package alias, as the hackathon's Bryntum page prescribes, with no licence key; the user confirmed the trial lasts past December 15. AG Studio trial dates remain unverified in [V15](docs/verification.md#v15-sponsor-licences).

## Read next

- [Full product plan](docs/PLAN.md) and [13 feature specs](docs/specs/)
- [Architecture](docs/architecture.md), [PayPal integration](docs/paypal.md), [glossary](docs/glossary.md)
- [Rules and review status](docs/rules-sources.md), [remaining verification](docs/verification.md)
- [Assistant/contributor instructions](AGENTS.md), [tooling sources](docs/tooling-sources.md), [ADRs](docs/decisions/)

MIT licensed. No production PayPal access or direct tax-portal filing.
