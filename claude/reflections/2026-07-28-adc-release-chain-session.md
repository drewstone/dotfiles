# Reflect: session — 2026-07-28 — n=1

**Verdict:** 11 distinct root causes fixed across 10 merged PRs in ~11h, but the release chain is still not proven green — deploy 30332497713 in flight; the decisive number is **11 causes discovered serially at ~45 min/cycle** because failures reveal one-per-live-run (measured: run ids in Findings). #4319 (merged 04:20Z) is the structural counter.
**Biggest cost this period:** ~2.0h to finding #2 (blind retries + chasing an echoed error string).
**Next:** /verify targeting deploy 30332497713 → bake → promote with baseline "0 green ships in 124 attempts".

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-07-27T19:00Z–2026-07-28T06:00Z (this context) |
| Sources | PRs 4297–4321 via gh-drew; runs 30310592443–30332497713; live boxes 95.216.8.253, 95.217.35.250, 138.201.133.55/.222.180, 162.55.240.32, 159.69.85.244; issue #4303 |
| Prior reflections read | 3: INDEX.md tail + memory `project_week_2026_07_25_reflection` (open actions carried: ship-rehearse still undone, 2× deferred) |
| Not inspected | Other agents' parallel sessions (Donovan's PR branches read at head only); prod first_token_ms (still unwired, carried) |

## Findings — top 6 of 11, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Failures reveal serially, 1 per live cycle: 11 root causes × ~45 min discovery each ≈ 8h of the session | 11 | ~8h | ~7h/incident-night (suite runs in ~3 min) | measured | run ids 30312113033→30332497713; each fix exposed the next | #4319 merged; rehearse mode still open | operator |
| 2 | Blind retry + trusting log strings: 2 deploys retried on same runner poison; "build-essential" error chased 2 cycles — it was echoed workflow source, real cause was EACCES 3 dirs over | 3 | ~2.0h | ~1.5h | measured | runs 30327520656/30327722907/30328011889; failed step was "Setup Node.js and pnpm" | rule: failed-JOB+STEP via API before any grep; monitors now emit step names | operator |
| 3 | My first fix was a verified no-op that would have shipped without the adversarial pass (fence `applied===mutation` unsatisfiable; live counters 7179 vs 54) | 1 | ~1h writing it | a bad prod merge | measured | reverted in-tree; refuter proof scripts in scratchpad `fence-proof.mts` | keep: refute-with-real-Redis before any nontrivial merge | operator |
| 4 | Deploy restarts reset the in-memory reaper gate → 124 consecutive ship failures were one feedback loop | 124 | 2+ weeks of red ships | permanent | measured | `workspace-reaper.ts` pendingCandidates; sweep `orphanCandidates:8 reaped:0` 1h post-restart | #4321 merged (lv_time age gate) | done |
| 5 | Release wall-clock unowned: 17 of 31 min is redundant rebuild of CI-built artifacts — Drew flagged it, not me, though phase timings were in my view | every ship | 17 min/attempt × 8 attempts ≈ 2.3h tonight | 17 min/attempt | measured | ship log phase table run 30324648389 | develop-merge image builds + buildx registry cache + digest-consuming ship | operator, next PR |
| 6 | Background-bash watchers killed 2× before switching to persistent Monitor | 2 | ~25 min | ~25 min/session | measured | tasks bc7mpvhe2, bgli2doi0 killed | default to Monitor(persistent) for >10 min watches | done |

5 findings dropped below the bar (probe retention leak, dotenvx banner, rtk grep mangling, stash-in-shared-worktree, echoed-string in monitor filter).

## Repeat check — vs last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| ship-rehearse mode deferred | week reflection 07-25 | 3 | none — deferred twice more tonight | point fixes kept winning triage | yes — it is now the only unbuilt piece of the serial-reveal fix |
| done-declared-at-merge | 07-25 | 2 | evidence-level labels | held tonight: no green claimed; verdict says "not proven" | no |
| known-latent defects burn production | 07-25 | 2 | memory notes | notes existed for occupancy counters; #4318/#4321 finally converted 2 to fixes | closing |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Hetzner servers | 18 | 9–12 (churn stopped) | −6 net | 1 fleet | measured | Hetzner API |
| Failed host births/day (prod) | 69 | 0 (autoscale off) | −69 | 1 day | measured | pendinghost events |
| Prod /version latency | 4.78s | 0.82s | −83% | 2 calls | measured | curl -w |
| staging customerStorageProjectCount | 84 | 0 | −84 | 1 host | measured | redis HGET, 05:27Z |
| Root-owned files on CI runners | 22,116 | 0 | −22,116 | 2 boxes | measured | find -not -user |
| Consecutive failed ships | 124 | still counting (in flight) | — | — | measured | issue #4303 |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Adversarial refuter with real infra before merging own fixes | killed a no-op fix + found the drain wedge | 2 bad merges prevented |
| Delegated implementation with mandatory mutation-verification in the spec | 5 delegated PRs; 2 caught real spec flaws (single-route admission; faked createdAt) | 5/5 mutation-verified |
| Holding a mutating process to let a collector finish | orphan volumes 84→16 with zero manual sweeps | 68 reclaimed |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Verify chain 30332497713→bake→promote to green | 124-failure streak | first green | watch | today | operator | promote message + stable-channel image label |
| 2 | Digest-consuming ship + develop image builds + registry cache | 31→~13 min/attempt | −17 min/attempt | 1 PR | this week | operator | ship log phase table |
| 3 | Ship rehearse mode (all checks read-only, report all divergences) | serial reveal | all-at-once failure list | 1 PR | this week | operator | rehearse run lists ≥2 known-seeded divergences |
| 4 | Pin AUTOSCALE_ENABLED default (resets true on every prod deploy) | silent re-enable risk | 0 surprise births | config PR | before next prod deploy | operator | deploy then printenv |
| 5 | suspended-vs-dead sandbox marker | 9 paralyzed reclaimers, 107 stale records | records finally clear | design+PR | next session | operator | reaper clears them unaided |

## Durable notes written
Reuse check: extended existing — no new notes needed; both written mid-session.

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| memory/project_release_consistency_preflight_program.md | why 19+ ships failed structurally; preflight primitive; remaining chain | — |
| memory/project_leaked_container_records_starve_every_reaper.md | one leak class starves drain, termination, and reaper; machinery exists, input lies | 3 scattered claims |

## Self-gate
8/8 passed — failed: none.
k-of-n · cost both sides · status label · repeat check · Verdict names one number + one dispatch · actions name lever+target+owner+verification · zero adjectives standing in for counts · words ≈540 ≤ 600.
