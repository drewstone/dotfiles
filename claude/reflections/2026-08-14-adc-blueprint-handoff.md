# Handoff: agent-dev-container + blueprint-agent — 2026-08-14

**State:** production fixed and serving current code; 14 PRs merged; 1 docs commit in transfer. measured

## Live state — verified, not assumed
| Thing | Value | Check |
|---|---|---|
| blueprint production | `0b6a6c6d7` healthy (was `cde206d21`, 94h stale) | `curl ai.tangle.tools/api/health` |
| Worker error rate | **0** (was 4.46% of 830 invocations) | CF `workersInvocationsAdaptive` |
| serving-lag alarm | **0h GREEN** (fired at 29.6h RED, cleared on the real deploy) | `SKIP_LEGS=spine,sandbox,errors node scripts/ops/production-canary.mjs` |
| ADC production | `0` commits behind main | `git rev-list --count <serving>..origin/main` |
| disk | 367G free, `disk-guard.timer` **active** every 20 min | `systemctl --user is-active disk-guard.timer` |

## Open loops
| # | Loop | Next action | Owner |
|---:|---|---|---|
| 1 | `docs/claim-warm-worktree` (1 commit, `07323a282`) mid-push | confirm ref, open PR, merge | next session |
| 2 | ADC release PR #5582 (`release/20260814-3`) UNSTABLE | not mine — production promotion, needs human direction | Drew |
| 3 | ADC serving-lag alarm merged but never fired in CI | wait for a real stale revision, or force one | next session |
| 4 | blueprint e2e account unverified (`403` at sign-in) | verify the account, or the production browser job stays fragile | Drew |
| 5 | Fleet-wide install drift: `simple-git` missing in 2 independent worktrees | `pnpm install` in each, or find why installs go stale | next session |

## Traps that cost time today — all now recorded in memory
| Trap | Cost |
|---|---|
| Disk at 100%; `ENOSPC` truncates silently (`git push` exits 141 AFTER its gate prints success) | 6 pushes, ~2h |
| Two `SANDBOX_API_KEY` secrets; the job reads the **environment** store, not repo | 3 wrong theories |
| `/tmp/preflight.*` is shared — `ls -t` reads ANOTHER agent's log | 1 false diagnosis |
| Harness scratchpad under `/tmp` deleted 3× mid-measurement | 2 lost runs |
| `check-types` 252s cold / 1s warm — cache state, not compilation | nearly optimised the wrong thing |
| Shared `TURBO_CACHE_DIR` across worktrees: **refuted**, 0/2 hits | — |
| `worktree-reap` removed a worktree holding an unpushed commit | recovered from the shared object store |

## Merged this session (14)
ADC: #5439 deploy-report split · #5133 host-security baseline · #5443 concurrent invariants · #5480 config-surface + ratchet · #5490 ADC serving-lag · #5523 name the evaluated credential
blueprint: #2313 verified user-funded · #2320 unfunded-owner · #2321 unattributed sweep (the real fix) · #2317 release to main · #2323 serving-lag alarm · #2324 compare-API fix · #2325 worker sizing
tools: `disk-guard` (`c3aee6e`, `e0fc91c`)

## Numbers that moved
| Metric | Before | After |
|---|---:|---:|
| invariant gate | 239s | 114s |
| blueprint unit gate | 0/4 runs passed | 3/3, 142s → 66s |
| production build age | 94h | current |
| disk free | 963M | 367G |
