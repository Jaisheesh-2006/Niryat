# Tooling references

Stable npm versions were resolved from the registry during scaffolding on October 24, 2026 and pinned in manifests/lockfile. Node stays on the required 24 LTS line. No product, sponsor, Claude Agent SDK or PayPal SDK dependencies are installed until their specs need them.
- [pnpm installation and Corepack](https://pnpm.io/installation), [workspace settings](https://pnpm.io/settings): packageManager pins pnpm; allowBuilds limits native install scripts. Next's exact release-age exceptions were recorded by pnpm during installation.
- [Turbo tasks and cache configuration](https://turborepo.dev/docs/reference/configuration): checks have no generated outputs; only Next build caches artifacts; development and database commands are uncached.
- [TypeScript strict compiler options](https://www.typescriptlang.org/tsconfig/), [Next installation](https://nextjs.org/docs/app/getting-started/installation), [Hono Node adapter](https://hono.dev/docs/getting-started/nodejs).
- [Biome configuration](https://biomejs.dev/reference/configuration/), [Vitest](https://vitest.dev/guide/), [lefthook staged-file commands](https://lefthook.dev/configuration/run/).
- [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql): offline generation and credential-required migrations.
- [Render Workflows TypeScript SDK](https://render.com/docs/workflows-sdk-typescript), [task definition](https://render.com/docs/workflows-defining), [Blueprint fields](https://render.com/docs/blueprint-spec): workflow service registration, no native monthly schedule.
- [Claude permissions](https://code.claude.com/docs/en/permissions), [hooks](https://code.claude.com/docs/en/hooks), [MCP](https://code.claude.com/docs/en/mcp).
- [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp): project TOML, env_vars forwarding and Context7 URL. OpenAI Docs skill used for this configuration.
- [VS Code MCP configuration](https://code.visualstudio.com/docs/copilot/customization/mcp-servers): servers key and environment interpolation.
- [Gemini context imports](https://geminicli.com/docs/cli/gemini-md/): @./AGENTS.md; context.fileName discovers nested AGENTS.md files.
- [PayPal MCP quickstart](https://developer.paypal.com/ai-tools/mcp-server), [Context7](https://github.com/upstash/context7).
- [GitHub setup-node](https://github.com/actions/setup-node), [checkout](https://github.com/actions/checkout), [gitleaks CLI](https://github.com/gitleaks/gitleaks).

External checks and uncertainties are explicitly tracked in [verification](verification.md).
