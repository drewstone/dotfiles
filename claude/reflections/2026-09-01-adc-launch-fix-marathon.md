# Reflect: session — 2026-09-01 — n=1 (agent-dev-container launch-fix marathon)

**Verdict:** 13 PRs merged and deployed with 4 product surfaces live-proven; the decision-relevant number is **~2.5h (of ~8h wall) burned on push/gate failures whose 4 distinct causes I conflated as one "flake"** (measured: 6 failed push attempts before the identity bundle landed). Systemic at 2 raises: acting on an unverified prior written claim (the "29ms regression" I myself wrote into memory) — same class as 08-28's 4× false outage escalation.
**Biggest cost this period:** ~2.5h to finding #1.
**Next:** /verify targeting the dashboard Console typed-output claim with baseline "server pipe proven, UI unproven" (journey.mjs terminal leg on deployed 29063944d).

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-08-29–09-01 (~8h post-compaction segment in full; pre-compaction via summary) |
| Sources | this transcript; PRs #6596 #6602 #6620 #6624 #6657 #6659 #6683 (+6 pre-compaction per summary); deploy runs 33493450159, 33455860265; journey/ws-probe outputs; preflight logs NUAtJV/GYkGWn/cPNM0U |
| Prior reflections read | 3: 2026-08-26-adc-billing, 2026-08-26-adc-overnight-sweep, 2026-08-28-adc-fleet-telemetry |
| Not inspected | pre-compaction transcript line-by-line (compacted); other agents' parallel sessions; vendored sandbox-ui source |

## Findings — top 5 of 9, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | 4 distinct gate-failure causes (stale-base biome, squatter dirty tree, load flakes, empty-tail misread) conflated as "flake"; serial retry instead of parallel diagnosis | 6 failed pushes | ~2.5h | ~2h/recurrence (read the failing-gate DETAILS block first — it names the gate) | measured | tasks bozfe2gmn→bcxhzgk2r; preflight.GYkGWn biome log | On any gate red: print the summary's `failing gate details` block BEFORE retrying; rebase before push | me |
| 2 | Empty log-tail misread as green | 3 of 3 scans | ~40min (masked finding #1's biome cause twice) | 15min each | measured | NUAtJV scan "all green" vs GYkGWn biome findings mid-file | captured in handoff `project_handoff_2026_09_01.md:41`; behavior: read summary lines only | me |
| 3 | Chased a regression that never existed — prior session's own memory claim ("29ms→1.6s") accepted unverified | 1 (2nd raise of class) | ~2h (subagent + 5 log pulls) — partially productive: yielded #6596 + #6594 | ~1.5h | measured | 5 benchmark runs all 1.4–2.5s; `.evolve/perf-baseline.json:167` = 29ms local | shipped #6596 (per-target baselines); class fix = AGENTS "ground truth" rule applied to MY OWN memory too | me |
| 4 | New contract key touched 8 consumer surfaces discovered serially via 3 red CI rounds | 5 fix rounds | ~45min | ~30min (grep the sibling key repo-wide FIRST: `grep -rl DISK_SELF_CLEAN_THRESHOLD_PCT` found all 8 at once) | measured | commits on #6659; fixtures probe/identity/orchestrator/devtools/env.example/eval-gate/ship/infra | lead with the sweep next contract change | me |
| 5 | My own probes produced 3 false verdicts (ws subprotocol offer, init-before-open, typing-unfocused) before the true one | 3 of 5 probe runs | ~35min | ~20min | measured | probe outputs: "Server sent no subprotocol", silent-open, journey NO OUTPUT | read the server's protocol schema before writing the client probe | me |

4 findings dropped below the bar (fabricated sha 1×/5min — feedback already drafted; scratchpad /tmp purge 1×/15min; wrangler env-name miss 1×/5min; supersede-cycle babysitting 2×/10min — solved in-session by the terminal-condition watcher).

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Acting on unverified claims (self- or doc-written) | 08-28 (false outage 4×) | 2 | AGENTS "ground truth beats the written word" | Rule scoped to docs/others' claims; my OWN memory entries felt pre-verified | Yes — verdict names it |
| Silent/capped wait loops | 08-26 | 2 (now resolved) | AGENTS waiting rule + poll-guard | Held: 0 capped waits this session; 1 blocked `sleep` corrected immediately | No |
| Open-loop count | 08-26 (14), 08-28 (17) | 3 | handoff table | Improving: 17→9, all 9 with next commands | No |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Chat first reply (journey) | 90s+ | 35s | −55s | 3 runs | measured | journey outputs 08-31/09-01 |
| Session-page failed requests | 136,226/27min | 9 | −136k | 2 runs | measured | journey-report.json |
| checkpoint.fork provision p50 | 8,324ms | 3,867ms | −53.5% | n=3 | measured | perf-gate improvements, run 33493450159 |
| Audit FAIL surfaces | 2 | 0 | −2 | 23 surfaces | measured | audit tables 19:10 vs 09-01 10:24 |
| Handoff open loops | 17 | 9 | −8 | — | measured | 08-28 reflection vs handoff file |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| A/B arms (clean-vs-diff, quiet-vs-busy) before blaming a diff | exonerated #6620 from suite reds | 7 runs, verdict flipped once |
| Terminal-condition watcher (main-contains-sha) over per-train watching | absorbed 3 supersede cycles unattended | 3 |
| Raw protocol-level probe when UI probes disagree | settled terminal server-pipe in 1 run after 3 ambiguous UI runs | 20s vs ~40min |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Rerun journey.mjs on 29063944d (terminal leg) | closes the one unproven surface | proof or #6682 escalation | 10min | next session open | me | output contains `terminal leg: OK` |
| 2 | On red gate: read `failing gate details` block before any retry | finding #1's 2.5h class | −2h/recurrence | habit | immediate | me | zero blind push retries next session |
| 3 | Contract-key changes: sibling-key grep sweep first | finding #4's 45min | −30min/change | habit | next contract change | me | 1 CI round instead of 3 |

## Durable notes written
Reuse check: extended `memory/project_handoff_2026_09_01.md` (findings #1/#2 corrections at :39-43); checked: AGENTS.md ground-truth rule exists (grep 'ground truth', AGENTS.md §1) — no new rule file; the gap is applying it to my own memory entries, noted in the handoff's uncertainty section.

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| memory/project_handoff_2026_09_01.md | 4 kill-conditioned decisions + 5 operator corrections + 9 open loops | — |
| memory/project_session_create_abort_loop.md | full defect chain: storm → identity family → CORS seeds → fast path, with live numbers | — |

## Self-gate
8/8 passed — failed: none.
k-of-n · cost both sides · status label · repeat check · Verdict names one number + one dispatch · actions name lever+target+owner+verification · zero adjectives standing in for counts · words ≈540 ≤ 600.
