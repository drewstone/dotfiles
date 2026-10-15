# Variants and prototypes

For Tangle work, read the [design bible](https://github.com/tangle-network/brand/blob/main/docs/design-bible.md) for principles, visual grammar, motion, interaction and acceptance. Brand owns shared policy and executable token values; this file owns procedure.

Derived from emilkowalski/skills ui-variants and mattpocock/skills prototype (MIT).

Read this for major redesign exploration, requested direction comparisons, or a logic/state model that needs checking before implementation. For Tangle major redesigns, follow the bible's exploration requirement; use the same real task and content across materially different models. Small corrections keep the established workflow.

## UI variants

1. Narrow the request to one piece of UI and restate it in one sentence.
2. Read the stack, tokens, and product personality; every variant uses the real tokens and looks shippable.
3. Build variants that differ on named axes such as composition, density or interaction model. Take the required exploration scope from the project's policy owner. Close variations of one idea teach nothing.
4. Render them on the real page behind a `?variant=` parameter so headers, data, and density are present; use a new prototype route only when no page can host the piece.
5. Give each variant real interactions and realistic content, and hold each to the polish and motion bar.
6. Add a small fixed switcher that names each variant's axis; it is tooling, not part of the design.
7. When the user picks one, move it into production code and delete the prototype surface unless the user wants it kept.

Production code stays untouched until a variant is chosen.

## Logic prototypes

For a state model or workflow question, build one self-contained HTML file the user can open directly.
Give it free-play controls and guided walkthroughs of the hard cases, and show the full state after every action.
Keep state in memory; skip tests and polish.

For either kind, start it with one command, mark it clearly as a prototype, and record the decision it settled where the implementation work is tracked.
Keep the prototype on a throwaway branch when it has reference value.
