---
name: orchestrate
description: Coordinate dependent or parallel agent tasks through available tools and deliver one integrated result.
---

# Orchestrate

Excellent orchestration runs the uncertain parts as parallel approaches, the certain parts as disjoint tracks, and integrates them into one deliverable that beats what any single track could reach, as the hardest projects did ([the climb](../../../docs/processes/climb.md#organize-like-the-hardest-projects-in-history)).
Keep one coherent design with one owner when its parts depend on each other's decisions.

## Set the bar

Before dispatch, [set the bar](../be-ambitious/SKILL.md#set-the-bar) for the integrated outcome: the best known result for it anywhere with its source, our number, the target that beats it, and the check; every brief carries that number to beat, and a track that returns only activity has not returned.

## Resolve execution

Inspect an unfamiliar delegation contract or workflow runtime (creation, messaging, cancellation, concurrency, file sharing) and prove one task returns its artifact before a large dispatch; when delegation is unavailable, do the work locally and say so.

## Coordinate the work

1. Give each deliverable one owner, scope, input, artifact, dependencies, allowed files and completion checks, written with the [brief template](../../../docs/processes/agent-work.md#brief-template); fix the constraints other tracks rely on and let the worker choose the rest.
2. Give parallel writers disjoint files or isolated worktrees, and reserve shared integration for one owner.
3. Dispatch independent work within available resources and existing authorization, waiting only on real dependencies.
4. Inspect every terminal state, failed and missing returns included; keep successful artifacts and retry unfinished work only with a supported correction.
5. Resolve consequential disagreements through source evidence or reproduction, test interactions that cross track boundaries, and choose, combine or reject parallel proposals explicitly; parallel summaries are not an integrated result.
6. Integrate, run the integrated artifact's checks against the bar, and complete authorized delivery.

Throttle a job whose contention or failure is observed; after recovery or a quota reset, reconcile live owners before resuming writes.
Use the [shared communication rule](../../../docs/processes/agent-work.md#delegation) for updates, and read [coordination cases](references/coordination.md) for partial dependencies, cancellation or recovery.

Report the integrated outcome against the bar and the required work still open; an agent's summary or a majority vote cannot establish that its artifact works.

## Log the run

```bash
skill-run-log /orchestrate --target "<target>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A completed run returns null or contradictory results | `/diagnose` | the track, its artifact and raw evidence |
| Integration exposes a CI failure | `/converge` | the PR and failing checks |
| Completed tracks remain mixed across branches | `/finalize` | the branches and intended groups |
| Checked outcomes reveal reusable coordination improvements | `/reflect` | the tracks' briefs and results |
