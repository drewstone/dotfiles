---
name: governor
description: "Explore-exploit governor for the evolve/pursue/meta-harness loop. Reads accumulated .evolve state + recent reflections + scorecard, detects repo shape, and dispatches the next skill — /evolve to exploit a working direction, /pursue for a generational leap, /meta-harness for parallel structural exploration, /eval-agent to bootstrap missing measurement, /reflect when the loop needs stepping back. Use when the user says 'what's next', 'keep improving', 'run the loop', 'what should we work on', 'pick the next skill', 'governor', or when re-entering a project after a break and wanting the system to decide the next move."
---

# Governor — Explore-Exploit Dispatcher

The skills below you (`/evolve`, `/pursue`, `/meta-harness`, `/polish`, `/eval-agent`, `/harden`, `/converge`) each do one thing well. Picking which one to run at which moment used to be the operator's job. Governor is the bandit that sits above them: reads accumulated state, decides whether to exploit (tighten the current direction) or explore (try something structurally different), and dispatches.

Governor is **not** the orchestrator — it doesn't chain skills in sequence. It picks the single next skill, hands off, and exits. The dispatched skill runs and ends with its own dispatch-at-end. You run `/governor` again when you want the next pick.

## When to use

| Signal | Use governor? |
|---|---|
| "What should I work on next in project X" | **yes** |
| "Keep improving this until converged" | **yes** (in a loop) |
| "We hit a plateau, what now" | **yes** |
| "I have a specific thing in mind" | **no** — just invoke that skill |
| "I want a different skill than governor picks" | **override** — tell governor, it surfaces the decision |

## Phase 0: Detect repo shape

Before reading evolve state, figure out what kind of repo this is. This determines which skills are even applicable.

Scan top-level files and `.evolve/` (if present):

