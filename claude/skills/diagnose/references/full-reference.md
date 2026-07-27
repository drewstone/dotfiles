# Diagnose — worked examples

Examples only. `../SKILL.md` is the normative contract: rules, taxonomy codes, output template, self-gate, dispatch. Nothing here overrides it.

## Example 1 — filled artifact (10/10, reconstructed from log run 2026-07-04)

```markdown
# Diagnose: @products/platform-api full suite — 2026-07-04 — 44 failed / 2877 cases (1.5%)

**Verdict:** fix "test harness bypasses production SQLite retry/WAL wrapper" first — clears 44/44 failures (100%), effort 1-file. measured
**Next:** /converge on fix/intelligence-trace-completeness; green check = `pnpm -F @products/platform-api test` → expect 2833/2833

## Corpus
| Field | Value |
|---|---|
| Source | `.agent/runs/platform-api-2026-07-04/vitest.json` |
| Parsed | n=2877: 2833 pass / 44 fail / 0 skip |
| Traces read | 6 of 44 (cases 3, 9, 14, 27, 31, 40) |
| Not inspected | 38 traces — 6/6 read showed the identical SQLITE_BUSY frame |

## Clusters — 1 of 1, ranked by failures cleared ÷ effort
| # | Cluster | Occurs | Root cause (code) | Evidence | Status | Fix | Effort | Cost incurred | Saving if fixed | Confidence |
|---:|---|---:|---|---|---|---|---|---:|---:|---:|
| 1 | Test DB helper skips retry/WAL wrapper | 44/44 | `config` — test helper builds its own client | `tests/helpers/db.ts:22` vs `src/db/client.ts:41` | measured (`vitest run --repeat 3` → same 44) | share `createDatabaseFromClient` across prod + test helpers | 1-file | 3 blocked PRs, 5 reruns × 11 min = 55 min | 44 failures, 55 min/attempt | 6/6 traces agree |

## Fix #1
| Field | Value |
|---|---|
| Change | `tests/helpers/db.ts:22` → call `createDatabaseFromClient` instead of `new Database()` |
| Predicted | 44 failures pass: all SQLITE_BUSY ids |
| Falsifier | failures persist with concurrency 1 → cause is not the missing WAL wrapper |
| Risk | test DB now honors prod retry timeouts; slow cases could hit the 5 s limit |
| Verification | `pnpm -F @products/platform-api test` → expect 2833/2833, `dbRetry 14/14` |

## Self-gate
8/8 passed — failed: none.
```

## Example 2 — counterexample (0/10, verbatim log entry)

```json
{"name": "unknown eval flag footgun", "fix": "enable strict CLI argument parsing"}
```

Defects: 0 occurrence count, 0 `path:line`, 0 status label, 0 cost, 0 verification command, no test-bug-vs-code-bug call. Unfixable as written — a reader cannot tell whether 1 or 40 cases were affected.

## Example 3 — parse commands by source format

| Source | Command |
|---|---|
| Vitest/Jest JSON | `jq -r '.testResults[].assertionResults[] \| select(.status=="failed") \| [.fullName, .failureMessages[0]] \| @tsv' report.json` |
| JUnit XML | `xq -r '.testsuites.testsuite.testcase[] \| select(.failure) \| .["@name"]' junit.xml` |
| TAP | `grep -n '^not ok' out.tap` |
| GitHub Actions | `gh run view <id> --log-failed \| grep -E 'FAIL\|Error:' \| sort \| uniq -c \| sort -rn` |
| Benchmark CSV | `python3 -c "import csv,collections;..."` → counts per error string |
| Agent/eval traces | `jq -r 'select(.outcome!="pass") \| [.caseId,.failureClass] \| @tsv' results.jsonl \| sort -k2 \| uniq -c` |

Every command's purpose is the same: produce `count × error-signature` rows so clustering starts from counts, not impressions.
