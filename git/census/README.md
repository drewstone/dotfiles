# census

The shared instruments for the [commit ratchets](../hooks) and factory checks.
[patterns.json](patterns.json) owns classification, limits, duplicate window size and hugging bands;
`classify.py` reads it for Python. `functions.cjs` and `python_functions.py` own AST function/class counts.
`census.sh` writes host-wide `files.tsv`.

```bash
census measure <checkout> <rev> [--scope prefix ...] # metrics and supporting lists as JSON
census floors <checkout> <base> <head> --floor lines --floor copies --floor god --floor hug --floor confusion
# Optional floors arguments: --peer name=checkout:rev --growth-approval /absolute/private/approval.json
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

## Scoped judged approval

Normal commits may offset production growth with real text deletions anywhere except lockfiles; merges keep the per-area charge.
Otherwise a new capability may grow: a reviewer other than its author checks that it is new, reuses nothing that exists and is proportionate, then posts the approval comment.
The author keeps it in a private JSON record containing `repository` (exact origin URL), `base` (full object ID),
`tree` (exact head tree), `areas` (every positive production delta), and `source` with `url`, `sha256` and the exact authorization `quote`.
The source URL names a GitHub issue/PR comment. Its complete body digest and quote must match; `gh` (`CENSUS_GH` in `$DOTFILES_PRIVATE/claude/config/census.env`) verifies its author against the authenticated user.
`CENSUS_FORK_PARENT_OWNERS` in the same configuration lists comma-separated GitHub parent owners whose forks retain the line policy; a verified fork of any other owner skips only `loc-ratchet`. Missing or invalid configuration keeps enforcement.
That comment must contain a fenced `census-growth-approval` JSON block matching exactly `repository`, `base`, `tree` and `areas`, and the quote must carry the reviewer's words for that same scope, `Census growth approval for <repository>, base <base>, tree <tree>, areas <areas JSON>: <why>`, so a general or reused sentence approves nothing; several exact scopes may share a comment.
Areas are `apps|products|packages|services|tools/<name>`, other top-level dirs, or `(root)`; a new area is charged like an existing one, only a repository's first commit grows from nothing, and cross-area renames charge only changed lines.
A merge is charged only for its additions beyond both parents, excluding the merged branch's changes since their merge-base.
Set local `census.growthApproval` to the private record for normal commit/push, or pass `--growth-approval` to `floors`; remove local config afterwards.
[The normal-hook qualification](../../tests/census-growth.integration.py) exercises the record format and source binding.
Missing access, changed source or mismatched scope refuses. Approval permits only production growth, keeping all metrics visible and every other cap/floor enforced.

## Integrity

Gitlinks are tree entries, not source blobs; target commits need not exist locally. Type changes count their regular blob side, excluding synthetic submodule diff lines.
Missing regular blobs, empty logic scans, incomplete parsing and unavailable required parsers refuse. TypeScript loads from the measured repo, `~/.local/share/dotfiles-node`, then `NODE_PATH`.
Extensionless interpreter scripts count as logic. Generated markers count only in opening comment headers; quoted or later mentions remain production.
Standard Storybook `.stories.*` registry files follow `patterns.json` exemptions; ordinary modules/routes under `stories` remain counted.
Function metrics cover JS/TS and Python (nested and async included); duplicate/export metrics retain their JS/TS population. `files_read` reports each population.
