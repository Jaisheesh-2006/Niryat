# Render change record

Recorded 2026-11-04. Scope: [A1 and A2](IMPROVEMENTS.md#a1-security-quick-fixes-p0), including A2's forwarded-IP review fix. The Blueprint and application changes are implemented; hosted deployment and browser results remain awaiting user verification.

## A1: production mode and security headers

[render.yaml](../render.yaml) explicitly sets `NODE_ENV=production` on all five services: `niryat-web`, `niryat-api`, `niryat-sync`, `niryat-monthly-close` and `niryat-worker`. This makes the API's existing production check enable secure session cookies when deployed over HTTPS; see [server composition](../apps/api/src/server.ts) and [session cookie settings](../apps/api/src/auth/session.ts).

[Next configuration](../apps/web/next.config.ts) applies these headers to `/:path*`:

| Header                    | Value                             |
| ------------------------- | --------------------------------- |
| `X-Frame-Options`         | `DENY`                            |
| `Content-Security-Policy` | `frame-ancestors 'none'`          |
| `Referrer-Policy`         | `strict-origin-when-cross-origin` |
| `X-Content-Type-Options`  | `nosniff`                         |

The policy adds no script or style restrictions, following A1's AG Studio/Bryntum compatibility constraint. Tests: [Render guardrails](../scripts/guardrails.test.mts) and [imported Next configuration](../apps/web/next.config.test.ts).

## A2: rate limits and client-IP trust

The API constructs fixed-window limiters in [server.ts](../apps/api/src/server.ts) and injects them through [AppDeps](../apps/api/src/routes/auth.ts). [createApp](../apps/api/src/index.ts) registers the [middleware](../apps/api/src/rate-limit.ts) before the protected route handlers.

| Group | POST routes                                                                                | Budget                                       | Key                                          |
| ----- | ------------------------------------------------------------------------------------------ | -------------------------------------------- | -------------------------------------------- |
| Auth  | `/auth/login`, `/auth/signup`; reserved `/auth/ca/login`, `/auth/ca/signup`, `/auth/judge` | 10 per minute                                | Group + client IP                            |
| AI    | `/dashboard/turn`, `/extract`, `/close`                                                    | 6 per minute, shared across the three routes | Group + client IP + verified session user ID |
| Share | Reserved `/ca-link`                                                                        | 10 per hour                                  | Group + client IP + verified session user ID |

Reserved paths have middleware coverage only; A2 does not implement their future handlers. Over-limit requests return HTTP 429 with `{ "error": "rate_limited" }`. `Retry-After` is a conservative full-window wait: 60 seconds for auth/AI, 3600 for sharing. Missing limiter dependencies keep existing tests unlimited.

The review fix removes trust in `X-Forwarded-For`. The API uses validated `CF-Connecting-IP` only when the validated server environment has `RENDER=true`. Otherwise, or for a missing/invalid protected header, it uses the connection address. The trust boundary assumes Render's public ingress overwrites that header and treats same-workspace private services as trusted; see [architecture](architecture.md#storage-and-runtime) and [S8](IMPROVEMENTS.md#s8-rate-limiter).

The Blueprint binds web's `API_INTERNAL_HOSTPORT` to `niryat-api`'s private-network `hostport`. The shared [loadApiUrl resolver](../packages/config/src/index.ts) makes both the [Next rewrite](../apps/web/next.config.ts) and [server-side API reads](../apps/web/src/lib/env.ts) prefer this address over `API_URL`. [Turbo's web build](../turbo.json) passes and hashes the internal address. This keeps the original ingress IP across the private hop. A public web-to-API hop would replace it with the web service's IP and combine users' budgets.

The binding must be present at both build and runtime; rebuild web after applying it because Next generates rewrites at build time. The API retains its public service type for existing direct URLs and webhooks. No new secret or dependency was added.

Limitations: counters are in-memory per API instance, reset on restart and do not coordinate replicas. Expired entries are cleaned up. Outside Render, proxy traffic uses the connection-address bucket; forwarded headers are not trusted.

Tests cover window boundaries/reset, separate keys/instances, group budgets, the eleventh login, IP/user isolation, optional dependencies, rotating forged headers, protected-header fallback, URL selection and Blueprint/build wiring. Sources: [limiter tests](../apps/api/src/rate-limit.test.ts), [environment tests](../apps/api/src/env.test.ts), [URL resolver tests](../packages/config/src/index.test.ts), [web configuration tests](../apps/web/src/index.test.tsx) and [guardrails](../scripts/guardrails.test.mts).

## Recorded automated validation

These are the implementation results recorded on 2026-11-04, not hosted acceptance:

| Check              | A1                                | A2 after review fix                      |
| ------------------ | --------------------------------- | ---------------------------------------- |
| Web tests          | 362 passed                        | 363 passed                               |
| API tests          | Existing suite included in verify | 457 passed; 193 database-dependent skips |
| Config tests       | Existing suite included in verify | 9 passed                                 |
| Guardrail tests    | 3 passed                          | 4 passed                                 |
| `pnpm verify`      | 27/27 tasks passed                | 27/27 tasks passed                       |
| `pnpm build`       | 9/9 tasks passed; 8 cached        | 9/9 tasks passed; all fresh              |
| `git diff --check` | Passed                            | Passed                                   |

The DB suite retained 75 integration skips. No fresh database integration, hosted proxy behavior, secure-cookie browser check or sponsor rendering check is claimed by these results. No deployment or PayPal operation was performed for A1/A2.

## Manual checks: awaiting user verification

1. Use the existing local database/auth/storage configuration and an existing sandbox account. From the repo root, restart the API to clear counters and run `corepack pnpm dev` (`corepack.cmd pnpm dev` on restricted PowerShell). Web: `http://localhost:3000`; API: `http://localhost:3001`. Keep local `API_URL=http://localhost:3001`; `API_INTERNAL_HOSTPORT` is the Render binding, and `RENDER` must not be set outside Render.
2. Open `/` and `/login` on the web origin. In the browser Network panel, reload and inspect the document responses. Expect the four A1 headers above. Open `/api/health`: expect HTTP 200. With an existing signed-in account and invoice PDF, follow its PDF link from `/invoices`; expect it still to render.
3. Open `/login` without submitting credentials. Wait at least 60 seconds after any earlier login/signup request, and avoid other auth requests from that IP during the loop. In the browser developer console run the loop below. It sends invalid credentials, changes the supplied forwarding headers and does not modify records.

```js
for (let i = 1; i <= 11; i++) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": `192.0.2.${i}, 198.51.100.1`,
      "CF-Connecting-IP": `192.0.2.${i}`,
    },
    body: "null",
  });
  console.log(i, response.status, response.headers.get("Retry-After"));
}
```

4. Expect requests 1–10 to return 400 and request 11 to return 429 with `Retry-After: 60`. After at least 60 seconds, one more invalid request should return 400. `/api/health` must remain HTTP 200 while login is limited.
5. When you deploy, apply the Blueprint's `API_INTERNAL_HOSTPORT` binding to web at build and runtime, with web/API in the same Render workspace and region. Rebuild web. Repeat the header, PDF and spoofing checks on the HTTPS web origin after its bucket is clear. From another real network/IP, one invalid login request should return 400 even while the first network is limited. After the minute, sign in normally and expect `/overview`; inspect the session cookie for `Secure` and `HttpOnly`. Hosted results stay pending until confirmed.

## B1: background jobs select freelancers only

Recorded 2026-11-05. [B1](IMPROVEMENTS.md#b1-roles-and-role-aware-sessions-p0) adds `users.role` and migration [0007](../packages/db/drizzle/0007_windy_johnny_storm.sql). [listUserIds](../packages/db/src/users.ts) now selects only freelancers, because CA accounts do not own compliance records. Both all-user close and sync in [close.ts](../apps/api/src/close.ts), including the existing Render Workflows close, use that selection. No Blueprint, schedule, dispatch or SDK change was needed.

The full DB and API suites passed 156/156 and 656/656 tests respectively, zero skips, on a disposable PostgreSQL 17 `niryat_test` database, including a CA-exclusion regression in [storage.test.ts](../packages/db/src/storage.test.ts). Direct Vitest equivalents of `test:db` used only a task-specific `TEST_DATABASE_URL`, avoiding the wrappers' private environment loading. `pnpm verify` passed 27/27 tasks; `pnpm build` passed 9/9. The ordinary verification's DB/API integration skips are separate from those full runs. Hosted execution remains awaiting user verification; no deployment or PayPal operation was performed. The user must apply migration `0007` before starting the updated services. Existing sessions require sign-in again; [B1's manual session check](IMPROVEMENTS.md#b1-roles-and-role-aware-sessions-p0) remains awaiting user verification.
