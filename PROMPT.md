# Task: Scaffold the Niryat repository (structure, tooling, docs, agent setup) — NO feature code

You are setting up an already-initialized git repo for **Niryat**, an AI agent for Indian freelancers paid from abroad via PayPal. It turns PayPal activity (invoices, payments, refunds, disputes) into Indian export compliance (GST/LUT, RBI purpose codes, FIRA matching, GSTR-1 export data, advance tax, RBI realisation deadlines). Built for the PayPal AI Hackathon (deadline Nov 12, 2026).

**Read first:** `docs/PLAN.md` (full product plan, 13 ranked v1 features with "Done when" checklists, architecture, risks). Treat it as the source of truth.

## Goal

Produce a clean, expert-grade monorepo skeleton that every AI coding assistant (Claude Code, Codex, GitHub Copilot, Gemini CLI — **not Cursor**) understands quickly and can verify its own work in. When you finish, `pnpm verify` must pass on the empty skeleton. Do **not** implement any product features.

## Working rules

- **Plan first.** Before writing files, show me a short plan (phases + files) and wait for my "go".
- Use **current stable versions**; check official docs instead of guessing commands, package names or config keys. If unsure, say so and leave a `TODO(verify)` comment.
- The developer uses **Windows** (PowerShell) — everything must work cross-platform. No symlinks.
- **Never** create real secrets. Only `.env.example` with empty values.
- Keep instruction files short; prefer pointing to docs over pasting content.
- After each phase, run the relevant checks and fix failures before moving on.

## Stack (fixed — do not change)

- Node.js 24 LTS, **pnpm workspaces + Turborepo**, TypeScript **strict** everywhere, package scope `@niryat/*`
- `apps/web`: Next.js (App Router, TypeScript) — later hosts AG Studio dashboard + Bryntum Calendar (do NOT install those yet; add `TODO` notes only)
- `apps/api`: Hono on Node — later PayPal webhooks + REST
- `apps/worker`: Render Workflows (TypeScript SDK) — later monthly close jobs (stub only)
- Postgres + **Drizzle ORM**, **zod** for all external input + env validation
- **Biome** (lint + format, no ESLint/Prettier), **Vitest** for tests, **lefthook** for git hooks
- GitHub Actions CI, **gitleaks** secret scan
- Hosting on Render via `render.yaml` (web, api, worker, **paid** Postgres — free tier expires after 30 days)

## Target structure

niryat/
├─ AGENTS.md CLAUDE.md GEMINI.md README.md LICENSE (MIT)
├─ .env.example .gitignore .gitattributes .editorconfig .nvmrc
├─ package.json pnpm-workspace.yaml turbo.json biome.json lefthook.yml render.yaml
├─ .github/copilot-instructions.md .github/workflows/ci.yml
├─ .claude/settings.json .claude/rules/
├─ .gemini/settings.json (only if needed)
├─ .mcp.json .vscode/mcp.json .codex/config.toml
├─ apps/web apps/api apps/worker
├─ packages/rules packages/paypal packages/agent packages/db packages/shared packages/config
└─ docs/PLAN.md architecture.md glossary.md paypal.md rules-sources.md decisions/ specs/

## Phase 1 — Root tooling

- `package.json` with `packageManager` (pnpm via corepack) and `engines.node`; scripts:
  `dev`, `build`, `typecheck`, `lint`, `format`, `test`, `verify` (= typecheck + lint + test via turbo), `db:generate`, `db:migrate`, `seed:judge`
