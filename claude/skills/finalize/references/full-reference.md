---
name: finalize
description: "Full method for /finalize — the deterministic hunk-partition grouping algorithm, the union-equals-target verification with exact git commands, symbol-flow dependency detection, stacked-PR machinery, and the edge cases."
---

# Finalize — Full Reference

`/finalize` takes one messy branch and emits N clean, independent branches, each built from the merge-base, each an isolated reviewable PR.
The whole method rests on one idea: **the atomic branches are a partition of the changed CODE, not of the changed files.**
The unit of that partition is a whole file when only one branch touches it (the common, cheap case) and an individual `@@` hunk when two branches touch the same file at different lines.

Disjoint change-units are what make the branches independent — they can never git-conflict with each other — and what make the safety proof cheap: the union of disjoint units is well-defined and reconstructs the whole.
File-level disjointness is a special case of unit-level disjointness, so the same union proof holds whether a file is owned whole or split by hunk.

## The mental model: a partition of changed code

Let the kept commits touch a set of change-units `U` (files, or hunks of shared files).
A valid finalize output is a set of groups `G1…Gk` such that:

- **Cover:** `union(Gi.units) == U` — every changed unit is in some group (nothing dropped).
- **Disjoint:** no two groups own the same unit, and no two groups own overlapping line-ranges in one file (nothing collides).

Cover + disjoint means the groups *partition* `U`.
Because they partition, applying all groups to the merge-base `M` reconstructs exactly the target tree `T`.
For a file owned whole, its `T`-version comes from the one group that owns it.
For a file split by hunk, each branch carries that file at `M`-state plus only its own hunks; a 3-way merge of those branches against base `M` recomposes the file to `M + all hunks == T` (non-overlapping hunks auto-merge — this is the property that makes hunk-splitting safe).
That reconstruction identity is what step 5 verifies with a tree-hash comparison.

## Step 1 — Triage: define KEEP and the target tree `T`

```bash
M=$(git merge-base origin/main HEAD)
git log --reverse --stat --format='%h %s' "$M"..HEAD    # every commit + its files
git show <sha> -- <file>                                  # per-file diff when a commit is ambiguous
```

Mark each commit KEEP or SKIP.
SKIP the noise: debug/`console.log` prints, `wip`/`fixup` commits later reverted, dead-end experiments that were undone, stray dependency bumps unrelated to the work, merge commits from syncing with main.

Then define the **target tree `T`** — the tree the atomic branches must jointly reproduce:

- **Common case — every commit is KEEP.** `T` is just the branch tip's tree:
  ```bash
  T=$(git rev-parse HEAD^{tree})
  ```
