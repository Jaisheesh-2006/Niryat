# Improvements plan: judge readiness, CA view, sponsor depth, plain wording

Written 2026-11-04 for execution by a coding model. Submission target is **2026-11-11** (deadline 2026-11-12, 12:00 PT); judging runs 2026-12-01 to 2026-12-15.
Prize targets: a grand prize, **Best Use of AG Grid (AG Studio)**, **Bryntum** and **Render**. The rules allow **one** sponsor prize per project. AG Studio is the primary sponsor target. Bryntum and Render work must not delay AG Studio or grand-prize work.

Read before starting any task: [AGENTS.md](AGENTS.md), the nearest nested AGENTS.md, [architecture](docs/architecture.md), [build flow §Phase 7](docs/build-flow.md#phase-7-judge-mode-hosting-and-freeze-nov-58), [ADR 0005](docs/decisions/0005-agent-boundary.md) and [PLAN §15–16, §23](docs/PLAN.md).
Hosting and deployment are **out of scope** (the user deploys to Render). Tasks that change [render.yaml](render.yaml) only edit the blueprint; nothing here deploys.

---

## 0. Scope gate (read first)

- **Cut line.** If B1–B5 are not passing `pnpm verify` by **2026-11-08 end of day**, stop CA work at the last passing task. Ship A, C1–C3, D and F. A half-built CA view is worse than none in a demo.
- **Priority:** P0 = must ship for judging. P1 = should ship; strengthens a prize. P2 = only if everything else is done.
- **Golden rules still hold** (AGENTS.md): every PayPal write needs freelancer approval, legal/numeric logic stays in `packages/rules`, sandbox only, zod at every boundary, no `.env*` reads. The only authorized `.env.example` changes are those in section 5, decision 1.
- **One spec per task** still applies. Each task below is one unit; do them in order unless "Depends on" allows otherwise.
- **Do not tick spec checkboxes** unless a task's acceptance actually satisfies them. None of these tasks satisfies an open spec checkbox by itself.

### Order and priority

| Order | Task                                                    | Priority                   | Depends on          |
| ----- | ------------------------------------------------------- | -------------------------- | ------------------- |
| 1     | A1 Security quick fixes                                 | P0                         | —                   |
| 2     | A2 Rate limits                                          | P0                         | —                   |
| 3     | A3 Demo honesty fixes (docs)                            | P0                         | —                   |
| 4     | A4 Make the agent visible                               | P0                         | —                   |
| 5     | B1 Roles and role-aware sessions                        | P0                         | —                   |
| 6     | B2 Separate freelancer and CA sign-in                   | P0                         | B1                  |
| 7     | B3 Freelancer → CA share requests                       | P0                         | B2                  |
| 8     | B4 CA read access to a client's records                 | P0                         | B3                  |
| 9     | B5 CA pages (portfolio list, client view)               | P0                         | B4                  |
| 10    | B6 CA portfolio AG Studio dashboard                     | P1 (AG prize)              | B5                  |
| 11    | C1 Calendar categories, filter sidebar, more views      | P1                         | —                   |
| 12    | C2 Calendar event tooltips with "what to do" and source | P1                         | C1                  |
| 13    | C3 CA multi-client calendar                             | P1 (Bryntum prize)         | B4, C1              |
| 14    | D1 Plain-language glossary and term helper              | P0                         | —                   |
| 15    | D2 Rewrite user-facing wording                          | P0                         | D1                  |
| 16    | E1 PayPal sync freshness and frequent light sync        | P1 (Render prize, Phase 7) | —                   |
| 17    | E2 Durable manual close through Render Workflows        | P1 (Render prize, Phase 7) | —                   |
| 18    | A5 Judge mode: seed and "Try as judge"                  | P0                         | B1–B5 (CA part), A2 |
| 19    | F1 Submission materials                                 | P0                         | all shipped tasks   |
| 20    | C4 Plan-your-work drag on the calendar                  | P2                         | C1                  |
| 21    | G1 Disclaimer says "sandbox only"                       | P0 (Phase 7)               | —                   |
| 22    | G2 Judge-mode keys in the Render Blueprint              | P0 (Phase 7)               | A5                  |
| 23    | G3 Hosted deploy and smoke check (user)                 | P0 (Phase 7)               | G2                  |
| 24    | G4 Hosted reliability checks (user)                     | P0 (Phase 7)               | G3, E1, E2          |
| 25    | G5 Feature freeze and hosted demo-script run            | P0 (Phase 7 exit gate)     | G3, F1 script       |
| 26    | H1 Testing sweep of pending manual checks               | P0 (Phase 8)               | G3                  |
| 27    | H2 Video, compliance checklist and submission (user)    | P0 (Phase 8)               | F1, G5, H1          |
| 28    | H3 Keep alive to Dec 15 and refresh demo dates (user)   | P0 (Phase 8)               | H2                  |

A1–A4, C1–C2, D1 and E1 touch separate files, so they may run in parallel with B.

---

## 1. Shared decisions and contracts (defined once, referenced by tasks)

### S1. Roles

- `users.role`: `text NOT NULL DEFAULT 'freelancer'`, with a `CHECK (role IN ('freelancer','ca'))`. New migration `0007_*` from `pnpm db:generate`. Existing rows become `freelancer`.
- Add `userRoles = ["freelancer", "ca"] as const` and `UserRole` to [packages/shared/src/index.ts](packages/shared/src/index.ts), next to `agentRunKinds`.
- A role never changes after creation. One email has exactly one account and one role (`users.email` stays unique).
- **Only freelancers own compliance data.** A CA account has no profile, clients, invoices, actions, runs or tasks of its own, except `agent_runs` of kind `dashboard` created by B6.

### S2. Role-aware session

- Cookie value becomes `${userId}.${role}.${issuedAtSeconds}`, still signed with `SESSION_SECRET` through `setSignedCookie` ([session.ts](apps/api/src/auth/session.ts)). The schema becomes a tuple of uuid, `z.enum(userRoles)` and digits. Old two-part cookies fail to parse, so users sign in again. That is acceptable; say so in the task notes.
- `startSession(c, userId, role, secret, secure)`: the role is required.
- `readSession(c, secret, now?)`: **unchanged name and return type**, but returns the userId **only for `freelancer` sessions**. CA sessions return `undefined`. This makes every existing route (26 call sites in 13 files) deny CAs with no edits. Do not change those call sites.
- New `readCaSession(c, secret, now?) → string | undefined`: returns the userId only for `ca` sessions.
- New `readAnySession(c, secret, now?) → { userId, role } | undefined`: used only by `/auth/me`, `/auth/logout` and the B4 access reader.
- `GET /auth/me` returns `{ id, email, role }`. Update `sessionUserSchema` in shared and every web caller (the [(app) layout](apps/web/src/app/(app)/layout.tsx) and others found by grep).

### S3. Sign-in surfaces

| Who        | Pages                           | API                                                 | PayPal login   |
| ---------- | ------------------------------- | --------------------------------------------------- | -------------- |
| Freelancer | `/login`, `/signup` (existing)  | `POST /auth/signup`, `POST /auth/login` (existing)  | Yes (existing) |
| CA         | `/ca/login`, `/ca/signup` (new) | `POST /auth/ca/signup`, `POST /auth/ca/login` (new) | **No**         |
- Signup endpoints create an account with their own role only.
- Login endpoints verify the password first (keep the dummy-hash timing defence in [auth.ts](apps/api/src/routes/auth.ts)). Only then, on a role mismatch, return **403** `{ error: "wrong_portal", portal: "ca" | "freelancer" }`. No session is set.
- `signInWithPayPal` must never sign in a CA. If the PayPal email matches a CA account, the existing `email_taken` result applies. Add a test.
- After sign-in: freelancer → `/overview`, CA → `/ca`.
- Exact UI messages (add to the existing message map in [lib/forms.ts](apps/web/src/lib/forms.ts) or wherever `sendJson` messages live):
  - `wrong_portal` with `portal: "ca"`: **"This is a CA account. Sign in on the CA sign-in page."** plus a link to `/ca/login`.
  - `wrong_portal` with `portal: "freelancer"`: **"This is a freelancer account. Sign in on the freelancer sign-in page."** plus a link to `/login`.
- Page copy: freelancer pages say "For freelancers" with a link "Are you a CA? Sign in here". CA pages say "For chartered accountants" with a link back.

### S4. Role routing in the web app (navigation only, never security)

- The API enforces roles (S2). The web app only routes people to the right area.
- Add a request-routing file for Next **16.4.3** (Next 16 renamed `middleware.ts`; **check the installed Next docs for the current file name and API before writing it**). It reads the session cookie's unsigned role segment only to redirect:
  - a `ca` cookie on `(app)` paths → `/ca`;
  - a `freelancer` cookie on `/ca/*` paths except `/ca/login` and `/ca/signup` → `/overview`.

  It never trusts the role for data access.
- The `(app)` layout keeps its `/auth/me` check and also redirects a CA to `/ca`. A new `(ca)` route-group layout requires `role === "ca"`, else redirects to `/ca/login`.
- `apiGet` ([lib/api.ts](apps/web/src/lib/api.ts)) currently redirects 401 to `/login`. Add an optional `loginPath` argument (default `/login`); CA pages pass `/ca/login`.

### S5. Share links (freelancer invites a CA)

New table `ca_links`:

| Column                                   | Type                             | Notes                                                          |
| ---------------------------------------- | -------------------------------- | -------------------------------------------------------------- |
| `id`                                     | uuid pk                          |                                                                |
| `freelancer_user_id`                     | uuid fk users, not null          | must be a freelancer                                           |
| `ca_email`                               | text not null                    | trimmed, lowercased                                            |
| `ca_user_id`                             | uuid fk users, null              | set when the invitation code is redeemed; must be a CA         |
| `invitation_code_hash`                   | text, null for legacy ended rows | SHA-256 of the full invitation code; required for active links |
| `status`                                 | text not null                    | `pending` \| `accepted` \| `ended` (CHECK)                     |
| `ended_by`                               | text null                        | `freelancer` \| `ca`, set when status becomes `ended`          |
| `created_at`, `responded_at`, `ended_at` | timestamptz                      |                                                                |
- **At most one active link per freelancer:** a partial unique index on `freelancer_user_id WHERE status IN ('pending','accepted')`.
- The request stores an email. The API **does not look up whether that email has an account**, to avoid revealing who is registered. Signup emails are unverified, so an email match alone never reveals or authorizes a request. Creation generates a code made of the link UUID and 256 random bits, returns it only once with `Cache-Control: no-store`, and stores only its SHA-256 hash. The freelancer privately gives the code to their intended CA. The CA signs in with the invited email and redeems the code through a JSON POST; only then can that account list or respond to the pending request. Codes never go in URLs, logs or persistent browser storage. Lost codes require cancelling and creating a fresh request. **No email is sent** (no mail service exists; a non-goal).
- Allowed transitions. Each is atomic, `UPDATE … WHERE status = <expected> RETURNING`, like the `agent_actions` claim:

| From                    | To                               | Who        | Condition                                                                                            |
| ----------------------- | -------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| —                       | `pending`                        | freelancer | no active link; `ca_email` ≠ own email                                                               |
| `pending`               | `pending` (claim)                | CA         | code hash and invited email match; bind `ca_user_id`; repeat claims by the same account are harmless |
| `pending`               | `accepted`                       | CA         | invited email matches and `ca_user_id` = session user after claim; set `responded_at`                |
| `pending`               | `ended` (`ended_by: ca`)         | CA         | invited email matches and `ca_user_id` = session user after claim (decline)                          |
| `pending` or `accepted` | `ended` (`ended_by: freelancer`) | freelancer | owner and supplied `linkId` matches the displayed link (cancel or stop sharing)                      |
| `accepted`              | `ended` (`ended_by: ca`)         | CA         | `ca_user_id` = session user and supplied `linkId` matches (stop managing)                            |
- An ended link is never reopened; the freelancer creates a new request.
- Security migration `0009` ends all pre-fix active links because they have no invitation proof. It preserves their history and sets `ended_at`; `ended_by` stays null for this administrative closure. Users must re-invite. A database CHECK rejects any new active row without an invitation hash.
- **Endpoints** (JSON only, through `parseJsonBody`):
  - Freelancer (`readSession`):
    - `GET /ca-link` → `{ link: null | { id, caEmail, status, createdAt, respondedAt } }`
    - `POST /ca-link` `{ caEmail }` → 201 `{ link, invitationCode }` | 400 `invalid_request` | 400 `own_email` | 409 `link_exists`; GET never returns codes or hashes
    - `POST /ca-link/end` `{ linkId }` → 204 | 400 `invalid_request` | 404
  - CA (`readCaSession`):
    - `POST /ca/requests/claim` `{ invitationCode }` → 204 | 400 `invalid_request` | 404 `invalid_invitation`; wrong email/code, unknown or non-pending links share the same 404
    - `GET /ca/requests` → only pending links already claimed by this CA, also matching their email: `{ id, freelancerName, freelancerEmail, createdAt }[]`. `freelancerName` is the profile `legalName` or null. An unproved account sees no requester details.
    - `POST /ca/requests/:id/accept` and `POST /ca/requests/:id/decline` → 204 | 404
    - `POST /ca/clients/:freelancerId/end` `{ linkId }` → 204 | 400 `invalid_request` | 404; neither end route can affect a replacement link
- Repository functions in a new `packages/db/src/ca-links.ts`, exported from the db index. Follow the error-wrapping and zod-parsing style in [users.ts](packages/db/src/users.ts).

### S6. CA read access to a client's records

- New `readClientAccess(c, deps, clientParam: string | undefined) → { userId: string; viewer: "owner" | "ca" } | undefined` in `apps/api/src/auth/`.
  - Freelancer session and no `client` param → `{ userId: self, viewer: "owner" }`.
  - Freelancer session with any `client` param that isn't the freelancer's own id → `undefined`. **Never** let a freelancer read another freelancer.
  - CA session with a valid uuid `client` param and an `accepted` link (`ca_user_id` = CA, `freelancer_user_id` = client) → `{ userId: client, viewer: "ca" }`.
  - Anything else → `undefined`.
- Routes that adopt it map `undefined` to **401 when there is no session** and **404 `not_found` otherwise**, so a CA can't learn whether an unlinked id exists.
- **Adopt only in these handlers** (each is a one-line swap from `readSession` plus reading `c.req.query("client")`):
  - `GET /health-check`, `GET /invoices`, `GET /calendar`, `GET /gstr1`, `GET /advance-tax`, `GET /dashboard`, `GET /fira`, `GET /tasks`;
  - `POST /gstr1/file`. It computes a CSV and stores nothing. **Verify that** in [routes/gstr1.ts](apps/api/src/routes/gstr1.ts) before adopting it.
- Every other POST keeps `readSession`, so CAs stay denied: approvals, invoice issue, refunds, FIRA upload and confirm, tasks done, profile save, close start, extraction.
- `POST /dashboard/turn` gets CA access in B6 only, for the CA's own portfolio session, never with `client`.
- **Response projection for CAs:** `GET /invoices` for a CA viewer must omit action payloads (`agent_actions` payloads contain recipient emails) and must not include PDF file tokens. Read the invoice view type first and drop those fields when `viewer === "ca"`. The freelancer response is unchanged.

### S7. Background jobs ignore CAs

`listUserIds` ([users.ts](packages/db/src/users.ts)) is used by the all-user close and sync in [close.ts](apps/api/src/close.ts) (lines ~562 and ~581). It must return **freelancer ids only**. Add a DB test proving a CA account is excluded.

### S8. Rate limiter

- `createRateLimiter({ windowMs, max }) → (key: string, now: number) => boolean` in `apps/api/src/rate-limit.ts`: a fixed window with in-memory state **inside the returned closure**, not module-level (AGENTS.md). Build it in [server.ts](apps/api/src/server.ts) and pass it in through `AppDeps` (optional; absent in tests means unlimited).
- Key = route group + client IP. Ignore `x-forwarded-for`: callers can forge its first entry. Only on Render (`RENDER=true`, validated at startup), use the validated `CF-Connecting-IP` that Render's public ingress overwrites; otherwise use the connection address. Next's existing rewrite must reach the API over Render's workspace-private network (`API_INTERNAL_HOSTPORT` from the API service's `hostport`), preserving that ingress header. Public API requests get their own protected ingress header; same-workspace private services are trusted. Missing/invalid ingress headers fall back to the connection address. For AI and share groups, append the verified session userId. See [Render's header guidance](https://render.com/articles/host-pocketbase-on-render#making-pocketbase-see-the-real-client-ip).
- Over limit → **429** `{ error: "rate_limited" }` with a `Retry-After` header in seconds.
- Mark it `// shortcut: in-memory per instance; move to Postgres or Redis if the API runs more than one instance.`

| Group   | Routes                                                                                 | Limit                 |
| ------- | -------------------------------------------------------------------------------------- | --------------------- |
| `auth`  | `POST /auth/login`, `/auth/signup`, `/auth/ca/login`, `/auth/ca/signup`, `/auth/judge` | 10 per minute per IP  |
| `ai`    | `POST /dashboard/turn`, `POST /extract`, `POST /close`                                 | 6 per minute per user |
| `share` | `POST /ca-link`                                                                        | 10 per hour per user  |

### S9. Plain-language rules (used by D1/D2 and every new string in this plan)

1. **Plain word first, legal term second, once per page:** "the yearly form that lets you bill foreign clients without GST (LUT, form RFD-11)". After that, the short term alone is fine.
2. **Every warning says three things:** what is wrong, what to do, and who does it ("you", "your CA" or "in PayPal").
3. **Keep the meaning of the law exactly.** Never change a number, date, threshold, condition or "may"/"must". If a simpler sentence would change the legal meaning, keep the original.
4. **Never change these strings:**
   - `LUT_ENDORSEMENT` and the other legal text printed on the invoice PDF ([export-invoice.ts](packages/rules/src/export-invoice.ts));
   - rule IDs, `source` citations and YAML descriptions ([india-export.yaml](packages/rules/rules/india-export.yaml));
   - GSTR-1 CSV headers and values;
   - PayPal payloads;
   - the "verify with your CA" or "confirm with your bank" notes (wording may become plainer, but the note must stay).
5. Short sentences, under ~20 words where possible. No "pursuant", "aforesaid" or "realisation" without a gloss.
6. **Figures stay out of AI text** (ADR 0005). This only affects code-written text.

---

## 2. Tasks

### A1. Security quick fixes (P0)

**Objective:** close the two config gaps found in the security review.
- [render.yaml](render.yaml): add `NODE_ENV=production` (a `value:`, not `sync: false`) to `niryat-api`, `niryat-web` and every cron/worker service that runs API code. Reason: `secureCookies` is `NODE_ENV === "production"` ([server.ts:31](apps/api/src/server.ts#L31)), and env.ts defaults to `development`.
- [apps/web/next.config.ts](apps/web/next.config.ts): add `headers()` returning, for `/:path*`:
  - `X-Frame-Options: DENY`
  - `Content-Security-Policy: frame-ancestors 'none'`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Content-Type-Options: nosniff`

  Do **not** add a full script/style CSP: AG Studio and Bryntum inject styles, and a strict CSP would need testing in the browser.

**Edge cases:** the PDF route already sets its own headers; the proxied API responses are unaffected.

**Tests:** extend [scripts/guardrails.test.mts](scripts/guardrails.test.mts) or add a small test asserting that `render.yaml` sets `NODE_ENV=production` for `niryat-api`. Add a web test importing the config and checking that `headers()` includes `X-Frame-Options: DENY`.

**Acceptance:** `pnpm verify` and `pnpm build` pass.

### A2. Rate limits (P0)

**Objective:** implement S8. **Files:** new `apps/api/src/rate-limit.ts` with a test; [server.ts](apps/api/src/server.ts); `AppDeps` in [routes/auth.ts](apps/api/src/routes/auth.ts); the routes listed in S8. Remove the "no rate limiting on login" shortcut comment once done.

**Tests:**
- Unit test: window boundary, reset, separate keys.
- Route tests: the 11th login in a minute → 429 with `Retry-After`; another IP is unaffected; no limiter in deps → unlimited.

**Acceptance:** `pnpm verify` passes, and existing route tests pass unchanged.

### A3. Demo honesty fixes (docs only, P0)

1. [PLAN §16](docs/PLAN.md#16-demo-script-3-minutes) says _"Upload the FIRA → AI matches it"_. FIRA matching uses **no AI** (architecture.md). Change it to: _"Upload the FIRA → Niryat matches each line to a PayPal payment (no AI, by design) and flags one line with a reason"_.
2. **Conflict to resolve:** the demo shows **"LUT expired"**, then sends an invoice. An expired LUT is a `high` flag, and high flags **block** invoice issuing ([export-invoice.ts](packages/rules/src/export-invoice.ts) `checkLut` filter). Change the script to **"LUT expires in N days"** (`lut_expiring`, low severity, does not block). A5 must seed `lutValidTo` 10–20 days after the seed date so this flag shows.
3. Say on screen and in the README that the FIRA used is a **synthetic sample**.

**Acceptance:** text-only diff; `pnpm verify` passes (the scaffold check reads PLAN).

### A4. Make the agent visible (P0)

**Objective:** the monthly close's investigation is the strongest "AI agent + PayPal" evidence. Make it visible without clicks.

**File:** [close/page.tsx](apps/web/src/app/(app)/close/page.tsx) (tool-call `<details>` at ~line 240).

**Requirements:**
- The **most recent run's** tool-call list renders open (`<details open>`); older runs stay closed.
- Plain labels, defined in [lib/status.ts](apps/web/src/lib/status.ts) next to the existing labels:
  - actor `agent` → **"Claude"**, `system` → **"Niryat"**;
  - tool names → plain verbs, e.g. `get_invoice` → **"Read a PayPal invoice"**, `list_transactions` → **"Read PayPal transactions"**, `propose_reminder` → **"Drafted a reminder for your approval"**, `suggest_task` → **"Suggested a task"**, `write_summary` → **"Wrote the summary"**.

  Find the complete tool list in [close-agent.ts](packages/agent/src/close-agent.ts) and [paypal-tools.ts](packages/agent/src/paypal-tools.ts). Unknown names fall back to the raw name.
- Keep the raw input/output `<pre>` behind a nested "Show details" disclosure.
- Above the table, one line: **"Claude read your PayPal records with read-only tools. Nothing was sent or changed. Every PayPal action below waits for your approval."**

**Tests:** update [ActionButtons.test.tsx](apps/web/src/components/ActionButtons.test.tsx) or the close page test: the latest run is open, labels are mapped, and unknown names fall back.

**Acceptance:** web tests and `pnpm build` pass.

### B1. Roles and role-aware sessions (P0)

**Objective:** implement S1, S2 and S7.

**Files:**
- [schema.ts](packages/db/src/schema.ts) plus migration `0007` (`pnpm db:generate`);
- [users.ts](packages/db/src/users.ts): `createUser` gains `role` (default `freelancer`); `findUserByEmail` and `findUserById` return `role`; `listUserIds` filters freelancers;
- [session.ts](apps/api/src/auth/session.ts), [auth.ts](apps/api/src/routes/auth.ts) (`startSession` callers, `/auth/me`);
- shared `sessionUserSchema`, `userRoles`;
- test helpers in [auth/testing.ts](apps/api/src/auth/testing.ts).

**Tests:**
- Session tests: a CA cookie is rejected by `readSession` and accepted by `readCaSession`; a tampered role fails the signature; an old two-part cookie fails.
- DB: role default, the CHECK constraint, `listUserIds` excludes CAs.
- Route: `/auth/me` includes `role`.
- One representative freelancer route test with a CA cookie → 401.

**Acceptance:** `pnpm verify` passes, DB/API integration suites pass on the test database (`test:db`), and no existing freelancer behaviour changes.

**Implementation notes (2026-11-05):** B1 adds migration `0007_windy_johnny_storm`, the shared roles and role-aware signed sessions. Existing database rows default to `freelancer`; background close/sync selection excludes CAs. `/auth/me` returns `role` for either session type, while existing freelancer routes retain their `readSession` checks and reject CA cookies. Signup/login response bodies are unchanged. **Old two-part cookies are invalid: users must sign in again.** Apply migration `0007` before running the updated application. CA portals and web role routing remain B2.

**Automated validation:** offline `corepack.cmd pnpm db:generate --config=../../.tmp/b1-drizzle.config.ts` generated migration `0007` using an ignored config with the existing schema/output/dialect and no environment loading. `corepack.cmd pnpm verify` passed all 27 tasks; `corepack.cmd pnpm build` passed all 9. The DB and API suites passed **156/156** and **656/656** tests respectively, zero skips, on a disposable PostgreSQL 17 `niryat_test` database. To avoid the `test:db` wrappers loading private environment files, the equivalent commands were `corepack.cmd pnpm --filter @niryat/db exec vitest run --no-file-parallelism` and the matching `@niryat/api` command, with only a task-specific `TEST_DATABASE_URL`. Ordinary verification's 77 DB and 194 API integration skips are separate from those full runs. No application database, private environment file, PayPal service, browser or deployment was accessed. No feature checkbox was ticked.

**Manual session check — awaiting user verification:** prerequisites are the user's existing local database/auth configuration and a freelancer account. From the repo root, run `corepack.cmd pnpm db:migrate`, then `corepack.cmd pnpm dev` (web `http://localhost:3000`, API `http://localhost:3001`). With an old session cookie, open `/overview`: expect a redirect to `/login`. Sign in with the existing credentials; open `http://localhost:3000/api/auth/me`: expect `id`, `email`, `role: "freelancer"` and no password hash. Return to `/overview` and `/health-check`: expect existing freelancer behavior. Sign out and reopen `/api/auth/me`: expect HTTP 401. If no old cookie remains, its rejection has automated coverage only. CA isolation is tested with signed test cookies; no CA UI is added in B1.

### B2. Separate freelancer and CA sign-in (P0)

**Objective:** implement S3 and S4.

**Files:**
- [auth.ts](apps/api/src/routes/auth.ts): add the CA routes; reuse the existing signup/login loop body through a small helper taking `role`. **No copy-paste of the loop.**
- [AuthForm.tsx](apps/web/src/components/AuthForm.tsx): add an `audience: "freelancer" | "ca"` prop deciding the endpoint and the redirect.
- New `(public)/ca/login/page.tsx` and `(public)/ca/signup/page.tsx`. CA pages have **no** PayPal button.
- New `(ca)/layout.tsx`: shell like `(app)/layout.tsx` with a CA nav ("Clients", "Calendar", "Requests") and the sign-out button.
- The Next request-routing file (S4); `apiGet` `loginPath`.

**Edge cases:** a CA at freelancer login → 403 `wrong_portal` with the S3 message; a freelancer at CA login → the mirror message; a CA email used through PayPal login → `email_taken`; signing up at the CA page with an email already used by a freelancer → 409 `email_taken`, the existing message.

**Tests:**
- Route matrix for 4 login cases × role.
- Web form test: audience → endpoint and redirect.
- Routing-file unit test for redirects: CA cookie on `/invoices` → `/ca`; freelancer cookie on `/ca` → `/overview`; `/ca/login` is always reachable.

**Browser check (user):** sign up as a CA at `/ca/signup` → lands on `/ca`; visiting `/overview` redirects to `/ca`; freelancer sign-in with the CA email shows the S3 message.

**B2 implementation (2026-11-05):** both password portals use one role-taking registration helper in `apps/api/src/routes/auth.ts`. Signup fixes the role by endpoint; login verifies the password (including the unknown-user dummy hash) before returning `403 wrong_portal`, without setting a session. The shared PayPal lookup in `packages/db/src/users.ts` excludes CAs, including accounts with a stored payer ID. Existing freelancer response shapes and API session checks are preserved. No PayPal service call was made.

The web reuses `AuthForm`, validated form errors, `NavLinks`, the existing shell components and sign-out. CA public pages have no PayPal button; `(ca)/layout.tsx` verifies the CA role through `/auth/me`, and `/ca` explains that client sharing is not available yet. `apiGet` accepts a login path; sign-out returns CAs to `/ca/login`. The freelancer layout redirects a verified CA. `src/proxy.ts` uses an unsigned role hint for navigation only, with public CA auth exceptions and an explicit protected-path matcher. The installed Next 16.4.3 `proxy.md` was read before implementation; its experimental matcher test helper still exports the older `unstable_doesMiddlewareMatch` name. No dependency, environment file, sponsor adapter/configuration, legal rule or feature checkbox changed. Requests, client records and calendar content remain B3–B5/C3; their CA navigation links are reserved for those tasks.

**B2 automated acceptance (2026-11-05): PASS.** Full web tests: 465/465 in 32 files. Full DB integration: 158/158 in 7 files, zero skips (19.75s). Full API integration: 674/674 in 33 files, zero skips (268.26s). Integration used a disposable PostgreSQL 17 `niryat_test` database. The `test:db` scripts load private `.env` files, so their equivalent commands were run directly: `corepack.cmd pnpm --filter @niryat/db exec vitest run --no-file-parallelism` and `corepack.cmd pnpm --filter @niryat/api exec vitest run --no-file-parallelism`, with a task-specific `TEST_DATABASE_URL`. The application database was untouched. `corepack.cmd pnpm verify` passes all 27 tasks (19 cached, 52.286s), plus root Biome/scaffold and 14 script tests; ordinary no-DB runs skip 79 DB/212 API tests, superseded by the complete integration runs above. `corepack.cmd pnpm build` passes all 9 tasks (5 cached, 1m3.148s), including a fresh Next production build and Proxy. Logs: `.tmp/b2-web-test.log`, `.tmp/b2-db-integration.log`, `.tmp/b2-api-integration.log`, `.tmp/b2-verify-final.log`, `.tmp/b2-build.log`. The known sandbox Git dirty-hash warning did not fail verification/build. Browser checks below remain pending.

**B2 manual checks — awaiting user verification:**
1. Prerequisites: your existing local database/auth configuration; apply B1 migration `0007` with `corepack.cmd pnpm db:migrate` if not already applied. From the repo root run `corepack.cmd pnpm dev` (web `http://localhost:3000`, API `http://localhost:3001`). Use two unused test emails and passwords of 12–128 characters. No PayPal operation is needed.
2. Open `http://localhost:3000/ca/signup`. Expect “For chartered accountants”, a freelancer sign-in link and no PayPal button inside the CA card. Create a CA account: expect `/ca`, your email, “Clients”, “Calendar”, “Requests”, and the notice that client sharing is not available yet. Requests/calendar content is outside B2. Open `/api/auth/me`: expect `role: "ca"`; open `/api/health-check`: expect HTTP 401. Visit `/overview` and `/invoices`: both should redirect to `/ca`.
3. Sign out: expect `/ca/login`. Open `/login`, enter that CA email and its correct password: expect “This is a CA account. Sign in on the CA sign-in page.” with a working `/ca/login` link and no successful sign-in. A wrong password should show only “Email or password is incorrect.” Reusing that CA email at `/signup` should show the existing duplicate-email message.
4. Create a freelancer account at `/signup`: expect “For freelancers”, “Are you a CA? Sign in here”, and successful navigation to `/overview`. Visit `/ca`: expect `/overview`. Both `/ca/login` and `/ca/signup` remain reachable. Sign out, then use the freelancer credentials at `/ca/login`: expect “This is a freelancer account. Sign in on the freelancer sign-in page.” with a working `/login` link. A wrong password should not disclose the account role.
5. Sign in through the correct portal for each account, verify the account email and sign-out destination, and check the CA menu at a narrow viewport with the keyboard. With no session, `/ca` should lead to `/ca/login`. Browser, visual and keyboard outcomes remain unverified until you report them. No browser/helper connection, deployment, commit or publication was performed.

**B2 review fixes 1–2 (2026-11-05):** `PublicAuthLinks.tsx` now chooses the two public-header auth destinations from the pathname, so the header above `/ca/login` and `/ca/signup` stays in the CA portal. Other public pages retain freelancer destinations. The public layout remains a Server Component; only its auth links use the client hook. `apps/web/src/index.test.tsx` renders each CA page inside its full public layout and checks the header separately from the intentional freelancer switch. Both CA regressions failed before the fix and pass afterwards. The existing signup test in `apps/api/src/routes/auth.test.ts` now sends its returned cookie to `/health-check`, asserting exact `401 unauthenticated` for CAs and `404 not_found` for freelancers without a profile; API runtime behavior is unchanged.

Review-fix checks: scoped Biome PASS (4 files); full web tests PASS (470/470, 32 files); focused auth integration PASS (47/47, zero skips, 25.12s) against a disposable PostgreSQL 17 `niryat_test` database, using `corepack.cmd pnpm --filter @niryat/api exec vitest run src/routes/auth.test.ts --no-file-parallelism` and a task-specific `TEST_DATABASE_URL`. The task-created test container was removed. No private `.env` file or application database was used. `corepack.cmd pnpm verify` PASS: all 27 tasks (19 cached, 2m11.591s), plus root checks and 14 script tests. Its ordinary API suite passes 462 tests and skips 212 database-dependent tests; the changed auth file was separately verified with all 47 passing. `corepack.cmd pnpm build` PASS: all 9 tasks (6 cached, fresh Next production build, 2m53.187s). `git diff --check` PASS. Logs: `.tmp/b2-review-before-test.log` (the two expected pre-fix failures), `.tmp/b2-review-web-test.log`, `.tmp/b2-review-auth-integration.log`, `.tmp/b2-review-verify.log`, `.tmp/b2-review-build.log`. The unchanged full DB/API integrations were not repeated for these two narrow fixes. No other review finding/task, dependency, environment file, sponsor integration, legal rule, feature checkbox, PayPal action, browser/helper connection, deployment, commit or publication was changed/performed.

Review-fix browser checks — **awaiting user verification:** with your existing local configuration (B1 migration `0007` already applied), run `corepack.cmd pnpm dev` from the root (web `http://localhost:3000`, API `http://localhost:3001`). Open `/ca/login`, then use the header's **Create account** button: expect `/ca/signup` and “For chartered accountants”. Use the header's **Sign in**: expect `/ca/login`. Repeat both header actions from `/ca/signup`. Use the CA card's **Are you a freelancer? Sign in here** link: expect `/login`; its header should now use `/login` and `/signup`. Check those destinations by keyboard as well. No account creation or PayPal action is required for this link check; signup-cookie authorization is covered by the integration test.

### B3. Freelancer → CA share requests (P0)

**Objective:** implement S5 end to end.

**Files:**
- `ca_links` in schema plus migration (may share `0007` if B1 isn't merged yet; otherwise `0008`);
- `packages/db/src/ca-links.ts`; new `apps/api/src/routes/ca-links.ts` mounted in [index.ts](apps/api/src/index.ts);
- freelancer UI: a **"Your CA"** card on [profile/page.tsx](apps/web/src/app/(app)/profile/page.tsx) (new client component `CaShareCard`);
- CA UI: `(ca)/ca/requests/page.tsx`.

**Exact freelancer copy:**
- Heading **"Share your records with your CA"**.
- Body **"Your CA will see your invoices, payments, deadlines and reports. They cannot send anything from your PayPal or approve actions. You can stop sharing at any time."**
- Field label **"Your CA's email"**, button **"Send request"**.
- Pending: **"Waiting for {email} to accept. Ask them to sign in to Niryat as a CA with this email."** with button **"Cancel request"**.
- Accepted: **"Shared with {email} since {date}."** with button **"Stop sharing"**.
- Errors: `own_email` → **"Enter your CA's email, not your own."**; `link_exists` → **"You already have a CA request. Cancel it first."**

**Exact CA copy:**
- Requests page heading **"Client requests"**.
- Each row shows the freelancer's name (or email if no name), the request date, and **"Accept"** / **"Decline"** buttons.
- Empty: **"No requests. Ask your client to add your email ({email}) in Niryat under Profile → Your CA."**

**Edge cases:** concurrent accept and cancel (atomic `WHERE status`); a CA accepting a request addressed to another email → 404; double accept → the second gets 404; email case and whitespace normalised; a freelancer with an ended link can create a new one.

**Tests:** DB transition tests including concurrency (follow the `agent_actions` claim tests); route tests for every row of the S5 transition table; web tests for card states.

**Acceptance:** `pnpm verify` and DB integration pass.

**B3 initial implementation (2026-11-05, before review fixes):** Added `ca_links`, offline-generated migration `0008_fuzzy_killer_shrike`, shared zod contracts and `packages/db/src/ca-links.ts`. A partial unique index permits one pending/accepted request per freelancer. Creation checks only the owner's account and normalizes the target email; it never queries whether the recipient is registered. Status-checked atomic updates implement acceptance, decline, cancellation, stopping sharing and stopping management. Ended rows are retained; `GET /ca-link` returns only the current active link or null. CA responses verify the stored account role and exact invited email; accepted links record the CA id and response time. Requests project only freelancer name/email/date, with the name read from the profile's unencrypted legalName.

Mounted all S5 routes in `apps/api/src/index.ts`; POST bodies use `parseJsonBody`, including empty JSON objects for transitions. Existing share throttling already covers `POST /ca-link`. Added `CaShareCard` to Profile, `CaRequestButtons` and `/ca/requests`, exact prescribed copy/error mappings, India date formatting and an updated CA landing notice linking to requests. No B4 record-reading permission or B5 portfolio was added. CA stop-managing is available through the S5 endpoint; its client-page control belongs to B5. No dependency, environment file, sponsor adapter/configuration, legal rule or feature checkbox changed. No PayPal service call, browser/helper connection, deployment, commit or publication was performed.

**B3 initial automated acceptance (2026-11-05, before review fixes): PASS.** Full DB integration passes 169/169 in eight files, zero skips (138.85s). Full API integration passes 698/698 in 34 files, zero skips (876.75s). Commands: `corepack.cmd pnpm --filter @niryat/db exec vitest run --no-file-parallelism` and `corepack.cmd pnpm --filter @niryat/api exec vitest run --no-file-parallelism`, with a task-specific `TEST_DATABASE_URL` targeting a disposable PostgreSQL 17 `niryat_test` database. These are the direct equivalents of `test:db`, avoiding those wrappers' private `.env` loaders. The application database was untouched. The task-created `--rm` test container was stopped/removed successfully after the passing API suite. Migration generation also used a temporary offline Drizzle config, removed afterwards.

Full web tests pass 490/490 in 35 files, including the final sharing-date markup. Focused DB tests pass 13/13, API request tests 24/24 and limiter tests 12/12. Updated A2's share-rate-limit test to remove its reserved-route stub and expect the real route's exact `400 invalid_request` for its null body; exact `429`/Retry-After, user-isolation and reset assertions are retained. `corepack.cmd pnpm verify` passes all 27 tasks (19 cached, 3m10.359s), plus root Biome/scaffold and 14 script tests. Its ordinary no-DB suites skip 90 DB and 236 API tests, covered by the complete integrations above. `corepack.cmd pnpm build` passes all nine tasks (two cached, fresh Next production build including `/ca/requests`, 3m37.989s). `git diff --check` passes. Logs: `.tmp/b3-db-integration.log`, `.tmp/b3-api-focused.log`, `.tmp/b3-api-integration.log`, `.tmp/b3-rate-limit.log`, `.tmp/b3-verify-complete.log`, `.tmp/b3-build.log`. The known sandbox Git dirty-hash warning did not fail verification/build. These are pre-review results; current review-fix results and migration guidance follow.

**Strict B3 review fixes 1 then 2 (2026-11-05):** Fixed the invitation proof first and verified it before changing end semantics. Creation now generates a UUID plus 256 random bits and returns the code only in the successful no-store creation response. Only SHA-256 is stored in `ca_links.invitation_code_hash`. `CaShareCard` shows it once for the matching pending link; a full page reload or leaving the page loses the plaintext, with explicit cancel/recreate instructions. The freelancer gives it privately to the intended CA. `CaInvitationForm` posts it to `/ca/requests/claim`, whose atomic email/hash/status match binds `ca_user_id`. GET requests and accept/decline additionally require that binding. An attacker registering the invited email gets an empty list and 404 for responses without the code. Wrong-email, wrong/malformed/ended codes fail without revealing requester details. Matching pending claims are idempotent; an accepted, declined or cancelled code cannot be reused. No code goes in URLs, GET responses, logs or persistent browser storage. Signup email verification itself remains outside this change; the private invitation is the added authorization proof.

Migration `0009_quick_overlord` adds the hash and an active-link CHECK. It ends unproved pre-fix pending and accepted links, preserves their history and sets `ended_at`, with null `ended_by` to avoid inventing a user action. The upgrade was verified against an actual migration-0008 disposable database containing both states, and preserved all three user rows. Existing application shares must be recreated after migration.

After issue 1 passed its focused DB (13), API (28), shared (113) and full web (495) checks, issue 2 added the required `{ linkId }` body to both end routes. Each repository update matches this id, its owner/CA and status in the same statement. `CaShareCard` sends its displayed link id. Stale freelancer cancel/stop requests and CA stop-managing requests return exact 404 without changing a replacement link; missing/malformed ids return 400 with field names only. Future B5 portfolio rows include `linkId` so its stop-managing control can use the same contract. No B4 read permission, auth-account workflow, dependency, environment file, sponsor integration/configuration, legal rule or feature checkbox changed. No PayPal service action, browser/helper connection, deployment, commit or publication was performed.

**Review-fix automated acceptance (2026-11-05): PASS.** Focused final DB 16/16; focused final API 33/33; shared 114/114; full web 495/495 in 35 files. Full DB integration passes 174/174 in eight files, zero skips (25.32s). Full API integration passes 707/707 in 34 files, zero skips (524.97s). Commands: `corepack.cmd pnpm --filter @niryat/db exec vitest run --no-file-parallelism` and the matching `@niryat/api` command, with a task-specific `TEST_DATABASE_URL` targeting only a disposable PostgreSQL 17 `niryat_test` database. These direct equivalents of `test:db` avoid private `.env` loaders; the application database was untouched. The separate upgrade assertion verified both legacy states against migration 0009 before integration resets. Generation used a removed temporary offline Drizzle config.

`corepack.cmd pnpm verify` passes all 27 tasks (nine cached, 2m22.86s), including fresh API/web typechecks, root Biome/scaffold and 14 script tests. Ordinary no-DB runs skip 95 DB and 245 API tests, covered by the complete integrations above. `corepack.cmd pnpm build` passes all nine tasks (two cached, fresh Next production assets, 2m15.111s). `git diff --check` passes. The task-created `--rm` PostgreSQL container was stopped/removed successfully after integration passed. The known sandbox Git dirty-hash warning was nonfatal. Logs: `.tmp/b3-fix1-*.log`, `.tmp/b3-fix2-*.log`, `.tmp/b3-fixes-db-integration.log`, `.tmp/b3-fixes-api-integration.log`, `.tmp/b3-fixes-verify.log`, `.tmp/b3-fixes-build.log`. Browser checks below remain awaiting the user.

**B3 manual checks — awaiting user verification:**
1. Prerequisites: your existing local database/auth configuration and separate freelancer/CA browser profiles. From the root run `corepack.cmd pnpm db:migrate` through migration **0009**, then `corepack.cmd pnpm dev` (web `http://localhost:3000`, API `http://localhost:3001`). Migration 0009 intentionally ends pre-fix active shares; re-invite. Reload old tabs so they use the new `{ linkId }` end contract. No mail service or PayPal operation is needed.
2. As freelancer, sign in at `http://localhost:3000/login`, open `/profile` and find **Your CA**. Your own email must show **“Enter your CA's email, not your own.”** Enter the CA email and choose **Send request**. Expect the normalized waiting notice and **Invitation code (shown once)**. Copy the code and send it privately to the intended CA. Reload the page: the code must be absent and the page must explain cancellation/recreation if lost. Do not post a real code in logs, screenshots or a public channel.
3. As CA, sign in at `http://localhost:3000/ca/login` and open `/ca/requests`. Before code entry, expect no requester details, including if this CA signed up after the invitation. Enter a wrong code: expect a visible error. Enter the genuine code under a different CA email: expect an error and no details. Sign in with the invited email, enter the genuine code and choose **Open request**: expect the freelancer name (or email), India request date and **Accept**/**Decline**. No code should appear in the URL. Choose **Decline**: the row disappears and the owner can create a new invitation with a new code.
4. Create and redeem a new request, then **Accept**. Refresh the freelancer profile: expect the sharing date and **Stop sharing**. Stop it: expect the email form again. Also cancel a pending request with **Cancel request**. Old codes must no longer open either ended request. Accepted codes likewise cannot reopen it. Matching email alone, even with a known request id, must never allow accept/decline before code redemption.
5. Check a stale freelancer tab: keep tab A showing request X; in tab B cancel X and create Y to another CA. In tab A choose the old **Cancel request**. Expect the not-found error; refresh and verify Y remains waiting. Repeat for an accepted X using **Stop sharing**. Missing end bodies now return 400, rather than operating on whichever link happens to be current.
6. To check CA stop-managing before B5 adds the client control, get the freelancer id from `http://localhost:3000/api/auth/me` and current `link.id` from `/api/ca-link` in the freelancer browser. After a claim/accept, run in the CA browser console: `fetch('/api/ca/clients/<freelancer-id>/end', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linkId: '<current-link-id>' }) }).then(r => r.status)`. Expect 204. Create, redeem and accept a replacement for the same CA, then repeat the old end call with the old id: expect 404, and the owner's refreshed profile must still show the new share. Repeating an accept/decline also returns 404.
7. Check narrow-screen layout, dark mode, keyboard labels/focus, read-only code copying and disabled saving controls. No client records become accessible in B3; the CA landing notice still says viewing records is coming next. These browser/visual/keyboard outcomes remain unverified until you report them.
### B4. CA read access to a client's records (P0)

**Objective:** implement S6.

**Files:** new `apps/api/src/auth/client-access.ts` with a test; the eight GET handlers plus `POST /gstr1/file` listed in S6; the CA projection for `GET /invoices`.

**Tests**, a matrix applied to **every** adopted route:
- freelancer self → 200;
- freelancer with `?client=<other>` → 404;
- CA with an accepted link → 200 and the data belongs to the client;
- CA with a pending or ended link → 404;
- CA without `client` → 404;
- CA with a malformed `client` → 404;
- no session → 401.

Also: `GET /invoices` as CA contains no action payloads or file tokens; every non-adopted POST with a CA cookie → 401 (one representative test per route file).

**Acceptance:** the full API suite passes. Review checklist: no route outside S6 reads `client`.

**B4 implementation (2026-11-05):** Added `readClientAccess` and `clientAccessDenied` in `apps/api/src/auth/client-access.ts`, backed by `hasAcceptedCaLink` in `packages/db/src/ca-links.ts`. That function reads only a link with status `accepted` for the exact CA and client pair. Duplicate `client` parameters are denied. Only the nine S6 handlers adopted it: `GET /health-check`, `/invoices`, `/calendar`, `/gstr1`, `/advance-tax`, `/dashboard`, `/fira` and `/tasks`, plus `POST /gstr1/file`. The file route was confirmed to compute a CSV and store nothing. A missing session gets 401 `unauthenticated`; any other denial gets 404 `not_found`. `GET /invoices` for a CA omits `action`, `refundActions` and `pdfUrl`. `pdfToken` was already stripped by `invoiceSchema`. The freelancer's response is unchanged. Every other POST/PUT still uses `readSession`. A grep confirms no other route reads `client`; the remaining `client` hits in `invoices.ts` refer to the invoice's buyer. The B1–B3 tests that used `/health-check` to show CA denial now use `/profile`. The B3 acceptance test now proves `/tasks?client=` returns 200 after accept and 404 after decline.

Tests: `apps/api/src/auth/client-access.test.ts` covers the reader. `apps/api/src/routes/client-access.test.ts` applies the B4 matrix to all nine routes on a fake ledger and asserts every data read uses the client's id. Its cases: owner with no `client`, owner with own id, linked CA → 200; owner with another id, unlinked CA, CA naming the freelancer's own id, CA without `client`, malformed `client` → 404; no session → 401. It also checks the CA invoice projection, and that a linked CA gets 401 from one write per route file (clients, close, dashboard turn, extract, FIRA upload, invoices, refunds, profile, tasks). A DB test covers pending, claimed, accepted, wrong-pair and ended links.

**B4 automated acceptance (2026-11-05): PASS.** Full DB integration 175/175 in eight files, zero skips. Full API integration 743/743 in 36 files, zero skips (303.89s). Commands: `corepack.cmd pnpm --filter @niryat/db exec vitest run --no-file-parallelism` and the matching `@niryat/api` command, with `TEST_DATABASE_URL` pointing only at the disposable `niryat-b4-tests` PostgreSQL 17 container. The application database was untouched. The first full API run found one stale B3 assertion. It expected 404 after acceptance, but its fixture's placeholder ciphertext produced 500. The assertion was rewritten as above and the full suite re-run. `corepack.cmd pnpm verify` passes 27/27 tasks; no-DB runs skip DB/API integration tests covered above. `git diff --check` passes. Logs: `.tmp/b4-db-integration.log`, `.tmp/b4-api-integration.log`, `.tmp/b4-verify.log`. No web page, dependency, environment file, migration, sponsor integration, legal rule or feature checkbox changed. No PayPal call, browser session, deployment or commit was made. No browser check applies until B5 adds CA pages.

### B5. CA pages: portfolio list and client view (P0)

**Objective:** give a CA a read-only workspace.

**New API endpoint** `GET /ca/portfolio` (`readCaSession`), returning one row per accepted link:

```
{ linkId, freelancerId, name, email, healthScore | null, unpaidCount, overdueCount,
  nextDeadline: { date, title } | null, firaMissingCount, pendingApprovals, sharedSince }
```

Build each row from the **existing** builders (`listInvoices` + `toInvoiceView`, `evaluateHealth`, `buildCalendarEvents`, `firaStatus` from the invoice view, the pending-actions count). Add `caPortfolioSchema` to shared. No new compliance logic; counts only.

**New web pages:**
- `(ca)/ca/page.tsx`: portfolio. Until B6 lands it is a plain accessible table sorted by `overdueCount` desc, then `nextDeadline`. B6 replaces the main area with AG Studio; keep this table as the no-JavaScript fallback.
- `(ca)/ca/clients/[id]/page.tsx`: client overview. Sections:
  - health (score and flags with citations);
  - invoices (read-only table: number, date, client, amount, received, status, deadline, FIRA status);
  - deadlines (`deadlineList` of the client's calendar events);
  - GSTR-1 (period preview plus the existing rate inputs and CSV download through `?client=`);
  - pending approvals as a count only, with the text **"Waiting for your client to approve in Niryat."**

  Data via `apiGet(path + "?client=" + id, schema, { loginPath: "/ca/login" })`.

**Hard requirement:** CA pages render **no** mutating controls except the GSTR-1 download and the B3 accept/decline/stop buttons. Reuse display-only components (`StatusBadge`, `PageHeader`, `EmptyState`, formatters). Do **not** reuse `ActionButtons`, `TaskDoneButton`, `FiraLineButtons`, `RefundForm`, `InvoiceForm` or `ClientForm`.

**Edge cases:** a link ended while the CA is viewing → next load 404 → show **"You no longer have access to this client."** and link to `/ca`; a client with no profile → health section shows **"Your client hasn't completed their profile yet."**

**Tests:** route tests for the portfolio (isolation between CAs, ended links excluded, counts from fixtures); page tests asserting no forms or buttons other than the allowed ones; empty state.

**Acceptance:** `pnpm verify` and `pnpm build` pass.

**Browser check (user):** a freelancer shares → the CA accepts → the CA sees the client in the portfolio and opens the client view → the freelancer stops sharing → the CA's next load shows the no-access message.

**B5 implementation (2026-11-05):** `GET /ca/portfolio` (`readCaSession`) in `apps/api/src/routes/ca-links.ts` lists the CA's accepted links through the new `listCaClients` in `packages/db/src/ca-links.ts`. Each row comes from `buildPortfolioRow` in `apps/api/src/dashboard.ts`, which only counts what existing builders produce. Unpaid means status issued, sent or partly paid. Overdue uses the RBI deadline in the invoice view. The next deadline is the earliest overdue or upcoming calendar event. Missing FIRA uses `firaStatus === "missing"`. Pending approvals are proposed invoice, refund and reminder actions; reminders are counted among the latest 50 (marked shortcut). Rows are sorted on the server by overdue count, then next deadline, so B6 can reuse them. `caClientSchema`/`caPortfolioSchema` are in shared.

`/ca` is now the plain portfolio table. `/ca/clients/[id]` checks the id against the portfolio, then reads `/invoices`, `/health-check`, `/calendar` and `/gstr1` with `?client=` and the CA login path. It shows health with citations, read-only invoices, deadlines without links into freelancer pages, GSTR-1 and the pending-approval count. An id not in the portfolio, or an invoice/calendar 404 after a mid-load unshare, shows "You no longer have access to this client." A missing profile shows "Your client hasn't completed their profile yet." in both the health and GSTR-1 sections. The GSTR-1 preview rendering and fetch moved from the freelancer page into `components/Gstr1Report.tsx`; the freelancer page behaves the same. `Gstr1Download` takes an optional `client` for `POST /gstr1/file?client=`. `CaStopManagingButton` uses the B3 `{ linkId }` end contract. The only CA controls are this button, the GET period selector and the GSTR-1 download; none of the forbidden components are used. Known limitation: GSTR-1 messages and notes keep their freelancer wording ("your LUT", "ask your CA") for D2 to revisit. No dependency, environment file, migration, sponsor integration, legal rule or feature checkbox changed. No PayPal call, browser session, deployment or commit was made.

**B5 automated acceptance (2026-11-05): PASS.** `corepack.cmd pnpm verify` passes 27/27 tasks; `corepack.cmd pnpm build` passes 9/9, including the new `ƒ /ca/clients/[id]` route. Full DB integration passes 176/176 in eight files and full API integration 747/747 in 36 files, both with zero skips. They ran through `corepack.cmd pnpm --filter @niryat/db exec vitest run --no-file-parallelism` and the matching `@niryat/api` command, with `TEST_DATABASE_URL` pointing only at the disposable `niryat-b4-tests` PostgreSQL 17 container. The application database was untouched. New tests:
- the `buildPortfolioRow` counts and the empty case;
- a portfolio route test covering isolation between CAs, pending links excluded and ended links excluded, with `/ca/portfolio` added to the role-denial matrix;
- a `listCaClients` DB test;
- portfolio page tests: rows, order, empty and unavailable states;
- client-view page tests: only the allowed buttons and forms, no access, a link ended mid-load, a missing profile, and a 401 sending the CA to `/ca/login`.

The CA layout test now renders a placeholder child instead of the old "coming next" landing page. Logs: `.tmp/b5-verify.log`, `.tmp/b5-build.log`, `.tmp/b5-db-integration.log`, `.tmp/b5-api-integration.log`. `git diff --check` passes.

**B5 review fixes 1–2 (2026-11-05):**
1. The CA client page now sorts health flags high → medium → low, like the freelancer health page. Both pages take labels, tones and order from one new `healthSeverity` map in `apps/web/src/lib/status.ts`, replacing two copies. The CA page test now feeds a low flag before a high one and asserts the high one renders first.
2. New `apps/web/src/components/Gstr1Download.test.tsx` submits the download form in a test without a browser, by stubbing state and `FormData` and calling the submit handler, as other tests here do. It asserts the freelancer posts to `/api/gstr1/file`, a CA to `/api/gstr1/file?client=<id>`, and the exact rates body. A temporary mutation that dropped the `client` query made it fail; the code was restored.

No dependency was added. Checks: the targeted web tests pass (21/21). `corepack.cmd pnpm build` passes 9/9. `corepack.cmd pnpm verify` passes 27/27. Its first run hit a 5 s timeout in the unchanged `(app)/calendar/page.test.tsx`, which imports Bryntum, and passed on re-run. `git diff --check` passes. Logs: `.tmp/b5-review-verify.log`, `.tmp/b5-review-build.log`.

**B5 manual checks — awaiting user verification:**
1. Prerequisites: your existing local database/auth configuration with migrations through 0009, plus separate freelancer and CA browser profiles. From the root run `corepack.cmd pnpm dev` (web `http://localhost:3000`, API `http://localhost:3001`). No PayPal operation is needed.
2. As the CA with no accepted clients, open `/ca`. Expect "No clients yet" and a link to `/ca/requests`.
3. As the freelancer, open `/profile` → **Your CA** and send a request. Give the code to the CA, who redeems and accepts it at `/ca/requests`. As the CA, open `/ca`. Expect one row: the client's name (or email), health score (or "Profile not complete"), unpaid/overdue counts, next deadline, missing FIRA, approvals waiting and the shared-since date.
4. Select the client. On `/ca/clients/<id>`, expect the sections Health (score, flags with rule citations), Invoices, "Overdue and next 10 deadlines", GSTR-1 and Approvals ("Waiting for your client to approve in Niryat.").
   - The only controls should be **Stop managing this client**, the GSTR-1 period selector with **Show period**, the rate inputs and **Download GSTR-1 Table 6A file**.
   - For a GST-registered client with LUT-covered invoices, enter rates and download. Expect a CSV.
   - Changing the period should keep the URL on `/ca/clients/<id>?period=…`.
5. As the freelancer, choose **Stop sharing**. Reload the CA client page: expect "You no longer have access to this client." with a link back to `/ca`, and `/ca` no longer lists the client.
6. Share and accept again, then use **Stop managing this client** as the CA. Expect a return to `/ca` without the client, and the freelancer's profile shows the share form again.
7. Check the portfolio and client tables at a narrow width, in dark mode and with the keyboard. These browser outcomes remain unverified until you report them.

### B6. CA portfolio AG Studio dashboard (P1, AG Studio prize)

**Objective:** a second, distinct AG Studio use: one dashboard across all of a CA's clients, with the AI assistant.

**Files:**
- new `apps/web/src/lib/ca-dashboard.ts` (sources and initial state, mirroring [lib/dashboard.ts](apps/web/src/lib/dashboard.ts));
- new `CaDashboard.tsx` (mirror [Dashboard.tsx](apps/web/src/components/Dashboard.tsx): same theme, modules and licence prop);
- `GET /ca/dashboard` returning the portfolio rows plus `invoices` and `payments` across linked clients, each with `freelancerName`. Reuse the per-user `buildDashboard` projections and add `freelancerName`. **Keep the same privacy projection:** no client emails or addresses, no health-flag citations;
- [routes/dashboard.ts](apps/api/src/routes/dashboard.ts): `/dashboard/turn` accepts a CA session too. The run is recorded under the CA's userId with kind `dashboard`. It takes a `scope: "portfolio"` instruction variant: _"You build AG Studio widgets for a chartered accountant's portfolio of Indian freelancers. …"_ plus the existing figure and data-is-not-instructions lines. The same budget, concurrency and logging rules apply.

**Widgets** (initial state):
1. clients grid (name, health score, unpaid, overdue, missing FIRA, next deadline, pending approvals);
2. PayPal fees by freelancer this financial year (bar);
3. received per month by freelancer (stacked);
4. unpaid invoices nearest to their RBI deadline (grid, top 10);
5. missing FIRA count by freelancer (bar).

**Prompt starters:** "Which clients have missing FIRAs?", "Who has invoices closest to the RBI deadline?", "Show PayPal fees by freelancer this year".

**Tests:** sources reference existing fields (copy the pattern in [lib/dashboard.test.ts](apps/web/src/lib/dashboard.test.ts)); the route returns only linked clients; the turn route accepts a CA and records the run under the CA; freelancer turn behaviour is unchanged.

**Acceptance:** `pnpm verify` and `pnpm build` pass.

**Browser check (user):** the dashboard renders all five widgets; asking each prompt starter creates a widget.

**B6 implementation (2026-11-05):** `/ca` now loads the zod-validated `GET /ca/dashboard` and renders `CaDashboard` above the existing B5 linked-client table. `apps/api/src/ca-dashboard.ts` shares B5's accepted-client loading with `/ca/portfolio`, reuses `buildPortfolioRow`/`buildDashboard`, and returns `asOf`, the rules-derived `financialYear`, `portfolio`, and invoice/payment rows tagged with `freelancerId`/`freelancerName`. Pending, ended, unlinked and another CA's records are excluded. The portfolio retains B5's freelancer identity fields for the table; ledger rows omit customer emails/addresses, actions, PDF URLs and health citations. Studio sources omit portfolio emails too; missing names display “Unnamed freelancer”.

`apps/web/src/lib/ca-dashboard.ts` declares all five widgets and the three specified starters. Fees use payment rows in the current Indian financial year. Receipts use payment gross, with month/currency categories and freelancer-ID series; refunds remain available in the underlying sources for questions. Fees keep currency series separate. Freelancer IDs group data while formatters display names, so equal names cannot merge records. The nearest-unpaid source holds only the first ten positive-shortfall invoices with a known deadline; the full invoice source remains available to the assistant. Date/money conversion, theme, modules and the Claude adapter reuse the freelancer dashboard. The server supplies the same validated, browser-visible AG Studio licence; missing keys retain trial behaviour.

`POST /dashboard/turn` derives portfolio instructions from a signed CA session, rejects query parameters (including `client`), and records a `dashboard` run under that CA's user ID. The bounded wire schema, figure/data instructions, deployment budget, concurrency, cost and sanitized logs are shared with freelancer turns. The existing limiter now recognizes CA sessions on this route and enforces the same six requests per minute per IP/user. No compliance write or PayPal capability is added. No dependency, migration, environment-file edit, later task, feature-checkbox tick, deployment, commit or publication is part of B6. Sponsor records: [AG Studio](AG_STUDIO.md), [Render limiter](RENDER.md#b6-ca-dashboard-request-limits).

**B6 automated verification (2026-11-05): PASS.** Focused API integration: 96/96 in four files, zero skips (78.32s). Full API integration: 753/753 in 36 files, zero skips (268.19s). Full DB integration: 176/176 in eight files, zero skips (25.09s). Final web suite: 514/514 in 39 files. Final `corepack.cmd pnpm verify`: 27/27 tasks (24 cached, 10.451s), including root Biome/scaffold and 14 script tests; final `corepack.cmd pnpm build`: 9/9 tasks (eight cached, fresh Next production build, 57.45s). `git diff --check` passed. Ordinary verify skips 97 DB/249 API integration tests without a database; the separate full integration runs above cover those skips. Tests cover accepted-link isolation/revocation, multiple clients, privacy, CA-owned charged/concurrent runs and instructions, freelancer behaviour, CA rate limits, widget field references, currencies, names, nearest ten, empty data, licence forwarding and the retained table.

Full integration commands were the direct `test:db` equivalents: from `packages/db`, then `apps/api`, with `TEST_DATABASE_URL` set only for each process to the task-created PostgreSQL 17 `niryat_test`, run `node ../../node_modules/vitest/vitest.mjs run --no-file-parallelism`. This avoids the wrappers' prohibited private `.env` loader; the application database was untouched. The first API run found one incorrect test expectation for an existing profile name; corrected before the passing focused and full reruns. The sandbox Git dirty-hash warning was nonfatal. Logs: `.tmp/b6-db-integration.log`, `.tmp/b6-api-focused-integration.log`, `.tmp/b6-api-integration-final.log`, `.tmp/b6-verify-final.log`, `.tmp/b6-build-final.log`. No browser or real model/PayPal service was called by the coding assistant; AI/PayPal dependencies in automated tests were fakes.

**B6 manual checks — awaiting user verification:**
1. Prerequisites: apply the existing migrations through `0009` to your local application database using `corepack.cmd pnpm db:migrate` (no new B6 migration). Use two freelancer accounts with distinguishable names and existing invoice/payment records, a CA account, and an unrelated freelancer or second CA. Follow B3's private-code claim/accept steps at Profile → Your CA and `/ca/requests`. Keep one other invitation pending or assigned to the other CA. Questions require the existing server-side Claude configuration and remaining budget; the deterministic widgets/table also work without AI. Use sandbox records only; B6 itself performs no PayPal action.
2. Start `corepack.cmd pnpm dev` from the repository root (POSIX: `corepack pnpm dev`). API: `http://localhost:3001`; web: `http://localhost:3000`. Sign in as the CA at `http://localhost:3000/ca/login`, then open `http://localhost:3000/ca`. Expect five widgets: clients, fees, monthly receipts, nearest ten unpaid invoices, and missing FIRA. The client list below opens `/ca/clients/<freelancer-id>`. Disable JavaScript and reload `/ca`: the server-rendered table and client links must remain usable. Re-enable JavaScript afterwards.
3. Compare clients/counts with each shared client's read-only view. Check currencies remain separate, fees include only payments in the current April–March year, and receipts exclude refunds. With more than ten qualifying invoices, the unpaid grid must show the ten earliest known deadlines. Two equal freelancer names must remain separate groups. A missing profile name uses “Unnamed freelancer” in widgets; the table retains its B5 email fallback. Try keyboard navigation, light/dark mode and a narrow viewport.
4. In the assistant, ask each exact starter: “Which clients have missing FIRAs?”, “Who has invoices closest to the RBI deadline?”, “Show PayPal fees by freelancer this year”. Each should create an appropriate widget from the shared sources. Expect figures in widgets, no PayPal approval/execution tool, and an honest unavailable/budget/busy message when applicable. The API run belongs to the CA account. After six requests in a minute, another request returns 429 with `Retry-After: 60`; wait before continuing.
5. In browser Network, inspect `GET /api/ca/dashboard`: only accepted clients and their projected ledger rows should appear; no customer email/address, action/PDF payload or health citations. A CA portfolio includes freelancer identity emails for the existing table, but Studio sources must not include those emails. End sharing from the freelancer's Profile, then fully reload `/ca`: that client's rows and payments must disappear. Pending/unlinked/other-CA data must never appear. A previously loaded dashboard is a snapshot until reload; revocation does not erase already delivered data.
6. In the CA browser console, `await fetch('/api/dashboard/turn?client=00000000-0000-4000-8000-000000000000', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'}).then(async r => [r.status, await r.json()])` must return `[400, {error:'invalid_query'}]` while under the limit. In a freelancer session, `/dashboard` and its existing starters must still work; `GET /api/ca/dashboard` returns 401. An anonymous request also returns 401. No browser/helper session has been run by the coding assistant.

**Known limits:** B5's latest-50 reminder count remains; Studio numbers are display aggregates, not compliance calculations. AI replies remain buffered and the existing flat attempt charge/budget limitations remain. AG Studio licence/trial coverage and the browser checks above remain unverified; no hosted result is claimed.

### C1. Calendar categories, filter sidebar, more views (P1, Bryntum)

**Objective:** use real Bryntum features (resources with a filter sidebar, more modes) instead of a plain read-only month grid.

**Files:** [CalendarView.tsx](apps/web/src/components/CalendarView.tsx), [lib/calendar.ts](apps/web/src/lib/calendar.ts) with its test, [globals.css](apps/web/src/app/globals.css).

**Requirements:**
- Map `CalendarEvent.kind` → a category resource, defined once in `lib/calendar.ts`:

| Resource     | Kinds                                                | Label                 |
| ------------ | ---------------------------------------------------- | --------------------- |
| `gst`        | `lut_renewal`, `gstr1_due`, `credit_note_declare_by` | GST                   |
| `income_tax` | `advance_tax`                                        | Income tax            |
| `rbi`        | `rbi_deadline`                                       | RBI payment deadlines |
| `paypal`     | `dispute_response`, `recurring_invoice`              | PayPal                |

Resource colours come from CSS tokens (add `--niryat-cat-*` with dark-mode values). **State stays distinct by the title prefix and `cls`** (overdue, upcoming, past), so colour is never the only signal.
- Enable modes `agenda`, `week`, `month`, `year`, `list`. Keep `day` off. The default is `month`.
- Show the built-in sidebar with the resource filter, so users can tick categories on and off.
- Everything stays `readOnly`. **Check every config name against the installed `@bryntum/calendar` 7.3.8 types** before using it.
- The server-rendered deadline list on the page is unchanged (the no-JavaScript fallback).

**Tests:** mapping covers every kind (an exhaustive switch with a `never` check); events carry `resourceId`.

**Browser check (user):** the filter sidebar hides and shows categories; the year view shows the whole financial year.

**C1 implementation (2026-11-05):** category resources, exhaustive kind mapping, built-in sidebar filters, five read-only modes and light/dark category tokens are implemented. The server-rendered deadline list is unchanged. **User-approved adjustment:** installed Bryntum 7.3.8 supports a January–December year view; use that standard view and document that April–March requires two year pages. No custom fiscal-year view is required for C1. Web tests pass 515/515; `pnpm verify` passes 27/27 tasks; `pnpm build` passes 9/9 tasks; `git diff --check` passes. Browser checks remain awaiting user verification; see the [C1 record, verification results and exact manual steps](BRYUNTUM.md#c1-category-resources-filter-sidebar-and-views).

### C2. Calendar event tooltips with "what to do" and source (P1, Bryntum)

**Objective:** make each deadline explain itself, in plain words, with its legal source.

**Contract change:** `calendarEventSchema` gains:
- `action: string`: one plain sentence saying what to do and who does it (S9.2);
- `source: string | null`: the rule's `source` from `cite(rules, ruleId)`.

Both are set in [apps/api/src/calendar.ts](apps/api/src/calendar.ts) per kind. Actions are written once per kind, e.g. `gstr1_due` → **"File GSTR-1 for this period. Your CA usually does this; download the export file from the GSTR-1 page."**

**UI:** configure the `eventTooltip` feature to show the title, `action`, `source` and an **"Open"** link to `href`. Escape all text (no raw HTML from data).

**Tests:** the builder sets `action` for every kind and `source` matches `cite`; mapping passes them through; the fallback list shows `action` under each title.

**C2 implementation and verification (2026-11-05):** actions and nullable rule sources are required in the shared schema, assigned centrally by the API builder, passed through the mapping, and shown with safe text-node tooltips plus a guarded local Open link. The SSR fallback includes actions. All seven kinds have exact-action and `cite` source assertions. API/web consumers and fixtures are updated; legal logic is unchanged. Web: 516/516; API: 504 passed/249 database skips; separate full API integration: 753/753, zero skips (319.88s); DB integration: 176/176, zero skips (46.23s). `corepack.cmd pnpm verify`: 27/27 tasks (53.517s); `corepack.cmd pnpm build`: 9/9 (1m44.016s); `git diff --check`: pass. Direct test:db equivalents use only disposable PostgreSQL 17 `niryat_test`, without private `.env` loading. Logs: `.tmp/c2-*.log`. [Sponsor record and exact manual checks](BRYUNTUM.md#c2-actions-rule-sources-and-event-tooltips) remain **awaiting user verification**. No browser/helper connection, PayPal call, dependency, migration, environment edit, feature tick, deployment, commit or publication.

### C3. CA multi-client calendar (P1, Bryntum prize centrepiece)

**Objective:** one Bryntum calendar showing every linked client's deadlines, one colour per client, with a filter sidebar. This is a CA-specific use competitors won't have.

**API:** `GET /ca/calendar` (`readCaSession`) returns `{ clients: { id, name }[], events: (CalendarEvent & { freelancerId })[] }`, built by calling `buildCalendarEvents` per linked client. Event ids are prefixed `${freelancerId}:` to stay unique. `href` is rewritten to `/ca/clients/${freelancerId}`.

**Web:** `(ca)/ca/calendar/page.tsx` with a `CaCalendarView`, reusing C1's view config:
- **resources = clients** (colours from a fixed token palette cycling by index);
- category becomes a second filter: a simple checkbox group above the calendar filtering events client-side, unless the installed Bryntum supports two resource dimensions; **check the types first**;
- `readOnly`; a click opens the client view.
- Server-rendered fallback list: all overdue events for all clients plus the next 10 upcoming, each labelled with the client name.

**Tests:** route isolation and unique ids; the mapping assigns resources; fallback list ordering.

**C3 implementation and verification (2026-11-05):** `GET /ca/calendar` requires a CA session, uses only accepted links, reuses the per-freelancer builder, prefixes event IDs and rewrites links to read-only CA client pages. The shared response schema projects client IDs/names and events with `freelancerId`. `/ca/calendar` uses `CaCalendarView` with the existing C1/C2 wrapper, client resources/sidebar, a fixed cycling palette of the four existing light/dark tokens, category checkboxes and safe client-labelled tooltips. The SSR fallback shows every overdue plus the next ten upcoming events across clients, with names/actions. No new dependency, CSS token, migration or environment configuration was needed; existing CA navigation already links the page.

Web tests: 524/524 in 41 files. Focused calendar API integration: 6/6, zero skips (72.51s). Full DB integration: 176/176, zero skips (29.26s). Full API integration: 756/756 in 37 files, zero skips (268.07s). `corepack.cmd pnpm verify`: 27/27 tasks (1m27.315s); `corepack.cmd pnpm build`: 9/9 (1m56.593s), fresh Next assets including `/ca/calendar`; `git diff --check`: pass. Ordinary verify's 97 DB/250 API integration skips are covered by the separate full runs. Direct `test:db`-equivalent Vitest commands used only disposable PostgreSQL 17 `niryat_test`, task-specific `TEST_DATABASE_URL` and no private `.env` loader. Logs: `.tmp/c3-*.log`. Tests cover auth/no-read gates, accepted-link isolation/revocation/query-scope resistance, unique IDs, projections/links, resources/palette, category controls, fallback ordering/labels, invalid metadata and CA sign-in redirects. The incomplete initial profile fixture and strict optional-prop forwarding were fixed before passing checks.

[Full sponsor record and exact browser steps](BRYUNTUM.md#c3-ca-multi-client-calendar) remain **awaiting user verification**. Standard-year navigation, colours repeating after four clients and already-delivered snapshots are documented limits. Licence/trial coverage remains unverified. No browser/helper, PayPal service call, feature-checkbox tick, later task, deployment, commit or publication.

**Ordered C2/C3 review fixes (2026-11-05):** issue 1 was fixed and checked before issue 2. The shared builder keeps unresolved overdue RBI/dispute events beyond the historical window, while past resolved events and future events retain the window. Builder regression covers an old unpaid invoice/open dispute, old resolved-dispute exclusion and paid-invoice removal; the CA route regression now includes old overdue records while retaining isolation/revocation. The new builder test failed before the one-line fix; focused builder/routes/dashboard checks then passed 28/28, zero skips (60.11s). Issue 2 then moved the existing sidebar config outside `CalendarView`, typed with installed `SidebarConfig`; a reference-stability test failed before this fix. The full web suite then passed 525/525 (9.15s). Full DB integration passed 176/176, zero skips (45.17s). `corepack.cmd pnpm verify` passed 27/27 tasks (3m55.434s); `corepack.cmd pnpm build` passed 9/9 (5m19.675s). Full API integration had 756 passes and one existing reminder test timeout at 5s (813.60s); the entire affected invoice-route suite then passed alone, 67/67, zero skips (40.17s), without assertion/timeout edits. All 757 API cases have passing results across those runs; no clean all-in-one rerun is claimed. Details/logs are in the [Bryntum fix record](BRYUNTUM.md#c2c3-review-fixes-issue-1-then-issue-2). The inherited portfolio deadline effect is recorded in [AG Studio](AG_STUDIO.md#c3-review-fix-1-old-overdue-portfolio-deadlines). Exact browser steps there remain **awaiting user verification**. No other task, new dependency, migration, environment edit, PayPal call, browser/helper, feature tick, deployment, commit or publication.

### D1. Plain-language glossary and term helper (P0)

**Objective:** one source for plain explanations, so pages don't each invent their own.

**Files:**
- new `apps/web/src/lib/glossary.ts`: a `const` record keyed by term id (`lut`, `fira`, `gstr1`, `purpose_code`, `realisation`, `sac`, `credit_note`, `advance_tax`, `presumptive`, `gstin`, `export_conditions`). Each entry has `term` (short form), `plain` (one sentence) and `who` ("you", "your CA" or "your bank");
- new `components/Term.tsx`: renders the term with an accessible inline explanation, using `<details>`/`<summary>`, or `<abbr title>` plus visible text on first use (`aria-describedby`). It must work without JavaScript.

**Content rule:** `plain` text must agree with [glossary.md](docs/glossary.md) and the YAML descriptions. Simpler words, same meaning (S9.3).

Proposed entries (the implementer may polish but not change meaning):
- LUT: "A yearly form (RFD-11) that lets you bill foreign clients without charging GST."
- FIRA: "A document from PayPal or your bank that proves foreign money reached you."
- Purpose code: "A code that tells the RBI what a foreign payment was for, such as software work. Your bank confirms it."
- RBI payment deadline (realisation): "The date by which money for an export invoice must reach India."
- GSTR-1: "Your GST sales return. Exports go in Table 6A."

**Tests:** every entry is non-empty with a `who`; `Term` renders without JavaScript.

**D1 implementation (2026-11-05):** added the eleven-entry `apps/web/src/lib/glossary.ts` with typed responsibility and `components/Term.tsx`. The helper renders visible plain wording before an abbreviation, with a unique `aria-describedby` target and title; it requires no JavaScript, client boundary, styling or dependency. Glossary wording follows this document, `docs/glossary.md` and the unchanged rule metadata. Establishments of one person remain the fifth export check; common ownership alone is not substituted for that condition. Tests cover every planned term, nonempty content/responsibility, static rendering and repeated-term description targets. Product-page integration belongs to D2 after its review gate.

Manual D1 checks, **awaiting user verification** after D2 page integration: run `corepack.cmd pnpm dev`, sign in to an existing freelancer at `http://localhost:3000/login`, then open `/profile` and `/health-check`. Check that first-use explanations appear before their legal terms, remain visible with JavaScript disabled and at mobile width, and that a screen reader associates each abbreviation with its own explanation. No browser/helper connection was run. D1 alone adds the helper without changing those pages.

**D1 verification (2026-11-05):** web tests passed 539/539 in 43 files (14 new tests); final `corepack.cmd pnpm verify` passed 27/27 tasks (24 cached, 10.84s); final `corepack.cmd pnpm build` passed 9/9 tasks (eight cached, fresh Next build, 55.292s). Ordinary verify includes 97 DB and 250 API integration skips; no fresh database integration was needed or claimed for this isolated web helper. Logs: `.tmp/d1-verify-final.log`, `.tmp/d1-build-final.log`. Browser checks remain pending; no sponsor integration, legal calculation, page behavior, environment file, PayPal call, feature checkbox, dependency, deployment, commit or publication changed.

### D2. Rewrite user-facing wording (P0)

**Objective:** apply S9 across the product.

**Scope:** user-visible strings only. Logic, thresholds, citations and the S9.4 immutable list are unchanged.

**Order** (one commit-sized step each; run tests after each):
1. **Rules messages:** [health.ts](packages/rules/src/health.ts), [export-conditions.ts](packages/rules/src/export-conditions.ts), [purpose-codes.ts](packages/rules/src/purpose-codes.ts), [realisation.ts](packages/rules/src/realisation.ts), [credit-note.ts](packages/rules/src/credit-note.ts), [rbi-deadline.ts](packages/rules/src/rbi-deadline.ts), [gstr1.ts](packages/rules/src/gstr1.ts), [advance-tax.ts](packages/rules/src/advance-tax.ts), and the `reasons` strings in [export-invoice.ts](packages/rules/src/export-invoice.ts) (**not** the PDF row labels or the endorsement). Each health flag message follows S9.2. Example:

   **"Your LUT expired on {date}. You can't bill foreign clients without GST until you file a new one. Ask your CA to file form RFD-11 on the GST portal, then update the dates in your profile."**
2. **Status and labels:** [lib/status.ts](apps/web/src/lib/status.ts), [lib/forms.ts](apps/web/src/lib/forms.ts) message maps, [NavLinks.tsx](apps/web/src/components/NavLinks.tsx). Nav labels may stay short, but each page header gets a one-line plain description through `PageHeader`.
3. **Pages and components:** the 24 web files that grep finds for `LUT|FIRA|GSTR|realis|purpose code|RFD-11|Table 6A|WOPAY`, plus the public home page. Use `<Term>` on the first use per page.
4. **API messages shown to users:** grep `apps/api/src` for strings returned in `message` fields (e.g. [compliance.ts](apps/api/src/compliance.ts), [reminders.ts](apps/api/src/reminders.ts)).

**Tests:** update exact-string assertions in the matching `*.test.ts(x)` files **in the same step**. Do not weaken an assertion to a partial match just to make it pass. Add one test per rules file asserting each high-severity flag's message contains an action verb from S9.2.

**Review gate:** after step 1, list every changed rules message (old → new) in this file under "D2 review log" **for the user to approve before steps 2–4**. Legal meaning changes need a human read.

**Acceptance:** `pnpm verify` and `pnpm build` pass; the user approves the D2 review log.



#### D2 verification and manual checks

Implemented 2026-11-05, only after the user approved all 36 rules-message changes below. Step 1 changes the nine named rules files' text and matching exact assertions, with one actionable-warning/blocker test per file. Files without severity fields test their failed, excluded, late or uncertain outcomes. Step 2 changes status/form/navigation labels and keeps FIRA upload's duplicate client-side validation messages consistent; web tests passed 540/540. Step 3 adds page descriptions, first-use glossary explanations, native term disclosures, plainer public home/disclaimer wording, service-code help, report labels and dashboard labels/prompt; web tests passed 541/541. Step 4 changes only API close/task/focus text, FIRA match notes and calendar titles/actions. `compliance.ts` already delegates messages to rules, and `reminders.ts` has no user message to rewrite; both retain their logic and payload contracts.

Step 1 checks: rules 367/367; `corepack.cmd pnpm verify` 27/27 tasks (22 cached, 1m39.227s); full DB integration 176/176 in eight files, zero skips (32.43s); full API integration 757/757 in 37 files, zero skips (546.98s). Step 4 ordinary API suite: 507 passed, 250 database skips (113.94s); final calendar wording check 16/16 (2.61s). A parser-based self-check confirms all nine rules and the three changed API modules differ only in string literals. Invoice PDF rows/endorsement, sourced purpose-code table, YAML, CSV serializer and reminder payload builder remain unchanged. No assertion was weakened to accommodate revised wording. Final results are recorded below.

**Final automated checks (2026-11-05):** `corepack.cmd pnpm verify` passed 27/27 tasks (10.716s); `corepack.cmd pnpm build` passed 9/9 (54.057s, fresh Next assets). Rules passed 367/367; final web suite passed 540/540 in 44 files. A redundant new status-map test was removed; all requested glossary/no-JavaScript and actionable-warning coverage remains. Full DB integration passed 176/176, zero skips (32.43s); the final clean API integration passed 757/757 in 37 files, zero skips (471.32s). Ordinary verify's 97 DB/250 API skips are covered by those separate runs. Direct Vitest commands used only disposable PostgreSQL 17 niryat_test and avoided the private environment-file loaders in test:db scripts. The task-owned --rm container niryat-d1-d2-tests was stopped/removed successfully. The final source invariant and git diff --check passed. Logs: .tmp/d1-{verify,build}-final.log, .tmp/d2-step1-{rules,db,api-integration}.log, .tmp/d2-step2-web.log, .tmp/d2-step3-web.log, .tmp/d2-step4-{api,calendar}.log and .tmp/d2-final-{verify,build,api-integration}.log.

The first final API attempt was stopped after finding two stale FIRA assertions; both were updated, including strengthening one prefix assertion to an exact full message, before the clean full rerun. One unchanged PDF extraction test hit its existing 5s timeout during an earlier verify; the quiet rerun passed without timeout/configuration changes. The final shared GST-report errors name the freelancer's profile so a CA is not told to edit their own profile. No legal calculation, rule metadata/citation, PDF legal text, CSV/PayPal payload or access/approval behavior changed.

**Manual checks — awaiting user verification:**
1. Prerequisites: use the already-configured local API/database with a freelancer profile and saved invoices, payments/tasks and a synthetic FIRA document. Use a CA account with an accepted share to that freelancer for CA pages. Public pages need no account. No real-FIRA compatibility, hosted behavior or sponsor licence coverage is claimed.
2. From the repository root, run `corepack.cmd pnpm dev` (Linux: `corepack pnpm dev`). Open `http://localhost:3000/`, `/login`, `/signup`, `/ca/login`, `/ca/signup` and `/disclaimer`. Expect plain explanations, the correct sign-in audience, approval/sandbox statements and all disclaimer limits. At narrow width, check that the longer explanations wrap without hiding controls.
3. Sign in as the freelancer at `/login`; open `/profile`, `/health-check`, `/clients`, `/invoices`, `/fira`, `/close`, `/tasks`, `/gstr1`, `/advance-tax`, `/calendar` and `/dashboard`. Expect each page to describe its purpose, the navigation to say “Payment proof” and “GST sales return”, and first-use explanations before legal short forms. On pages with term disclosures, Tab to the summary and press Enter/Space to expand it. Confirm the visible explanation and abbreviation are associated in a screen reader. Profile/service-code help and report explanations should remain readable with JavaScript disabled after reloading.
4. Compare the saved records: amounts, dates, rule IDs/citations, invoice PDFs and download content must be unchanged. Expect “Act now”/“Needs attention”/“Plan ahead” health labels, “Prepared” for issued invoices and “Payment proof not yet matched” for pending proof. Existing saved task messages may keep their older text; newly generated task text uses the new wording. No data backfill was performed.
5. Open `/calendar` and `/dashboard`; check the new calendar titles/actions and dashboard payment/fee/exchange-rate labels, and compare fallback dates/links with saved records. Switch to the CA account at `/ca/login`; open `/ca`, `/ca/calendar` and the accepted client's `/ca/clients/<freelancer-id>` link. Check the explanations, “Missing payment proof” label/prompt and the same read-only client scope. Live prompt execution, browser visuals and hosted repeats remain the user's checks.

Known limits: rule meanings and existing special-State/RBI-period uncertainty are retained, not re-reviewed against new law. Old persisted tasks are not migrated. Browser/assistive-technology layout, live sponsor prompts, real-FIRA parsing, hosting and licence/trial dates remain unverified. No later task, dependency, environment-file access/edit, PayPal call, feature-checkbox tick, browser/helper connection, deployment, commit or publication was performed.

#### D2 review fixes: issue 1 then issue 2

Recorded 2026-11-05, strictly in the user's requested order. Issue 1 changed only `invoiceFira.pending.label` in `apps/web/src/lib/status.ts` to “Payment proof not yet matched”. The underlying state includes unpaid invoices and uploaded proof awaiting confirmation, so “Waiting for payment proof” was too narrow. The updated existing exact assertion failed before the fix; all 38 status tests then passed (804ms) before issue 2 was edited.

Issue 2 then changed only `invoiceStatus.issued.label` to “Prepared”. Rejecting a send proposal leaves its invoice issued, so the previous “Ready to send” label conflicted with the rejected action. Its updated exact assertion failed before the fix; all 38 status tests then passed (796ms). Both neutral tones and all state/approval behavior are retained. The shared labels reach freelancer invoices, Today, GSTR-1 and CA client records; Studio sources keep their raw status values. No sponsor integration, dependency, configuration, API, database, rules or payload changed. Existing D1/D2 work is preserved.

Final checks passed: web 540/540 in 44 files (7.65s); `corepack.cmd pnpm verify` 27/27 tasks (24 cached, 12.022s); `corepack.cmd pnpm build` 9/9 tasks (eight cached, fresh Next assets, 55.235s); `git diff --check` passed. Normal verify retains 97 DB/250 API integration skips; no fresh DB/API integration run is claimed or needed for these two display strings. No assertion was weakened, and no new test or production logic was added. Logs: `.tmp/d2-review-fix1-{before,after}.log`, `.tmp/d2-review-fix2-{before,after}.log` and `.tmp/d2-review-{web,verify,build}.log`.

**Manual checks — awaiting user verification:** with the existing local database/profile and an accepted CA share, run `corepack.cmd pnpm dev` from the repository root (Linux: `corepack pnpm dev`). Sign in at `http://localhost:3000/login` and open `/invoices`. For an unpaid invoice, and for an invoice whose uploaded FIRA match still needs confirmation, expect “Payment proof not yet matched”; the latter's `/fira` page must still offer confirmation. For an issued invoice whose send proposal is already rejected, expect “Prepared” alongside the existing rejected outcome and no send button. Open `/overview` and `/gstr1` to check the same issued-invoice label where that record appears. Sign in as its CA at `/ca/login`, follow `/ca` to `/ca/clients/<freelancer-id>` and expect the same labels with read-only controls. No PayPal operation is needed for these checks; use existing records. No browser/helper connection was run. No commit, deployment, publication or feature-checkbox tick.

#### D2 review log

Prepared 2026-11-05. **User approved all 36 wording changes on 2026-11-05; steps 2–4 may proceed.** These are wording-only changes. Numbers, dates, conditions, may/must, citations, YAML, PDF text and CSV/PayPal values retain their existing meaning and implementation. `${...}` denotes the unchanged runtime value. Unchanged messages are omitted. The shared realisation suffix is expanded below into both affected messages. Existing exact-string tests were updated without weakening their assertions; nine new tests cover actionable warnings/blockers, including the files whose results have no severity field.

##### packages/rules/src/health.ts

| Old                                                                                                                          | New                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No LUT on file. Without a valid LUT, export invoices must charge IGST, which you then claim back as a refund.                | No yearly export form (LUT) is saved. Without a valid LUT, export invoices must charge IGST, which you then claim back as a refund. Ask your CA to file form RFD-11, then update your profile. |
| Your LUT is valid only from ${lutValidFrom}. Exports before then are not covered.                                            | Your yearly export form (LUT) is valid only from ${lutValidFrom}. Exports before then are not covered. Ask your CA how to handle any earlier invoices.                                         |
| Your LUT expired on ${lutValidTo}. File a new LUT (FORM GST RFD-11) before your next export invoice.                         | Your yearly export form (LUT) expired on ${lutValidTo}. Ask your CA to file a new form RFD-11 before your next export invoice, then update your profile.                                       |
| Your LUT expires on ${lutValidTo}. File a new LUT for the next financial year.                                               | Your yearly export form (LUT) expires on ${lutValidTo}. Ask your CA to file a new form RFD-11 for the next financial year, then update your profile.                                           |
| Add your expected turnover for this financial year so we can check the ₹20 lakh GST registration threshold.                  | Add your expected turnover for this financial year to your profile so we can check the ₹20 lakh GST registration threshold.                                                                    |
| Expected turnover of ₹${inr} is above ₹20 lakh, so GST registration is required (₹10 lakh in some special-category States).  | Expected turnover of ₹${inr} is above ₹20 lakh, so GST registration is required (₹10 lakh in some special-category States). Ask your CA to help you register.                                  |
| Expected turnover of ₹${inr} is close to the ₹20 lakh GST registration threshold (₹10 lakh in some special-category States). | Expected turnover of ₹${inr} is close to the ₹20 lakh GST registration threshold (₹10 lakh in some special-category States). Ask your CA when you need to register.                            |
| GSTIN missing. Export invoices must show your GSTIN.                                                                         | Your GST identification number (GSTIN) is missing. Add it to your profile; export invoices must show it.                                                                                       |

##### packages/rules/src/export-conditions.ts

| Old                                                                                                       | New                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| You do not supply this service from India, so it is not an export from India.                             | You do not supply this service from India, so it is not an export from India. Ask your CA how to invoice it.                             |
| The client is in India. PayPal also blocks invoices to India-based recipients.                            | The client is in India. PayPal also blocks invoices to India-based recipients. Check the client country you entered.                     |
| The client is in India, so the place of supply is India.                                                  | The client is in India, so the place of supply is India. Ask your CA how to invoice this service.                                        |
| Work that needs the client physically present in India is supplied where it is performed, which is India. | Work that needs the client physically present in India is supplied where it is performed, which is India. Ask your CA how to invoice it. |
| Paid in convertible foreign exchange.                                                                     | Payment is in foreign currency that can be exchanged (convertible foreign exchange).                                                     |
| Answer: will the client pay in foreign currency?                                                          | Answer: will your client pay in foreign currency?                                                                                        |
| Payments between establishments of the same person are not an export.                                     | Payments between establishments of the same person are not an export. Ask your CA how to record this payment.                            |

##### packages/rules/src/purpose-codes.ts

| Old                                                                                                      | New                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No purpose code saved. Add the purpose code set in your PayPal account.                                  | No code for foreign payments (purpose code) is saved. Add the code set in your PayPal account to your profile.                                                                                    |
| ${code} (${entry.paypalLabel}) is not a services code. Its RBI description is: ${entry.annexDescription} | ${code} (${entry.paypalLabel}) is not a services code. Its RBI description is: ${entry.annexDescription}. Ask your bank which services code to use, then update it in PayPal and your profile.    |
| ${code} is not one of the purpose codes PayPal India offers.                                             | ${code} is not one of the purpose codes PayPal India offers. Ask your bank which offered code to use, then update it in PayPal and your profile.                                                  |
| Your work looks like ${s.code} (${s.label}), but your purpose code is ${code} (${entry.paypalLabel}).    | Your work looks like ${s.code} (${s.label}), but your purpose code is ${code} (${entry.paypalLabel}). Ask your bank to confirm the code for your work, then update it in PayPal and your profile. |
| Describe your work so we can check your purpose code.                                                    | Add a description of your work to your profile so we can check your code for foreign payments (purpose code).                                                                                     |

##### packages/rules/src/realisation.ts

| Old                                                                                                                                                                                                                                                                           | New                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ${invoice.currency} ${fromMinor(refunded)} of invoice ${invoice.number} was refunded to the client. This reduces the export value only when your bank (AD bank) accepts it; for invoices up to Rs 10 lakh your declaration may be enough. Until then, treat it as unrealised. | ${invoice.currency} ${fromMinor(refunded)} of invoice ${invoice.number} was refunded to the client. Ask your bank (AD bank) to accept the reduced export value; only its acceptance reduces the export value. For invoices up to Rs 10 lakh your declaration may be enough. Until then, treat the export money as not fully received (unrealised). |
| The client won a dispute on invoice ${invoice.number}. This reduces the export value only when your bank (AD bank) accepts it; for invoices up to Rs 10 lakh your declaration may be enough. Until then, treat it as unrealised.                                              | The client won a dispute on invoice ${invoice.number}. Ask your bank (AD bank) to accept the reduced export value; only its acceptance reduces the export value. For invoices up to Rs 10 lakh your declaration may be enough. Until then, treat the export money as not fully received (unrealised).                                              |
| Client disputed ${money} on invoice ${input.invoiceNumber}. This export may no longer count as realised.${input.responseDueDate === null ? "" : ` Respond in PayPal by ${input.responseDueDate}.`}                                                                            | Client disputed ${money} on invoice ${input.invoiceNumber}. This export may no longer count as fully received (realised). Check the dispute in PayPal.${input.responseDueDate === null ? "" : ` Respond in PayPal by ${input.responseDueDate}.`}                                                                                                   |
| Refund of ${value} recorded on invoice ${invoice.number}. Consider issuing a GST credit note (declare it by ${declareBy}), and ask your bank (AD bank) to accept the reduced export value.                                                                                    | Refund of ${value} recorded on invoice ${invoice.number}. Consider issuing a document to adjust your GST invoice (credit note); declare it by ${declareBy}, and ask your bank (AD bank) to accept the reduced export value.                                                                                                                        |

##### packages/rules/src/credit-note.ts

| Old                                                                                                                                                                                                                                                      | New                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The last date to declare a credit note against invoice ${invoice.number} was ${declareBy}. Ask your CA how to treat this refund.                                                                                                                         | The last date to report an adjustment (credit note) for invoice ${invoice.number} was ${declareBy}. Ask your CA how to treat this refund.                                                                                                                                                                                                    |
| You may issue a GST credit note for ${value} against invoice ${invoice.number}. Declare it in GSTR-1 by ${declareBy}, or by your annual return date if that is earlier. Under LUT there is no IGST to adjust; the credit note corrects the export value. | You may issue a document to adjust your GST invoice (credit note) for ${value} against invoice ${invoice.number}. Report it in your GST sales return (GSTR-1) by ${declareBy}, or by your annual return date if that is earlier. Under your yearly export form (LUT), there is no IGST to adjust; the credit note corrects the export value. |

##### packages/rules/src/rbi-deadline.ts

| Old                                                                                                                                            | New                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The RBI deadline to receive payment for invoice ${invoice.number} was ${deadline}. Ask your bank (AD bank) whether it can extend the deadline. | The deadline for export money to reach India (RBI payment deadline) for invoice ${invoice.number} was ${deadline}. Ask your bank (AD bank) whether it can extend the deadline. |
| Receive the full payment for invoice ${invoice.number} by ${deadline}.                                                                         | You need to receive the full export payment in India for invoice ${invoice.number} by ${deadline}.                                                                             |

##### packages/rules/src/gstr1.ts

| Old                                                                                                             | New                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invoice ${number} is not covered by your LUT on ${date}, so it needs IGST. It is not in this file; ask your CA. | Invoice ${number} is not covered by your yearly export form (LUT) on ${date}, so it needs IGST. It is not in this file. Ask your CA how to report this invoice. |

##### packages/rules/src/advance-tax.ts

| Old                                                                                                                                                                                                                                                                 | New                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Answer the specified-profession question on your profile to check presumptive taxation.                                                                                                                                                                             | Answer the profession question on your profile to check the simpler income calculation scheme (presumptive taxation).                                                                                                                                                                                                                                                    |
| Presumptive taxation does not apply because you said your work is not a specified profession.                                                                                                                                                                       | The simpler income calculation scheme (presumptive taxation) does not apply because you said your work is not a specified profession. Ask your CA how to calculate your income.                                                                                                                                                                                          |
| Presumptive taxation may apply: your PayPal receipts for tax year ${input.taxYear} are within ${p.limit_inr} and you said your work is a specified profession. Deemed income is ${p.deemed_percent}% of gross receipts. This assumes you are a resident individual. | The simpler income calculation scheme (presumptive taxation) may apply: your PayPal receipts for tax year ${input.taxYear} are within ${p.limit_inr} and you said your work is a specified profession. Income under this scheme (deemed income) is ${p.deemed_percent}% of gross receipts. This assumes you are a resident individual. Confirm eligibility with your CA. |
| Your PayPal receipts are between ${p.limit_inr} and ${p.limit_low_cash_inr}. Presumptive taxation applies only if cash receipts are at most ${p.cash_percent_max}% of all receipts, and Niryat sees only PayPal.                                                    | Your PayPal receipts are between ${p.limit_inr} and ${p.limit_low_cash_inr}. The simpler income calculation scheme (presumptive taxation) applies only if cash receipts are at most ${p.cash_percent_max}% of all receipts, and Niryat sees only PayPal. Ask your CA to check receipts from all sources.                                                                 |
| Your PayPal receipts for tax year ${input.taxYear} are above ${p.limit_low_cash_inr}, so presumptive taxation does not apply.                                                                                                                                       | Your PayPal receipts for tax year ${input.taxYear} are above ${p.limit_low_cash_inr}, so the simpler income calculation scheme (presumptive taxation) does not apply. Ask your CA how to calculate your income.                                                                                                                                                          |

##### packages/rules/src/export-invoice.ts

| Old                                                                                                    | New                                                                                                                      |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| The LUT reference has characters the invoice PDF cannot print. Edit the LUT reference in your profile. | Your yearly export form (LUT) reference has characters the invoice PDF cannot print. Edit the reference in your profile. |
| GSTIN missing. Export invoices must show your GSTIN.                                                   | Your GST identification number (GSTIN) is missing. Add it to your profile; export invoices must show it.                 |

### E1. PayPal sync freshness and a frequent light sync (P1, Render, Phase 7)

**Objective:** implement the Phase 7 checklist items "freshness target", "show last successful sync" and "separate polling from Claude".

**Contract:**
- New table `sync_runs`: `id`, `started_at`, `finished_at`, `status` (`running` | `ok` | `failed`), `summary` jsonb with counts. One `running` row at a time (a partial unique index, like `agent_runs_one_running`) to prevent overlapping polls.
- [sync.ts](apps/api/src/sync.ts) records a row per run. A failed run never updates the "last successful" value. A second light sync started while one runs exits as `skipped` without error. The nightly CLI retries a busy poll lock before reconciliation/reminders; retry exhaustion is an explicit failed job (review correction, 2026-11-05).
- Add a CLI flag `--no-agent`: reconcile payments and disputes only, never start Claude.
- **Freshness target: 30 minutes.** render.yaml adds cron `niryat-sync-light` every 30 minutes running `sync:payments --no-agent`. The nightly `niryat-sync` keeps the reminder agent.
- `GET /sync-status` (freelancer, `readSession`) → `{ lastSuccessAt | null, lastStatus, stale: boolean }`, where `stale` = no success in the last 2 hours.
- The Today page and the invoices page show **"PayPal data last updated {relative time}."**, or when stale **"PayPal data may be out of date (last update {time}). New payments or disputes may not show yet."**

**Tests:**
- A failed run doesn't advance `lastSuccessAt`; overlap is skipped; `--no-agent` never calls the runner (fake runner asserting zero calls); stale boundary.
- Copy the existing fake-ledger pattern in [sync.test.ts](apps/api/src/sync.test.ts).

### E2. Durable manual close through Render Workflows (P1, Render, Phase 7)

**Objective:** a "Close this month" click should survive an API restart. Today it runs inside the API process ([architecture](docs/architecture.md#agents-close-and-extraction)).

**Requirements:**
- `POST /close`, when the Render Workflows dispatch is configured (the same env the trigger uses; read [trigger.ts](apps/worker/src/trigger.ts) and [worker index](apps/worker/src/index.ts)), dispatches `monthlyClose` with `{ userId, month, asOf, trigger: "manual" }` instead of `runInBackground`. It still returns 202. Without that configuration (local), it keeps the current in-process path.
- Extend `monthlyCloseInputSchema` to accept an optional single `userId` and `trigger`. The task runs only that user when `userId` is given.
- The existing `agent_runs` one-running rule still gives 409 on concurrent starts. A run row stuck as `running` past 15 minutes is already failed as stale on the next start (verify in [agent-runs.ts](packages/db/src/agent-runs.ts)).
- **Never** replay or reset a claimed reminder (ADR 0004).
- **Env:** if no dispatch key exists yet, adding one to `.env.example` with a placeholder value is authorized (section 5, decision 1).

**Tests:** route with a fake dispatcher (dispatch called once with the right input, 202, no in-process run); worker input validation; single-user mode runs one user.

**Browser and hosted check (user, after deploy):** restart the API during a manual close → the run finishes or shows a recoverable failure; no duplicate proposals.

### A5. Judge mode: seed and "Try as judge" (P0)

**Objective:** PLAN §15. Judges reach a populated freelancer account and a populated CA account in one click each.

**Env:** `JUDGE_MODE` (`"true"` enables it) and `JUDGE_BUYER_EMAIL` (the sandbox buyer email for the live-send client). Adding both to `.env.example` with placeholder values is authorized (section 5, decision 1).

**Seed** ([seed-judge.ts](packages/db/src/seed-judge.ts), currently a no-op; it may live in `apps/api/src` if it needs rules, like [seed-fira-demo.ts](apps/api/src/seed-fira-demo.ts)):
- **Idempotent.** Re-running doesn't duplicate data. Use fixed judge emails `judge-freelancer@niryat.test` and `judge-ca@niryat.test`, plus two extra freelancers `judge-freelancer-2@…` and `-3@…`, all with a `null` password hash and no payer id, so they can only enter through `/auth/judge`.
- **Main freelancer ("Ananya Rao"):**
  - GST registered, GSTIN, monthly GSTR-1;
  - LUT valid from the financial-year start to **seed date + 15 days** (the A3 conflict fix);
  - work type "Software development", purpose code P1006 (to show the mismatch flag, PLAN §16);
  - one US client whose email is `JUDGE_BUYER_EMAIL`, for live sends;
  - historical invoices, payments with fee/net, one refund, one dispute and FIRA lines via `insertDemoLedger` / `seedFiraDemo`.
- **Safety requirement:** seeded invoices that look unpaid must have `paypalInvoiceId = null` or a status that excludes them from reminder candidates ([reminders.ts](apps/api/src/reminders.ts) skips null ids), so judges are **never offered an approval that will fail at PayPal**. Verify after seeding by running a close against the seed and asserting zero proposals for seeded invoices.
- **Extra freelancers:** smaller ledgers with different health (one healthy; one with an overdue RBI deadline).
- **Judge CA:** `accepted` links to all three freelancers, created through the invitation claim/accept helpers so every active link has proof; never log plaintext seed codes.

**API:** `POST /auth/judge` `{ as: "freelancer" | "ca" }` → 404 unless `JUDGE_MODE === "true"`. Otherwise it starts a session for the fixed judge account with its role. It is rate-limited (S8 `auth`).

**Web:** on the public home and both login pages, when judge mode is on (expose a boolean from the API, e.g. `GET /judge-mode`), show **"Try as freelancer (demo)"** and **"Try as CA (demo)"** buttons, with the text **"Demo accounts use PayPal sandbox only. No real money moves."**

**README:** list the sandbox buyer login (the user supplies it; never commit secrets). Note that judges share demo accounts.

**Tests:** seed idempotency (run twice, same counts); `/auth/judge` is 404 when off and sets the right role when on; seeded data creates no reminder proposals.

**Acceptance:** `pnpm seed:judge` works on the test database; `pnpm verify` passes.

#### A5 implementation and verification (2026-11-05)

Implemented A5 only: atomic/repeatable/concurrent-safe seed of three freelancers plus one CA, proven accepted invitations, encrypted profiles/client addresses, Ananya's first-seed-date + 15-day LUT and purpose mismatch, healthy/overdue examples, synthetic paid/fee/net/refund/dispute/FIRA history. Existing `insertDemoLedger`, profile/client and invitation helpers are reused; rules supply export checks and financial-year/invoice numbering. Reserved emails with a password, payer ID or wrong role fail without replacement or partial writes. Repeated runs preserve judge edits, ended sharing, buyer email and original dates rather than resetting shared records.

Root `seed:judge` now runs the API composition root and requires inherited `JUDGE_MODE=true`, `JUDGE_BUYER_EMAIL`, `DATABASE_URL` and `ENCRYPTION_KEY`; it never loads a private environment file. Only the two authorized empty template keys were added. `/auth/judge` is gated, strict JSON, auth-rate-limited and starts existing signed freelancer/CA sessions for fixed credential-free accounts only. `/judge-mode` is a no-store public boolean. One reusable client entry appears after hydration on home and both login pages only when the validated flag is true; unavailable/off flags hide it, failed login permits retry. Existing role access and user-only PayPal approvals are unchanged.

Synthetic unpaid invoices have null PayPal invoice IDs, and synthetic judge payments are blocked by their reserved transaction prefix in refund proposals and execution. A real close over all three seeded freelancers produces zero reminder proposals. The synthetic US client has the privately configured sandbox buyer email and an encrypted synthetic address so a newly prepared invoice can pass existing export checks. The user chose to keep the buyer email private; README identifies the private configuration key and never lists credentials. No actual PayPal call, new dependency/migration, F1 work, feature-checkbox change, browser/helper connection, deployment, commit or publication.

Initial checks found test assumptions about the existing missing-profile result and role-denial URL/status, plus CRLF on the two appended template keys. Corrected these without changing security contracts or scaffold checks. Focused A5 integration passes 10/10, including concurrent/idempotent seed, collisions/rollback, health, live-send eligibility, signed roles, rate limit and close safety. DB integration passes 180/180, zero skips (33.17s). Initial full web suite passes 559/559; normal API passes 531 with 261 DB integration skips. Final full integration/verify/build and seed-command results will be recorded below.

Manual checks — awaiting user verification:
1. Prerequisites: dedicated disposable demo database with all migrations, an encryption key, session secret, `JUDGE_MODE=true` and a US sandbox buyer email in `JUDGE_BUYER_EMAIL`. Supply values privately; never use production PayPal credentials. Configure sandbox seller/storage normally only if testing newly issued invoice approval. No existing application database is seeded by the coding agent.
2. From the repository root, with those variables inherited, run `corepack.cmd pnpm db:migrate` then `corepack.cmd pnpm seed:judge`. POSIX uses `corepack pnpm` with the same arguments. Run seed twice: expect the fixed success message and unchanged record counts, with no credentials/invitation codes printed. Colliding credentialed or wrong-role reserved accounts must fail without changing records. The seed does not load `.env`; use your private shell/session configuration.
3. Start API/web in separate terminals: `corepack.cmd pnpm --filter @niryat/api dev` and `corepack.cmd pnpm --filter @niryat/web dev`. Open http://localhost:3000/, http://localhost:3000/login and http://localhost:3000/ca/login. After hydration expect both demo buttons, sandbox disclosure and shared synthetic-record warning. With API judge mode unset/false and restarted, expect no demo buttons; direct JSON `POST http://localhost:3001/auth/judge` with `{"as":"freelancer"}` returns 404.
4. In a fresh private window click Try as freelancer (demo): expect `/overview` as Ananya. At `/health-check` expect an expiring LUT/purpose-code mismatch; at `/profile`, `/invoices` and `/fira` expect populated synthetic records. At `/close`, click Run monthly close with PayPal/Claude unconfigured: expect completion with deterministic records and no reminders for seeded invoices. Separately issued real sandbox invoices may create later proposals; each still requires explicit approval.
5. In another private window click Try as CA (demo): expect `/ca`, three clients, distinct health/overdue status, populated dashboard and `/ca/calendar`. Open each client; records must be viewable and PayPal actions absent. Direct CA `POST /api/close` remains denied. Sign out/re-enter both roles and verify the intended destination without cached logged-out redirects.
6. Optional user-approved sandbox send: configure seller and file storage, use Ananya's US client at `/invoices`, prepare a new USD invoice, then explicitly approve its send. Expect the new invoice in the privately supplied sandbox buyer's PayPal account. Synthetic history is never a real PayPal invoice. Synthetic judge payments show no refund control; direct refund proposals for them are rejected before any approval is created. No live send/receipt is claimed verified.
7. Sharing and records are mutable and shared by all judges; do not enter personal data. Reruns do not restore ended sharing or refresh the original countdown: Ananya's LUT expires 15 days after the initial seed. For a later demonstration, refresh only the synthetic LUT dates through the existing Profile form using [H3](#h3-keep-alive-to-dec-15-and-refresh-demo-dates-p0-phase-8-user); preserve the database and invoice-number history. Sponsor licence coverage, browser/keyboard/mobile behavior and hosted acceptance remain unverified.

#### A5 final results (2026-11-06)

Final code passes full API integration **792/792 in 40 files, zero skips** (477.88s), including all ten A5 cases after reusing the existing FIRA persistence helper. Full DB integration **180/180**, zero skips (33.17s). Web **559/559** in 46 files. Final `corepack pnpm verify` passes **27/27 tasks** (20 cached, 2m2.659s); final production `corepack pnpm build` passes **9/9** (six cached, 7.484s), following a fresh Next production build that also passed. No assertion or timeout was weakened. A first full API run slowed while overlapping build/verification and was stopped; only the clean later full run is counted as passing.

The actual root `corepack pnpm seed:judge` command passed twice with identical asserted table counts: users 4, profiles 3, clients 3, invoices 7, payments/refunds 6, disputes 1, accepted CA links 3, FIRA documents 1, lines/matches 3 each, actions 0. The test harness guards the exact localhost:55439/niryat_test URL. `tsx` needed elevated execution because Windows sandbox-account lookup failed; an initially hex-encoded test key was correctly rejected before connecting, then the existing canonical base64 key format passed. No runtime change was needed. The private buyer email remains undisclosed per the user's decision.

DB/API test:db-equivalent direct Vitest commands and CLI checks used only task-created PostgreSQL 17 `niryat_test`, generated test keys and a synthetic buyer address; no private environment-file loader, application database, PayPal or Render service was used. The task's `--rm` container `niryat-a5-tests` was stopped and its removal confirmed. Logs: `.tmp/a5-{web,api,db-integration,api-integration-final,verify-final2,build-final,seed-cli}.log`. Final documentation/scaffold verification passes 27/27 tasks (all cached, 519ms), and git diff --check passes. Browser/hosted/manual-send acceptance and sponsor licence coverage remain awaiting user verification using the exact steps above. Shared records and the original 15-day LUT countdown remain explicit limits. No F1 work, feature ticks, dependency/migration, deployment, commit or publication.

#### A5 review issue 1: synthetic refund safety (2026-11-06)

Scope strictly review issue 1. Added one shared `isSyntheticJudgePayment` check for the existing JUDGE-SYNTHETIC- prefix; `packages/db/src/actions.ts` returns typed synthetic_payment after validating ownership/data and before building a refund proposal. `apps/api/src/actions.ts` also blocks a previously queued synthetic refund before any PayPal dispatch, while retaining normal payload checks and rejection. The invoices page hides new refund controls for those payments; `lib/forms.ts` explains both permanent rejection paths without offering a retry. No migration, SDK/dependency, fixture-ID, environment, role/session or rule changes; normal PayPal payments remain refundable even with a null capture_id column.

Five regression assertions failed before runtime edits: real-seed refund proposals succeeded, an older queued refund reached the fake dispatcher, synthetic refund controls appeared, and both error paths offered inappropriate retry guidance. They now pass. Focused API synthetic cases: 3 passed (76 name-filtered skips); full web: 561/561 in 46 files (7.29s). The updated existing DB success test explicitly asserts real payments' capture_id is null. Final full DB/API/verify/build results follow below. All existing uncommitted A5 work is preserved; no other issue or feature is included.

Manual checks — awaiting user verification: with the A5 dedicated sandbox demo prerequisites and inherited settings above, start `corepack.cmd pnpm --filter @niryat/api dev` and `corepack.cmd pnpm --filter @niryat/web dev` in separate terminals (POSIX: corepack pnpm). At http://localhost:3000/login choose Try as freelancer (demo), then open http://localhost:3000/invoices and expand payment details. Every JUDGE-SYNTHETIC- payment must remain visible with no Propose refund control. A genuine sandbox payment must retain its existing control, unless it already has an open refund proposal. Obtain a synthetic payment UUID from authenticated http://localhost:3000/api/invoices (payments[].id beside its transaction ID). From that same authenticated browser, a JSON POST to `/api/payments/<synthetic-payment-uuid>/refunds` with `{"amount":"1.00"}` must return 422/synthetic_payment and create no approval. Do not approve a genuine refund merely to test visibility. With sandbox PayPal configured, if an older synthetic refund proposal exists, approving it must fail locally with synthetic_payment, call no PayPal service, explain rejecting it rather than retrying, and still permit rejection. This last path is covered automatically with a fake dispatcher; no real queue cleanup is performed.

Final checks: full API integration **794/794 in 40 files, zero skips** (421.54s); full DB **180/180 in nine files, zero skips** (30.64s); web **561/561 in 46 files** (7.29s). `corepack pnpm verify` passes **27/27 tasks** (nine cached, 2m36.831s); production `corepack pnpm build` passes **9/9** (two cached, fresh Next build, 1m50.973s). The actual root `corepack pnpm seed:judge` command also passes with the expected fixture counts and zero actions. Normal verify's 101 DB/263 API integration skips are covered by the complete separate runs above. No test timeout or assertion was weakened.

DB/API test:db-equivalent direct Vitest and seed commands used only task-created PostgreSQL 17 niryat_test on localhost:55440, generated test values and no private environment-file loader. Docker was started for the local test engine; the task-created --rm niryat-a5-refund-tests container was stopped and removal confirmed afterward. Logs: `.tmp/a5-refund-{web-before,api-before,api-focused,web,db,api-integration,verify,build,seed-cli}.log`. The first formatter invocation used the wrong working directory and was corrected before all final checks; no runtime workaround or unrelated fix was needed. Final documentation/scaffold verification passes 27/27 tasks (all cached), and git diff --check passes.

This correction replaces the earlier incorrect assumption that a null capture_id prevented refunds: real captures are stored in paypal_txn_id. Browser/hosted checks remain pending. Existing queued synthetic proposals are not deleted or reset; they are blocked before dispatch and remain rejectable. No private environment file, application database, actual PayPal/Render call, browser/helper connection, feature tick, deployment, commit or publication.

### F1. Submission materials (P0)

Docs and README only.
- **Video (under 3 minutes)**, five scenes with PayPal on screen, replacing PLAN §16's nine:
  1. The problem in plain words (one line on the LUT, using the S9 phrasing).
  2. Paste an email → AI fills the invoice → approve → **the sandbox buyer receives it in PayPal** → pays → fee and net appear.
  3. **Monthly close with the A4 tool log visible:** Claude reads PayPal, holds for the disputed client, proposes reminders → approve → the buyer gets the reminder.
  4. AG Studio: ask the freelancer dashboard a question, then switch to the **CA portfolio** (B6) and the **multi-client Bryntum calendar** (C3).
  5. Safety: the freelancer approves every PayPal action; rules cite their sources; the CA can only view. Close on the tagline.
- **README:** a "Sponsor tools" section describing exactly:
  - AG Studio: two dashboards, the AI assistant, theme;
  - Bryntum: categories, filters, tooltips with sources, multi-client calendar;
  - Render: Workflows monthly close and durable manual close, 30-minute light sync, nightly sync, paid Postgres;
  - APIMatic: link the usage log.

  Plus a judge-mode section and an updated status line. **The README must stay under 120 lines** (the scaffold check).
- **Devpost text:** problem, who it's for, how PayPal and Claude are used, the business model line (_"free for freelancers; CA firms pay per client"_), and limitations (sandbox only, one PayPal seller per deployment, synthetic FIRA, rules not CA-reviewed, invoices not digitally signed).
- **Manual (user):**
  - confirm AG Studio and Bryntum licences cover 2026-12-15 (V15) on the PayPal Discord;
  - set `AI_MONTHLY_BUDGET_USD` for December;
  - record results in [verification.md](docs/verification.md).
- Update [build-flow.md](docs/build-flow.md) Phase 7 statuses for whatever shipped. Tick nothing that wasn't verified.

#### F1 implementation and verification (2026-11-06)

Docs only: PLAN section 16 now has five scenes totalling 2:55; [submission materials](submission.md) supply Devpost copy and exact user rehearsal prerequisites/inputs/URLs/expected results. README now names both AG Studio dashboards/Assistant/theme, Bryntum categories/filters/source tooltips/multi-client view, Render Workflows/manual dispatch/light/nightly sync/paid Postgres and APIMatic's usage evidence. Phase 7 records shipped implementation while leaving hosted acceptance and every reliability checkbox open. V17/RENDER document user-only licence and December-budget follow-up; V15's confirmed Bryntum coverage is preserved. No budget value, key or licence evidence is invented.

Real sandbox sends/payment/reminder delivery must be demonstrated separately from synthetic seed history. The script leaves disputed-client hold advice unapproved, requires actual successful Claude reads/hold evidence, labels simulated dates and does not promise AI choices or immediate webhooks. Devpost copy discloses one seller, sandbox/synthetic FIRA, no CA rule review, unsigned/no-INR-conversion PDFs, blocked CSV import, shared seed dates, advisory hold wording and pending hosted/manual/licence/budget checks. Billing is a proposed model only. Prior user edits adding G/H tasks are preserved; none is implemented here.

Automated checks passed: direct `corepack.cmd pnpm --filter @niryat/db exec vitest run --no-file-parallelism` **180/180** (nine files, 30.78s) and the equivalent API command **794/794** (40 files, 452.33s), zero skips. Both inherited only the task-created PostgreSQL 17 `niryat_test` URL, avoiding the `test:db` wrappers' private environment-file loaders; the application database was untouched. `corepack.cmd pnpm verify` passes **27/27** tasks (all cached, 116ms Turbo plus fresh root checks). Its cached ordinary integration skips are covered by the separate complete runs above. The first verification stopped on formatting in the two new Markdown tables; targeted Biome fixes resolved it. No assertion or timeout changed. F1's 52 local links/anchors, README **84 lines** (<120), five contiguous scenes **175 seconds** (<180) and diff whitespace pass. Logs: `.tmp/f1-{db,api,verify,doc-check}.log`. The task-created `--rm` container `niryat-f1-tests` was stopped/removed. No production build was needed for docs-only changes.

User checks: all five hosted scenes, AG Studio coverage and December budget remain **awaiting user verification** in [V17](verification.md#v17-submission-materials-and-rehearsal). No runtime/web/config/dependency/migration/env change, PayPal/APIMatic/Render/Discord service call, browser/helper, feature tick, deployment, recording, commit or publication.

#### F1 review corrections: 1 then 2 then 3 (2026-11-06)

Fixed in order, with a focused check passing before each next edit:
1. H3 and the related README/A5/architecture/submission/Render guidance now refresh only synthetic LUT dates through the existing Profile form. They preserve database, invoice-number and approval history because PayPal retains sent invoices. H3 gives exact user steps and expected results; no profile or database was changed. The issue-1 check confirmed all advice copies agree while issues 2/3 were still untouched.
2. V17 and RENDER now describe the current execution month in IST for AI spend checks, independently of the close's report month. The issue-2 check compared both copies with `apps/api/src/close.ts` before issue 3 was edited.
3. G/H links now resolve from this document: sibling documentation names and `../` for root files. All 11 local targets/anchors passed, including the source path containing `(public)`. No later feature was implemented.

Verification: all three focused checks passed in order (`.tmp/f1-review-issue{1,2,3}.log`); 76 affected local links/anchors, README 84 lines and the unchanged 175-second script pass (`.tmp/f1-review-doc-check.log`). Direct `corepack.cmd pnpm --filter @niryat/db exec vitest run --no-file-parallelism` passed 180/180 (nine files, 28.15s); the equivalent API command passed 794/794 (40 files, 256.11s), zero skips. Both used only task-created PostgreSQL 17 `niryat_test` through `TEST_DATABASE_URL`, without private environment-file loaders or application data. `corepack.cmd pnpm verify` passed 27/27 tasks (all cached, 157ms Turbo plus fresh root checks); ordinary cached integration skips are covered by the full direct runs. Logs: `.tmp/f1-review-{db,api,verify}.log`. The `--rm` container `niryat-f1-review-tests` was stopped/removed. Formatting and diff whitespace pass; no build needed for docs-only corrections.

Synthetic-profile refresh, browser/hosted checks, licence coverage and budget configuration remain awaiting user verification. Docs only; no code/config/dependency/migration/env change, application data mutation, PayPal/Render service call, feature tick, deployment, commit or publication.

### C4. Plan-your-work drag on the calendar (P2)

Only if every P0 and P1 task is done. Let freelancers drag their **own tasks** (not legal deadlines) to a "planned" date in Bryntum; legal deadline events stay locked per event. Needs a nullable `tasks.planned_date` column and `POST /tasks/:id/plan`. Write a full sub-plan before starting; do not start without the user's go-ahead.

### Phase 7 and 8: remaining tasks (21–28, added 2026-11-06)

These cover what [build flow §Phase 7–8](build-flow.md#phase-7-judge-mode-hosting-and-freeze-nov-58) still needs after tasks 1–20.
**Not added, because they are done or cut:** "Try as judge" (A5), rate limits (A2), the AI budget cap (it already exists; F1 sets the December value), last-sync display (E1), durable manual close (E2). PLAN §6 stretch features are cut because the feature freeze is Nov 8 and C4 is still open.
G tasks are Phase 7. H tasks are Phase 8. Tasks marked **(user)** are done by the user: deployment, PayPal/Render dashboards, browser checks and recording are theirs (AGENTS.md, section 3). For those, the coding model writes the exact steps, records only the results the user reports, and ticks only what was verified.

### G1. Disclaimer says "sandbox only" (P0, Phase 7)

**Objective:** the Phase 7 disclaimer must cover four points: not tax advice, no CA review, one seller per deployment, sandbox only. [disclaimer/page.tsx](<../apps/web/src/app/(public)/disclaimer/page.tsx>) already covers the first three. It does not mention the sandbox.

**Change:** add one paragraph reusing A5's exact wording: **"This demo uses PayPal sandbox accounts only. No real money moves."** Add it to PLAN §23 as well, so the page and PLAN stay identical in meaning.

**Tests:** extend the existing disclaimer assertion in [index.test.tsx](../apps/web/src/index.test.tsx) to check for the new sentence.

**Acceptance:** `pnpm verify` and `pnpm build` pass.

### G2. Judge-mode keys in the Render Blueprint (P0, Phase 7)

**Objective:** A5 reads `JUDGE_MODE` and `JUDGE_BUYER_EMAIL` on the API, but `niryat-api` in [render.yaml](../render.yaml) declares neither. Without them, the hosted demo hides both demo buttons and `/auth/judge` returns 404.

**Change:**
- Add both keys to `niryat-api` as `sync: false`. The user supplies the values in the Render dashboard; never commit a value.
- Add no other service or key.

**Tests:** extend the Blueprint guardrail in [scripts/guardrails.test.mts](../scripts/guardrails.test.mts) to assert that `niryat-api` declares both keys as `sync: false`.

**Docs:** add an entry to [RENDER.md](RENDER.md) (sponsor-doc rule in AGENTS.md).

**Acceptance:** `pnpm verify` passes. Nothing is deployed.

### G3. Hosted deploy and smoke check (P0, Phase 7, user)

**Objective:** a running hosted demo that judges can open. The coding model writes nothing here except the results the user reports, in [V11](verification.md#v11-hosted-resources) and [RENDER.md](RENDER.md).

**User steps:**
1. Deploy the Blueprint. Confirm that `niryat-db` is on a **paid** plan that does not expire before 2026-12-15 (PLAN §20: free databases expire after 30 days).
2. Enter every `sync: false` value in the Render dashboard, using **sandbox** PayPal credentials only. Set `JUDGE_MODE=true`, `JUDGE_BUYER_EMAIL` and `AI_MONTHLY_BUDGET_USD`.
3. From the `niryat-api` shell, run `corepack pnpm db:migrate`, then `corepack pnpm seed:judge`.
4. In the PayPal sandbox app, register the webhook at `https://<api-public-host>/webhooks/paypal` and put its ID in `PAYPAL_WEBHOOK_ID`. Set `PAYPAL_LOGIN_RETURN_URL` and `PUBLIC_APP_URL` to the hosted URLs.
5. Confirm that the `niryat-worker` workflow lists the `monthlyClose` task and that the three crons appear.

**Smoke checks (expected results):** `GET /health` → `{"status":"ok"}`. `GET /judge-mode` → `true`. The home page and both login pages show both demo buttons. Try as freelancer → `/overview` as Ananya. Try as CA → `/ca` with three clients. Response headers include `X-Frame-Options: DENY` (A1).

**Acceptance:** each smoke result is recorded as reported. Mark anything not observed as pending.

### G4. Hosted reliability checks (P0, Phase 7, user)

**Objective:** close the four reliability checkboxes in build flow §Phase 7. E1 and E2 built the code. Only the hosted checks remain.

**User checks** (exact steps for E1/E2 are in RENDER.md):
1. **Webhooks:** pay a sandbox invoice, and open and refund a dispute against the hosted URL. Expect a valid signature, the payment or dispute on the right invoice, a task, and no duplicate when PayPal resends. Record the results in [V06](verification.md#v06-events-refunds-disputes-and-history).
2. **Freshness:** with a webhook missed (for example, before registering it, or with it paused), the 30-minute `niryat-sync-light` cron recovers the event without terminal commands. Record the measured delay.
3. **Last sync:** the Today and invoices pages show the last update. A failed cron run does not advance it, and the next good run clears the stale notice.
4. **Durable close:** restart `niryat-api` during a manual close. The run finishes, or shows a recoverable failure. It does not get stuck and creates no duplicate proposals or tasks. No claimed reminder is replayed.

**Acceptance:** tick each build-flow checkbox only after its check passes. A failed check becomes an H1 bug fix and stays unticked.

### G5. Feature freeze and hosted demo-script run (P0, Phase 7 exit gate)

**Objective:** the Phase 7 exit gate. Freeze features on **2026-11-08**, and run the full demo script on the hosted demo.

**Rules after the freeze:** only fixes for failures found in G3, G4 or H1, plus docs. No new features, migrations or dependencies. If C4 is not done by Nov 8, it is dropped.

**User check:** run the five F1 video scenes end to end on the hosted demo. Record each scene as pass or fail in build flow §Phase 7, and set the exit-gate status. Fix failures under H1 before recording the video.

### H1. Testing sweep of pending manual checks (P0, Phase 8, Nov 8–10)

**Objective:** Phase 8 "testing". Many tasks above end with "awaiting user verification". Work through them on the hosted demo, starting with the ones on the demo path and the security ones: role isolation (B1–B4), CA can only view (B5), synthetic refunds blocked (A5), then the rest.

**Process:** the user runs each block's steps and reports pass or fail. The coding model marks each block **verified** or **failed** in place, with the date. For each failure, it writes a minimal fix with a regression test, runs `pnpm verify` (plus `pnpm build` for web changes), and the user re-runs the check.

**Acceptance:** no demo-path check left as failed. Checks not run stay "awaiting user verification" and are listed as limitations in F1's Devpost text.

### H2. Video, compliance checklist and submission (P0, Phase 8, user)

**Objective:** submit on **2026-11-11**, one day before the deadline.

**User steps:**
1. Record the video under 3 minutes from the F1 script, on the hosted demo. Use no third-party logos or copyrighted music. Upload it to YouTube as public.
2. Make the repository public, with the LICENSE shown in the About section.
3. Go through [PLAN §19](PLAN.md#19-hackathon-compliance-checklist). The coding model ticks each box only when the user confirms it. The licence item depends on V15.
4. Submit on Devpost with the F1 text. Choose **AG Studio** as the single sponsor prize (section 0).

**Acceptance:** the submission is confirmed by the user. The PLAN §19 ticks match what was confirmed.

### H3. Keep alive to Dec 15 and refresh demo dates (P0, Phase 8, user)

**Objective:** keep the hosted demo usable for all of judging, 2026-12-01 to 2026-12-15.

**Refresh synthetic demo dates (user only):** Ananya's LUT ends **15 days after the first seed**, and reruns keep the original dates (A5). An expired LUT blocks invoice issuing. Before a later rehearsal or judging, use the existing Profile form to refresh this synthetic fixture. Preserve the database, invoice numbers and approval history: PayPal retains sent invoices, so deleting Niryat's history can cause later sends to reuse their numbers. This fixture change does not renew a real LUT; real profiles must reflect the filed document.

**Manual steps (awaiting user verification):**
1. Start the dedicated sandbox demo using the [rehearsal setup](submission.md#recording-and-rehearsal-user-only), or use its hosted web origin. Choose **Try as freelancer (demo)** and confirm the profile is Ananya's synthetic account.
2. At `/profile`, keep the synthetic LUT reference and valid-from date. Set **LUT valid to** after the planned demonstration; for December judging, use **2026-12-16** so it stays valid through December 15. Save the profile. Do not reset/reseed the database to refresh this date.
3. Reload `/profile` and `/health-check`. Expect the saved end date and no `lut_expired` high flag; a near-expiry warning can remain. At `/invoices`, confirm existing invoices and numbers remain. Record the date, demo origin and observed results in V11. The assistant has not changed any profile or database.

**Weekly checks until Dec 15:** `/health` responds; the crons and the `monthlyClose` task ran; the AI budget has room; the sandbox seller and buyer accounts still work; the database plan and Render credits last to Dec 15; the licences still render (V15). Record any outage or fix in V11.

---

## 3. Non-goals (do not build)

- CA writes of any kind except the GSTR-1 CSV download and link claim/accept/decline/stop. **CAs never approve, propose or send PayPal actions.** CA proposals into the approval queue are future work.
- Email or notification delivery for share requests; CA identity verification (ICAI number); CA firms with several staff; more than one active CA per freelancer; CA billing.
- PayPal Partner Referrals (one seller per deployment remains, disclosed).
- A chatbot; new agent PayPal actions; Toolkit write tools.
- A real-FIRA parser, invoice PDF digital signatures and INR conversion on the PDF (listed as limitations in F1).
- Deployment itself, Render account setup, webhook registration on the hosted URL (the user does these).
- Changing any rule's logic, threshold, YAML metadata or citation.

---

## 4. Verification for every task

- `corepack pnpm verify` (or `corepack.cmd pnpm verify` on restricted PowerShell). `pnpm build` for any web change.
- DB/API integration: `pnpm --filter @niryat/db test:db` and `pnpm --filter @niryat/api test:db` against the separate `niryat_test` database. Report skipped integration tests honestly.
- Browser checks are the user's (AGENTS.md). Each task lists its manual steps; report them as **awaiting user verification**.
- No commit or publish unless the user asks.

## 5. User decisions (approved 2026-11-04)

1. **A5 / E2 env keys: approved.** The implementer may add `JUDGE_MODE` and `JUDGE_BUYER_EMAIL`, and a Workflows dispatch key only if E2 finds none exists, to `.env.example`, with placeholder values only. No other `.env.example` change is authorized.
2. **D2 review gate: approved.** Step 1's old → new rules messages go in a "D2 review log" here; the user reviews them before steps 2–4 start.
3. **B3: approved.** One active CA per freelancer.

#### E1 implementation and verification (2026-11-05)

Implemented E1 only before E2: sync_runs migration 0010, count-only repository/one-running guard, recorded CLI payment/dispute reconciliation, overlap status skipped, --no-agent skips AI config/runner/reminder execution; half-hour niryat-sync-light with unchanged nightly reminders. Signed-freelancer /sync-status returns only timestamps/status/stale (two-hour inclusive boundary), no user records/counts; reusable SSR notice on Today/invoices includes relative/absolute IST, never-successful, unavailable and latest-failed states. All affected exports/schema inventory/reset, CLI fixtures, overview fixtures, format/notice/role/DB regressions and Blueprint guardrails updated. Architecture and RENDER record behavior and exact manual steps.

Initial checks exposed a Drizzle aggregate Date/ISO mismatch, the transaction config name (accessMode) and an inferred widened status union; corrected before final checks. DB integration PASS 179/179 in nine files, zero skips (117.91s). API normal suite PASS 511, 251 integration skips. Web initial PASS 544/544; final verify includes 549/549 after relative-time boundary assertions. corepack.cmd pnpm verify PASS 27/27 (21 cached, 2m34.349s); corepack.cmd pnpm build PASS 9/9 (two cached, fresh Next, 3m0.115s). Full API integration is pending at this entry; results will be appended before E2 implementation. Direct test:db equivalents use disposable PostgreSQL 17 niryat_test and never invoke the private .env-loading wrapper. Offline migration generation used a temporary config with no environment loader (removed afterward); needed elevated execution for Windows sandbox account lookup. No application database or PayPal service used.

The freshness target is 30 minutes, not measured hosted performance. A killed poll leaves its running lock until an operator confirms termination and marks it failed; exact recovery SQL is in RENDER. Poll freshness excludes direct monthly-close reconciliation, explicit refund recovery and webhook receipt times. Loaded UI is a snapshot until reload. Browser/hosted timing/recovery and licence coverage await user verification. No feature ticks, environment-file access/edit, new dependency, other task, browser/helper, deployment, commit or publication.

E1 final integration: full API PASS 762/762 in 38 files, zero skips (488.02s, .tmp/e1-api-integration.log). All E1 checks completed before E2 code changes. E1 final git diff --check passed. Logs .tmp/e1-{api,web,db,verify,build,api-integration}.log. The signed-CA boundary test was strengthened to use a real signed cookie; it passed in the final integration run.

#### E2 implementation and verification (2026-11-05)

Implemented E2 after all E1 checks passed: POST /close reserves the existing run, dispatches a validated single-user manual task with runId/idempotency key when configured, retains local in-process fallback and concurrent 409. Reuses the trigger's RENDER_API_KEY/RENDER_USE_LOCAL_DEV settings; Blueprint adds the existing key on the API. Direct dependency declarations reuse SDK 1.4.0 and shared schemas; frozen offline installation passed, no registry download or new SDK version. Lockfile diff is only six importer lines. No environment-file changes.

Strict shared task input, freelancer-only single-user selection and exact reserved-run matching are implemented. The worker claims the unique first audit slot under a row lock, skips duplicate/stale/completed/replaced deliveries and retains original asOf across midnight. Existing 15-minute stale-on-next-start and 900-second task timeout remain. Dispatch failure may mean Render accepted the job: keep the reservation, return sanitized 503, do not run locally or open another slot. The UI explains checking status/waiting; the new audit step has a plain label. A worker crash after claim requires a fresh user-started close after stale recovery. Approved/outcome-unknown reminders are never reset or replayed.

Tests cover fake-dispatch exact input/one call/202/no local work, concurrent 409, safe uncertain failure, external owner/run injection rejection, SDK input/ack/idempotency, worker validation, wrong owner/date/stale/concurrent claims, single-user isolation/CA denial, midnight rollover, API replacement/duplicate delivery and preserving a claimed reminder. Full DB PASS 180/180 zero skips (38.20s); focused claim suite PASS 10/10 (18.42s); worker PASS 40/40. Initial E2 verify/build passed (27/27 and 9/9, fresh Next), after correcting a public-response test that wrongly expected userId and a Blueprint test that matched nested fromService names. Initial integration had already imported that old response assertion: 776 passed/one failed in 364.89s, with all integration logic regressions passing. A clean final full API run and final verify/build follow below. No timeout changed; the public projection stays unchanged and exact dispatcher-owner matching remains asserted.

Architecture and RENDER E2 document exact prerequisites/startup/URLs/buttons/expected results, configured/local behavior, dispatch uncertainty and stale recovery. Official Render SDK/local-dev documentation and installed SDK declarations were consulted. The actual hosted API-restart check, task registration/permissions and browser checks remain awaiting user verification. No other task, feature ticks, private environment-file inspection/edit, live PayPal/Render call, browser/helper connection, deployment, commit or publication.

E2 final result (2026-11-05): clean full API PASS 779/779 in 39 files, zero skips (359.58s, .tmp/e2-api-integration-final.log). Full DB PASS 180/180 zero skips; web PASS 551/551 in 45 files; worker PASS 40/40. Final corepack.cmd pnpm verify PASS 27/27 tasks (10 cached, 1m43.536s); production corepack.cmd pnpm build PASS 9/9 (two cached, fresh Next, 2m6.507s). Final Blueprint comments/architecture table inventory corrected during diff review; git diff --check passed. No runtime code changed after these final passes. Logs .tmp/e2-{db,db-focused,verify-final,build-final,api-integration-final}.log. Root verification reports normal 101 DB/254 API skips; the separate full integration runs above have zero skips.

All integration commands were test:db-equivalent direct Vitest with --no-file-parallelism and TEST_DATABASE_URL pointing only to task-created PostgreSQL 17 niryat_test on port 55437. Private .env loaders and the application database were not used. The disposable --rm niryat-e1-e2-tests container is stopped/removed after the passes. Final documentation/Blueprint verification is recorded below after cleanup. E1 and E2 are implemented; browser and hosted acceptance remain pending with exact steps in RENDER. Killed-poll manual unlock, uncertain dispatch/stale-run recovery and unverified licence coverage remain explicit limits. Nothing deployed, committed or published.

Final documentation/Blueprint check (2026-11-05): pnpm verify passed 27/27 tasks, all cached (111ms Turbo; root checks fresh); task-created test container stop/removal confirmed. Final git diff --check passed.

#### E1 review correction: issue 1 only (2026-11-05)

Plan: preserve light immediate skip; add a bounded nightly-only retry loop around the existing syncPayPal lock; reconcile before reminders once; report persistent contention as an error; refresh time after waits. Reach sync.ts/tests and Render/architecture/improvement records only. Preserve all uncommitted E1/E2 work, schedules, lock/approval semantics, environment files and dependencies. Run regression before fix, then API tests, separate DB/API integration and pnpm verify; browser/hosted checks remain the user's.

Three regressions failed before implementation (one lock attempt instead of retry/recovery; missing post-wait reconciliation). Implemented a small CLI loop with ten capped backoff waits, 245 seconds total; light mode still skips immediately. No changes to syncPayPal, its DB lock or callers in monthly close. Retry acquisitions and the reminder phase get current timestamps. A persistently busy nightly job logs an explicit safe error and exits 1; it neither runs the agent on the in-progress poll nor clears another process's row. Tests cover recovery/no reads or agent before release/one reminder phase, exhaustion/backoff/cleanup, light skip and IST rollover. Full API normal suite PASS 528, 254 integration skips (52.42s); final integration/verification results will follow below. Logs .tmp/sync-overlap-{before,api,db,api-integration,verify}.log.

RENDER records exact disposable-fixture SQL, startup commands, URLs, inputs/actions and expected local/hosted results. No web/build change or production build is needed for this API-only fix. No other review issue, feature tick, migration, dependency, configuration/schedule, environment-file access/edit, actual PayPal/Render call, browser/helper, deployment, commit or publication. Known limit: if contention lasts longer than the retry budget (including a killed poll's retained lock), the job fails visibly and needs operator recovery/retry; killed-poll policy is unchanged.

Review issue 1 final result (2026-11-05): full API integration PASS 782/782 in 39 files, zero skips (324.61s); full DB integration PASS 180/180 in nine files, zero skips (35.20s). corepack.cmd pnpm verify PASS 27/27 tasks (22 cached, 51.687s); full normal API package tests PASS 528 with 254 database integration skips (52.42s). The three new regressions failed before the fix and pass in both final API runs. git diff --check passed. Direct test:db-equivalent Vitest commands used only task-created PostgreSQL 17 niryat_test on port 55438 and no private .env loader; the application database was untouched. The --rm niryat-sync-overlap-tests container is stopped/removed after the passes. No production build was run: only API orchestration/tests/docs changed. Existing E1/E2 work and all schedules remain intact. Exact user-only collision checks and the 245-second busy-failure limit are in RENDER; hosted/browser checks remain awaiting user verification. No actual PayPal/Render call, environment-file access/edit, deployment, commit or publication.

Final review-fix documentation verification: pnpm verify passed 27/27 tasks, all cached (125ms Turbo; root checks fresh). Disposable test container stop/removal confirmed; final git diff --check passed.
