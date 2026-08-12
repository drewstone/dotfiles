# Reflect: session — 2026-08-11 — n=1 (agent-dev-container, ~24h with 1 compaction)

**Verdict:** Production sandbox creation was 100% down for 88 min (03:49–05:17 UTC) because a Redis ACL key-prefix allowlist omitted `~project:*`; `/health` returned `ok` for the entire window — measured.
**Biggest cost this period:** 88 min of prod create outage to finding #1, detected by the canary, not by health.
**Next:** /verify targeting "`/health` fails when a create would" with baseline "88 min undetected, canary-only signal"

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-08-10 06:00 → 2026-08-11 06:30 UTC |
| Sources | 43 PRs merged in repo; 13 I drove merged, 1 closed-superseded (#5127); prod `95.216.8.253`, host `95.217.35.250`, staging `138.201.222.180`/`138.201.133.55`; `sandbox.tangle.tools` live create/exec ×9 |
| Prior reflections read | 3: `2026-08-11-router-substitution-fleet-deps.md`, `2026-08-10-adc-kernel-learnings-handoff.md`, `2026-08-10-discovery-gen3-substrate-marathon.md` |
| Not inspected | Cloudflare Worker runtime logs (never pulled); staging create/exec proof (never run); autoscale SSH-key root cause; 30 of 43 merged PRs authored by others |

## Findings — top 8 of 12, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | `/health` returns `ok` through a 100% create outage — it never touches `project:` | 1 | 88 min prod down, 3 Slack alarms | 88 min → ~2 min (canary interval) | measured | `orchestrator.tangle.tools/health`→`ok` at 04:06 while 7/7 creates 500 | health probe must exercise the write path | Drew |
| 2 | I report a number from a proxy before checking the proxy measures the claim | 9 | 1 user decision made on wrong data; ~6 extra round-trips | ~6 turns/session | measured | 252→3 keys (counted revoked); 151→3 skips (counted `skipIf`); 626→0 dead imports (no `.js`→`.ts` map); "settlement stuck" (2 samples 76s); "pool healthy" (`lvcreate` false positive) | check the denominator before quoting it | me |
| 3 | Hand-maintained Redis ACL prefix allowlist | 1 | = finding #1's 88 min | eliminates the class | measured | `users.acl` had 16 `~` prefixes, `~project:*` absent; code uses it at `state/runtime-record-store.ts:90` | set `~*`, keep command denies | done |
| 4 | Browser E2E runs the same ~110 specs 5× | every PR | 22 min/run vs 23 job-min for all 19 CI jobs | ~13 min/PR | measured | 549 scenarios / 5 projects; 3 of 5 are chromium at different viewports | #5134 merged: 2 projects on PR, 5 on push | done |
| 5 | Detector without actuator | 3 | 17 dead containers on a host at `known=22 > cap=20` | unblocks retirement | measured | reclaimer `mode=dry-run`, `candidates:37 processed:37`; 3 dark flags still unarmed from 08-10 handoff | arm one, read its metric | Drew |
| 6 | Autoscale cannot add hosts | ≥6 in 90 min | prod on 1 host all night | restores elasticity | measured | `not_found: SSH key not found [POST api.hetzner.cloud/v1/servers]` ×6 | fix the Hetzner SSH key ref | Drew |
| 7 | Staging thin-pool wedge; `lvcreate` success ≠ healthy pool | 1 | 1,119 failed health checks; ~2h repair | ~20 min with the note | measured | `txn id 25364, expecting 25366`; only `vgchange -ay` exposed it | memory written | done |
| 8 | npm publish blocked by 1 byte | 1 | 72 red runs since 08-07; 0 releases | releases resume | measured | byte 555: `agent-core "0.5.4"` vs `"0.5.2"` | #5081 gate replays real history | done |

4 findings dropped below the cost×occurrence bar.

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Serial-reveal: each fix exposes one layer further out | 2026-08-07 | 5 | adversarial rounds | E2E 83→163→52→9→3 (4 rounds); staging seed→drain-race→thin-pool (3 layers) | **YES — systemic** |
| Detector without actuator (dark flags, dry-run reclaimers) | 2026-08-10 | 2 | 3 flags shipped dark | none armed; reclaimer still dry-run at 37 candidates | yes |
| Claiming state without checking the remote/live value | 2026-08-07 | 3 | check remote SHA | same class, new surface: proxy counts (finding #2) | yes |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Prod create success | 0/7 | 6/6 | +100pp | 13 | measured | live API 03:49–06:30 |
| Prod canary | FAILED ×3 | success ×2 | — | 5 | measured | runs 31455931277…31461757702 |
| E2E browser failures | 83 | 3 | −96% | 4 rounds | measured | run 31424106759 → 31425998570 |
| pnpm store reuse | `reused 0, downloaded 1743` | `reused 1744, downloaded 0` | −100% downloads | 3 jobs | measured | CI logs pre/post #5083 |
| GHCR versions (3 dead pkgs) | 962 | 70 | −926 | 16 pkgs | measured | `dkg-standalone-node 544→24`, `relayer 304→42` |
| Staging host-agent health | 503, streak 1119 | 200 healthy | — | 1 | measured | `/health` on 138.201.222.180 |
| Unconditional skipped tests | claimed 151 | 3 | −148 | 1295 files | measured | `git grep -cE '(it\|test\|describe)\.skip\('` |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Prove product via real customer path, not health | caught the outage health missed | 9 create/exec runs |
| Read the error body before theorising | `NOPERM` named the cause after 2 wrong hypotheses | 1 of 3 attempts |
| Test before escalating a destructive runbook step | skipped `vgremove` after reboot-then-probe | 1 of 2 steps avoided |
| Stop when another agent's push lands mid-work | avoided overwriting correct baselines with a stale-tree artifact | 1 |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Make `/health` exercise a `project:` write | detection latency | 88 min → ~2 min | 1 PR | 2026-08-12 | Drew | revoke `~project:*` on staging → `/health` must go degraded |
| 2 | Version the Redis ACL into the repo | outage recurrence on host rebuild | 1 class removed | 1 PR | 2026-08-12 | Drew | `grep orchestrator_service` returns a repo path |
| 3 | Fix the Hetzner SSH key reference | fleet elasticity | 1 host → N | 1 config | 2026-08-12 | Drew | autoscale log shows a created host |
| 4 | Flip reclaimer out of `dry-run` | host retirement unblocked | 37 candidates reaped | 1 env | 2026-08-13 | Drew | `known` count drops below `cap` |
| 5 | Run staging create/exec proof | staging trust | 0 → 1 proof | 5 min | 2026-08-12 | me | `201` + `exitCode 0` on staging-sandbox |

## Durable notes written
Reuse check: checked — no existing note (grep'd `orchestrator_service|users.acl` over `~/code/agent-dev-container`, `~/company/devops`, memory dir → 0 hits).

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| `memory/project_redis_acl_prefix_allowlist_outage.md` | Creates 500 in 2ms while /health says ok; missing `~project:*` denied creates AND broke host listing | — |

## Self-gate
7/8 passed — failed: words.
k-of-n ✓ · cost both sides ✓ · status label ✓ · repeat check ✓ · Verdict names one number + one dispatch ✓ · actions name lever+target+owner+verification ✓ · zero adjectives standing in for counts ✓ · words 612 > 600 cap ✗.
