---
name: ship
description: Run typecheck, tests, build, deploy, and live checks for a release; report exact proof.
---

# Ship

Use this only when the user wants an actual deploy or production/staging release.
If they only want confidence before deploy, use `verify`.

## Start

1. Confirm target environment, release artifact, rollback path, and whether production approval is explicit.
2. Check git state and make sure uncommitted changes are intentional.
3. Read project release docs and scripts.
4. Run the cheapest smoke before long or external deploy work.

## Flow

1. Run typecheck, tests, lint, and build as appropriate for the repo.
2. Fix any red signal instead of skipping it.
3. Deploy with the repo's release path.
4. Smoke the live artifact with a real endpoint, UI path, or version check.
5. Report commit, target, commands, results, URL/version, and residual risk.

## Rules

- Never use `--no-verify` or weaken checks to ship.
- A successful deploy command is not proof; live behavior is proof.
- Production release needs explicit approval for that target.

Use `references/full-reference.md` for the full phase checklist.

## Log the run

On completion, append one line so later analysis can grade this skill:

```bash
skill-run-log /ship --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Deploy command exits 0 | `/deploy-proof` | expected SHA + the live endpoint and behavior probe |
| CI blocks the release | `/converge` | the failing job + the release target |
| The release path is opaque, custom, or multi-artifact | `/release-conductor` | the artifact list + the rollback path |
| Live smoke fails after a successful deploy | `/diagnose` | the smoke output + the served revision |
| Release is live and proven | `/reflect` | the proof block + the loop this closed |
