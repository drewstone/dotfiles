# census

The one owner of every codebase instrument: production lines, god functions and classes, threshold hugging,
duplication, cross-repo copies, stale doc paths and duplicate exports.
The commit ratchets in [`../hooks`](../hooks), the hourly scoreboard and factory's census checks all count through it,
so a number means the same thing wherever it is read.

| File | Owns |
|---|---|
| `patterns.json` | The classification: what is a logic file, a test, a source file, an exported declaration, dated history; the limits and hugging bands. |
| `classify.py` | `patterns.json` for Python. `loc-ratchet`, `dup-export-ratchet` and `doc-ref-ratchet` import it. |
| `functions.cjs` | Function spans and class member counts from TypeScript and Python ASTs. `fn-ratchet.cjs` imports it. |
| `python_functions.py` | Python AST parsing for both the census and staged function ratchet; a syntax error refuses the scan. |
| `census` | `measure`, `floors`, `xrepo` and `files` (below). |
| `census.sh` | Logic-file sizes across this host's clones, into `files.tsv`. |
| `score.sh` | The hourly scoreboard row in `~/.local/state/agent-work/loc-census/score.jsonl`. |

## Commands

```bash
census measure <checkout> <rev>          # one repo's metrics at a revision, as JSON, with the lists behind them (functions over 150, hugging files and functions, classes over 40, stale paths, duplicate exports)
census floors <checkout> <base> <head> --floor lines --floor copies --floor god --floor hug --floor confusion \
  [--peer agent-runtime=/home/drew/code/agent-runtime:origin/main]
census xrepo name=checkout:rev ...        # exported names in 2+ repos and blocks copied across repos
census files <checkout> <rev>            # path, lines, logic|exempt for every logic file
```

`<rev>` is any tree-ish, or `WORKTREE` for the checkout's files as they are now, untracked ones included.
A measurement is cached by instrument revision and tree under `~/.cache/census`.

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

Function metrics cover JavaScript, TypeScript and Python, including nested and async functions.
`files_read.functions` names that population; `source`, duplicate lines and exported names retain
their JavaScript/TypeScript population. Compare both revisions with the same instrument version.
