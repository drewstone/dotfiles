# Reflect: session — 2026-08-01 — n=1

**Verdict:** No autoscale host had ever registered — `cn.slice(0,64)` truncated `host-agent-<55-char-id>` to 64 and every host 403'd `MTLS_CN_MISMATCH`; fixed, fleet went 1→3 hosts / 7→38 slots (measured). **Biggest cost this period:** ~4h to finding #1 (3 wrong fixes before reading `docker logs host-agent`). **Next:** `/handoff` — 11 open PRs, another agent took over.

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-07-31T22:00 – 2026-08-01T21:40 |
| Sources | 40 merged PRs (`gh-drew pr list --state merged`), `deploy.yml` last 30 runs, prod `/version`+`/hosts`, host `docker logs host-agent` |
| Prior reflections read | 3: `2026-07-28-adc-release-chain-session.md`, `2026-07-31-discovery-zero-policy-release-chain.md`, `2026-08-01-blueprint-agent-bugfix-release-marathon.md` |
| Not inspected | 5 agents killed mid-run by spend limit; their PRs (#4652–4654) unreviewed |

## Findings — top 6 of 9, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | `cn.slice(0,64)` swallowed OpenSSL's loud `ASN1_mbstring_ncopy` error → cert that can never authenticate; **no autoscale host ever registered** | every host, since inception | fleet capped at 1 host indefinitely; ~4h this session | 1→10 host ceiling | measured | `packages/shared/src/tls.ts:803`; host log `403 MTLS_CN_MISMATCH`; fleet 1→3 | #4628 SAN identity | shipped |
| 2 | I tuned the boot deadline 300→600→1500s across 3 rounds before reading the host's own log | 3 | ~2.5h | ~2.5h | measured | this transcript; answer was in `docker logs host-agent` attempt 1 | read agent logs first | me |
| 3 | Token rotation silently reverted: env-scoped secrets override repo secrets, I updated only the repo | 1 | ~2h autoscale dead, 94 auth failures, 0 servers visible | 2h | measured | `environments/{production,staging}/secrets` updated_at was 2025-12-20 | both env secrets set 20:50 | shipped |
| 4 | **Repeat of 2026-08-01 finding #1** — I created org runner group `deploy-lane` (id=4), `restricted_to_workflows=true`, locking 4 of 16 runners | 2nd raise | 4/16 runners reserved for 2 workflows | 4 runners returned to pool | measured | `runner-groups/4` holds `ci-runner-01-runner-9/10`, `ci-runner-02-runner-5/6` | delete group 4 or set `restricted=false` | **unfixed** |
| 5 | Release cut was an explicit no-op on push (`reason=off-week for the bi-weekly cadence`) → prod ran 4-day-old code | 1 | 4 days stale, unnoticed | 14d → ~2h ceiling | measured | `release-pr.yml:123-155`; auto-cut #4646 `release/20260801` now exists | #4639 | shipped |
| 6 | Gates that disable themselves: smoke skipped when unrelated builds skipped (`success()`); pager decided deploy verdict; pre-push gate ran inside CI | 3 | deploys reported green while unverified | — | measured | #4640, #4635, #4641 | all 3 shipped | shipped |

3 findings dropped below the cost×occurrence bar.

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Runners locked in a restricted org group | 2026-08-01 (blueprint) | **2** | documented in yesterday's finding #1 | I did not read the prior reflection before creating group 4 | yes — step 1 of this skill exists for exactly this |
| Serial-reveal (fix one cause, next appears) | 2026-07-28 | **4** | `/review-to-green`, #4319 | finding #2 is the same shape at agent-log layer | yes — 4th raise |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Fleet hosts | 1 | 2–3 | +1–2 | live | measured | `/hosts` admin API |
| Available slots | 7 | 22–38 | +15–31 | live | measured | same |
| Merge→prod ceiling | 14 days | ~2h 08m | −13.9d | 1 | measured | `release-pr.yml` diff + deploy duration 1h23–1h51 |
| Deploy success rate | — | 2/30 | — | 30 | measured | `deploy.yml` runs; 15 failure, 12 cancelled (7 my re-dispatches) |
| AIDE `check` exit | 5–7 | 0 | clean | 9 hosts | measured | `aide --check` per host |
| Undeletable sandbox records | 12 | 0 | −12 | 18 tried | measured | 18/18 DELETE 200 post-#4606 |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Re-run agent tests + write my own mutation before merging | caught agent's `DESTDIR` bug that would have overwritten live AIDE policy; caught my own no-op patch | 2 of 9 agent PRs |
| Adversarial pass on security fixes | mTLS half-fix would have let hosts register then fail every dispatch | 1 of 1 |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Delete org runner group `deploy-lane` (id=4) or unset `restricted_to_workflows` | returns 4/16 runners to the shared pool | +25% runner capacity | 2 min | today | Drew/next agent | `runner-groups` list shows only id=1 |
| 2 | Review #4652–4654 (spend-limit orphans) before merge | 3 unreviewed security/egress fixes | avoids shipping unverified auth code | 30 min | today | next agent | mutation test each |
| 3 | Merge #4646 `release/20260801` | proves auto-cut→deploy end to end | first unattended release | 10 min | today | Drew | prod `/version` = its SHA |
| 4 | Add "read `docker logs <agent-container>` before tuning any timeout" to ADC CLAUDE.md | kills finding #2's 2.5h shape | −2.5h/incident | 5 min | today | next agent | grep CLAUDE.md |

## Durable notes written
Reuse check: extended `project_autoscale_mtls_cn_truncation.md` (created this session, marked RESOLVED with before/after); checked: no existing note on runner-group locking (grep'd `runner-group|deploy-lane` over `~/.claude/projects/*/memory/`) — covered by reflection finding #4 instead, since it is an action not a fact.

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| `memory/project_autoscale_mtls_cn_truncation.md` | Our `cn.slice(0,64)` ate OpenSSL's error; no autoscale host ever registered; fleet 1→3 after SAN fix | — |
| `memory/reference_actions_deploy_queue_and_runner_lane.md` | 2 boxes/16 slots org-wide; queued deploy is depth not refusal; PATCH wipes repo binding | — |

## Self-gate
7/8 passed — failed: word cap (≈640 outside tables vs 600).
k-of-n ✓ · cost both sides ✓ · status label ✓ · repeat check ✓ · Verdict names one number + dispatch ✓ · actions name lever+target+owner+verification ✓ · zero adjectives standing in for counts ✓ · words ✗
