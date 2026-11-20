---
name: codebase-design
description: Design or deepen modules and seams, and keep the domain language in CONTEXT.md and ADRs; use when shaping an interface or naming domain concepts.
---

# Codebase design

Derived from mattpocock/skills codebase-design and domain-modeling (MIT).

An excellent module hides much behavior behind an interface small enough to learn in a minute, sits at a seam where something really varies, and is tested through that interface alone.
When the right seam means moving code across packages or repositories we own, or replacing several implementations with one, design and build that.

## Set the bar

Before sketching, [set the bar](../be-ambitious/SKILL.md#set-the-bar): the best interface for this concept in a library practitioners respect, with its source; our measured cost today (implementations of the concept, callers that change together, defects traced to the split); the target; and the check (callers migrated, implementations deleted) that will show it.

## Vocabulary

- **Interface**: everything a caller must know: types, invariants, ordering, error modes, configuration and performance.
- **Depth**: behavior reached per unit of interface learned; shallow means the interface is nearly as complex as the body.
- **Seam**: where behavior can change without editing that place; an **adapter** (a Postgres repository, an embedded PGlite one) fills it.
- **Locality**: change, bugs and verification concentrate in one place.

## Judge a design

- **Deletion test**: delete the module in your head. If complexity vanishes, it was a pass-through; if it reappears across callers, it earns its place.
- **One adapter is a hypothetical seam; two is a real one.** Add a port only when production and test, or two real backends, differ across it.
- **The interface is the test surface.** If a test must reach past it, the module has the wrong shape.
- Accept dependencies instead of constructing them, return results instead of mutating shared state, and keep internal test seams out of the public interface.

Test across each kind of dependency with real behavior, never a mock ([AGENTS.md](../../AGENTS.md) rule 13):

| Dependency | Test across the seam with |
|---|---|
| In-process computation or memory | The real code, merged behind one interface |
| Local substitute exists (PGlite, in-memory filesystem) | The substitute inside the test suite |
| Owned remote service | The real service in a test environment, through the production adapter |
| Third-party service | The provider's sandbox or test mode, through the production adapter |

When tests move to the deepened interface, delete the old tests of the shallow parts.

To compare interface options, sketch three or four genuinely different ones (minimal entry points, maximum flexibility, the common caller made trivial, ports and adapters) and recommend one on depth, locality and seam placement against the bar.

## Keep the domain language

Read `CONTEXT.md` (or `CONTEXT-MAP.md`) and the relevant ADRs before naming or restructuring; call out a term that conflicts with the glossary, propose one precise term for a vague one, and test relationships with edge-case scenarios.
Update `CONTEXT.md` when a term is resolved: one or two sentences per term, what it is rather than what it does, with rejected synonyms as `_Avoid_`.
Write a one-paragraph ADR in `docs/adr/NNNN-slug.md` only for a decision that is hard to reverse, would surprise a future reader, and chose between real alternatives.

## Log the run

```bash
skill-run-log /codebase-design --target "<module or context>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The design is chosen and behavior must be built test-first | `/tdd` | the agreed interface and seams |
| Existing shallow modules or duplicate paths can be removed | `/simplify` | the deletion-test results and callers |
