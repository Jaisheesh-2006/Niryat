# ADR 0003: Rules own legal and numeric logic

Status: accepted.

All legal/tax numbers, deadlines and compliance calculations belong to packages/rules. Rules need primary citations, effective dates, verification and table-driven tests. AI may extract, classify, suggest matches and explain the resulting rules, but cannot invent law, rates or amounts.

The scaffold ships metadata only, with logic=TODO for every rule.

Update 2026-10-25: the CA-review gate is replaced by a primary-source check (review: source_checked). No CA review is planned for the hackathon; that is disclosed as a limitation (PLAN section 23). See [rules sources](../rules-sources.md).
