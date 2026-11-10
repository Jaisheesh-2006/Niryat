# Niryat

An AI agent for Indian freelancers paid from abroad through PayPal.
It turns invoices, payments, refunds and disputes into export-compliance records for CA review. Every PayPal write requires user approval; legal/numeric logic belongs to sourced rules.

Built for the PayPal AI Hackathon, due November 12, 2026.
**Current status:** freelancer/CA views, two dashboards, multi-client calendar, sync freshness, durable-close dispatch and judge mode are implemented; [submission copy and video script](docs/submission.md) are ready for rehearsal. Hosted acceptance, real-FIRA/refund evidence, and Table 6A import remain open in [build flow](docs/build-flow.md) and [verification](docs/verification.md). AG Studio and Bryntum licence coverage through judging is user-confirmed.

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

verify runs strict typechecks, Biome, scaffold/guardrail checks and workspace tests. build validates source packages and produces the Next app. db:generate is offline; db:migrate requires DATABASE_URL. seed:judge creates shared synthetic demo accounts (see below). Root dev starts only web and API.

## Environment

[.env.example](.env.example) documents configuration keys; supply actual values privately and never commit them. The API and Next development config load the root `.env` when present. For local development, `API_URL=http://localhost:3001` connects web to API; `PUBLIC_APP_URL` is the browser origin and determines the PayPal callback `${PUBLIC_APP_URL}/api/auth/paypal/callback`. The configured callback must match the sandbox app exactly. See [HTTPS development setup](docs/paypal.md#log-in-with-paypal).

Development PayPal MCP uses the checked-in launcher. When you start the server, it uses an inherited sandbox access token or obtains one from sandbox PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in your private repository-root .env. No parent-editor token setup is required. Restart the server after updating credentials. No token is printed, saved or placed in config/arguments. See [setup and client checks](docs/paypal.md#development-mcp).

The optional earlier command remains supported: node --env-file=.env scripts/start-codex-paypal.mts (append claude or vscode for those clients).

## Judge mode and hosting

For a dedicated sandbox demo, supply inherited `DATABASE_URL`, `ENCRYPTION_KEY`, `JUDGE_MODE=true` and `JUDGE_BUYER_EMAIL`, apply migrations, then run `corepack pnpm seed:judge`. The seed reads inherited environment variables; it does not load an environment file. Start the API with `JUDGE_MODE=true`. Home, `/login` and `/ca/login` then offer **Try as freelancer (demo)** and **Try as CA (demo)** after hydration. Mode defaults off. Exact checks: [A5](docs/IMPROVEMENTS.md#a5-judge-mode-seed-and-try-as-judge-p0).

Judges share Ananya's freelancer account and a CA account linked to three freelancers. Historical invoices/payments/refund/dispute/FIRA are synthetic; unpaid fixtures have no PayPal invoice IDs and generate no reminder proposals. Only newly created, separately approved sandbox invoices can be sent to the US client. Buyer login is the privately supplied `JUDGE_BUYER_EMAIL`; obtain its password privately from the app owner. The user chose to keep the email private too. Never enter personal data in these shared accounts.

Reruns preserve judge edits and original seed dates, including ended sharing; they do not reset the demo or extend LUT validity. Ananya's LUT expires 15 days after the first seed. For later demos, refresh only its synthetic dates through the existing Profile form ([H3](docs/IMPROVEMENTS.md#h3-keep-alive-to-dec-15-and-refresh-demo-dates-p0-phase-8-user)); preserve database and invoice-number history. Reserved-email collisions fail without replacing accounts. No credentials are committed. Hosted/browser acceptance remains pending.

render.yaml defines web, API, monthly-close Workflows, monthly trigger, half-hour light reconciliation, nightly reconciliation and **paid** Postgres. Hosting, real dispatch and scheduling remain user checks in [Phase 7](docs/build-flow.md#phase-7-judge-mode-hosting-and-freeze-nov-58); nothing is deployed by the seed.

## Sponsor tools

- **AG Studio/React 3.0.0:** two dashboards: the freelancer's eight widgets at `/dashboard` and accepted clients' CA portfolio at `/ca`. Both share Niryat's theme, a cross-source filter built on data-source relationships, layouts saved in the browser, and an AI Assistant in edit mode, backed by Claude through a custom `AgLlmAdapter`, with a Niryat `explain_term` tool. Claude configures widgets through the authenticated server proxy; no AI key or PayPal tools reach the browser. `AG_STUDIO_LICENSE_KEY` is deliberately browser-visible. [Change record](docs/AG_STUDIO.md).
- **Bryntum Calendar/React 7.3.8:** category colours, filters, agenda/week/month/year/list views and action tooltips with rule sources where applicable. `/ca/calendar` adds client colours and filters across accepted shares. Freelancers drag their own tasks to plan work dates; legal deadlines stay locked, and server-rendered deadline lists remain as a fallback. The trial alias needs no key; coverage past December 15 is user-confirmed ([V15](docs/verification.md#v15-sponsor-licences)). [Change record](docs/BRYUNTUM.md).
- **Render:** the Blueprint defines Workflows monthly close and durable manual-close dispatch, 30-minute light sync without AI, nightly sync with reminders, and paid Postgres. Local manual close falls back to the API process without workflow configuration. Hosted webhooks and a Workflows close surviving an API restart are user-verified; the 30-minute freshness target is not yet measured. [Setup and evidence](docs/RENDER.md).
- **APIMatic:** the PayPal Context Plugin guided Server SDK integration, authentication, error handling and transport-based tests. Invoicing and Disputes remain REST. See the [usage log and shipped-code evidence](docs/apimatic-usage.md).

The business model is **free for freelancers; CA firms pay per client**; billing is not implemented. [Submission materials](docs/submission.md) include the five-scene script, limitations and outstanding user checks. Select AG Studio as the single sponsor-prize target.

## Read next

- [Full product plan](docs/PLAN.md) and [13 feature specs](docs/specs/)
- [Architecture](docs/architecture.md), [PayPal integration](docs/paypal.md), [glossary](docs/glossary.md)
- [Rules and review status](docs/rules-sources.md), [remaining verification](docs/verification.md)
- [Assistant/contributor instructions](AGENTS.md), [tooling sources](docs/tooling-sources.md), [ADRs](docs/decisions/)

MIT licensed. No production PayPal access or direct tax-portal filing.
