# Handoff: ADC + blueprint — ship-every-day pipeline — 2026-08-15

**Objective:** stop observation failures from blocking deploys; make staleness directly alarmed; get everything merged.
**Status: complete.** 17 PRs merged, 0 open, 0 unpushed. Both productions current and healthy. Open loops: 7 (table below).

## Live state — re-verified at write time
| Thing | Value | Check |
|---|---|---|
| blueprint prod | `0b6a6c6d7` healthy, 0 Worker errors | `curl ai.tangle.tools/api/health` |
| ADC prod | `9af1343f4` = main head, 0 behind | `curl sandbox.tangle.tools/version` + `rev-list` |
| disk | 320G free, `disk-guard.timer` active (20 min) | `systemctl --user is-active disk-guard.timer` |
| my open PRs / unpushed | **0 / 0** | `gh-drew pr list`, `rev-list --not --remotes` |

## The architecture that shipped (3 rules)
1. **Mutation decides the run; observation reports** — ADC #5593. Run red ⇔ production didn't change. Policy invariant enforces the mutation `exit 1` (102 tests).
2. **Staleness measured directly** — serving-revision age bound in both canaries (blueprint #2323/#2324, ADC #5490). Proven live: 29.6h RED → 0h GREEN across a real deploy. **This is what makes rule 1 safe — the workflow comment couples them.**
3. **Checks that can't fail for a product reason get deleted** — staging verify jobs (blueprint), `experiments` off push tier, prod browser audit key rotated to a verified-good credential.

## Merged (17)
ADC: #5439 #5133 #5443 #5480 #5490 #5523 **#5593** #5594 · blueprint: #2313 #2317 #2320 #2321 #2323 #2324 #2325 + worker-sizing + tools repo (`disk-guard` c3aee6e/e0fc91c)

## Open loops — 7 rows
| # | Item | State | Pointer | Next command |
|---:|---|---|---|---|
| 1 | Browser proof green with rotated key | unproven | ADC deploy.yml `browser-production-sandbox`; empty-read cause (value vs scope) unknown | watch next real deploy's job |
| 2 | ADC release PR #5582 | open, UNSTABLE, not mine to merge | `release/20260814-3` | needs Drew's explicit word |
| 3 | blueprint e2e account unverified | blocks prod browser sign-in job | `E2E_STAGING_EMAIL` mailbox needs its verification link clicked | Drew |
| 4 | ADC serving-lag alarm never fired in CI | merged, unit-proven only | `scripts/production-canary.sh` `SERVING_LAG_MAX_HOURS=24` | fires on next genuinely stale prod |
| 5 | Two credential names for one thing | ambiguity persists | `SANDBOX_PRODUCTION_API_KEY` vs `PRODUCTION_SANDBOX_API_KEY` + manifest optionalReason | collapse to one name |
| 6 | Fleet install drift | 2 worktrees missing `simple-git` | lockfile has it (13 refs); installs stale | `CI=true pnpm install` per worktree |
| 7 | `agent=none` tier on operator account | unknown if intentional | `tangle-admin user-status --user-id cAeRI…` | ask Drew |

## Standing decisions — each with its kill condition
| Decision | Kill condition |
|---|---|
| Observation never blocks shipping | 1 stale-prod incident the serving-lag alarm misses → `git revert 3382d80c9` + restore blocking in same change |
| `SERVING_LAG_MAX_HOURS` 12 (bp) / 24 (ADC) | 1 false page in 7 days → raise bound, don't delete leg |
| vitest workers 8 + load-aware floor | any timeout-failure at load < 2× cores → lower cap |
| disk-guard prunes dangling only while containers run | guard-caused pull failure recurs → disable timer |
| Don't add PR-time precondition gates | operator explicitly rejected the pattern |

## Operator corrections paid this session — do not pay twice
- "Stop asking, take the lead, merge it" — asked twice about things already authorized.
- "Delete useless things slowing us down" — deletion is a first-class fix; the staging verify jobs gated nothing for 4 days.
- "No new CI gates" — after I proposed a preconditions gate; the fix was *removing* a blocker, not adding one.
- 9/10 self-gate confusion — "7/9" reads ambiguous; always write "k passed, j failed: which".

## What I was uncertain about at close
- **#1 above is the big one**: whether the prod browser audit's empty key read was a stale value (fixed by rotation) or a scope problem (not fixed). Next deploy answers it; I could not trigger one safely.
- The serving-lag legs are proven in blueprint but only unit-proven in ADC — the bash arithmetic path has never run against a real stale revision.
- `coordinate-production-release.mjs` reads are "correct by construction" post-#5593 — reasoned, not observed on a live release.

## Traps for the next session (all in memory, top 3)
- `ENOSPC` truncates silently; `git push` exits 141 AFTER `✓ preflight passed` → check `df` first ([[reference_adc_worktree_push_preflight]]).
- Secrets live in 3 stores (repo/environment/org); environment shadows repo; jobs without `environment:` can't read env-store ([[reference_github_environment_secrets_shadow_repo_secrets]]).
- `check-types` is 252s cold / 1s warm — cache state, not compute; use `adc-wt claim` ([[reference_turbo_cache_is_the_gate_cost_not_tsc]]).
