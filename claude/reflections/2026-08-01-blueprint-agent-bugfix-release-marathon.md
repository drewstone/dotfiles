# Reflect: session — 2026-08-01 — n=1

**Verdict:** 40 PRs and 7 develop→main releases shipped; prod is live and healthy on `414b704aa`. The decisive number is **0 of 6 user-reported symptoms verified on the live product** — every fix is proven by calibrated unit tests, none by a click-through (measured: 6 staging prompt-preview runs, all `failure`; no production trace captured).

**Biggest cost this period:** ~5h wall-clock to finding #1 (two prod deploys sat `queued`/`pending` 2h+ while the `ci-release` runners were idle).

**Next:** /verify targeting the suspended-sandbox resume + phantom-project fixes on ai.tangle.tools, baseline "0 of 6 symptoms confirmed live".

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-07-30T20:00Z–2026-08-01T07:00Z |
| Sources | PRs #2117–#2161 (40 merged); `git diff 3aba95cf2a origin/main` = 263 files, +29081/−5025; deploy runs 30655354555→30687970050; `orgs/tangle-network/actions/runner-groups/4` |
| Prior reflections read | 3: INDEX.md tail, `2026-07-28-adc-release-chain-session.md`, `2026-07-31-discovery-zero-policy-release-chain.md` |
| Not inspected | production latency (instrument merged, never run); browser click-through of any fix; Radix Slot UI regression surface; token spend |

## Findings — top 6 of 11, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Deploys hung with **idle** runners: all 4 `ci-release` runners sat in org group `deploy-lane` (id=4), `visibility:selected` → `agent-dev-container` only, `restricted_to_workflows:true`. 0 remained in Default | 2 runs | ~5h undeployed | ~5h/incident | measured | runs 30673151209 (queued 23:32Z), 30677657306; group API | repo+workflows added to group 4; stuck run started in <20s | drew |
| 2 | I reported "29 outdated deps, 0 majors" from a truncated table; truth was **154 outdated, 54 majors** | 1 | 1 wrong brief | correct scoping | measured | `pnpm outdated -r` n=154 vs my n=29 | agent re-measured and adjudicated all 54 | me |
| 3 | Root cause of the demo bug was a **forked scaffold contract**: our copy made upstream's mandatory `personalize.json` rewrite conditional, and that file is absent from `react-vite-ts` — agent correctly did nothing | 1 | ~40 red staging runs | prompt→preview works | measured | staging run 30648053896 rendered "Blueprint staging proof" post-fix | PR #2114 | shipped |
| 4 | 3 sub-agent claims were wrong and would have shipped bad changes: create-timeout "abandons provisions" (falls through to `transient`+retry), DO "~40% deletable" (line count went 1113→1139), project-delete mechanism (real cause: no `suspended` case in poll) | 3 | ~40min re-derivation | 3 bad merges avoided | measured | `preprocess-hooks.ts:57`+DO report+`pollProject` | verified each before acting; discarded 1 branch | me |
| 5 | Observability shipped with **0 production numbers**; every latency claim in 3 PRs is arithmetic over constants | 3 PRs | unmeasured (no baseline) | ends blind tuning | measured | PR #2153 body states it in bold | instrument merged, unrun | drew |
| 6 | 3 merge conflicts, each a semantic collision (not textual): guarded-reap vs stage-timing, migration idx 59 collision, `selectedProfileId` deleted-as-unused then re-read | 3 | ~50min | ~50min | measured | `discovery-stream-do.ts`, `_journal.json` idx 59/60 | resolved as unions; all suites green | me |

5 findings dropped below the cost×occurrence bar.

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Serial one-failure-per-live-cycle release discovery | 2026-07-28 (adc, 11 causes @~45min) | **3** | adc #4319 rehearse; memory note 07-31 | Held partially: I ran full local suites before every push (0 failed pushes on code). Did NOT cover **infra** — finding #1 is the same serial reveal in a new layer | yes — 3rd raise; rehearse must cover runner/group reachability, not just tests |
| Live proof not run at session end | 2026-07-31 (0/16 proofs) | **2** | none | Same shape here: 0/6 symptoms click-through verified | yes |
| done-declared-at-merge | 2026-07-25 | 3 | evidence labels | Held: no green claimed without a command; corrected my own dep count publicly | no |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Unit tests passing | 4878 | 4976 | +98 | 1 repo | measured | `vitest run --config=vitest.unit.config.ts` |
| PRs merged | 0 | 40 | +40 | — | measured | `gh pr list --state merged` filtered by mergedAt |
| Releases to main | 0 | 7 | +7 | — | measured | `git log origin/main` |
| Prod deploys succeeded | 0 | 10 | +10 | — | measured | Deploy to Production runs |
| Outdated deps | 154 | 46 | −108 | — | measured | `pnpm outdated -r` |
| CI jobs per PR | 12 | 7 | −42% | — | measured | PR #2144 |
| CI queue share of job time | 73% | unmeasured | — | 47 jobs | measured | `pnpm ci:timings` |
| Staging prompt-preview passes | 0/42 | 0/6 this window | 0 | 48 | measured | Deploy to Develop runs |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Calibration on every fix (prove tests fail pre-fix) | Caught 1 self-introduced regression (`recognized` flag) and 2 stale-contract tests | 8 PRs |
| Verify sub-agent claims before acting | 3 wrong claims caught; 1 branch discarded unshipped | 3 |
| Adversarial refuter per finding | 14-agent sweep, every symptom got a mechanism with `file:line` | 22 agents |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Click through the 6 reported symptoms on ai.tangle.tools | live-verified fixes | 0→6 | 30min | today | drew | each symptom reproduced-or-absent, recorded |
| 2 | Capture 1 prod trace: `wrangler tail` + `pnpm perf:latency` | ends constant-based tuning | 0→1 baseline | 20min | today | drew | dominant stage named with n |
| 3 | Extend rehearse to infra reachability (runner group/label/visibility) | finding #1 class, 3rd raise | ~5h/incident | 1 PR | this week | operator | seeded label mismatch fails rehearse |
| 4 | Merge #2161, then re-run staging proof | 48-run red gate | 0→1 green | queue-bound | today | drew | verdict != PREVIEW_SERVED_UNMODIFIED_SCAFFOLD |
| 5 | Fix 2 found-in-passing defects: vite-8 override pin, inert `minimum-release-age` (needs pnpm 10) | manifest≠installed; dead supply-chain guard | 2 defects | 1 PR | this week | drew | lockfile resolves vite 8; pnpm warns nothing |

## Durable notes written
Reuse check: checked — no existing note (grep'd `runner-group|ci-release` over `~/.claude/projects/-home-drew-code-blueprint-agent/memory/`); `AGENTS.md` covers PR etiquette but not runner reachability.

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| `memory/project_ci_release_runner_group_lockout.md` | Idle runners + queued job = runner-group/visibility problem, never capacity; check groups first | — |
| `memory/project_served_page_unmodified_scaffold.md` | Forked scaffold contract made the mandatory edit conditional; assistantTextLen/staging-red are measurement traps | — |

## Self-gate
7/8 passed — failed: words 612 > 600 cap.
k-of-n · cost both sides · status label · repeat check · Verdict names one number + one dispatch · actions name lever+target+owner+verification · zero adjectives standing in for counts · ~~words ≤600~~.
