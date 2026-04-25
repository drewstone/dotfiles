---
name: governor
description: "Reads accumulated state and picks the next skill to run — exploit (`/evolve`, `/polish`), explore (`/pursue`, `/meta-harness`), bootstrap (`/eval-agent`), or step back (`/reflect`). One dispatch per invocation. Triggers: 'what's next', 'keep improving', 'governor', 'pick the next skill'."
---

# Governor — Explore-Exploit Dispatcher

The skills below this one each do one thing well. Picking which one to run at which moment used to be the operator's job. Governor reads state, decides exploit vs explore, dispatches.

Governor is **not** an orchestrator — it picks the single next skill, hands off, and exits. The dispatched skill runs and ends with its own dispatch-at-end. You re-run `/governor` when you want the next pick.

Shared conventions in `_common.md`.

## When to use

| Signal | Use governor? |
|---|---|
| "What should I work on next" | yes |
| "Keep improving until converged" | yes (in a loop) |
| "We hit a plateau, what now" | yes |
| "I have a specific thing in mind" | no — just invoke that skill |
| "I want a different skill than governor picks" | override — tell governor, it logs the decision |

## Detect repo shape

Before reading evolve state, figure out which skills are even applicable.

| Signal | Repo shape | Applicable skills |
|---|---|---|
| `.evolve/` exists + `experiments.jsonl` | **Optimization repo** | full library |
| `tests/` + CI + no `.evolve/` | **Product/service** | `/harden`, `/verify`, `/critical-audit`, `/converge`; evolve-family needs `/eval-agent` bootstrap |
| `src/lib/` + public `package.json` + changelog | **Library** | `/harden`, `/critical-audit`, `/verify`; evolve-family only with a benchmark suite |
| Infra + deploy configs + SLA monitors | **Service** | `/converge`, `/harden`, `/verify`; evolve-family only with a user-visible metric |
| No tests, no CI, raw prototype | **Greenfield** | `/pursue` or `/meta-harness` to scaffold; bootstrap `.evolve/` + `/eval-agent` first |

Record the detection in the decision log. Ambiguous shape → ask before dispatching.

## Read accumulated state

Skip any that don't exist:

```
.evolve/current.json                     # last active mode + active pursuit
.evolve/progress.md                      # human-readable cycle history
.evolve/experiments.jsonl                # last 10–20 entries: deltas, verdicts
.evolve/scorecard.json                   # current flow scores vs targets
.evolve/skill-runs.jsonl                 # what skill ran last, what it dispatched to
.evolve/reflections/ (newest 3)          # grading + dispatch-at-end of prior sessions
.evolve/meta-harness/frontier.json       # if present: non-dominated variants
.evolve/pursuits/ (newest)               # current generation thesis + status
.evolve/critical-audit/ (newest)         # unresolved CRITICAL/HIGH findings
git log --oneline origin/main..HEAD      # uncommitted work, recent PRs
```

## Compute signals

Each is a boolean or short verdict.

### Exploit (favor `/evolve` / `/polish`)
- **Active gains**: last 2 experiments KEEP with delta ≥ 3% → keep exploiting.
- **Below target with movable metric**: scorecard flow below target AND CV < 15%.
- **Unresolved HIGH findings from critical-audit** → exploit those before anything else.

### Explore-light (favor `/pursue`)
- **Plateau**: last 3 experiments on same metric have delta < 1%.
- **Newest reflection's dispatch-at-end names `/pursue`**: trust it.
- **Current generation complete (ADVANCE) but no follow-up pursuit** → design the next.

### Explore-heavy (favor `/meta-harness`)
- **Plateau + `/pursue` already ran 3+ rounds with <2% cumulative delta** → architecture is stuck.
- **Operator asks "think bigger" / "what structural changes"** → route there.

### Measurement gap (favor `/eval-agent`)
- **Goal defined but no baseline in `.evolve/`** → bootstrap the judge.
- **Scorecard has `status: unmeasured` flows with `target` set**.
- **Metric has no `productValueClaim`** (gate from evolve/pursue/meta-harness) → either redefine or build a judge that ties to product value.

### Retreat (favor revert + `/evolve` on last-known-good)
- **Last generation regressed** (REGRESSION/PARTIAL verdict) → revert to prior baseline first.
- **Two consecutive explores regressed** → surface to operator. Don't auto-dispatch.

### Reflection-due (favor `/reflect`, then re-dispatch)
- **≥5 rounds since last reflection** → patterns piling up unlogged.
- **Dispatch chain drift** (last 3 picks contradict, A→B→A→B) → reflect on the oscillation.

