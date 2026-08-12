# Reflect: session (discovery post-compaction window) — 2026-08-10 — n=1 session, ~08:35–09:15Z

**Verdict:** The blind grader caught two real instrument defects before I did — 6 of 19 claims graded this window were contradicted on CORRECT computations (kb store truncated their multiline checks), and the repeat-class "instrument defect voids a measurement" hit its **4th raise**: the procedural rule from raise #3 (smoke-the-scoring-path) did not prevent it because no smoke ever recorded a multiline check. Escalation shipped as mechanics, not procedure: 2 fail-closed gates (`bash -n` at kb intake, empty-workspace refusal at launch), both with regression tests, 117/117 green. Meanwhile 2 world-facing candidates cleared their gates: BCWW (4.6) formally matched 11/11 terms against the paper's LaTeX, and R(4,6) all-37-witness non-extension operator-verified end to end. measured.
**Biggest cost this period:** 8.9M tokens to finding #1.
**Next:** /verify targeting ramsey-r46-b2's re-recorded claims when the monitor fires, with baseline "3 contradicted as-recorded, operator-verified substance".

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-08-10 08:35Z–09:15Z (post-compaction continuation) |
| Sources | discovery-lab 10777b1..5729d50 (9 commits, 6 mine); oracle/{ramsey-r46-a,superperm-l6-a,q36-g4-p2-*,q36-g4-p3-structure}.json (19 graded claims); monitor events bjnxfmpkj/bndokrghm; arXiv e-print 1507.05650 source; users.cecs.anu.edu.au/~bdm/data/r46_35some.g6 (fresh download); node --test → 117/117 |
| Prior reflections read | 3: 2026-08-10-discovery-gen3-substrate-marathon, 2026-08-08-supervisor-lab-killtest-session, 2026-08-07-supervisor-lab-first-supervisor-run |
| Not inspected | superperm-l6-a's 2 verified claims' math beyond their passing blind checks; p3b/b2/l6-b live progress (armed, not landed); the foreign agent's sharp-constant runs |

## Findings — top 5 of 7, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Hand-assembled launches bypassed `tools/launch.mjs`; 4 leads started on empty jails (one honestly recorded "workspace empty" and quit) | 4 launches | 8.9M tok (0.76M void + 8.1M confounded + ~0 ×2 killed) | class eliminated | measured (`prereg/q36-gen4.md` void amendment; `pursuits/q36-g4-p3-structure/kb/pages/` empty-workspace page) | empty-workspace refusal in run-supervise (5729d50), proven on the exact failing input; relaunched ×4 via launch.mjs | done |
| 2 | kb frontmatter truncated multiline `check` to `python3 -c "` → 6 correct claims graded contradicted across 2 runs | 6 claims / 2 runs | 6.4M (ramsey-a → 0 blind-usable grades) + 12M re-record cap | class eliminated | measured (oracle/ramsey-r46-a.json: 3× `unexpected EOF`; byte-identical round-trip test) | b451a45: JSON-encode non-round-trippable values + `bash -n` intake refusal as tool output | done |
| 3 | Post-compaction summary carried run STATE but not launch PROCEDURE — root cause of #1; "reconcile before create" failed: never grepped for an existing launcher | 1 (systemic) | subsumed in #1 | future sessions | measured (launch.mjs docstring: "exists to make that ordering mistake unmakeable") | memory now carries the LAUNCH RULE at top | done |
| 4 | Careless verification commands: guard-tested against the REAL p3 input (2 orphan journal events, near-miss on a 40M relaunch); rtk rewrote redirected curl into a schema mid-check; my own K4 checker omitted the (c,d) edge | 3 | ~0 measured, all caught in-session | near-miss class | measured (p3-structure journal tail; scratchpad/h.json; verify script v1 output `valid=0`) | synthetic inputs for guard tests; `rtk proxy` for raw output; distrust own first checker | claude |
| 5 | ramsey-r46-a launched with `pursuit: "ftqc"` (launch.mjs default) — kb pages scoped to the wrong pursuit | 1 | unmeasured (scope pollution, grading unaffected) | correct scoping | measured (`pursuits/ramsey-r46-a/manifest.json` identity) | passed `--pursuit` explicitly on all 4 relaunches; default still ftqc | open (make --pursuit required) |

