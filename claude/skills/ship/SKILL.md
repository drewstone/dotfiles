---
name: ship
description: Release a verified artifact through the authorized path, including custom multi-artifact releases, and prove the served revision and live behavior.
---

# Ship

Release the intended artifact to the authorized target and prove its live behavior.
To prove an existing deployment without releasing, start at "Prove it is live"; that check does not grant authority to deploy or change infrastructure.

## Prepare

1. Define one shipped user outcome, its artifacts, target, release path, rollback, dependencies, and existing authorization.
   Ask only for missing authority or a target that cannot be inferred reliably.
2. Inspect git, release documentation, build scripts, CI, deployment records, and currently served versions to identify exactly what will ship.
   Preserve unrelated work.
3. Read the repository release path and [shared delivery process](../../../docs/processes/agent-work.md#deliver-through-github).
4. Run the smallest meaningful smoke before expensive release work.
   Before a long release, use [work duration](../tangle-ops/references/work-duration.md) once to select a bounded waiter from current evidence.

A custom or multi-artifact release can need more state and recovery work than a trusted deploy script provides.
Keep its existing release record or `.agent/release-progress.md` current with artifact identities, commands, timestamps, results, and remaining actions, so another session can resume from observed state.
Store credential locations only when needed; never copy secret values into the record.

## Release

1. Reuse valid verification, run remaining required checks, and build the artifact according to their dependencies.
   Run independent commands concurrently only when they do not share mutable outputs; collect every exit status.
2. Fix change defects; track unrelated failures separately and continue the permitted release path.
3. Deploy through the repository's authorized release path, in dependency order.
   If a provider hides progress or logs, use an observable path within the existing authority.
   For custom binary or service replacement, read [service release checks](references/service-release.md) before changing the running service.
4. Use one bounded CLI waiter or completion notification for the deployment.
   Retain its run identity, terminal exit status, and log path; continue independent implementation meanwhile.
   Read status when completion, failure, or required intervention changes the next action.

Keep deployment signing, publishing, rollback, and live verification even when redundant PR checks are retired.
Recovery may require a compatible roll-forward when data or protocol changes make rollback unsafe.

## Prove it is live

Identify the expected revision or artifact digest and target from the request, release configuration, and current deployment records.
A branch name alone does not establish the environment, and a release need not print a URL.

1. Read the deployment system's status and logs for the intended artifact.
   An accepted command, a successful upload, or a build-hook response proves only that the request was accepted.
2. Match the served version, digest, build metadata, or release-specific behavior to the expected artifact.
   A health response proves availability but may not identify the revision.
3. Exercise the changed user path through the live target with authorized test data.
   Record the environment, command or browser actions, response facts, timestamp, and result.
4. Wait for an active rollout to finish and recheck the live artifact.
5. If a live check fails, follow the documented recovery procedure and verify recovery through the same user path before another release attempt.

When claiming caching, inspect the deployed cache mechanism and its observable behavior.
Use repeated equivalent requests and cache or origin evidence to distinguish a hit from a fresh response.
A cache-control header alone does not prove a hit, and provider-specific response headers depend on the cache path in use.
When claiming performance, compare equivalent requests against the deployed runtime and dependencies.
Record vantage, warm or cold state, sample count, distribution, and baseline differences.

Report the expected and served revisions, target, checks, deployment result, live evidence, recovery path, and remaining uncertainty.
Use `live`, `pending`, `failed`, or `unverified` according to what the checks establish.
If access or an external failure prevents verification, state the missing evidence and the exact check needed.
Update an existing release record or task when the project uses one, without exposing credentials.

## Log the run

```bash
skill-run-log /ship --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The deployment workflow fails | `/converge` | the failing job and logs |
| The artifact matches but its behavior fails | `/diagnose` | the live reproduction and expected outcome |
| Measured performance misses the product requirement | `/evolve` | comparable measurements and the dominant cost |
