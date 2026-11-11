# Niryat

**Turns an Indian freelancer's PayPal activity into export-compliance records.** Built for the PayPal AI Hackathon (2026). Live demo: **https://niryat-web.onrender.com**

## Who it helps

- **Indian freelancers and sole proprietors** (developers, designers, writers, consultants, tutors) who sell services to foreign clients and are paid through PayPal, whether or not they are registered for GST.
- **Their chartered accountants (CAs)**, who review those records for many clients.

## Why it exists

Getting paid through PayPal is easy; staying compliant afterwards is not. Every foreign payment brings Indian GST, income-tax and RBI duties: a yearly LUT to bill foreign clients without GST, the right RBI purpose code, payment proof (FIRA) for each receipt, a legal deadline to get each export invoice paid, GST returns, and advance tax, because foreign clients deduct no tax. Most freelancers leave this until year end and hand their CA a messy pile; mistakes cost upfront GST, interest or tax notices. Money-transfer apps move money and generic GST tools file returns, but neither turns PayPal activity into these records. Niryat does.

## What it does

| Feature                       | What it does, and why it matters                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compliance health check       | Flags a missing or expiring LUT and other profile gaps, citing the legal source, before they cost money.                                              |
| Purpose-code advisor          | Suggests the RBI purpose code for the work and flags a mismatch with the profile, avoiding rejected withdrawals and mismatches later.                 |
| Export eligibility check      | Checks every legal condition before an invoice can be issued without GST.                                                                             |
| Invoices                      | Drafts an invoice from a pasted email, quoting the source of each value. Sends one-time, recurring and milestone invoices through PayPal, with a PDF. |
| Payment tracking              | Records every PayPal payment with its fee, net amount and currency, from webhooks plus reconciliation every 30 minutes.                               |
| Refunds and disputes          | Keeps invoice, GST and deadline records correct when a payment is refunded or disputed.                                                               |
| Payment-proof (FIRA) matching | Matches uploaded FIRA lines to payments and asks the user to confirm uncertain matches, so proof is ready at refund or scrutiny time.                 |
| RBI deadline tracker          | Tracks each export invoice's legal payment deadline and proposes PayPal reminders before it passes.                                                   |
| Monthly close                 | A Claude agent reviews the month, checks PayPal and drafts tasks, reminders and advice for the user to approve.                                       |
| GSTR-1 export data            | Prepares the export data for the GST return for the chosen period.                                                                                    |
| Advance-tax estimator         | Estimates advance-tax instalments and due dates for CA review, so interest penalties are avoided.                                                     |
| Compliance calendar           | Every GST, income-tax, RBI and PayPal deadline in one calendar.                                                                                       |
| Dashboard                     | Income, PayPal fees, unpaid invoices and payment-proof status at a glance; ask questions in plain English.                                            |
| Clients, tasks and approvals  | Saved clients, a task list, and approval cards: every PayPal send, reminder or refund waits for the user's approval.                                  |
| Share with a CA               | The freelancer invites one CA. Once accepted, the CA sees a portfolio dashboard, a calendar and client pages, view-only.                              |

## Try it

1. Open https://niryat-web.onrender.com and click **Try as freelancer (demo)**. Explore **Overview**, **Invoices**, **Close**, **Dashboard** and **Calendar**.
2. Sign out and click **Try as CA (demo)** to see a chartered accountant's view across three freelancers.
3. To pay an invoice the freelancer sends through PayPal, sign in at https://www.sandbox.paypal.com as the US buyer below.

| PayPal sandbox buyer (sandbox only, no real money) |                                         |
| -------------------------------------------------- | --------------------------------------- |
| Email                                              | `sb-uhvts53532529@personal.example.com` |
| Password                                           | `F_EyVZ02`                              |

Niryat itself needs no login details. The demo accounts are shared and hold synthetic records, so please don't enter personal data.

## PayPal features used

All in PayPal's sandbox. Details: [docs/paypal.md](docs/paypal.md).

| PayPal feature                  | How Niryat uses it                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Log in with PayPal (Identity)   | Sign in and link the freelancer's PayPal account.                                                                                                                                     |
| Invoicing v2                    | Creates and sends export invoices, recurring invoice series and payment reminders, each only after the user approves.                                                                 |
| Payments (Server SDK)           | Reads each payment's gross amount, PayPal fee and net amount; issues refunds the user approves.                                                                                       |
| Transaction Search (Server SDK) | Reconciles the ledger every 30 minutes and nightly, so a missed webhook is recovered.                                                                                                 |
| Disputes v1                     | Reads disputes and their response deadlines.                                                                                                                                          |
| Webhooks                        | Nine invoice, payment and dispute events, each signature-verified, update records as they happen.                                                                                     |
| PayPal Agent Toolkit            | Five read-only tools (`get_invoice`, `list_invoices`, `get_dispute`, `list_disputes`, `list_transactions`) for the monthly-close agent, limited to the user's own records and logged. |

