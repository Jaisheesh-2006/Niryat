# UX requirements

Date: 2026-11-09. Purpose: define how Niryat must work, independent of colour, type or motion, so the redesign can change the look without changing behaviour. Visual specifications stay in [frontend-plan.md §4](frontend-plan.md#4-design-specification); the current implementation is described in [frontend-audit.md](frontend-audit.md). Product scope comes from [PLAN §2–§7](PLAN.md#2-who-its-for-and-v1-scope).

Scope decision: the current 23 routes already cover every objective below. The redesign adds no pages or features; it may merge or reorder sections inside a page. The gaps in §6 are the only behaviour changes proposed.

## Product rules every screen must respect

1. **The user approves every PayPal action.** Sending an invoice, starting a recurring series, refunding and sending a reminder each show the exact request and wait for an explicit Approve or Reject. Claude drafts and advises; it never approves.
2. **Every legal or tax figure cites its rule.** Deadlines, eligibility, credit notes and tax estimates show a rule id and source next to the figure. The UI never computes these figures; they come from the API.
3. **Sandbox only, not advice.** Every signed-in page shows that PayPal is in sandbox and that Niryat is not tax or legal advice, with a link to the disclaimer.
4. **Plain language first.** Each compliance term (LUT, FIRA, GSTR-1, purpose code, realisation, credit note, advance tax, presumptive taxation, GSTIN, export conditions) appears with a plain-English explanation where it is used.
5. **Fail safely.** When data cannot load, say so, say that nothing was sent to PayPal, and offer a retry. One failing section must not hide the rest of the page.

## 1. Users

| User                                                                                                            | Who they are                                                                   | Context                                                                                                                                                | Access                                                                    |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **Freelancer, GST-registered** (primary; persona "Ananya", a React developer in Pune billing US clients in USD) | Individual or sole proprietor in India exporting services, paid through PayPal | Not a tax expert. Visits weekly to bill and approve, monthly to close the month, quarterly for tax dates. Mostly desktop; checks approvals on a phone. | Full freelancer workspace                                                 |
| **Freelancer, not GST-registered**                                                                              | Same, below or unaware of the GST threshold                                    | Same as above                                                                                                                                          | Same workspace; GST-only content (LUT, GSTR-1) must not mislead them (§6) |
| **Chartered accountant (CA)**                                                                                   | Professional reviewing several freelancers' records                            | Desktop, periodic reviews, deadline-driven                                                                                                             | Read-only, only for freelancers who shared with them; separate sign-in    |
| **Demo visitor (judge)**                                                                                        | Hackathon judge exploring a seeded account                                     | One short session, no setup, desktop                                                                                                                   | Shared synthetic freelancer or CA account, only when judge mode is on     |
| **Anonymous visitor**                                                                                           | Prospective user                                                               | First visit, any device                                                                                                                                | Public pages only                                                         |

Not users but actors the UI must represent honestly: **Claude** (drafts invoices from emails, suggests reminder decisions, writes close notes, answers dashboard questions; read-only access to the user's PayPal records) and **PayPal** (source of payments, refunds and disputes; receives approved actions).

## 2. Primary objectives

**Freelancer**
1. Know what needs attention today: approvals, the next deadline, compliance health and open tasks.
2. Bill foreign clients correctly: a zero-GST export invoice only when the client passes the export check.
3. Get paid and stay within the RBI realisation deadline, with reminders sent at the right time.
4. Keep records correct when refunds and disputes change what was exported or received.
5. Close each month: payment proof matched, tasks handled, GSTR-1 data ready.
6. Avoid tax surprises: see advance-tax dates and an estimate.
7. Share records with their CA and stop sharing at will.

**CA**
1. See every shared client's state at once, worst first.
2. See all clients' deadlines in one calendar.
3. Open one client's records (health, invoices, deadlines, GSTR-1) without being able to change them.
4. Accept or decline sharing requests, and stop managing a client.

**Demo visitor:** reach a populated account in one click and see the approval flow end to end.

**Anonymous visitor:** understand what Niryat does, that it is sandbox-only and approval-first, and sign up or sign in.

Success measures for the redesign: each freelancer objective is reachable from Today in one click; no approval can be completed without seeing what will be sent; no compliance figure appears without its citation.

## 3. Actions

Legend: **A** = needs the approval step before reaching PayPal; **I** = irreversible or external effect, so confirm intent and show the outcome; **R** = read only.

**Freelancer**

| Area          | Actions                                                                                                                                                                                                                                                                                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account       | Create account; sign in with email or PayPal; sign out; try the demo (when enabled)                                                                                                                                                                                                                                                                                     |
| Profile       | Enter or edit business, GST, LUT and work details; choose a purpose code from suggestions                                                                                                                                                                                                                                                                               |
| Health check  | View score and flags with citations (R); jump to Profile to fix                                                                                                                                                                                                                                                                                                         |
| Clients       | Add a client with export-check answers; edit answers; read the per-condition result (R)                                                                                                                                                                                                                                                                                 |
| Invoices      | Paste a client email for Claude to extract details; check and correct extracted fields; create a client from the extraction; create a one-time or recurring invoice; approve or reject sending it (**A**, **I**); view the PDF, payments, refunds, realisation, credit notes and disputes (R); propose a refund for a payment, then approve or reject it (**A**, **I**) |
| Monthly close | Run the close; read Claude's priorities and note; approve or reject each reminder (**A**, **I**); inspect the run history and every tool call (R)                                                                                                                                                                                                                       |
| Tasks         | Mark a task done (**I**); set or clear a planned date; drag a task in the calendar to plan it; open the related invoice                                                                                                                                                                                                                                                 |
| Payment proof | Upload a FIRA PDF after confirming it is their own (**I**: stored); confirm or reject an uncertain match (**I**)                                                                                                                                                                                                                                                        |
| Reports       | Explore and edit dashboard widgets; ask the dashboard a plain-English question; preview GSTR-1 for a period and download the file; enter rates and an estimate for advance tax                                                                                                                                                                                          |
| Calendar      | View deadlines by month, week, year, agenda or list; open the item behind a deadline                                                                                                                                                                                                                                                                                    |
| CA sharing    | Invite a CA by email and receive a one-time invitation code; end sharing (**I**)                                                                                                                                                                                                                                                                                        |

**CA**

| Area           | Actions                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Account        | Create CA account; sign in; sign out; try the CA demo (when enabled)                                                               |
| Requests       | Enter a client's invitation code; accept or decline a request (**I**)                                                              |
| Portfolio      | View all shared clients, sorted most overdue first; ask the portfolio dashboard a question; open a client                          |
| Client records | View health, invoices, deadlines and GSTR-1 for a period (R); download that client's GSTR-1 file; stop managing the client (**I**) |
| Calendar       | View all clients' deadlines (R)                                                                                                    |

A CA never approves, edits or sends anything on a client's behalf; the UI shows pending approvals only as a count.

## 4. Pages and sections

Required sections are listed in reading order. Every data section needs a loading state, an empty state with the next step, and an error state per rule 5. URLs marked **fixed** are linked from the API or from other pages and must not change.

### Public

| Page                           | URL                       | Required sections                                                                                                                                                                                                                                                                          |
| ------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Home                           | `/`                       | What Niryat does and for whom; calls to action (create account, PayPal sign-in, sign in, demo); an example approval; how it works in five steps (sign in, bill, get paid, handle changes, close the month); three commitments (you approve, rules cite sources, sandbox and nothing filed) |
| Sign in / Create account       | `/login`, `/signup`       | Email and password form with errors; PayPal sign-in error message; PayPal sign-in; demo entry (sign-in only); links to the other form and to the CA portal; why-Niryat panel                                                                                                               |
| CA sign in / Create CA account | `/ca/login`, `/ca/signup` | Same pattern for CAs, without PayPal sign-in; link back to the freelancer portal                                                                                                                                                                                                           |
| Disclaimer                     | `/disclaimer`             | Sandbox only; not advice; no CA review; one seller account per deployment                                                                                                                                                                                                                  |

### Freelancer workspace

| Page             | URL                                              | Required sections                                                                                                                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today            | `/overview` (**fixed**, sign-in landing)         | Data freshness; four summary tiles (approvals waiting, next deadline with overdue count, health score, open tasks), each linking to its page; approvals list; next 5 deadlines; 5 recent invoices                                                                                                                                       |
| Profile          | `/profile` (**fixed**)                           | Business details; GST and LUT; work and purpose code; save with field errors; CA sharing                                                                                                                                                                                                                                                |
| Health check     | `/health-check`                                  | Score and check date; flags sorted by severity with citation and note; purpose-code suggestion with reason; link to Profile                                                                                                                                                                                                             |
| Clients          | `/clients`                                       | Add-client form (open when there are none); per client: details, five-condition export check with references, eligibility verdict with reasons, citation, edit answers                                                                                                                                                                  |
| Invoices         | `/invoices` (**fixed**, anchors `#invoice-<id>`) | New-invoice flow (extract from email → client → invoice; open when there are none); data freshness; per invoice: number, client, amount, date, status and payment-proof badges, RBI deadline with citation, approval cards, dispute alerts, then details (payments with refund action, refunds, money received, credit notes, disputes) |
| Monthly close    | `/close`                                         | Run button and in-progress state; priorities; approvals waiting; failed or uncertain approvals; month summary with citations and AI status; Claude's note, labelled as such; history of reminders and runs                                                                                                                              |
| Tasks            | `/tasks` (**fixed**, anchors `#task-<id>`)       | Open tasks with due date, message, source rule and actions (open invoice, mark done, plan date); completed tasks                                                                                                                                                                                                                        |
| Payment proof    | `/fira`                                          | Upload with consent; per document: matched lines with amount, reference and source text, purpose code, match, state, reason, confidence and confirm or reject                                                                                                                                                                           |
| Dashboard        | `/dashboard`                                     | Explanation; widgets and question box; empty state when there are no invoices                                                                                                                                                                                                                                                           |
| Calendar         | `/calendar`                                      | Term explanations; legend; interactive calendar (tasks movable, legal deadlines locked); accessible list of overdue and next 10 deadlines                                                                                                                                                                                               |
| GST sales return | `/gstr1` (**fixed**, `?period=`)                 | Period selection; preview tables; download; message and link to Profile when unavailable                                                                                                                                                                                                                                                |
| Advance tax      | `/advance-tax` (**fixed**, `?taxYear=`)          | Inputs (tax year, INR rates, estimated tax); receipts by currency; presumptive-scheme eligibility; instalment schedule; every figure labelled as an estimate with its citation                                                                                                                                                          |

### CA workspace

| Page                | URL                           | Required sections                                                                                                                                                                                 |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clients (portfolio) | `/ca` (**fixed**, CA landing) | Portfolio dashboard and question box; client table (health, unpaid, overdue, next deadline, missing proof, approvals waiting, shared since), most overdue first; empty state pointing to Requests |
| Client records      | `/ca/clients/[id]`            | Read-only label and shared-since date; stop managing; health; invoices; deadlines; GST sales return for a period; approvals waiting (count only); no-access state when sharing ends               |
| Calendar            | `/ca/calendar`                | Read-only calendar across clients; accessible deadline list with client names                                                                                                                     |
| Requests            | `/ca/requests`                | Invitation-code entry; pending requests with accept or decline; empty state telling the CA which email the client must use                                                                        |

### System pages

| Page      | Required behaviour                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------- |
| Loading   | Show page structure while loading, with a text label for assistive technology                            |
| Error     | Explain that the page could not load and nothing was sent to PayPal; retry; keep navigation visible (§6) |
| Not found | Say the page does not exist; link to the user's home (Today, CA Clients or `/`, by role)                 |

## 5. Navigation

**Global structure**
- Three separate areas: public, freelancer workspace, CA workspace. Each signed-in workspace has one persistent navigation: a sidebar on large screens and a menu on small screens. Navigation closes after choosing a link, and Escape closes the menu.
- Freelancer navigation is grouped by job, in the order of a month's work: **Today**; **Set up** (Profile, Health check, Clients); **Bill and get paid** (Invoices); **Close the month** (Monthly close, Tasks, Payment proof); **Reports** (Dashboard, Calendar, GST sales return, Advance tax).
- CA navigation: **Clients**, **Calendar**, **Requests**.
- The current page is marked in the navigation. Monthly close shows the count of approvals waiting, so the core promise is always visible.
- The signed-in email, sign-out, the sandbox marker and the footer (disclaimer, sandbox, not-advice and source links) are on every workspace page.
- A skip link reaches the main content first.

**Entry and exit**

| Event                                                   | Destination                                 |
| ------------------------------------------------------- | ------------------------------------------- |
| Freelancer signs in or signs up (email, PayPal or demo) | `/overview`                                 |
| CA signs in or signs up (email or demo)                 | `/ca`                                       |
| Session missing on a freelancer page                    | `/login`                                    |
| Session missing on a CA page                            | `/ca/login`                                 |
| CA opens a freelancer URL, or freelancer opens a CA URL | Their own home (`/ca` or `/overview`)       |
| Signs out                                               | Their sign-in page                          |
| CA loses access to a client                             | No-access message with a link back to `/ca` |

**Cross-links that must exist**

| From                                        | To                                                                                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Today tiles and section headers             | Monthly close, Calendar, Health check (or Profile if incomplete), Tasks, Invoices                                                 |
| Today recent invoices, Tasks                | The invoice card (`/invoices#invoice-<id>`)                                                                                       |
| Calendar and deadline lists                 | The item behind each deadline (generated by the API: `/tasks#task-<id>`, `/gstr1?period=…`, `/advance-tax?taxYear=…`, `/profile`) |
| Health check, GST sales return, Advance tax | Profile, to fix missing data                                                                                                      |
| Monthly close summary                       | Payment proof, when proof is missing (today it is text only; make it a link)                                                      |
| Calendar                                    | Tasks, to plan dates without dragging                                                                                             |
| CA portfolio                                | Each client's records; Requests from the empty state                                                                              |
| Public pages                                | Sign in, sign up, CA portal, disclaimer                                                                                           |

**Navigation rules**
- An anchored link (`#invoice-<id>`, `#task-<id>`) scrolls to a visibly highlighted item.
- Page state worth sharing or revisiting lives in the URL (GSTR-1 period, advance-tax inputs), so back and refresh keep it.
- Navigating away never loses an approval decision: approvals complete or fail on the server, and the result is shown on return.
- Page titles, navigation labels and browser tab titles use the same name for each page (§6).

## 6. Gaps and open decisions

Ranked by impact. Each is a behaviour change, so decide before the redesign starts.
1. **Navigation disappears on page errors.** Today one root error page replaces the whole workspace. Requirement: the error appears inside the workspace with navigation intact.
2. **GST content for unregistered freelancers.** PLAN §2 says GST features are hidden for unregistered users, but the navigation always shows GST sales return and LUT terms. Decide: hide them, or keep them with an explanation of why they don't apply.
3. **Consistent page names.** Payment proof is titled "FIRA" in the browser tab; Advance tax is headed "Income tax payments"; GST sales return is titled "GSTR-1". Pick one name per page, with the technical term as the explanation.
4. **Not-found destination.** It always links to Today, which is wrong for CAs and signed-out visitors. Link by role.
5. **Wide tables on phones.** Requirement: on small screens, invoices, payments, payment-proof lines, tasks and the CA portfolio are readable without sideways scrolling.
6. **Chart-only dashboard.** Requirement: the figures behind the dashboard are also available as text or a table.

Not proposed, deliberately: new pages, an invoice detail route (it would break `#invoice-<id>` links), a manual dark-mode toggle, notifications, multi-user teams (out of scope in PLAN §7) and a chat assistant (AI stays inside workflows, PLAN §7).
