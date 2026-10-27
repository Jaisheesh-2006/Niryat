# Niryat contributor instructions

Niryat prepares Indian export-compliance records from freelancers' PayPal activity.
The user approves every PayPal action; nothing is filed or moved automatically.
This commit is a scaffold. Product scope and ordering live in [PLAN](docs/PLAN.md).

## Map

- apps/web: Next.js App Router; sign-in, profile, health check, clients and invoices pages.
- apps/api: Hono on Node; auth, profiles, clients, invoices, approvals, PDF serving, payment webhooks and sync.
- apps/worker: Render Workflows monthlyClose stub.
- packages/rules: pure, cited legal/numeric logic; YAML logic names the implementing function.
- packages/paypal: REST (Invoicing, webhook verify), Server SDK ledger (search, captures), webhook verification.
- packages/agent: approval runner; future Claude + PayPal Toolkit.
- packages/db: Drizzle schema, migrations, encrypted profile storage; packages/shared: shared zod request schemas.
- packages/config: strict TypeScript base and safe zod environment parser.
- docs/specs: thirteen ordered feature specs; status and acceptance ticks record implemented scope.

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

## Design (LLD)

Prefer the simplest code that meets the spec; use a pattern only to solve a problem that exists now, never "for later".
- Single responsibility: routes parse, authorize and respond; packages/db persists; packages/rules computes; packages/paypal talks to PayPal. A module has one reason to change.
- Dependency inversion: only composition roots (apps/api/src/server.ts, a job's main(), the worker entry) read env or build concrete clients; everything else receives them, as createApp(deps) does.
- Interface segregation: small interfaces named by the caller's need (FileStore has put/get). Accept the narrowest type a function uses.
- Open/closed: extend through registries keyed by a union, not new branches. A new PayPal action is a handler entry in the Record that runApprovedAction takes; the compiler flags a missing one.
- Liskov: fakes and alternative adapters keep the contract, including failure semantics (FileStore.get returns undefined on a miss and throws on other errors).
- Patterns already in use; reuse them before inventing new ones: Adapter (FileStore/createS3FileStore, PayPalLedger, PayPalRestClient), factory functions (createX returning an interface), Command plus handler registry (packages/agent), state machine with atomic transitions (agent_actions claim/finish), repository functions (packages/db), middleware as Decorator (Hono).
- Avoid: classes with inheritance (compose functions and interfaces), Singletons or module-level mutable state, an interface with one implementation unless it marks an I/O boundary that tests fake, and Abstract Factory/Visitor/Mediator ceremony.
- Functional core, imperative shell: pure logic takes time and data as arguments (syncPayments(deps, now)); I/O stays at the edges.
- Make illegal states unrepresentable: discriminated unions, readonly data, exhaustive switches ending in a never check.
- Errors: return typed results for expected outcomes ({ ok: false, reason }); throw for bugs and infrastructure faults. Never swallow an error without counting, logging or rethrowing it.
- Side effects that can be retried (webhooks, PayPal POSTs, jobs) are idempotent: dedupe keys, PayPal-Request-Id, atomic status checks.
- Duplicate twice before abstracting on the third use; delete dead code instead of commenting it out.

## PayPal layers

- Server SDK: deterministic transaction search and refunds in packages/paypal/src/sdk.
- Agent Toolkit: AI-facing actions behind packages/agent's approval queue.
- REST: Invoicing v2 and Disputes v1 in packages/paypal/src/rest.

## Done

pnpm verify passes, relevant tests are added, and only actually satisfied spec checkboxes are ticked. Run pnpm build for web/build changes. Keep all feature checkboxes open in the scaffold.

Browser verification is performed by the user. Do not run browser verification or set up browser/helper connections unless the user explicitly requests it. When browser checks are relevant or required by a task, provide exact manual steps: startup commands, URLs, prerequisites, inputs/actions and expected results. Report those checks as awaiting user verification until the user confirms them; continue running required non-browser checks yourself.

## Gotchas

The Server SDK lacks Invoicing and Disputes. India sandbox results are in docs/paypal-sandbox-findings.md: recurring invoices work; partial payments, domestic recipients and attachment upload do not.
AG Studio and Bryntum licences come from environment configuration; start trials on/after Nov 1, 2026 so they cover judging. Neither package is installed yet.
Rules carry review: source_checked (matches primary law, docs/rules-sources.md) or unchecked; no CA review is planned for the hackathon, which is a stated limitation. Do not treat plan estimates as law.
Shared packages export source; their build step typechecks. Next alone produces production assets.
Node/pnpm version pins are intentional; pnpm records exact release-age exceptions for the verified stable Next release.

## Workflow and references

Work on one spec per task. Plan before multi-file changes, keep commits small, and read the nearest nested AGENTS.md first. Never commit or publish unless requested.
Current state: phase statuses are in [build flow](docs/build-flow.md). The active task plan is the local, git-ignored current-phase-plan.md, if present. PayPal facts are in [sandbox findings](docs/paypal-sandbox-findings.md).
Whenever an APIMatic tool is used (the PayPal Context Plugin's paypal:* skills or any other APIMatic tooling), add an entry to [APIMatic usage](docs/apimatic-usage.md) in the same task: date, tool, purpose and outcome. It is evidence for the APIMatic sponsor prize.
See [architecture](docs/architecture.md), [PayPal](docs/paypal.md), [rules](docs/rules-sources.md), [glossary](docs/glossary.md), [ADRs](docs/decisions/), [verification](docs/verification.md) and [APIMatic usage](docs/apimatic-usage.md).
