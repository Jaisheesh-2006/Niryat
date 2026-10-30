# PayPal integration

Sandbox only. Use one India business seller and one US personal buyer created in the [Developer Dashboard](https://developer.paypal.com/dashboard/). Do not put their passwords, client secrets or access tokens in the repository. Through Phase 4, Niryat implements approved invoice/refund actions, deterministic payment/refund ingestion and dispute polling; automated checks use fakes rather than contacting PayPal.

| Feature                | API or tool                                            | Verify on India sandbox                                           |
| ---------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| 01 Identity and health | Log in with PayPal; local profile/rules                | Complete: all login-plan browser checks user-confirmed 2026-10-30 |
| 02 Purpose code        | Curated bank/RBI table; AI suggestion                  | Seller's current purpose code visibility                          |
| 03 Export eligibility  | Pure rules                                             | No PayPal API needed                                              |
| 04 Invoicing           | REST Invoicing v2; Toolkit create_invoice/send_invoice | One-time, recurring series, partial payments, PDF attachments     |
| 05 Payments            | Webhooks; Server SDK transaction search                | Gross, fees, net, FX and invoice links                            |
| 06 Refunds/disputes    | Server SDK refunds; webhook events; REST Disputes v1   | Refund and dispute test flows                                     |
| 07 FIRA                | User-uploaded PDF matched against payment ledger       | Own redacted India FIRA sample                                    |
| 08 Monthly close       | Claude Agent SDK + PayPal Agent Toolkit                | Approved actions only                                             |
| 09 RBI reminders       | Toolkit send_invoice_reminder / Invoicing v2           | Reminder delivery                                                 |
| 10 GSTR-1              | Rules over invoice/refund ledger                       | Reconciliation; no GST filing API                                 |
| 11 Calendar            | Rules and invoice/dispute dates                        | Due-date availability                                             |
| 12 Dashboard           | PayPal ledger; AG Studio later                         | Transaction coverage                                              |
| 13 Advance tax         | Rules over receipts net of refunds                     | Receipt coverage; no filing API                                   |

The [Server SDK](https://github.com/paypal/PayPal-TypeScript-Server-SDK) does not cover Invoicing/Disputes. The [Agent Toolkit](https://github.com/paypal/agent-toolkit) supplies future AI-facing actions; it is not the deterministic ledger adapter. The implemented REST client uses sandbox endpoints, caches OAuth tokens until five minutes before expiry, validates responses and retries transient failures once. Invoice create/send and series create/activate use stable per-action `PayPal-Request-Id` values and execute only after an owner-scoped approval claim. Created IDs survive retries. Disputes are read through REST Disputes v1. See [architecture](architecture.md).

Niryat refund proposals validate ownership and the remaining refundable capture balance, then save an immutable `refund_payment` action. Only user approval executes the Server SDK refund call, using `<actionId>-refund` as its request ID. A completed result enters `recordRefundById`; a pending result finishes the action while a later notification or sync records the refund. Rejection sends nothing. The approved handler is the only application caller of `refundCapture`.

Subscribe to the following documented [webhook event names](https://developer.paypal.com/api/rest/webhooks/event-names/), confirming emitted events for the account and product on India sandbox:
- INVOICING.INVOICE.PAID
- PAYMENT.CAPTURE.COMPLETED
- PAYMENT.CAPTURE.REFUNDED
- PAYMENT.CAPTURE.REVERSED
- INVOICING.INVOICE.REFUNDED
- PAYMENT.SALE.REFUNDED (if the selected payment flow uses sales)
- CUSTOMER.DISPUTE.CREATED
- CUSTOMER.DISPUTE.UPDATED
- CUSTOMER.DISPUTE.RESOLVED

`POST /webhooks/paypal` verifies signatures through PayPal's verify API before any PayPal resource read or ledger write. Payment notifications (`PAYMENT.CAPTURE.COMPLETED`, `INVOICING.INVOICE.PAID`) converge on `recordCapture`; invoice-paid events contain `resource.invoice.payments.transactions[].payment_id`. The capture reader copies gross, fee, net and available FX data for `COMPLETED`, `PARTIALLY_REFUNDED` and `REFUNDED` captures. Capture `invoice_id` matches the stored PayPal invoice ID; unique transaction IDs prevent duplicate payments. Unmatched completed captures are retained without an invoice link.

Refund notifications (`PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`, `INVOICING.INVOICE.REFUNDED`) converge on `recordRefundById`. An invoice-refund notification identifies the invoice through `resource.id` or `resource.invoice.id`; `getInvoiceRefundIds` reads its current refund list through Invoicing v2, rather than depending on transaction-search indexing or using notification amounts. It selects `PAYPAL` transactions using the observed `recipient_transaction_id` or the documented `refund_id`, validates and deduplicates IDs, and excludes `EXTERNAL` refunds recorded manually. Each selected refund is read through the Server SDK and linked through its capture or PayPal invoice ID. Only completed refunds update the invoice and create the deduplicated task. Overlapping invoice/capture notifications and resends are safe.

If a refund is not found or not completed yet, the receiver returns HTTP 503 `refund_not_ready`, so PayPal retries. Resource-read, parse and storage failures return a sanitized HTTP 500; an invalid notification returns 400. The handler logs event types and outcome counts only. Other verified events return `ignored`. Subscribing to all events is useful for sandbox diagnosis, but unsupported types do not create ledger rows. See [invoicing events](https://developer.paypal.com/api/invoicing/webhooks/) and [delivery retries](https://developer.paypal.com/api/rest/webhooks/).

`pnpm --filter @niryat/api sync:payments` searches the last seven days and processes payment event codes beginning `T00`, skipping known payment IDs. It also processes `T1107` (payment refund) through `recordRefundById`, recovering refunds missed by webhooks. Fee reversals, fee refunds, dispute holds and other `T11` events are excluded; see [PayPal's T-code reference](https://developer.paypal.com/reports/reference/t-codes/). Known refunds are read again so a saved row whose task failed can recover; refund IDs and task dedupe keys prevent duplicates. The `payments` summary counts both payments and refunds. Per-row failures increment `failed` and make the command exit unsuccessfully, while later rows still run.

Run the command, refresh `/invoices` and `/tasks`, then run it again: the recovered refund must update the invoice and create one task, with no duplicates on the second run. PayPal's [Transaction Search specification](https://github.com/paypal/paypal-rest-api-specifications/blob/main/openapi/reporting_transactions_v1.json) allows up to three hours for executed transactions to appear. If the refund is not indexed yet, retry later; refunds outside the seven-day window are not recovered by this command. This recovers records only; it does not send refunds. Exact refund-delivery payload and HTTP-result evidence remain a separate P4-15 gate.

The same command polls disputes updated in the last seven days, follows validated pagination links and reads each dispute's detail through REST. `CUSTOMER.DISPUTE.CREATED`, `UPDATED` and `RESOLVED` notifications use the same `recordDispute` path. The record links through the first seller transaction/capture to its Niryat invoice; an unlinked record has no task or invoice alert. Older updates cannot overwrite newer state. `disputes.recorded` counts processed records, including replays; a nonzero count on repeated sync is expected and does not imply duplicate rows or tasks.

On 2026-10-30, the user confirmed dispute `PP-R-EWI-10195182` appeared on the invoice and Tasks after manual sync, and a further sync produced no duplicates. Its invoice is `2026-27/0005`, PayPal invoice `INV2-GLN9-7FXM-5NMM-PZ7N`. The supplied summaries progressed from one to two disputes, with both failure counters zero. Local `pnpm dev` has no scheduled sync; refresh the original invoice owner's pages after running it. Automatic dispute-webhook delivery remains unverified. See [verification V06](verification.md#v06-events-refunds-disputes-and-history).

For an already-issued refund whose PayPal ID is known, run `pnpm --filter @niryat/api sync:payments --refund-id <PayPal refund ID>`. This reads that refund directly and reuses `recordRefundById`, bypassing transaction search and dispute polling. It prints `{"refund":{"status":"recorded"}}` on success; missing or incomplete refunds print `not_found` or `not_completed` and exit unsuccessfully. Repeating it is safe: the same refund row is updated and its task remains unique. Invalid arguments are rejected before loading environment values or clients. The command never issues a refund.

The user verified direct recovery on 2026-10-29: the command returned `recorded` for the previously inspected refund, and the frontend reflected it. The user then verified a fresh seller-dashboard refund through `INVOICING.INVOICE.REFUNDED`, without sync or direct recovery: the invoice became Refunded, one task appeared, and resending the event created no duplicate refund or task. See [sandbox findings](paypal-sandbox-findings.md#invoice-refund-notification-support-2026-10-29). The raw event body and its exact resource-ID variant have not yet been saved; capture-refund delivery remains unverified for this flow.

The `niryat-sync` cron is configured for 02:00 IST; hosted operation is not yet verified. The user's P3-15 run (2026-10-27), before refund reconciliation, returned `{"seen":3,"alreadyRecorded":1,"recorded":0,"skipped":2,"failed":0}` and retained one payment row. Skipped rows were not found as captures or were not completed; the summary does not identify which. See [verification V06](verification.md#v06-events-refunds-disputes-and-history).

For invoices, PLAN maps GSTIN to invoicer.tax_id, LUT text to detail.terms_and_conditions, notes to detail.note and numbering to detail.invoice_number. Verify attachments/partial-payment fields against [Invoicing v2](https://developer.paypal.com/docs/api/invoicing/v2/); link a PDF in the note when attachments are unavailable. Record India limitations in the relevant spec without dropping the whole feature.

## Log in with PayPal

Email and PayPal sign-in both remain available. The login flow uses the same sandbox `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` as the seller integrations, with `openid email https://uri.paypal.com/services/paypalattributes`. Userinfo supplies the payer ID (user-confirmed 2026-10-30). The account that owns the app must use email sign-in because PayPal rejects its userinfo request; other accounts can use the PayPal button.

Login acceptance is complete (2026-10-30): the user verified PayPal login, profile saving, sign-out, repeat login retaining the profile, health check, cancelled consent, app-owner failure guidance and email sign-up/sign-in. See [V02](verification.md#v02-identity).

In Developer Dashboard → Apps & Credentials → Sandbox → the existing app → Log in with PayPal → Advanced Settings, enable PayPal account ID (payer ID) and set Return URL to `${PUBLIC_APP_URL}/api/auth/paypal/callback`. PayPal requires an [exact match](https://www.paypal.com/au/cshelp/article/how-do-i-set-a-redirect-url-for-the-paypal-identity-api-ts1995), including scheme, host, port and path. No new environment keys are needed.

The user could not save `http://localhost:3000/api/auth/paypal/callback` on 2026-10-30: the dashboard repeatedly returned a generic error ID. Its internal cause is unknown. Diagnostics also found the running app requesting `https://localhost:3000/api/auth/paypal/callback`, although the dev server serves only HTTP; HTTPS to that port fails with `ERR_SSL_WRONG_VERSION_NUMBER`. Changing the URL's scheme does not enable TLS.

For a reachable HTTPS development origin, use the already installed `cloudflared`:
1. With `corepack.cmd pnpm dev` running, start `cloudflared tunnel --url http://localhost:3000` in a separate terminal. This makes the web app publicly reachable while the tunnel is running; start it only when that exposure is intended. On Linux/macOS use `corepack pnpm` for pnpm commands.
2. Copy the printed HTTPS origin, such as `https://<assigned-host>.trycloudflare.com`. Set `PUBLIC_APP_URL` to that exact origin, without a path, in the shell used to restart `pnpm dev`. In PowerShell: `$env:PUBLIC_APP_URL = 'https://<assigned-host>.trycloudflare.com'`; on Linux/macOS: `export PUBLIC_APP_URL='https://<assigned-host>.trycloudflare.com'`. Shell values take precedence over the private file; no file edit is required.
3. Save `https://<assigned-host>.trycloudflare.com/api/auth/paypal/callback` as the same sandbox app's Return URL. Reopen the settings to confirm it persisted. If saving still fails, retain the error ID and timestamp for PayPal support; a Niryat code change cannot fix a dashboard save failure.
4. Visit `https://<assigned-host>.trycloudflare.com/login` and start sign-in there. Do not start on localhost and return to the tunnel hostname: the host-only state cookie would be missing. The tunnel must forward to the **web port 3000**, which proxies `/api/*` to the API, rather than directly to API port 3001.

For this local setup, keep `API_URL=http://localhost:3001` in your private configuration. It is the internal web-to-API address; `PUBLIC_APP_URL` is the public browser/callback origin. A stale tunnel in `API_URL` causes `ENOTFOUND` before the request reaches PayPal. With one `pnpm dev` running, both `http://localhost:3001/health` and `http://localhost:3000/api/health` must return `{"status":"ok"}`.

In development, the web config loads the shared root environment settings and allows only the hostname in `PUBLIC_APP_URL` through Next.js's `allowedDevOrigins`. Turbo preserves a shell override of that key. Restart `pnpm dev` after changing the origin. Without this allowlist, Next blocks tunnel-origin JavaScript with HTTP 403: the PayPal link still works, but client controls such as Save profile and Sign out cannot run. After fixing the origin, hard-refresh the tunnel page to load its scripts.

The [Cloudflare Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) hostname changes when the tunnel restarts; update both settings together. If another tunnel is used for existing webhooks, keep it running; changing a webhook registration is separate from setting this login callback. The user confirmed saving the HTTPS tunnel callback and successful product sign-in on 2026-10-30 after matching `PUBLIC_APP_URL` to that origin. PayPal's dashboard says to allow up to three hours for a Return URL change to take effect. First verify the running app sends the new callback, then begin a fresh login attempt rather than refreshing an old PayPal error URL.

Sign-in identifies a Niryat user; it grants no seller access. The server exchanges the code and reads userinfo, then discards the token. Accounts are matched by unique payer ID, never by email. An email collision directs the user to email sign-in. Seller operations still act on the app owner's account. See [V02](verification.md#v02-identity) for manual acceptance checks.

## Development MCP

The [current official quickstart](https://developer.paypal.com/ai-tools/mcp-server) documents npx -y @paypal/mcp --tools=all. The editor configs run scripts/paypal-mcp.mts, which forces sandbox mode and prepares authentication before starting that exact command. No token belongs in committed configuration or command arguments.

### Automatic sandbox authentication

When you start the configured PayPal server in an editor, the launcher:
1. Uses a nonempty PAYPAL_ACCESS_TOKEN already inherited from the editor, preserving the working Codex flow.
2. Otherwise uses sandbox client credentials inherited from the editor, or reads only the needed PayPal fields from the repository-root private .env at runtime.
3. Exchanges PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET for a short-lived sandbox token. A token explicitly supplied in .env is also supported.
4. Starts the MCP server with the token, removing the client credentials and withholding unrelated file secrets from the child environment.

The launcher finds .env relative to its own source path, not the editor's working directory. The file needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET from the sandbox app. PAYPAL_ENVIRONMENT must be SANDBOX or omitted. Production is rejected. Tokens and credentials are never printed or saved. Authentication messages use stderr; stdout remains reserved for MCP protocol traffic.

Assistant tools do not inspect .env during development. Launcher tests inject fake file loaders and mock HTTP responses; pnpm verify does not load the private file or contact PayPal. The actual launcher reads it only when the user starts their MCP server. The API server, Next development config, drizzle-kit and explicit `test:db` scripts load the root .env when present; ordinary `test` scripts, `pnpm verify` and the Next production build do not. Web config tests mock the file loader when testing development startup. No new dependency was introduced; Node's built-in [util.parseEnv](https://nodejs.org/docs/latest-v24.x/api/util.html#utilparseenvcontent) parses the local file.

### Check Claude Code

Start Claude Code in the repository, approve the project MCP configuration if prompted, and use /mcp. Select PayPal and reconnect/restart if it was previously failed. The .mcp.json entry no longer requires a parent token substitution. See [Claude MCP management](https://code.claude.com/docs/en/mcp).

### Check VS Code Copilot

In the Niryat workspace, use Ctrl+Shift+P ? MCP: List Servers ? paypal ? Restart Server (or Stop Server, then Start Server). If VS Code offers a reload for the changed configuration, accept it. No special VS Code launch terminal is required for local credentials anymore. In Copilot Chat, select Agent mode and enable PayPal tools through the tools picker. Use Show Output from the server actions for errors. See [VS Code MCP management](https://code.visualstudio.com/docs/agents/run/manage-mcp-servers).

Restart the MCP server to request a fresh token from local client credentials after expiry. If you deliberately supply a token yourself, refresh that token when it expires. Live connections require user-side confirmation; no business action is performed merely to test authentication.

### Optional client launch helper

The earlier explicit helper remains supported from the repository root:

```powershell
node --env-file=.env scripts/start-codex-paypal.mts
node --env-file=.env scripts/start-codex-paypal.mts claude
node --env-file=.env scripts/start-codex-paypal.mts vscode
```

It obtains a token and launches the chosen client with it. The default remains Codex. For a fresh VS Code process using this optional method, fully close its existing windows first. These helpers target Claude Code and VS Code Copilot, not Claude Desktop or the standalone Copilot CLI.

Every PayPal MCP business action still needs explicit user approval. Live editor checks and India-specific capabilities remain in [verification](verification.md).
