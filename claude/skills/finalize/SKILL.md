---
name: finalize
description: Split a mixed experiment branch into clean branches and reviewable pull requests.
---

# Finalize

An excellent split gives each reviewer one behavior per pull request, each branch green on its own base, and a reconstruction whose tree hash equals the intended whole, so nothing was lost or added.
Produce one branch when there is only one logical change; this task does not itself authorize deployment.

## Reconstruct the intended work

1. Record the source revision, target base, merge-base and working-tree state; preserve the source branch and unrelated edits, and reconstruct in isolated worktrees.
2. Inspect commits and the net diff to identify intended changes and noise, and define the target tree holding all intended work.
3. Group changes by behavior and reviewability, splitting shared files by hunk when the parts can be understood and tested separately, and keeping coupled changes together or recording their dependency.
4. Build each branch on the target base or its prerequisite branch, and validate each against its real PR base so a dependency flag never hides a broken branch.
5. Reapply all groups in dependency order in a scratch worktree and compare its tree hash with the target tree, accepting only after every application succeeds; resolve any missing, extra or conflicting change before publishing.
6. Fetch the current base and prove each PR merges cleanly against its intended base, revalidating when the base moves.

For hunk carving, dependency analysis or reconstruction checks, read [branch reconstruction](references/branch-reconstruction.md) before creating the branches.

## Deliver

Keep the branch-to-PR map, source and target revisions, grouping decisions, dependencies, checks and reconstruction result in `.agent/finalize/<date>-<slug>.md`.
Complete the authorized PR workflow in dependency order with the required identity and hooks.
Delete a branch only after confirming it merged or was deliberately abandoned, and keep the source branch until all retained work is accounted for.

## Log the run

```bash
skill-run-log /finalize --target "<what this run targeted>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A reconstructed change needs a correctness review | `/critical-audit` | the branch, intended base, and scoped diff |
| A branch has failing CI | `/converge` | the branch and failing checks |
| Reconstruction differs from the intended target and the cause is unclear | `/diagnose` | the successful operations, tree hashes, and exact diff |
| Unfinished branch or PR work must survive a session replacement | `/session-continuity` | the branch-to-PR map and current state |
