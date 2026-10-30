# 1. Sign in with PayPal and compliance health check

Status: built with email sign-in (2026-10-26); Log in with PayPal through the existing app and all login-plan browser checks are user-confirmed (2026-10-30). The login follow-up is complete; evidence is in [V02](../verification.md#v02-identity).

## Goal

Connect PayPal identity and capture the compliance profile with sourced health flags.

## User story

As an Indian freelancer paid through PayPal, I want to connect my PayPal account and understand profile gaps so I can prepare reliable records for my CA.

## Acceptance criteria

- [x] User signs in with PayPal (sandbox) and the PayPal business account is connected
- [x] Profile saves GST status, GSTIN, LUT details, work type, purpose code
- [x] Health score (0–100) with at least: LUT status, purpose-code fit, GST threshold proximity
- [x] Each red flag shows the rule it comes from and a "verify with your CA" note

## Data & APIs used

users, profiles; Log in with PayPal; profile zod schemas; rules health evaluation.

## Edge cases

Unregistered users; expired LUT; incomplete profile; refused OAuth consent; disconnected sandbox account.

## India sandbox limitations

Confirmed on 2026-10-25 with two India business sandbox accounts ([findings](../paypal-sandbox-findings.md#log-in-with-paypal-separate-spike-2026-10-25)):
- **Log in with PayPal fails when the seller signs in to their own app.** `userinfo` returns HTTP 400 "Unable to fetch details to serve the request" when the signing-in account owns the client ID and secret. A different India business account signs in through the same app (2026-10-29), so sign-in needs an app owned by another PayPal account ([root cause](../paypal-sandbox-findings.md#root-cause-the-app-owner-cannot-sign-in-to-its-own-app-2026-10-29)).
- **Decision (2026-10-29): keep email sign-in and add Log in with PayPal through the existing app.** The app owner uses email sign-in; other PayPal accounts can use the PayPal button. Sign-in stores the payer ID and no PayPal tokens, and never links an existing account by email. The user confirmed successful product sign-in on 2026-10-30 after matching `PUBLIC_APP_URL` to the saved HTTPS tunnel callback.
- **How the seller's PayPal account is connected:** through the India seller's sandbox REST app credentials, supplied server-side by the user (`PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`). Invoicing, payments, refunds and disputes already work with these. This means one seller per deployment, which is enough for v1 and judge mode.
- Onboarding several sellers would need PayPal [Partner Referrals](https://developer.paypal.com/api/partner-referrals/v2/) (platform onboarding), which is out of scope for v1. The spike was blocked on 2026-10-29; the limitation and future plan are in [findings](../paypal-sandbox-findings.md#multi-seller-partner-referrals-limitation-and-future-work-2026-10-29).

## Test cases

- [Health rules](../../packages/rules/src/health.test.ts) cover LUT and turnover boundaries, scoring and citations; [purpose-code rules](../../packages/rules/src/purpose-codes.test.ts) cover mismatch flags.
- [Profile API](../../apps/api/src/routes/profile.test.ts), [health-check API](../../apps/api/src/routes/health-check.test.ts) and [profile storage](../../packages/db/src/storage.test.ts) cover saving, the demo score, authorization and encrypted storage.
- [Identity adapter](../../packages/paypal/src/rest/identity.test.ts), [auth routes](../../apps/api/src/routes/auth.test.ts) and [user storage](../../packages/db/src/storage.test.ts) cover payer-ID sign-in, state expiry/tampering, refused consent, email collisions, concurrent callbacks and PayPal failures. The user confirmed sign-in, profile persistence across sign-out and repeat login, health check, cancellation, app-owner failure guidance and email sign-up/sign-in; see [V02](../verification.md#v02-identity).

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
