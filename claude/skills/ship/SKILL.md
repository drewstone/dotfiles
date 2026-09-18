---
name: ship
description: Run typecheck, tests, build, deploy, and live checks for a release; report exact proof.
---

# Ship

Release the intended artifact to the authorized target and prove its live behavior.

## Prepare

1. Establish the target, artifact, release path, rollback procedure, and authorization already granted in this session.
   Ask only for missing authority or a target that cannot be inferred reliably.
2. Inspect git and release state to identify exactly what will ship and preserve unrelated work.
3. Read the repository's current release scripts, required checks, and deployment instructions.
4. Run the smallest meaningful smoke before expensive release work.

## Release

1. Run required checks and build the artifact according to their dependencies.
   Run independent commands concurrently only when they do not share mutable outputs; collect every exit status.
2. Fix failed checks without bypassing hooks, suppressing tests, or weakening requirements.
3. Deploy through the repository's authorized release path.
4. Wait for the deployment to reach a terminal state.
5. Match the served revision or artifact to the intended release and exercise the changed live user path.
   If live checks fail, follow the documented recovery procedure and verify recovery before further release attempts.

An accepted command or a successful upload is not proof of a working release.
A release need not print a URL: obtain its target from authoritative deployment records and verify the artifact actually served.
Report the revision, target, checks, deployment result, live evidence, and remaining uncertainty.

## Log the run

```bash
skill-run-log /ship --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The served artifact or behavior remains unverified | `/deploy-proof` | the expected revision, target, and missing check |
| CI blocks the release | `/converge` | the failing job and target |
| The authorized release requires custom artifact coordination | `/release-conductor` | artifacts, current deployment state, and rollback procedure |
| Live behavior fails after recovery | `/diagnose` | the failed probe, served revision, and recovery evidence |
