# Render change record

Initial record 2026-11-04: [A1 and A2](IMPROVEMENTS.md#a1-security-quick-fixes-p0), including A2's forwarded-IP review fix. Later tasks are dated separately below. Hosted deployment and browser results remain awaiting user verification.

## F1: December AI budget and submission evidence (2026-11-06)

F1 changes documentation only: [README](../README.md#sponsor-tools) describes implemented Workflows/manual-close dispatch, half-hour light polling, nightly reminders and paid Postgres; [submission materials](submission.md) distinguish these from pending hosted evidence. No Blueprint, schedule, service, credential or runtime behavior changed.

Before judging, the user must choose an affordable positive `AI_MONTHLY_BUDGET_USD`, set the same value on `niryat-api`, `niryat-worker` and `niryat-sync` in Render, and apply/restart those services. `niryat-sync-light` uses `--no-agent` and needs no AI setting. Recheck headroom on December 1 and monitor through December 15; no amount has been chosen or set by F1. Dashboard, extraction and monthly close all check spending since the start of the current execution month in IST, regardless of the close's report month. Estimates and in-flight runs do not enforce a hard provider billing ceiling. Exact operator checks and fields to record are in [V17](verification.md#v17-submission-materials-and-rehearsal).

Automated documentation checks are recorded in [F1](IMPROVEMENTS.md#f1-implementation-and-verification-2026-11-06). Hosted scheduling, real Workflows dispatch/restart recovery, budget configuration/spend and the video rehearsal remain **awaiting user verification**. Use the existing E1/E2 procedures below for reliability; F1 does not perform deployment or service calls.

## F1 review corrections (2026-11-06)

Corrected the operator documentation in review order: the A5 guidance now links to [H3's synthetic Profile-date refresh](IMPROVEMENTS.md#h3-keep-alive-to-dec-15-and-refresh-demo-dates-p0-phase-8-user), preserving invoice/approval history and PayPal number continuity; the F1 budget paragraph now matches `apps/api/src/close.ts`, which checks spending from the current execution month in IST rather than the report month. The final correction repairs G/H's relative documentation/source links in IMPROVEMENTS. No Blueprint, environment value, service or runtime changed.

Each focused check passed before the next correction; all 11 G/H links and 76 affected local links/anchors resolve. Verification passed: DB 180/180 and API 794/794 with no skips, on task-created PostgreSQL 17 `niryat_test` without private env loaders; `pnpm verify` 27/27 (all cached plus fresh root checks), formatting and diff whitespace. The disposable container was stopped/removed; no build needed for docs-only corrections. Logs and durations are in [the ordered review log](IMPROVEMENTS.md#f1-review-corrections-1-then-2-then-3-2026-11-06). H3's exact Profile/health/invoice checks, hosted scheduling/recovery, licence coverage and budget configuration remain awaiting user verification. No real profile/date refresh, database reset, deployment or PayPal/Render service call was performed.

## Unused Bryntum key removed

Recorded 2026-11-05. [render.yaml](../render.yaml) no longer declares `BRYNTUM_LICENSE_KEY` on `niryat-web`; nothing read it, and Bryntum's hackathon trial needs no key ([Bryntum record](BRYUNTUM.md#licence-trial-package-confirmed-unused-key-removed)). `AG_STUDIO_LICENSE_KEY` stays `sync: false`, so its value must be set in the Render dashboard. If the Blueprint was already synced, the old dashboard variable may remain until the user deletes it; it is harmless. No deployment was performed.

## D2: monthly-close task wording

Recorded 2026-11-05. [apps/api/src/close.ts](../apps/api/src/close.ts), shared by local and Workflows closes, now says “payment proof (FIRA)” and points to the renamed “Payment proof” navigation page in newly generated task messages and focus labels. It prepares the same records; workflow inputs, dispatch, persistence, deduplication, approval boundaries and retry behavior are retained. [API calendar](../apps/api/src/calendar.ts) and [FIRA matching](../apps/api/src/fira.ts) changes are also string-only. No Blueprint, environment key, schedule, worker code, dependency or deployment changed. E1/E2 reliability work remains outside D1/D2.

The user approved the [D2 rules-message log](IMPROVEMENTS.md#d2-review-log) before UI/API wording work. Step 4 ordinary API tests passed 507 with 250 database skips; final database-backed checks are recorded in [D2 verification](IMPROVEMENTS.md#d2-verification-and-manual-checks). Saved task text is not migrated; existing deduplicated tasks can retain earlier wording. No PayPal service call, hosted execution or browser/helper connection was performed. After the user deploys, the same D2 manual checks can be repeated on the hosted URLs; hosted runtime behavior and E1/E2 reliability remain **awaiting user verification**.

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

## B6: CA dashboard request limits

Recorded 2026-11-05. B6 enables CA portfolio turns through the existing `/dashboard/turn` service. [Rate-limit middleware](../apps/api/src/rate-limit.ts) now verifies either signed role for that route; other freelancer-only routes retain their existing role gate. [Tests](../apps/api/src/rate-limit.test.ts) cover six CA requests followed by 429/`Retry-After: 60`, user/IP isolation, tampered cookies and continued denial of CA close/extraction. The dashboard still uses the same deployment-wide AI budget, per-user concurrency and sanitized run logging. No Blueprint, proxy/IP trust, hosting configuration, cron, Workflows SDK or deployment changed.

Verification (2026-11-05): focused API integration 96/96, including the CA limiter regression; full API 753/753 and DB 176/176, zero skips, using only disposable PostgreSQL 17 `niryat_test`; web 514/514; final `corepack.cmd pnpm verify` 27/27 tasks and `corepack.cmd pnpm build` 9/9, including a fresh Next build; `git diff --check` passed. [B6](IMPROVEMENTS.md#b6-ca-portfolio-ag-studio-dashboard-p1-ag-studio-prize) records exact commands, logs and manual steps. Limits remain in memory per API instance; hosted behaviour and multi-instance enforcement are not verified. Browser/deployment checks remain awaiting the user.

## E1: sync freshness and light reconciliation

Recorded 2026-11-05. Migration `0010_hard_pestilence` adds deployment-wide `sync_runs` with a partial unique running-row index. `packages/db/src/sync-runs.ts` stores count-only summaries and reads latest status/last successful completion in a consistent snapshot. `apps/api/src/sync.ts` records CLI reconciliation, skips overlaps before payment/dispute reads and adds `--no-agent`. Light mode skips AI configuration, runner construction and nightlyReminders entirely; the nightly job retains reminders. A failed transaction search, dispute poll or per-item reconciliation never advances last success. Reminder failures are separate from data freshness. Explicit refund recovery and monthly-close internal reconciliation retain their existing paths and do not update polling freshness.

`render.yaml` adds `niryat-sync-light` at `*/30 * * * *` UTC (every half hour) with `corepack pnpm --filter @niryat/api sync:payments --no-agent`. It uses the same sandbox seller/database settings as nightly sync and omits AI settings. The existing nightly/monthly schedules stay as before. This is a 30-minute target, not a measured hosted guarantee: PayPal indexing, job duration and outages add delay. Blueprint edits do not deploy anything.

`GET /sync-status` requires a signed freelancer session; it returns only lastSuccessAt, lastStatus and stale, never sync counts or another user's records. No success, or a success at least two hours old, is stale. Today and invoices share the server-rendered `SyncFreshness` notice: relative fresh time, absolute stale time in IST, never-updated and unavailable states, plus a latest-failure warning. Reload refreshes the snapshot; webhooks and close asOf dates are not poll completion times.

Killed-poll recovery: the uniqueness guard intentionally does not expire by wall clock. Confirm that the cron/poll process has stopped, inspect `SELECT id, started_at FROM sync_runs WHERE status = 'running';`, then use its exact ID in `UPDATE sync_runs SET status = 'failed', finished_at = now() WHERE id = '<confirmed stopped run UUID>' AND status = 'running';`. Run a fresh poll afterward. Do not clear a live poll. Count summaries have no error body or credentials. Automatic killed-poll recovery is a known limitation.

Manual checks — awaiting user verification:
1. Prerequisites: apply `corepack.cmd pnpm db:migrate` to your intended development database, use your own sandbox seller configuration and a freelancer account with an invoice (no production credentials). Start `corepack.cmd pnpm dev`; web http://localhost:3000, API http://localhost:3001. POSIX uses `corepack pnpm` in place of `corepack.cmd pnpm`.
2. Sign in at http://localhost:3000/login. Before any recorded poll, http://localhost:3000/overview and /invoices say data may be out of date, last update never. GET http://localhost:3000/api/sync-status returns null/null/true. Logged out or signed in as a CA, the endpoint returns 401.
3. With your approval to read the sandbox seller, run `corepack.cmd pnpm --filter @niryat/api sync:payments --no-agent`. Expect payment/dispute counts without reminders or Claude, then a relative successful update on both pages after reload. The notice's time title gives IST. Re-running creates no duplicate ledger rows/tasks.
4. In a disposable development database only, pause polling after one success. Insert a synthetic failed run with `INSERT INTO sync_runs (started_at, finished_at, status, summary) VALUES (now(), now(), 'failed', '{"payments":{"failed":1}}');`. Reload both pages: the last success stays unchanged and a latest-failure warning appears. To inspect stale copy in that disposable database, run `UPDATE sync_runs SET finished_at = now() - interval '2 hours 1 minute' WHERE status = 'ok';` and reload: expect the absolute-time stale warning. A later approved successful poll clears it. These fixture changes must never be applied to real/demo history; automated tests also cover both states without PayPal access.
5. After the user deploys, check the new cron's half-hour schedule and no-agent command in Render. With explicitly approved sandbox activity, test recovery of a missed webhook within the 30-minute target and record actual times/PayPal indexing delay. Verify the nightly cron alone can run the reminder agent. Hosted timing, proxy behavior and browser layout remain unverified.

Automated results are recorded in IMPROVEMENTS E1 after the task checks. No deployment, browser/helper connection, live PayPal call, environment-file inspection/edit, dependency or feature-checkbox change is part of E1.

E1 automated result (2026-11-05): DB 179/179 and API 762/762 integration, zero skips; final verify 27/27 tasks (21 cached), web 549/549 including relative-time boundaries; production build 9/9 (two cached, fresh Next). All passed before E2 code changes. See IMPROVEMENTS E1 for logs, timings and initial failures corrected before these passes. Browser and hosted checks above remain pending.

## E2: durable manual monthly close

Recorded 2026-11-05. `apps/api/src/routes/close.ts` still reserves agent_runs before starting work, preserving per-user concurrency/409. When dispatch is configured it sends the single owner/month/asOf/manual trigger plus the reserved runId to niryat-worker/monthlyClose and returns 202 without in-process work. `apps/api/src/workflows.ts` validates input/Render acknowledgement and uses runId as the SDK idempotency key; it does not wait for task completion. `server.ts` builds the client from validated `loadWorkflowEnv` values. It reuses the trigger's existing RENDER_API_KEY or RENDER_USE_LOCAL_DEV=true; unconfigured local development retains in-process execution. `render.yaml` now declares RENDER_API_KEY for niryat-api too. No new environment key/template edit was needed.

The API directly declares the already installed @renderinc/sdk 1.4.0; the worker directly declares the existing shared package to reuse one task schema. No new SDK version or registry download. Offline pnpm initially reformatted the lockfile; its unrelated formatting was discarded, leaving only the two three-line importer additions. Frozen offline installation succeeded with scripts disabled. Installed 1.4.0 declarations/implementation and the official [Render Workflows SDK guide](https://render.com/docs/workflows-sdk-typescript) were consulted for startTask, taskRunId, token/local-dev configuration and idempotency options.

`packages/shared/src/index.ts` owns strict monthlyCloseInputSchema (backwards-compatible scheduled dates, optional single user/trigger, complete reserved manual input). The worker forwards validated input unchanged. `closeAllUsers` checks a requested user is a freelancer and never lists/runs everyone in that mode. A reserved run is executed directly, rather than attempting a conflicting second reservation. `packages/db/src/agent-runs.ts` checks exact run/owner/month/asOf/manual trigger/running state and age under a row lock; it inserts the unique first audit call workflow_claim as a permanent execution claim. Duplicate/stale/completed/replaced deliveries skip execution. This reuses existing storage; E2 adds no migration. Other tool logs retain their sequencing. Stored asOf remains valid across midnight.

Recovery: dispatch errors are uncertain, so the route returns sanitized 503/close_dispatch_failed and keeps the reservation active, with no local fallback. The close button explains checking status and waiting 15 minutes before retrying a still-running close. Render may already be executing it. A row older than 15 minutes is marked failed/stale on the next user start (existing behavior); the new run has a new claim. A worker crash after claim is not automatically replayed. The worker task still has its 900-second timeout. No recovery path resets/replays an approved or outcome-unknown PayPal reminder. Existing immutable stage keys, proposal and task deduplication remain.

Manual/local and hosted checks — awaiting user verification:
1. Prerequisites: E1 migration applied, freelancer account with existing sandbox invoices; separate CA account for denial. API/worker use the same intended database/encryption key and sandbox seller. Start `corepack.cmd pnpm dev` (web http://localhost:3000, API http://localhost:3001). POSIX uses corepack pnpm. Do not share keys or switch to production PayPal.
2. With dispatch settings absent, sign in at http://localhost:3000/login and visit /close. Click Run monthly close (the existing button label); expect 202, a running row and then completion/failure via three-second refresh. A second concurrent request returns 409. No PayPal reminder is sent until its separate explicit approval.
3. For local Workflows development, first check `render --version` against the official [local development guide](https://render.com/docs/workflows-local-development). The user may run `render workflows dev -- corepack pnpm --filter @niryat/worker start` (Windows use corepack.cmd). In PowerShell set `$env:RENDER_USE_LOCAL_DEV='true'` in the API/dev terminal before `corepack.cmd pnpm dev`; POSIX uses `RENDER_USE_LOCAL_DEV=true corepack pnpm dev`. Verify monthlyClose registration in the Render dev output; the default task server listens on localhost:8120. This command is a user-only helper connection, not run by the coding agent. No local or hosted registration is claimed as verified.
4. After the user deploys the Blueprint, supply the existing RENDER_API_KEY to niryat-api with permission to start this workspace's registered niryat-worker/monthlyClose task. Keep the monthly cron's existing key. At the hosted /close page click once; expect 202 and exactly one task for that owner's reserved run. Restart only niryat-api while the task is running. Revisit /close: the same row must complete or show a recoverable failure; another freelancer has no run/tasks/proposals from this click. Confirm the task's trigger is manual, not scheduled.
5. If dispatch reports uncertainty, reload /close; do not assume the job was rejected. If still running past 15 minutes, click again: the old row becomes failed/stale and a fresh reservation can run. If the worker died after claim, an automatic delivery retry skips its old claim; use the new user-started run. Compare proposals/tasks before/after recovery: no duplicate invoice-stage keys or task keys, and any already approved/outcome-unknown reminder retains its status and cannot be resent. Do not approve a reminder solely to test restart recovery.
6. As a CA, POST /api/close remains denied (401); ordinary monthly scheduled input {} still targets freelancers only. Live SDK dispatch, permissions, local registration, process-restart behavior and browser state remain unverified until these user checks.

Automated results will be recorded in IMPROVEMENTS E2. Tests use fakes/disposable PostgreSQL, not Render or PayPal. No deployment, browser/helper connection, private environment-file access/edit, feature-checkbox change, commit or publication.

E2 final automated result (2026-11-05): clean full API 779/779 in 39 files (359.58s) and DB 180/180, zero skips; web 551/551, worker 40/40; final pnpm verify 27/27 (10 cached, 1m43.536s), production build 9/9 (two cached, fresh Next, 2m6.507s), diff check pass. Logs and corrected initial test expectations are in IMPROVEMENTS E2. Direct test:db-equivalent commands avoided private environment loaders and used only the disposable niryat_test PostgreSQL container; the application database was untouched. The task container is stopped/removed afterward. All browser/hosted checks listed above, including real dispatch permissions, API restart during execution, measured freshness and sponsor licence validity, remain awaiting user verification.

## E1 review fix: nightly reminders on poll overlap

Recorded 2026-11-05. Fixes review issue 1 only in `apps/api/src/sync.ts` and its existing CLI tests. The light and nightly schedules remain unchanged, including their shared 20:30 UTC start. Light --no-agent polls still skip immediately on overlap with exit 0 and no Claude. The nightly CLI now retries the existing poll lock ten times: delays 5, 10, 20, then seven 30-second waits (245 seconds total, excluding database latency). Failed lock acquisitions perform no PayPal reads and create no extra run rows. After acquiring the lock it reconciles normally, finishes its own sync row and runs nightlyReminders once; it never clears another poll's row or starts reminders while that poll owns the lock.

Each retry uses the current time for the search window, and reminders use the current time after reconciliation, so waiting across IST midnight does not retain yesterday's date. If the lock stays busy, the CLI prints skipped plus a safe error explaining reminders were not run, exits 1 and closes its database. Operator retry after the active poll finishes is required in that case. The existing manual recovery policy for a killed poll is unchanged. No generic retry helper, dependency, configuration key, migration, schedule, worker/manual-close or approval behavior changed.

Three regressions failed against the old code before the fix: busy-to-success nightly recovery, exhausted retry budget and waiting across IST midnight. The existing overlap test now covers light mode specifically. Tests assert no payment reads or reminder run while waiting, exactly one reminder run after recovery, capped delays, failed-job status/cleanup and immediate light skipping. Full API package tests pass 528 with 254 integration skips; separate integration and pnpm verify results follow in IMPROVEMENTS.

Manual collision checks — awaiting user verification:
1. Reuse the E1 development prerequisites above, with a disposable development database, your own sandbox seller and an explicitly approved sandbox read. Start `corepack.cmd pnpm dev` (POSIX: corepack pnpm dev); sign in at http://localhost:3000/login and open http://localhost:3000/close. For a visible reminder run, use a freelancer with an existing rule-due unpaid invoice whose stage has not already been proposed.
2. Only in that disposable database, simulate a poll holding the lock: `INSERT INTO sync_runs (started_at, status, summary) VALUES (now(), 'running', '{}') RETURNING id;`. Copy the returned UUID. No real poll owns this fixture row.
3. In one terminal run `corepack.cmd pnpm --filter @niryat/api sync:payments --no-agent`; expect skipped, exit 0, and no reminder/Claude run. In another terminal run `corepack.cmd pnpm --filter @niryat/api sync:payments` with approval for its sandbox reads; while the fixture holds the lock, this command waits rather than exiting successfully.
4. Within four minutes, release only the fixture row with `UPDATE sync_runs SET status = 'failed', finished_at = now() WHERE id = '<fixture UUID>' AND status = 'running';`. Expect the nightly command to perform its reconciliation on its next retry and then print one reminder summary. Reload /close: each eligible freelancer gets at most one reminder run/proposal for its stage; nothing is sent to PayPal without separate approval. A successful reconciliation updates /overview and /invoices freshness.
5. To inspect exhausted retries, hold a new fixture row for the whole retry budget. Expect the safe busy error, skipped JSON and exit 1 (`$LASTEXITCODE` in PowerShell, `$?` in POSIX), no agent, and no change to the fixture row. Remove the fixture lock with the exact-ID update above, then explicitly retry the nightly command. Do not apply fixture SQL to a real poll or application history.
6. After user deployment, inspect both crons at their existing 20:30 UTC collision: if light wins, nightly must reconcile after it and still reach its reminder summary; if the lock never becomes free within the budget, Render must show failure rather than silent success. Actual hosted ordering/timing and browser state remain unverified.

No browser/helper connection, actual PayPal/Render call, private environment-file access/edit, deployment, commit or publication was performed for this correction.

Review correction verification (2026-11-05): full API integration 782/782 (324.61s) and DB integration 180/180 (35.20s), zero skips; pnpm verify 27/27 tasks (22 cached, 51.687s); normal API 528 passed/254 integration skips; diff check pass. All three new regressions failed against the old early-return behavior, then passed after the small retry-loop fix. Test:db-equivalent commands used disposable PostgreSQL only, without private environment loaders or PayPal/Render calls. Task-created test container stopped/removed afterward. No web/build changes or production build. Local/hosted collision checks above remain awaiting user verification. Logs/results in IMPROVEMENTS; no deployment, commit or publication.

## A5 judge demo setup (2026-11-05)

A5 adds a validated JUDGE_MODE gate in apps/api/src/env.ts/server.ts, /judge-mode and /auth/judge, and corepack pnpm seed:judge in the API package (apps/api/src/seed-judge.ts; packages/db/src/seed-judge.ts). No Blueprint or deployment changed. On a dedicated sandbox demo service, supply JUDGE_MODE=true and a private US sandbox buyer email in JUDGE_BUYER_EMAIL; inherit DATABASE_URL and ENCRYPTION_KEY for the seed. Apply existing migrations first. The seed loads no environment file and makes no PayPal/Render call. It atomically inserts synthetic records and invitation-proven CA links, refuses account collisions and preserves edits/original dates on rerun. User-provided buyer login stays private.

Home and both login pages discover the no-store public boolean after hydration; no web service judge secret/key is needed. Keep judge mode disabled outside the dedicated shared demo. Unpaid synthetic invoices have no PayPal ID; closing the seed creates no reminder proposals. Separately issued sandbox invoices still need explicit approval. Ananya's LUT expires 15 days after the initial seed; for later demos, the user refreshes only the synthetic dates through Profile ([H3](IMPROVEMENTS.md#h3-keep-alive-to-dec-15-and-refresh-demo-dates-p0-phase-8-user)). Preserve database, invoice-number and approval history because PayPal retains sent invoices.

Verification: focused A5 integration 10/10 and full DB 180/180, zero skips; full API/verify/build and command results are recorded in IMPROVEMENTS A5 after completion. Only disposable localhost PostgreSQL is used for automation. Exact startup commands, prerequisites, URLs, inputs and expected outcomes are in that section. Actual hosted configuration, browser behavior and new sandbox send/receipt remain awaiting user verification. No deployment, helper connection, credentials disclosure, new dependency or feature ticks.

A5 final result (2026-11-06): clean full API 792/792 and DB 180/180, zero skips; web 559/559; verify 27/27; final build 9/9 after a successful fresh Next build. The root seed:judge command passed twice on the guarded disposable test database with unchanged fixture counts and no proposed actions. Logs and initial sandbox-account/test-key corrections are in IMPROVEMENTS A5. The test container is removed; no actual Render/PayPal service or private environment file was used. All manual/hosted checks above remain pending; no Blueprint/deployment or credential changes.

## A5 review issue 1: block synthetic refunds (2026-11-06)

Only application refund safety changed: packages/shared/src/index.ts identifies the existing JUDGE-SYNTHETIC- transaction prefix; packages/db/src/actions.ts rejects new proposals, apps/api/src/actions.ts blocks older queued executions before dispatch, and the invoices page hides synthetic refund controls. Error copy explains permanent rejection. Real PayPal captures remain refundable even with null capture_id; those captures are identified by paypal_txn_id. No Blueprint, environment, schedule, SDK, dependency, deployment or fixture-ID changes. Five regressions failed before the correction; focused API passes and full web 561/561 pass afterward. Final DB/API/verify/build evidence and exact startup/URLs/actions/expected results are in IMPROVEMENTS A5 review issue 1. Browser/hosted checks remain awaiting user verification; no actual PayPal/Render call or automatic queue cleanup.

Final synthetic-refund correction results (2026-11-06): API integration 794/794 and DB 180/180, zero skips; web 561/561; verify 27/27 (2m36.831s), fresh production build 9/9 (1m50.973s). Root seed:judge command and asserted fixture counts/zero actions pass on the guarded disposable database. Five regressions failed before the guard and pass afterward; no timeouts or assertions weakened. Disposable test container removed. Exact manual steps and logs are in IMPROVEMENTS A5 review issue 1. Existing queued synthetic actions remain rejectable and cannot dispatch; no automatic cleanup, private env file, actual PayPal/Render call or deployment.

## C4 planned-date migration (2026-11-06)

C4 adds `packages/db/drizzle/0011_vengeful_exodus.sql` and generated metadata: nullable `tasks.planned_date`, with no backfill, deletion or due-date rewrite. Existing rows start null. Before running the updated API/web against an intended database, the user applies `corepack pnpm db:migrate` with their supplied DATABASE_URL using the existing deployment migration procedure. This task only migrates the disposable niryat_test database in automated tests. No Blueprint, environment key, service, schedule, worker or deployment change. POST /tasks/:id/plan is an ordinary signed-freelancer owner/open-only database write; it never calls PayPal or Workflows. The updated web requires the updated API response field. Browser/operator checks and exact URLs/actions/expected results are in BRYUNTUM's C4 section; hosted migration remains awaiting user verification.

Automated: DB182/API796 no skips, web567, API normal532/264 DB skips covered by integration, verify27/build9. Final tooltip cleanup focused integration21 passes. Only a task-created PostgreSQL17 niryat_test container was used, with no private environment loader or application data. Generated snapshot comparison confirms a single added column. IMPROVEMENTS C4 records timings/logs and final cleanup/checks. No Render API call, deployment, environment edit or other task implemented.

Final C4 verify27/build9 passed (45.699s/4.027s); task-created --rm niryat-c4-tests was stopped/removed after integrations. Fresh Next output passed before the final API-only tooltip cleanup. Operator migration/hosted checks remain pending; no application database was accessed. Final logs `.tmp/c4-{verify,build}-final.log`.
