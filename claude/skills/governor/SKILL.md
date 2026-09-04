---
name: governor
description: Read current work, choose the next improvement skill, dispatch it once, and stop.
---

# Governor — one measured dispatch, then exit

Picks the single next skill. It does not do the work. Every pick names the row it fired, the measured value, and the threshold it crossed. A pick with no number is a coin flip.

## Flow

1. **Read the log first.** Tail `.agent/skill-runs.jsonl` (last 10), `.agent/governor.jsonl` (last 3 → `priorChain`), `.agent/current.json`, `.agent/experiments.jsonl` (last 10–20), `.agent/scorecard.json`, newest `.agent/pursuits/`, `.agent/critical-audit/`, `.agent/reflections/`. Missing → record `n=0`, do not bootstrap.
2. **Verify the last dispatch ran.** Newest artifact (pursuit file, experiment line, reflection) must post-date the prior `dispatchedTo`. If not: re-dispatch the same skill and say so.
3. **Detect shape.** optimization (`experiments.jsonl` exists, full table) · product/service (tests+CI, no `.agent/` → rows 1, 8, 10, 19 only) · greenfield (0 tests, 0 CI → rows 5, 12 only).
4. **Score every row in order; first match wins.** Record measured-vs-threshold for at least the winner and the top 2 losers.
5. **Emit the template, log both lines, stop.**

## Hard rules

| Rule | Why (measured over 4,559 `.agent/governor.jsonl` rows in 248 repos + 275 `/governor` skill-run rows, 2026-07-27) |
|---|---|
| **One dispatch per invocation.** Emit, then stop — the picked skill owns the next turn. | — |
| **`decision` is a bare `/skill` token.** No free text, no `+`, no `_then_`. | 939 of 1,705 decisions were free text (`/reflect + handoff`, `pursue_then_evolve`, `surface-to-operator`) → 55% unparseable, so oscillation detection ran on nothing. |
| **Every signal row carries measured vs threshold** (`k of n`, `n=`, Δ%). Banned as claims: several, many, most, often, repeated, significant, substantial, strong. | 3,568 of 4,559 reasons (78%) contained zero digits. |
| **`measured \| inferred \| hypothesis` on every signal**, with the exact check (command, `path:line`, run id). A `hypothesis` row may not select the dispatch. | `signals` present on 1,496 of 4,559 rows (33%). |
| **`priorChain` = last 3 decisions, always.** A→B→A → dispatch `/reflect` on the oscillation instead of the third pick. | `priorChain` present on 1,477 of 4,559 rows (32%). |
| **Cost both sides:** est. turns this dispatch spends + turns saved vs not dispatching, same unit, assumption stated. `unmeasured (<reason>)` is allowed; dropping the column is not. | `durationMin` recorded on 7 of 275 governor runs (3%) → no dispatch in the corpus has ever been costed. |
| **Evidence is a pointer** — `path:line`, run id, PR#, or command + its output. A prose summary is a defect. | `reason` median 262 chars, max 1,200: prose, not pointers. |
| **≤200 words outside tables.** No self-grade, no restating the task, no section that would read "None". | — |
| **0 rows fire → `Stop:` + exactly 1 question.** Never coin-flip; ambiguity is the operator's call. | `operatorOverride` non-null on 520 of 4,559 rows (11%). |
| **35 of 54 installed skills are absent from the table below.** Before concluding none fits, run `skills <substring>` and dispatch what you find. | 4 skills took 694 of 766 canonical dispatches (91%): `/evolve` 184, `/pursue` 182, `/harden` 165, `/converge` 163. |

## Dispatch table — first match wins

