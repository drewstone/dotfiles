# Reflect: session (agent-dev-container) — 2026-08-16 — n=1

**Verdict:** Every gate this session moved to green except the one that decides the number — production deploy success is **0/7 concluded runs**, and **5/5** of those failed on the single job `Browser Chat and Desktop (production)` (measured, `gh-drew run list --workflow deploy.yml --limit 10`).
**Biggest cost this period:** 2 deploy cycles (~100 min wall) to finding #2 — a remote instrument built for a question a direct log read may answer in one command.
**Next:** `/diagnose` targeting the chat silent-turn with baseline "0 conclusive A-vs-B observations in 2 live runs"

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-08-15 21:45Z – 2026-08-16 06:50Z |
| Sources | PRs #5717 #5722 #5723 #5724 #5741 #5725 #5743; deploys 31891930918→31932230826; smoke 31931291194, 31931464036; D1 `compute_charge_intents`; `sandbox.tangle.tools/health` |
| Prior reflections read | 3: `2026-08-11-adc-prod-outage-and-release-unblock.md`, `2026-08-13-adc-durability-proof-and-five-day-deploy-block.md`, `2026-08-14-adc-blueprint-worker-fix-and-gate-speed.md` |
| Not inspected | Orchestrator/sidecar host logs (access untested this session; platform host `id-tangle-tools` reachable, orchestrator host not attempted). Staging entirely — all work targeted production. |

## Findings — top 5 of 8, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Serial-reveal: each fix exposes the next, found one at a time | 4 this session | 4 sequential cycles (settlement 4th wall; cosign gate; assertion regex; audit credential) | ~2 of 4 cycles if all probes fan out before the first fix | measured | #5723 after 3 prior walls; #5741 after #5724 | Fan out every candidate probe in one pass before fixing any | operator |
| 2 | Built a remote instrument for a question direct logs may answer | 1 | 2 deploy cycles ~100 min, 2 release cuts, 0 conclusive answers | ~100 min | measured | #5724 then #5741; both live runs non-conclusive | Attempt sidecar/orchestrator host log read BEFORE shipping an instrument | operator |
| 3 | Investigated a failure before re-running the cheapest decisive test | 1 | ~8 tool calls on orchestrator health/credentials | 8 calls | measured | smoke 31931291194 red → 31931464036 green on re-run; log already showed `Retry-After: 2` + 5 SDK retries | On any documented-retryable, re-run first, investigate only if it repeats | operator |
| 4 | Invariant gate caught a violation after commit, not before | 1 | 1 amend cycle | 1 cycle | measured | `check-cosign-version-pin.mjs` red on a comment string in `ghcr-live-pinned-digests.sh` | Run `node scripts/check-*.mjs` for the touched area pre-commit | operator |
| 5 | Assertion widening needed 2 rounds; regex missed `.resolves.toEqual` form | 1 | 2 gate runs ~4 min | 4 min | measured | `gidem2.log` 1 failed / 29 passed after round 1 | Grep the literal call count before and after a bulk rewrite | operator |

3 findings dropped below the cost×occurrence bar.

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Serial-reveal (fix N exposes blocker N+1) | 2026-08-11 | **9** | "fan out probes" noted, never made a gate | It is advice, not a step in any flow; nothing forces the parallel probe pass | **Yes — 9th raise, systemic** |
| Claiming state without checking the artifact | 2026-08-14 | 4 (0 this session) | Claim gate | Held: the deploy watcher exited 0 with empty output and I re-verified live rather than trusting it | No |
| `/health` blind to a real outage | 2026-08-11 | 3 (0 this session) | — | Not exercised; `chargeIntents` gauge tracked truth correctly this session | No |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Compute charge-intent backlog | 8 (peak 34,559) | **0** | −8 | 1 | measured | D1 `SELECT COUNT(*)` 06:23:02Z |
| `chargeIntents` gauge | degraded | **ok** | — | 1 | measured | `/health` 06:23:02Z |
| Production SDK lifecycle smoke | failure | **success** | — | 2 runs | measured | 31931291194 → 31931464036 |
| Production deploy success | 0/5 | **0/7** | 0 | 7 | measured | `deploy.yml` last 10 |
| Deploys failing only on the chat job | — | **5/5** | — | 5 | measured | per-run job scan |
| Surface-audit unit tests | 36 | **51** | +15 | 1 | measured | `vitest run tests/live/surface-audit.test.ts` |
| Deploy bats suite | — | **875/875** | — | 1 | measured | task b602edb95, exit 0 |
| Conclusive chat A-vs-B observations | 0 | **0** | 0 | 2 live runs | measured | 31926965157 (404), 31932230826 (running) |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Mutation-test every load-bearing branch, operator re-runs it | Every shipped fix had a mutation that failed the right test | 6 of 6 PRs |
| Re-verify delegated evidence on the real path | Re-ran the subagent's finalize mutation myself before shipping #5724 | 1 of 1 delegated patch |
| Force the real path instead of waiting for a theory | Guarded `next_attempt_at` reset, 8 rows, cleared in one tick | 8 of 8 rows |
| Correct a memory in the same turn its claim is disproven | `project_browser_chat_stream_silent` amended when the 404 proved to be my credential | 2 files |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Read sidecar + orchestrator logs on the host during one live chat run | Chat A-vs-B, direct | 0 → 1 conclusive observation | ~30 min | next session | operator | A log line naming the run's emit or its absence |
| 2 | Fix the chat outage from whichever half the logs name | Deploy success | 0/7 → 1/1 | unknown until #1 | after #1 | operator | One deploy concluding `success` |
| 3 | Make the parallel-probe pass a step in the debug flow, not advice | Serial-reveal (9th raise) | ~2 of 4 cycles | ~1 h | this week | operator | Next multi-wall bug logs all probes before fix #1 |
| 4 | Verify the 03:30Z retention run collects pins and selects versions | GHCR quota | 0 → first count-bounded cycle | ~15 min | 2026-08-17 | operator | `shas-to-skip` non-empty in the run log |

## Durable notes written
Reuse check: checked memory dir for the ownership-404 rule — none existed (grep'd `SIDECAR_NOT_FOUND` over `~/.claude/projects/.../memory/`); `project_browser_chat_stream_silent` extended in place rather than forked.

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| `memory/reference_sidecar_not_found_masks_ownership.md` | 404 SIDECAR_NOT_FOUND = absent OR not-yours OR no-auth, inseparable by design; 503 NOT_READY proves ownership | — |
| `memory/project_browser_chat_stream_silent.md` | Chat outage still open; discriminator's first live answer was a credential fault, not a verdict | its own pre-08-16 "check will answer it" claim |

## Self-gate
8/8 passed — failed: none.
