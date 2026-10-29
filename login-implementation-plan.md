# Log in with PayPal: implementation plan

Spec 01 follow-up. Adds Log in with PayPal **alongside** email sign-in; both stay.
Decided 2026-10-29: one app, the existing one.

## How it works

- Niryat's PayPal actions (invoicing, payments, refunds, disputes, webhooks, sync) keep using the existing app credentials, `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`. They always act on the account that owns that app.
- Log in with PayPal is a **second way to sign in to Niryat**, the same kind of thing as email sign-in. It identifies the Niryat user and grants Niryat no PayPal access.
  - Niryat keeps no PayPal tokens from it.
  - It doesn't need the signed-in user's PayPal access, so email users never need a PayPal step.
- **Known limit:** the account that owns the app can't use the button. PayPal returns userinfo 400 when the signing-in account owns the app ([root cause](docs/paypal-sandbox-findings.md#root-cause-the-app-owner-cannot-sign-in-to-its-own-app-2026-10-29)). That account uses email sign-in. Any other PayPal account works (verified 2026-10-29).

## Current state (2026-10-29)

- Email sign-in: `POST /auth/signup|login|logout`, `GET /auth/me` ([auth.ts](apps/api/src/routes/auth.ts)). Signed session cookie ([session.ts](apps/api/src/auth/session.ts)).
- The web app calls the API through the `/api/*` rewrite ([next.config.ts](apps/web/next.config.ts)), so cookies land on the web origin.
- `users.password_hash` is `NOT NULL`. `users.paypal_payer_id` exists but is unused ([schema.ts](packages/db/src/schema.ts)).
- `createPayPalRestClient` only does client-credentials tokens, so it can't run the authorization-code flow.
- The latest migration is `0003`. Uncommitted P4 work in `packages/db` and `packages/shared` must be committed first, so that this task's migration and diff stay separate.

## Step 0: Two sandbox checks before coding (user, about 10 minutes)