- `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `turbo.json` pipelines with correct dependsOn/caching
- `biome.json` (strict, ignores build output), `.editorconfig`, `.nvmrc`
- `.gitattributes` with `* text=auto eol=lf`
- `.gitignore` covering node_modules, build output, `.env*` (but NOT `.env.example`), coverage, `.turbo`
- `lefthook.yml`: pre-commit runs Biome on staged files + typecheck
- `LICENSE` (MIT) if missing

## Phase 2 — Packages and apps (skeletons only)

Each package: `package.json`, `tsconfig.json` extending `packages/config`, `src/index.ts`, one passing smoke test.
- `packages/config`: shared tsconfig base (strict, `noUncheckedIndexedAccess`), zod env helper that fails fast with clear errors
- `packages/shared`: zod schemas/types placeholder
- `packages/rules`: pure functions only, `rules/india-export.yaml` with the rule IDs from PLAN.md section "Rules engine" (fields: id, description, source, effective_from, verified=false, TODO logic), plus an example **table-driven** test pattern
- `packages/paypal`: folders `sdk/` (PayPal TypeScript Server SDK — transaction search, refunds), `rest/` (typed client for Invoicing v2 + Disputes v1, not covered by the SDK), `webhooks/` (signature verification stub). Sandbox only. No real calls yet.
- `packages/agent`: placeholders for Claude Agent SDK + PayPal Agent Toolkit + an approval-queue interface (every PayPal action must be approved by the user)
- `packages/db`: Drizzle config + schema stubs for the tables in PLAN.md "Data model" (users, profiles, clients, invoices, payments, disputes, fira_documents, fira_lines, matches, agent_actions, tasks, rule_versions) + empty `seed-judge.ts`
- `apps/api`: Hono app with `GET /health` + test; env validated via zod
- `apps/web`: Next.js app with a placeholder home page; Biome instead of ESLint
- `apps/worker`: Render Workflows task stub (`monthlyClose`) — check Render docs for the current SDK

## Phase 3 — Docs (concise, factual, no fluff)

- `docs/architecture.md`: components, data flow, the **three-layer PayPal integration** (Server SDK for transactions/refunds · Agent Toolkit for AI actions · REST client for Invoicing/Disputes), approval queue, where AI vs rules engine are used
- `docs/glossary.md`: LUT (RFD-11), FIRA/e-FIRA, RBI purpose code, GSTR-1 Table 6A, export of services (5 conditions), RBI realisation period, advance tax, presumptive taxation, credit note, ASMT-10, GSTIN — one or two lines each
- `docs/paypal.md`: which PayPal API/tool for which feature, sandbox accounts (India seller, US buyer), webhook events to subscribe to, items marked "verify on India sandbox"
- `docs/rules-sources.md`: the rules table with citations and verify status (copy from PLAN.md)
- `docs/decisions/`: short ADRs — 0001 Node+TypeScript monorepo, 0002 three-layer PayPal integration, 0003 rules engine owns all legal/numeric logic
- `docs/specs/01-…md` to `13-…md`: one file per v1 feature, in the order of PLAN.md, using this template:
  Goal · User story · Acceptance criteria (copy that feature's "Done when" list) · Data & APIs used · Edge cases · Test cases (TODO) · Out of scope

## Phase 4 — AI assistant instruction files

- `AGENTS.md` (**under 150 lines**, only non-obvious info):
  1. What Niryat is (3 lines) + repo map
  2. Commands (install, dev, verify, test one package, db)
  3. Golden rules: all legal/tax numbers come only from `packages/rules`; every PayPal action goes through the approval queue; sandbox only; never commit secrets or edit `.env*`; zod at every boundary; no `any`; no new dependencies without stating why
  4. PayPal layer guide (one line each)
  5. Definition of done: `pnpm verify` passes, tests added, spec checkboxes ticked
  6. Known gotchas (PayPal SDK lacks Invoicing/Disputes; India sandbox limits — verify; AG Studio/Bryntum licences via env, trials start on/after Nov 1)
  7. Links to `docs/` (don't paste them)
  8. Workflow: one spec per task, plan before multi-file changes, small commits
- Short nested `AGENTS.md` in `apps/web`, `apps/api`, `packages/rules`, `packages/paypal` (5–20 lines each, local conventions only)
- `CLAUDE.md`: `@AGENTS.md` import + 3–5 Claude-specific lines
- `GEMINI.md`: import/point to `AGENTS.md` (check Gemini CLI docs for import syntax)
- `.github/copilot-instructions.md`: "Follow AGENTS.md" + 2–3 key rules

## Phase 5 — Guardrails, CI, MCP

- `.claude/settings.json`: allow common pnpm/git commands; `permissions.deny` reads of `.env*`, `node_modules/**`, build output, lock files; a hook that formats edited files with Biome and one that blocks edits to `.env*` (follow the official Claude Code hooks docs)
- `.github/workflows/ci.yml`: pnpm install with cache → `pnpm verify` → gitleaks
- MCP configs (tokens ONLY via env vars, never inline):
  - PayPal MCP server in **sandbox** mode — take the exact command from https://docs.paypal.ai/developer/tools/ai/mcp-quickstart
  - Context7 (https://mcp.context7.com/mcp) for up-to-date library docs
  - Files: `.mcp.json` (Claude Code), `.vscode/mcp.json` (uses `servers` key), `.codex/config.toml` (`mcp_servers`)
- `.env.example`: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENVIRONMENT=SANDBOX, PAYPAL_WEBHOOK_ID, PAYPAL_LOGIN_RETURN_URL, ANTHROPIC_API_KEY, CLAUDE_MODEL, AI_MONTHLY_BUDGET_USD, DATABASE_URL, FILE_STORAGE_URL, AG_STUDIO_LICENSE_KEY, ENCRYPTION_KEY
- `render.yaml`: web, api, worker services + paid Postgres; env vars referenced, not set
- `README.md`: short judge-facing version (what it is, setup steps, env vars, run commands, judge-mode placeholder, link to docs/PLAN.md). Keep it under 120 lines.

## Acceptance criteria (check all before finishing)

- [ ] `pnpm install` works from a clean clone on Windows and Linux
- [ ] `pnpm verify` passes (typecheck + lint + tests) across all workspaces
- [ ] `pnpm dev` starts web and api; `GET /health` returns 200
- [ ] No secrets anywhere; `.env*` ignored except `.env.example`
- [ ] AGENTS.md < 150 lines; all adapters point to it; no Cursor files
- [ ] 13 spec files exist with acceptance criteria copied from PLAN.md
- [ ] CI workflow and lefthook configured
- [ ] Every uncertain command/config marked `TODO(verify)` with a doc link

## When done, reply with only

1. The final tree (2 levels deep)
2. Commands you ran and their results (pass/fail)
3. A list of every `TODO(verify)` item
4. Anything you could not do and why
