# Rules conventions

Follow the root AGENTS.md and docs/rules-sources.md.
Pure functions only: no network, database, model calls or implicit current time.
Pass time and versioned inputs explicitly; use decimal-safe amounts in future logic.
Every legal/numeric rule needs a primary citation and effective date, checked against primary text.
Set review: source_checked only after that check (docs/rules-sources.md); otherwise unchecked.
Use table-driven tests for boundaries, effective-date changes and exceptions.
Never infer missing law, rates or section numbers from a model's output.
