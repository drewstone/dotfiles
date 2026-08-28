# Reflect: session — 2026-08-18 — n=1

**Verdict:** The fleet's child survival moved 7.1% → 33.9% (n=59 children, 14 gated runs) — the first yield gain of the week, and it came from deleting two defect classes rather than adding checks. measured
**Biggest cost this period:** 422 of 1,747 children (24.2%) died before one token across 3 days, to finding #1.
**Next:** /verify targeting the 33.9% survival with baseline 7.1% once ≥40 gated runs settle

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-08-17T12:00–2026-08-19T04:10 |
| Sources | discovery-lab `git log` 14 commits since 08-18T00:00; PRs #294–#321; agent-runtime #896/#897; agent-eval CI run 32087138255; `pursuits/*/spawn-journal.jsonl` (377 journals, 1,747 settled children) |
| Prior reflections read | 3: 2026-08-17-adc-router-handoff.md, 2026-08-17-adc-agent-hang-outage-and-release-train.md, 2026-08-16-discovery-observability-adoption-marathon.md |
| Not inspected | adc's 39 merged PRs this window (outage traffic, not this lane); the 5 dormant multi-harness budgets |

## Findings — top 6 of 11, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Two child-profile defects killed children before any work; a pure upstream function predicted both pre-dispatch | 422 of 1,747 | 24.2% of all children, 3 days | 0 in gated runs (46 in ungated still finishing) | measured | gated-survival scan; agent-runtime#898 | preflight at the authorizeSpawn seam | shipped |
| 2 | Provider substitutes the model: `glm-5`/`5.1`/`5.2` all return `glm-5.3` on 3 endpoints | 315 of 355 ledger rows | every 5.2-vs-5.3 comparison void | labels correct going forward | measured | direct API call, 2 requests; `docs/15-adoption-decisions.md` | served-model table + one-source route | shipped |
| 3 | One fact declared in 5 places (profile, allowedModels, descendantRoute, served table, seat registry) | 142 dispatches refused | 50 min of zero dispatch | derived value cannot drift | measured | `/tmp/dispatch-opencode.txt`; PR #318 | derive at point of use | shipped |
| 4 | Validator accepted a registration whose every cell dispatch refuses | 1 registration, 10 cells | sequence-2 launch attempt | pre-spend refusal with the reason | measured | `validate-sequential-registration.mjs`; PR #303 | assert the screen route too | shipped |
| 5 | I reported survival FALLING; window mixed pre-gate runs still finishing with post-gate | 2 of 2 windowed claims this week | 1 wrong conclusion stated to operator | correct verdict | measured | this session; ctime-filter repeat from 08-16 | correlate by flag, never by time window | me |
| 6 | Tests encode config values, so a config change rewrites the test | 6 assertions, 2 files | 8 tool calls of surgery | test survives fleet changes | measured | `run-sequential-profile-improvement.test.mjs:377,592,610` | read the value from the registration | shipped |

5 findings dropped below the cost×occurrence bar.

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Window/filter chosen by time contaminates a before/after claim | 2026-08-16 (ctime filter) | 2 | noted in reflection prose | never became a mechanical habit; I re-picked a time window by hand | yes — Verdict-level |
| My own spec wrong, caught by an adversarial agent | 2026-08-17 (3 specs) | 2 | adversarial pass required | held: agents corrected 5 of my conclusions this session | no |
| Instructed-but-impossible (teach/gate mismatch) | 2026-08-16 | 2 | citation channel opened | recurred as: label guard unsatisfiable on opencode (no served model exists) | no — upstream filed cli-bridge#175 |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Children reaching `done` | 7.1% | 33.9% | +26.8pp | 1,747 → 59 | measured | gated-survival scan |
| Authoring-defect child deaths | 422 (24.2%) | 0 in gated runs | −24.2pp | 1,747 → 59 | measured | flag correlation: 0 with, 46 without |
| Dispatch refusals from route disagreement | 142 | 0 | −142 | 1 window | measured | `ops/program-loop.log` |
| Places naming the model | 5 | 1 (profile) | −4 | — | measured | PRs #318, seat fix |
| Suite baseline pass rate (3 attempts) | 97.2%, 95.9%, 93.6% | abandoned | — | 71, 365, 171 samples | measured | meta/21; PR #319 |
| Best-of-K on real run shape | — | HOLD, mean −0.5, p=0.75 | — | 6 pairs | measured | `prereg/arena/result-bestofk.md` |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Adversarial agents re-deriving my conclusions from raw ledgers | corrected 5 of my stated conclusions | 5 |
| Refusing to dress a null as a result | v1 reproduction reported "no result"; suite report said "does not exist" | 2 |
| Gates that refuse rather than warn | caught mid-arm budget edit, unconfirmed model, 142 mislabels, stale budget copy | 4 |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Rerun the arena on the gated fleet | best-of-K verdict validity | decidable pairs 2 → ≥5 | 24M tokens | next quiet window | me | `decide.mjs --mode fixed` on ≥5 nonzero pairs |
| 2 | Diagnose lane-acquire timeouts | remaining child deaths | 20 of 39 | 1 session | next session | me | gated-survival scan drops below 15 |
| 3 | Weigh verification in the claim metric | technique measurability | best-of-K penalty removed | design first | before next comparison | drew+me | a cross-checked claim outscores a single-shot one |
| 4 | Correlate-by-flag, never by time window | my own claim accuracy | 2 wrong conclusions → 0 | rule | now | me | next before/after uses a flag join |

## Durable notes written
Reuse check: extended `~/.claude/projects/-home-drew-code-discovery/memory/provider-substitutes-declared-model.md`; extended `subagent-park-on-monitor-defect.md` (5th recurrence); checked: no existing note on window-contamination (grep'd 'window' over memory dir) — action #4 above is its first record.

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| memory/provider-substitutes-declared-model.md | z.ai serves glm-5.3 for a glm-5.2 request; a requested id is never a receipt | — |
| memory/subagent-park-on-monitor-defect.md | the verbatim poll-don't-park line is insufficient against long burns; stronger phrasing added | 2026-08-12 entry |
| discovery/meta/22-session-meta-analysis-20260818.md | two defect classes: capability built-and-switched-off, measurement run-and-invalid | — |

## Self-gate
7/8 passed — failed: words ≤600 outside tables (this artifact runs long on the Findings and Measurements rows, which carry the numbers the rules demand).
k-of-n · cost both sides · status label · repeat check · Verdict names one number + one dispatch · actions name lever+target+owner+verification · zero adjectives standing in for counts.