2 findings dropped below the bar (2× non-fast-forward pushes resolved by stash/rebase/pop; monitor curl-parse crash gave a false "failed" on a healthy launch).

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Instrument defect voids a measurement before/at grading | 2026-08-05 | **4** | smoke-must-reach-a-grade (procedural) | the smoke's check was single-line; the defect class (multiline) was never exercised — procedural rules only cover rehearsed paths | **yes — resolved by MECHANISM: intake now refuses what the grader cannot run; empty launch now refuses what the lead cannot research. A 5th raise of this class means a gate has a hole, not that a rule was forgotten** |
| Parallel-agent collision | 2026-08-09 | 3 | verify → stand down | held (2 rebases, 1 runtime-adoption absorbed mid-generation with ledger amendment) | no |
| Hand-rolling what exists (skill/tool non-use) | 2026-08-06 | 3 | none | #1 is this class: launch.mjs existed, I hand-assembled | watch — the reconcile grep must include tools/, not just docs |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Claims graded this window | — | 19 (12 verified / 6 contradicted / 1 unrunnable) | — | 5 runs | measured | oracle/*.json |
| Gen-4 insight tally (structure vs frontier) | 2–0 | 7–0 | +5 | 2 pairs | measured | monitor bjnxfmpkj events |
| Champion e-value (stop at 20) | 1.0000 | 1.0062 | +0.0062 | 2 deltas | measured | decide.mjs output |
| World-facing candidates past their gate | 0 | 2 | +2 | — | measured | grounding/bcww-46-formal-match.md; grounding/ramsey-r46-a-operator-verification.md |
| Fail-closed instrument gates | 0 | 2 | +2 | 117/117 tests | measured | b451a45, 5729d50 |
| Live arms after recovery | 2 | 4 | +2 | — | measured | launch.mjs output, 4 pids |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Let the oracle's verdict stand; verify substance separately; re-legitimize through the blind path | R(4,6): grade contradicted kept, substance confirmed by independent recomputation, b2 re-records | 37/37 valid, 37/37 distinct, 0/37 extendable, 37/37 McKay match |
| Formal-match gate before external claims | BCWW (4.6) matched against the paper's LaTeX, not a memory of it | 11/11 coefficients |
| Prove the guard on the real failing artifact before commit | empty-workspace refusal fired on the exact p3 run-input | 1/1 |
| Distrust own first checker | my K4 test said 0/37 valid; the bug was mine | caught in 1 iteration |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Grade p3b pair + b2 + l6-b on landing (monitor armed) and feed delta #3 | decisive comparisons per token | e-value moves or pair 4 launches | 0 (armed) | today | claude | decide.mjs emits promote/continue |
| 2 | BCWW external step — Drew picks: email authors (recommended) / arXiv note / hold | first world-facing claim | external validation | 0.5h after pick | Drew | reply or posting exists |
| 3 | Make `--pursuit` required in launch.mjs (default ftqc already mis-scoped 1 run) | scope correctness | class eliminated | 10 min | next lab touch | claude | launch without --pursuit refuses |
| 4 | v8 skills profile + prime-vs-dspy benchmark (carried 2nd time from marathon reflection) | profile evolution axis | unblocks gen-5 candidate | 0.5 day | this week | claude | profile digest + benchmark artifact |

## Durable notes written
Reuse check: extended `~/.claude/projects/-home-drew-code-discovery/memory/discovery-zero-policy-state.md` (LAUNCH RULE now first paragraph); checked: no existing launch-procedure note (grep'd 'launch' over memory dir — only zero-policy-state).

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| memory/discovery-zero-policy-state.md | Launch via launch.mjs ALWAYS; kb multiline fix; BCWW+R(4,6) gates passed; pair-3=p3b | prior version |
| discovery-lab grounding/ (2 files) | BCWW formal match PASSED; ramsey oracle-right/operator-verified split | — |

## Self-gate
8/8 passed — failed: none.
k-of-n ✓ · cost both sides ✓ · status label ✓ · repeat check ✓ · Verdict names 6/19 + /verify dispatch ✓ · actions name lever+owner+verification ✓ · zero adjectives-as-counts ✓ · words ≈560 ≤600 ✓.
