# census

The one owner of every codebase instrument: production lines, god functions and classes, threshold hugging,
duplication, cross-repo copies, stale doc paths and duplicate exports.
The commit ratchets in [`../hooks`](../hooks), the hourly scoreboard and factory's census checks all count through it,
so a number means the same thing wherever it is read.

| File | Owns |
|---|---|
| `patterns.json` | The classification: what is a logic file, a test, a source file, convention export names, dated history; the limits and hugging bands. |
| `classify.py` | `patterns.json` for Python. `loc-ratchet`, `dup-export-ratchet` and `doc-ref-ratchet` import it. |
| `functions.cjs` | Function spans, class member counts and direct TypeScript/JavaScript export declarations from ASTs. Both declaration ratchets use it. |
| `python_functions.py` | Python AST parsing for both the census and staged function ratchet; a syntax error refuses the scan. |
| `census` | `measure`, `floors`, `xrepo` and `files` (below). |
| `census.sh` | Logic-file sizes across this host's clones, into `files.tsv`. |
| `score.sh` | The hourly scoreboard row in `~/.local/state/agent-work/loc-census/score.jsonl`. |

## Commands

```bash
census measure <checkout> <rev> [--scope prefix ...] # one repo's metrics at a revision, as JSON, with the lists behind them (functions over 150, hugging files and functions, classes over 40, stale paths, duplicate exports)
census floors <checkout> <base> <head> --floor lines --floor copies --floor god --floor hug --floor confusion \
  [--peer agent-runtime=/home/drew/code/agent-runtime:origin/main]
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

Every metric is better smaller. `floors` refuses a head that is worse than its base on any metric of a group:

| Group | Metrics |
|---|---|
| `lines` | `prod_lines`: lines in logic files outside tests, declarations, vendored and generated paths |
| `copies` | `dup_lines`: lines inside a 10-line normalized block that appears twice; `xrepo_windows`: blocks also present in a `--peer` |
| `god` | `fns_over_300`, `classes_over_40`, `files_over_1000` |
| `hug` | `hug_files` (951–1,000 lines), `hug_fns` (271–300 lines) |
| `confusion` | `stale_doc_refs`: backticked paths in current docs that name nothing; `dup_exports`: names exported from 2+ files |

A floor may also name one metric, such as a promoted shadow metric (`fns_over_150`, `mean_fn_lines`, `exported_names`).

## Integrity

A scan that reads no logic file, a blob that does not come back, a parse that misses a file or a missing
`typescript` package exits 2 with `CENSUS REFUSED:` and the reason. A metric no instrument read is refused, never
reported as 0. `typescript` is loaded from the measured repo, then `~/.local/share/dotfiles-node`, then `NODE_PATH`.

Standard `.stories.js`, `.stories.jsx`, `.stories.mjs`, `.stories.cjs`, `.stories.ts`, `.stories.tsx`, `.stories.mts` and `.stories.cts` files are Storybook registry entries, outside the production and ratchet populations.
Ordinary modules and routes remain counted even under a directory named `stories`.

Function metrics cover JavaScript, TypeScript and Python, including nested and async functions.
`files_read.functions` names that population; `source`, duplicate lines and exported names retain
their JavaScript/TypeScript population. Compare both revisions with the same instrument version.

Both `--scope prefix` and `--scope=prefix` work. Unknown options and missing option values are refused.
Scope syntax is checked before reading the tree; a refused selection never writes a measurement cache.
Source locations count physical LF lines, including when normalized content contains Unicode line separators.

Export counts come from direct TypeScript/JavaScript AST declarations, never text inside comments or literals.
Function, class, interface, type alias, enum and const/let declarations count; convention names in
`patterns.json` remain excluded. Export lists, barrels, export assignments and anonymous default declarations
do not declare a named implementation. Every binding of an exported const/let counts, including later
comma-separated declarators and destructuring names; the former text matcher counted only the first
identifier. Compare both revisions with this corrected instrument rather than attributing its correction
to source cleanup. The export ratchet compares HEAD, the index and the merge parent, so existing declarations
can be edited and moved without treating their new text positions as new implementations.
