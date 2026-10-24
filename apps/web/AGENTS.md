# Web conventions

Follow the root AGENTS.md and the selected feature spec.
Use App Router and server components by default; add client boundaries only when needed.
Biome owns formatting/linting. No ESLint or Prettier.
Keep legal/numeric decisions in packages/rules, reached through validated API contracts.
AG Studio and Bryntum are TODOs; do not install/start trials before Nov 1, 2026.
Never send private credentials or unencrypted profile data to the browser.
Run pnpm --filter @niryat/web test and pnpm build after web changes.
