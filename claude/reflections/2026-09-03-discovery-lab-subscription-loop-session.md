# Reflect: session — 2026-09-03 — n=1

**Verdict:** The lab's one button runs on the Claude subscription end to end (pre-flight: 2 of 2 director slots free, seat claude-1 0/4) and sourcing produced 31 charters across 6 authors, but 2 of the 6 runs chartered on 8 fetched papers of 50 — measured. The session's systemic failure: I built research machinery beside the loop twice in 72 min and paid 3 interrupts + 5 corrections in 6 min for it.
**Biggest cost this period:** 72 min built-then-deleted + 3 interrupts to finding #1.
**Next:** /verify targeting a Waters+Sahai re-run with baseline 2/25 and 6/25 papers fetched.

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-09-01T20:34Z–2026-09-03T04:41Z (the sourcing + loop portion of transcript d0e0f9e0) |
| Sources | transcript `~/.claude/projects/-Users-drew-webb/d0e0f9e0-f09e-4867-855d-147252b7368e.jsonl`; discovery-lab `4c5542c8..1652644f` PRs #504, #533, #535, #536, #542, #544–#550, #552, #557; agent-runtime #1078, tangle-router #471/#474/#475; container `/lab2/pursuits/sourcing-*/{journal.jsonl,stderr.log,rendered/}`; `.agent/skill-runs.jsonl`; `.agent/handoffs/2026-09-03-*.md` |
| Prior reflections read | 5: `2026-08-26-adc-billing-settlement-session.md`, `2026-08-24-playproof-game-loop-session.md`, `2026-08-08-supervisor-lab-killtest-session.md`, `2026-08-18-discovery-provenance-and-gates.md`, `2026-08-19-discovery-ideal-state-and-industry-pivot.md` |
| Not inspected | the router spend ledger for 09-02 (the $ of the metered graph run); sourcing journals carry no usd field (0 of 2,780 spawn rows), so per-run $ is unmeasured; the 08-27–09-01 disk work (reflected 09-01) |

