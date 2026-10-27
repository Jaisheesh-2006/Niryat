# PayPal integration

Sandbox only. Use one India business seller and one US personal buyer created in the [Developer Dashboard](https://developer.paypal.com/dashboard/). Do not put their passwords, client secrets or access tokens in the repository. Phase 3 implements approved invoice actions and deterministic payment ingestion; automated checks use fakes rather than contacting PayPal.

| Feature                | API or tool                                            | Verify on India sandbox                                       |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| 01 Identity and health | Log in with PayPal; local profile/rules                | Identity connection and scopes                                |
| 02 Purpose code        | Curated bank/RBI table; AI suggestion                  | Seller's current purpose code visibility                      |
| 03 Export eligibility  | Pure rules                                             | No PayPal API needed                                          |
| 04 Invoicing           | REST Invoicing v2; Toolkit create_invoice/send_invoice | One-time, recurring series, partial payments, PDF attachments |
| 05 Payments            | Webhooks; Server SDK transaction search                | Gross, fees, net, FX and invoice links                        |
| 06 Refunds/disputes    | Server SDK refunds; webhook events; REST Disputes v1   | Refund and dispute test flows                                 |
| 07 FIRA                | User-uploaded PDF matched against payment ledger       | Own redacted India FIRA sample                                |
| 08 Monthly close       | Claude Agent SDK + PayPal Agent Toolkit                | Approved actions only                                         |
| 09 RBI reminders       | Toolkit send_invoice_reminder / Invoicing v2           | Reminder delivery                                             |
| 10 GSTR-1              | Rules over invoice/refund ledger                       | Reconciliation; no GST filing API                             |
| 11 Calendar            | Rules and invoice/dispute dates                        | Due-date availability                                         |
| 12 Dashboard           | PayPal ledger; AG Studio later                         | Transaction coverage                                          |
| 13 Advance tax         | Rules over receipts net of refunds                     | Receipt coverage; no filing API                               |

The [Server SDK](https://github.com/paypal/PayPal-TypeScript-Server-SDK) does not cover Invoicing/Disputes. The [Agent Toolkit](https://github.com/paypal/agent-toolkit) supplies future AI-facing actions; it is not the deterministic ledger adapter. The implemented REST client uses sandbox endpoints, caches OAuth tokens until five minutes before expiry, validates responses and retries transient failures once. Invoice create/send and series create/activate use stable per-action `PayPal-Request-Id` values and execute only after an owner-scoped approval claim. Created IDs survive retries. Disputes operations remain spec 06. See [architecture](architecture.md).

Subscribe to the following documented [webhook event names](https://developer.paypal.com/api/rest/webhooks/event-names/), confirming emitted events for the account and product on India sandbox:
- INVOICING.INVOICE.PAID
- PAYMENT.CAPTURE.COMPLETED
- PAYMENT.CAPTURE.REFUNDED
- PAYMENT.SALE.REFUNDED (if the selected payment flow uses sales)
- CUSTOMER.DISPUTE.CREATED
- CUSTOMER.DISPUTE.UPDATED
- CUSTOMER.DISPUTE.RESOLVED

`POST /webhooks/paypal` verifies signatures through PayPal's verify API before any payment write and rejects invalid signatures. Phase 3 handles `PAYMENT.CAPTURE.COMPLETED` and `INVOICING.INVOICE.PAID`; other verified events return `ignored` until their feature is implemented. Invoice-paid events contain `resource.invoice.payments.transactions[].payment_id`. Both paths call `recordCapture`, which reads the capture through the Server SDK and records only completed captures, copying gross, fee, net and available FX data. Capture `invoice_id` matches the stored PayPal invoice ID; unique transaction IDs prevent duplicate payments. Unmatched completed captures are retained without an invoice link. An invoice notification and a capture notification can describe the same economic payment.

`pnpm --filter @niryat/api sync:payments` searches the last seven days and processes payment event codes beginning `T00`, skipping known transaction IDs. The `niryat-sync` cron is configured for 02:00 IST; hosted operation is not yet verified. The user's P3-15 run (2026-10-27) returned `{"seen":3,"alreadyRecorded":1,"recorded":0,"skipped":2,"failed":0}` and retained one payment row. Skipped rows were not found as captures or were not completed; the summary does not identify which. See [verification V06](verification.md#v06-events-refunds-disputes-and-history).

For invoices, PLAN maps GSTIN to invoicer.tax_id, LUT text to detail.terms_and_conditions, notes to detail.note and numbering to detail.invoice_number. Verify attachments/partial-payment fields against [Invoicing v2](https://developer.paypal.com/docs/api/invoicing/v2/); link a PDF in the note when attachments are unavailable. Record India limitations in the relevant spec without dropping the whole feature.

## Development MCP

The [current official quickstart](https://developer.paypal.com/ai-tools/mcp-server) documents npx -y @paypal/mcp --tools=all. The editor configs run scripts/paypal-mcp.mts, which forces sandbox mode and prepares authentication before starting that exact command. No token belongs in committed configuration or command arguments.

### Automatic sandbox authentication

When you start the configured PayPal server in an editor, the launcher:
1. Uses a nonempty PAYPAL_ACCESS_TOKEN already inherited from the editor, preserving the working Codex flow.
2. Otherwise uses sandbox client credentials inherited from the editor, or reads only the needed PayPal fields from the repository-root private .env at runtime.
3. Exchanges PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET for a short-lived sandbox token. A token explicitly supplied in .env is also supported.
4. Starts the MCP server with the token, removing the client credentials and withholding unrelated file secrets from the child environment.

The launcher finds .env relative to its own source path, not the editor's working directory. The file needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET from the sandbox app. PAYPAL_ENVIRONMENT must be SANDBOX or omitted. Production is rejected. Tokens and credentials are never printed or saved. Authentication messages use stderr; stdout remains reserved for MCP protocol traffic.

Assistant tools do not inspect .env during development. Launcher tests inject fake file loaders and mock HTTP responses; pnpm verify does not load the private file or contact PayPal. The actual launcher reads it only when the user starts their MCP server. The API server, drizzle-kit and explicit `test:db` scripts load the root .env when present; ordinary `test` scripts and `pnpm verify` do not. No new dependency was introduced; Node's built-in [util.parseEnv](https://nodejs.org/docs/latest-v24.x/api/util.html#utilparseenvcontent) parses the local file.

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
