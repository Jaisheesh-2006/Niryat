# Niryat

> **Run your export business on PayPal. Niryat's AI keeps it legal in India.**

Niryat (Hindi for _export_) is an AI agent for Indian freelancers who sell services abroad through PayPal. Every invoice, payment, reminder, refund and dispute happens in PayPal; Niryat's agent decides what to do and when, and turns that PayPal activity into Indian export compliance: GST-ready invoices, purpose-code checks, FIRA matching, GSTR-1 export data, advance-tax estimates and RBI deadline tracking. The user approves every action; nothing is filed or moved without them.

Built for the **[PayPal AI Hackathon](https://paypalaihackathon.devpost.com/)** (submission deadline: Nov 12, 2026, 12:00 PT / Nov 13, 1:30 AM IST; judging Dec 1–15, 2026).

---

## Table of contents

1. [The problem](#1-the-problem)
2. [Who it's for and v1 scope](#2-who-its-for-and-v1-scope)
3. [How it works](#3-how-it-works)
4. [Why PayPal is central](#4-why-paypal-is-central)
5. [v1 features (in order of importance)](#5-v1-features-in-order-of-importance)
6. [Stretch features (only if time allows)](#6-stretch-features-only-if-time-allows)
7. [Out of scope](#7-out-of-scope)
8. [AI vs. rules: who does what](#8-ai-vs-rules-who-does-what)
9. [Rules engine](#9-rules-engine)
10. [Architecture and tech stack](#10-architecture-and-tech-stack)
11. [PayPal integration](#11-paypal-integration)
12. [Sponsor tools](#12-sponsor-tools)
13. [Data model](#13-data-model)
14. [Getting started](#14-getting-started)
15. [Judge mode](#15-judge-mode)
16. [Demo script (3 minutes)](#16-demo-script-3-minutes)
17. [Timeline](#17-timeline)
18. [Team roles](#18-team-roles)
19. [Hackathon compliance checklist](#19-hackathon-compliance-checklist)
20. [Risks and mitigations](#20-risks-and-mitigations)
21. [Day-1 verification checklist](#21-day-1-verification-checklist)
22. [Business model](#22-business-model)
23. [Disclaimer](#23-disclaimer)
24. [References](#24-references)

---

## 1. The problem

Lakhs of Indian freelancers sell services to foreign clients and get paid through PayPal. Since PayPal stopped domestic payments in India (2021), these cross-border sellers are PayPal India's core users.

Getting paid is easy. Staying compliant afterwards is not:

| #   | Pain                                                                                                                                      | Consequence                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | **LUT not filed / expired** — the yearly GST form (RFD-11) that lets you bill foreign clients without GST                                 | 18% GST must be paid upfront, then a refund chased |
| 2   | **Wrong purpose code** — the RBI code PayPal India requires before withdrawals                                                            | Refund rejections, mismatches during assessment    |
| 3   | **FIRA not matched** — PayPal issues a monthly digital FIRA (proof foreign money arrived), but nobody matches it to invoices              | Missing proof at refund or scrutiny time           |
| 4   | **GST mismatch notices** (e.g. ASMT-10)                                                                                                   | Stress, CA fees, possible tax demands              |
| 5   | **₹20 lakh confusion** — GST registration threshold mistaken for an income-tax-free limit                                                 | Unregistered when they should be                   |
| 6   | **Advance tax missed** — foreign clients don't deduct TDS                                                                                 | Interest penalties                                 |
| 7   | **RBI realisation deadline** — export proceeds must reach India within a fixed period, reportedly cut from 15 to 9 months from 1 Oct 2026 | Old unpaid invoices become a FEMA issue            |
| 8   | **Refunds and disputes ignored** — a refund or a lost dispute changes what was actually exported and received                             | GST data and FIRA records silently become wrong    |
| 9   | **Rules keep changing** — new FEMA export regulations (2026) and the new Income-tax Act 2025 renumber and change rules                    | Even careful freelancers fall behind               |

**Today:** freelancers ignore all of this until March, then hand a messy pile to a CA. Skydo, Payoneer and Wise _move money_; ClearTax files GST _generically_. **Nobody turns PayPal activity directly into Indian export compliance.**

---

## 2. Who it's for and v1 scope

**Primary user:** an individual freelancer or sole proprietor in India (developer, designer, writer, consultant, tutor) exporting **services** and paid via **PayPal**.

**v1 supports:**
- GST-registered users (full flow, including LUT and GSTR-1 data)
- Unregistered users (GST features hidden; FIRA, purpose code, advance tax and RBI tracking still apply)

**Persona used throughout this README:** _Ananya, a React developer in Pune, billing US clients in USD via PayPal._

---

## 3. How it works

```
Sign in      ──▶  Bill            ──▶  Get paid        ──▶  Handle changes    ──▶  Close the month
with PayPal       (PayPal invoice:      (PayPal webhooks:    (PayPal refunds &      (FIRA matching,
(health check,     one-time,             fee, net, FX)        disputes update        GSTR-1 data,
 purpose code,     recurring or                               GST & RBI status)      advance tax,
 LUT)              milestone)                                                        PayPal reminders)
```

---

## 4. Why PayPal is central

PayPal is not just where money lands. **PayPal is where the export business runs; Niryat is the AI layer that keeps it compliant.**

| Step              | Happens in PayPal                                                                                         | What Niryat's AI adds                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Sign in           | **Log in with PayPal**                                                                                    | Builds the compliance profile and health score                          |
| Bill a client     | **PayPal invoice** (one-time, recurring or milestone) carrying GSTIN, LUT wording and the GST invoice PDF | Extracts job details, checks export eligibility, fills mandatory fields |
| Retainer clients  | **PayPal recurring invoice series**                                                                       | Keeps numbering and GST data correct every cycle                        |
| Large jobs        | **Partial / milestone payments** on PayPal invoices                                                       | Tracks each part against the RBI deadline                               |
| Get paid          | **PayPal webhooks + transaction history**                                                                 | Records gross, fee, net; links to invoice and FIRA                      |
| Chase late payers | **PayPal invoice reminders**, sent by the agent after approval                                            | Decides when and how firmly to remind, based on the RBI deadline        |
| Refunds           | **PayPal refund events**                                                                                  | Updates GST data (credit note) and realisation status                   |
| Disputes          | **PayPal disputes**                                                                                       | Flags that the export may no longer count as realised                   |
| Agent actions     | **PayPal Agent Toolkit**                                                                                  | The Claude agent uses PayPal's own AI tools to act                      |

Every number Niryat shows comes from PayPal data; every action Niryat takes is a PayPal action.

---

## 5. v1 features (in order of importance)

Every feature below is **required for v1**. Build them in this order; each one lists what "done" means. Any PayPal capability marked _(verify)_ must be confirmed on an India sandbox account on Day 1 ([section 21](#21-day-1-verification-checklist)); if one is unavailable for India accounts, drop only that sub-item, not the feature.

### 1. Sign in with PayPal and compliance health check

**What:** The user signs in with PayPal _(verify)_, then completes the profile: GST status, GSTIN, LUT number and validity, work type, current PayPal purpose code. Niryat shows a **health score** with plain-language red flags (e.g. _"LUT expired"_, _"Purpose code doesn't match your work"_, _"You're close to the ₹20 lakh GST threshold"_).

**Why first:** every other feature depends on this profile, and it is the demo's opening "aha".

**How:** Log in with PayPal for identity; rules engine evaluates the profile; AI writes the explanations.

**Done when:**
- [ ] User signs in with PayPal (sandbox) and the PayPal business account is connected
- [x] Profile saves GST status, GSTIN, LUT details, work type, purpose code
- [x] Health score (0–100) with at least: LUT status, purpose-code fit, GST threshold proximity
- [x] Each red flag shows the rule it comes from and a "verify with your CA" note

### 2. Purpose code advisor

**What:** From the user's work description, suggest the right RBI purpose code (e.g. **P0802** software consultancy, **P1006** business/management consultancy, **P1007** advertising, **P1009** architectural) and explain why. Suggest only codes PayPal India offers ([rules sources](rules-sources.md#rbi--fema)). Flag a mismatch with the code set in PayPal.

**How:** AI classifies the work against a curated code table; the table (not the AI) is the source of truth.

**Done when:**
- [x] Curated table of the most common service purpose codes, with descriptions and sources
- [x] Suggestion + one-line reason + "confirm with your bank" note
- [x] Mismatch warning feeds into the health score

### 3. Export eligibility check

**What:** For each client/job, check the five conditions for a service to count as an **export of services** under the IGST Act: supplier in India, recipient outside India, place of supply outside India, payment in convertible foreign exchange, and supplier/recipient not merely establishments of the same person.

**How:** rules engine only.

**Done when:**
- [x] Each condition shown as pass/fail with its legal reference
- [x] A failing check blocks the zero-rated export invoice path and explains why

### 4. PayPal export invoicing (one-time, recurring, milestone)

**What:** Paste a client email or brief → AI extracts client name, address, country, work description and amount → Niryat generates a **GST-format export invoice PDF** (consecutive numbering per financial year, LUT endorsement) and creates the matching **PayPal invoice** with the compliance details inside it. Three invoice types:
- **One-time** — a single PayPal invoice
- **Recurring** — a PayPal recurring invoice series for retainer clients _(verify)_
- **Milestone** — a PayPal invoice that accepts partial payments _(verify)_

**How:** AI for extraction (user confirms every field); rules engine for mandatory fields and numbering; PayPal Invoicing API to create, send and schedule.

**PayPal field mapping:**

| Niryat value                | PayPal Invoicing v2 field                                            |
| --------------------------- | -------------------------------------------------------------------- |
| GSTIN                       | `invoicer.tax_id`                                                    |
| LUT endorsement text        | `detail.terms_and_conditions`                                        |
| Short note to client        | `detail.note`                                                        |
| GST invoice PDF             | `detail.attachments` (or a link in `note` if upload is not possible) |
| Invoice number              | `detail.invoice_number` (same as GST invoice)                        |
| Milestone / partial payment | invoice partial-payment configuration _(verify)_                     |

**Done when:**
- [ ] Extraction shows source text beside each extracted field; user confirms before saving
- [x] GST invoice PDF generated with all mandatory export fields
- [x] One-time PayPal invoice created and sent from the India sandbox account to a US sandbox buyer
- [x] Recurring series and partial-payment invoices work (or are documented as unavailable for India accounts)
- [ ] Invoice numbers are unique and consecutive per financial year, including recurring cycles

### 5. Real-time payment tracking

**What:** Detect payments as they happen and record gross amount, **PayPal fee**, net amount, currency and conversion details where available. Link each payment (including partial payments) to its invoice.

**How:** PayPal webhooks for real-time updates; PayPal transaction history for backfill and reconciliation.

**Done when:**
- [x] Webhook receiver verifies PayPal signatures and records invoice-paid / capture events
- [x] Nightly sync via transaction history catches anything webhooks missed
- [x] Each payment shows gross, fee, net and linked invoice; partial payments roll up correctly

### 6. Refunds and disputes handling

**What:** When a PayPal refund or dispute happens, Niryat updates compliance automatically:
- **Refund** → marks the invoice as partly/fully refunded, prepares the GST credit-note data, and adjusts the realised amount
- **Dispute opened** → alerts: _"Client disputed $500 — this export may no longer count as realised"_; tracks the dispute outcome

**How:** PayPal webhooks (refund and dispute events) + Disputes API for details; rules engine decides the compliance impact.

**Done when:**
- [ ] A sandbox refund updates the invoice, GST data and realised amount
- [ ] A sandbox dispute creates an alert and a task with its compliance impact
- [ ] Both appear in the dashboard and monthly close summary

### 7. FIRA matching

**What:** User uploads PayPal's monthly digital FIRA PDF. AI reads every line and matches it to PayPal payments, tolerating fee deductions, FX conversion and date gaps. Unmatched lines are flagged with reasons.

**How:** AI extraction + fuzzy matching against PayPal transaction data; user confirms uncertain matches.

**Done when:**
- [ ] Parser extracts date, amount, currency, reference and purpose code from a real (redacted) PayPal FIRA
- [ ] Matches show a confidence level; low-confidence matches need user confirmation
- [ ] Every invoice shows FIRA status: matched / pending / missing

### 8. Monthly close agent (acts in PayPal)

**What:** An agent that runs on the 1st of every month (and on demand). It syncs PayPal, matches payments, updates GST data and tax estimates, and **proposes PayPal actions** — e.g. send a reminder, create next month's retainer invoice — which run only after the user approves. It also creates tasks (_"Upload October FIRA"_) and sends a summary.

**How:** Claude agent using the **PayPal Agent Toolkit** plus Niryat tools (rules engine, FIRA matcher, GSTR-1 builder), scheduled via Render Workflows.

**Done when:**
- [ ] Runs on schedule and via a "Close this month" button
- [ ] Proposed PayPal actions shown as an approval list; nothing runs without approval
- [ ] Every number in the summary comes from PayPal data and the rules engine
- [ ] Every tool call is logged for transparency

### 9. RBI deadline tracker with PayPal reminders

**What:** For every unpaid or partly paid invoice, count down to the RBI deadline for receiving export proceeds (configurable; 9 months from invoice date for services, or 12 months if invoiced or settled in INR, under the FEMA 2026 regulations from 1 Oct 2026; see [rules sources](rules-sources.md)). As the deadline approaches, the agent **sends PayPal invoice reminders** after the user approves, escalating politely.

**How:** rules engine for the deadline (stored as a versioned rule); PayPal `send_invoice_reminder` for the action.

**Done when:**
- [ ] Each unpaid invoice shows days remaining
- [ ] Reminder proposals at 60 and 30 days before the deadline; sent via PayPal after approval
- [ ] Deadline value changes in one place (the rules file)

### 10. GSTR-1 export data

**What:** Generate the export section of GSTR-1 (Table 6A, zero tax under LUT), net of refunds, for the selected month/quarter as a file the user uploads to the GST portal.

**How:** rules engine only, using PayPal invoice and refund data.

**Done when:**
- [ ] Output matches the GST offline tool format (CSV/JSON — format to be verified on Day 1)
- [ ] Totals reconcile with PayPal invoices and refunds for the period
- [ ] Shown only for GST-registered users

### 11. Compliance calendar

**What:** One calendar with every deadline: LUT renewal, GSTR-1 due dates, advance-tax dates, RBI deadlines per invoice, recurring invoice dates, FIRA uploads, dispute response dates.

**How:** rules engine and PayPal data produce events; **Bryntum Calendar** displays them.

**Done when:**
- [ ] Events generated automatically from profile, PayPal invoices, disputes and rules
- [ ] Overdue and upcoming items are visually distinct
- [ ] Clicking an event opens the related invoice/task

### 12. Dashboard with plain-English questions

**What:** Income in USD and INR, PayPal fees paid, FX loss, refunds and disputes, health score, FIRA status, unpaid invoices — plus natural-language questions such as _"Show my PayPal fees by client this year"_ that generate live widgets.

**How:** **AG Studio** (AG Grid) dashboard with custom widgets and theming, powered by PayPal data; AG Studio's agent framework for natural-language questions.

**Done when:**
- [ ] Core widgets: income, PayPal fees, FX, refunds/disputes, health score, FIRA status, unpaid invoices
- [ ] At least three natural-language questions work reliably in the demo
- [ ] Custom theme matching Niryat branding

### 13. Advance tax estimator

**What:** Estimate income tax on export income (from PayPal receipts, net of refunds) and show what to pay by each due date. Presumptive-scheme users (if eligible) pay in full by 15 March; others pay in instalments (15 Jun, 15 Sep, 15 Dec, 15 Mar).

**How:** rules engine only; section references updated for the Income-tax Act 2025 (verify on Day 1).

**Done when:**
- [ ] Eligibility for presumptive taxation determined from profile and receipts
- [ ] Amount and dates shown; dates appear in the compliance calendar
- [ ] Clear "estimate — confirm with your CA" label

---

## 6. Stretch features (only if time allows)

Build these **only after features 1–13 are polished** (target: Nov 5).
1. **CA pack** — one-click ZIP of PayPal invoices, FIRAs, payment ledger, refunds/disputes, GSTR-1 data and tax summary
2. **Notice helper** — paste a GST notice, get a plain-language explanation and a reconciliation for your CA
3. **Hindi explanations** alongside English

---

## 7. Out of scope

- Filing anything directly on the GST or income-tax portals (Niryat generates upload files instead)
- Moving, holding or converting money outside PayPal's own flows
- Export of goods
- Payment providers other than PayPal
- Companies and multi-user teams
- A chat-only assistant (AI is used inside workflows, not as a chatbot)

---

## 8. AI vs. rules: who does what

| AI (understanding and judgement)                                                 | Rules engine (anything legal or numeric)         |
| -------------------------------------------------------------------------------- | ------------------------------------------------ |
| Extracting client/job details from emails and briefs                             | The five export conditions                       |
| Suggesting a purpose code from a work description                                | Mandatory invoice fields, numbering, LUT wording |
| Reading FIRA PDFs and fuzzy-matching them to PayPal payments                     | GST threshold, GSTR-1 data, credit notes         |
| Deciding which PayPal actions to propose (reminders, retainer invoices) and when | RBI deadlines and refund/dispute impact          |
| Writing plain-language explanations                                              | Advance-tax amounts and dates                    |
| Natural-language dashboard questions                                             | Every number shown to the user                   |

**Golden rule:** the AI never states a law or a number on its own, and never takes a PayPal action without user approval. Every legal statement and every figure comes from the rules engine, with a citation.

---

## 9. Rules engine

Rules live in a versioned file (e.g. `rules/india-export.yaml`). Each rule has an `id`, `description`, `source` (Act / section / notification), `effective_from`, `review` status (`unchecked` / `source_checked`) and logic, and is covered by unit tests.

| Rule ID                  | Rule                                                                                          | Source                                                                  | Status                           |
| ------------------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------- |
| `EXPORT_CONDITIONS`      | Five conditions for export of services                                                        | IGST Act, s. 2(6); s. 13(2)                                             | Source-checked                   |
| `LUT_REQUIRED`           | LUT (RFD-11) before export, per financial year; IGST + interest if unpaid after 1 year        | IGST s. 16; CGST Rules r. 96A; Notfn 37/2017-CT                         | Source-checked                   |
| `EXPORT_INVOICE_FIELDS`  | Mandatory export invoice fields and LUT endorsement                                           | CGST Rules, r. 46 (Notfn 20/2024-CT)                                    | Source-checked                   |
| `INVOICE_NUMBERING`      | Consecutive, ≤16 chars (A–Z, 0–9, -, /), unique per financial year                            | CGST Rules, r. 46(b)                                                    | Source-checked                   |
| `CREDIT_NOTE`            | Credit note may be issued on refund; declare by 30 Nov after FY end                           | CGST Act, s. 34; r. 53(1A)                                              | Source-checked                   |
| `GST_THRESHOLD`          | ₹20 lakh aggregate turnover (exports included); services exporters below it need not register | CGST Act, s. 22, s. 24; Notfn 10/2017-IT                                | Source-checked                   |
| `GSTR1_6A`               | Export invoices reported in Table 6A, zero tax under LUT                                      | GSTR-1 Table 6A; Notfn 83/2020-CT                                       | Source-checked; file format open |
| `PURPOSE_CODES`          | Service purpose codes PayPal India offers, with Annex I descriptions                          | FETERS Annex I, A.P. (DIR) Circ. 84/2012                                | Source-checked                   |
| `RBI_REALISATION`        | Realise services exports within 9 months of invoice (12 if INR), from 1 Oct 2026              | FEMA (Export and Import of Goods and Services) Regulations, 2026, Reg 5 | Source-checked                   |
| `REALISATION_ADJUSTMENT` | Refunds/lost disputes reduce realised value only with AD-bank approval                        | FEMA 23(R)/2026-RB, Reg 6                                               | Source-checked                   |
| `PRESUMPTIVE_TAX`        | 50% deemed income for specified professions (incl. IT); ₹50 lakh / ₹75 lakh limits            | Income-tax Act 2025, s. 58, s. 62(4)                                    | Source-checked                   |
| `ADVANCE_TAX_DATES`      | 15 Jun / 15 Sep / 15 Dec / 15 Mar; presumptive: full by 15 Mar                                | Income-tax Act 2025, s. 408                                             | Source-checked                   |

Source-checked against primary law on 2026-10-25; details, quotes and open items are in [rules sources](rules-sources.md). No CA review is planned for the hackathon; this is listed as a limitation ([section 23](#23-disclaimer)) and every rule-based statement in the app carries a "verify with your CA" note.

---

## 10. Architecture and tech stack

```
Frontend (Next.js / React)
 ├─ Log in with PayPal
 ├─ AG Studio dashboard           ← AG Grid sponsor
 └─ Bryntum Calendar              ← Bryntum sponsor
        │
Backend API (Node.js / TypeScript)
 ├─ Rules engine (versioned YAML + unit tests)
 ├─ AI agent (Claude via Claude Agent SDK)
 │    tools: PayPal Agent Toolkit (invoices, recurring series,
 │           reminders, refunds, transactions),
 │           PayPal Disputes API, rules engine,
 │           FIRA parser, GSTR-1 builder
 ├─ Approval queue (every PayPal action needs user approval)
 ├─ PDF generator (GST invoice)
 └─ PayPal webhook receiver (payments, refunds, disputes)
        │
Postgres (paid plan) + file storage (invoice PDFs, uploaded FIRAs)
Render: web service + Render Workflows (monthly close, reminders)   ← Render sponsor
APIMatic PayPal Context Plugin used while coding the integration     ← APIMatic sponsor
```

| Layer     | Choice                                                                          |
| --------- | ------------------------------------------------------------------------------- |
| Frontend  | Next.js, React, TypeScript                                                      |
| Identity  | Log in with PayPal                                                              |
| Dashboard | AG Studio (AG Grid)                                                             |
| Calendar  | Bryntum Calendar                                                                |
| Backend   | Node.js, TypeScript                                                             |
| AI        | Claude (Anthropic) via Claude Agent SDK; model set via env var                  |
| Payments  | PayPal REST APIs + PayPal Agent Toolkit (sandbox)                               |
| Database  | Postgres on a **paid** Render plan (free Render Postgres expires after 30 days) |
| Jobs      | Render Workflows                                                                |
| PDF       | Server-side PDF generation                                                      |
| Hosting   | Render                                                                          |

---

## 11. PayPal integration

| Need                              | PayPal capability                                                                  | India sandbox |
| --------------------------------- | ---------------------------------------------------------------------------------- | ------------- |
| Sign in                           | Log in with PayPal                                                                 | Verify        |
| Create and send export invoices   | Invoicing API v2 (`create_invoice`, `send_invoice`)                                | Works         |
| Retainer billing                  | Recurring invoice series (`create_recurring_series`, `activate_recurring_series`)  | Works         |
| Milestone billing                 | Partial payments on invoices                                                       | Unavailable   |
| Remind late payers                | `send_invoice_reminder`                                                            | Works         |
| Detect payments in real time      | Webhooks (invoice paid, payment capture completed)                                 | Verify        |
| Refunds                           | Webhooks (refund events), `record_refund_for_invoice`                              | Verify        |
| Disputes                          | Webhooks (dispute created/updated) + Disputes API (`list_disputes`, `get_dispute`) | Verify        |
| Fees, net amounts, reconciliation | Transaction history (`list_transactions`)                                          | Works         |
| Agent access to PayPal            | PayPal Agent Toolkit (sandbox mode)                                                | n/a           |

**Accounts:** one **India** sandbox business account (seller) and one **US** sandbox personal account (buyer).

---

## 12. Sponsor tools

| Sponsor                 | How Niryat uses it                                                                                                   | Prize                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **AG Grid (AG Studio)** | Main dashboard on PayPal data, custom widgets and theming, natural-language questions via the Studio Agent Framework | $5K / $2K / 3×$1K — **primary target** |
| **Bryntum**             | Compliance calendar (Calendar component)                                                                             | 3×$1K                                  |
| **Render**              | Hosting + Render Workflows for scheduled agent jobs                                                                  | Credits                                |
| **APIMatic**            | PayPal Context Plugin used while building the PayPal integration (documented here)                                   | 3×$1K + subscription                   |

A project can win at most one main prize and one sponsor prize; AG Studio is the main sponsor target.

**Licence timing:** AG Studio and Bryntum offer 45-day trials, and judging runs until **Dec 15**. Start both trials **on or after Nov 1** (45 days from Nov 1 reaches Dec 16) and ask on the PayPal Discord whether hackathon licences can cover the full judging period.

---

## 13. Data model

| Table            | Key fields                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`          | id, email, paypal_payer_id, created_at                                                                                                                                           |
| `profiles`       | user_id, gst_registered, gstin, lut_number, lut_valid_from, lut_valid_to, work_type, purpose_code, pan_last4                                                                     |
| `clients`        | id, user_id, name, address, country, email, export_check_result                                                                                                                  |
| `invoices`       | id, user_id, client_id, type (one_time / recurring / milestone), number, fy, date, currency, amount, description, paypal_invoice_id, paypal_recurring_series_id, pdf_url, status |
| `payments`       | id, invoice_id, paypal_txn_id, kind (payment / refund), gross, fee, net, currency, fx_rate, received_at                                                                          |
| `disputes`       | id, invoice_id, paypal_dispute_id, amount, status, reason, outcome                                                                                                               |
| `fira_documents` | id, user_id, month, file_url, parsed_at                                                                                                                                          |
| `fira_lines`     | id, fira_document_id, date, amount, currency, reference, purpose_code                                                                                                            |
| `matches`        | fira_line_id, payment_id, confidence, confirmed_by_user                                                                                                                          |
| `agent_actions`  | id, user_id, paypal_action, payload, status (proposed / approved / rejected / done), created_at                                                                                  |
| `tasks`          | id, user_id, type, due_date, status, source_rule_id                                                                                                                              |
| `rule_versions`  | rule_id, version, effective_from, source, review                                                                                                                                 |

Sensitive fields (GSTIN, PAN fragments, addresses) are encrypted at rest.

---

## 14. Getting started

> Commands below are the planned setup; update them as the code lands. **Never commit real API keys or licence keys** — judges use the hosted demo, and self-hosters supply their own keys.

### Prerequisites

- Node.js 20+
- Postgres 15+
- A [PayPal Developer](https://developer.paypal.com/) account with India (seller) and US (buyer) sandbox accounts
- An Anthropic API key
- AG Studio and Bryntum trial licences (free 45-day trials)

### Environment variables (`.env`, not committed)

```
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_ENVIRONMENT=SANDBOX
PAYPAL_WEBHOOK_ID=
PAYPAL_LOGIN_RETURN_URL=
ANTHROPIC_API_KEY=
CLAUDE_MODEL=
AI_MONTHLY_BUDGET_USD=
DATABASE_URL=
FILE_STORAGE_URL=
AG_STUDIO_LICENSE_KEY=
ENCRYPTION_KEY=
```

### Run locally

```bash
npm install
```
```bash
npm run db:migrate
```
```bash
npm run seed:judge
```
```bash
npm run dev
```

### Tests

```bash
npm test
```
The rules engine must have unit tests for every rule in [section 9](#9-rules-engine).

---

## 15. Judge mode

- **Hosted demo on Render** with a **"Try as judge"** button that logs into a pre-seeded profile, kept running until judging ends on **Dec 15**.
- **Sandbox test credentials only** (India seller, US buyer) are listed here so judges can pay a real sandbox invoice, issue a refund and open a dispute end to end. No real keys are published.
- **AI usage is capped** (`AI_MONTHLY_BUDGET_USD`) and rate-limited so the demo can't run out of budget during judging.
- **Real FIRA sample:** a team member's **own** PayPal India FIRA, used with their consent and with all personal details redacted.
- This README documents setup, the AI tools used and how, and APIMatic usage. The repository includes an open-source **LICENSE** file visible in the repo's About section, as the hackathon rules require.

---

## 16. Demo script (3 minutes)

PayPal stays on screen for most of the video: _"Every action here happens in PayPal. Niryat's agent decides what to do and when."_

| Time      | Scene                                                                                                                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:20 | **Hook:** _"Ananya, a developer in Pune, earned $4,000 on PayPal this quarter. Her LUT expired, so about 18% of it — roughly ₹60,000 — gets locked up as GST. Nobody told her."_                                 |
| 0:20–0:40 | **Log in with PayPal** → health score flags **LUT expired** and **purpose code mismatch (P1006 used for software work → suggest P0802)**                                                                         |
| 0:40–1:15 | Paste a client email → AI fills the invoice → five export checks pass → **PayPal invoice** sent with GSTIN + LUT text; a retainer client gets a **PayPal recurring series** → switch to US sandbox buyer and pay |
| 1:15–1:35 | **PayPal webhook** records the payment; fee and net appear in the AG Studio dashboard; ask _"PayPal fees by client this year"_ → widget appears                                                                  |
| 1:35–1:55 | Buyer opens a **PayPal dispute** → alert: _"this export may no longer count as realised"_; a **PayPal refund** updates GST credit-note data                                                                      |
| 1:55–2:20 | Upload the FIRA → AI matches it to PayPal payments, flags 1 line with a reason → generate GSTR-1 export file                                                                                                     |
| 2:20–2:40 | Monthly close agent proposes **PayPal reminders** before the RBI deadline → approve → reminder sent; Bryntum calendar shows upcoming deadlines                                                                   |
| 2:40–2:55 | Safety and business: rules with primary-source citations, user approves every PayPal action, no auto-filing; next: CA dashboard                                                                                  |
| 2:55–3:00 | _"Run your export business on PayPal. Niryat keeps it legal in India."_                                                                                                                                          |

No third-party logos (Skydo, Wise, ClearTax, etc.) and no copyrighted music in the video.

---

## 17. Timeline

| Dates (2026)        | Goal                                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Oct 24–25**       | Day-1 checks ([section 21](#21-day-1-verification-checklist)), especially which PayPal features work on India sandbox accounts; repo + LICENSE; Render hello-world on a paid Postgres plan; get your own redacted FIRA; rules checked against primary sources |
| **Oct 26–30**       | Features 1–5: Log in with PayPal + health check, purpose code advisor, export check, PayPal invoicing (one-time, recurring, milestone), real-time payment tracking; rules engine v1 with tests                                                                |
| **Oct 31–Nov 4**    | Features 6–9: refunds and disputes, FIRA matching, monthly close agent with approval queue, RBI tracker with PayPal reminders                                                                                                                                 |
| **Nov 1**           | **Start AG Studio and Bryntum trials** (so they last through Dec 15)                                                                                                                                                                                          |
| **Nov 4–7**         | Features 10–13: GSTR-1 data, Bryntum calendar, AG Studio dashboard, advance tax; judge mode; polish. Stretch features only if 1–13 are solid                                                                                                                  |
| **Nov 8**           | **Feature freeze**                                                                                                                                                                                                                                            |
| **Nov 8–10**        | Testing, README, Devpost write-up, record and edit the video                                                                                                                                                                                                  |
| **Nov 11**          | **Submit** (one day of buffer before the deadline)                                                                                                                                                                                                            |
| **Nov 12 – Dec 15** | Keep the hosted demo, sandbox accounts, trials and AI budget alive until judging ends                                                                                                                                                                         |

---

## 18. Team roles

| Role                | Owns                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------- |
| PayPal + backend    | Log in with PayPal, invoicing, webhooks, refunds/disputes, transaction sync, database |
| AI + rules          | Rules engine, Claude agent and approval queue, extraction, FIRA matching              |
| Frontend + sponsors | UI, AG Studio dashboard, Bryntum calendar                                             |
| Demo + docs         | README, Devpost text, video, judge mode                                               |

With 1–2 people: skip all stretch features.

---

## 19. Hackathon compliance checklist

Based on the [official rules](https://paypalaihackathon.devpost.com/rules):
- [ ] Every team member is eligible (India is not an excluded country)
- [ ] PayPal developer platform (sandbox) is central, plus an AI tool ([section 4](#4-why-paypal-is-central))
- [ ] Newly created during the submission period
- [ ] Working hosted demo and complete setup instructions
- [ ] Public repo with an open-source LICENSE visible in the About section
- [ ] Video under 3 minutes, public on YouTube, no third-party trademarks or copyrighted music
- [ ] Authorised use of every third-party tool (trial licences used per their terms; no keys committed)
- [ ] No personal data of others; own FIRA used with consent and redacted
- [ ] All materials in English
- [ ] Demo available free and unrestricted until **Dec 15** (end of judging)

---

## 20. Risks and mitigations

| Risk                                                        | Mitigation                                                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Some PayPal features unavailable on India sandbox accounts  | Test each on Day 1; drop only the unavailable sub-item; ask on the PayPal Discord immediately  |
| Rules wrong or outdated (2026 changes, conflicting sources) | Versioned rules with sources and `review` status; primary-source check; configurable deadlines |
| Seen as tax advice                                          | Framed as "preparation for your CA"; user approves everything; nothing auto-filed              |
| Agent takes a wrong PayPal action                           | Every PayPal action goes through the approval queue; all actions logged                        |
| AI misreads an email or FIRA                                | Show extracted values beside the source; require confirmation for low-confidence results       |
| Trial licences expire during judging                        | Start AG Studio and Bryntum trials on or after Nov 1; request hackathon licences on Discord    |
| Hosted demo goes down before Dec 15                         | Paid Render Postgres (free tier expires after 30 days); credits budgeted through Dec 15        |
| AI budget runs out during judging                           | Monthly budget cap and rate limits                                                             |
| Keys leaked in the public repo                              | `.env` never committed; only sandbox test credentials published                                |
| Judges unfamiliar with Indian GST                           | Lead with rupee amounts at risk; one simple explainer graphic                                  |
| No API for the GST portal or FIRA downloads                 | Generate official upload files; FIRA via file upload — real data, not simulated                |
| Sensitive data (GSTIN, PAN, income)                         | Encryption at rest, minimal permissions, no training on user data                              |
| Scope creep                                                 | Feature freeze on Nov 8; stretch features only after 1–13 are polished                         |

---

## 21. Day-1 verification checklist

**PayPal (India sandbox seller → US sandbox buyer):**
- [ ] Log in with PayPal works: **yes for India business sellers, through an app the seller does not own** ([findings](paypal-sandbox-findings.md#root-cause-the-app-owner-cannot-sign-in-to-its-own-app-2026-10-29))
- [x] Invoices can be created and sent to a US buyer
- [x] Recurring invoice series can be created and activated
- [ ] Partial payments on invoices are supported: **not for India sellers** ([findings](paypal-sandbox-findings.md))
- [x] Invoice reminders can be sent
- [ ] Webhooks fire for payments, refunds and disputes: refund event seen; **no dispute event** ([findings](paypal-sandbox-findings.md#disputes-and-webhooks-2026-10-25))
- [x] A dispute can be opened from the buyer account and read via the Disputes API
- [x] Transaction history returns fees and net amounts
- [x] Invoice attachments work (otherwise link the PDF in `note`): no upload, so link the PDF in `note` ([findings](paypal-sandbox-findings.md))

**Indian rules:**
- [ ] Current RBI realisation period for services (official RBI notification)
- [ ] Income-tax Act 2025 section numbers and presumptive-tax limits
- [ ] Rule 46 export invoice wording and numbering requirements
- [ ] Credit-note treatment for refunds on export invoices
- [ ] GSTR-1 Table 6A file format for services
- [ ] Whether PayPal India requires any per-transaction export details

**Other:**
- [ ] Your own PayPal India FIRA obtained and redacted
- [ ] Render paid Postgres set up; credits cover hosting to Dec 15

---

## 22. Business model

- **Freelancers:** free health check; **₹299–499/month** for the full product
- **CA firms:** multi-client dashboard, priced per client (one CA brings 50–200 users)
- **Distribution:** freelancer communities, CA networks, potential PayPal India partnership
- **Moat:** a versioned library of Indian export-compliance rules plus deep PayPal integration
- **Value to PayPal:** makes PayPal the easiest compliant way for Indian freelancers to get paid from abroad, which keeps them on PayPal instead of switching to alternatives

---

## 23. Disclaimer

Niryat prepares information and documents to help users and their chartered accountants. It does **not** provide tax or legal advice, does **not** file returns on anyone's behalf, and only takes PayPal actions (such as sending invoices or reminders) after the user approves them. Rules are sourced, versioned and checked against official primary texts, but **have not been reviewed by a chartered accountant**; this is a known limitation of the hackathon build. Each deployment also acts on **one PayPal seller account**; connecting each user's own PayPal account (Partner Referrals) is future work ([findings](paypal-sandbox-findings.md#multi-seller-partner-referrals-limitation-and-future-work-2026-10-29)). Confirm anything you act on with a qualified CA.

---

## 24. References

- PayPal AI Hackathon — [overview](https://paypalaihackathon.devpost.com/), [rules](https://paypalaihackathon.devpost.com/rules), [resources](https://paypalaihackathon.devpost.com/resources), [FAQs](https://paypalaihackathon.devpost.com/details/faqs)
- Sponsor details — [AG Grid](https://paypalaihackathon.devpost.com/details/aggrid), [Bryntum](https://paypalaihackathon.devpost.com/details/bryntum), [APIMatic](https://paypalaihackathon.devpost.com/details/apimatic), [Render](https://paypalaihackathon.devpost.com/details/render)
- [PayPal Agent Toolkit](https://github.com/paypal/agent-toolkit)
- [PayPal Invoicing v2 — invoice object](https://developer.paypal.com/api/invoicing/v2/definitions/invoice)
- [PayPal Disputes — test and go live](https://developer.paypal.com/disputes/test-go-live)
- [PayPal India — purpose code](https://www.paypal.com/in/smarthelp/article/what-is-purpose-code--faq4279)
- [PayPal — digital FIRA](https://newsroom.apac.paypal-corp.com/Digital-Foreign-Inward-Remittance-Advice)
- [Render — free tier limits](https://render.com/docs/free)
- [CBIC — CGST Rule 96A (LUT)](https://taxinformation.cbic.gov.in/content/html/tax_repository/gst/rules/cgst_rules/active/chapter10/rule96a_v1.00.html)
- [Razorpay — e-FIRA and purpose codes](https://razorpay.com/blog/e-fira/)
- [Skydo — RBI purpose codes](https://www.skydo.com/rbi-purpose-codes)
- [SCC Online — FEMA export regulations 2026](https://www.scconline.com/blog/post/2026/09/29/rbi-amends-fema-export-import-goods-services-regulations-2026/)
- [Taxmann — realisation period restored to 9 months](https://www.taxmann.com/post/blog/rbi-restores-export-proceeds-realisation-period-to-9-months/)
- [ICAI NIRC — Income-tax Act 2025 overview](https://nirc.icai.org/wp-content/uploads/2026/05/The-New-Income-Tax-Act-2025-nanda-sir.pdf)
- [TaxTMI — ASMT-10 notice discussion](https://www.taxtmi.com/forum/issue?id=120695)
- [Wisemonk — GST mistakes freelancers make](https://www.wisemonk.io/blogs/gst-mistakes-freelancers-should-avoid)
