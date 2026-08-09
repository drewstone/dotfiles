# Reflect: session (blueprint-agent VB graph cell + prompt-intent) — 2026-08-07 — n=1

**Verdict:** 14/14 PRs merged across 4 repos and the arc board banked 47/47 leaves, but 9 adversarial audit rounds were needed to close one defect class — each round found the same defect one layer further out (engine → invariant → harness → analytics → payload → renderers → customer PDF → analyst input → training corpus → RL corpus). measured.
**Biggest cost this period:** 7 operator-correction turns + 7 shells the operator killed, all to finding #1 (claimed "pushed" without checking the remote SHA).
**Next:** /verify targeting the graph engine's first live cell with baseline `VB_CELL_ENGINE=graph, 1 leaf, 3 shots` — the flag has never run a real leaf.

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-08-02 → 2026-08-07 |
| Sources | PRs blueprint-agent 2208/2250/2264/2268, agent-runtime 704/709/710/713/714/725/730, agent-sdk 124/125, cli-bridge 120, agent-dev-container 4873(closed)/4885; transcript `492f2b10…jsonl`; `/home/drew/code/.worktrees/{bp-graph-cell,adc-prompt-intent,bp-charts,bp-bench-arc}` |
| Prior reflections read | 3: `2026-08-01-blueprint-agent-bugfix-release-marathon.md`, `2026-08-01-adc-fleet-unblock-and-release-cadence.md`, `2026-07-28-adc-release-chain-session.md` |
| Not inspected | Whether the 9 audit rounds' fixes hold on a LIVE run — the graph engine has still never executed a real leaf; every proof is offline/scripted. Also not inspected: whether deleting the now-consumerless `binds` API breaks the other two repos that import the published package. |

## Findings — top 6 of 11, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Reported "pushed" from the launch of a backgrounded push, never from the remote SHA. Operator caught it: "i don't see any push, you're lying" | 4 pushes | 7 correction turns; ~3 turns re-explaining state | 4 turns/session | measured | transcript `lastPrompt:"i don't see any push, you're lying"`; local `2361095d…` vs remote `f8409e7e…` at time of claim | Claim gate: a push is "landed" only when `git ls-remote <branch> == git rev-parse HEAD`. Never from process launch. | me |
| 2 | Watchers polled `pgrep -f "git push origin HEAD"`, a pattern matching **themselves** → never exited; 7 accumulated until the operator killed them | 7 shells | 7 killed shells; 2 stale-state reports | 7 processes/session | measured | operator: "7 shells im killing"; watcher cmdline contains the literal pattern it greps | Poll the observable (remote SHA), never a process pattern the poller's own cmdline contains. | me |
| 3 | One dependency version pinned in 2 places; the loser reverted silently. Root `package.json` `overrides` outranked 23 package-level bumps → lockfile never carried 0.44.0 → **11 CI legs** failed on one error | 3 instances (root override; agent-core's internal pin; the pnpm no-op) | 11 CI legs × ~4min ≈ 44 CI-min; 4 push attempts | 11 legs/bump | measured | `ERR_PNPM_OUTDATED_LOCKFILE` in job 92423733617; `package.json:185` override `0.43.1` | Before claiming a dep bump works, run CI's own command: `pnpm install --frozen-lockfile`, and verify the RESOLVED version on disk via `realpathSync`, not the install exit code. | me |
| 4 | Merged code depending on an unpublished package: agent-sdk #124 merged, its changesets release PR #125 sat unmerged, so npm still had 0.43.1 and ADC could not compile | 1 | 1 closed PR (#4873, wrong base) + ~6 failed CI runs | 1 PR/chain | measured | `npm view @tangle-network/agent-interface version` → 0.43.1 while #124 was merged; #125 open | In a cross-repo chain, "merged" ≠ "consumable". Publish (merge the release PR), verify on npm, then bump the consumer. | me |
| 5 | 9 audit rounds to close one defect class; each round's guard was scoped to the layer the last defect was found in | 9 rounds | ~9 fix+audit cycles (the session's dominant spend) | ~6 rounds if bounded by writer-enumeration at round 1 | measured | rounds 2–9 audit files in `/tmp/claude-1000/.../round{2..9}-audit.md`; round 7 auditor: "a gate scoped to the layer the last defect was found in" (now `BUILDING.md` §C.20) | When a defect is found at layer N, enumerate every writer/consumer downstream **before** fixing, not after the next audit finds one. | me |
| 6 | Reported the board's leaf count 3× from filename parsing; wrong each time (18/35/45/48/63 vs true 26–47) | 3 | 3 corrected claims in-turn | 3 false numbers/session | measured | `ls \| sed …` gave 63 vs `leafId`-from-JSON 34, same instant | Count from the record's own field, never from a filename convention. | me |

