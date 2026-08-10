# Reflect: session — 2026-08-08 — n=1

**Verdict:** The custody question is settled and decomposed (measured): one frozen note = 10/20 verified wins at 1.19 wins/$, live manager = 15/20 at 0.48–0.58, bare fleet = 1/20 at 0.17 — all three arms independently re-scored, 0 mismatches. 3 PRs merged, an instrument defect (tolerance inside thread-dependent float noise) fixed with 0/31 verdicts moved.
**Biggest cost this period:** ~35 min to findings #1+#2 (wrong-tree launch + cwd drift), both from one root: the working tree is shared mutable state between PR work and run launches.
**Next:** /discovery-lead targeting the qLDPC-decoder domain admission gate with baseline = the §3 instrument-validation protocol from this session's strategy answer.

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1 (55ca45cc), 2026-08-07T22:30Z–08-08T01:15Z |
| Sources | this transcript; `traces analyze --session 55ca45cc` → `.agent/traces-55ca45cc.md`; PRs #76 #77 #78 (gh-drew); `.agent/pursuit/qopt-T3-20260807*`; `.agent/rescore-verify/*`; gist 4c66597d |
| Prior reflections read | 3: 2026-08-07-supervisor-lab-first-supervisor-run, 2026-08-07-vb-graph-cell-nine-round-audit, 2026-08-06-discovery-lab-evolution-campaign |
| Not inspected | LLM analysts on this session (deterministic pass only); the 12 autopsy subagent transcripts (their outputs were adversarially verified instead, 12 claims → 11 confirmed 1 refuted) |

## Findings — top 5 of 8, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Paid run launched from the wrong git tree (docs branch, post-merge) — refused only by *luck* (old arg validation), not by the digest gate, which lives inside the runner the wrong tree didn't have | 1 | ~10 min, $0 (fail-closed by accident) | a mis-run arm ($8+) next time | measured | task bxn8gfkud output: `QOPT_SUP_ARM must be S or T2, got "T3"` at 00:11Z; correct relaunch 00:14Z after digest re-verify | launcher must assert branch+digests BEFORE dispatch, outside the runner | me |
| 2 | Shell cwd drift (`cd bench/qopt` persisting) broke 6 commands and invalidated 1 background suite run (killed, rerun) | 7 | ~20 min | ~20 min/session | measured | `compared 0` glob failure; `wc: profiles/... No such file`; killed task bw4gx3rnh | absolute paths in every compound command; never `cd` in a call that outlives itself | me |
| 3 | `/tmp` session scratchpad reaped mid-session; re-score outputs and digest chunks lost, redone into `.agent/` | 1 | ~10 min CPU redo | any multi-hour artifact | measured | `ls scratchpad/rescore/ → No such file` at ~23:30Z after successful writes ~22:50Z | durable intermediates go to `.agent/` from the start (memory written) | me |
| 4 | A gating command piped to `tail` reports the pipe's exit, not the gate's — "exit 0" proved nothing; green proven only via `.pytest_cache/lastfailed == {}` | 2 | ~15 min + one weaker proof | a false-green merge | measured | task b9kbvkf1k: `pytest -q \| tail -1 && …` chain | never pipe a gate; `pipefail` or write summary to file | me |
| 5 | Waited ~25 min of watchers for a #76 re-review that never came; the bot reviews on open, not reliably on push | 1 | ~25 min wall (parallelized, ~5 min real) | decision latency/PR | measured | reviews list: last verdict 22:48Z, fix pushed 23:35Z, no re-run by 00:00Z | post-fix policy: verify locally (suites + findings addressed), merge; bot is advisory | me |

