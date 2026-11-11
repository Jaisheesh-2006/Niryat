# Niryat design system (Neel)

Neel is Niryat's interface system. Indigo was one of India's first great exports; Neel uses calm indigo surfaces, one marigold signal for "your decision", and dates laid out on a timeline. Every signed-in page uses it. The principles below are what ships; §3 lists every token value and §12 records what was built. The app ships the light theme only (§12).

## Principles

**Product rules the design enforces**
- **Marigold means one thing: waiting for your decision.** It is used only as a fill (`--niryat-accent` with `--niryat-on-accent`): the decision badge, the Approve button and the approvals count. Never as text or decoration. Refund approval stays red because it moves money out.
- **Every legal figure carries its rule.** A deadline, tax figure or eligibility result shows a citation with its rule id from `packages/rules`; the UI never computes them.
- **Sandbox and not advice, on every signed-in page,** in a bar at the top of the main content.
- **Fail in place.** A section that fails to load shows an alert where it would have been and offers Try again; other sections still render. No toasts: results stay on the page.

**Voice**
- Write to the user as "you"; "we" only in errors about Niryat itself. Name Claude when it drafted something.
- Sentence case everywhere, no emoji. Plain words first, official term second: "GST sales return (GSTR-1)", "payment proof (FIRA)", with a term explanation where it first appears.
- Buttons say verb plus object ("Upload FIRA", "Try again"); results say what happened ("Sent to PayPal sandbox.").
- Amounts always carry the ISO currency code (`USD 4,800.00`); dates read `11 Nov` in lists and `11 Nov 2026` in details.

**Colour, type and shape**
- Ground `bg` (mist) with content on `surface` cards; `primary` (indigo) for links, primary buttons, selection and today. Status uses soft/strong pairs: attention (due soon, partial), success (paid, matched), danger (overdue, missing), neutral (settled). Success and danger always add a word and an icon. The sidebar and mobile top bar use the `shell` tokens with a marigold focus ring.
- Indigo replaced green as primary so that "button" and "paid" no longer look alike.
- Bricolage Grotesque (optical size on) for titles; Figtree for everything else, with tabular figures so amounts line up. System monospace only for rule ids and file names. Running text stays within 680px.
- 4px spacing base (4–64px). Every control is at least 44px tall. Radii 10 / 12 / 18 / 24 / pill for inner items, controls, cards, sheets and badges. Cards have shadows, not borders, and no coloured left edges.
- Navigation switches at 1024px; layout margins and title sizes step down below 768px.

**Icons and motion**
- Lucide outline icons on a 24px grid with a 1.5px stroke and `currentColor`: 20px in controls, 16px in badges. Decorative icons are `aria-hidden`; icon-only buttons are labelled. The mark (marigold disc, indigo leaf) appears only in the sidebar and top bar.
- 120ms for colour changes, 200ms for hover and disclosure, easing `cubic-bezier(0.2, 0, 0, 1)`. `prefers-reduced-motion` removes all movement.

**Accessibility targets**
- WCAG 2.2 AA: text pairs at 4.5:1, control borders, focus rings and meaningful icons at 3:1 (ratios from the token notes, not yet measured in a browser; §11).
- Focus is always visible; one `h1` per page; `nav` and `main` landmarks; tables with captions and scopes; visible form labels. Results use `role="status"`, and only blocking errors use `role="alert"`. Text resizes to 200% without loss.

## Implementation plan and record

Status: **approved 2026-11-09 with every recommended answer in §10; implemented in phases A–F** (see §12). Browser checks in phase G await user verification. Assessed 2026-11-09 against HEAD `665c088` (clean working tree).

Source: Neel's token file, component guidelines, decisions and stylesheet, summarised in the principles above and §1–§4.

Constraints: frontend only. No backend, database, API contract or business-logic changes. Routes, authentication and data flows stay as they are. Any behaviour change listed in §7 needs explicit approval first.

## 0. Approach

