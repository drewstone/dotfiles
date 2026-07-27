---
name: converge
description: Drive failing CI to green by reproducing failures, fixing root causes, pushing, and rechecking.
---

# Converge

Use this only for red CI, failing checks, or a branch that must become mergeable.
The goal is genuinely green, not hidden failures.

## Start

1. Fetch the branch and base.
2. Read current CI status, newest logs, and any review comments tied to checks.
3. Group failures by root cause, not workflow name.
4. Reproduce locally when practical before editing.
5. Record progress in `.agent/converge-progress.md` if the loop spans turns.

## Loop

1. Fix the highest-impact root cause.
2. Run the affected local check and the repo's broader preflight when available.
3. Commit intentionally; never use `--no-verify`.
4. Push, wait for CI, and read the new result.
5. Repeat until all required checks pass or the blocker is external and proven.

## Rules

- Do not use `continue-on-error`, skip tests, or weaken checks to get green.
- Treat flaky tests as defects to diagnose or quarantine with evidence.
- If the base moved, prove mergeability again before claiming done.

Use `references/full-reference.md` for the full resume protocol and GitHub command sequence.

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| CI green and review still blocks merge | `/review-to-green` | the PR number + the outstanding review verdict |
| ≥5 failing tests spanning ≥2 subsystems | `/diagnose` | the failure list grouped by suite + the last green SHA |
| Same job fails on an untouched base commit (binary: reproduced on base) | `/autopsy` | the job name + both run URLs |
| CI green and the change must become a live release | `/ship` | the merge SHA + the deploy command |
| Release path is opaque or multi-artifact | `/release-conductor` | the artifact list + the rollback path |

## Log the run

On completion, append one line so `/reflect` and `/governor` can grade this skill later:

```bash
skill-run-log /converge --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```
