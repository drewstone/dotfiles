# Reflect: session — 2026-08-15 — n=1 (discovery meta-system marathon, ~14h)

**Verdict:** The factory closed its loop (17+ runs graded unattended, 992→1021 kb pages) but I violated the seat economics twice in one night — routing factory load onto Drew's Claude subscription, the second time HOURS after that exact account's spend limit had killed a factory round — and the constraint existed nowhere in writing until Drew shouted it. measured.
**Biggest cost this period:** one full spend-limit outage (7 subagents + director-round-8 killed, all work blocked until /login) to finding #1.
**Next:** none — reroute shipped this turn; memory file `factory-seats-glm-only.md` is the durable fix.

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1 (this session, 2026-08-14T23:00→08-15T06:00 UTC) |
| Sources | discovery-lab git log (14 commits), ops/program-loop.log, 12 merged upstream PRs, task notifications |
| Prior reflections read | 3: 2026-08-15-adc-marathon-handoff, 2026-08-15-adc-blueprint-ship-pipeline, 2026-08-14-adc-blueprint (different project; no repeat findings apply) |
| Not inspected | subagent transcripts (context cost), the 5 survey files' every row |

## Findings — top 5 of 9, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Factory ran on Drew's Claude/codex subscriptions; constraint was never written down, so compaction erased it | 2 (loop design; post-outage recommission) | 1 spend-limit outage + 2 angry corrections | whole outage class | measured | director-round-8 failure.json: "monthly spend limit"; Drew msgs | seats pinned `opencode` only (program-loop.sh:120,146); memory file | me |
| 2 | rung-4 deliverable Goodharts directors to periphery: 23/73 questions audited our own claims, ≤8 attacked the frontier | 73 runs | days of compute on periphery | frontier yield | measured | oracle/ filename census | frontier charter (≥50% rule) + per-line charters w/ killed-approaches lists | me |
| 3 | `pkill`/`pgrep -f` self-match killed my own shell; 1 false "loop running" report | 3 (2 kills, 1 false positive) | ~40 min churn, 2 duplicate-loop incidents | all of it | measured | exit-144s at masterloop, driver-kill; pgrep false positive | memory file exists; kill-by-inspected-pid discipline held afterward | me |
| 4 | Wrong cause reported, corrected later: "seats full" (missing --prereg), #838 "unshipped" (was shipped 12 min post-merge), receipt-pending "prediction" (tautology), MOOSE-Chem3 numbers (bad v1 extraction, committed) | 4 | hours rework; trust | reporting discipline | measured | ledger commits 978f0b0cf, 6d7dc0372; PR #850; survey commit | quote-the-launcher rule in loop; verify-before-commit for survey numbers | me |
| 5 | Zero-token waste 20.3% all-time (71/349) from masked errors; every class since fixed at source | 71 runs | ~71 run-deadlines | <2% target | measured | health.mjs all-time counter | 12 upstream PRs merged; health check gates Phase 0 exit | me |

4 findings dropped below the bar (test-debris leak, zombie misclassification, 2-loop races, tag-push hook block).

## Repeat check — vs the 3 prior reflections
0 repeats across the 3 paths listed above (different project). Internally this session: finding 3 repeated after its own memory note was written mid-session — the note wasn't consulted before the second kill. Escalate: consult memory before any `kill`/`pkill` composition.

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Shared kb pages (verified, promoted) | 905 | 1021 | +116 | 32 runs graded | measured | health.mjs |
| Zero-spend rate (all-time) | 20.3% | 24.9%* | +4.6pp | 414 | measured | *includes outage cohort; 3h window is the live gauge |
| Upstream PRs merged (agent-runtime/eval/knowledge/cli-bridge) | 0 | 12 | +12 | — | measured | gh |
| Factory seats billing subscriptions | 2 | 0 | −2 | — | measured | program-loop.sh:120,146 |
| Frontier-aimed questions | ≤8/73 | charter ≥50% | — | next round | inferred | charter text |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Negative control on every fix (fail-without/pass-with) | caught 3 would-have-been-fake tests, incl. my own classifier tests | 3 |
| Reading agent OUTPUT, not scoreboard | caught `check: true` gaming; caught −1/6 propagation | 2 gates tightened |
| Same-day fix-at-source for measured failures | 12 merged PRs each traced to a factory incident | 12 |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Read 3 line-director queues on landing; pass/fail = SAT witness search + depth-2 ladder present | frontier yield | qualitative gate | 5 min | this session | me | queue.json contents |
| 2 | Re-add pi seat when router healthy (GLM-5.3 via router) | factory capacity ×2 | +12 slots | 10 min | on router recovery | me | probe returns stop |
| 3 | Measure post-reroute zero-spend over next 50 GLM runs | Phase 0 exit | <2% target | passive | 24h | loop | health.mjs 3h window |

## Durable notes written
Reuse check: extended MEMORY.md; checked: no existing seat-policy note (grep'd 'subscription|seat' over memory dir).

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| memory/factory-seats-glm-only.md | Factory agents run GLM-5.3 on opencode/pi only; claude/codex are the meta layer | — |
| memory/pkill-f-self-match-kills-shell.md | pkill -f with my command text in the pattern kills my own shell (exit 144) | — |

## Self-gate
7/8 passed — failed: words over cap (~640 outside tables vs 600).
