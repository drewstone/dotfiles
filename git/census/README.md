# census

The one owner of every codebase instrument: production lines, god functions and classes, threshold hugging,
duplication, cross-repo copies, stale doc paths and duplicate exports.
The commit ratchets in [`../hooks`](../hooks), the hourly scoreboard and factory's census checks all count through it,
so a number means the same thing wherever it is read.

| File | Owns |
|---|---|
| `patterns.json` | The classification: what is a logic file, a test, a source file, an exported declaration, dated history; the limits and hugging bands. An extensionless file is logic when its first line runs an interpreter (`shebang`). |
| `classify.py` | `patterns.json` for Python. `dup-export-ratchet` and `doc-ref-ratchet` import it; `loc-ratchet` reads it through `census`. |
| `functions.cjs` | Function spans and class member counts from TypeScript and Python ASTs. `fn-ratchet.cjs` imports it. |
| `python_functions.py` | Python AST parsing for both the census and staged function ratchet; a syntax error refuses the scan. |
| `census` | `measure`, `floors`, `xrepo` and `files` (below). |
| `census.sh` | Logic-file sizes across this host's clones, into `files.tsv`. |
| `score.sh` | The hourly scoreboard row in `~/.local/state/agent-work/loc-census/score.jsonl`. |

## Commands

```bash
census measure <checkout> <rev> [--scope prefix ...] # one repo's metrics at a revision, as JSON, with the lists behind them (functions over 150, hugging files and functions, classes over 40, stale paths, duplicate exports)
census floors <checkout> <base> <head> --floor lines --floor copies --floor god --floor hug --floor confusion \
  [--peer agent-runtime=/home/drew/code/agent-runtime:origin/main] [--growth-approval /absolute/private/approval.json]
census xrepo name=checkout:rev ...        # exported names in 2+ repos and blocks copied across repos
census files <checkout> <rev>            # path, lines, logic|exempt for every logic file
```

`<rev>` is any tree-ish, or `WORKTREE` for the checkout's files as they are now, untracked ones included.
A measurement is cached by instrument revision and tree under `~/.cache/census`.

`measure --scope` accepts repeated repository-relative file or directory prefixes, joined as a union.
For example, `--scope scripts/ --scope services/ --scope products/sandbox/evals/` reports the lane
in `scope` while retaining whole-repository `metrics` and `files_read`. The duplicate peer population
is always the entire repository, including repeated windows within one file. Overlapping matches
count each covered normalized line once. Prefixes match path boundaries; invalid or unmatched
prefixes are refused. `dup_lines` still measures only the TS/JS source population in `patterns.json`;
shell and Python files contribute to production lines but do not enter this duplicate metric.

`lists.prod_lines` holds per-file production sizes. `lists.dup_lines.files` holds each source file's
normalized and duplicated line counts; `lists.dup_lines.windows` maps window hashes to all occurrences
with `path`, one-based `normalized_start`, `start_line`, and `end_line` in the original source.
The scoped list keeps only windows touching the selected paths and retains every peer occurrence.
A source span may include ignored comments, imports or blank lines; its physical span length is not
the duplicate count. Full evidence is cached before projection, so scoped and unscoped requests
share the same tree/instrument cache without changing global results.

`xrepo` retains its ranked `top_names`, `top_cross_file_pairs`, and repository-pair previews.
Its complete `lists.names` maps every shared export name to repository names and defining paths;
`lists.cross_file_pairs` identifies both files structurally, their shared window count, and every
window hash. `lists.windows` supplies all occurrences of each cross-repository hash, including
repeated occurrences within one file, with repository, path and the same source locations as `measure`.
`lists.repo_pairs` retains every repository pair; its values count file-pair/window combinations,
so a window in several files can contribute more than once. `window_normalized_lines` gives the
window size. The legacy file-pair preview score adds window size minus one to the shared-hash count;
`top_cross_file_pairs_unit` labels that score explicitly: disconnected or overlapping matches mean
it is not a contiguous copied-line count. Use the located windows or existing `measure` coverage
when auditing actual duplicated lines.