## AI agents and their role

All agents run on Claude. They investigate, explain and draft; they never approve, move money or calculate a legal figure.

| Agent                                  | Role                                                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Invoice extraction (Claude Agent SDK)  | Reads a pasted client email and drafts the invoice, quoting the source text for each value. The user confirms before anything is saved.  |
| Monthly close (Claude Agent SDK)       | Investigates the month with the PayPal read tools, prioritises the work, drafts tasks and advises whether to send or hold each reminder. |
| Nightly reminders (Claude Agent SDK)   | The same agent, run each night, drafts payment-reminder proposals for unpaid invoices.                                                   |
| Dashboard assistant (AG Studio agents) | AG Studio's five built-in agents and Niryat's Compliance reviewer, all on Claude, answer questions by building dashboard widgets.        |

Every figure comes from the cited rules package (`packages/rules`), not the model. Each PayPal action an agent proposes waits in the approval queue, and the model can never approve its own action. A monthly AI budget caps spending, and every feature still works by hand without AI. See [ADR 0005](docs/decisions/0005-agent-boundary.md).

## How Niryat meets the judging criteria

| Criterion                    | Evidence                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Technological implementation | Seven PayPal features and four Claude agents working together: webhooks backed by reconciliation, retry-safe PayPal requests, an approval queue, and automated tests in every package.     |
| Design                       | A complete product for two roles: 12 freelancer pages and a CA portal, one design system, plain-language explanations of legal terms, and fallbacks that work without JavaScript.          |
| Potential impact             | Built for freelancers paid from abroad through PayPal, PayPal India's core users, and for the CAs who serve them. Each problem in [Why it exists](#why-it-exists) maps to a feature above. |
| Innovation                   | Turns PayPal activity directly into Indian export compliance. AI agents investigate and draft, cited rules compute, and the user approves.                                                 |
| Presentation                 | A live demo with one-click accounts, the step-by-step [Try it](#try-it) guide, a short demo video and a separate document for each sponsor tool.                                           |

## Sponsor tools

### AG Studio (AG Grid)

Two AI-assisted dashboards built with AG Studio 3.0.0: one for the freelancer (`/dashboard`) and a portfolio for the CA (`/ca`). **Read more: [docs/AG_STUDIO.md](docs/AG_STUDIO.md)**
- **Custom widget:** the RBI deadline runway, showing the days left to each unpaid invoice's payment deadline.
- **Custom agent:** a Compliance reviewer agent that works with Studio's built-in agents to flag problems as new widgets.
- **Swapped-in harness:** Studio's built-in AI agents run on Claude through our own adapter. No AI key reaches the browser.
- **Polish:** Niryat's theme, edit mode with saved layouts, linked data sources, filters, cross-filtering, a calculated fee-rate measure, a gauge and a pivot grid.

### Bryntum, Render and APIMatic

| Tool             | What we built                                                                                                                                                                      | Details                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Bryntum Calendar | Compliance calendar with category filters, several views and tooltips citing the legal source. Freelancers drag their own tasks; legal deadlines stay locked. CAs see all clients. | [docs/BRYUNTUM.md](docs/BRYUNTUM.md)             |
| Render           | One Blueprint ([render.yaml](render.yaml)): web and API services, a Render Workflows monthly close, PayPal reconciliation crons and managed Postgres.                              | [docs/RENDER.md](docs/RENDER.md)                 |
| APIMatic         | The APIMatic-generated PayPal Server SDK reads the ledger; APIMatic's PayPal Context Plugin guided how we wrote and tested it.                                                     | [docs/apimatic-usage.md](docs/apimatic-usage.md) |

## Engineering practices

- **Spec-first, in phases.** [PLAN](docs/PLAN.md) → 13 ordered [feature specs](docs/specs/) with acceptance checkboxes → [build phases](docs/build-flow.md) with exit gates. A script fails the build if spec criteria drift from PLAN. Key choices are recorded as [ADRs](docs/decisions/).
- **Day-1 spikes before building.** Every PayPal capability was first tried on an India sandbox account ([findings](docs/paypal-sandbox-findings.md)); partial payments and attachments were unavailable, so we dropped only those sub-items.
- **Law as versioned data.** Each of the 12 rules has a primary-source citation, effective date and review status in YAML, backed by pure, unit-tested functions ([sources](docs/rules-sources.md)). The model never produces a legal number.
- **Clear layers.** A pnpm + Turbo monorepo: web, API and worker apps over `rules`, `paypal`, `agent`, `db` and `shared` packages. Only entry points read config; everything else gets dependencies injected, so tests swap in fakes for PayPal, Claude and storage.
- **Safe at the edges.** Strict TypeScript with no `any`; zod validates every request, webhook, PayPal response and environment variable. Webhook signatures are verified, and sensitive profile fields are encrypted at rest.
- **Retry-safe money actions.** PayPal request IDs, dedupe keys and atomic approval claims make webhooks, jobs and approvals idempotent. Reminders are never retried automatically.
- **Tested and checked on every push.** Vitest in every package, database suites on a throwaway Postgres, and GitHub Actions on Ubuntu and Windows (frozen install, verify, build) plus a full-history gitleaks secret scan. A pre-commit hook runs Biome and type checks.
- **A consistent design system.** Every page follows one design system, Neel: shared colour, type, spacing and motion tokens, one meaning per colour (marigold only means "your decision"), plain-language voice rules and WCAG 2.2 AA targets. Its decisions are written down before any restyle ([design system](docs/DESIGN-SYSTEM.md)).
- **Evidence over claims.** [Verification](docs/verification.md) records only observed results, including what failed. On the hosted demo, payment, refund and dispute webhooks, missed-event recovery by the 30-minute sync and close recovery across an API restart all passed (2026-11-09 to 11-10).

## AI-assisted development

- **One instruction file for every agent.** [AGENTS.md](AGENTS.md) holds the map, commands, golden rules, design rules and definition of done. `CLAUDE.md`, `GEMINI.md` and Copilot's instructions only point to it, and the API, web, PayPal and rules packages add their own short `AGENTS.md`. A check keeps them linked and short.
- **`docs/` as the agents' second brain.** Following Andrej Karpathy's idea of an LLM-maintained markdown knowledge base, agents read specs, ADRs, sandbox findings and the verification log before working, and update them in the same task. Sponsor docs must be updated with every sponsor-related change.
- **Plan, then execute.** A strong model writes a precise plan for each phase ([prompt](prompts/PLAN-PROMPT.md)); a coding model builds one spec per task.
- **MCP servers for current context.** [Context7](https://github.com/upstash/context7) for up-to-date library docs; the **APIMatic PayPal Context Plugin** for Server SDK specifics ([log](docs/apimatic-usage.md)); **Serena** for symbol-level code navigation; the PayPal MCP (sandbox-only launcher, no token in config), AG Studio's MCP and Next.js devtools. Configured in [.mcp.json](.mcp.json) and [.codex/config.toml](.codex/config.toml).
- **Automated guardrails on the AI.** Agent permissions deny reading `.env*`, and a pre-edit hook blocks editing it (tested); a post-edit hook formats every change. Work is done only when `pnpm verify` passes. Any PayPal action through MCP needs explicit human approval, and browser checks are done by a human, never claimed by the AI.

## Run it locally

Requires Node.js 24 LTS and the pnpm version pinned in `package.json`, through Corepack:

```sh
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

The web app runs at http://localhost:3000 and the API health check at http://localhost:3001/health. On PowerShell with scripts blocked, use `corepack.cmd pnpm`. If `pnpm dev` doesn't start the API, run `corepack pnpm --filter @niryat/api dev` and `corepack pnpm --filter @niryat/web dev` in two terminals. Signing in and saving records need a database and private settings: copy the keys from [.env.example](.env.example) and supply your own values (never commit them). See [local storage](docs/local-storage.md) for invoice PDFs and [PayPal setup](docs/paypal.md#log-in-with-paypal) for PayPal sign-in. Commands: `pnpm verify` (type checks, linting and all tests), `pnpm build`, `pnpm format`, `pnpm db:generate`, `pnpm db:migrate` (needs `DATABASE_URL`) and `pnpm seed:judge`.

**Demo mode:** to host your own demo, set `DATABASE_URL`, `ENCRYPTION_KEY`, `JUDGE_MODE=true` and `JUDGE_BUYER_EMAIL`, run `pnpm db:migrate`, then `pnpm seed:judge`. Start the API with `JUDGE_MODE=true` and the **Try as freelancer** and **Try as CA** buttons appear. Rerunning the seed keeps existing edits and dates.

## Known limitations

- Sandbox only, with one PayPal seller per deployment.
- Demo payment proofs (FIRAs) are synthetic samples; real PayPal India FIRA layouts are unverified.
- Rules cite primary legal sources but have not been reviewed by a CA. This is not tax or legal advice, and nothing is filed automatically.
- Invoice PDFs are not digitally signed. Business model (not implemented): free for freelancers; CA firms pay per client.

## Learn more

- [Product plan](docs/PLAN.md), [feature specs](docs/specs/), [architecture](docs/architecture.md), [design system](docs/DESIGN-SYSTEM.md), [glossary](docs/glossary.md) and [design decisions](docs/decisions/)
- [Rules and their legal sources](docs/rules-sources.md), [verification status](docs/verification.md) and [contributor instructions](AGENTS.md)

MIT licensed.
