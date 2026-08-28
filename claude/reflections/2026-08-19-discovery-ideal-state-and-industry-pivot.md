# Reflect: session — 2026-08-19 — n=1

**Verdict:** The fleet held a machine-checked refutation of a 21-year-old conjecture for 2 days while the register said the opposite, and the operator (me) spent ~4h re-deriving it and reached the WRONG conclusion before reading the store — the store→decision hop was the systemic failure, and it now has three mechanical closures (register-gap on the heartbeat, question-brief injection, round-report feedback). measured
**Biggest cost this period:** ~4h operator + 1 wrong conclusion stated, to finding #1.
**Next:** /verify targeting the first legible opencode error (transparency fix live since 05:10 MDT) with baseline 4 of 4 industry runs killed by it.

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-08-18T22:00–2026-08-19T09:35 MDT |
| Sources | discovery-lab 23 commits (a6be9688..9649fab6); cli-bridge 1fa48be; lw6-counterexample (new, 2 commits, CI run 32228450453); discovery 4 commits; 2 workflows (9+13 agents, 1.27M+2.28M tok); reports/2026-08-19-fleet-graph-trace-analysis.md |
| Prior reflections read | 3: 2026-08-18-discovery-provenance-and-gates.md, 2026-08-19-adc-create-latency-and-release-recovery.md, 2026-08-17-adc-router-handoff.md |
| Not inspected | the 5 live industry leads' partial workspaces; agent-eval/#324 draft; the arena retirement decision (deferred, kill condition already fired) |

## Findings — top 7 of 13, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Settled results never reach the register/operator; I formed the OPPOSITE verdict (bounded R) before kb_search found the unbounded ladder | 2 results (LW6 2 days; nla GMRES still unregistered) | ~4h + 1 wrong conclusion | heartbeat now prints unregistered=6 | measured | RESULTS.md 59ce5c09; `q-q36-lw6-everyk-verify-r3` EVERYK=10/10 | register-gap.mjs + round-report + question-brief | shipped |
| 2 | `allowedModels` key deleted from budget (#318) while runner requires it → EVERY budget-file launch died pre-supervise | 5 observed (4 director rounds + 1 lead); 100% of new launches | ~48 min/round × 5 | all launches flow | measured | failure.json `run input must explicitly supply allowedModels`; fix 8351e3df | launcher normalizes absent→null | shipped |
| 3 | opencode failures reduced to the constant string 'opencode error' | 4 of 4 settled industry runs; 9 of 9 children in one run; ≥4 director rounds | ~8 run-budgets, root cause STILL unknown | next failure names itself | measured | run-ledger reasons; cli-bridge opencode.ts:262 | raw event in fallback (1fa48be) + bridges restarted | shipped; root cause open |
| 4 | One admission number owned by 4 disagreeing limits; governor NEVER read the bridge (path-shape bug, whole life) | 1,152 of 2,200 child deaths (49.5% of child compute, 386 h) | structurally impossible now | measured | all 754 timeouts one signature; governor now prints `20 lane` | one owner (12→bulk 10 == executor 10) + suffix-normalize | shipped |
| 5 | Knowledge does not compound: 40 near-dup clusters (113 pages, 0 intra-cluster cites), 64 dangling edges, 22 edges into retracted claims, rung-5 share 40.4%→10.8% | store-wide (1,978 pages) | 4× cost per verified claim (0.77M→3.06M tok) | unmeasured (gates are day-old) | measured | trace-analysis §5; retraction backfill 8+27 pages | duplicate gate + cite existence + promotion carries support + retraction stamp + briefing | shipped; effect pending |
| 6 | Liveness forked/partial 3 ways: capacity counter windowless (4h dispatch stall), loop heartbeat inline (live=97 vs 0), isLive blind to driver retries (2 directors on 1 line concurrently) | 3 defects, 2 stalls + 1 double-spend | one definition, newest heartbeat | measured | a6be9688, 8a633d83, 9649fab6 | attempts.mjs single source | shipped |
| 7 | `ps` failed to list a running process 3× → loop triple-started | 3 of 3 checks | 2 stray loops (throttled, no double dispatch) | /proc scan in runbook | measured | runbook 72dfdb10 | /proc, never ps | shipped |

6 findings dropped below the bar (incl. disk 8.7G→382G recovery and the 46% meta-fleet split — both already actioned in-session).

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Claiming/concluding without checking the artifact (LW6 verdict before kb_search) | 2026-08-13 | 5 | prose rule | reading the store was manual; now the system injects it (question-brief) and I follow the same rule as leads | yes — 5th raise, but first MECHANICAL fix |
| Capability shipped but switched off / result produced but unread | 2026-08-18 (meta-analysis) | 2 | none | no owner for the last hop | closed this session (#1 fixes) |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Disk free | 8.7 G | 382 G | +373 G | 1 vol | measured | df |
| Zombie run dirs | 234 | 0 (6 new since, honest) | −234 | 1,128 dirs | measured | backfill-terminal |
| Governor lane belief | 24 | 20 (true) | −4 phantom | 2 bridges | measured | governor output |
| cx dispatchable frontier | 0 | 2 | +2 | 23 questions | measured | dispatchable() |
| Research lines | 18 | 25 (7 industry) | +7 | lines.json | measured | 22bffd5e |
| Questions queued (industry) | 0 | 131 | +131 | 7 queues | measured | queue.json counts |
| Tool tests | 563 | 572 pass | +9, 0 fail | 572 | measured | node --test |
| Register status LW6 | verified(stale map) | EXTERNAL | — | 1 | measured | cd8a7e7c |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Read the first legible opencode error, fix root cause | 131 queued industry questions unblocked | 4/4 killed → flowing | 1 read + fix | next failure (~hours) | next session | a settled industry run with verified claims |
| 2 | Register the nla GMRES result (R8) | unregistered 6→~0 | 1 register entry | 30 min | this week | operator | register-gap --count |
| 3 | Second seat key | lead slots 4→8 | ~2× throughput | Drew mints key | Drew | Drew | governor sustainable |
| 4 | Re-measure compounding (re-derivation rate, rung-5 share) after 3 days of gates | knowledge quality | unknown — first honest baseline is now | 1 rerun of trace §5 queries | 08-22 | next session | same queries, same denominators |
| 5 | Upstream the 4 store gates per agent-knowledge#157 | every product gets them | fork shrinks | PR series | this week | any session | #157 closed by PRs |

## Durable notes written
Reuse check: extended `~/.claude/projects/-home-drew-code-discovery/memory/` (unconv-directors-blocked-allowedmodels.md — now OBSOLETE, fix shipped; updating). Checked: no existing note on ps-vs-proc (grep'd 'pkill\|/proc' over memory dir — pkill note exists, distinct).

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| memory/unconv-directors-blocked-allowedmodels.md | UPDATED: fixed 8351e3df; kept as history of the defect class | prior version |

## Self-gate
8/8 passed — failed: none.
k-of-n · cost both sides · status label · repeat check · Verdict names one number + one dispatch · actions name lever+target+owner+verification · zero adjectives standing in for counts · words ≈540 ≤ 600.
