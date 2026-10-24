# Niryat contributor instructions

Niryat prepares Indian export-compliance records from freelancers' PayPal activity.
The user approves every PayPal action; nothing is filed or moved automatically.
This commit is a scaffold. Product scope and ordering live in [PLAN](docs/PLAN.md).

## Map

- apps/web: Next.js App Router; placeholder dashboard/calendar host.
- apps/api: Hono on Node; health route, future REST/webhooks.
- apps/worker: Render Workflows monthlyClose stub.
- packages/rules: pure, cited legal/numeric logic; currently inert YAML metadata.
- packages/paypal: SDK, REST and webhook boundaries.
- packages/agent: future Claude + PayPal Toolkit; approval-queue contract.
- packages/db: Drizzle table stubs; packages/shared: shared boundaries.
- packages/config: strict TypeScript base and safe zod environment parser.
- docs/specs: thirteen ordered, unimplemented feature specs.

## Commands

Use Node 24 LTS and the pnpm version pinned in package.json, via Corepack.
On restricted PowerShell, use corepack.cmd pnpm or pnpm.cmd instead of the ps1 shim.
- Install: corepack pnpm install --frozen-lockfile
- Develop: pnpm dev (web :3000, API :3001; no credentials needed)
- Verify: pnpm verify; production check: pnpm build
- One package: pnpm --filter @niryat/rules test
- Format: pnpm format (Biome check with safe fixes)
- DB: pnpm db:generate; pnpm db:migrate (DATABASE_URL required)
- Judge seed: pnpm seed:judge (intentional no-op until judge mode)
- Worker: see docs/architecture.md; not part of pnpm dev.

## Golden rules

- Every legal/tax number, deadline and compliance calculation comes only from packages/rules.
- Every PayPal action, including coding-assistant MCP calls, needs explicit user approval through the approval workflow. Never let the model approve its own action.
- Sandbox only. No production PayPal endpoints or credentials.
- Never commit secrets or read/edit .env* files. .env.example is the only committed template; change it only when explicitly authorized. Users supply actual values themselves.
- Validate every external boundary and environment with zod. Errors name keys without exposing values.
- No any, type-check bypasses, or unvalidated casts at boundaries.
- State the reason before introducing a dependency. Sponsor/AI/payment SDK installs wait for the relevant spec.
- No symlink instruction files. Keep Windows and Linux commands equivalent.

## PayPal layers

- Server SDK: deterministic transaction search and refunds in packages/paypal/src/sdk.
- Agent Toolkit: AI-facing actions behind packages/agent's approval queue.
- REST: Invoicing v2 and Disputes v1 in packages/paypal/src/rest.

## Done

pnpm verify passes, relevant tests are added, and only actually satisfied spec checkboxes are ticked. Run pnpm build for web/build changes. Keep all feature checkboxes open in the scaffold.

## Gotchas

The Server SDK lacks Invoicing and Disputes. India account capabilities need sandbox verification; do not assume recurring invoices or partial payments work.
AG Studio and Bryntum licences come from environment configuration; start trials on/after Nov 1, 2026 so they cover judging. Neither package is installed yet.
Rule sources and effective dates need CA review; verified=false must remain until review. Do not treat plan estimates as law.
Shared packages export source; their build step typechecks. Next alone produces production assets.
Node/pnpm version pins are intentional; pnpm records exact release-age exceptions for the verified stable Next release.

## Workflow and references

Work on one spec per task. Plan before multi-file changes, keep commits small, and read the nearest nested AGENTS.md first. Never commit or publish unless requested.
Whenever an APIMatic tool is used (the PayPal Context Plugin's paypal:* skills or any other APIMatic tooling), add an entry to [APIMatic usage](docs/apimatic-usage.md) in the same task: date, tool, purpose and outcome. It is evidence for the APIMatic sponsor prize.
See [architecture](docs/architecture.md), [PayPal](docs/paypal.md), [rules](docs/rules-sources.md), [glossary](docs/glossary.md), [ADRs](docs/decisions/), [verification](docs/verification.md) and [APIMatic usage](docs/apimatic-usage.md).
