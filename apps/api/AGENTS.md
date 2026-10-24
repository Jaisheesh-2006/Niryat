# API conventions

Follow the root AGENTS.md and the selected feature spec.
Keep app construction in src/index.ts; bind sockets only in src/server.ts.
Validate environment before startup and zod-validate incoming boundaries.
Health must work without credentials, a database or external network calls.
PayPal adapters live in packages/paypal; approval belongs to packages/agent.
Verify webhook signatures and idempotency before accepting payment events.
Run pnpm --filter @niryat/api test after API changes.
