# Reflect: session — 2026-08-26 — n=1 session inspected

> **Correction, 2026-08-26, from `/evolve` over 1,830 transcripts.**
> Finding #1 below is kept as written, because it records what was believed at the time.
> Three of its claims did not survive measurement.
> The count is **12 of 54** sleep-loop waits, not 16 of 36; 5 of the 17 capped calls were not waits at all.
> The rate is **not a baseline**. Per-session cap rate has median 0.000 across 170 sessions with ≥3 waits, so this session sat at the 96th percentile.
> The mechanism is **not the choice of waiting tool**. A capped call keeps whatever it already printed, so what decides the loss is whether the loop prints inside its body: silent loops lost all output 29 of 30 times, printing loops 13 of 36.
> The shipped rule was also uncommitted. See `claude/analysis/wait-loss/` and `claude/.agent/experiments.jsonl`.

**Verdict:** The billing work landed and is proven live (staging billed 91,500ms for a 91,036ms run that sat parked 420,482ms — measured), but 16 of 36 shell poll loops died at the 10-minute call cap while `Monitor` was used 0 times — measured.
**Biggest cost this period:** 160 minutes of calls that returned no answer, to finding #1.
**Next:** /evolve targeting poll-loop cap-hit rate with baseline 44% (16/36)

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, `ff995b36-247e-4160-ac53-dcb669094345`, 2026-08-24→08-26 |
| Volume | 23 operator turns (55 raw), 2,121 assistant msgs, 1,071 tool calls (1,004 Bash) |
| Sources | transcript jsonl; `gh-drew pr view` #6227/#6228/#6243/#6254/#6255; `gh-drew run list --workflow deploy-staging.yml`; admin API `GET /fleet/status` on staging-orchestrator-01; prod DB `credit_transactions` |
| Prior reflections read | 3: `2026-08-24-playproof-game-loop-session.md`, `2026-08-23-retry-marker-built.md`, `2026-08-22-wayfind-332-lead-vs-narrator.md` |
| Not inspected | trace-analyzer run (not invoked this session); production reaper behaviour (left dry-run); the 4 non-mine deploys' own logs |

## Findings — top 5 of 7, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Waited on CI/deploys with `for i in $(seq…); do sleep; done` inside Bash, which dies at the harness 10-min cap and returns nothing | 16 of 36 poll loops (44%) | 160 min of no-answer calls + 16 re-issue turns | ~140 min/session at same wait volume (assumes Monitor returns on condition) | measured | transcript scan: 36 seq+sleep loops, 16 `Command timed out after 10m`, Monitor calls = 0 | **Shipped:** `AGENTS.md` "Block with the waiting tool, never with a shell sleep loop" | claude |
| 2 | Merged a CI workflow that had never executed once | 1 of 5 PRs (20% rework) | rework PR #6254 (+12/-7); first dispatch died in 4s | 1 PR + ~35 min | measured | #6243 added `prove-parked-billing.yml` with `runs-on: ubuntu-latest`; run 32882847832 → "job was not started because recent account payments have failed" | none written — `AGENTS.md:68` Cost gate already covers it; adherence failure | claude |
| 3 | Staging wedged; 4 deploys that were not mine were blocked | 5 consecutive failures | 4h 44m staging unavailable (20:50:42→02:08:41) | 4h 44m + 4 blocked runs | measured (window, count) / inferred (whether my ship created or merely exposed the unhealthy probe host) | last green 20:24:41 `bc8d9ee7c`; failures on `b01932d7e`,`6f66d8339`,`77117291b`,`428e04594`,`1a7db3f3a`; blocked host `drainReason: ship-candidate:rel-…-b01932d7e82a` | recovered via `POST /releases/park`; procedure written to memory | claude |
| 4 | Told the operator a billing defect was "real and still open" on the strength of a source comment, before checking the code | 1 | 1 corrective cycle; self-caught before operator acted | 1 cycle | measured | claimed from `orchestrator-lifecycle.ts:170-177`; fixes `56d6c97b8`/`d26514fd9`/`acec314b5` predate that comment by 12 days | none written — repo `AGENTS.md` "Ground truth beats the written word" already states it; adherence failure | claude |
| 5 | Did not reconcile against peer PRs until the operator asked | 1 | 1 operator turn | 1 turn | measured | operator: "didn't recent prs by donovan work on handling idle sandboxes… are we duplicating work?"; check then took 4 calls and proved 0 code overlap (only `ROADMAP.md` shared, merge clean) | none written — `AGENTS.md` "Reconcile before you report new work" already states it | claude |

