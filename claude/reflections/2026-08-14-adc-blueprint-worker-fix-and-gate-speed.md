# Reflect: session — 2026-08-14 — n=1

**Verdict:** 7 PRs merged and the blueprint Worker fix is proven on staging (0 err/31 req vs a 26.7% baseline), but it is NOT in production — the deploy stopped at a billing preflight and prod still serves `cde206d21` from 08-10. measured
**Biggest cost this period:** 11 push attempts to land 4 branches, to finding #1.
**Next:** /verify targeting the production `SANDBOX_API_KEY` owner's funding state with baseline "deploy exit 78, `A paid seat or positive funded balance is required`"

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-08-13T20:00Z–2026-08-14T05:00Z |
| Sources | `gh-drew pr list` both repos; `git log` adc-fc-gate; `curl ai.tangle.tools/api/health`; CF GraphQL `workersInvocationsAdaptive`; `wrangler tail` |
| Prior reflections read | 3: `2026-08-13-adc-durability-proof-and-five-day-deploy-block.md`, `2026-08-13-agent-sdk-tranche-adversarial-gate.md`, `2026-08-13-agent-sdk-tranche-handoff.md` |
| Not inspected | Session push logs — the scratchpad was deleted by my own disk reclamation, so attempt counts come from the transcript, not from files |

## Findings — top 5 of 9, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Root filesystem hit 100% (963M free of 1.8T). `ENOSPC` truncates writes silently, so `git push` exited 141 AFTER `✓ preflight passed` and one memory write vanished mid-sentence | 6 pushes | 6 failed pushes; ~2h misattributed to SSH contention then to systemd-oomd, both wrong | 6 pushes; the 2h | measured | `df -h /` → 963M; `journalctl --user -u systemd-oomd --since -60min` → "No entries" refuted the oomd theory | `worktree-reap reap --yes` removed 155 worktrees / 192GB → 252G free | done |
| 2 | I claimed the unfunded-owner fix would green production. It deployed to staging and the Worker still threw `checkpoint sweep failed 34 of 34` | 2 claims | 1 wasted merge→deploy→measure cycle | 1 cycle | measured | `/api/health` → `b78e6b0750` (fix live); CF analytics 4 err/15 req = 26.7% after it | Root cause was a session-credential cache empty by design in a background sweep; fixed as `unattributed` (blueprint#2321) | done |
| 3 | blueprint's unit gate failed 1, then 3, then 6, then 11 different files across 4 runs; every one passed in isolation | 4 runs | 4 blocked pushes | 4 pushes/run forever | measured | `maxWorkers: process.env.CI ? 4 : undefined` — bounded in CI, unbounded on a host at load 95–190; errors were `Test timed out in 15000ms` on 1ms tests | cap 4 everywhere + 60s local timeout; full suite then 5794 passed / 0 failed | done |
| 4 | `apps/orchestrator` ships two modules both exporting `const config`; a bare `../config` resolves to the FILE, not the directory index | 4 consumers | unmeasured (no incident traced to it yet) | prevents a whole "flag set, nothing changed" class | measured | `routes/batch/capacity.ts:7-8` imports BOTH; 3 distinct spellings reach one module; `tsc` found the consumer my grep missed | renamed to `orchestratorConfig`; only one module exports `config` now; tsc RC=0 | committed, unpushed |
| 5 | A pre-push gate ran the experiments suite, which calls a live LLM. One provider-edge `403` failed the push | 1 | 1 blocked push | every future provider blip | measured | `LLM call failed: 403 <!DOCTYPE html>…Cloudflare` in the signoff log | moved to the `full` tier; CI still runs it | done |

4 findings dropped below the cost×occurrence bar.

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Claiming state without checking the artifact | 2026-08-11 | 4th | "check the artifact before claiming" | I asserted the unfunded fix would green prod, twice, before measuring the deployed build. The rule exists; I applied it only after being wrong | YES — 4th raise |
| Serial-reveal (blockers surfaced one at a time) | 2026-08-11 | 8th | none held | Each push exposed exactly one new blocker: disk → workers → Node → experiments-gate → stale receipt → orphan signoff. I never enumerated the gate's preconditions up front | YES — 8th raise |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| invariant gate wall time | 239s | 114s | −125s (−52.3%) | 3/arm, interleaved | measured | serial 272/225/239, concurrent 114/98/190; 3.2× noise floor; identical exit codes and 0 failures both arms |
| `checks` group | 25s | 8s | −17s | 1/arm | measured | same file, `INVARIANTS_CONCURRENCY=1` vs default; failure sets identical |
| blueprint unit failures | 11 | 0 | −11 | 1 full suite | measured | 521 files / 5794 tests at load 34–77 |
| staging Worker error rate | 26.7% | 0% | −26.7pp | 31 req | measured | CF `workersInvocationsAdaptive`; P(0/31 at p=.267) ≈ 6.6e-5 |
| root disk free | 963M | 252G | +251G | 1 | measured | `worktree-reap reap --yes` → 155 worktrees, 192GB |
| envReadsOutsideConfig | 1168 | 1146 | −22 | 1 | measured | rule correction only, no code improved — stated as such in the commit |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Mutation-test every gate I touch | planted failures caught in the deploy policy check and the ratchet rule | 5/5 and 1/1 |
| Read the live path instead of the code | `wrangler tail` gave `kind:"unclassified"` / `Attributed Sandbox access is unavailable` ×34 — the actual cause, invisible in review | 3 of my own conclusions overturned |
| Interleave A/B arms | box load drifted 41→190 during the run; alternating arms kept the comparison honest | 3/arm |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Resolve prod `SANDBOX_API_KEY` owner, grant seat/balance | prod runs the fix | 4.46% → ~0% | 15m | next session | Drew (money-touching) | deploy re-runs past exit 78; `/api/health` ≠ `cde206d21` |
| 2 | Push the 3 unpushed adc-fc-gate commits | ratchet + config fix land | 3 commits at risk | 20m | next session | operator | `git ls-remote` shows `fix/config-surface-ratchet` |
| 3 | Enumerate a gate's preconditions before the first push | serial-reveal (8th) | ~6 attempts → 1 | 30m | next session | operator | one push attempt lands a branch |

## Durable notes written
Reuse check: extended `reference_adc_worktree_push_preflight` (already covered fresh-worktree gates; added the ENOSPC/141 signature and the `adc-wt`/`worktree-reap` tools I had hand-rolled around).

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| `reference_flaky_local_gates_are_oversubscription.md` | Different failing set each run + timeouts = unbounded workers; `VITEST_MAX_THREADS` is ignored on Vitest 4 | — |
| `project_orchestrator_two_config_modules.md` | Two `export const config` modules chosen by import spelling; hid 179 env reads from the ratchet | — |
| `project_blueprint_prod_deploy_blocked_unfunded_key.md` | Prod deploy refuses: key owner needs a paid seat/balance; main ahead of prod | — |

## Self-gate
7/8 passed — failed: cost both sides (finding #4 carries `unmeasured` for cost incurred, no incident is yet traceable to the config collision).