1. **Payer ID.** Open the existing app → Log in with PayPal → Advanced Settings and tick **PayPal account ID (payer ID)**, if it's listed. Temporarily change the spike's scope to `openid email https://uri.paypal.com/services/paypalattributes` ([paypal-login-check.ts:51](scripts/spikes/paypal-login-check.ts#L51)).
   - Run the spike as before, signing in with an account that **doesn't** own the app.
   - Note `payer_id=present|absent`. It decides which identifier step 2 stores.
   - Restore the scope line afterwards.
2. **Return URL.** Change the app's Return URL to `http://localhost:3000/api/auth/paypal/callback`.
   - If PayPal rejects `http://localhost`, try `http://127.0.0.1:3000/...` and set `PUBLIC_APP_URL` to match.
   - Record what was accepted. The spike's `example.com` URL then stops working, which is fine.

## Step 1: PayPal adapter (`packages/paypal`)

New `packages/paypal/src/rest/identity.ts`, exported from the package index:

```ts
export interface PayPalLogin {
  authorizeUrl(state: string): string;
  identify(
    code: string,
  ): Promise<
    | { ok: true; paypalId: string; email: string | undefined }
    | { ok: false; reason: "exchange_failed" | "userinfo_failed" }
  >;
}
export function createPayPalLogin(options: {
  clientId: string;
  clientSecret: string;
  returnUrl: string;
  fetch?: typeof fetch;
}): PayPalLogin;
```

- **`authorizeUrl`:** `https://www.sandbox.paypal.com/connect`. Parameters:
  - `flowEntry=static`, `client_id`, `response_type=code`, `redirect_uri=returnUrl`, `state`.
  - `scope=openid email`, plus `https://uri.paypal.com/services/paypalattributes` if step 0 showed payer ID.
- **`identify`:** POST `/v1/oauth2/token` (`grant_type=authorization_code`), then GET `/v1/identity/oauth2/userinfo?schema=paypalv1.1`.
  - Validate both responses with zod.
  - `paypalId` is `payer_id` if step 0 showed it, otherwise `user_id`.
  - `email` is the primary entry of `emails[]`, else the first.
- **Errors:**
  - A PayPal 4xx is an expected outcome and returns `{ ok: false }`, logged with its `paypal-debug-id`, never tokens.
  - A network failure or 5xx throws `PayPalApiError`, matching [rest/index.ts](packages/paypal/src/rest/index.ts).
- The access token is used once and discarded. No refresh token is kept.
- Tests (`identity.test.ts`, fake `fetch`):
  - The authorize URL carries the exact parameters.
  - The happy path returns the ID and email.
  - A 400 from the token endpoint gives `exchange_failed`.
  - A userinfo 400 gives `userinfo_failed`.
  - A malformed body gives a typed failure.
  - A thrown network error propagates.

## Step 2: Database (`packages/db`)

Schema ([schema.ts](packages/db/src/schema.ts)):
- `password_hash` becomes nullable, because PayPal-only users have no password.
- The PayPal identifier column depends on step 0:
  - **payer ID available:** keep `paypal_payer_id` and add a unique constraint.
  - **payer ID unavailable:** add `paypal_user_id text unique` and leave `paypal_payer_id` untouched. Dropping and adding in one migration makes `drizzle-kit generate` prompt interactively, and that doesn't work here.
- Then run `pnpm db:generate` (creates the next migration) and `pnpm db:migrate`.

Repository ([users.ts](packages/db/src/users.ts)):
- **`createUser`:** `passwordHash` and `paypalId` become optional.
- **`findUserByEmail`:** return `passwordHash: string | null`. The login route already falls back to `dummyHash`, so PayPal-only users fail the password check with `invalid_credentials`.
- **New `signInWithPayPal(db, { paypalId, email })`.** It returns `{ ok: true, user }`, `{ ok: false, reason: "email_taken" }` or `{ ok: false, reason: "no_email" }`. It decides in this order:
  1. **A user already has `paypalId`:** return that user.
  2. **No email from PayPal:** return `no_email`.
  3. **A user has the same email:** return `email_taken`. Don't link by email, because that would be an account-takeover path. That user signs in with email.
  4. **Otherwise:** create the user with `passwordHash` null. If the insert loses a race on a unique constraint, look the user up again.
- Integration tests in [storage.test.ts](packages/db/src/storage.test.ts) style. Like the existing ones, they skip without `DATABASE_URL`. Cover each branch above, plus a PayPal-only user who can't sign in by password.

## Step 3: API (`apps/api`)

- **[server.ts](apps/api/src/server.ts):** when `loadPayPalEnv` returns credentials, also build `createPayPalLogin({ clientId, clientSecret, returnUrl: `${PUBLIC_APP_URL}/api/auth/paypal/callback` })` from the **same** keys. Add `paypalLogin?: PayPalLogin` to `AppDeps`. No new env keys and no `.env.example` change.
- **[auth.ts](apps/api/src/routes/auth.ts):**
  - **`GET /auth/paypal/start`:**
    - If `paypalLogin` is absent, redirect 302 to `/login?error=paypal_unavailable`.
    - Otherwise set a signed cookie `niryat_paypal_state` with a random value (`httpOnly`, `SameSite=Lax`, `maxAge` 600, path `/`), reusing hono's `setSignedCookie` as `session.ts` does.
    - Then redirect 302 to `authorizeUrl(state)`.
  - **`GET /auth/paypal/callback`:**
    1. Read and delete the state cookie. A missing or mismatched `state`, or an `error` parameter (for example a refused consent), redirects to `/login?error=paypal_cancelled`.
    2. Call `identify(code)`. A failure redirects to `/login?error=paypal_failed`; this includes the app owner's 400. A thrown error is logged without values and redirects to `/login?error=paypal_unavailable`.
    3. Call `signInWithPayPal(db, identity)`. On success, call `startSession` and redirect to `/profile`. On failure, redirect to `/login?error=<reason>`.
    - Redirects only ever go to fixed paths on `publicAppUrl`, so there's no open redirect.
- Route tests in [auth.test.ts](apps/api/src/routes/auth.test.ts), with a fake `PayPalLogin`:
  - The start route sets the state cookie and the Location header.
  - Unconfigured returns `paypal_unavailable`.
  - A missing or mismatched state is rejected.
  - Consent refused (`error=access_denied`).
  - A successful new user gets a session cookie and a redirect to `/profile`.
  - An existing linked user signs in.
  - `email_taken`.
  - `identify` failure and network-error paths.

## Step 4: Web (`apps/web`)

- **[login/page.tsx](apps/web/src/app/login/page.tsx)** and the signup page: add a plain link `<a href="/api/auth/paypal/start">Log in with PayPal</a>` under `AuthForm`. It's a full-page navigation, so no client JS is needed.
- Read `searchParams.error` and show a fixed message per reason in a `role="alert"` paragraph, never echoing the raw parameter. For `paypal_failed`, say: "PayPal couldn't sign you in. If this PayPal account runs this Niryat deployment, use email sign-in."

## Step 5: Docs

- [spec 01](docs/specs/01-health-check.md): status, limitation bullets, the sign-in criterion. Tick it only after browser verification.
- [docs/paypal.md](docs/paypal.md): Log in with PayPal uses the same app, with its limit.
- [verification.md V02](docs/verification.md#v02-identity).
- [build-flow.md](docs/build-flow.md) row.
- [findings](docs/paypal-sandbox-findings.md): step 0's payer ID result and the return URL that was accepted.

## Verification

- `pnpm verify` and `pnpm build`.
- Browser checks, done by the user. Start with `pnpm dev`, with `DATABASE_URL` and the PayPal keys set:
  1. On `http://localhost:3000/login`, click **Log in with PayPal**. Sign in with a sandbox account that **doesn't** own the app. **Expected:** `/profile`, signed in.
  2. Sign out, then sign in with PayPal again. **Expected:** the same Niryat account, with its saved profile still there.
  3. Start Log in with PayPal and cancel on PayPal's page. **Expected:** `/login` with the "cancelled" message.
  4. Try Log in with PayPal as the **app owner**. **Expected:** `/login` with the `paypal_failed` message.
  5. Email sign-up and sign-in still work unchanged.

## Not doing (and why)

- **No second app.** Niryat needs no PayPal access from the signed-in user. The app owner signs in by email.
- **No "Connect PayPal" for email users.** Linking adds nothing Niryat needs.
- **No PayPal tokens stored, and no refresh.** Niryat needs identity, not access.
- **No `id_token` or JWKS verification.** userinfo, called server-side with the confidential client, is enough.
- **No multi-seller permissions** (Partner Referrals, `PayPal-Auth-Assertion`). Out of v1 scope, as spec 01 already says.
- **No rate limiting.** Still the existing shortcut on login.

## Size and order

A few hours, as one commit series after the P4 work is committed:
1. Step 0, done by the user.
2. Steps 1 and 2, together with their tests.
3. Step 3.
4. Step 4.
5. Step 5 docs.
6. The user runs the browser checks.