Every metric is better smaller. `floors` refuses a head that is worse than its base on any metric of a group:

| Group | Metrics |
|---|---|
| `lines` | `prod_lines`: lines in logic files outside tests, declarations, vendored and generated paths |
| `copies` | `dup_lines`: lines inside a 10-line normalized block that appears twice; `xrepo_windows`: blocks also present in a `--peer` |
| `god` | `fns_over_300`, `classes_over_40`, `files_over_1000` |
| `hug` | `hug_files` (951–1,000 lines), `hug_fns` (271–300 lines) |
| `confusion` | `stale_doc_refs`: backticked paths in current docs that name nothing; `dup_exports`: names exported from 2+ files |

A floor may also name one metric, such as a promoted shadow metric (`fns_over_150`, `mean_fn_lines`, `exported_names`).

## Scoped human approval

When the requester explicitly authorizes necessary production growth, keep its evidence outside public tool source.
Use one private JSON record for one exact change:

```json
{
  "repository": "<exact git remote get-url origin>",
  "base": "<full base object ID>",
  "tree": "<git write-tree, or the exact qualified head tree>",
  "areas": {"<growing area>": 12},
  "source": {
    "url": "https://github.com/<owner>/<repo>/pull/<number>#issuecomment-<id>",
    "sha256": "<SHA256 of the complete GitHub comment body encoded as UTF-8>",
    "quote": "<exact explicit requester approval retained in that comment>"
  }
}
```

The record must list every positive area delta, including new areas. Areas are `apps|products|packages|services|tools/<name>`,
other top-level directories, or `(root)` for root files. Git renames across areas count only their added or removed lines.
For commits, set `git config --local census.growthApproval /absolute/private/approval.json` and use normal `git commit`.
For Census, pass `--growth-approval` to `floors`. Keep the local config through normal commit and push, then remove it.
A merge into agent-container runs `loc-ratchet <merge-base>..<head>` inside `gh-drew` ([tangle-tools github/README.md](https://github.com/tangle-network/tangle-tools/blob/main/github/README.md)); there the approval is a comment on the PR, its quote the text above the block.
The same validator checks the exact origin, base, tree and area deltas. It fetches the cited comment with `gh-drew`,
checks its author against the authenticated account, and verifies the quote and full body digest. The fetched
comment must also contain a fenced `census-growth-approval` JSON block with exactly `repository`, `base`, `tree`
and `areas` from the record. A comment may list several exact blocks for a bounded qualification. Rewriting a local
record for new content cannot expand the scope in the source comment. Missing access,
a changed source or any scope mismatch refuses. Record the requester's authorization faithfully; the tool verifies
provenance and content binding, while the operator remains responsible for interpreting the requester's scope.

Approval admits only production-line growth. All measured values remain visible. File and function caps,
duplication and every other floor remain enforced. Default checks without an approval keep refusing growth.

## Integrity

A scan that reads no logic file, a blob that does not come back, a parse that misses a file or a missing
`typescript` package exits 2 with `CENSUS REFUSED:` and the reason. A metric no instrument read is refused, never
reported as 0. `typescript` is loaded from the measured repo, then `~/.local/share/dotfiles-node`, then `NODE_PATH`.

Generated markers count only in comment headers. Quoted source or prose mentioning the marker remains production.

Standard `.stories.js`, `.stories.jsx`, `.stories.mjs`, `.stories.cjs`, `.stories.ts`, `.stories.tsx`, `.stories.mts` and `.stories.cts` files are Storybook registry entries, outside the production and ratchet populations.
Ordinary modules and routes remain counted even under a directory named `stories`.

Function metrics cover JavaScript, TypeScript and Python, including nested and async functions.
`files_read.functions` names that population; `source`, duplicate lines and exported names retain
their JavaScript/TypeScript population. Compare both revisions with the same instrument version.

Both `--scope prefix` and `--scope=prefix` work. Unknown options and missing option values are refused.
Scope syntax is checked before reading the tree; a refused selection never writes a measurement cache.
Source locations count physical LF lines, including when normalized content contains Unicode line separators.
