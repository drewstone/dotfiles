---
name: diagnose
description: Cluster test, CI, benchmark, or eval failures by root cause and rank concrete fixes.
---

# Diagnose

Many failures, one decision: **what to fix first**. Cluster before patching — the best logged run collapsed 44 failing cases into 1 root cause with a 1-file fix. Emit a cluster table, never prose.

## Flow

1. **Locate raw data** — argv path, else `agent-results/`, `test-results/`, `coverage/`, `.agent/`, else CI (`gh run view <id> --log-failed`). Nothing found → ask; do not guess.
2. **Parse every failure, preserve counts** — id, error, stack, prior steps, timing, env/flags. Totals must reconcile: `pass + fail + skip = n`.
3. **Read ≥1 raw trace per cluster**, not the summary line — the summary says "failed", the trace says why. Fan out read-only subagents when failures >10.
4. **Classify** each failure to exactly 1 taxonomy code below; no match → `other`, never force-fit.
5. **Cluster by root cause**, not by file or test name. Bar: ≥2 failures sharing a cause, or 1 on a release-critical path. Below the bar → Singletons, unexpanded.
6. **Rank by (failures cleared ÷ effort)**, emit the template, run the 8-item self-gate.

## Hard rules

| Rule | Why (measured over n=20 unique logged /diagnose runs) |
|---|---|
| **≤500 words outside tables.** No paragraph >3 lines — if longer, it is a table. | Prior contract mandated 3 fenced *prose* blocks and 0 output tables; 0/20 runs produced a cluster table. |
| **`k of n` on every cluster.** Banned as claims: several, many, most, repeated, often, significant, substantial, strong, flaky-ish. | 1/7 logged cluster entries carried a numeric failure count. |
| **`measured \| inferred \| hypothesis` on every row**, with the exact check (`path:line`, command + output, run id) for anything `measured`. `hypothesis` rows are banned from Verdict and Fix #1. | 0/7 cluster entries carried `path:line` evidence; 2/20 runs recorded any verification. |
| **Cost both sides, same unit:** cost incurred (failing checks, reruns, blocked PRs, wall-min) + saving if fixed (failures cleared, min/run reclaimed), assumption stated. Unknown → `unmeasured (<reason>)`; never drop the column. | 0/20 runs recorded any cost or rerun count. |
| **Evidence is a pointer**, not a summary. `src/client.ts:142`, `run 20e89c93`, `vitest run pkg → 41/41`. "The retry logic is wrong" is a defect. | 4/7 cluster entries were name+fix only, with 0 pointers. |
| **Confidence is `k/m traces agree`**, not high/medium/low. m = traces you actually read. | — |
| **Verdict = 1 cluster + 1 number + 1 dispatch.** Verdict vocabulary is fixed: `ROOT_CAUSE_CONFIRMED \| PARTIAL \| INSUFFICIENT_DATA`. | 15 runs used 8 distinct verdict strings; 1 verdict was a 14-word sentence. |
| **Test bug vs code bug is a required call** on every cluster; if undecidable, say `INSUFFICIENT_DATA` and name the 1 instrument that would decide it. | — |
| **No ceremony**: no self-grade, no restating the task, no "none this run" placeholder sections. Omit an empty section. | — |

## Taxonomy — 1 code per failure

| Code | Trace signature | Distinguishing check |
|---|---|---|
| `logic` | wrong value, off-by-one | assertion diff is deterministic across 3 reruns |
| `timeout` | hit limit, hung | duration ≈ limit ±5% |
| `crash` | unhandled throw, null/type error | stack top is in product code, not the runner |
| `external-dep` | network/API/service error | same case passes with the dep stubbed |
| `race` | passes k/m reruns | `--repeat 10` flips outcome ≥1 time |
| `resource` | OOM, ENOSPC, pool exhausted | failure count rises with concurrency |
| `config` | missing env var, wrong mode | diff the live env of pass vs fail run |
| `stale-state` | leaks across cases | passes when run alone (`-t "<name>"`) |
| `test-bug` | assertion wrong, code right | product behavior matches the spec by hand |
| `env-mismatch` | local pass, CI fail | same commit, 2 environments, 1 outcome differs |
| `wrong-strategy` | agent took a different approach | transcript shows plan divergence at turn k |
| `stale-snapshot` | acted on outdated state | element/state existed at t−1, not at t |
| `blocked` | anti-bot, 403, modal/dialog | HTTP status or overlay node in the trace |
| `hallucination` | impossible output | cited artifact does not exist on disk |

