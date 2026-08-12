# Reflect: session — 2026-08-11 — n=1

**Verdict:** The router answered requests with a model the caller never named — `gpt-5.5` returned HTTP 200 carrying `body.model: gemini-2.5-flash` — and both checks a product would run (catalog listing, status code) read clean; substitution is now opt-in and production proves it (`409 model_substitution_refused`, measured post-deploy). measured.
**Biggest cost this period:** 7 consecutive failed deploys (2026-08-08 → 2026-08-10, production 6 days behind `main`) to finding #2.
**Next:** /handoff targeting the 3 dead upstream accounts with baseline 3 of 6 current-generation model families unusable.

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-08-09T02:46Z – 2026-08-11T06:27Z, 11 user turns, 2,566 transcript records |
| Sources | session `c05cc4cb-6492-4c1c-8352-5f57f45494ae`; 12 PRs (agent-app #409–411, agent-integrations #264–266, gtm #797–798, physim #106, legal #360, workcomp #24, relationships #30, router #343–346); `gh-drew run list --workflow "Deploy to Hetzner"`; `~/.local/state/model-freshness/latest.log` |
| Prior reflections read | 3: `2026-08-10-discovery-postcompact-instrument-recovery.md`, `2026-08-10-discovery-gen3-substrate-marathon.md`, `2026-08-08-supervisor-lab-killtest-session.md` |
| Not inspected | Router e2e/browser suites (unit only, 3,590 pass); other agents' 30+ concurrent PRs in the same repos; whether products beyond the 6 scanned declare model ids |

## Findings — top 7 of 9, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Router substituted a model the caller never named, at 200, billed | fleet-wide; 2 gtm ids measured | 1 wrong product default merged (gtm #798 shipped `gpt-5.5`) + unmeasured (customer-visible wrong-model answers, no attribution) | class eliminated | measured (`X-Tangle-Failover: from=gpt-5.5; to=google/gemini-2.5-flash; trigger=provider_quota_exhausted`) | router #344: injection requires `allow_fallbacks: true` | done |
| 2 | Deploy gate had never passed since it landed 2026-08-08 | 7 runs | 6 days stale prod; 4 merged fixes stranded | 3/3 deploys green after | measured (deploy history 0/7 → 3/3; gate body `free_tier_limit`) | #345 entitled smoke ids, #346 accept labeled 402 | done |
| 3 | "In catalog + HTTP 200" taken as liveness; served-model never compared | 1 decision, 13 ids | 1 merged PR with a wrong default, corrected next turn | class eliminated | measured (`gpt-5.5` 200 → `body.model gemini-2.5-flash`) | `model-freshness` compares answered vs requested; daily local cron | done |
| 4 | 3 upstream accounts broken; all three reported as one message | 3 providers | 3 of 6 current-gen families unusable (`gpt-5.6-*`, `kimi-k3`, `deepseek-v4-flash`) | causes separable in one curl | measured (OpenAI "enforced spend limit"; Moonshot "Incorrect API key"; DeepSeek "Authentication Fails") | router #343 typed cause + `X-Tangle-Failure-Category` | drew (accounts) |
| 5 | A literal `await import()` is still a bundler edge — first integrations fix insufficient | 1 | 1 extra publish cycle (0.53.42 → 0.53.43) | caught pre-publish next time | measured (legal build failed on published 0.53.42; patched install → `✓ built in 4.86s`) | opaque runtime specifier + guard test that also fails on a literal | done |
| 6 | Nearly shipped a duplicate module — `terminal-failure.ts` written before finding `describeExhaustedPlan` merged 30 min earlier | 1 | ~1 module authored and deleted | — | measured (router #342 merged 21:26; my branch deleted, extended theirs in #343) | none shipped; rule already exists (below) | claude |
| 7 | Two read errors from my own tooling: grep missed tsc's ANSI codes ("0 errors" vs 7); `npm view <unpublished>` empty read as "no dep" | 2 | both caught in-session; 1 wasted install cycle | — | measured (7 errors surfaced by hermetic gate; 0.53.31 never published, 0.53.30 was the answer) | read exit codes, not greps; list versions before pinning | claude |

2 findings dropped below the cost×occurrence bar.

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Instrument/measurement defect voids a conclusion (here: #3, #7) | 2026-08-10 postcompact (its 4th raise) | 6 | fail-closed gates at kb intake | Those gates are in the discovery stack; this session's instrument was ad-hoc bash in a different repo — the class is unowned outside discovery | **Yes** — the only durable answer so far is a *tool* (`model-freshness`), not a rule |
| Reconcile before create (#6) | 2026-08-10 gen3 #5 | 3 | rule in `~/code/AGENTS.md:40` | Rule was followed for skills/docs, not for a module inside someone else's in-flight PR window | Yes — check open PRs merged in the last hour, not just the tree |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Router deploys green | 0/7 | 3/3 | +3 | 10 | measured | `gh-drew run list --workflow "Deploy to Hetzner"` |
| `gpt-5.5` request outcome | 200 as `gemini-2.5-flash` | 409 `model_substitution_refused` | class fixed | 1 | measured | live curl post-deploy |
| Router unit tests | 3,589 | 3,590 | +1 | 225 files | measured | `npx vitest run tests/unit/` |
| Products on published-latest agent-app | 1/6 | 6/6 | +5 | 6 | measured | per-repo `package.json` after merges |
| Fleet worktrees on disk | 43 | 32 | −11 | 11 | measured | `git worktree list` before/after |
| gtm composer thinking pill | 54px / 3 lines | 36px / 1 line | −18px | 1 | measured | Chromium `getBoundingClientRect` |
| Harness effort rungs offered (kimi-code) | 8 | 3 | −5 | 5 harnesses | measured | browser read of the live control |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Verify in the published artifact, not the release status | `npm view` said 0.45.39 while 0.45.40 was live; tarball unpack settled it | 3 tarball checks |
| Break the test before claiming it passes | Every new gate went red first (`expected 2 to be +0`; `statically imports ssh2-sftp-client`) | 5 of 5 |
| Drive the real browser for UI claims | jsdom said "renders"; Chromium found the wrap and the full meter on `Auto` | 2 defects |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Rotate `MOONSHOT_API_KEY` + `DEEPSEEK_API_KEY`, lift the OpenAI spend cap | usable current-gen model families | 3 → 6 | ~30 min | 2026-08-11 | drew | `model-freshness` shows 0 `DEAD` rows for those ids |
| 2 | Add "last successful deploy age" to the daily local cron | red-deploy detection latency | 6 days → 1 day | ~1 h | 2026-08-12 | claude | cron output names any repo with no green deploy in 48 h |
| 3 | Fix fleet defaults with the tool (gtm → `gemini-3.6-flash`; drop the 2 OpenAI ids) | products running a model they did not choose | 4 products stale → 0 | ~2 h | 2026-08-12 | claude | `model-freshness` exits 0 |
| 4 | Extend `worker-safe-subpaths` from native clients to any Node-only module | Worker consumers blocked on integrations | legal unpins from `^0.52.0` | ~2 h | 2026-08-13 | claude | agent-integrations #267 closes; legal builds on latest |

## Durable notes written
Reuse check: "checked: no existing note (grep'd `served.model|substitut` over `~/.claude/projects/-home-drew-code/memory/`)" for the account state. The measurement rule itself is already owned by `claude/skills/model-freshness/SKILL.md` — cited, not duplicated. "Reconcile before create" already exists at `~/code/AGENTS.md:40` — cited, not duplicated.

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| `memory/router-upstream-accounts-broken.md` | 3 upstream accounts dead/capped: OpenAI spend limit, Moonshot + DeepSeek keys invalid — 3 of 6 current families unusable | — |

## Self-gate
8/8 passed — failed: none.
k-of-n · cost both sides · status label · repeat check · Verdict names one number + one dispatch · actions name lever+target+owner+verification · zero adjectives standing in for counts · words 512 ≤ 600.