Neel's Decisions #1 and #11 say: keep the `--niryat-*` token names and restyle the existing components, with no second component library. Its component READMEs use new `nl-` class names, though. Moving every page to `nl-` markup would touch 22 pages, tables in 13 files and about 20 test assertions (`class="btn" data-variant="ghost"`, `class="stat-tile" data-tone=…`, `class="brand-link"`).

Plan: treat `bundle.css` as the spec and port its rules onto the existing selectors in `apps/web/src/app/globals.css` (`.btn`, `.badge`, `.card`, `.stat-tile`, `.nav-item`, `.topbar`, `.citation`, `.banner`, `.table-wrap`…). Do **not** import `bundle.css` directly:
- it loads Google Fonts with `@import`; `next/font` already self-hosts our fonts;
- it uses `--font-sans`, `--font-display` and `--font-mono`, not our `--niryat-font-*`;
- it uses `[data-theme]` and its own `body` rules; that switch exists only for the design system's previews. The app follows `prefers-color-scheme`.

New `nl-` classes appear only for pieces that are genuinely new (for example the sandbox bar).

## 1. Design system inventory (Neel)

- Two themes, light and dark; 49 colour tokens.
- Fonts: Bricolage Grotesque (display, optical size on) for titles; Figtree for everything else; system monospace for rule ids and file names.
- 14 text styles: `display`, `title-1`…`title-4`, `lead`, `body`, `body-strong`, `label`, `small`, `overline`, `amount-lg`, `amount`, `code`.
- Spacing `space-1`…`space-8` (4–64px); radii `inner` 10, `control` 12, `card` 18, `sheet` 24, `pill`; shadows `button`, `card`, `raised`, `popover` (1px rings in dark); sizes (control 44/52, icons 16/20, sidebar 264, panel 480, content 1200, reading 680); z-index tokens; 12/8/4-column grid.
- 16 components: Alert, AppShell, Badge, Button, Card, Citation, DecisionCard, Dialog, Field, Icon, MobileNav, MonthStrip, ReviewPanel, Sidebar, Table, Tabs.
- **No uploaded assets.** The new mark (marigold disc with an indigo leaf) exists only as inline SVG in the previews.

## 2. Existing frontend inventory

- One stylesheet: `apps/web/src/app/globals.css` (2,515 lines). Tokens in `:root`; dark values in `@media (prefers-color-scheme: dark)`. No theme toggle.
- Fonts in `apps/web/src/app/layout.tsx` via `next/font/google`: IBM Plex Sans (`--niryat-font-sans`), IBM Plex Mono (`--niryat-font-mono`), Anek Devanagari (`--niryat-font-display`).
- Layouts: root, `(public)`, `(app)`, `(ca)`; `error.tsx`, `not-found.tsx`, `(app)/loading.tsx`. The app and CA layouts share one shell: skip link, top bar, `aside#nav-menu` (native popover on mobile), `SidebarResize`, `main`, `SiteFooter`.
- Shared components in `apps/web/src/components`; status tones in `apps/web/src/lib/status.ts` (`Tone = success | attention | danger | neutral`).
- Sponsor consumers of tokens: Bryntum reads `--niryat-cat-*` (`lib/calendar.ts`) and the `.niryat-overdue|upcoming|past` classes; AG Studio reads `primary`, `surface`, `text`, `muted`, `accent`, `neutral-strong`, `danger`, `font-sans` (`components/Dashboard.tsx`).
- Icons in `components/icons.tsx` (22, Lucide style). Already present: `Menu`, `CircleCheck`, `TriangleAlert`, `Loader`. Missing from Neel's list: `X`, `ChevronDown`, `ChevronRight`, `Info`, `RefreshCw`, `Send`, `CircleX`, `Clock`.

## 3. CSS variable mapping

Names are kept; values come from Neel `tokens.json`.