- **Skip-some case.** Reconstruct KEEP-only on a scratch branch so the partition and the replay are two independent operations (a bug in one can't hide in the other):
  ```bash
  git switch -c _finalize-target "$M"
  git cherry-pick <keep1> <keep2> … <keepN>     # KEEP commits, in original order
  # a SKIP commit that touched the same lines can conflict here;
  # resolve toward the intended KEEP state — that resolution IS your definition of "kept"
  T=$(git rev-parse _finalize-target^{tree})
  ```

`T` is the ground truth for the rest of the run; everything downstream is judged against it.

## Step 2 — Deterministic grouping (seed → forced merges → symbol overlay)

The grouping is mechanical and inspectable, not a vibes call. Three passes:

```
# PASS 1 — seed
seeds = one group per distinct Conventional-Commit type(scope) across KEEP commits.
        A commit with no clear type(scope) seeds by touched top-level directory,
        or by a one-line intent label the agent records (recorded => the call is auditable).

# PASS 2 — change units + FORCED merges (mechanical, non-negotiable)
for each file f touched by KEEP:
    owners = { seeds that changed f }
    if |owners| == 1: f is that seed's unit (whole-file fast path)
    else:
        split `git diff $M $T -- f` into @@ hunks; each hunk is a unit, assigned to
        the seed whose commit introduced it (`git log -L <start>,<end>:f` when unclear).
        if two seeds own the SAME or ADJACENT line-range in f:            # true line conflict
            add a FORCED edge between them — they cannot be separate PRs.

groups = connected components of seeds under FORCED edges.

# PASS 3 — SYMBOL overlay (from Step 3): a def in group A referenced in group B.
# Default: a depends-on FLAG (separate stacked PRs, order preserved) — NOT a merge.
# Merge A and B only if neither stands alone as a reviewable PR (agent confirms; record the edge).

assert union(g.units for g in groups) == U            # cover
assert pairwise line-range disjoint across groups     # disjoint
emit: partition (group -> units) + every FORCED/confirmed edge that justified a merge
```

The seeds and forced merges are deterministic; the only judgment is a PASS-3 symbol merge, and it is recorded as an edge so a reviewer can falsify it.
The key upgrade over naive file-partitioning: a `fix(auth)` and a `feat(auth)` that both edit `auth.ts` at *different* lines become two branches, each carrying its own hunks — the exact untangling a human wants finalize for.
Only when they edit the *same* lines (a real 3-way conflict) does the forced edge collapse them into one PR; that is rare and honest.

## Step 3 — Cross-group dependency flagging

Disjoint change-units guarantee the branches never *git*-conflict.
They do **not** guarantee logical independence: group B can call a function group A introduces, extend a type A adds, or read a config key A defines.
These are review-order dependencies — a reviewer who merges B before A gets a red build you could have prevented with one flag.

Prefer a real symbol index when the repo has one:

```bash
# best: LSP or ctags — resolves re-exports, methods, dynamic names
ctags -R --fields=+n -f - ${A_files} ${B_files}
# then query which symbols defined in A's changed ranges are referenced in B
```

Heuristic fallback (label it as one — it has known low recall):

```bash
# catches named top-level defs in C-family / JS / TS / Py / Go / Rust; MISSES
# `export const X`, `export {X}`, `module.exports.X`, re-exports, macro-generated
# names, Go value-receiver methods, and false-positives on comments/strings.
git diff "$M" "$T" -- ${A_files} | grep -E '^\+.*(export|def |func |fn |class |pub )'
grep -RnE '<symbol1>|<symbol2>' ${B_files}
```

A hit means B depends on A: record `depends-on: A` on group B, and preserve original commit order as the topological tiebreak — the order the commits actually landed is always a valid apply order, so numbering branches `atomic/1-…`, `atomic/2-…` keeps the dependency chain satisfiable.
Escalate from the heuristic to the symbol-index path when branch count > 3 or the repo has an LSP.
Safety net either way: a missed edge still surfaces as a compile error the reviewer sees — the flag turns a red build into a one-line note, it is not the only line of defense.

## Step 4 — Build one branch per group from the merge-base

For each group `g` at index `i`, in application order, start from `M`:

```bash
git switch -c "atomic/${i}-${slug}" "$M"
```

**Whole files the group solely owns** (fast path) — restore each to its `T`-state in index and worktree, which also **deletes** any path absent from `T` (a file the group removed):

```bash
git restore --source="$T" --staged --worktree -- ${g_whole_files}
```

**Files shared with another group** — apply only this group's hunks. Carve them from the base→target diff by keeping the `@@` hunks assigned to `g` in step 2, then apply from the branch (whose copy of `f` is still at `M`-state, so every hunk's base-side context locates cleanly regardless of the other group's hunks):

```bash
git diff "$M" "$T" -- "$f" > /tmp/f.full.patch      # then keep only g's @@ hunks -> f.g.patch
git apply --index --3way "/tmp/f.g.patch"
```

Then commit:

```bash
git commit -m "feat(scope): <one-line summary>"      # Conventional Commit; NO co-author trailer
```

**Restore vs cherry-pick — the decision rule, not a vibe:** net-`restore` (collapsing a group's intra-group churn into one clean diff) is the default.
Cherry-pick the group's commits instead **only when** the group has >1 kept commit AND its intermediate states are individually reviewable — e.g. a pure refactor with a behavior change stacked on top, where a reviewer wants to see the refactor land first:

```bash
git switch -c "atomic/${i}-${slug}" "$M"
git cherry-pick <g_commit1> <g_commit2> …            # keeps granular history
```

Either way the branch ends at the group's `T`-state for its units, so the union check in step 5 holds.

## Step 5 — Verify the union equals the target tree

This is the safety proof: it catches a unit dropped from every group (cover violation) and a unit that leaked into two groups (disjoint violation), neither of which the construction alone guarantees.
Enumerate branches by ref — never a shell glob (`atomic/1-*` is a filename glob; in zsh it aborts with `no matches found` and the proof silently never runs):

```bash
BRANCHES=$(git branch --format='%(refname:short)' --list 'atomic/*')

git switch -c _finalize-verify "$M"
if git merge --no-ff --no-edit $BRANCHES; then          # octopus; disjoint units => no conflict
  U=$(git rev-parse _finalize-verify^{tree})            # read tree ONLY on merge success
  if [ "$U" = "$T" ]; then
    echo "UNION == TARGET — nothing lost, nothing added"
  else
    echo "MISMATCH — a hunk vanished or an extra one rode along:"
    git diff "$T" "$U" --stat                           # names exactly the missing/extra hunks
  fi
else
  echo "octopus CONFLICT — two branches share a line-range; disjoint invariant violated in step 2"
fi
```

Gating the tree read on the merge exit code is load-bearing: a conflicted octopus leaves `_finalize-verify` at its **pre-merge** commit, so an ungated `git rev-parse _finalize-verify^{tree}` would read the stale `M`-tree and could falsely print a mismatch (or, if `M==T`, a false match).
Two trees are byte-identical iff their hashes match, so a clean octopus with `U == T` is a complete proof that the atomic branches jointly reproduce the kept work — no more, no less.

If the octopus conflicts, find the offending pair with sequential merges, then fix the grouping (add the missing forced edge, merge the two entangled groups), rebuild those branches, and re-verify:

```bash
git switch -C _finalize-verify "$M"
for b in $BRANCHES; do
  git merge --no-ff --no-edit "$b" || { echo "CONFLICT introduced by $b — shares a line-range with an earlier branch"; break; }
done
```

Clean up the scratch branches once the hashes match: `git switch - && git branch -D _finalize-verify _finalize-target`.

## Step 6 — Base-mergeability, metric attribution, report, stacked PRs

**Base-mergeability.** Prove every branch merges into the live base before pushing anything (the `--write-tree` exit-code contract needs git ≥ 2.38; on older git, parse the output for conflict markers instead):

```bash
git fetch origin main
for b in $(git branch --format='%(refname:short)' --list 'atomic/*'); do
  if git merge-tree --write-tree origin/main "$b" >/dev/null 2>&1; then
    echo "$b: merges clean into origin/main"
  else
    echo "$b: CONFLICTS with origin/main — rebase before PR"
  fi
done
```

**Metric-delta attribution — read first, re-run only with an additivity check.**
`/evolve` and `/meta-harness` already tie each kept commit to a measured delta in `.evolve/experiments.jsonl` / scorecard history.
Carry that commit's recorded delta into the branch's PR body — no re-run, no requirement that the branch build in isolation, and it reconciles with the artifacts that already exist.
File-disjointness is **not** metric-separability: two independent code changes can still interact in the measured number, and a `depends-on: A` branch may not even build alone.
So if you must re-run a grader, measure each branch **and** the full union, then verify additivity and report the residual as the interaction term:

```
sum(per-branch deltas) vs union delta  →  residual = interaction (report it; never claim "cleanly attributable" without it)
```

**Report** (one block): branches created; for each, its unit-set, net `--stat` diff, Conventional-Commit subject, metric delta (recorded or measured+residual), and any `depends-on` flag; the base-mergeability result; and the cleanup commands.

**Open the PRs as a stack** — the `depends-on` order you computed is exactly what a stack needs, so don't drop it on the floor at the last step.
Gate this outward action behind one confirmation (Cost gate), then create each PR based on its prerequisite so its diff shows only its own change:

```bash
# independent branch -> base = main; dependent branch -> base = its prerequisite branch
gh-drew pr create --base main               --head atomic/1-<slug> --title "feat(scope): …" --body "<delta + no deps>"
gh-drew pr create --base atomic/1-<slug>    --head atomic/2-<slug> --title "feat(scope): …" --body "depends-on: #<PR1> · <delta>"
```

Tangle repos: `gh-drew api user --jq .login` must print `drewstone` first; never raw `gh`, never `--no-verify`.

**Cleanup**, after the PRs land:

```bash
git branch -D $(git branch --format='%(refname:short)' --list 'atomic/*')   # the atomic branches
git branch -D <messy-experiment-branch>                                     # only once every KEEP change shipped
```

## Edge cases

- **Single logical change.** Triage collapses to one group.
  Output one clean branch from `M` with a proper Conventional-Commit message — do not manufacture slivers to look thorough.
  The union check is trivially `atomic/1`'s tree `== T`.
- **A fix and a feature tangled in one file (the common mess).** If they touch different lines, they split by hunk into two branches — the whole point of unit-level partitioning.
  Only if they edit the *same* lines does the forced edge collapse them into one PR; flag it `entangled at file:line — one PR` and move on.
- **Commits to skip.** Debug prints, reverted dead-ends, WIP, unrelated dependency bumps, main-sync merges — mark SKIP in step 1 and exclude them from `T`.
  The union check fails loudly if a skipped change sneaks into a branch, which is the point.
- **A file created then deleted across the kept work.** If `T` doesn't contain it, it belongs in no group (net-zero); `git restore --source=$T` naturally omits it — don't add it back.
- **A file deleted by a group.** It's in the group's unit-set but absent from `T`; `git restore --source=$T --staged --worktree -- <file>` deletes it on the branch. The union check still holds.
- **Renames.** Git records a rename as delete-old + add-new; both paths are the group's units. Keep them in one group — splitting old and new across branches breaks the rename.
- **Binary / generated files.** Same partition rule, but hunk-splitting doesn't apply. If a generated artifact was committed, prefer marking its regeneration a SKIP and letting CI produce it rather than shipping a blob on a branch.

## Persist

Write `.evolve/finalize/<date>-<slug>.md` with the KEEP/SKIP triage, the partition (group → units), the forced/symbol edges, the dependency flags, the `T` hash, and the union-check result.
Append a `skill-runs.jsonl` line (`skill: /finalize`, `verdict: SHIP` when the union matched and branches are base-mergeable, else `BLOCKED`).
The record must let a fresh agent re-derive the branches from `M` and `T` without your context.
