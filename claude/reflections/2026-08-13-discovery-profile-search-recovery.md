# Reflect: session — Discovery full profile search — 2026-08-13 — n=5 launches

**Verdict:** The fifth launch settled 1 of 100 candidate evaluations after 4 failed launches; Runtime's existing `$1.12` cell limit fixed the 16-of-16 admission failure. measured.
**Biggest cost this period:** 4 restarts and `$0.003735` known spend to finding #2.
**Next:** /evolve targeting terminal candidate yield, baseline `1/100` settled and `1/1` infrastructure-valid.

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-08-13 07:30Z–08:39Z |
| Sources | Discovery-Lab PRs #186, #187, #189, #190; 5 `profile-search-eval01456-full-*` run directories; live cost ledger |
| Prior reflections read | n=3: 2026-08-06 evolution, 2026-08-10 marathon, 2026-08-10 instrument recovery |
| Not inspected | Terminal output for the active 100-evaluation search; provider USD before grant settlement |

## Findings — top 4 of 4, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Router adds 12 hours after the requested grant lifetime; 3 key/TTL combinations refused before spend | 3/5 launches | 19 minutes, `$0` | 3 invalid launches per full run | measured | launch configs at 07:31, 07:47, 07:50 | PR #189 binds 11.5 hours inside a 24-hour key | Lab |
| 2 | Lab omitted Runtime `superviseDispatch.maximumCharge`; Eval refused 16/16 cells | 1/5 launches | `$0.003735`; 3,876 input, 2,944 cached, 10,355 output | up to 11 hours and `$119.48` per aborted full run | measured | 19-row observation file; settlement at 07:57:56Z | PR #190 binds `$1.12` to search, matrix, confirmation | Lab |
| 3 | The owner API already existed; no Runtime change or Lab cost layer was needed | 1 fix | 6 files, 317/317 tests | avoids 1 duplicate accounting path | measured | Runtime `loop-dispatch.ts`; PR #190 | keep limits in Runtime/Eval | Runtime + Eval |
| 4 | Corrected launch performs real recursive work | 1/1 settled cells | 109,231 fresh, 5,333,504 cached, 119,383 output; USD unknown | unmeasured until terminal | measured | live ledger at 08:38Z | continue unchanged to 100 evaluations | operator |

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Instrument defect voids paid work | 2026-08-05 | 5 | smoke reached grading | smoke had no campaign cost cap, so it did not exercise `maximumCharge` | yes: capped smoke must reserve one real cell |
| Hand-rolling an owner capability | 2026-08-06 | 4 | source census | held here: source read found `maximumCharge` before new machinery | no |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Candidate cells admitted | 0/16 | 4/4 | +100 percentage points | 20 | measured | old/new cost ledgers |
| Candidate cells settled without infrastructure error | 0/16 | 1/1 | +100 percentage points | 17 | measured | observation JSONL |
| Exact served fingerprints | 0 | 12/12 identical | +12 | 12 responses | measured | Pi session records |
| Lab tests | 314/314 | 317/317 | +3 | 317 | measured | PR #190 |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Read owner source after a real failure | Found the exact missing argument without a new API | 1 defect, 0 upstream PRs |
| Preserve unknown cost | First settled cell records `costUnknown:true` | 1/1 |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Finish the 100-evaluation search | actual candidate denominator | 1/100 to N/100 terminal | ≤11 hours | today | operator | terminal Runtime/Eval artifacts |
| 2 | Bind and execute the 9-case population matrix | held-out coverage | 0 rows to `(N+1)×9` rows | registered | after action 1 | Lab | exact row equality |
| 3 | Execute 54 paired confirmation rows | promotion decision | 0/54 to 54/54 | registered | after action 2 | Lab | Eval paired interval |

## Durable notes written
Reuse check: checked no existing note by grepping `maximumCharge|profile-search-eval01456` over reflections and both AGENTS files.

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| `~/.claude/reflections/2026-08-13-discovery-profile-search-recovery.md` | Existing Runtime maximumCharge unblocked the real full search | — |

## Self-gate
8/8 passed — failed: none.
k-of-n · cost both sides · status label · repeat check · Verdict names 1/100 + /evolve · actions name lever+owner+verification · counts replace adjectives · words <600.
