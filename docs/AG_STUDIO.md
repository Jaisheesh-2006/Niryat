# AG Studio: A1/A2 change record

Recorded 2026-11-04. Scope: [A1 and A2](IMPROVEMENTS.md#a1-security-quick-fixes-p0) only.

## A1: shared security headers

[Next configuration](../apps/web/next.config.ts) applies four security headers to every web path, including `/dashboard`. The content security policy contains only `frame-ancestors 'none'`; it adds no script or style restrictions. This follows A1's requirement to keep AG Studio's injected styles outside a new restrictive policy. The exact headers and checks are recorded in [Render's A1 entry](RENDER.md#a1-production-mode-and-security-headers).

## A2: dashboard AI request limit

The dashboard assistant's `POST /dashboard/turn` shares a budget of six requests per minute with `POST /extract` and `POST /close`. The key includes the AI route group, client IP and verified session user ID. Requests over that budget return HTTP 429 with `{ "error": "rate_limited" }` and `Retry-After: 60`, before the dashboard route invokes the model.

Implementation: [rate-limit middleware](../apps/api/src/rate-limit.ts), [app registration](../apps/api/src/index.ts), [server composition](../apps/api/src/server.ts) and [dashboard route](../apps/api/src/routes/dashboard.ts). [Rate-limit tests](../apps/api/src/rate-limit.test.ts) cover the shared AI budget, user/IP isolation and forged forwarding headers. The [Render record](RENDER.md#a2-rate-limits-and-client-ip-trust) explains the private connection needed to preserve the browser's client IP.

## Verification and pending checks

A1's recorded web suite passed 362 tests. After A2's review fix, the web suite passed 363 tests and the API suite passed 457; `pnpm verify` passed all 27 tasks and `pnpm build` passed all nine tasks. Database-dependent tests remained skipped; see [validation details](RENDER.md#recorded-automated-validation).

Browser verification is pending. Follow the [manual checks](RENDER.md#manual-checks-awaiting-user-verification), then open `/dashboard` with an existing signed-in account and ledger data. Expect the dashboard and its existing edit controls to render. Confirm the response headers on that page. These results do not establish browser compatibility or licence/trial coverage; [V15](verification.md#v15-sponsor-licences) remains open.