| Existing `--niryat-*`                                   | Light                                       | Dark                                        |
| ------------------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| `bg` / `surface` / `sunken`                             | #F3F2F9 / #FFFFFF / #ECEAF5                 | #15132E / #1E1A4D / #100E24                 |
| `border` / `border-strong`                              | #DCD9EE / #7C78A3                           | #2E2A5C / #6E69A0                           |
| `text` / `muted`                                        | #1C1A33 / #55527A                           | #ECEBF7 / #ABA7CF                           |
| `primary`, `-hover`, `-soft`, `-strong`, `on-primary`   | #3B348C, #2E2873, #E8E6F7, #2A2470, #FFFFFF | #A9A2F5, #C3BEFA, #2B2666, #D6D2FF, #1E1A4D |
| `accent` / `on-accent`                                  | #F2A93B / #1E1A4D                           | same                                        |
| `attention-soft` / `-strong`                            | #FDF0DA / #8A5300                           | #3A2C12 / #FFD08A                           |
| `danger`, `on-danger`, `-soft`, `-strong`               | #B4432F, #FFFFFF, #FBE9E5, #8F3221          | #FF9F8C, #3B0E06, #3D1A16, #FFC4B8          |
| `neutral-soft` / `-strong`                              | #ECEAF5 / #3A3760                           | #2B2856 / #D2CFEA                           |
| `overdue` / `upcoming`                                  | alias of `danger` / `primary`               | same                                        |
| `past`, `event-text`                                    | #6B6890, #FFFFFF                            | #B6B3CF, #1E1A4D                            |
| `cat-gst` / `cat-income-tax` / `cat-rbi` / `cat-paypal` | #3B348C / #7A3E8F / #8A5300 / #2F6A8A       | #C3BEFA / #E0B2EE / #F5C77E / #9ED0EA       |
| `shadow-card` / `-raised` / `-popover` / `-button`      | Neel values                                 | 1px rings (Neel values) instead of `none`   |
| `backdrop`                                              | rgba(14, 12, 34, 0.55)                      | rgba(0, 0, 0, 0.6)                          |
| `radius-control` / `radius-card`                        | 8 → **12** / 12 → **18**                    | —                                           |
| `space-1`…`space-8`, `radius-pill`                      | unchanged                                   | —                                           |
| `sidebar-width`                                         | 248 → 264 (see Q3)                          | —                                           |
| `font-sans` / `font-display` / `font-mono`, `display`   | names kept, new faces                       | —                                           |
| `chevron` (select arrow)                                | kept; stroke recoloured to Neel `muted`     | dark variant                                |
- **Renamed** (Neel asks for these names; nothing outside `globals.css` uses the old ones): `banyan` → `shell`, `banyan-raised` → `shell-raised`, `on-banyan` → `on-shell`, `on-banyan-muted` → `on-shell-muted`, `banyan-line` → `shell-line`, `mint` → `shell-accent`.
- **Added:** `neel-900`, `neel-600`, `neel-300`, `mist`, `marigold`, `leaf`, `kumkum`, `accent-hover`, `success`, `success-soft`, `success-strong`, `focus`, `focus-on-shell`, `radius-inner`, `radius-sheet`, `control-height`, `control-height-lg`, `icon-sm`, `icon-md`, `content-max`, `reading-max`, `z-sticky`, `z-pill`, `z-overlay`, `z-modal`.
- **Dropped:** `brand-green`, `brand-saffron`, `guilloche`, and the left-edge "voucher" accent on cards (Neel: no coloured left borders).
- **Not variables:** breakpoints, because `@media` cannot read custom properties.

## 4. Component mapping

