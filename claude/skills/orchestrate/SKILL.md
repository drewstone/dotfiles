---
name: orchestrate
description: Coordinate dependent or parallel agent tasks, including independent architecture tracks, through available tools and deliver one integrated result.
---

# Orchestrate

Complete a goal through bounded tasks, checked dependencies, and one integrated outcome.
Use delegation only when useful work can proceed concurrently or an independent approach can expose a different error.
Keep one coherent design with one owner when its parts depend on each other's decisions.

## Resolve execution

Reuse the session's known delegation contracts; inspect unfamiliar creation, messaging, cancellation, concurrency, or file-sharing behavior before relying on it.
When the project requires an unfamiliar workflow runtime, inspect its current exports and nearest runnable example.
Prove one task can return its artifact before a large dispatch through an unfamiliar runtime.
If delegation is unavailable, execute locally and report that constraint.

## Coordinate the work

1. Give each deliverable one owner, bounded scope, input, artifact, dependencies, allowed files, and completion checks.
   Fix the constraints other tracks rely on; let the worker choose implementation details within them.
   Each track must return its implemented artifact and evidence, or a concrete unresolved condition.
2. Assign disjoint files or isolated worktrees to parallel writers; reserve shared integration for one owner and a bounded delivery cut.
3. Dispatch independent work within available resources and existing authorization.
4. Check each dependency before starting work that consumes it.
   Collect the complete set only when ranking, deduplication, or integration requires it.
5. Inspect every terminal state, including failed and missing returns.
   Preserve successful artifacts and retry unfinished work only with a supported correction.
6. Resolve consequential disagreements through source evidence or reproduction, and test interactions that cross track boundaries.
   Choose, combine, or reject parallel proposals explicitly; parallel summaries do not constitute an integrated result.
7. Integrate, run the resulting artifact's checks, and complete authorized delivery.

Before costly dispatches, check shared host headroom and active heavy work.
Start independent, bounded jobs without coordinator approval; wait only on actual dependencies.
Throttle or stop a job when observed contention traces to it or it fails; resume after recovery or correction.
Finish the current delivery cut; record unrelated cleanup for a subsequent cut.
After recovery or a quota reset, reconcile live owners before resuming writes.
Transfer retained artifacts to one owner when original and replacement workers are both active.

Use the [shared communication rule](../../../docs/processes/agent-work.md#delegation) for updates.
For workflows with partial dependencies, cancellation, or recovery, read [coordination cases](references/coordination.md).
For resumable work, use existing project state to retain task identities, owners, dependencies, artifacts, checks, failures, and resource use.
Add a task record only when no existing record carries the needed state.

Report the integrated outcome and required work still unresolved.
An agent's summary or a majority vote cannot establish that its artifact works.

## Log the run

```bash
skill-run-log /orchestrate --target "<target>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

- `diagnose` when a completed run returns null or contradictory results.
- `converge` when integration exposes a CI failure.
- `finalize` when completed tracks remain mixed across branches.
- `reflect` when checked outcomes reveal reusable coordination improvements.