3 findings dropped below the bar (journal `result`-field misread, 5 min self-caught; gh merge raced its own push, 10 s; chart label collisions caught by mandated render-and-look pass).

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Failed call → same-tool retry (analyzer: 11/11 this session, upper bound incl. legitimate state-changed retries) | 08-07 | 3 | "produce new state first" rule banked | rule is untracked at call time; several retries DID change state but the metric can't see it | yes — instrument it (retry-with-state marker) before raising again |
| 0% skill invocation | 08-07 | 2 | invoke-or-state-why rule | improved, not fixed: 1 explicit invocation (dataviz) + 2 skills this close vs 0 last session | no — trending right |
| Promotion-by-copy (deepswe runlog) | 08-05 | 3 | migrate-and-delete | untouched this session (out of scope) | yes — it is action #1 stale for 2 sessions |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Verified-improved circuits, note-only arm | — | 10/20 (6 beyond spread) | new | 20 | measured | my re-score `.agent/rescore-verify/t3-rescore.json` |
| Wins per dollar (note / manager / bare) | 0.48–0.58 / 0.17 | 1.19 / 0.48–0.58 / 0.17 | note 2× manager | 3 arms | measured | budgets + re-scores |
| Delivery rate (note arm) | 10–79% | 95% (19/20) | +16pp over best managed | 20 | measured | verdict.json count |
| Verdicts changed by instrument correction | — | 0/31 | — | 31 | measured | old-vs-new field diff |
| PRs merged (content verified on main) | 0 | 3 (#76 #77 #78) | +3 | 3 | measured | `git ls-tree origin/main` |
| Claim mismatches, all arms cumulative | 0/104 | 0/124 | +20 clean | 124 | measured | verdict.json sweep |
| Autopsy claims surviving adversarial check | — | 11/12 (1 refuted pre-commit) | — | 12 | measured | workflow wf_c13cdc1b verdicts |
| Subagent spend, both workflows | — | 1.24M tokens, 16 agents | — | 16 | measured | workflow usage blocks |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Adversarial verify before committing synthesis | caught the stop-call mis-attribution (C11) | 1/12 refuted |
| Independent full re-score before any headline | replicated 15/20, 1/20, 10/20 exactly; also proved 0/31 under the new instrument | 3 arms, 0 diffs |
| Smoke gate with a mechanism check (note present in prompts) before paid spend | 2/2 prompts verified, then 20/20 | $0.94 gate |
| Registered decision bands before the arm | T3 verdict read off the prereg, no post-hoc judgment | 1 prereg, same-day settle |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Migrate deepswe onto `src/pursuit/runlog`, delete the copy (3rd raise) | promotion-by-copy | 2 runlogs → 1 | ~2h | next session | me | `git ls-files bench/deepswe/runlog.ts` empty |
| 2 | Write the domain-admission gate + instrument-validation protocol doc (red-team arm, cross-env noise floor, dual-blind checker) | opens agent-built domains | 1 reusable gate | ~2h | next session | me | doc merged; qLDPC domain admitted through it |
| 3 | Pre-dispatch branch/digest assertion OUTSIDE the runner | wrong-tree launches | luck → designed refusal | ~1h | before next paid run | me | launch from wrong branch refuses with named reason |
| 4 | Transfer test: the frozen note on unseen circuits | the one unearned claim | note transfer measured | ~$10 | after gate doc | me | new prereg, fresh circuit set |
| 5 | Runner: in-flight bills can exceed the ceiling (5.1% overage) | budget honesty | overage → 0 or declared wave-reserve | ~1h | with #3 | me | T-arm at ceiling ends ≤ ceiling |

## Durable notes written
Reuse check: checked `harness-in-substrate-from-run-1.md`, `run-the-analyzer-before-reporting.md`, MEMORY.md (grep'd 'scratchpad|/tmp|cwd' over memory dir) — no existing note covers scratchpad reaping; cwd-drift folded into the same note; `supervisor-custodial-first-win.md` already extended earlier this session with the T3 decomposition.

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| memory/durable-state-outlives-the-scratchpad.md | /tmp scratchpad was reaped mid-session; cwd drifts across calls — durable intermediates in `.agent/`, absolute paths always | — |

## Self-gate
8/8 passed — failed: none.
