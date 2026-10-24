# Rules and sources

The table below is copied from [PLAN section 9](PLAN.md#9-rules-engine). Its status column records the plan's assessment, not a fresh legal review. All twelve scaffold YAML entries remain verified=false, effective_from=null and logic=TODO. No rule executes.

| Rule ID                  | Rule                                                                           | Source                                              | Status                        |
| ------------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------- | ----------------------------- |
| `EXPORT_CONDITIONS`      | Five conditions for export of services                                         | IGST Act, s. 2(6)                                   | Verify wording                |
| `LUT_REQUIRED`           | LUT (RFD-11) needed to export without paying IGST; valid per financial year    | CGST Rules, r. 96A                                  | Verified (CBIC)               |
| `EXPORT_INVOICE_FIELDS`  | Mandatory export invoice fields and LUT endorsement                            | CGST Rules, r. 46                                   | Verify                        |
| `INVOICE_NUMBERING`      | Consecutive, unique per financial year                                         | CGST Rules, r. 46                                   | Verify                        |
| `CREDIT_NOTE`            | Refund after invoicing requires a credit note and GST adjustment               | CGST Act, s. 34                                     | Verify                        |
| `GST_THRESHOLD`          | ₹20 lakh aggregate turnover (exports included)                                 | CGST Act, s. 22                                     | Verify                        |
| `GSTR1_6A`               | Export invoices reported in Table 6A, zero tax under LUT                       | GSTR-1 / r. 96A                                     | Verify file format            |
| `PURPOSE_CODES`          | Curated service purpose codes                                                  | RBI purpose code list                               | Verify with bank              |
| `RBI_REALISATION`        | Export proceeds deadline (services) — currently reported 9 months from invoice | FEMA (Export of Goods & Services) Regulations, 2026 | **Verify — sources conflict** |
| `REALISATION_ADJUSTMENT` | Refunds/lost disputes reduce the amount realised                               | FEMA export regulations                             | **Verify**                    |
| `PRESUMPTIVE_TAX`        | 50% deemed income for eligible professionals, receipts limits                  | Income-tax Act 2025 (reported s. 58)                | **Verify section and limits** |
| `ADVANCE_TAX_DATES`      | 15 Jun / 15 Sep / 15 Dec / 15 Mar; presumptive: full by 15 Mar                 | Income-tax Act                                      | Verify under new Act          |

Primary-source review must establish exact wording, effective dates and applicability before enabling a rule. Consult [CBIC tax information](https://taxinformation.cbic.gov.in/), [RBI notifications](https://www.rbi.org.in/Scripts/NotificationUser.aspx), [Income Tax Department](https://www.incometax.gov.in/iec/foportal/) and [GST portal downloads](https://www.gst.gov.in/download/offlineutilities). These are review entry points, not proof of the plan's reported numbers.

The plan's direct [Rule 96A citation](https://taxinformation.cbic.gov.in/content/html/tax_repository/gst/rules/cgst_rules/active/chapter10/rule96a_v1.00.html) must be checked alongside amendments. A CA reviews every entry before the demo. Record primary citations and effective dates in rule_versions. See [verification](verification.md#v09-rules-review).