## Findings — top 6 of 9, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Built research machinery beside the loop: `run-attack.mjs` (20:37Z→deleted 21:49Z) and a Workflow proposal to run research (21:45Z) | 2 | 72 min + 3 interrupts + 5 corrections in 6 min (21:43–21:47Z) | 72 min/session; trust unmeasured (no scale) | measured | transcript ts; PR #536 −191 lines; interrupts at 21:43, 21:44, 21:45Z | invariant in `discovery-lab/CLAUDE.md` (#536) + `discovery/CLAUDE.md` (#103) + memory; root cause: `/problem-sourcing` step 2 and the workflow-authoring skill both prescribe agent-run research → skill edited (below) | me |
| 2 | Designed the shape before reading agent-runtime's primitives; Drew asked 3× (02:12, 02:20, 02:29Z) | 3 | 34 min (01:55→02:29Z) | 34 min/design | measured | transcript ts; memory `read-primitives-before-designing.md` | memory note (written); rule: grep `.d.ts` + one example before any architecture proposal | me |
| 3 | The graph ran on metered API spend from 06:02Z (asked) to 20:32Z ("DO NOT USE API SPEND") | 1 | 14.5 h on the wrong meter; $ unmeasured (ledger not read) | all future run $ → 0 metered | measured (time) / unmeasured ($) | transcript ts; PR #533 `--allow-metered` refusal | default executor claude-code + refusal (#533) | done |
| 4 | Plan-window 429 killed 3 subagents + the batch; loop has no backoff | 1 | ≈1.8 h idle (22:00→23:49Z: 7 assistant turns vs 79 the hour before); 15 tool results carried 429 | 1.8 h/incident | measured | transcript hourly turn counts; "resume limit lifted!" 23:49Z | lane pause on 429 in `tools/program-loop.sh` (handoff loop #5) | next session |
| 5 | ePrint rate limit starved 2 runs: Waters 2/25, Sahai 6/25 fetched, yet 10 charters written | 2 | 149 min wall (71 + 78) for charters on 8 papers | 149 min/re-run avoided | measured | `stdout.log` per run; `rendered/` counts | fetched-ratio floor (<60% → no charter) in `shape.mjs` + retry window in `bin/paper-sections.py` | me |
| 6 | Container operated by hand: 268 of 563 Bash calls were `docker exec` (48%); host→container sync was a failed bundle clone then a shallow clone | 1 session | unmeasured (no per-call timing) | one command per sync | measured (share) | tool-call census over the transcript | `tools/fleet-sync.sh` (bundle → fetch → ff-only); recipe is handoff decision 5 | me |

3 findings dropped below the cost×occurrence bar (2 timeouts of 563 calls; 20 tool errors = 3.6%; journal rows lack a usd field).

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---|---|---|---|
| Built the wrong thing beside the ask (#1 here; "periphery shipped, core unbuilt" on 08-24) | 2026-08-24 | 2 | AGENTS.md "Told to build it? Build all of it" | that rule targets under-delivery; this was wrong-layer delivery | done: project-level invariant shipped (#536, discovery #103) |
| Wait loops hit the tool timeout (08-26 action 1) | 2026-08-26 | 1 → held | `run_in_background` rule | held: 2 timeouts in 563 calls (0.4%) vs 44% on 08-26 | no |
| Dispatch a workflow on its real runner before merging (08-26 action 2) | 2026-08-26 | 2 | rule only | #504 merged at 09:03Z on offline proof; first live run died on a 0-spend pool budget | no; 1 unresolved raise |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Charters rendered | 0 | 31 | +31 | 6 runs | measured | `pursuits/sourcing-*/rendered/line-*.md` |
| Papers fetched / enumerated | — | 75 / 130 (58%) | — | 6 runs | measured | per-run `stdout.log` (21/25, 21/22, 4/10, 21/23, 2/25, 6/25) |
| Director lanes on subscription | 0 | 1 (bridge 8899, 2 slots) | +1 | 1 | measured | `bridge-capacity claude-code` → 0/2 live |
| `/lab2` runtime | 0.188.0 tar copy | 0.191.0 git clone @4c5542c8 | — | 1 | measured | `git -C /lab2 log -1` |
| Router turn-3 cache reads | 9,466 | 17,533 | +85% | 1 | inferred (delegate report, not re-run by me) | tangle-router #471 body |
| PRs merged | — | 12 lab + 5 upstream; median +26 lines; 10 of 12 merged ≤2 min after open | — | 17 | measured | `gh-drew pr view` |
| Bash calls that hit the timeout | 44% (08-26) | 2 / 563 | −43.6 pp | 563 | measured | transcript `Command timed out` count |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Offline proof before a live run | `shape.test.mjs` passed before #504; every later live failure was infra, not shape logic | 9/9 |
| Small PRs merged on the spot | 10 of 12 lab PRs merged within 2 min of opening | 10/12 |
| Background waits | timeouts fell from 44% to 0.4% of calls | 2/563 |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Re-run Waters and Sahai once `curl -s -o /dev/null -w '%{http_code}' https://eprint.iacr.org/2026/257` returns 200 from the container | charter grounding | fetched 8 → ≥40 of 50 | 2 runs, ~150 min wall | next quiet window | next session | each run's `stdout.log` shows ≥20/25 fetched |
| 2 | Fetched-ratio floor in `shape.mjs`: no charter round below 60% fetched | thin charters | 2 thin runs → 0 | 1 PR | before action 1 | me | a run with 2/25 fetched ends `blocked`, not chartered |
| 3 | Lane pause on 429 in `tools/program-loop.sh` for the claude-code lane | lost director rounds | 1 lost batch → 0 | 1 PR | before the first loop run | next session | a forced 429 in a smoke run pauses the lane and resumes |
| 4 | `tools/fleet-sync.sh` (bundle → `docker cp` → fetch → ff-only) | manual `docker exec` share | 48% → measured next session | 1 PR | next session | me | one command updates `/lab2` to master HEAD |
| 5 | Drew: pick which of the 31 charters become lines, director count (2), and say go | the button | 0 → 1 loop run | 3 answers | — | drew | `ops/program-loop.log` shows a commission |

## Durable notes written
Reuse check: extended `~/dotfiles/claude/skills/problem-sourcing/SKILL.md` step 2 (checked: no existing pointer — grep'd 'run-sourcing|agent-runtime|shape' over the file, 0 hits). Memory notes `discovery-lab-invariant-build-not-be-the-factory.md`, `read-primitives-before-designing.md`, `sourcing-shape-2026-09-02.md` were written earlier this session and are cited, not rewritten.

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| `~/dotfiles/claude/skills/problem-sourcing/SKILL.md` | In discovery-lab the sweep is `tools/sourcing/run-sourcing.mjs` on the fleet host; the hand-run agent sweep is for elsewhere | step 2 "Sweep with a cheap agent" |

## Self-gate
8/8 passed — failed: none.
k-of-n · cost both sides · status label · repeat check · Verdict names one number + one dispatch · actions name lever+target+owner+verification · zero adjectives standing in for counts · words ≤ cap.
