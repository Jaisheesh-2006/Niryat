# Rules conventions

Follow the root AGENTS.md and docs/rules-sources.md.
Pure functions only: no network, database, model calls or implicit current time.
Pass time and versioned inputs explicitly; use decimal-safe amounts in future logic.
Every legal/numeric rule needs a primary citation, effective date and CA review.
Keep scaffold metadata verified=false with TODO logic until that review occurs.
Use table-driven tests for boundaries, effective-date changes and exceptions.
Never infer missing law, rates or section numbers from a model's output.
