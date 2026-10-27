# Rules and sources

These 12 rules come from [PLAN section 9](PLAN.md#9-rules-engine). On **2026-10-25** each one was checked against primary sources: CBIC, the RBI, the e-Gazette and Income-tax Act text. Secondary sites were used only to locate primary documents.

Each YAML entry has `review: source_checked` (it matches primary text) or `review: unchecked`. `logic` stays `TODO` until the rule is implemented with tests. No CA review is planned for the hackathon; that is a disclosed limitation ([PLAN section 23](PLAN.md#23-disclaimer)), and the app shows "verify with your CA" beside every rule-based statement.

Status key:
- **Source-checked:** the claim matches primary text.
- **Partly unconfirmed:** part of the claim could not be opened or confirmed.

## Summary

| Rule ID                  | Statement (as of 2026-10-25)                                                                                                                                                                                                                            | Primary citation                                                                                                                        | In force from                            | Status                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| `EXPORT_CONDITIONS`      | Export of services only if all five hold: supplier in India; recipient outside India; place of supply outside India (default: recipient's location); paid in convertible foreign exchange or RBI-permitted INR; not merely establishments of one person | IGST Act s. 2(6)(i)–(v), s. 13(2)                                                                                                       | 2019-02-01 (cl. (iv) wording)            | Source-checked                                            |
| `LUT_REQUIRED`           | Registered exporter files a LUT (FORM GST RFD-11) before export, once per financial year. If payment is not received within 1 year of invoice (or the FEMA period, if later), IGST plus interest is due within 15 days                                  | IGST s. 16(1),(3); CGST Rules r. 96A(1)(b); Notfn 37/2017-CT                                                                            | 2024-07-10 (r. 96A(1)(b) as substituted) | Source-checked                                            |
| `EXPORT_INVOICE_FIELDS`  | Rule 46 particulars plus the export endorsement (exact text below), recipient name and address, delivery address and country of destination                                                                                                             | CGST Rules r. 46 export proviso                                                                                                         | 2024-11-01 (Notfn 20/2024-CT)            | Source-checked                                            |
| `INVOICE_NUMBERING`      | Consecutive serial number of at most 16 characters (letters, digits, `-`, `/`), one or more series, unique per financial year                                                                                                                           | CGST Rules r. 46(b); r. 53(1A)                                                                                                          | 2017-07-01                               | Source-checked                                            |
| `CREDIT_NOTE`            | Supplier **may** issue a credit note when value falls or a supply is refunded. Declare it by 30 November after the financial year end, or the annual-return date if earlier. For LUT exports it only corrects value                                     | CGST Act s. 34(1)–(2); r. 53(1A); GSTR-1 Table 9B                                                                                       | 2025-10-01 (latest s. 34(2) change)      | Source-checked; "mandatory at zero tax" unconfirmed       |
| `GST_THRESHOLD`          | Must register once all-India aggregate turnover (exports included) exceeds ₹20 lakh (₹10 lakh in remaining special-category States). Services exporters at or below that are exempt from compulsory inter-State registration                            | CGST s. 22(1), s. 2(6), s. 24(i); IGST s. 7(5)(a); Notfn 10/2017-IT as amended by 03/2019-IT                                            | 2020-01-01                               | Source-checked                                            |
| `GSTR1_6A`               | Exports go in GSTR-1 Table 6A, LUT exports at zero tax, shipping bill may be omitted. Due the 11th of the next month (monthly) or the 13th after the quarter (QRMP)                                                                                     | GSTR-1 Table 6A, instr. 8 and 11; CGST s. 37(1); r. 59; Notfn 83/2020-CT                                                                | 2021-01-01                               | Source-checked; JSON file format unconfirmed              |
| `PURPOSE_CODES`          | Suggest only the receipt codes PayPal India offers (14, listed below). Show the Annex I description as the description of record. Never suggest the goods or travel codes. The bank assigns the final code                                              | Annex I Part B to A.P. (DIR Series) Circ. 84 (2012-02-29), modified by Circ. 50 (2016-02-11); PayPal India code list                    | 2012-04-01                               | Source-checked                                            |
| `RBI_REALISATION`        | Realise and repatriate full (or AD-reduced) value within **9 months from invoice date**, or 12 months if invoiced or settled in INR. The AD bank may extend                                                                                             | FEMA (Export **and Import** of Goods and Services) Regulations, 2026, FEMA 23(R)/2026-RB Reg 5(1)(a), amended by FEMA 23(R)/(1)/2026-RB | 2026-10-01                               | Source-checked; transition for older invoices unconfirmed |
| `REALISATION_ADJUSTMENT` | Refund or lost dispute = under-realisation. It reduces export value **only when the AD bank allows it**; for invoices up to ₹10 lakh the exporter's declaration may suffice                                                                             | FEMA 23(R)/2026-RB Reg 6, Reg 4(2) proviso                                                                                              | 2026-10-01                               | Source-checked; refund after repatriation unconfirmed     |
| `PRESUMPTIVE_TAX`        | Resident individual or non-LLP firm in a specified profession (includes **information technology**). Deemed income is 50% of gross receipts, or actual profit if higher. Limit ₹50 lakh, or ₹75 lakh if cash receipts ≤ 5%                              | Income-tax Act 2025 s. 58(2) Table Sl. 3, s. 58(11)(b), s. 62(4); 1961 s. 44ADA for earlier years                                       | 2026-04-01                               | Source-checked                                            |
| `ADVANCE_TAX_DATES`      | Cumulative 15% / 45% / 75% / 100% by 15 Jun / 15 Sep / 15 Dec / 15 Mar. s. 58 presumptive filers pay 100% by 15 Mar. Not payable if tax for the year < ₹10,000                                                                                          | Income-tax Act 2025 ss. 403, 404, 408; interest ss. 424, 425 (1961: ss. 207–211, 234B, 234C)                                            | 2026-04-01                               | Source-checked                                            |

## Details and caveats

### GST

- **EXPORT_CONDITIONS**
  - Place of supply exceptions in s. 13(3): services that need the client physically present are supplied where they are performed. On-site work in India is therefore not an export.
  - The intermediary rule s. 13(8)(b) was **omitted by Finance Act 2026, s. 157 (2026-03-30)**, so intermediary services now follow the default rule. The commencement date of the omission is unconfirmed.
  - Whether PayPal settlement in INR satisfies clause (iv) is a FEMA question.
- **LUT_REQUIRED**
  - Only registered persons can file a LUT.
  - Persons prosecuted for tax evasion above ₹250 lakh are excluded (Notfn 37/2017-CT).
  - The alternative is exporting on payment of IGST and claiming a refund (Notfn 01/2023-IT as amended by 05/2023-IT).
  - The app should prompt LUT renewal every April.
- **EXPORT_INVOICE_FIELDS**
  - Exact endorsement for LUT exports: `SUPPLY MEANT FOR EXPORT/SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX`.
  - Foreign-currency invoice values are converted under CGST Rules r. 34. That text was not opened.
  - The number of HSN/SAC digits required depends on turnover. Not checked.
- **INVOICE_NUMBERING**
  - Validate with `^[A-Za-z0-9/-]{1,16}$`. Characters such as `_` and `#` are not allowed.
  - Niryat's format is `<FY>/<seq>` with a sequence padded to at least four digits, e.g. `2026-27/0001`; `invoiceNumberFor` implements the format and the database serializes allocation per user and financial year. This is the product's format within the rule's constraints.
  - Recurring PayPal invoices must take numbers from the same series.
  - P3-1 found that PayPal accepted a series invoice number but omitted it on read-back. P3-15's user screenshot (2026-10-27) lists the first invoice as `2026-27/0002` under an active monthly series; future-cycle numbering and cycle adoption into Niryat remain pending. See [verification V04](verification.md#v04-recurring-invoices); the full recurring-cycle numbering acceptance criterion stays open.
- **CREDIT_NOTE**
  - s. 34 says "may". Issuing a credit note keeps GSTR-1 export value and refund figures correct, so recommend it rather than state it is required.
- **GST_THRESHOLD**
  - Turnover counts every business under the same PAN, and includes exempt supplies.
  - Other s. 24 triggers can force registration regardless of turnover, for example reverse charge or e-commerce operators collecting TCS. Not checked for foreign freelance platforms.
  - The special-category list is taken from s. 22 Explanation (iii). Article 279A was not opened.
- **GSTR1_6A**
  - GSTR-1 instruction 8 lets Table 6 accept entries without shipping-bill details. No primary text says explicitly that shipping-bill details are optional for services.
  - The codes `EXPWP`/`EXPWOP` belong to the offline tool. The portal publishes only the Returns Offline Tool (V3.2.4) and no JSON schema.
  - Due dates are often extended by notification. Model them as a general rule plus per-period overrides.

### RBI / FEMA

- **New regulations**
  - Notified 2026-01-13 and gazetted 2026-01-15, in force **2026-10-01**. They supersede FEMA 23(R)/2015-RB, except for things already done.
  - Amended before commencement on 2026-09-22 by FEMA 23(R)/(1)/2026-RB, which changed 15 months to 9 and 18 months to 12.
  - The companion directions are A.P. (DIR Series) Circular No. 20, RBI/2025-26/194 (2026-01-16). They replace the Master Direction on Export of Goods and Services from 2026-10-01.
- **History under the 2015 regulations, Reg 9:**
  - 9 months originally.
  - 15 months by FEMA 23(R)/(7)/2025-RB, effective 2025-11-14.
  - Back to 9 months by FEMA 23(R)/(8)/2026-RB, effective 2026-06-05.
  - Neither change has a transition clause. Which period applies to invoices dated 2025-11-14 to 2026-06-04 is **unconfirmed**. **Decision (2026-10-25):** the app uses 9 months for every invoice, the earlier and therefore safer deadline. It marks invoices dated in that window "may have 15 months; confirm with your bank".
- **New obligation:** from 2026-10-01, Reg 3(2) requires a services exporter to file an **EDF** within 30 days from the end of the month in which the invoice was raised.
  - One EDF may cover a whole month.
  - Exporters of non-software services may file it on or before the date the payment is received.
  - The AD bank may extend the deadline.
  - This is a compliance-calendar candidate, not yet a rule here.
- **Reg 13:** if proceeds stay unrealised for more than one year past the due or extended date, further exports are allowed only against full advance payment or an irrevocable letter of credit.
- **PayPal:** cross-border payment aggregators fall under the RBI Master Direction on Payment Aggregators (2025-09-15).
  - It caps each transaction at ₹25 lakh.
  - It sets no purpose-code or realisation-period rule of its own, so realisation still follows the FEMA regulations.
  - Whether PayPal India holds PA-CB authorisation is unconfirmed.
  - The regulations do not say whether money sitting in a PayPal balance counts as "realised and repatriated". Treat realisation as complete only when the money reaches the Indian bank (FIRA).
- **PURPOSE_CODES**
  - On 2026-10-25 the 2012 Annex I Part B (receipts) was checked against the circular text the team supplied (RBI/2011-12/413). Circ. 50 (RBI/2015-16/317), the latest circular that changes purpose codes, only discontinues `P0105` and `P0107` (goods export bills) and redefines `S0023`. It changes none of the 14 codes below.
  - PayPal India lets a seller choose only the codes below, so the catalogue holds only these. The PayPal label is the UI label; the Annex text is the description of record.

    | Code    | PayPal label                                | Annex I description                                                                                                | Suggest for freelance services?              |
    | ------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
    | `P0104` | Cross border delivery of goods and services | Receipts against export of goods not covered by GR/PP/SOFTEX/EC copy of shipping bill (intermediary/transit trade) | **Never**: goods, not services               |
    | `P0301` | Business related travel purchase            | Purchases towards travel (TCs, currency notes, TT/SWIFT transfers)                                                 | **Never**: travel                            |
    | `P0801` | Hardware consulting                         | Hardware consultancy/implementation                                                                                | Yes                                          |
    | `P0802` | Software consulting                         | Software consultancy/implementation (other than those covered in SOFTEX form)                                      | Yes; the default for software work           |
    | `P0803` | Data processing consulting                  | Data base, data processing charges                                                                                 | Yes                                          |
    | `P0805` | Freelance journalism                        | News agency services                                                                                               | Yes                                          |
    | `P0806` | Other information services                  | Other information services: subscription to newspapers, periodicals, etc.                                          | Rarely: the Annex scope is narrow            |
    | `P0902` | Licensing revenues                          | Receipts for use, through licensing, of produced originals or prototypes, patents, copyrights, trademarks, etc.    | Yes: licensing and royalties                 |
    | `P1004` | Legal                                       | Legal services                                                                                                     | Yes                                          |
    | `P1005` | Accounting and tax                          | Accounting, auditing, book keeping services                                                                        | Yes; the Annex puts tax consulting in P1015  |
    | `P1006` | Business and management consultancy         | Business and management consultancy and public relations services                                                  | Yes                                          |
    | `P1007` | Advertising and market research             | Advertising, trade fair service                                                                                    | Yes; the Annex puts market research in P1016 |
    | `P1008` | Research and development                    | Research & Development services                                                                                    | Yes                                          |
    | `P1009` | Architectural services                      | Architectural services                                                                                             | Yes; architecture only                       |

  - Annex codes a freelancer may fit that PayPal does not offer: `P0807` off-site software exports, `P1014` engineering, `P1015` tax consulting, `P1016` market research, `P1022` other technical services. Suggest the nearest offered code and say the bank decides.
  - This settles the earlier caveats. `P1009` is architectural only, not engineering or technical. `P1007` in the Annex excludes market research. `P1401` is compensation of employees.
  - FETERS file layouts, payment (`S`) codes, cover-page codes and the ₹5 lakh aggregation are bank-side reporting, not app rules.
  - The AD bank or payment aggregator assigns the reported code. The app only suggests one.
- **REALISATION_ADJUSTMENT**
  - Record a refund or lost dispute as "reduction pending AD acceptance", never as automatic.
  - The old write-off, reduction and refund circulars are superseded from 2026-10-01.
  - How to handle a refund made **after** the money was repatriated (an outward remittance) is unconfirmed.

### Income tax

- **Income-tax Act, 2025**
  - Act No. 30 of 2025, assented and gazetted 2025-08-21, in force 2026-04-01 (s. 1(3)).
  - s. 3 replaces "previous year / assessment year" with the **tax year**.
  - FY 2025-26 returns (AY 2026-27) remain under the 1961 Act (s. 536(2)(c)).
- **PRESUMPTIVE_TAX**
  - s. 62(4) names "information technology" in the Act itself, so freelance software or IT work qualifies under the 2025 Act.
  - For FY 2025-26 under 1961 s. 44ADA, IT relies on a CBDT notification (reported as S.O. 385(E), 2001), which we could not open.
  - Declaring less than 50% while income exceeds the basic exemption requires books and an audit (s. 58(3), ss. 62–63).
- **ADVANCE_TAX_DATES**
  - The ₹10,000 threshold is tax net of TDS/TCS (s. 405).
  - Resident seniors aged 60+ are exempt only if they have **no** business or profession income (s. 403(3)), so freelancers are not exempt.
  - Interest is 1% a month on default (s. 424, formerly 234B) and on deferment (s. 425, formerly 234C), with safe harbours of 12% by 15 Jun and 36% by 15 Sep.
- **Currency conversion**, not yet a rule: Income-tax Rules, 2026, Rule 206 (G.S.R. 198(E), 2026-03-20, replacing 1962 Rule 115).
  - Professional income is converted at the SBI TT buying rate on the **last day of the tax year**.
  - Amounts received in, or brought into, India before that date are excluded from the year-end rate.
  - Later 2026 amendments to the Rules were not checked.

## Primary sources opened

- **CBIC (current consolidated text):**
  - IGST Act ss. 2, 7, 13, 16
  - CGST Act ss. 2, 22, 24, 34, 37
  - CGST Rules rr. 46, 53, 59, 96A
  - Notifications 37/2017-CT, 12/2024-CT, 20/2024-CT, 83/2020-CT, 10/2017-IT, 03/2019-IT, 01/2023-IT, 05/2023-IT
  - FORM GST RFD-11 and FORM GSTR-1
  - Read through `taxinformation.cbic.gov.in` (`/content/html/...` and `/api/cbic-form-msts/download/...`).
- **RBI:**
  - FEMA 23(R)/2026-RB: [Id=13277](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=13277&Mode=0)
  - Amendment FEMA 23(R)/(1)/2026-RB: [Id=13714](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=13714&Mode=0)
  - 2015 regulations: [Id=10256](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=10256&Mode=0)
  - 2025 amendment: [Id=12923](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12923&Mode=0)
  - 2026 amendment: [Id=13467](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=13467&Mode=0)
  - Directions: [Id=13278](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=13278&Mode=0)
  - Purpose-code circular: [Id=7026](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=7026&Mode=0). Its Annex I was read from the team-supplied text of RBI/2011-12/413, not downloaded from the site.
  - Purpose-code amendment, Circ. 50 (2016-02-11): [Id=10276](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=10276&Mode=0), checked against team-supplied text. The later FETERS circulars change no purpose codes: Circ. 25 (2019), [Id=11505](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=11505&Mode=0); Circ. 13 (2021), [Id=12046](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12046&Mode=0).
- **PayPal:** India purpose-code list (14 values), team-supplied on 2026-10-25 and confirmed accurate by the team.
  - Master Direction on Payment Aggregators: [id=12896](https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12896)
- **e-Gazette:**
  - Income-tax Act, 2025: [265620.pdf](https://egazette.gov.in/WriteReadData/2025/265620.pdf), with corrigenda [269669.pdf](https://egazette.gov.in/WriteReadData/2026/269669.pdf)
  - Finance Act, 2026: [271439.pdf](https://egazette.gov.in/WriteReadData/2026/271439.pdf)
  - Finance Act, 2023: [244830.pdf](https://egazette.gov.in/WriteReadData/2023/244830.pdf)

The key quotes were re-checked by hand against the saved primary text:
- 2026 Reg 5(1)(a) and its commencement date, and the 15→9-month amendment;
- r. 96A(1)(b), the r. 46 endorsement, r. 46(b), s. 34(2) and Notfn 10/2017-IT;
- Income-tax Act 2025 ss. 1(3), 58(2), 62(4) and 408.

Before turning on a rule's logic, add table-driven tests covering its boundaries and effective date ([rules AGENTS](../packages/rules/AGENTS.md)). Stored results embed the rule's source and effective date. `rule_versions` rows are written when a rule first gets a second version.
