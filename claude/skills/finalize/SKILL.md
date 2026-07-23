---
name: finalize
description: Split a mixed experiment branch into clean branches and reviewable pull requests.
---

# Finalize

`/evolve`, `/meta-harness`, and `/pursue` leave one branch carrying 20 mixed commits: three real improvements, some debug prints, a reverted dead-end.
This is the bridge from that mess to N clean branches — one per logical change, each built from the merge-base, each an isolated PR a reviewer approves in one sitting.
It **decomposes** a branch; it does not deploy one.

Shared conventions in `_common.md`.

## When to use

| Signal | Skill |
|---|---|
| "Deploy this one change to prod" | `/ship` |
| "CI is red, get it green" | `/converge` |
| "Design a new architecture" | `/pursue` |
| "20 mixed commits — turn them into clean PRs" | **`/finalize`** |

## Procedure

1. **Triage — separate KEEP from noise.** Walk the commits with per-file diffs (`git log --reverse --stat "$(git merge-base origin/main HEAD)"..HEAD`). Mark each KEEP (real change) or SKIP (debug print, WIP later reverted, dead-end, stray bump, main-sync merge). The tree you reconstruct — the **target tree `T`** — is KEEP-only; nothing else survives into a branch.
2. **Group KEEP changes into disjoint change-sets — deterministically, not by vibes.** Seed one group per distinct Conventional-Commit `type(scope)` on the kept commits. The change unit is a whole file when only one seed touches it (fast path); when two seeds touch one file, the unit drops to the `@@` hunk. Force a merge only where two seeds own the **same or adjacent line-range** — a true line conflict, not a mere shared file. Emit the partition plus the edges that forced each merge, so the grouping is inspectable, not a judgment call.
3. **Flag cross-group dependencies; preserve application order.** Disjoint lines still hide logical order: if group B references a symbol group A adds, they never git-conflict but a reviewer who merges B first hits a red build — tag `depends-on: A`. Number branches in original commit order (a valid apply sequence) so the chain stays satisfiable.
4. **Build one branch per group from the merge-base.** From `M=$(git merge-base origin/main HEAD)`: `git restore --source=$T` whole files the group solely owns; for a shared file, `git apply --index` only that group's carved hunks. Commit with a Conventional-Commit message and no AI co-author trailer.
5. **Prove the union equals the target tree — or you have lost work.** Octopus-merge all atomic branches onto a throwaway branch from `M` and compare its tree hash to `T`. Equal → nothing lost, nothing added. Gate the comparison on the merge exit code: a conflicted octopus means two branches share a line-range (a step-2 violation), not a mergeable union.
6. **Prove base-mergeability, attribute the metric, then report.** `git fetch origin main`; every branch must pass `git merge-tree --write-tree origin/main <branch>` clean. Carry each branch's recorded metric delta (`.evolve/experiments.jsonl`) into its PR body; re-run a grader only with an additivity check. Report branches, file/hunk-sets, diffstats, deltas, `depends-on` flags, base-mergeability, and cleanup commands. On confirmation, open the PRs as a stack in application order. Tangle repos push via `gh-drew`; never `--no-verify`.

## Rules

- **Split at the hunk, not the file.** Two changes may share a file as long as they don't share a *line* — give each its own hunks and they still make independent PRs. Only genuinely entangled lines collapse into one PR; forcing a merge for *any* shared file turns this into a branch-organizer, not a decomposer.
- **Prove the union equals the target tree, or you have silently lost work.** The tree-hash match is the proof; "the construction felt right" is not. A mismatch means a hunk vanished or an extra one rode along — find it with `git diff $T $U` before you push a single branch.
- **Don't force splits — one kept change is one clean branch.** Splitting falls out of the partition, never a quota; if triage leaves one logical change, finalize outputs one tidy branch from the merge-base.
- **Conventional Commits, real base-mergeability, no shortcuts.** Every branch `feat|fix|chore(scope): …`, proven against a freshly fetched `origin/main` (git ≥ 2.38 for the `--write-tree` exit-code contract), `gh-drew` on Tangle repos, never `--no-verify`.

Use `references/full-reference.md` for the deterministic grouping algorithm, the exact hunk-carve and union-verification commands, symbol-flow dependency detection, stacked-PR machinery, and edge cases.

## Then consider

- `critical-audit` — review each atomic branch before it becomes a PR.
- `ship` — once one atomic branch is approved, deploy that single change to prod.
- `converge` — if an atomic branch's CI comes back red.
- `autopsy` — if the union hash won't match and you can't find the lost hunk.
