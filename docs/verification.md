# Verification remaining outside the scaffold

The scaffold's automated checks require no credentials. These items require accounts, external tools or source review; none is represented as implemented.

## V01 PayPal documentation migration

TODO(verify): Confirm the retired prompt URL's replacement with PayPal; configurations use the exact local command from the [current official quickstart](https://developer.paypal.com/ai-tools/mcp-server). The original docs.paypal.ai URL returned 404.

## V02 Identity

TODO(verify): Test Log in with PayPal and scopes with the India seller and US buyer. [PayPal identity docs](https://developer.paypal.com/docs/log-in-with-paypal/).

Sandbox result (2026-10-25), from [paypal-login-check.ts](../scripts/spikes/paypal-login-check.ts): the US personal account completes sign-in and profile retrieval. Two separate India business accounts fail at profile retrieval (`/v1/identity/oauth2/userinfo`). The code exchange works but returns no `id_token`, and `userinfo` returns HTTP 400 "Unable to fetch details to serve the request" for both the `paypalv1.1` and `openid` schemas. Log in with PayPal cannot identify India sellers, so spec 01 needs a fallback sign-in.

## V03 Invoicing and reminders

TODO(verify): Create/send a one-time India sandbox invoice and reminder; confirm numbering and required field mappings. [Invoicing v2](https://developer.paypal.com/docs/api/invoicing/v2/).

Sandbox result (2026-10-25): create, send, pay and remind all work for an India seller to a US buyer. `invoice_number`, `note` and `terms_and_conditions` were accepted; `invoicer.tax_id` was not exercised. See [findings](paypal-sandbox-findings.md).

## V04 Recurring invoices

TODO(verify): Confirm recurring-series creation/activation for India; document account limitations. [PayPal Agent Toolkit](https://github.com/paypal/agent-toolkit).

Sandbox result (2026-10-25): `POST /v2/invoicing/recurring-invoices` plus `/activate` works; the series reads back `ACTIVE`. See [findings](paypal-sandbox-findings.md).

## V05 Partial payments and attachments

TODO(verify): Confirm India partial-payment settings and PDF attachment support, using a note link as the documented fallback. [Invoicing v2](https://developer.paypal.com/docs/api/invoicing/v2/).

Sandbox result (2026-10-25): partial payments are rejected ("not available in your country"). Attachments have no upload endpoint and store unvalidated references only, so use the note link. See [findings](paypal-sandbox-findings.md).

## V06 Events, refunds, disputes and history

TODO(verify): Exercise signed events, refund/dispute outcomes and transaction fee/net/FX coverage on India sandbox. [Webhook events](https://developer.paypal.com/api/rest/webhooks/event-names/), [Disputes testing](https://developer.paypal.com/docs/disputes/test-go-live/).

Sandbox result (2026-10-25): fee and net are verified, from both the capture and transaction search, with no FX on a USD balance. A buyer-opened dispute (`PP-R-TBU-10194472`) is listed and readable through the Disputes API. A refund webhook was delivered. No `CUSTOMER.DISPUTE.CREATED` event appeared for that dispute, although the webhook is subscribed. Still open: webhook signature verification and the dispute event. See [findings](paypal-sandbox-findings.md#disputes-and-webhooks-2026-10-25).

## V07 FIRA sample

TODO(verify): Obtain the team's own consented, redacted PayPal India FIRA and inspect fields before parser implementation. [PayPal digital FIRA](https://newsroom.apac.paypal-corp.com/Digital-Foreign-Inward-Remittance-Advice).

## V08 Purpose-code catalogue

TODO(verify): Review current service codes and bank confirmation requirements before populating the catalogue. [RBI](https://www.rbi.org.in/), [PayPal India purpose codes](https://www.paypal.com/in/cshelp/article/what-is-a-purpose-code-help231).

## V09 Rules review

TODO(verify): Have a CA verify all twelve [planned rules](rules-sources.md), statutory exceptions, primary citations and effective dates, especially the conflicting RBI realisation period and Income-tax Act 2025 references. [CBIC](https://taxinformation.cbic.gov.in/), [RBI notifications](https://www.rbi.org.in/Scripts/NotificationUser.aspx), [Income Tax Department](https://www.incometax.gov.in/iec/foportal/).

## V10 GSTR-1 format

TODO(verify): Confirm the currently accepted Table 6A service-export CSV/JSON format against the [GST offline utilities](https://www.gst.gov.in/download/offlineutilities).

## V11 Hosted resources

TODO(verify): Deploy the Blueprint in an authorized Render account, confirm paid Postgres retention/budget through judging and register monthlyClose. [Blueprint reference](https://render.com/docs/blueprint-spec), [Workflows](https://render.com/docs/workflows). Deployment is not part of this local scaffold.

## V12 Authenticated MCP

TODO(verify): Run authenticated PayPal MCP smoke checks in Claude Code, Codex and VS Code using an environment-supplied sandbox token, and check Context7 access/rate limits. [PayPal quickstart](https://developer.paypal.com/ai-tools/mcp-server), [Context7](https://github.com/upstash/context7).

## V13 Live Claude hooks

TODO(verify): Confirm the checked-in hooks in an installed Claude Code session on Windows and Linux; local subprocess checks cover their logic. [Claude hooks](https://code.claude.com/docs/en/hooks).

## V14 Hosted CI / Linux

TODO(verify): Observe the first GitHub Actions run on both Windows and Linux. Local verification here runs on Windows; the workflow covers clean frozen installs, checks, builds and secret scanning. [GitHub Actions](https://docs.github.com/en/actions).

## V15 Sponsor licences

TODO(verify): Obtain AG Studio and Bryntum licences on/after Nov 1, 2026 and confirm coverage through Dec 15 judging before installing either package. [Sponsor requirements in PLAN](PLAN.md#12-sponsor-tools).
