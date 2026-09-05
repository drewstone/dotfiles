---
name: release-conductor
description: Run a custom release with artifact tracking, live checks, rollback, updates, and handoff.
---

# Release Conductor

Coordinate a custom or multi-artifact release until the intended version is live with evidence.
Use this when the release requires more state and recovery work than a trusted deploy script provides.

## Establish release state

1. Identify the authorized environment, expected artifacts, currently served versions, dependencies, and rollback constraints.
2. Read current release documentation, build scripts, CI, deployment records, and service state.
3. Update the existing release record or `.agent/release-progress.md` with artifact identities, commands, timestamps, results, and remaining actions.
   Store credential locations only when needed; never copy secret values into the record.
4. Run the smallest useful smoke before an expensive build or deployment.

## Release and recover

Choose a build and deployment path that produces a compatible, identifiable artifact and exposes its status.
Respect required repository and release checks.
If a provider hides progress or logs, use an observable path within the existing authority; do not treat a hook response as deployment success.
For custom binary or service replacement, read [service release checks](references/service-release.md) before changing the running service.

Build or select the artifact, deploy in dependency order, and wait for terminal status.
Prove both the served artifact identity and the changed user behavior.
On a failed live check, follow the applicable recovery procedure and verify recovery before trying another release.
Recovery may require a compatible roll-forward when data or protocol changes make rollback unsafe.

Keep the record current while work is active so another session can resume from observed state.
Report the live target, artifact identities, deployment and behavior evidence, recovery path, and unresolved risks.
Update existing release tasks when the project uses them.

## Log the run

```bash
skill-run-log /release-conductor --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| CI blocks an authorized release | `/converge` | the required checks and failed jobs |
| Artifact identity or live behavior remains unverified | `/deploy-proof` | the expected artifacts and live targets |
| A release failure required recovery | `/autopsy` | failure evidence, recovery results, and timeline |
| Release work remains during session replacement | `/session-continuity` | the release record and pending operations |
