---
name: codebase-design
description: Design or deepen modules and seams, and keep the domain language in CONTEXT.md and ADRs; use when shaping an interface or naming domain concepts.
---

# Codebase design

Derived from mattpocock/skills codebase-design and domain-modeling (MIT).

Aim for deep modules: much behavior behind a small interface, placed at a seam where something actually varies, and tested through that interface.

## Vocabulary

Use these terms consistently so designs, tests, and reviews name the same things.

- **Module**: anything with an interface and an implementation, from a function to a service.
- **Interface**: everything a caller must know: types, invariants, ordering, error modes, configuration, and performance.
- **Depth**: behavior a caller or test reaches per unit of interface learned. Shallow means the interface is nearly as complex as the body.
- **Seam**: the place where behavior can change without editing that place; the interface lives there.
- **Adapter**: what fills a seam, such as a Postgres repository or an in-memory fake.
- **Leverage** is what callers get from depth; **locality** is what maintainers get: change, bugs, and verification concentrate in one place.

## Judge a design

- **Deletion test**: delete the module in your head. If complexity vanishes, it was a pass-through; if it reappears across callers, it earns its place.
- **One adapter is a hypothetical seam; two is a real one.** Add a port only when production and test, or two real backends, differ across it.
- **The interface is the test surface.** If a test must reach past it, the module has the wrong shape.
- Accept dependencies instead of constructing them, return results instead of mutating shared state, and keep the surface small.
- Internal seams may exist for the module's own tests; keep them out of the public interface.

Classify each dependency before deepening a cluster:

| Dependency | Test across the seam with |
|---|---|
| In-process computation or memory | The real code, merged behind one interface |
| Local substitute exists (PGlite, in-memory filesystem) | The substitute inside the test suite |
| Owned remote service | A port with an HTTP or queue adapter in production and an in-memory adapter in tests |
| Third-party service | An injected port with a mock adapter |

When tests move to the deepened interface, delete the old tests of the shallow parts; tests assert observable outcomes and survive refactors.

To compare interface options, state the constraints and dependency categories once, then sketch three to four genuinely different interfaces: minimal entry points, maximum flexibility, the most common caller made trivial, and ports and adapters where a dependency crosses a seam.
Use separate workers only when delegation is available and authorized.
Compare the options on depth, locality, and seam placement, and recommend one.

## Keep the domain language

Read `CONTEXT.md` (or `CONTEXT-MAP.md` for several contexts) and the relevant ADRs before naming or restructuring.
While designing:

- Call out a term that conflicts with the glossary, and propose one precise term for a vague or overloaded one.
- Test relationships with concrete edge-case scenarios, and check that the code agrees with what the user states.
- Update `CONTEXT.md` when a term is resolved. It is a glossary of project-specific concepts only: one or two sentences per term, what it is rather than what it does, with rejected synonyms listed as `_Avoid_`. Create it when the first term is resolved.

Write an ADR in `docs/adr/NNNN-slug.md` only when a decision is hard to reverse, would surprise a future reader, and chose between real alternatives.
One paragraph with the context, decision, and reason is enough; add status, options, or consequences only when they matter.

## Log the run

```bash
skill-run-log /codebase-design --target "<module or context>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The design is chosen and behavior must be built test-first | `/tdd` | the agreed interface and seams |
| Existing shallow modules or duplicate paths can be removed | `/simplify` | the deletion-test results and callers |
