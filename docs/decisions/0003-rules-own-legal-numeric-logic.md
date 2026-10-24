# ADR 0003: Rules own legal and numeric logic

Status: accepted.

All legal/tax numbers, deadlines and compliance calculations belong to packages/rules. Rules need primary citations, effective dates, verification and table-driven tests. AI may extract, classify, suggest matches and explain the resulting rules, but cannot invent law, rates or amounts.

The scaffold ships metadata only, with verified=false and logic=TODO for every rule. A CA review precedes enabling rules. See [rules sources](../rules-sources.md).
