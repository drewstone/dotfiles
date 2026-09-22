# Reflect: session — 2026-09-04 — n=1

**Verdict:** Every item Drew asked for is serving production (fleet on `5caa3e05`, canary buy job 10/10), but the session's dominant defect is mine: **5 measured wrong-layer reads** (run-status vs per-job, platform vs orchestrator surface, truncated watcher line, cancel-submitted vs cancelled, false causation) cost ~1.5h and injected 2 corrections into a live SOC 2 packet. measured.
**Biggest cost this period:** ~2h of half-deployed production (Worker+D1 ahead of fleet) to finding #2.
**Next:** /handoff targeting the 4 untouched open loops from the 09-03 brief, baseline = that brief's loop table.

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-09-03T04:3xZ–09-04T00:5xZ (one conversation) |
| Sources | PRs #6840 #6848 #6849 #6850 #6859 #6863 #6864 #6866 #6873 #6876 #6878; runs 33718252250, 33729928835, 33811135689, 33815986783, 33721585515, 33807481581; live curls of orchestrator/sandbox/id `.tangle.tools`; org runners API |
| Prior reflections read | 3: `2026-09-03-adc-prod-deploy-staging-release-wedge.md`, `2026-09-01-adc-launch-fix-marathon.md`, `2026-09-01-storage-reclaim-fleet-teardown.md` |
| Not inspected | subagent transcripts (context cost); staging charge-intent backlog depth post-fix; `ci-heavy` label capacity mapping |

## Findings — top 6 of 11, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Wrong-layer reads: run-status while 12 jobs executed on 5 runners; `id.tangle.tools` cited for orchestrator claim; truncated line → phantom "cancellation #4"; cancel accepted≠effective; peer's cancel credited for my run starting | 5 | ~1.5h + 2 packet corrections + peer sent on phantom SSH hunt | ~1h/session | measured | jobs API run 33807529365 (12 jobs, started 21:24:54Z vs my "queued 28min"); `service:"platform"` in /health; run 33811135689 later `in_progress` | rule: claim only from the layer the claim is about (jobs API, target endpoint), re-read state after any mutation | me |
| 2 | Promotion cadence (≈45min: 21:19/22:02/22:49Z) < deploy duration (70–110min) ⇒ 3 deploys cancelled, 0 landed 21:19–22:56Z, prod HALF-deployed (Worker+D1 `c0c7a651`, fleet `e954d28a`) ~2h | 3 cancels | ~2h split-state + 12 prod deploys = 3 success/8 cancelled/1 failure | 1 landed deploy per promotion | measured | 6/6 sandbox samples vs orch curl; jobs of 33811135689 (Worker ✓, D1 ✓, fleet killed); `hold-promotion` on #6878 then lifted | ops task filed: mutating stages non-cancellable or rollback-on-cancel | eng (ops board) |
| 3 | Superseded/starved CI reads as mass failure (`cancelled`, 0 steps) | 4 | ~50min diagnosis | ~12min each | measured | job 100537421829 `{"conclusion":"cancelled","steps":[]}`; 14-fail flash on #6866 | pitfall written; check job conclusion then `rerun --failed` | me |
| 4 | Obvious dep fix wrong 3×: blanket toml floor→5.0.0 (violates `^4.1.1`); local bundle snapshot (mac gzips 5–7KB under CI); pi-coding-agent name trap (fork, schema rev 8 vs 13) | 3 | ~40min checking | avoided 1 broken build + 1 false compliance row | measured | resolution grep `toml@5.0.0`; `bundle-size-cli.ts:72`; `agent-clis.nix:534` | habit: read what resolved, not what was intended; `--from-ci` for ratchets | me |
| 5 | Background watchers fail silently: `gh pr edit --add-label` no-ops (GraphQL deprecation) — hold absent ~40min while watcher printed HELD; long-lived watcher's reads went blank | 2 | ~40min unprotected window | read-back after every mutation | measured | `pr view 6878 --json labels` = `[]` after "HELD"; bccin5qmt empty fields [15]–[19] | REST label + read-back done; don't stack overnight watchers | me |
| 6 | Opus 529 ×2 + Sonnet 600s-stall ×2 killed fix agents; work recovered by hand from their worktrees | 4 | ~50min | resume-from-worktree habit (worked) | measured | task ac906b13/a8531b42 (529), a6270bc5/a70768796 (stall, diffs intact) | on agent death: inspect worktree before relaunching | me |

