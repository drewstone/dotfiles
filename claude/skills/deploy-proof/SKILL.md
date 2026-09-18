---
name: deploy-proof
description: Prove a merged change is live and correct in production, including caches and performance.
---

# Deploy Proof

Prove that the intended artifact serves the requested environment and that its changed behavior works there.
This skill checks deployment state; it does not grant authority to deploy or change infrastructure.

## Establish the target

Identify the expected revision or artifact digest and target URL from the request, release configuration, and current deployment records.
A branch name alone does not establish the environment.
Read repository release instructions and known rollout or cache behavior before selecting probes.

## Verify the release

1. Read the deployment system's status and logs for the intended artifact.
   A successful build-hook response proves only that the request was accepted.
2. Match the served version, digest, build metadata, or release-specific behavior to the expected artifact.
   A health response proves availability but may not identify the revision.
3. Exercise the changed user path through the live URL with authorized test data.
   Record the environment, command or browser actions, response facts, timestamp, and result.
4. Wait for an active rollout to finish and recheck the live artifact.
   If access or an external failure prevents verification, state the missing evidence and the exact check needed.

When claiming caching, inspect the deployed cache mechanism and its observable behavior.
Use repeated equivalent requests and cache or origin evidence to distinguish a hit from a fresh response.
A cache-control header alone does not prove a hit, and provider-specific response headers depend on the cache path in use.
When claiming performance, compare equivalent requests against the deployed runtime and dependencies.
Record vantage, warm or cold state, sample count, distribution, and baseline differences.

Report expected and observed revisions, deployment status, behavior results, and any cache or performance evidence relevant to the claim.
Use `live`, `pending`, `failed`, or `unverified` according to what the checks establish.
Update an existing release record or task when the project uses one; include evidence without exposing credentials.

## Log the run

```bash
skill-run-log /deploy-proof --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The rollout serves the wrong artifact and an authorized release remains | `/release-conductor` | expected and served artifacts, target, and deployment logs |
| The deployment workflow fails | `/converge` | the failing job and logs |
| The artifact matches but its behavior fails | `/diagnose` | the live reproduction and expected outcome |
| Measured performance misses the product requirement | `/evolve` | comparable measurements and the dominant cost |