| Neel         | Existing                                                              | Verdict                                                                                                                         |
| ------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Alert        | `.banner`, `CardFallback` (in `CardBoundary.tsx`), `PayPalLoginError` | Refactor CSS; markup and test hooks stay                                                                                        |
| AppShell     | `(app)` and `(ca)` layouts, `.app-shell`, `.content`, `PageHeader`    | Refactor; sandbox bar added (Q5)                                                                                                |
| Badge        | `StatusBadge`, `ApprovalsBadge` (`.nav-count`)                        | Reuse; add `decision` tone (Q1)                                                                                                 |
| Button       | `.btn` with `primary`, `secondary`, `ghost`, `danger`                 | Restyle; `ghost` keeps its name and takes Neel's "quiet" style; `decision` variant (Q1)                                         |
| Card         | `.card`, `.stat-tile`, `.empty-state`, `EmptyState`                   | Restyle; tiles stop tinting by status                                                                                           |
| Citation     | `.citation`, `Term`                                                   | Restyle `.citation`; `Term` behaviour kept (Q6)                                                                                 |
| DecisionCard | `ApprovalCard`, `OverviewApprovals`                                   | Restyle with the decision badge (Q1)                                                                                            |
| Dialog       | none                                                                  | Skip unless Q4 says yes                                                                                                         |
| Field        | element-level `input`, `select`, `textarea`, `label`, `.form-grid`    | Restyle; no markup change                                                                                                       |
| Icon         | `icons.tsx`                                                           | Add only icons in use: `X`, `Info`, `Clock`, `RefreshCw`; `Send`, `CircleX`, `ChevronDown`, `ChevronRight` only if needed later |
| MobileNav    | `.topbar` plus native popover menu                                    | Restyle; decisions pill deferred (Q2)                                                                                           |
| MonthStrip   | `ComplianceCalendar`, `.deadline-list`                                | Skip the strip; restyle `.deadline-list` as the agenda (Q7)                                                                     |
| ReviewPanel  | `ActionButtons` inline "See what will be sent" disclosure             | Behaviour change; restyle the disclosure only (Q1)                                                                              |
| Sidebar      | `NavLinks`, `SidebarResize`                                           | Restyle groups as the "month path" in CSS only; no done/current states (Q2)                                                     |
| Table        | `.table-wrap`, tables in 13 files                                     | Restyle; stacking needs `data-label` in all 13 files (Q8)                                                                       |
| Tabs         | none (Bryntum has its own controls)                                   | Skip: nothing uses tabs                                                                                                         |

## 5. Pages and layouts in scope

- Layouts: root, `(public)`, `(app)`, `(ca)`, `error.tsx`, `not-found.tsx`, `(app)/loading.tsx`.
- Public: `/`, `/login`, `/signup`, `/ca/login`, `/ca/signup`, `/disclaimer`.
- Freelancer: `/overview`, `/profile`, `/health-check`, `/clients`, `/invoices`, `/close`, `/tasks`, `/fira`, `/dashboard` (AG Studio), `/calendar` (Bryntum), `/gstr1`, `/advance-tax`.
- CA: `/ca`, `/ca/calendar`, `/ca/clients/[id]`, `/ca/requests`.

## 6. Fonts, assets, dark mode, responsive rules

- **Fonts:** `next/font/google` with `Bricolage_Grotesque` (opsz axis) and `Figtree`, keeping the `--niryat-font-display` and `--niryat-font-sans` variables. IBM Plex Mono is dropped in favour of the system monospace stack under `--niryat-font-mono`. Anek Devanagari is dropped (Q9). Verify the Bricolage axis config against the version-matched Next docs before writing it.
- **Assets:** Neel has no uploaded logo; copy the mark's SVG from its preview into `BrandMark` in `icons.tsx`.
- **Dark mode:** keep `prefers-color-scheme`. Do not add a theme toggle or `[data-theme]`.
- **Responsive:**
  - Breakpoints move from 640/900/1024/1280 to 768/1024 (plus 480 and 1440).
  - Navigation switches at 1024px; side panels become bottom sheets below 768px.
  - `title-1` drops to 30px below 768px; every control is at least 44px tall.
  - Grid 12/8/4 columns; page margins 40/24/16; content max 1200px.

## 7. Decisions that would change behaviour

