# PayPal integration

Sandbox only. Use one India business seller and one US personal buyer created in the [Developer Dashboard](https://developer.paypal.com/dashboard/). Do not put their passwords, client secrets or access tokens in the repository. No real calls are made by this scaffold.

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

The [Server SDK](https://github.com/paypal/PayPal-TypeScript-Server-SDK) does not cover Invoicing/Disputes. The [Agent Toolkit](https://github.com/paypal/agent-toolkit) supplies AI-facing actions; it is not the deterministic ledger adapter. The typed REST interface is a placeholder with no implementation. See [architecture](architecture.md).

Subscribe to the following documented [webhook event names](https://developer.paypal.com/api/rest/webhooks/event-names/), confirming emitted events for the account and product on India sandbox:
- INVOICING.INVOICE.PAID
- PAYMENT.CAPTURE.COMPLETED
- PAYMENT.CAPTURE.REFUNDED
- PAYMENT.SALE.REFUNDED (if the selected payment flow uses sales)
- CUSTOMER.DISPUTE.CREATED
- CUSTOMER.DISPUTE.UPDATED
- CUSTOMER.DISPUTE.RESOLVED

Signature verification currently fails closed. Future ingestion must verify signatures before storage, deduplicate by event/transaction IDs, handle out-of-order events and reconcile nightly. An invoice notification and a capture notification can describe the same economic payment.

For invoices, PLAN maps GSTIN to invoicer.tax_id, LUT text to detail.terms_and_conditions, notes to detail.note and numbering to detail.invoice_number. Verify attachments/partial-payment fields against [Invoicing v2](https://developer.paypal.com/docs/api/invoicing/v2/); link a PDF in the note when attachments are unavailable. Record India limitations in the relevant spec without dropping the whole feature.

## Development MCP

The prompt's [old quickstart URL](https://docs.paypal.ai/developer/tools/ai/mcp-quickstart) returns 404. The [current official quickstart](https://developer.paypal.com/ai-tools/mcp-server) documents npx -y @paypal/mcp --tools=all. The three editor configs use a cross-platform Node launcher for that exact command, inherit PAYPAL_ACCESS_TOKEN, and force PAYPAL_ENVIRONMENT=SANDBOX. Export a sandbox access token in the editor's parent environment; tokens expire and are not the client secret. Never put a token in command arguments or config files.

These are coding-assistant tools, not the application's queue implementation. Assistant instructions require user approval before every PayPal MCP action. Live authentication and India-specific behavior remain in [verification](verification.md).