| # | Condition (numeric; check in this order) | Dispatch | Pass it |
|--:|---|---|---|
| 1 | ≥1 required check failing on HEAD (`gh pr checks`) | `/converge` | failing check names + run id |
| 2 | Newest verdict is REGRESSION/PARTIAL, or 2 consecutive explores with Δ<0 | revert to last KEEP, then `/evolve` | baseline SHA + the regressed Δ |
| 3 | ≥1 result in last 5 that is null, 0, or >2σ off the prior 10, raw rows unread | `/autopsy` | the 1 run id + raw-rows path |
| 4 | "faster/slower/why slow" objective with 0 per-hop timings on the deployed path | `/ground-truth` | the flow + which hops have n=0 |
| 5 | ≥1 scorecard flow with `target` set and `status: unmeasured`, or 0 baselines | `/eval-agent` | flow name + target value |
| 6 | Eval about to run with 0 separation checks (no good/bad pair, no trivial baseline) | `/calibrate-before-measure` | metric + the pair it must separate |
| 7 | ≥2 of last 5 eval runs failed on auth/route/judge/transport, not agent behavior | `/eval-harness-diagnose` | the failing run ids |
| 8 | ≥1 unresolved CRITICAL/HIGH in newest `.agent/critical-audit/` | `/critical-audit --reaudit` | finding ids + `path:line` |
| 9 | ≥5 skill-run rows since newest `.agent/reflections/` entry | `/reflect` | run range + n |
| 10 | ≥6 failures in the last suite run with 0 cluster ranking | `/diagnose` | failing test list + run id |
| 11 | Merge/migration in `git log -20` touching ≥10 files, 0 cleanup commits after | `/deep-clean` | merge SHA + file count |
| 12 | Last 3 experiments on one metric, each \|Δ\| < 1% | `/pursue` | metric, the 3 Δs, exhausted approach |
| 13 | Row 12 fires AND ≥2 independent buildable tracks are named | `/multi-pursue` | the tracks, 1 owner each |
| 14 | `/pursue` ran ≥3 rounds with cumulative Δ < 2% | `/meta-harness` | the 3 pursuit files + cumulative Δ |
| 15 | `/meta-harness` already ran and Δ < 2%, or within 3pp of target | `/breakout` | current target + the suspected cap |
| 16 | ≥2 plausible levers unranked, or last 3 experiments were variants of 1 idea | `/hypothesize` | metric + levers already tried |
| 17 | Last 2 experiments KEEP with Δ ≥ 3% and CV < 15% | `/evolve` | metric, baseline, next lever |
| 18 | Branch carries ≥2 mixed-scope shippable changes and 0 open PRs | `/finalize` | file groups → PR split |
| 19 | Work reads done, 0 test runs this session, `git status` dirty | `/verify` | the artifact + the check to run |
| 20 | Context replacement is imminent with ≥1 task in flight | `/session-continuity` | in-flight list + next action |
| 21 | All scorecard flows ≥ target, or budget in `current.json` exhausted | `stop` | closing numbers |
| 22 | 0 rows above match | `stop` | the signals table + 1 question |

## Output template

Emit exactly this. Omit a section only when its rule says so.

```markdown
Next: /<skill> — row <N>: <measured> vs threshold <T>. Target <X>. First check: `<command>`.

## State read
| Source | Rows / mtime | Signal extracted |
|---|--:|---|

## Signals
| Row | Signal | Measured | Threshold | Fires | Status | Check |
|--:|---|--:|--:|:-:|---|---|

## Rejected — top 2
| Skill | Measured | Threshold | Why it lost |
|---|--:|--:|---|

## Brief for /<skill>
| Field | Value |
|---|---|
| Reason | row <N>: <measured> crossed <T> |
| Prior chain | /a → /b → /c (oscillating: yes/no) |
| Scope | `<path or metric>` |
| Cost | spends ~<n> turns · saves ~<n> turns of <what> · assumption: <one clause> |
| First check | `<command>` |
| Ends with | its own dispatch line |

## Self-gate
<k>/8 passed — failed: <list, or "none">.
decision is a bare /skill · winner + 2 losers carry measured vs threshold · status label on every signal · priorChain from last 3 rows · cost both sides · evidence is pointers only · exactly 1 dispatch · words <N> ≤ 200.
```

If dispatching is unsafe, replace line 1 with `Stop: <blocking fact + the number>` and keep the State read and Signals tables.

## Calibration

- **0/10** — `decision:"pursue_then_evolve"`, `reason` 1,200 chars with 0 digits, no `priorChain`, no cost: 2 dispatches in one line, unparseable, unauditable.
- **10/10** — `Next: /converge — row 1: 3 of 7 required checks failing on run 19283746. Target: HEAD of adc-pr3699-ci. First check: gh run view 19283746 --log-failed.`

## Log the run

```bash
skill-run-log /governor --target "<row N: measured vs threshold>" --duration <min> --verdict DISPATCH --next /<skill-or-stop>
```

Also append one line to `.agent/governor.jsonl` (append-only; never rewrite a prior decision, that erases override evidence):

```json
{"ts":"2026-07-27T20:00:00Z","repoShape":"optimization","signals":{"row12_plateau":{"measured":0.008,"threshold":0.01,"status":"measured"}},"decision":"/pursue","reason":"3 Δs 0.008/0.012/0.004 < 1% on accuracy","priorChain":["/evolve","/evolve","/evolve"],"operatorOverride":null}
```

Worked examples (non-normative): `references/full-reference.md`.