None of these happen without explicit approval.
1. **Approve moves into a ReviewPanel** and off the card. Changes the approval flow; Neel marks it as needing its own task and tests.
2. **Mobile decisions pill and sidebar done/current station states.** Both need new data fetches in the layout. `apps/web/AGENTS.md` says the mobile top bar has no badge, on purpose.
3. **Removing `SidebarResize`.** Neel's sidebar is fixed width; the resize is a "user-approved styling exception" in `apps/web/AGENTS.md`.
4. **Confirm dialogs** before Stop sharing, Stop managing, Mark task done and Upload FIRA. Each adds a step that does not exist today.
5. **Sandbox and not-advice bar at the top** of every signed-in page. Today it is in the footer.
6. **`Term` becomes an expandable button** instead of inline "plain words (TERM)".
7. **Month strip** on Today and Monthly close: a new feature.
8. **Tables stack into label/value rows** on narrow containers: markup changes in 13 files.
9. **Brand drops the Devanagari "निर्यात"** and becomes lowercase "niryat". `Brand.test.tsx` asserts the Devanagari span.
10. **Copy changes:** the "Waiting for your approval" badge, a "Drafted by Claude · date" line, "Approve and send".

## 8. Git state at assessment

- Working tree clean; nothing modified or untracked. HEAD `665c088`.
- The previous visual refresh ("export voucher" and "banyan" shell) is `9d2a2c2` and `828624c`. Neel restyles the same files again: `globals.css`, the three route-group layouts, root `layout.tsx`, `Brand.tsx`, `Brand.test.tsx`, `AuthAside.tsx`, `SyncFreshness.tsx`, `JudgeEntry.tsx`, `Gstr1Report.tsx`, `TaskPlanForm.tsx`, and 12 pages.

## 9. Phases

### A. Design tokens and global styling

- Files: `apps/web/src/app/globals.css` (`:root` and the dark block only); `apps/web/AGENTS.md` (point "visual source of truth" at Neel and this file); `docs/BRYUNTUM.md` and `docs/AG_STUDIO.md` (their colours change, so the sponsor-doc rule applies).
- Depends on: nothing.
- Done when: every token in §3 is defined in both themes; no rule in `globals.css` still uses a renamed or dropped token; `pnpm verify` passes; Bryntum and AG Studio variables still resolve.

### B. Typography and fonts

- Files: `apps/web/src/app/layout.tsx`; type and `.display` rules in `globals.css`; `Brand.tsx`, `Brand.test.tsx`, `AuthAside.tsx` only if Q9 is yes.
- Depends on: A.
- Done when: `pnpm build` passes; no runtime Google Fonts requests; amounts use tabular figures.

### C. Shared UI primitives

- Files: component sections of `globals.css` (`.btn`, `.badge`, `.card`, `.stat-tile`, `.empty-state`, `.citation`, `.banner`, fields, `.table-wrap`, focus, motion); `components/icons.tsx` and `icons.test.tsx`; `lib/status.ts`, `lib/status.test.ts` and `overview/page.test.tsx` only if Q1 adds the `decision` tone.
- Depends on: A, B.
- Done when: existing assertions pass unchanged except the tone assertions Q1 approves; controls are at least 44px; focus ring visible everywhere; reduced motion removes movement.

### D. Application layout and navigation

- Files: shell, sidebar, top bar and footer sections of `globals.css`; `(app)/layout.tsx` and `(ca)/layout.tsx` (sandbox bar, Q5); `SidebarResize.tsx` and its test (default 264, Q3); `BrandMark` in `icons.tsx`; `SiteFooter.tsx` (Q5).
- Depends on: C.
- Done when: auth redirects, skip link, popover menu (closes on navigation and Escape) and CA nav behave exactly as before; `(app)/layout.test.tsx` and `(ca)/layout.test.tsx` pass.

### E. Individual page templates

