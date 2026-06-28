---
name: converge
description: Drive failing CI to green by reading remote failures, reproducing locally when possible, fixing root causes, pushing, waiting, and repeating without shortcuts.
---

# Converge

Use this only for red CI, failing checks, or a branch that must become mergeable.
The goal is genuinely green, not hidden failures.

## Start

1. Fetch the branch and base.
2. Read current CI status, newest logs, and any review comments tied to checks.
3. Group failures by root cause, not workflow name.
4. Reproduce locally when practical before editing.
5. Record progress in `.evolve/converge-progress.md` if the loop spans turns.

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

- `review-to-green` when CI is green but review still blocks merge.
- `release-conductor` when green CI must become a live release.