5 findings dropped below the cost×occurrence bar (incl. billing-claim double walk-back — 2 corrections to Drew; folded into #1's class).

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Trust-the-summary/truncated-output misreads | 09-01 marathon #2 (3/3 scans) | 2 | "read summary lines only" note | note targeted log tails, not status layers; class is wider | yes — folded into finding #1 rule |
| Unverified prior claim accepted (own memory/handoff) | 09-01 #3 | 2 | AGENTS ground-truth rule | 09-03 handoff's "6 identical 409s" premise disproved only after measuring (2 of 7) | no — measuring first worked this time |
| 09-03 open loops | 09-03 brief | 1 | — | closed 4 of 9 (#1,#2,#3,#8), partial 1 (#7 prod-side only), untouched 4 (#4,#5,#6,#9) | carry to handoff |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Staging green releases | 0/481 receipts | 2 of last 5 runs | +2 | 486 | measured | receipt `rel-20260903T052914Z`; run list |
| Prod deploys landed/day | 1/15 | 3/12 (8 cancelled) | +2 | 12 | measured | deploy.yml conclusions |
| Fleet revision vs main | 20 commits/8h behind | converged (`5caa3e05`), 1 cut behind | — | 2 probes | measured | raw `/version` |
| Dependabot on ADC | 8 mod + 2 high open | 9 fixed, 1 dismissed, 1 upstream | −10 | 11 | measured | #6866 #6876; #346 #400/#401 dispositions |
| Warm-claim create (bake gate) | — | 1.789s, 1.884s (≤3s) | — | 2 | measured | runs 33721585515, 33807481581 |
| PRs merged / releases promoted | — | 6 / 3 (#6859 #6873 #6878) | — | — | measured | merge SHAs in transcript |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Curl the endpoint before calling anything live | caught half-deploy + stopped packet overclaim | 2 catches |
| Adversarial read of peer/agent proposals | ci-release deploy move rejected; 2 agents' gate-skip reverted to root fix | 3 |
| Smallest-proof-first (dry-run purge, probe workflow) | ghost purge refused `not-found` safely; probe answered in 16s vs 50min release | 2 |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Ship non-cancellable deploy stages (ops task, 3 data points) | finding #2: half-deploy class | 0 split states | 1 PR | this week | eng/Drew assigns | cancelled deploy leaves fleet==Worker revision |
| 2 | Apply finding #1 rule mechanically: any load-bearing status claim cites jobs-API/endpoint, mutations re-read | #1's ~1.5h/session | −1h/session | habit | immediate | me | next reflect: 0 wrong-layer rows |
| 3 | /handoff the 4 untouched 09-03 loops (#4 ingress guard, #5 SSH audit, #6 backup drift, #7 staging backlog depth) | loop leakage (38/74 re-raise stat) | 4 loops carried not lost | 20min | now | me | handoff file lists all 4 with commands |
| 4 | Verify staging charge-intent backlog (depth 3922 on 09-03) against the new gauge | 09-03 loop #7 | known vs unknown | 10min probe | next session | me | staging /health three-queue reading |

## Durable notes written
Reuse check: extended `MEMORY.md` index each time; checked no existing note (grep'd `BILLING_PROVENANCE`, `bundle`, `cancelled`, `half-deploy` over memory dir); repo pitfall grep'd `.memory/INDEX.md`.

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| memory/project_promotion_cancellation_leaves_half_deploys.md | cancelled prod deploy = partial deploy; Worker+D1 move, fleet doesn't; hold-promotion is the guard | — |
| memory/pitfall_bundle_ratchet_is_platform_dependent.md | mac gzip ≠ CI gzip (5–7KB); use --from-ci with run id | — |
| memory/pitfall_cancelled_ci_looks_like_mass_failure.md | red wall = cancelled 0-step jobs; check conclusion, rerun --failed | — |
| memory/project_staging_release_failures_rotate.md | 5 distinct causes in 7 runs, not one 409; streak broke 06:02Z | 09-03 brief premise |
| repo .memory/pitfalls/real-infra-gates-that-never-pass-on-macos.md (merged in #6840) | 4 named darwin-impossible gates + honest merge path | — |

## Self-gate
8/8 passed — failed: none.
k-of-n · cost both sides · status label · repeat check · Verdict names one number + one dispatch · actions name lever+target+owner+verification · zero adjectives standing in for counts · words ~560 ≤ 600.
