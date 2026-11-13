# census

The shared instruments for the [commit ratchets](../hooks) and factory checks.
[patterns.json](patterns.json) owns classification, limits, duplicate window size and hugging bands;
`classify.py` reads it for Python. `functions.cjs` and `python_functions.py` own AST function/class counts.
`census.sh` writes host-wide `files.tsv`.

```bash
census measure <checkout> <rev> [--scope prefix ...] # metrics and supporting lists as JSON
census floors <checkout> <base> <head> --floor lines --floor copies --floor god --floor hug --floor confusion
# Optional floors argument: --peer name=checkout:rev
census xrepo name=checkout:rev ...        # shared exports and located copies
census files <checkout> <rev>            # path, lines, logic|exempt as TSV
census instructions [--cwd dir] [--json] [--budget-tokens N] [--max-dup-share X]  # instruction text an agent loads
```

`instructions` measures files rather than a tree: what Claude Code loads for a cwd, its duplicates, contradiction candidates, rules a hook restates, dangling references and lines a linked doc already holds; `--help` defines each.

`<rev>` accepts any tree-ish or `WORKTREE`, which includes untracked files and sparse paths without changing the real index.
Measurements are cached by instrument revision and tree under `~/.cache/census`; compare revisions with the same instrument.
Exit codes: 0 measured/floors held; 1 floor rose; 2 measurement refused, never reported as zero.

Repeated `--scope prefix` or `--scope=prefix` selects a union of repository-relative paths in `scope`, retaining whole-tree `metrics` and `files_read`.
Prefixes match path boundaries. Invalid/unmatched scopes, unknown options and missing values refuse before writing a cache.
Scoped duplicates use the whole-tree peer population, including repeats within one file; overlapping matches count each covered line once.

`lists.prod_lines` gives per-file production sizes. `lists.dup_lines.files` gives normalized/duplicated counts;
`lists.dup_lines.windows` maps hashes to occurrences with `path`, one-based `normalized_start`, `start_line` and `end_line`.
Locations count physical LF lines, including Unicode separators; ignored comments/imports can make a physical span longer than its duplicate count.
Scoped windows retain all peers for every window touching a selected path. Cached whole-tree evidence precedes scope projection.

`xrepo` retains ranked previews and complete `lists.names`, `lists.cross_file_pairs`, `lists.windows` and `lists.repo_pairs`.
Names map to repos and defining paths; file pairs include both paths, shared-window counts and hashes; occurrences add `repo` to the locations above.
Repo-pair counts sum file-pair/window combinations. Preview scores add window size minus one to shared hashes and do not measure contiguous copied lines.

Every metric is better smaller. Floor groups are declared in `GROUPS` in [census](census); individual metric names also work.
`copies` needs peers for cross-repository windows; without peers, that part is explicitly unmeasured unless requested individually, which refuses.

## Growth approval

Growth is enforced at merge only: at a commit `loc-ratchet` prints the production lines the change adds and refuses nothing for them.
The merge check is `loc-ratchet <merge-base>..<head> <owner>/<repo>#<number>`, run by whatever merges the pull request.
It charges one number, the PR's total production change: deletions anywhere offset additions anywhere, across every directory.
A line of the charge is `tokensPerLine` tokens of code, and `prod_lines` uses the same unit; a token is a word or one punctuation character.
Comments, Python docstrings and blank lines are not code, so packing, reflowing and editing comments charge nothing; file and function limits still count physical lines.
A total at or under `growthLimit` in [patterns.json](patterns.json) merges with no approval. Deleted tests and docs never pay for production growth.
A restore is not growth: a commit message in the PR that carries `Restores: <sha>` for a commit on the base branch makes each added line that commit removed, matched by its whitespace-normalized text, charge nothing, and the check prints it as a debit against that deletion.
That lookup reads the deleting commit's blobs without fetching them; a clone that lacks them refuses the claim and charges the lines in full.
A commit and the merge print a warning with the count and each file:line of added production lines over `lineLimit` characters, unless one URL or hash is the excess; it never refuses.
Above the growth limit, a reviewer who did not write the lines checks that the capability is new, reuses nothing that exists and is proportionate, then comments on the PR:

```text
Growth approved: <owner>/<repo>#<number> at <40-hex head sha>: <why>
Session: <the reviewer's own session, or `Run ID: <run>`>
```

The PR's body names who wrote it with a `Run ID:` or `Session:` line, and the approving comment carries one the body does not.
A PR whose body carries neither cannot be approved until it has one, and a comment with no such line, or with the PR's, approves nothing.
When no record names the writer, a maintainer who has read the whole diff adopts the PR: the body says the writer is unrecorded and carries the adopter's line, and the adopter's line counts as the writer's.

The refusal prints that line filled in for the head it read; `<why>` is the reviewer's own words and may not be left as written.
An approval holds for a later head that descends from the approved sha while the PR's total has grown by at most `growthLimit` since; a rewritten history needs a new one.
`gh` (`CENSUS_GH` in `$DOTFILES_PRIVATE/claude/config/census.env`) reads the PR's comments and counts only those by the authenticated user; a caller that posts for several authors keeps the author from posting its own.
`CENSUS_FORK_PARENT_OWNERS` in the same configuration lists comma-separated GitHub parent owners whose forks retain the line policy; a verified fork of any other owner skips only `loc-ratchet`. Missing or invalid configuration keeps enforcement.
A check that cannot measure or cannot read GitHub refuses the merge (exit 2). An over-limit merge makes three REST reads (the PR, its comments, the user), so such merges stop while the REST quota is exhausted; a merge at or under the limit makes none.
The check runs only where the merging tool calls it: a merge issued with plain `gh` or the web button skips it entirely. An approval permits only production growth: every other cap and floor stays enforced.
[The qualification](../../tests/census-growth.integration.py) runs the commit hook and the merge check against a temporary repository, a blob-less clone of it and a fake `gh`.

## Integrity

Gitlinks are tree entries, not source blobs; target commits need not exist locally. Type changes count their regular blob side, excluding synthetic submodule diff lines.
Missing regular blobs, empty logic scans, incomplete parsing and unavailable required parsers refuse. TypeScript loads from the measured repo, `~/.local/share/dotfiles-node`, then `NODE_PATH`.
Extensionless interpreter scripts count as logic. Generated markers count only in opening comment headers; quoted or later mentions remain production.
Standard Storybook `.stories.*` registry files follow `patterns.json` exemptions; ordinary modules/routes under `stories` remain counted.
Function metrics cover JS/TS and Python (nested and async included); duplicate/export metrics retain their JS/TS population. `files_read` reports each population.