- Files: mostly `globals.css` (`.overview-grid`, `.stat-grid`, `.page-header`, `.auth-*`, `.public-*`, `.close-*`, `.fira-lines`, `.calendar-legend`, `.b-cal-*` overrides); `overview/page.tsx` only if its grid classes change; table markup only if Q8 is yes.
- Depends on: D.
- Done when: every page test passes; `invoice-<id>` anchors kept; approval cards and dispute alerts still render.

### F. Responsive implementation

- Files: `@media` and `@container` rules in `globals.css`.
- Depends on: E.
- Done when: no horizontal scroll at 360px; sidebar/top bar switch at exactly 1024px; pages usable with text at 200%.

### G. Visual QA and regression testing

- Commands: `pnpm --filter @niryat/web test`, `pnpm verify`, `pnpm build`.
- Manual browser checks (performed by the user, per `AGENTS.md`): every route in §5 in light and dark at 375, 768, 1024 and 1440px; keyboard-only through nav, forms, approve and reject; one sandbox approval and one rejection end to end; Bryntum calendar and AG Studio dashboard in both themes.
- These stay "awaiting user verification" until confirmed.

## 10. Decisions (approved 2026-11-09)

The user approved every recommended answer, shown in brackets.
1. Should a ReviewPanel replace Approve on the card? [Not now. Keep the inline disclosure, give the card's Approve the marigold `decision` style, map `proposed` to the `decision` tone.]
2. Mobile decisions pill and sidebar station states? [Skip both.]
3. Keep `SidebarResize`? [Yes, default moved to 264px.]
4. Add confirm dialogs? [No.]
5. Sandbox bar at the top? [Yes, and remove the duplicate text from the app footer.]
6. `Term` as an expandable button? [No, keep inline.]
7. MonthStrip? [Skip; restyle the existing deadline list.]
8. Stacking tables? [Not now; keep horizontal scroll inside the wrapper.]
9. Drop the Devanagari wordmark? [Yes, follow Neel; update `Brand.test.tsx`.]
10. Copy changes in §7 item 10? [Only the badge label.]

## 11. Known limits of this assessment

- Only the component READMEs and `bundle.css` were read; the 16 preview HTML files were not inspected beyond that.
- Neel's new colour values have not been checked in a browser. Contrast ratios come from Neel's token notes.
- About 2,000 lines of existing component CSS are restyled in place; tests check markup, not appearance, so visual regressions surface only in the phase G browser checks.

## 12. Implementation record (2026-11-09)

Phases A–F are implemented as planned with the §10 answers. Frontend only: no API, database, rules, route or auth change.

What changed:
- **Tokens** (`apps/web/src/app/globals.css`): every value in §3 for both themes; `banyan*` and `mint` renamed to `shell*` and `shell-accent`; `brand-green`, `brand-saffron` and `guilloche` removed; `--niryat-font-mono` is now the system monospace stack; `--niryat-ease` added for Neel's motion curve.
- **Fonts** (`apps/web/src/app/layout.tsx`): Figtree (`--niryat-font-sans`) and Bricolage Grotesque with the `opsz` axis (`--niryat-font-display`) through `next/font/google`. IBM Plex Sans, IBM Plex Mono and Anek Devanagari are no longer loaded.
- **Components, by CSS on the existing classes:** 44px buttons, fields, summaries and nav links; Neel radii and shadows; cards without borders; badges without dots, with mask icons on success and danger (markup unchanged); alerts (`.banner`) without the coloured left edge; Today tiles with an overline label and an `amount-lg` figure in text colour, no status tint; sync freshness as a plain line; the month path drawn on the sidebar's nav groups; the voucher edge, guilloche print and perforation replaced by a hairline above the decision row.
- **Decision tone:** `Tone` gains `decision`; `proposed` actions show the marigold "Your decision" badge (`lib/status.ts`). Approve buttons use the new `decision` button variant (`ActionButtons.tsx`); **refund approval stays `danger`**, as before, because it moves money out. The home page's static example card matches.
- **Shell:** `SandboxBar` (in `SiteFooter.tsx`) renders the existing "PayPal sandbox only · Not tax or legal advice · Disclaimer" line above `main` in the app and CA layouts; the app footer drops that duplicate text and keeps the Disclaimer link. The "Sandbox" pills in the top bar and menu are removed. Sidebar default width is 264px; resizing still works from 224 to 384px.
- **Brand:** new mark (marigold disc, indigo leaf and seed) in `BrandMark`; the wordmark is "Niryat" in the DOM, lowercase in CSS. The Devanagari wordmark and the Devanagari watermarks on the auth panel and home hero are gone with the font.
- **Breakpoints:** 768px (two-column forms, phone margins, 30px titles) and 1024px (sidebar, four tiles, Today's 2:1 grid, auth side panel). Today's tiles are two-up on phones. Page content stops at 1200px except Dashboard and Calendar.
- **Docs:** `apps/web/AGENTS.md`, `docs/AG_STUDIO.md`, `docs/BRYUNTUM.md`.

Not built, as decided: ReviewPanel, mobile decisions pill, sidebar station states, confirm dialogs, Tabs, MonthStrip, stacking tables, expandable `Term`, the four optional icons. No new dependency.

Tests changed to match approved changes: `status.test.ts` and `ActionButtons.test.tsx` (badge label and tone), `Brand.test.tsx` and `icons.test.tsx` (new mark, no Devanagari), `SidebarResize.test.tsx` (264 default); both layout tests now assert the sandbox bar.

### Audit fixes (2026-11-09)

A token audit matched every Neel colour, spacing, radius, size and z-index value in both themes. The user then approved these fixes:
- **Sign-in and sign-up panel** (`AuthAside`, all four auth pages): the user asked that the panel not look empty. It now carries the Niryat wave print, as on cheques and stamp paper, in `shell-accent` lines fading toward the promises. A PayPal image was not used: PayPal's identity is not Niryat's brand (frontend plan §4.1). The panel uses `radius-card`. Under forced colours the print is hidden.
- **Upcoming deadlines** on Today and the CA client page use the neutral tone. As "success" they carried the new check icon and read as done.
- **Alerts** (`.banner`) lead with their tone's icon in CSS: info, circle-check, clock, triangle-alert. Banners that already render an icon keep it. Markup is unchanged.
- **Dashboard charts:** AG Studio's second palette colour is `--niryat-cat-paypal` instead of marigold, which Neel reserves for decisions.
- **Auth pages:** the extra logo inside the form card is removed; Neel shows the mark only in the top bar and sidebar.

Still open for the user: the mark reads like "!" at small sizes (Neel's own SVG), and the generic "Something went wrong. Try again." fallback in `lib/forms.ts` breaks Neel's voice rule (copy change not approved).

Verification after the audit fixes: web tests 570/570 (no test changes needed), `corepack.cmd pnpm verify` 27/27, `corepack pnpm build` 9/9 with a fresh Next build. Browser checks of the sign-in panel, alerts, Today deadlines and the dashboard charts await user verification.

### Light theme only (2026-11-09)

The user decided Niryat ships the light theme only. The `@media (prefers-color-scheme: dark)` block is removed from `globals.css`; `:root` keeps `color-scheme: light`, so a browser in dark mode still renders the light pages and light native controls. Neel's dark token values, the dark ring shadows and the dark outlines on the sidebar, hero and auth panel no longer apply. Phase G browser checks are now light only.

### Generic error copy (2026-11-09)

The user approved rewording the generic form fallback in `apps/web/src/lib/forms.ts` to follow Neel's voice rule: no "Something went wrong", no apology. It now reads "We couldn't complete this request. Try again." It deliberately does not add Neel's "nothing was sent to PayPal": the same fallback is returned when an invoice or refund approval fails with an unknown outcome, and that claim could be false there. Reminder approvals keep their own message. Test expectations in `forms.test.ts` and `CaShareCard.test.tsx` follow the new string.