## Output template

Emit exactly this. Omit a section only where its rule allows.

```markdown
# Diagnose: <source> — <YYYY-MM-DD> — <F> failed / <N> cases (<P>%)

**Verdict:** fix <cluster #1> first — clears <k>/<F> failures (<x>%), effort <trivial|1-file|multi-file|architectural>. <measured|inferred>
**Next:** /<skill> on <target>; green check = `<exact command>` → expect <k>/<n>

## Corpus
| Field | Value |
|---|---|
| Source | <path / run id / CI URL> |
| Parsed | n=<N>: <P> pass / <F> fail / <S> skip |
| Traces read | <m> of <F> (<ids>) |
| Not inspected | <what, why> |

## Clusters — <k> of <total>, ranked by failures cleared ÷ effort
| # | Cluster | Occurs | Root cause (code) | Evidence | Status | Fix | Effort | Cost incurred | Saving if fixed | Confidence |
|---:|---|---:|---|---|---|---|---|---:|---:|---:|

<total−k> clusters below the 2-failure bar → Singletons.

## Fix #1
| Field | Value |
|---|---|
| Change | `<path:line>` → <what changes> |
| Predicted | <k> failures pass: <ids> |
| Falsifier | <result that would refute this root cause> |
| Risk | <what regresses> |
| Verification | `<command>` → expect <k>/<n> |

## Singletons — <s> failures, no shared cause
<ids only, 1 line, no hypotheses>

## Missing data
| What | Which cluster it blocks | How to get it |
|---|---|---|

## Self-gate
<k>/8 passed — failed: <list or "none">.
1 k-of-n on every cluster · 2 status label + check on every row · 3 cost both sides · 4 evidence is a pointer · 5 verdict = 1 cluster + 1 number + 1 dispatch · 6 zero hypothesis rows in Verdict/Fix #1 · 7 singletons unexpanded · 8 words ≤500 outside tables.
```

## Calibration — both rows are real log entries

- **0/10** — `{"name":"unknown eval flag footgun","fix":"enable strict CLI argument parsing"}`: 0 counts, 0 pointers, 0 status, 0 cost.
- **10/10** — `{"name":"test harness bypassed production SQLite retry/WAL wrapper","failures":"44 cases across @products/platform-api full run","fix":"share createDatabaseFromClient across production and test DB helpers"}`, verified `platformApi 2833/2833`, `dbRetry 14/14`.
- Filled artifacts + parse commands per format: `references/full-reference.md` — examples only; this file is the contract.

## Log the run

```bash
skill-run-log /diagnose --target "<source> f=<F>/n=<N> clusters=<k>" \
  --verdict <ROOT_CAUSE_CONFIRMED|PARTIAL|INSUFFICIENT_DATA> --next /<skill-or-stop>
```

## Then consider

| Condition (numeric) | Next skill | Pass it |
|---|---|---|
| Verdict `ROOT_CAUSE_CONFIRMED` and ≥1 named check is red | `/converge` | cluster #1 row, failing check name, and reproduction command |
| Total failures = 1, or the result is null or surprising | `/autopsy` | run id and the raw rows read |
| ≥2 clusters remain hypotheses because a stage emits no timing or log | `/ground-truth` | the unmeasured stages and the instrument each needs |
| Top cluster code is `race`, `resource`, `config`, or `stale-state`; cost ≥30 min/run | `/harden` | cluster row and the invariant it violates |
| Same cluster name appears in ≥3 prior `.agent/skill-runs.jsonl` rows | `/reflect` | cluster name and its occurrence count |
| Pass rate dropped ≥10 points with 0 product-code commits in the range | `/eval-harness-diagnose` | git range and the 2 run ids |
| Fix #1 verification passes `<k>/<n>` and it targeted a release | `/deploy-proof` | the commit and the live check that must pass |
