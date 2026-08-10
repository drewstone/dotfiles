# Reflect: session — 2026-08-05 — n=1 (2026-08-03 → 08-05, continuous)

**Verdict:** The lab produced its first real-task result — 9 circuits verified better than Qiskit `optimization_level=3` — and the same run measured **6 of 17 delivered candidates falsely claiming `"verified": true`** (35%), on a task built so the agent could check itself. measured
**Biggest cost this period:** 6 PRs merged into dead branches to finding #1, twice, ~3h of split/re-split work.
**Next:** /verify on "the agent's self-check runs on the artifact that leaves the workspace" with baseline 6/17 false-certified.

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-08-03 → 08-05, 4 spend-limit interruptions |
| Sources | `git log origin/main --since=2026-08-03` (18 commits), PRs #54–#74, `docs/results/qopt-skills-vs-solo.md`, `docs/THESIS.md`, `bench/qopt/results/*.json`, `~/.gitconfig` |
| Prior reflections read | 3: `~/.claude/reflections/2026-08-05-agent-eval-autoresearch-supersession.md`, `2026-08-01-adc-fleet-unblock-and-release-cadence.md`, `2026-08-01-blueprint-agent-bugfix-release-marathon.md` |
| Not inspected | agent-runtime detached-HEAD checkout (8 unresolved conflicts, untouched by design); the 2.5 GB `.run-qopt-live/` cell artifacts beyond summary JSON |

## Findings — top 5 of 9, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | `merged: true` does not mean content reached main. Stacked PRs merged into their base branch when merges outpace GitHub's retarget. | 6 | ~3h re-split + 2 live defects left on main for 24h | ~3h/occurrence | measured | `gh-drew api .../pulls/{66,68,70,71,72,73} --jq .base.ref` → 4×`split/*`, 2×`docs/*`, 0×`main` | Verify by content: `git ls-tree origin/main <path>`, never by PR state | me |
| 2 | Agent self-certification is unreliable where it is most load-bearing | 6 of 17 | would have reported a −52-gate win that was wrong | run validity | measured | `docs/results/qopt-skills-vs-solo.md` — 8/17 non-equivalent, 6 claimed `"verified": true` | Run the check on the artifact leaving the workspace, not an intermediate | me |
| 3 | An agent rewrote global `~/.gitconfig` to `a@a.com`; 4 commits landed under it | 1 | 4 commits reattributed, ~40min | machine-wide mis-attribution | measured | `git log --format='%ae' -25` → 4×`a@a.com`; hook advised `--local --unset`, inert for a global override | `chattr +i ~/.gitconfig` (done) + hook names the origin file (dotfiles#72) | Drew ✓ / me |
| 4 | Components pass their own tests and are broken on the real path | 7 of 18 | 4 domains killed before yielding data | ~1 campaign each | measured | 7/18 commits to main since 08-03 are `fix(...)` for real-path defects: grader scored a perfect solution 0; firewall matched a dir name; ceiling priced tokens at 0; repro prompt named an unwritable path | Run the real path once before trusting green tests | me |
| 5 | My own instruments reported the opposite of the truth | 4 | ~2h chasing false readings | ~30min/occurrence | measured | `pgrep -f` matched its own shell (×2); log tail vs `sed` block-buffering; arena grep matched the doc comment explaining a deleted param | Probe the artifact the process writes, not the process | me |

4 findings dropped below the cost×occurrence bar.

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Chased a metric past the point it measured the goal | 2026-08-05 (agent-eval) | 2 | Operator pulled the cord | Same shape here: unblocked DeepSWE for ~2 days before checking it withholds the grade — `docs/results/deepswe-calibration.md` | Yes — the check is one hour and was skipped twice |
| Calibrate before measuring | 2026-08-05 (agent-eval, finding #1) | 2 | `/calibrate-before-measure` exists | Not invoked until 4 domains had died (CAD 1.0, OR 40/40, SWE-bench + DeepSWE withheld) | Yes |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Circuits beating Qiskit L3 | 0 | 9 | +9 | 20 | measured | `bench/qopt/results/` |
| Best 2q-gate cut, `qft_8` | 0% | 38.7% | +38.7pp | 40 seeds | measured | same |
| Skills vs solo, verified wins | — | 6 vs 3 | p=0.375 | 5 informative pairs | measured | `docs/results/qopt-skills-vs-solo.md` |
| Run cost, both arms | — | $33.82 | — | 40 cells | measured | same, cache reads included |
| Commits on main, unproposed | 46 (naive) | 10 (real) | −36 | — | measured | 21 squash-landed, 15 stale remainders |
| Prompt-cache hit rate | unmeasured | 78.9% | — | 5 steps | measured | `docs/results/prompt-cache-accounting.md` |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Calibrate a guard by making it fail | Caught a hole in my own hook fix — keyed on `*/.gitconfig`, missed `GIT_CONFIG_GLOBAL` | 4 of 4 cases |
| Mechanical grader, no model in the loop | Rejected 8 candidates that looked shorter; 6 claimed verified | 8 of 17 |
| Adversarial pass on my own reports | Found 6 errors in a KB doc already primary-source-checked by its author | 6 |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Move the equivalence check onto the delivered artifact | false self-certification | 6/17 → 0/17 | ~2h | next session | me | re-run qopt; rejection count |
| 2 | Verify merges by content, not PR state | orphaned PRs | 6 → 0 | 10min | immediate | me | `git ls-tree origin/main <path>` per PR |
| 3 | Fix pre-push hook reading the checkout's HEAD, not the pushed ref | false conflict blocks | ~1/push | ~30min | this week | me | push a branch not checked out |
| 4 | Prune `.run-*` to receipts; adopt `.agent/pursuit/<id>/` | 2.5 GB/run | −90% | ~1h | this week | me | `du -sh` after one run |

## Durable notes written
Reuse check: checked — no existing note (grep'd `orphan|stacked PR|base branch` and `self-certif|claimed verified` over `~/.claude/projects/-home-drew-code-supervisor-lab/memory/`, 0 hits each).

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| `memory/merged-true-is-not-on-main.md` | Stacked PRs merge into their base when merges outpace retarget; 6 read MERGED with content nowhere. Verify by `git ls-tree`. | — |
| `memory/agents-falsely-self-certify.md` | 6 of 17 delivered candidates claimed `"verified": true` and failed a mechanical check, on a task built for self-checking. | — |

## Self-gate
8/8 passed — failed: none.
k-of-n · cost both sides · status label · repeat check · Verdict names one number + one dispatch · actions name lever+target+owner+verification · zero adjectives standing in for counts · words 462 ≤ 600.
