# ADR 0001: Node and TypeScript monorepo

Status: accepted.

Use Node 24 LTS, strict TypeScript, pnpm workspaces and Turborepo. The same language spans web, API, workflows and pure shared packages; Turbo orders checks by workspace dependencies. Windows and Linux use the same scripts, with pnpm.cmd available when PowerShell blocks the ps1 shim.

Biome owns lint and formatting; Vitest owns tests. Shared packages export source and validate types; Next produces the web build. Do not add parallel lint/format toolchains or symlink instruction files.