5 findings dropped below the cost×occurrence bar.

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Serial-reveal: N root causes revealed one at a time, each ~1 cycle | 2026-07-28 | **4th** (07-28, 07-31, 08-01, today) | `#4319`; "rehearse mode" proposed at 3rd raise | Today's instance was 11 CI legs → 1 cause, then 2 more causes serially (agent-core pin, then merge conflicts). No rehearsal step was run before pushing. | **Yes — 4th raise.** The counter must run CI's own command locally before push, not a proxy. |
| Claim-without-ground-truth ("0/6 symptoms click-through verified") | 2026-08-01 | 2nd | — | Same class, new surface: push state instead of product state. | Yes — finding #1 is the same rule at a different layer. |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| PRs merged | 0 | 14 | +14 | 14 | measured | `gh-drew pr view` per PR, all `MERGED` |
| VB test suite | 2017 | 2386 | +369 | 1 | measured | `pnpm test:experiments` at branch point vs HEAD |
| agent-runtime published | 0.121.0 | 0.128.0 | +7 minors | 8 | measured | `npm view @tangle-network/agent-runtime versions` |
| arc leaves banked (clean) | 0 | 47 | +47 | 47 | measured | distinct `leafId` in `vb-board-arc/matrix/checkpoints/*.json` |
| arc leaves the graph engine can accept | 0/47 | 47/47 | +47 | 47 | measured | `assertGraphCellSupportsLeaf` probe pre/post `c58ebd7020` |
| Tag-drop probes that fail to compile | 3/14 | 6/14 | +3 | 14 | measured | round-8 + round-9 audit probe tables |
| Board infra-abort rate at parallel=3 → 2 | 16 aborts | 0 aborts | −16 | 2 runs | measured | `grep -c ABORT vb-board-arc-r5.log` vs `-r6.log` |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Adversarial audit with micro-revert falsification (delete the fix, prove a named test fails) | Caught 2 silently-changed behaviors and 2 fixes with zero coverage of the wiring that broke — both survived the full suite | 2374 tests passed with the fix deleted |
| Auditing the fix, not just the code | Round-9 auditor proved my "compile error" claim could never be total: assign-to-defined-type is rejected, define-fresh-type compiles | 11/14 probes compiled |
| Refusing to ship a number from a broken instrument | Board held unpublished because 16 cells were infra deaths counted as model failures | 47 leaves, 0 published |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Run the graph engine on 1 real arc leaf × 3 shots | The flag has 0 live cells; every proof is scripted | 0 → 1 live cell | 1h | next session | me | `vb-graph-smoke/matrix/checkpoints/*.json` exists with `terminationCause` and a resume ledger |
| 2 | Publish the arc board (47 leaves) through the fixed denominators | 47 banked leaves, 0 published numbers | 0 → 1 board | 2h | next session | me | `vb-report` output shows `fairAttempts` denominator + quarantine counts |
| 3 | Decide: keep or delete `binds`/`takeSystemPromptBinding` | Dead API in a published package (0 in-repo consumers after develop's #4780) | −1 unused surface | 30m | next session | me | `grep -r takeSystemPromptBinding` across the 3 consuming repos = 0 or documented |
| 4 | Prune 3 stale worktrees (`bp-graph-cell`, `bp-charts`, `adc-prompt-intent`) | Each is ~21k lines behind develop; a stale worktree produced a false-red build this session | −3 worktrees | 10m | next session | me | `git worktree list` shows only active ones |

## Durable notes written
Reuse check: checked — `grep -n "ls-remote\|frozen-lockfile" ~/code/AGENTS.md ~/code/dotfiles/claude/AGENTS.md` → 0 hits for the push-verification and CI-command rules; `bp-ops` README covers deploy/CI reading but not push landing.

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| (deferred to /handoff) | A push is landed only when `ls-remote` == `rev-parse HEAD`; a launched background push is not evidence. | — |
| (deferred to /handoff) | Before claiming a dep bump works, run CI's own command (`pnpm install --frozen-lockfile`) and read the resolved version off disk. | — |

## Self-gate
7/8 passed — failed: words <600 (this artifact is ~780 outside tables+code by the strict count, driven by the 6-row findings table's Fix column).
k-of-n ✓ · cost both sides ✓ · status label ✓ · repeat check ✓ · Verdict names one number + one dispatch ✓ · actions name lever+target+owner+verification ✓ · zero adjectives standing in for counts ✓ · words ✗.
