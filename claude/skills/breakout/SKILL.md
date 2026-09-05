---
name: breakout
description: Find the constraint behind a plateau and design a step-change approach.
---

# Breakout

Every other skill optimizes *toward* a target. This one operates *on the target*. Use it when the honest next move isn't a better point under the ceiling — it's a higher ceiling.

This skill questions the target and changes the conditions that limit it.
Complete the constraint analysis and record the proposal before selecting a build task from the final footer.

Shared conventions in `_common.md`.

## When to use

| Signal | Skill |
|---|---|
| "We're near the target and it feels small" | **`/breakout`** |
| "3 pursue/meta-harness cycles, <2% each" | **`/breakout`** — the ceiling is the target, not the code |
| "Why can't this be 10x?" | **`/breakout`** |

Use this when a measured constraint limits progress, rather than when a difficult change remains untested.

## Procedure

1. **Establish the constraint.** Inspect the real path and run available measurements before naming the cause of the limit.
   If available checks cannot establish it, record the missing evidence and the command needed, then finish with that limitation.
   A new target needs a demonstrated constraint.
2. **Separate the physics floor from the assumed floor.** Physics floor = irreducible (security, information theory, speed of light, a real SLA). Assumed floor = how it's always been done, the metric we happened to pick, a constraint no one has retested. **Attack only the assumed floor.** Naming which is which is the core analytical work.
3. **Design the regime change.** The lever is usually *not* the artifact. Change the **metric** (the current one may be the cage), the **problem** (eliminate the work instead of speeding it), the **constraint** (retest the "can't"), or the **substrate** (different foundation). One regime change, stated as a thesis with a falsifiable payoff.
4. **Set the raised target + the smallest proof the regime is reachable.** A number that would be *absurd* under the current regime and *natural* under the new one, plus the cheapest experiment that shows the new regime is real (not that it's finished).
5. **Define the comparison.** Record the permitted regression, resource limits, smallest useful effect, and stopping rule before a build starts.
   Read [the bootstrap guidance](../evolve/references/STATS.md) when defining the confidence interval.
6. **Record the proposal.** Write the thesis, raised target, regression allowance, and rejection condition to `.agent/pursuits/<date>-breakout-<slug>.md`.
   Select subsequent work only after this analysis is complete.

## Rules

- **Optimize the ceiling, not the point under it.** A 3% win that caps you forever loses to a regime change that unlocks 10x.
- **If the metric can't 10x, the metric is the cage — change the metric.** Then re-baseline honestly against the new one.
- **Attack the assumed floor; respect the physics floor.** Confusing the two is how breakout becomes either cowardice or fantasy.
- **A raised target with no named mechanism is a wish.** Every breakout thesis names the constraint it dissolves.
- **Endurance is a state property, not a willpower property.** Externalize the bet so completely that a fresh agent resumes with zero loss — then round-count stops mattering and the only stop conditions are *the bet resolved* or *a real wall*. (This is why the deterministic loop matters: you can only refuse to stop when stopping is free.)
- **The valley is the price of the peak.** Don't judge a regime change on week-one numbers; judge it at the gate you set in step 5.

Use `references/full-reference.md` for regime-change patterns, the ceiling-analysis worksheet, and the floor-separation examples.

## Log the run

On completion, append one line so later analysis can grade this skill:

```bash
skill-run-log /breakout --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The constraint cannot be established from current measurements | `/ground-truth` | the missing measurement and its real execution path |
| The new regime is one coherent build | `/pursue` | the regime definition + the constraint it removes |
| ≥2 independent regimes are worth building and budget allows | `/multi-pursue` | one track brief per regime + the shared metric |
| First measurement in the new regime lands inside 2× the noise floor | `/dont-collapse-the-architecture` | the regime-active check + the mechanism that should have fired |
| The new regime stands and the metric moves again | `/evolve` | the new baseline number + the dominant remaining lever |
| Target still unreached after n ≥ 12 in the new regime | `/autopsy` | the raw rows + whether the regime or the proof was wrong |