2 findings dropped below the cost×occurrence bar.

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Built beside the ask | 2026-08-24 | 2 | no new rule (adherence under momentum) | operator turn [11] "why are you still building things… what are these for?" — direction endorsed after explanation, work was not discarded | no |
| Reflection defers its own top action | 2026-08-23 | 1 | reflect-last: build reachable fixes in-session | held — finding #1's fix shipped this session, not deferred | no |
| Narrator in the lead seat | 2026-08-22 | 0 | lead-checkpoint directive | no operator complaint this session | no |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Parked interval billed on deployed path | 511,518 ms (defective answer) | 91,500 ms | −420,018 ms | 1 | measured | run 32885380098 |
| Staging reaper modes | dry-run | enforce | — | 2 flags | measured | `docker exec orchestrator env`; "Lifecycle manager started" log |
| 2026-08-05 refund status | unknown / listed owed | $614.31 across 8 users | — | 8 | measured | prod DB, `type=admin_grant` |
| Settle-at-now paths in orchestrator | 7 | 0 | −7 | 21 sites audited | measured | #6228 + #6243 |
| Poll loops hitting the 10-min cap | — | 16 of 36 | — | 36 | measured | transcript scan |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Mutation-check every clamp before claiming it works | each removal produced the expected failure: 3,600,000 ms, 1,800,000 ms, expected-arg mismatch | 3 of 3 |
| Adversarial pass on my own fix | caught `degraded` under-bill and `stoppedAt` zero-rating a resumed run — both invisible to green tests | 2 defects |
| Distrust my own passing test | caught a vacuous fixture (mocked clock Mar-2026 earlier than "24h ago" Aug-2026) before merge | 1 of 6 tests |
| Verify the operator's challenge instead of accepting it | duplication check proved 0 code overlap with peer PRs | 4 calls |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Use `Monitor`/`run_in_background` for every wait over ~2 min | poll-loop cap-hit rate | 44% → 0% | done (rule shipped) | next session | claude | grep next transcript for `Command timed out after 10m`; expect 0 |
| 2 | Dispatch a new workflow once on its real runner before merging it | PR rework rate | 20% → 0% | 1 dispatch/PR | next workflow PR | claude | workflow shows ≥1 non-cancelled run before merge commit |
| 3 | Read staging `GET /fleet/status` before and after any deploy dispatch | deploy-wedge blast radius | catch drain before it blocks others | 2 calls | next deploy | claude | pause==None and 0 non-terminal releases in both reads |
| 4 | Watch staging's first enforced sweep after 24h TTL elapses | production reaper decision | 180 parked records → candidate set | 1 check | 2026-08-27 02:30Z | drew | `docker logs orchestrator \| grep abandon` shows candidates |
| 5 | Restore GitHub Actions billing | artifact upload + hosted-runner jobs | account-wide failures → 0 | external | — | drew | any `actions/upload-artifact` step succeeds |

## Durable notes written
Reuse check: extended `~/dotfiles/claude/AGENTS.md:51` (blocking rule existed, named no mechanism); checked: no existing note (grep'd `monitor|poll|sleep loop|until-loop` over `AGENTS.md`, `CLAUDE.md`, memory dir) — findings #2, #4, #5 already covered by `AGENTS.md:68` and the "Ground truth" / "Reconcile" sections, so nothing written for them.

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| `~/dotfiles/claude/AGENTS.md` | Block with Monitor/background, not a shell sleep loop; it dies at the 10-min cap and buys no information. | — |
| `~/.claude/projects/-Users-drew-webb/memory/adc-compute-settlement-rules.md` | First stop row per generation wins (`ON CONFLICT DO NOTHING`); staging unwedge via `POST /releases/park` on port 4096. | — |

## Self-gate
8/8 passed — failed: none.
k-of-n · cost both sides · status label · repeat check · Verdict names one number + one dispatch · actions name lever+target+owner+verification · zero adjectives standing in for counts · words 512 ≤ 600.
