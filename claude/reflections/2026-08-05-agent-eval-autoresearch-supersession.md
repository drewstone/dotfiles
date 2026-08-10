# Reflect: session — 2026-08-05 — n=1 (2026-08-01 → 08-05, one continuous session)

**Verdict:** 23 PRs merged across 5 repos, ~$200 spend, 3 certifications run and honored — and the campaign's costliest error was strategic, not technical: 2 rounds (~$40) optimizing against a benchmark whose answer key a $0 adjudication later showed misses 60% of what our analyst finds; the operator (me) chased the metric until Drew pulled the cord. measured
**Biggest cost this period:** ~$40 + 2 rounds to finding #1.
**Next:** /evolve on the calibrate-before-measure skill — add a label-coverage adjudication gate (baseline: 0 such gates existed; H1's $0 design is the template).

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-08-01 → 08-05 (continuous, 3 spend-limit interruptions) |
| Sources | .evolve/experiments.jsonl rows mp-r1→r5-close (18 new), 23 merged PRs (agent-eval×14, traces×5, runtime×2, app×1, adc×1), ~/bench-cache/ctb-20260801/* run artifacts, 3 preregistration docs |
| Prior reflections read | 3: 07-28 adc, 07-31 discovery, 08-01 adc-fleet (via INDEX tail) |
| Not inspected | Goal-1/Goal-2 lanes (still running); other agents' concurrent PRs (#715, #111, #530, #535 verified-not-duplicated only) |

## Findings — top 6 of 11, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Optimized against un-adjudicated labels for 2 rounds before the $0 adjudication that voided the target (60% of "misses" = real-but-unlabeled, n=20; split3 positionally degenerate 0.568-vs-0.180) | 2 rounds | ~$40 + operator correction | run adjudication FIRST: $0-2, hours | measured | h1-report.md; r4/r5 ledger rows | label-coverage gate added to calibrate-before-measure flow | operator |
| 2 | Watcher/pattern-match failure class: pgrep escaped-alternation, pgrep self-match, CI job-name pin, draft-state miss — one caused a live mutex force-release that destroyed a paid run | 4 bugs | ~1.5h + run3 fix phase (28/33 calls lost) | shared watcher template | measured | r4-ops ledger row; run3 report | rules ledgered; watcher template in canary-chain-v2.sh pattern | operator |
| 3 | Volatile-path assumption: session scratchpad GC ×3 + /dev/shm wipe killed 4 runners/chains | 4 | ~2h rebuild + 2 dead launches | durable-paths-only rule (now standing) | measured | canary v1/v2 autopsies; run6 ENOENT | all runners in ~/bench-cache/runners/ | done |
| 4 | Seat limits unknown until probed: 5-concurrency 429 ceiling + 5h rolling quota explained 2 invalidated readouts and the 96/96 wipeout | 3 incidents | ~$12 wasted runs | 9-call preflight probe ($0.10) | measured | burst probe 5/9; run3/4 llm 28-29/33 failures | probe exists; not yet auto-run before batches | next round |
| 5 | Spend-limit kills mid-agent ×3; reconcile-first resumption recovered partial work 3/3 (branches, artifacts, live detached processes all survived) | 3 | ~30-60min overhead each | resumable-by-design agents | measured | goal-1/2 + trackE resumes | keep: durable branches + status files + SendMessage resume | done |
| 6 | Jargon drift until "i don't understand the jargon" — one full plain-language reset required | 1 | 1 correction turn | — | measured | 08-04 exchange | speak-plainly re-anchored; glossed everything since | operator |

5 findings dropped below the bar (incl. #520 .scratch cruft merged on bot-approval without file-list review — caught + cleaned same day).

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Serial-reveal of failures | 07-28 | 3 prior | — | did NOT recur: all 5 build waves ran as parallel pinned-brief fan-outs; 0 serial-reveal incidents | no — 2nd consecutive counter-example |
| Metric-chasing past a diagnosed ceiling | feedback_reanchor memory | ≥2 | re-anchor rule | recurred as finding #1 — the rule fired only after operator correction, not before spend | yes: the adjudication gate (Next) is the mechanical form |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Shipping analyst, sealed mini-SWE micro F1 | 0.340 | 0.6288 (h2) / defended 2× | — | 3 certifications | measured | cert dirs |
| Cross-family micro (first ever) | unknown | 0.29 OH / 0.22 T2 | — | 128 obs | measured | cert2 |
| Official-metric same-rows vs CodeTracer | unpublished | +31% (0.1526 vs 0.1161) | — | 32 rows | measured | LEADERBOARD.md |
| Replayability / one-shot fix-flip | unmeasured | 72.7% / 81.8% | — | 22 / 11 | measured | run2 report |
| Corpus importable | 133 sessions (1 family) | 955 (4 families) | +822 | — | measured | #519/#531 |
| Runtime stable surface | 70 badges, no contract | 165 + STABILITY.md; adc on /kernel | — | — | measured | #742/#4848 |
| Prompt arms: hand-written vs optimizer-certified | — | 0/6 vs 1/3 survived | — | 9 arms | measured | ledger r1-r4 |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Pre-registration before sealed spend | 3/3 verdicts accepted mechanically incl. rejecting my own arms | 3 |
| $0-analysis-first | H1 adjudication, family decomposition, leaderboard extraction — the 3 biggest findings | $0 each |
| Executed-proof briefs + operator spot-checks | 1 miss in ~20 verified agent claims (#520 cruft) | 19/20 |
| Silent-until-terminal agent protocol | notification spam → 2 reports max per lane | n=2 lanes |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Label-coverage adjudication gate in calibrate-before-measure | prevents finding-#1 class | ~$40/campaign | 1h skill edit | next eval campaign | operator | gate fires before any label-target round |
| 2 | Seat preflight probe wired into replay-verify-batch + campaign scripts | prevents finding-#4 class | ~$12/incident | 1h | next batch | operator | probe line in batch logs |
| 3 | Harvest Goal-1/Goal-2 finals → product demo + stockpile gate verdict | goals 1-2 | demo + row count | in flight | today | agents | final reports |
| 4 | adc deploy prereq: agent-eval-rpc[dspy] in API images | unblocks #4848 deploy | fail-loud avoided | small | before next adc deploy | adc owner | image build + analyst smoke |

## Durable notes written
Reuse check: extended project_gepa_certified_analyst_prompt.md + MEMORY.md in-session; runtime graduation note written 08-04; no new note needed for findings #2-#5 (all in experiments.jsonl rows r4-ops/r5-close, checked by grep).

| Path | Claim | Supersedes |
|---|---|---|
| this file + INDEX entry | session record | — |
| .evolve/handoff-2026-08-05-session-close.md | live state + resume commands | handoff-2026-08-03 |

## Self-gate
8/8 passed — failed: none.
