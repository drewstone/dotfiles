# Branch reconstruction

Use isolated worktrees and this run's recorded refs for reconstruction.
Keep the original branch and intended target tree available until every retained change is accounted for.

## Target and grouping

Record the source revision, comparison base, merge-base, intended target tree, and reasons for excluded changes.
Inspect the net diff as well as commit history.
A reverted experiment can have a useful surviving change, and a merge commit can contain an important resolution.
Treat generated artifacts according to repository requirements rather than discarding them by file type.

Group by a coherent behavior or review decision.
Commit scopes, paths, and overlapping hunks help locate dependencies but do not decide the grouping by themselves.
A refactor and a feature touching the same lines may form a valid stack.
Conversely, nonoverlapping lines can conflict through context or depend on the same contract.

Trace imports, definitions, schemas, configuration, and generated outputs across groups.
Use the repository's symbol tools when text search cannot follow an important dependency.
A symbol match is a lead; inspect its binding and use before declaring a dependency.
Build and test each branch on its actual prerequisite, not on a base it cannot run against.

## Whole files and shared hunks

For a path owned entirely by one group, restore its intended target state in that group's clean worktree:

```bash
git restore --source="$target_tree" --staged --worktree -- "$path"
```

This also handles a deletion when the path is tracked in the branch but absent from the target tree.
Keep both sides of a rename together and preserve tracked binary artifacts with their owning change.

For a shared text file, produce the diff from the group's actual base and retain only the selected hunks in a separate patch:

```bash
git diff --binary --full-index "$group_base" "$target_tree" -- "$path" > "$full_patch"
```

Preserve valid patch headers and inspect the selected changes before applying them.
Then validate and apply that patch from the group's worktree:

```bash
git apply --check --index "$group_patch"
git apply --index "$group_patch"
git diff --cached
```

A hunk that cannot apply requires a corrected patch, a prerequisite, or a different grouping.
Do not use a merge fallback that silently brings unrelated target changes into the group.
Keep reviewable intermediate commits when they explain the change; otherwise consolidate the group's churn.

## Reconstruct and compare

Set `split_base`, `target_tree`, and `branches_file` from the recorded run.
The branch file contains only this run's branch refs, one per line, in dependency order.
Do not discover branches with a broad shell or ref glob.
Run this example with Bash; preserve its output and exit status:

```bash
set -euo pipefail
proof_parent=$(mktemp -d "${TMPDIR:-/tmp}/finalize-proof.XXXXXX")
proof_dir="$proof_parent/worktree"
git worktree add --detach "$proof_dir" "$split_base"
while IFS= read -r branch || [ -n "$branch" ]; do
  [ -n "$branch" ] || continue
  if ! git -C "$proof_dir" merge --no-ff --no-edit "$branch"; then
    printf 'Reconstruction failed while applying %s; inspect %s\n' "$branch" "$proof_dir"
    exit 1
  fi
done < "$branches_file"
actual_tree=$(git -C "$proof_dir" rev-parse 'HEAD^{tree}')
if [ "$actual_tree" != "$target_tree" ]; then
  git -C "$proof_dir" diff "$target_tree" "$actual_tree"
  printf 'Reconstruction differs from the intended target: %s\n' "$proof_dir"
  exit 1
fi
printf 'Reconstruction matches target tree %s\n' "$actual_tree"
```

A failed merge must not be followed by reading the unchanged pre-merge tree as evidence.
A successful tree comparison proves content equality, including modes and tracked paths; it does not prove that each branch works independently.
Validate the branches separately against their intended bases.
Keep a failed scratch worktree for diagnosis and remove a successful one only after recording its result and checking its state.

## Current base and PRs

Fetch the actual target branch and verify each PR against its intended base with the current git merge check.
For git versions supporting this command, success is exit status zero:

```bash
git merge-tree --write-tree "$pr_base" "$branch"
```

Use an isolated trial merge if the installed git lacks that operation.
Keep diagnostic output and check the exit status.
If the target base changes the reconstructed content, record the refreshed intended target and repeat validation and reconstruction.

For a stack, each dependent branch includes its prerequisites and targets the immediate prerequisite in its PR.
An independent branch targets the repository's target base.
Use the repository's required identity, PR conventions, and existing authorization.
Carry original experiment measurements with their original revision and conditions; do not relabel them as results for the reconstructed branch.
