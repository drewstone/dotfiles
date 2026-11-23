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

## Size and growth

Nothing refuses a commit or a merge for production growth or file size.
At a commit `loc-ratchet` prints the production lines the change adds: deletions anywhere offset additions anywhere, a line is `tokensPerLine` tokens of code, and comments, tests and docs are not counted.
A commit and a merge print a warning with the count and each file:line of added production lines over `lineLimit` characters, unless one URL or hash is the excess.
`census measure` reports `prod_lines` and `files_over_1000` for a whole repository.

## Integrity

Gitlinks are tree entries, not source blobs; target commits need not exist locally. Type changes count their regular blob side, excluding synthetic submodule diff lines.
Missing regular blobs, empty logic scans, incomplete parsing and unavailable required parsers refuse. TypeScript loads from the measured repo, `~/.local/share/dotfiles-node`, then `NODE_PATH`.
Extensionless interpreter scripts count as logic. Generated markers count only in opening comment headers; quoted or later mentions remain production.
Standard Storybook `.stories.*` registry files follow `patterns.json` exemptions; ordinary modules/routes under `stories` remain counted.
Function metrics cover JS/TS and Python (nested and async included); duplicate/export metrics retain their JS/TS population. `files_read` reports each population.
