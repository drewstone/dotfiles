---
name: orchestrate
description: Coordinate dependent agent tasks through available tools and deliver one integrated result.
---

# Orchestrate

Complete a goal through bounded tasks, checked dependencies, and one integrated outcome.
Use delegation only when useful work can proceed concurrently or an independent approach can expose a different error.

## Resolve execution

Inspect the session's actual creation, messaging, waiting, cancellation, concurrency, and file-sharing contracts.
Prefer those tools for ordinary delegation.
When the project already requires a workflow runtime, inspect its current exports and nearest runnable example.
Prove one task can return its artifact before a large dispatch through an unfamiliar runtime.
If delegation is unavailable, execute locally and report that constraint.

## Coordinate the work

1. Define each task's input, output, dependencies, allowed files, and completion checks.
2. Assign disjoint files or isolated worktrees to parallel writers; reserve shared integration for one owner.
3. Dispatch independent work within available resources and existing authorization.
4. Check each dependency before starting work that consumes it.
   Collect the complete set only when ranking, deduplication, or integration requires it.
5. Inspect every terminal state, including failed and missing returns.
   Preserve successful artifacts and retry unfinished work only with a supported correction.
6. Resolve consequential disagreements through source evidence or reproduction.
7. Integrate, run the resulting artifact's checks, and complete authorized delivery.

For workflows with partial dependencies, cancellation, or recovery, read [coordination cases](references/coordination.md).
For resumable work, use existing project state to retain task identities, owners, dependencies, artifacts, checks, failures, and resource use.
Add a task record only when no existing record carries the needed state.

Report the integrated outcome and required work still unresolved.
An agent's summary or a majority vote cannot establish that its artifact works.

## Log the run

```bash
skill-run-log /orchestrate --target "<target>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

- `autopsy` when a completed run returns null or contradictory results.
- `converge` when integration exposes a CI failure.
- `reflect` when checked outcomes reveal reusable coordination improvements.
