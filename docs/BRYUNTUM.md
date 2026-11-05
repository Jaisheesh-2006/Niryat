# Bryntum: A1/A2 change record

Recorded 2026-11-04. Scope: [A1 and A2](IMPROVEMENTS.md#a1-security-quick-fixes-p0) only. This file retains the existing `BRYUNTUM.md` filename.

## A1: shared security headers

[Next configuration](../apps/web/next.config.ts) applies four security headers to every web path, including `/calendar`. The content security policy contains only `frame-ancestors 'none'`; it adds no script or style restrictions. This follows A1's requirement to keep Bryntum's injected styles outside a new restrictive policy. See [Render's A1 entry](RENDER.md#a1-production-mode-and-security-headers) for the exact headers and source tests.

## A2: shared API protection

A2 adds limits to authentication, AI and reserved sharing POST routes. `GET /calendar` is outside those rate-limit groups. The [Render record](RENDER.md#a2-rate-limits-and-client-ip-trust) documents the client-IP trust fix and private web-to-API connection used by the shared application.

## Verification and pending checks

A1's recorded web suite passed 362 tests. After A2's review fix, the web suite passed 363 tests; `pnpm verify` passed all 27 tasks and `pnpm build` passed all nine tasks. These checks include the existing calendar tests and compilation, not a live Bryntum browser check. See [validation details](RENDER.md#recorded-automated-validation) for the existing database-test skips.

Browser verification is pending. Follow the [manual checks](RENDER.md#manual-checks-awaiting-user-verification), then open `/calendar` with an existing signed-in account containing calendar data. Expect the existing calendar and list to render; switch between the existing month/list views and inspect the document response headers. Licence/trial dates and judging coverage remain unverified in [V15](verification.md#v15-sponsor-licences).
