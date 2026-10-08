# Variants and prototypes

Derived from emilkowalski/skills ui-variants and mattpocock/skills prototype (MIT).

Read this when the user wants to compare different directions for a piece of UI, or to check whether a logic or state model feels right before building it.

## UI variants

1. Narrow the request to one piece of UI and restate it in one sentence.
2. Read the stack, tokens, and product personality; every variant uses the real tokens and looks shippable.
3. Build three to five variants that differ on a named axis each (layout, density, personality, motion, interaction model). Close variations of one idea teach nothing.
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
