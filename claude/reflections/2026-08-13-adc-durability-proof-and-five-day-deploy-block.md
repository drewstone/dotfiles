# Reflect: session — 2026-08-13 — n=1 session (+3 prior reflections read)

**Verdict:** Cloud-agent conversations provably survive snapshot→restore onto a different sandbox (verbatim recall, negative control 0 sessions/0 messages) — but the costliest event was re-deriving a root cause already written down 2 days ago. measured
**Biggest cost this period:** ~3.5h of investigation to finding #1, an item logged as an open action on 2026-08-11 and never read.
**Next:** /evolve targeting restore latency with baseline 20.98s median (n=5), lever = the cache-root config that skips an 11.0s chown

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-08-12 → 2026-08-13 |
| Sources | 22 merged PRs (#5225–#5360, blueprint-agent #2315), `.agent/handoff-20260813.md`, `scratchpad/restore-perf/raw/*.jsonl` (208 rec), `scratchpad/durability-proof-final/observations.jsonl` (139 rec), live prod/staging boxes |
| Prior reflections read | 3: `2026-08-11-adc-prod-outage-and-release-unblock.md`, `2026-08-11-adc-handoff.md`, `2026-08-11-adc-firecracker-real-handoff.md` |
| Not inspected | agent-eval / discovery / supervisor-lab lanes; the 3 always-failing create stages (observed 13/13, not triaged) |

## Findings — top 6 of 9, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Re-derived a root cause already logged as an open action | 1 | ~3.5h | same hours per recurrence | measured | `2026-08-11-adc-handoff.md`: "Autoscale dead \| unfixed \| `not_found: SSH key not found` ×6" — I re-found it from Hetzner API + SOC2 export | read prior reflection's open actions BEFORE investigating | me |
| 2 | Deploys blocked 5d20h / 201 alarms by 1 deleted SSH key | 1 | 5d20h of undeployable prod; the create-restoring hotfix could not ship | eliminates the class | measured | `adc-agent-debug` id 115082047 in SOC2 export 2026-08-01, absent from live API; Hetzner rejects whole create on any unknown key | PR #5337 resolves names, drops missing ones, never fails the create | merged |
| 3 | A check that cannot run rendered as "still passing" | 1 | the 5 days in #2 stayed misdiagnosed | makes every future blind check visible | measured | blueprint `production-canary.mjs:142-144` returned `{ok:true, note:"capacity UNPROVEN"}` → rendered under `_still passing:_` | bp #2315: unproven is its own group, holds the run red | merged |
| 4 | Per-tenant restic keys stored only in Redis, silently re-minted on miss | 1 | 18 consecutive failed snapshot cycles; history recovered only via a Redis backup that happened to exist 10h pre-wipe | removes a permanent-data-loss mode | measured | `snapshot-tenant-keys.ts` `getKey`→`createKey` on any miss; Aug-11 ACL wipe destroyed them | PR #5394 HKDF-derives with epoch; storage deleted | open |
| 5 | Two test doubles more permissive than production | 2 | 1 merged regression wedged a ship; 1 probe blocked every release | each class becomes CI-catchable | measured | fake docker accepted `rmi ""` (8/8 green, prod exit 12); probe used `/auth/cli/hub-key` which 401s valid keys while create returns 201 | PR #5315 fake rejects blank refs; #5360 probes the real route | merged |
| 6 | Pushed with no PR for hours | 1 | invisible work; caught only at handoff | — | measured | `fix/tenant-key-loss-is-not-silent` pushed `ffa84773a`, PR opened only during `/handoff` → #5394 | check `gh pr list --head <branch>` after every push | me |

3 findings dropped below the cost×occurrence bar.

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Autoscale dead — Hetzner SSH key | 2026-08-11 | 2 | none (listed unfixed) | logged as an open action, never read at session start | fixed now (#5337) + durable |
| `/health` blind to create outage | 2026-08-11 | 3 | none | health returned 200 while creates 502'd again tonight | **YES — 3rd raise, still unfixed** |
| Serial-reveal: each fix exposes one layer further | 2026-08-07 | 6 | adversarial rounds | staging ship failed 7×, each a different blocker (layer cache → migrations → my regression → cosign flake → credential → probe → stale record) | **YES — 6th raise, systemic** |
| Redis ACL not in any repo | 2026-08-11 | 2 | none | the Aug-11 wipe's downstream cost materialized tonight: it destroyed all tenant restic keys | **YES — cost now proven** |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Conversation survives restore to a new sandbox | unknown | verbatim recall | proven | 2+1 control | measured | `durability-proof-final/observations.jsonl` |
| Restore median (1 MB workspace) | 26.9s (n=2) | 20.98s | −5.9s | 5 | measured | `restore-perf/raw/reps-small.jsonl` |
| Restore vs 49× data (1 MB→64 MiB) | 20.98s | 21.96s | +4.6% | 5→8 | measured | `reps-large.jsonl` |
| Prod deploys blocked | 5d20h / 201 alarms | unblocked | — | 1 | measured | Hetzner key removed from secret; deploy preflight passed |
| Orphaned backup objects | 48,071 | 881 | −47,190 (~112 GiB) | 1 | measured | `prune-orphans.mjs` DRY re-run: `to delete: 0` |
| Live repos intact after deletion | 11 | 11 | 0 | 1 | measured | same run, EXCLUDED list |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Subagent refuses a relayed approval for an irreversible act | halted a 112 GiB delete on "Drew approved" relayed by an agent; I re-issued holding real authorization | 1 of 1 |
| Negative control on a passing proof | fresh box + same session id recalled nothing → snapshot proven load-bearing, not a central store | 1 of 1 |
| Live measurement over code reading | a subagent's code-read said no `Server-Timing`/restore spans exist; the deployed build had both — the entire decomposition came from live | 1 of 1 |
| Dry-run + assertion before destructive ops | guard HALTED on live tenants outside the `^sandbox-` namespace before any delete | 1 of 1 |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Read prior reflections' open actions at session start | rediscovery cost | −3.5h/session | 5 min | next session | me | cite the open-action row before investigating any infra fault |
| 2 | Fix cache-root config so `freshContainerCoversCacheRoots` fires | restore latency | −11.0s (−52%) | S | next | — | re-run n=5; `cache_ownership_repair` = 0ms |
| 3 | Make `/health` exercise the create path | outage detection | 3rd raise; 88min+5d undetected | M | next | — | revoke `~project:*` on staging; health must go red |
| 4 | Span the 4.4s orchestrator residual | 21% of restore is unmeasurable | enables #2's next cut | S | next | — | span appears in `startupDiagnostics` |
| 5 | Version the Redis ACL + tenant-key config in a repo | 2nd raise; caused #4's data loss | eliminates rebuild-reintroduction | S | next | — | `git log` shows the ACL file |

## Durable notes written
Reuse check: extended `project_restic_key_mismatch_no_backups.md` (grep'd `restic|tenant.key` over the memory dir; the note existed from earlier in this session and was corrected in place, not duplicated).

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| `memory/project_prod_deploy_blocked_five_days_ssh_key.md` | One deleted Hetzner SSH key blocked every prod deploy 5d20h; plus the deploy-vs-main-velocity race | — |
| `memory/project_durability_proof_passed_20260813.md` | Conversation survives snapshot→restore to a different sandbox; cross-HOST untested | `project_cloud_agent_durability_audit` (partly) |
| `memory/project_restic_key_mismatch_no_backups.md` | Redis-only tenant keys; recovered via a pre-wipe backup, not lost; my "likely lost" call was wrong | — |
| `memory/feedback_harness_must_model_the_real_failure.md` | A double more forgiving than production turns a real defect green | — |

## Self-gate
8/8 passed — failed: none.
