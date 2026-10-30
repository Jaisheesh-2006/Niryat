Read `@current-phase-plan.md` to understand the project's existing phase plan, structure, conventions, and level of detail.

Next, read `@docs/build-flow.md` and all relevant **Phase 5** specifications and source documents. Inspect the existing codebase where necessary to understand the architecture, current implementations, interfaces, and conventions.

Update `@current-phase-plan.md` with the implementation plan for **Phase 5**, which I will execute using another coding model (could be a better or smaller model).

**The goal is to create a precise implementation plan, not to write the implementation itself.**

Follow these principles:
- **Be precise about requirements, flexible about implementation.** Clearly specify what needs to be built, why, which files are involved, how components interact, and what constraints must be followed. Let the coding model determine routine implementation details by inspecting the actual codebase.
- Break **Phase 5** into small, ordered, independently verifiable tasks. For each task, specify its objective, relevant files, implementation requirements, dependencies, edge cases, tests, and acceptance criteria.
- Define exact interfaces, function signatures, data contracts, schema constraints, constants, error behavior, security requirements, and architectural decisions wherever ambiguity could lead to incorrect implementation.
- **Avoid writing complete code in the plan.** Do not include full function implementations, entire components, large JSX/CSS blocks, or routine boilerplate. Use concise descriptions, function signatures, tables, or pseudocode instead.
- Include short code snippets only when essential to explain complex logic, subtle edge cases, critical invariants, or requirements that would otherwise be ambiguous.
- Preserve exact business rules, required user-facing messages, expected behavior, and test cases from the specifications. Do not sacrifice correctness for brevity.
- Clearly distinguish mandatory requirements from implementation suggestions. Do not unnecessarily constrain implementation choices that can safely be made by following existing codebase conventions.
- Identify relevant existing functions, patterns, and interfaces the coding model should inspect rather than reproducing their implementations in the plan.
- Include explicit non-goals and scope boundaries to prevent unnecessary work.
- Avoid duplicating information across tasks. Define shared contracts and architectural decisions once, then reference them where needed.
- Do not invent requirements or assume that files, functions, dependencies, or APIs exist without verification. Resolve ambiguities using the source documents and codebase; explicitly flag genuine unresolved conflicts.

Before finalizing, verify that the plan covers all **Phase 5** requirements and exit criteria in `@docs/build-flow.md` and the relevant specifications. Ensure that a smaller coding model can implement each task without making major architectural decisions or guessing about required behavior.

Update `@current-phase-plan.md` directly. Keep the plan actionable, easy to navigate, and detailed enough to execute, but do not turn it into a complete solution with prewritten code.

Take your time to understand the project before making changes. Prioritize correctness, clarity, and a clean separation between planning and implementation.
