---
name: finalize
description: Split a mixed experiment branch into clean branches and reviewable pull requests.
---

# Finalize

Separate a mixed branch into reviewable changes without losing intended work.
Produce one branch when there is only one logical change; this task does not itself authorize deployment.

## Reconstruct the intended work

1. Record the source revision, target base, merge-base, and working-tree state.
   Preserve the source branch and unrelated edits; do reconstruction in isolated worktrees.
2. Inspect commits and the net diff to identify intended changes and confirmed noise.
   Commit labels are clues, not proof that work belongs together or should be removed.
3. Define the target tree containing all intended work.
   If excluding changes, reconstruct and inspect that tree independently before splitting it.
4. Group changes by behavior and reviewability.
   Split shared files by hunk when the changes can be understood and tested separately.
   Keep coupled changes together or record a dependency between them.
5. Build each branch on the target base or its prerequisite branch.
   Validate every branch against its actual PR base so a dependency flag never disguises a broken branch.
6. Reconstruct all groups in dependency order in a scratch worktree and compare its tree hash with the target tree.
   Accept the comparison only after every application or merge succeeds.
   Resolve any missing, extra, or conflicting change before publishing.
7. Fetch the current target base and prove each proposed PR merges cleanly against its intended base.
   Revalidate affected branches if the base changes.

For hunk carving, dependency analysis, or reconstruction checks, read [branch reconstruction](references/branch-reconstruction.md) before creating the branches.

## Deliver

Preserve a branch-to-PR map, source and target revisions, grouping decisions, dependencies, checks, and reconstruction result in `.agent/finalize/<date>-<slug>.md`.
Use existing experiment records when explaining a change, but identify the revision and conditions those measurements describe.
A combined experiment result does not establish the isolated effect of a split branch.

Prepare accurate PR descriptions and complete the authorized PR workflow in dependency order.
Use the required repository identity and hooks.
Use merge or release authority already granted; request only authority still missing after the concrete result is ready.
Delete a branch only after confirming it is merged or deliberately abandoned.
Preserve the source branch until all retained work is accounted for.

## Log the run

```bash
skill-run-log /finalize --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A reconstructed change needs a correctness review | `/critical-audit` | the branch, intended base, and scoped diff |
| A branch has failing CI | `/converge` | the branch and failing checks |
| Reconstruction differs from the intended target and the cause is unclear | `/autopsy` | the successful operations, tree hashes, and exact diff |
| Unfinished branch or PR work must survive a session replacement | `/session-continuity` | the branch-to-PR map and current state |
