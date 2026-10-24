# Niryat

An AI agent planned for Indian freelancers paid from abroad through PayPal.
It will turn invoices, payments, refunds and disputes into export-compliance records for CA review. Every PayPal action requires user approval; legal/numeric logic belongs to sourced rules.

Built for the PayPal AI Hackathon, due November 12, 2026.
**Current status: scaffold only.** The web home page, API health route and workflow stub work; product features and judge mode are not implemented.

## Setup

Use Node.js **24 LTS** and the pinned pnpm version through Corepack:

```sh
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

On PowerShell with blocked ps1 scripts, use corepack.cmd pnpm or pnpm.cmd.
Web: http://localhost:3000. API: http://localhost:3001/health returns status ok.
No credentials, database or environment file is needed for the skeleton.

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

[.env.example](.env.example) lists empty future integration values: PayPal credentials, sandbox environment, webhook ID, login return URL; Anthropic key/model/budget; database and storage URLs; encryption key; AG Studio/Bryntum licence keys. Do not commit real values. The skeleton does not load a root .env file; set integration values through your process environment or Render when the relevant feature is implemented.

Development MCP additionally needs a short-lived sandbox PAYPAL_ACCESS_TOKEN exported in the editor's parent environment. Start editors at the repository root. No token goes in config or command arguments. See [PayPal setup](docs/paypal.md#development-mcp).

## Judge mode and hosting

Judge mode, synthetic fixtures and hosted demo are TODOs; no judge credentials or button are shipped. render.yaml defines web, API, a Render Workflow and **paid** Postgres. Deployment needs an authorized Render account; no resources were provisioned by this scaffold. Workflow scheduling will be added with monthly close.

AG Studio and Bryntum are deferred: start licence trials on/after November 1, 2026 and confirm coverage through December 15 judging.

## Read next

- [Full product plan](docs/PLAN.md) and [13 feature specs](docs/specs/)
- [Architecture](docs/architecture.md), [PayPal integration](docs/paypal.md), [glossary](docs/glossary.md)
- [Rules and review status](docs/rules-sources.md), [remaining verification](docs/verification.md)
- [Assistant/contributor instructions](AGENTS.md), [tooling sources](docs/tooling-sources.md), [ADRs](docs/decisions/)

MIT licensed. No production PayPal access or direct tax-portal filing.
