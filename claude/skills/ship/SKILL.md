---
name: ship
description: Release a verified artifact through the authorized path and prove its live behavior.
---

# Ship

Release the intended artifact to the authorized target and prove its live behavior.

## Prepare

1. Define one shipped user outcome, its artifact, target, release path, rollback, and existing authorization.
   Ask only for missing authority or a target that cannot be inferred reliably.
2. Inspect git and release state to identify exactly what will ship and preserve unrelated work.
3. Read the repository release path and [shared delivery process](../../../docs/processes/agent-work.md#deliver-through-github).
4. Run the smallest meaningful smoke before expensive release work.
   Before a long release, use [work duration](../tangle-ops/references/work-duration.md) once to select a bounded waiter from current evidence.

## Release

1. Reuse valid verification, run remaining required checks, and build the artifact according to their dependencies.
   Run independent commands concurrently only when they do not share mutable outputs; collect every exit status.
2. Fix change defects; track unrelated failures separately and continue the permitted release path.
3. Deploy through the repository's authorized release path.
4. Use one bounded CLI waiter or completion notification for the deployment.
   Retain its run identity, terminal exit status, and log path; continue independent implementation meanwhile.
   Read status when completion, failure, or required intervention changes the next action.
5. Match the served revision or artifact to the intended release and exercise the changed live user path.
   If live checks fail, follow the documented recovery procedure and verify recovery before further release attempts.

An accepted command or a successful upload is not proof of a working release.
Keep deployment signing, publishing, rollback, and live verification even when redundant PR checks are retired.
A release need not print a URL: obtain its target from authoritative deployment records and verify the artifact actually served.
Report the revision, target, checks, deployment result, live evidence, and remaining uncertainty.

## Log the run

```bash
skill-run-log /ship --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```
