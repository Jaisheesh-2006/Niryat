# Verification remaining outside the scaffold

Ordinary automated checks require no credentials; explicit database integration suites use a separate test database. The entries below distinguish user-confirmed sandbox evidence from remaining account, deployment and source-review checks.

## V01 PayPal documentation migration

TODO(verify): Confirm the retired prompt URL's replacement with PayPal; configurations use the exact local command from the [current official quickstart](https://developer.paypal.com/ai-tools/mcp-server). The original docs.paypal.ai URL returned 404.

## V02 Identity

**Complete (2026-10-30): implementation, automated verification and all five login-plan browser checks passed.** Browser outcomes are user-confirmed. [PayPal identity docs](https://developer.paypal.com/docs/log-in-with-paypal/).

Automated verification (2026-10-30): `pnpm db:generate`, `pnpm db:migrate`, `pnpm build` and `pnpm verify` passed. The separate DB and API `test:db` suites passed all 125 and 274 tests respectively, with none skipped. Ordinary credential-free verification completed all 27 package tasks. Docker Desktop was started to make the existing local `niryat-pg` available; no database was recreated. Existing hackathon-rules whitespace was normalized to unblock Biome, with no text changes. Automated identity tests use fake HTTP responses and do not contact PayPal.

The 2026-10-25 spike's business-account failure was traced to signing in as the app owner, not the account's country or type. A different India business account succeeded through the same app on 2026-10-29. The user's 2026-10-30 rerun with the `paypalattributes` scope returned code exchange HTTP 200, refresh HTTP 200 and userinfo HTTP 200 (debug ID `f53869466f982`), with payer ID and email present. Missing `id_token` is expected; the implementation uses server-side userinfo and retains no token. Email sign-in remains available for the app owner. See [findings](paypal-sandbox-findings.md#login-identifier-check-2026-10-30).

Callback follow-up (2026-10-30): the user confirmed saving the HTTPS tunnel URL. The running app initially still requested HTTPS localhost; after the development process restarted, both the API and web proxy requested the matching tunnel callback. Checks through the approved tunnel returned HTTP 200 for `/login` and `/api/health`; `/api/auth/paypal/start` returned 302 with the exact tunnel callback and a signed state cookie, without following the redirect to PayPal. The user's dashboard screenshot states that Return URL changes may take up to three hours. The subsequent successful user sign-in and acceptance checks are recorded below.

Successful sign-in (2026-10-30), user-confirmed: setting `PUBLIC_APP_URL` to the saved HTTPS tunnel origin made product login work. The assistant did not read or edit the private environment file. This confirms the core sign-in criterion, which is ticked in spec 01 and PLAN. It does not establish whether PayPal propagation contributed to the earlier failure.

Profile/sign-out regression (2026-10-30): the user reported that both controls failed through the tunnel. HTTP diagnostics reproduced Next returning 403 for JavaScript requests carrying the tunnel Origin, preventing the client handlers from running. The fix loads shared root settings only in Next development, allows the exact `PUBLIC_APP_URL` hostname through `allowedDevOrigins` and passes shell overrides through Turbo. After restarting dev, all 20 script files on the tunnel login page returned 200; a different origin still returned 403. Web tests passed 112/112; the targeted API auth/profile integration suites passed 36/36 with none skipped; `pnpm verify` passed all 27 tasks and `pnpm build` passed. No user profile was changed during testing. A subsequent proxy failure used an obsolete API tunnel hostname; manual correction instructions set `API_URL` to the local API while retaining the public callback origin. Following those instructions, the user confirmed login, profile saving, sign-out, repeat login with the saved profile retained, and a working `/health-check`. These browser regression checks are passed.

Manual setup and checks: **all passed, user-confirmed 2026-10-30**. These steps remain as the repeatable acceptance procedure:
1. Follow the [HTTPS development setup](paypal.md#log-in-with-paypal). The dashboard repeatedly failed to save the HTTP localhost callback (user-reported 2026-10-30); the effective HTTPS localhost callback was also unusable against the HTTP dev server. Use a reachable HTTPS origin and save `${PUBLIC_APP_URL}/api/auth/paypal/callback` under Log in with PayPal → Advanced Settings. Keep PayPal account ID (payer ID) enabled. Confirm that the exact Return URL persists after reopening the settings.
2. With `DATABASE_URL`, `ENCRYPTION_KEY`, `SESSION_SECRET` and the existing sandbox PayPal keys configured privately, run `corepack.cmd pnpm db:migrate`, then `corepack.cmd pnpm dev`. On Linux/macOS use `corepack pnpm` instead.
3. Visit `${PUBLIC_APP_URL}/login` on the same HTTPS origin as the callback, click **Log in with PayPal** and use a sandbox account that does not own the app, whose email is not already registered in Niryat. Expected: signed in at `/profile` on that origin. Save a profile, sign out, and repeat PayPal sign-in. Expected: the same saved profile.
4. Start again and cancel on PayPal. Expected: `/login` with the cancelled message. Then try the app owner's PayPal account. Expected: `/login` with the message explaining that the deployment owner should use email sign-in.
5. Confirm email sign-up and sign-in still work. Email-collision handling is covered by the automated auth and storage tests.

Final user confirmation (2026-10-30): cancelled consent returns the expected cancellation message, the app-owner failure shows email-sign-in guidance, and email sign-up/sign-in work. Together with the confirmed login, saved-profile persistence, sign-out and health check, this completes [the login implementation plan](../login-implementation-plan.md). No login acceptance item remains open. The one-seller-per-deployment limitation, app-owner email fallback and development tunnel requirements remain documented in [PayPal setup](paypal.md#log-in-with-paypal).

## V03 Invoicing and reminders

**P5-13 accepted (2026-10-31), with the evidence limits below.** The user performed browser/PayPal actions and supplied screenshots and terminal/tool logs. The temporary `logs.md` was subsequently deleted by the user; the outcomes are retained here. The assistant did not initiate PayPal, Claude, Render or storage calls for acceptance.

Earlier evidence: the 2026-10-25 spike established India-to-US create/send/pay/remind, including HTTP 204 for that spike's reminder. P3-15 (2026-10-27) confirmed the GST PDF, blocked India recipient, approved one-time send, matching number/LUT/PDF link and recorded payment. The synthetic `invoicer.tax_id` draft read-back was verified separately on 2026-10-26; see [findings](paypal-sandbox-findings.md#invoicer-tax-id-2026-10-26).

P5-13 outcomes:

| Check                             | User-observed result                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extraction and confirmation       | Source quotes beside fields; no save before submission; Use these values prefills forms with export answers and SAC left to the user; existing Acme client matches; Discard creates no client/invoice/action. All checks explicitly confirmed.                                                                                                                                                |
| Amount regressions                | Positive `- a $1,500` and `- us $1,500` yield 1500; negative `-$1,500` and `- $1,500` do not become positive amounts. User-confirmed.                                                                                                                                                                                                                                                         |
| Fresh-account numbering and sends | Existing seller invoices used 0001–0005. The fresh Niryat account issued 2026-27/0006 (USD 1500), 0007 (USD 100), then 0008 (USD 50), and approved sends reached the buyer. The allocator now locks/allocates by shared seller financial year across users in this database; manual PayPal numbers outside the database are not reserved. Recurring-cycle numbering remains open in V04.      |
| Deadline and scheduled path       | Deadline 2027-07-31. API CLI fallback with `--as-of 2027-06-16` showed 45 days remaining, stage 60 and an approval list with Claude's advice. `--as-of 2027-07-01` showed stage 30. This was not a Workflows-dev or hosted-cron execution.                                                                                                                                                    |
| Approved reminder                 | Invoice 0006's stage-60 standard reminder was approved. UI: `Reminder request accepted by PayPal.` Request preview: exactly `{ "send_to_invoicer": false, "send_to_recipient": true }`; no subject/note.                                                                                                                                                                                      |
| Delivery evidence                 | The selected US buyer's sandbox notification list showed `Reminder from Ananya Rao (2026-27/0006)` at 1:08 p.m. on 2026-10-31 as displayed, followed by its payment notification at 1:56 p.m. This verifies a sandbox inbox notification and its subject, not external email delivery or message-body wording.                                                                                |
| Dedupe and rejection              | Rerunning the same stage created no duplicate. Invoice 0007's stage-60 proposal was rejected and stayed rejected; its later stage-30 proposal is a different permitted key.                                                                                                                                                                                                                   |
| Paid-invoice check                | After the user paid 0006, the later close excluded it from candidates. The current user's sync showed no new payment and the client history already showed one paid invoice. It is not established whether a webhook or an earlier user's pass in the all-user CLI recorded it. This verifies exclusion of an already recorded payment, not the alternative live-paid/stale-ledger hold path. |
| Manual close                      | Completed current-October summary matched invoice-page figures: one payment, USD 1500.00 gross, 69.38 fees, 1430.62 net, no refunds, FIRA not due for the in-progress month. Two-tab concurrency showed `A close is already running…`.                                                                                                                                                        |
| Budget fallback                   | With a budget of 0.000001, extraction showed the budget message; close logged `budget_exhausted` and proposed the standard stage-60 reminder for 0008 with `agent: null`. No approval was supplied. User restored the budget to 5 afterwards.                                                                                                                                                 |
| Credential-free exit              | User moved `.env` outside the repository, ran `pnpm verify --force`: 27 successful tasks, zero cached. API logged `Auth disabled: DATABASE_URL not set` and listened on 3001. `/health` returned `{"status":"ok"}` and `/purpose-codes` returned HTTP 200. User confirmed restoration and normal startup.                                                                                     |

### Revised dispute-hold test

The original instruction to dispute an unpaid invoice was replaced, at the user's request, with a sandbox client-level scenario: dispute an existing completed sandbox payment, then investigate a different unpaid invoice for the same client. No real-money payment was needed. This revision does not claim a dispute can be opened on an unpaid invoice.

The user opened case `PP-R-YDW-10195418` on invoice 2026-27/0006's USD 1500 payment. An initial sync saw two disputes and no linked task; a later sync saw three, with zero failures, and created the invoice's dispute task due 2026-11-20. Discovery on a later poll is observed; API indexing delay versus webhook delivery is not conclusively diagnosed.

The scheduled CLI run at `asOf=2027-07-01` completed all seven users without failure. The current user's 17-call log showed: system syncs; one new stage-30 candidate (0008); `paypal_get_invoice` before drafting (one-item/byte summary, no raw PayPal body); the open-dispute read; client history with one open dispute; `propose_reminder` with `advice: hold`; `suggest_task` of kind `review_dispute`; summary; `claude.status: used`; persisted hold proposal; one created suggested task. The final screenshots confirm both the 0008 stage-30 hold and a separate `Suggested by Claude` task for the case on 0006. The older 0008 stage-60 no-advice proposal remains immutable and pending. Neither was approved for this test.

### Remaining limits

- This P5-13 reminder's raw HTTP status was not captured in API history. The UI result and separate sandbox notification establish the observed outcome; do not substitute the older spike's 204 as this run's response or resend just to capture it.
- The historical P5-7 draft-create HTTP 422 `UNPROCESSABLE_ENTITY` had no detailed issue/description. The shared-seller numbering collision was a separately reproduced bug and fixed; neither the fix nor later successful sends diagnoses that historical response.
- Claude's hold reason said the client paid "today", although the run's simulated `asOf` is 2027-07-01 and the stored payment date is 2026-10-31. The open dispute supports reviewing the reminder, but that phrase does not establish payment in progress. Model advice is advisory; simulated dates do not rewind PayPal data. This wording limitation remains open.
- `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` warnings were nonfatal. Bare allowed tools can bypass the redundant SDK callback; wrappers still validate/audit calls and expose no write/approval tools. Do not describe the callback as an always-executed gate. See [ADR 0005](decisions/0005-agent-boundary.md).
- Root combined `pnpm dev` failed to bring up a reachable API during this run; the exact cause remains unconfirmed. Separate API/web terminals worked, including the credential-free API check. This is a workaround, not a diagnosed Turbo fix.
- Hosted webhooks, cron/Workflows registration, freshness and restart recovery remain [Phase 7 checks](build-flow.md#phase-7-judge-mode-hosting-and-freeze-nov-58). Phase 4 real-FIRA and refund-payload evidence remain open separately.

Automated close-out (2026-10-31): `pnpm format` passed; `pnpm verify` passed all 27 package tasks (27 cached) plus fresh script/scaffold checks; `pnpm build` passed all nine tasks (five cached, four executed, including the production Next build). The separate DB suite executed 153/153 tests and the API suite 488/488, with none skipped. Their `test:db` wrappers load the private root environment file, so the equivalent suites were run directly with `corepack pnpm --filter @niryat/db exec vitest run --no-file-parallelism` and the corresponding `@niryat/api` command, inheriting only a task-specific `TEST_DATABASE_URL` for a disposable Postgres 17 container. No application database was used or reset; the test container was removed afterwards. The ordinary verification's cached DB-dependent skips are not the integration result. All 186 local Markdown link targets checked in the changed documentation exist; README and AGENTS remain below their line limits. Acceptance maps are in [spec 04](specs/04-export-invoicing.md#test-cases), [spec 08](specs/08-monthly-close.md#test-cases) and [spec 09](specs/09-rbi-deadlines.md#test-cases). No commit or deployment was made.

Storage timeout regression (2026-10-31): the shared S3 adapter now aborts requests after one 15-second deadline, retained across retries and GET body consumption. All 14 storage tests passed with fake fetch. A separate PostgreSQL integration test observed another user's invoice waiting on the shared numbering lock, aborted the first upload, verified its safe HTTP 503 and rollback, and issued number 0001 to the waiting user with no PayPal call. `pnpm format`, API type checking and `pnpm verify` (27 successful tasks) passed. The full API suite (`corepack pnpm --filter @niryat/api test --no-file-parallelism`) then executed 495/495 tests, none skipped, using only a task-specific `TEST_DATABASE_URL` for a disposable Postgres 17 container; the application database was untouched. No live object-storage or hosted-load check was performed; storage waits can still last until the deadline.

## V04 Recurring invoices

TODO(verify): Confirm recurring-series creation/activation for India; document account limitations. [PayPal Agent Toolkit](https://github.com/paypal/agent-toolkit).

Sandbox result (2026-10-25): `POST /v2/invoicing/recurring-invoices` plus `/activate` works; the series reads back `ACTIVE`. See [findings](paypal-sandbox-findings.md).

P3-1 follow-up (2026-10-26): a series request accepted `recurring_info.detail.invoice_number` but omitted it on read-back. Generated-cycle numbering and a reliable generated-invoice ID link were not established. In the P3-15 user screenshot (2026-10-27), the monthly series is Active, its first listed invoice is `2026-27/0002` (Due), and its next occurrence is 2026-11-27. This is evidence for the first listed invoice only. Future-cycle numbering and adoption into Niryat remain unverified; the application currently stores the series ID without fetching generated invoice IDs. Leave the consecutive-numbering criterion open. See [spec 04 limitations](specs/04-export-invoicing.md#india-sandbox-limitations).

## V05 Partial payments and attachments

TODO(verify): Confirm India partial-payment settings and PDF attachment support, using a note link as the documented fallback. [Invoicing v2](https://developer.paypal.com/docs/api/invoicing/v2/).

Sandbox result (2026-10-25): partial payments are rejected ("not available in your country"). Attachments have no upload endpoint and store unvalidated references only, so use the note link. See [findings](paypal-sandbox-findings.md).

## V06 Events, refunds, disputes and history

Fresh credential-free follow-up (2026-10-31), user-confirmed during P5-13: with `.env` outside the repository, `pnpm verify --force` passed all 27 tasks with zero cached; the standalone API reported auth disabled because `DATABASE_URL` was absent, listened on 3001, and served `/health` (`{"status":"ok"}`) and `/purpose-codes` (HTTP 200). The user restored configuration afterwards. This supplies the fresh no-credentials API evidence carried from P4-15; it does not resolve the combined `pnpm dev` launch problem or the refund/FIRA evidence below.

Remaining: save the actual refund-delivery body and HTTP result, verify automatic dispute-event delivery and a PayPal-decided lost outcome, and check FX on a flow that converts currency. [Webhook events](https://developer.paypal.com/api/rest/webhooks/event-names/), [Disputes testing](https://developer.paypal.com/docs/disputes/test-go-live/).

Sandbox result (2026-10-25): fee and net are verified, from both the capture and transaction search, with no FX on a USD balance. A buyer-opened dispute (`PP-R-TBU-10194472`) is listed and readable through the Disputes API. A refund webhook was delivered. No `CUSTOMER.DISPUTE.CREATED` event appeared for that dispute, although the webhook is subscribed. The dispute event remains open. See [findings](paypal-sandbox-findings.md#disputes-and-webhooks-2026-10-25).

Webhook signature verification works via the verify API (2026-10-27). The user confirmed that the paid one-time invoice became Paid through the webhook, with gross, fee and net shown in one payment row. Later CLI reconciliation returned `{"seen":3,"alreadyRecorded":1,"recorded":0,"skipped":2,"failed":0}`. It found the recorded payment without inserting another, and the user screenshot shows the invoice still Paid with one payment row. The skipped counter combines captures not found and captures not completed; the two rows' individual reasons were not inspected. The optional scratch-database webhook-miss test was skipped; [sync integration tests](../apps/api/src/sync.test.ts) cover backfill and deduplication. Hosted cron execution remains a deployment check.

Credential-free checks (2026-10-27), user-confirmed: `pnpm verify --force` with `.env` unavailable completed all 27 tasks with zero cached and exit code 0; `/health` returned `ok` and `/purpose-codes` returned the catalogue. The separate database integration runs passed DB 81/81 and API 136/136 with no skipped tests. Local production build also passed.

P4-1 evidence (2026-10-27): [refund and dispute shapes](paypal-sandbox-findings.md#refund-and-dispute-shapes-2026-10-27) distinguishes the documented refund fallback from observed dispute detail/list responses. The invoice-refund follow-up (2026-10-29) records an actual `INVOICING.INVOICE.REFUNDED` API log with `recorded: 1`, `not_completed: 0`, `not_found: 0`, plus user-confirmed automatic ledger/task updates and replay deduplication. Its raw payload, exact resource-ID variant and HTTP delivery result have not been supplied; `.tmp/paypal/refund-event.json` was absent at close-out. The strict P4-15 payload-evidence gate remains open.

P4-15 user verification (2026-10-30): steps 2 and 3 passed as specified. The Niryat-approved partial refund changed the invoice to Partly refunded, copied PayPal's fee/net, displayed the remaining received/shortfall values, bank message and credit-note deadline, and created a refund task. The remaining seller-dashboard refund changed it to Refunded and added the second refund/task. This confirmation establishes the visible results; it does not supply the missing webhook payload evidence.

Steps 4 and 5 are also user-confirmed (2026-10-30). The buyer-opened dispute `PP-R-EWI-10195182` appeared after manual sync. A read-only local DB check found it linked through seller capture `3PM27068GN698204T` to invoice `2026-27/0005` / `INV2-GLN9-7FXM-5NMM-PZ7N`, status `WAITING_FOR_SELLER_RESPONSE`, stage `INQUIRY`, with one open `dispute_opened` task owned by the invoice's user. The dispute and task were inserted at approximately 01:12:38 IST. The buyer transaction ID in the screenshot differs from the seller capture ID; linking uses the latter.

The two supplied sync summaries were:

```jsonl
{"payments":{"seen":11,"alreadyRecorded":9,"recorded":1,"skipped":1,"failed":0},"disputes":{"seen":1,"recorded":1,"notFound":0,"failed":0}}
{"payments":{"seen":11,"alreadyRecorded":10,"recorded":0,"skipped":1,"failed":0},"disputes":{"seen":2,"recorded":2,"notFound":0,"failed":0}}
```

The user subsequently confirmed another sync and no duplicate dispute/task. `disputes.recorded` includes processed replays, so it need not become zero. The extra discovered dispute explains the changing count; automatic dispute-webhook delivery was not demonstrated. Local `pnpm dev` does not run the hosted cron. Lost-dispute outcomes remain covered by [rule tests](../packages/rules/src/realisation.test.ts) rather than an on-demand sandbox decision.

P4-15 automated close-out (2026-10-30): `pnpm format`, `pnpm build` and `pnpm verify --force` passed; verification completed all 27 package tasks with zero cached. The separate DB and API `test:db` suites executed all 119 and 258 tests respectively, with none skipped. The credential-free API tests still passed for `/health` and `/purpose-codes`; the Phase 3 user-confirmed no-`.env` startup check above was not repeated with the file unavailable. The only application call to `refundCapture` remains the approved `refund_payment` handler. YAML names eight implemented rule functions, including `creditNoteFor` and `realisationFor`, with four remaining `TODO` rules. Spec/PLAN checkbox parity passes the scaffold check.

## V07 FIRA sample

P4-2 result (2026-10-27): real-sample verification deferred. The user has no real PayPal India FIRA available and no contact who can supply a consented sample. A public search did not locate a verifiable issued PayPal India FIRA; PayPal's [download walkthrough](https://www.paypal.com/in/brc/article/paypal-monthly-digital-firc) shows dashboard screens, and its [sample request letter](https://www.paypalobjects.com/webstatic/en_IN/mktg/pdf/Sample-FIRC-Request-Letter.pdf) is an application form, not an issued advice. The user reports sending PayPal support a request for an anonymised specimen PDF and field/reference clarification; a response is pending.

At the user's request, a synthetic PDF was created at the git-ignored `.tmp/fira/fira-sample.pdf`, and the user approved reading it. It contains invented data only and is visibly marked `SYNTHETIC TEST FIXTURE - NOT BANK ISSUED`. It is not a redacted real FIRA. Its one-page rendering and text extraction were checked; it has a selectable text layer and four table rows, one per invented remittance.

The following describes **only the synthetic fixture**, not a verified PayPal format. No personal or transaction values are reproduced here.

| Field            | Label and format                                               | Position                     |
| ---------------- | -------------------------------------------------------------- | ---------------------------- |
| Issuer           | `Issuer:` followed by a fictional bank name                    | Below the title              |
| Title            | `Foreign Inward Remittance Advice (FIRA)`                      | Above the issuer             |
| Statement period | `Statement period:`; `DD-Mmm-YYYY to DD-Mmm-YYYY`              | Below the issuer             |
| Date             | `Date`; `DD-Mmm-YYYY`, English three-letter month              | Table column 2, after `Line` |
| Foreign amount   | `Foreign amount`; comma grouping and two decimal places        | Table column 3               |
| Currency         | `Currency`; three uppercase letters                            | Table column 4               |
| Reference        | `Remittance reference`; `SYNTHETIC-REF-<three-digit sequence>` | Table column 5               |
| Purpose code     | `Purpose code`; `P` followed by four digits                    | Table column 6               |
| INR / FX         | `INR / FX`; `Not shown`, with no INR amount or exchange rate   | Table column 7               |

The synthetic references are fixture identifiers, not PayPal transaction IDs or bank references. The real issuer/title, period format, line count/layout, field labels/formats/positions, reference semantics and INR/FX presence remain unverified. Neither the no-text-layer nor the INR-only stop condition can be assessed for a real FIRA yet. Do not use this fixture as evidence of real-document compatibility or as the verified layout for P4-11.

The user confirmed on 2026-10-27 that this V07 entry contains no personal values. The documentation, privacy review and synthetic-fixture checks are complete.

Parsed by Niryat (2026-10-30), synthetic fixture only: the user confirmed P4-15 step 6 passed. The demo seed produced the expected exact matches, first-line suggestion and flagged final line. The FIRA page showed extracted fields beside source text, the user confirmed the uncertain match, invoice FIRA statuses updated and uploading the same PDF again produced the duplicate message. This verifies the synthetic UI/matching flow; it does not verify a real PayPal layout.

Deferred: inspect a consented real FIRA or an official anonymised specimen when available and record its layout separately. P4-2's original real-layout acceptance gate, spec 07's real-FIRA parser criterion, PLAN section 21's own-redacted-FIRA item and the corresponding Phase 4 exit gate remain open.

## V08 Purpose-code catalogue

TODO(verify): Review current service codes and bank confirmation requirements before populating the catalogue. [RBI](https://www.rbi.org.in/), [PayPal India purpose codes](https://www.paypal.com/in/cshelp/article/what-is-a-purpose-code-help231).

Catalogue (2026-10-25): the 14 PayPal India codes with Annex I descriptions are in packages/rules/src/purpose-codes.ts; the bank still assigns the final code.

## V09 Rules review

TODO(verify): Have a CA verify all twelve [planned rules](rules-sources.md), statutory exceptions, primary citations and effective dates, especially the conflicting RBI realisation period and Income-tax Act 2025 references. [CBIC](https://taxinformation.cbic.gov.in/), [RBI notifications](https://www.rbi.org.in/Scripts/NotificationUser.aspx), [Income Tax Department](https://www.incometax.gov.in/iec/foportal/).

Source check (2026-10-25): all twelve rules were checked against primary text (CBIC, RBI, e-Gazette). Citations and effective dates are recorded in [rules sources](rules-sources.md) and the rules YAML.
- The RBI realisation-period conflict is resolved: 9 months from the invoice date, under FEMA 23(R)/2026-RB as amended, from 2026-10-01.
- Income-tax Act 2025 s. 58 and s. 408 are confirmed.
- Purpose codes: the 2012 Annex I, its Circ. 50 (2016) amendment and PayPal India's 14-code list are checked; see [rules sources](rules-sources.md#rbi--fema).
- Still open: which realisation period applies to invoices dated 2025-11-14 to 2026-06-04, and the GSTR-1 JSON format.
- All twelve rules carry `review: source_checked`. No CA review is planned for the hackathon; it is a disclosed limitation (PLAN section 23).

## V10 GSTR-1 format

TODO(verify): Confirm the currently accepted Table 6A service-export CSV/JSON format against the [GST offline utilities](https://www.gst.gov.in/download/offlineutilities).

## V11 Hosted resources

**Defined locally; hosted verification pending (2026-10-31).** `render.yaml` defines `niryat-worker` with task `monthlyClose`, a `niryat-monthly-close` cron (`30 1 1 * *` UTC), and nightly `niryat-sync` (`30 20 * * *` UTC). The trigger dispatches `niryat-worker/monthlyClose`; hosted task registration and cron execution have not been observed. Worker/trigger tests use fakes.

P5-13 used the allowed API CLI fallback, not Workflows dev: `corepack pnpm --filter @niryat/api close:run --as-of 2027-06-16` and `--as-of 2027-07-01`. On Windows use `corepack.cmd`; do not insert an extra `--` before API CLI options. Runs showed `Monthly close (scheduled)`, the simulated date, advice and approval lists. The latter completed seven users with zero failures. This verifies local scheduled orchestration, not a deployed scheduler.

For Workflows dev, start `render workflows dev -- corepack pnpm --filter @niryat/worker start`, then set `RENDER_USE_LOCAL_DEV=true` in the trigger terminal and run `corepack pnpm --filter @niryat/worker trigger:monthly-close -- --as-of 2027-07-01`. The worker trigger accepts the separator; the API fallback does not. This optional path remains unverified.

Before exposing the hosted demo, deploy in an authorized account, register the task, observe both cron paths, confirm paid Postgres retention/budget through judging and complete the four [Phase 7 reliability checks](build-flow.md#phase-7-judge-mode-hosting-and-freeze-nov-58): HTTPS webhook delivery/recovery, measured reconciliation freshness without routine user commands, last-success/stale-data UI, and safe job recovery after restart. Never reset/replay a claimed reminder during recovery. [Blueprint reference](https://render.com/docs/blueprint-spec), [Workflows](https://render.com/docs/workflows).

## V12 Authenticated MCP

TODO(verify): Run authenticated PayPal MCP smoke checks in Claude Code, Codex and VS Code using an environment-supplied sandbox token, and check Context7 access/rate limits. [PayPal quickstart](https://developer.paypal.com/ai-tools/mcp-server), [Context7](https://github.com/upstash/context7).

## V13 Live Claude hooks

TODO(verify): Confirm the checked-in hooks in an installed Claude Code session on Windows and Linux; local subprocess checks cover their logic. [Claude hooks](https://code.claude.com/docs/en/hooks).

## V14 Hosted CI / Linux

TODO(verify): Observe the first GitHub Actions run on both Windows and Linux. Local verification here runs on Windows; the workflow covers clean frozen installs, checks, builds and secret scanning. [GitHub Actions](https://docs.github.com/en/actions).

## V15 Sponsor licences

TODO(verify): Obtain AG Studio and Bryntum licences on/after Nov 1, 2026 and confirm coverage through Dec 15 judging before installing either package. [Sponsor requirements in PLAN](PLAN.md#12-sponsor-tools).
