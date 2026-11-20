---
name: ship
description: Release a verified artifact through the authorized path, including custom multi-artifact releases, and prove the served revision and live behavior.
---

# Ship

An excellent release puts the intended revision in front of users through its release path, proves that exact artifact is served, and shows the changed user path working live with numbers, not a green deploy step.
To prove an existing deployment without releasing, start at "Prove it is live"; that check grants no authority to deploy or change infrastructure.

## Prepare

1. Define the shipped user outcome, its artifacts, target, release path, rollback and existing authorization, and inspect git, release documentation, build scripts, deployment records and served versions to identify exactly what will ship.
2. Read the repository release path and the [shared delivery process](../../../docs/processes/agent-work.md#deliver-through-github), and run a quick smoke before expensive release work.

A custom or multi-artifact release keeps `.agent/release-progress.md` (or its existing record) current with artifact identities, commands, results and remaining actions, credential locations but never values.

## Release

1. Reuse valid verification, run the remaining required checks and build the artifacts in dependency order, collecting every exit status.
2. Fix defects in the change; send unrelated failures to their author and continue the permitted path.
3. Deploy through the authorized release path in dependency order; when a provider hides progress or logs, use an observable path within existing authority, and for custom binary or service replacement read [service release checks](references/service-release.md) first.
4. Wait with one bounded waiter or completion notification, keeping its run identity and log path, and continue independent work meanwhile.

Keep deployment signing, publishing, rollback and live verification even when redundant PR checks are retired; when data or protocol changes make rollback unsafe, recovery is a compatible roll-forward.

## Prove it is live

Identify the expected revision or digest and target from the request, release configuration and deployment records; a branch name does not establish the environment.

1. Read the deployment system's status and logs for the intended artifact; an accepted command, upload or build-hook response proves only acceptance.
2. Match the served version, digest, build metadata or release-specific behavior to the expected artifact; a health response proves availability, not revision.
3. Exercise the changed user path on the live target with authorized test data, recording environment, actions, response facts, timestamp and result.
4. Recheck the live artifact after an active rollout finishes; if a live check fails, follow the documented recovery and verify recovery through the same user path before another release attempt.

A caching claim needs repeated requests with cache or origin evidence, never a header alone; a performance claim compares equivalent requests on the deployed runtime, with sample count and distribution, against the bar.

Report expected and served revisions, live evidence and recovery path as `live`, `pending`, `failed` or `unverified`, naming the exact missing check when verification is blocked.

## Log the run

```bash
skill-run-log /ship --target "<what this run targeted>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --pr <released PR URL> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The deployment workflow fails | `/converge` | the failing job and logs |
| The artifact matches but its behavior fails | `/diagnose` | the live reproduction and expected outcome |
| Measured performance misses the product requirement or the bar | `/evolve` | comparable measurements and the dominant cost |
