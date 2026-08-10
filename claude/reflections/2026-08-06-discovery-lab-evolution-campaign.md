# Reflect: session (discovery-lab ftqc campaign) — 2026-08-06 — n=1 session, 26 runs

**Verdict:** The evolution loop closed one full cycle — system-authored v6 promoted 11–7 on oracle-verified new claims (measured, oracle/ftqc-r5*.json) — but attribution is weak at n=1 because the knowledge layer leaked v6's mechanism to the v5 arm (same profile digest: 3/3 silent-check → 7/7 verified in 2 days). The load-bearing discovery is the channel, not the score.
**Biggest cost this period:** ~14.9M input tokens to finding #1 (whole-tree teardown, 2 arm-kills this campaign).
**Next:** /discovery-lead targeting the Q36 settlement pursuit with baseline = frontier n=25 binary, q≤5.

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1 (this), 2026-08-04 → 2026-08-06 |
| Sources | discovery-lab e801824..4117609 (33 commits), 13 pursuits + 13 archived, oracle/*.json (12), kb/pages (32), 5 upstream issues, agent-knowledge#115 |
| Prior reflections read | 3: 2026-08-01 adc, 2026-08-05 agent-eval, 2026-08-05 supervisor-lab |
| Not inspected | r5 arm transcripts for v6 behavioral sub-claims (deferred); pi memory daily-log contents |

## Findings — top 6 of 11, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | One child failure tears down healthy siblings (#741) | 4 kills (r1:s2, r5a arm, +2 prior campaign) | r5a2 rerun 10.0M tok + r1 half-pool unused ~4.9M | ~15M tok/campaign | measured | tangle-network/agent-runtime#741 + r5a journal | settle node, don't abort tree | upstream |
| 2 | Self-graded verification pre-oracle | 22 claims (19 r2 + 3 r3a) worth 0 gradeable bits | 2 runs' verification value | 56 verified claims now exist | measured | oracle/ftqc-zips-2026-08-05-r2.json counts | kb --check gate + oracle (shipped) | done |
| 3 | Transient stream death × long-read, no disk output | 2 runs (r4t, r4t2) | 4.9M tok, 0 bytes salvaged | r4t3 salvaged 16k+7pages | measured | disco why ftqc-r4t{,2} | forced per-file checkpoint cadence (shipped) | done |
| 4 | Runtime swallows accepted wins (#743) | 2 (r2b, r3b) | would have mis-scored model pair as 3–0 loss | pair verdict corrected | measured | accept `{"accepted":true}` in transcripts vs no-winner | disco why detector (shipped) + upstream | upstream |
| 5 | My 2 false `measured` claims promoted into live profiles | 2 (80% reservation; parse-clean) | 1 run led on false budget fact | fail-closed KB (shipped) | measured | kb correction pages | evidence requires command (shipped) | done |
| 6 | Blind python-replace edits silently no-op | 5 (kb, agents×2, oracle, manifest guard) | ~6 fix-cycles + 1 garbage docs write | ~30 min/session | measured | this transcript | use Read+Edit for surgical changes | me |

5 findings dropped below the bar (pi-memory breach, delegation collapse, hand-polling, dotenvx race, monitor self-match — all recorded in lab KB).

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Agents self-certifying (`verified:true` ×6/17) | 2026-08-05 supervisor-lab | 2 | none recorded | no mechanical grader existed | no — oracle now grades blind; 0 self-grades accepted since |
| Optimizing against an unadjudicated metric | 2026-08-05 agent-eval | 2 | label-coverage gate (that repo) | grader blindness recurred here as 3–0 metric artifact | no — cross-exam organ + calibration-fee rule shipped |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Oracle-verified claims (campaign) | 0 | 56 | +56 | 12 grade files | measured | oracle/*.json sum |
| New verified claims, showdown day | 0 | 18 | +18 | 2 arms | measured | r5 grade files vs 37 prior expects |
| Same-profile check quality (v5) | 3/3 silent | 7/7 verified | +7 | 2 runs | measured | r3a vs r5a2 grades |
| Failure modes recorded | 5 | 11 | +6 | — | measured | lab kb pages |
| Upstream: merged+published / issues | 0/3 | 1/6 | +1 PR, +3 issues | — | measured | agent-knowledge 7.1.0; #740/741/743, cli#119/121 |
| Campaign spend (terminal runs) | — | 114.8M input tok | — | 10 results | measured | result.json sum |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Launch Q36 settlement pursuit (month-horizon, branch-parallel attack lines) | new verified claims on an open conjecture | frontier past n=25/q=5 or counterexample | 1 prereg + launch | next session | system | oracle grades + novelty filter |
| 2 | Evolution round 2 with n=3 replication/arm + trace-mechanism input | attribution: anecdote → measured | CI on 11–7-class deltas | ~90M tok | after P1 starts | system | paired grades, declared confounds |
| 3 | Second-domain campaign (generality + promotion gates) | instrument-lesson transfer | infra deaths < 2 (vs 7 first campaign) | 1 corpus + launch | this week | system | failure count + promote() uses |
| 4 | Delegation-collapse probe (single delta: child-mortality lessons visible vs purged) | swarm premise validity | spawn-rate causal read | 2 runs | after P2 | system | spawn counts per arm |
| 5 | Store migration onto agent-knowledge 7.1.0 + retire checker exception | doctrine debt → 0 | kb.mjs −300 lines | 2h | campaign boundary | me | checker green, chain reads pass |

## Durable notes written
Reuse check: extended memory (local-signoff-over-ci.md, this session); lab lessons live in discovery-lab kb/pages (32), not duplicated here.

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| ~/.claude/reflections/2026-08-06-discovery-lab-evolution-campaign.md | this artifact | — |

## Self-gate
8/8 passed — failed: none.

## Correction (2026-08-06, same day, by the q36 campaign operator)

The "Next" line's baseline — "frontier n=25 binary, q≤5" — was an overstatement.
Ground truth from r5b's own claim pages: binary verified through **N=22** (C(37,15)=9,364,199,760 vectors at N=22), ternary N≤7, quaternary N=5; no N=25 and no q=5 claim exists.
Caught on 2026-08-06 when q36-g1b-search's lead read its inherited store as N=22 and produced N=23/24/25 + quinary q=5 as new claims.
The campaign ledger (discovery-lab prereg/q36-campaign.md) is the corrected record.