| Signal | Repo shape | Applicable skills |
|---|---|---|
| `.evolve/` exists + `experiments.jsonl` | **Optimization repo** (Drew's default) | full skill library applies |
| `tests/` + CI config + no `.evolve/` | **Product/service repo** | `/harden`, `/verify`, `/critical-audit`, `/converge`; `/evolve`-`/pursue` need `/eval-agent` bootstrap first |
| `src/lib/` as library + `package.json` public + changelog | **Library repo** | `/harden`, `/critical-audit`, `/verify`; evolve-family only if a benchmark suite exists |
| Infra + deploy configs + SLA-style monitors | **Service repo** | `/converge`, `/harden`, `/verify`; evolve-family only if a user-visible metric is defined |
| No tests, no CI, raw prototype | **Greenfield** | `/pursue` or `/meta-harness` to scaffold structure; bootstrap `.evolve/` and `/eval-agent` first |

Record the detection in the governor's decision log (see Phase 4). If the shape is ambiguous, ask the operator before dispatching — a wrong classification cascades.

## Phase 1: Read the accumulated state

```
.evolve/current.json                     # last active mode + active pursuit
.evolve/progress.md                       # human-readable cycle history
.evolve/experiments.jsonl                 # last 10-20 entries: deltas, verdicts
.evolve/scorecard.json                    # current flow scores vs targets
.evolve/reflections/ (newest 3)           # grading + dispatch-at-end of prior sessions
.evolve/meta-harness/frontier.json        # if present: non-dominated variants
.evolve/pursuits/ (newest)                # current generation thesis + status
.evolve/critical-audit/ (newest)          # unresolved CRITICAL/HIGH findings
git log --oneline origin/main..HEAD       # uncommitted work, recent PRs
```

Skip any that don't exist. Capture what each tells you.

## Phase 2: Compute state signals

Derive these from Phase 1. Each is a boolean or short verdict.

### Exploit signals (favor `/evolve` / `/polish`)

- **Active gains**: last 2 experiments had KEEP verdicts with delta ≥ 3% → the current direction still has room; keep exploiting.
- **Below target with movable metric**: scorecard shows a flow below target AND CV < 15% → the metric is measurable, tune it.
- **Unresolved HIGH findings from critical-audit**: there are concrete fixes on file:line with actions → exploit those before anything else.

### Explore-light signals (favor `/pursue`)

- **Plateau**: last 3 experiments on same metric have delta < 1% → parameter tuning exhausted, generational leap needed.
- **Dispatch-at-end of newest reflection names `/pursue`**: trust it.
- **Current generation is complete (ADVANCE verdict) but no follow-up pursuit** → design the next generation.

### Explore-heavy signals (favor `/meta-harness`)

- **Plateau + `/pursue` already ran 3+ rounds with <2% cumulative delta** → architecture is stuck, need parallel structural proposers.
- **User explicitly asks "think bigger" or "what structural changes"** → route there.

### Measurement-gap signals (favor `/eval-agent`)

- **Goal is defined but `.evolve/` has no baseline** → no measurement exists; bootstrap the judge.
- **Scorecard has `status: unmeasured` flows with `target` set** → build the missing eval for that flow.
- **The metric has no `productValueClaim`** (Phase 0.5 gate from `/evolve`, `/pursue`, `/meta-harness`) → measurement is proxy-shaped; either redefine the metric or build a judge that ties to product value.

### Retreat signals (favor revert + `/evolve` on last-known-good)

- **Last generation regressed**: newest pursuit has REGRESSION or PARTIAL verdict → revert to prior generation's baseline before anything else.
- **Two consecutive explores regressed**: the direction itself is wrong → surface to operator, don't auto-dispatch.

### Reflection signals (favor `/reflect` → then re-dispatch)

- **≥5 rounds since last reflection** → patterns are piling up unlogged; reflect before the next exploit/explore.
- **Dispatch chain drift**: last 3 skill picks contradict each other (A→B→A→B loop) → reflect on the oscillation.

### Hand-off signals (stop governing)

- **All scorecard flows meet target** → converged. Write a closing reflection and stop.
- **Budget exhausted** (cost/time cap in `current.json`) → report, stop.
- **No signals fire** → surface to operator. Don't dispatch blindly.

## Phase 3: Decision tree

Apply signals in priority order. First match wins.

```
1. Retreat signal fires            → revert last gen + dispatch /evolve on prior baseline
2. Measurement-gap fires           → dispatch /eval-agent (or /improve if infra is the gap)
3. Unresolved HIGH/CRITICAL fires  → dispatch /critical-audit --reaudit OR fix directly
4. Reflection-due fires            → dispatch /reflect; governor re-runs after
5. Explore-heavy fires             → dispatch /meta-harness
6. Explore-light fires             → dispatch /pursue
7. Exploit fires                   → dispatch /evolve (or /polish if gap is rubric-driven)
8. Hand-off fires                  → write closing reflection + stop
9. No match                        → surface to operator: "these signals are ambiguous, pick one"
```

## Phase 4: Log the decision

Every governor run appends one line to `.evolve/governor.jsonl`:

```json
{"ts":"2026-04-17T20:00:00Z","repoShape":"optimization","signals":{"plateau":true,"exploit":false,"measurementGap":false},"decision":"/pursue","reason":"3 rounds <1% on accuracy, pursue for architectural leap","priorChain":["/evolve","/evolve","/evolve"],"operatorOverride":null}
```

The `priorChain` is the last 3 governor decisions — catches oscillation before it wastes cycles.

On operator override (e.g., operator says "no, run /polish instead"), log the override with `operatorOverride: "/polish"` and `reason` extended with the operator's stated reason. Override data is how governor learns the operator's taste; future versions can weight it.

## Phase 5: Dispatch

Invoke the chosen skill with a brief that includes:

- The governor's reason for choosing it
- The signals that fired (so the dispatched skill can verify they're real)
- The priorChain (so the dispatched skill knows if it's been in a loop)
- Suggested scope (which file / dimension / flow)
- An instruction to end with its own dispatch-at-end, which governor will read on the next invocation

Example dispatch brief for `/pursue`:

```
You are being dispatched by /governor for generational redesign.

Reason: 3 consecutive /evolve rounds on the ideasai capability-hit metric
produced deltas of 0.008, 0.012, 0.004 — below the 1% plateau threshold.
The underlying approach (keyword matching) appears exhausted. Explore
architectural alternatives.

Signals that fired: plateau=true, exploit=false, lastGenerationComplete=true

Prior governor chain: /evolve → /evolve → /evolve (now /pursue)

Suggested scope: src/lib/prompt-planner.ts capability inference path

End with your own dispatch-at-end line so /governor can pick up next.
```

## Explore-exploit philosophy

Governor is a bandit with 3 coarse arms (exploit / explore-light / explore-heavy) and history-conditional decisions. The real work is:

- **Don't explore prematurely.** Every explore burns a lot more than an exploit (new code, new eval, risk of regression). Only explore when exploit is genuinely exhausted — plateau for 3 rounds, not 1.
- **Don't exploit forever.** If you've kept the same approach for 5+ rounds and the scorecard still isn't at target, the approach itself may be wrong. That's when a reflection is due (NOT an immediate explore — reflect first, then explore informed).
- **Retreat is cheap. Take it.** A regression that gets caught and reverted costs one round. A regression that gets iterated on costs N rounds of confusion.
- **Ambiguity is the operator's call, not yours.** If signals conflict, surface. Don't guess; guessing silently is worse than asking.

## Repo-shape adapters

Governor doesn't force `.evolve/` on every repo. Use the repo's existing conventions when they exist:

| Repo has | Use that instead of `.evolve/` |
|---|---|
| `docs/decisions/` (ADR-style) | Write `reflections/` equivalent as ADRs there |
| `.bench/` with a baseline.json | Use as scorecard; skip duplicate `.evolve/scorecard.json` |
| Github Project board / Linear | Consume as goal source; write governor decisions as tasks |
| CI-green is the only measurement | Recommend `/converge` + `/eval-agent` to add quality dimension |

When adapting, write an `.evolve/governor-config.json` that names the adopted conventions so every skill that runs after governor uses the same paths.

## Idempotency + resume

Governor is safe to re-run. Every run:

1. Reads state fresh (no cached inference from prior runs)
2. Checks the `priorChain` for oscillation; if the last 3 decisions are A→B→A, governor breaks the loop by dispatching `/reflect`
3. Validates that the last dispatched skill actually ran (look for its artifact — new pursuit file, new experiment line, new reflection). If not, the last dispatch didn't execute; re-dispatch with a note

The `.evolve/governor.jsonl` log is append-only. Never rewrite prior decisions — that erases the evidence of operator overrides.

## Rules

1. **One dispatch per invocation.** Governor picks one skill, dispatches, exits. It does not orchestrate sequences.
2. **Surface ambiguity.** If the signals don't clearly favor one skill, ask the operator. Don't coin-flip.
3. **Log every decision, including overrides.** The log is what future governor versions learn from.
4. **Never skip detection.** Phase 0 repo-shape detection runs every time. A repo can change shape between runs (added evals, dropped CI, migrated state).
5. **Retreat before explore after regression.** A regression must be reverted and re-baselined before the next explore — otherwise explore runs against a broken baseline.
6. **Reflect before deep-explore.** `/meta-harness` is expensive. If it's been ≥5 rounds since the last reflection, reflect first.
7. **Respect the operator.** Any explicit skill request from the operator overrides governor's pick. Log the override and continue.

## Related skills

```
/governor        ← reads state, picks the next skill to run (this)
  ├── /evolve           ← exploit a working direction
  ├── /pursue           ← generational leap when plateaued
  ├── /meta-harness     ← parallel structural explore when pursue plateaus
  ├── /eval-agent       ← bootstrap measurement when missing
  ├── /polish           ← rubric-driven quality pass
  ├── /critical-audit   ← unresolved HIGH/CRITICAL findings
  ├── /harden           ← adversarial validation of a system claim
  ├── /converge         ← CI/remote-loop convergence
  └── /reflect          ← meta-analysis when the loop is drifting
```