### Hand-off (stop governing)
- **All scorecard flows meet target** → converged. Closing reflection + stop.
- **Budget exhausted** (cost/time cap in `current.json`) → report, stop.
- **No signals fire** → surface to operator.

## Decision tree

First match wins.

```
1. Retreat fires            → revert last gen + dispatch /evolve on prior baseline
2. Measurement-gap fires    → dispatch /eval-agent
3. Unresolved HIGH/CRITICAL → dispatch /critical-audit --reaudit OR fix directly
4. Reflection-due fires     → dispatch /reflect; governor re-runs after
5. Explore-heavy fires      → dispatch /meta-harness
6. Explore-light fires      → dispatch /pursue
7. Exploit fires            → dispatch /evolve (or /polish if rubric-driven)
8. Hand-off fires           → closing reflection + stop
9. No match                 → surface to operator
```

## Log the decision

Append one line to `.evolve/governor.jsonl`:

```json
{"ts":"2026-04-25T20:00:00Z","repoShape":"optimization","signals":{"plateau":true,"exploit":false,"measurementGap":false},"decision":"/pursue","reason":"3 rounds <1% on accuracy, pursue for architectural leap","priorChain":["/evolve","/evolve","/evolve"],"operatorOverride":null}
```

`priorChain` is the last 3 governor decisions — catches oscillation before it wastes cycles.

On operator override, log it with `operatorOverride: "/skill-X"` and extend `reason` with the operator's stated reason. Override data is how governor learns operator taste.

Also append to `.evolve/skill-runs.jsonl` (schema in `_common.md`) with `dispatchedTo` = the picked skill.

## Dispatch

Invoke the chosen skill with a brief that includes:
- The reason for choosing it
- The signals that fired (so the dispatched skill can verify they're real)
- The `priorChain` (so the dispatched skill knows if it's been in a loop)
- Suggested scope (file / dimension / flow)
- Instruction to end with its own dispatch-at-end

Example brief for `/pursue`:

> You are being dispatched by `/governor` for generational redesign.
>
> **Reason:** 3 consecutive `/evolve` rounds on the ideasai capability-hit metric produced deltas of 0.008, 0.012, 0.004 — below the 1% plateau threshold. The keyword-matching approach appears exhausted. Explore architectural alternatives.
>
> **Signals fired:** plateau=true, exploit=false, lastGenerationComplete=true
>
> **Prior chain:** /evolve → /evolve → /evolve (now /pursue)
>
> **Suggested scope:** `src/lib/prompt-planner.ts` capability inference path
>
> End with your own dispatch-at-end so /governor can pick up next.

## Repo-shape adapters

Governor doesn't force `.evolve/` on every repo:

| Repo has | Use that instead of `.evolve/` |
|---|---|
| `docs/decisions/` (ADRs) | Write reflections as ADRs there |
| `.bench/` with baseline.json | Use as scorecard; skip duplicate `.evolve/scorecard.json` |
| GitHub Project / Linear | Consume as goal source; write decisions as tasks |
| CI-green is the only measurement | Recommend `/converge` + `/eval-agent` to add a quality dimension |

When adapting, write `.evolve/governor-config.json` naming the adopted conventions so every following skill uses the same paths.

## Idempotency + resume

Governor is safe to re-run. Every run reads state fresh, checks `priorChain` for oscillation (last 3 = A→B→A → break the loop with `/reflect`), and validates the last dispatched skill actually ran (look for its artifact — new pursuit file, new experiment line, new reflection). If not, re-dispatch with a note.

`.evolve/governor.jsonl` is append-only. Never rewrite prior decisions — that erases operator-override evidence.

## Rules

1. **One dispatch per invocation.** Pick one skill, hand off, exit.
2. **Surface ambiguity.** If signals don't clearly favor one skill, ask. Don't coin-flip.
3. **Log every decision, including overrides.** That's what future versions learn from.
4. **Detection runs every time.** A repo can change shape (added evals, dropped CI, migrated state).
5. **Retreat before explore after regression.** Re-baseline first or explore runs against a broken baseline.
6. **Reflect before deep-explore.** `/meta-harness` is expensive — if ≥5 rounds since last reflection, reflect first.
7. **Respect operator overrides.** Log them and continue.

## Philosophy

Governor is a bandit with three coarse arms (exploit / explore-light / explore-heavy) and history-conditional decisions:

- **Don't explore prematurely.** Every explore burns more than an exploit (new code, new eval, regression risk). Plateau for 3 rounds, not 1.
- **Don't exploit forever.** 5+ rounds same approach not at target → reflect first, then explore informed.
- **Retreat is cheap.** A regression caught and reverted costs one round. Iterated on, it costs N rounds of confusion.
- **Ambiguity is the operator's call, not yours.** Surface, don't guess.
