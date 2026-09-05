---
name: breakout
description: Test the constraint behind stalled progress and identify whether changing the work or its conditions can improve the required outcome.
---

# Breakout

Use this when evidence suggests that a constraint, assumption, or choice of target limits useful progress.
Complete the constraint analysis before choosing the subsequent build.
Keeping a sound target or design is a valid result.

## Establish the constraint

Read prior attempts and measure the actual path before naming the limiting cause.
State the current outcome, its execution conditions, and the evidence linking the limit to a mechanism.
If available checks cannot establish that link, run the missing check within scope or record exactly what remains unavailable.
Do not present the suspected constraint as measured.

Separate:

- physical or information limits supported by evidence;
- required security, integrity, and product behavior;
- contractual or operational choices that need an authorized decision to change;
- historical implementation choices and untested assumptions.

A service commitment is a requirement, not a law of physics.
An implementation limit is not necessarily a fundamental bound.

## Identify a useful change

Prefer eliminating unnecessary work, then simplifying the remaining work.
Read [constraint-changing options](references/constraint-options.md) when the path forward requires a different problem formulation, dependency, execution model, or metric.
Name the mechanism, expected user benefit, assumptions, and observation that would refute the proposal.

Change a metric only when it fails to represent the required outcome.
A bounded metric or a modest remaining improvement does not justify changing the goal.
If the requirement is already met and no useful change is supported, leave the system alone.

## Record the deciding proof

Specify the smallest test that can establish the proposed mechanism and affect the decision.
Record resource limits, acceptance criteria, permitted regressions, and stopping conditions before a build.
For sampled or noisy comparisons, read [comparison design](../evolve/references/STATS.md).
A temporary regression is neither required nor evidence of architectural progress.

Write `.agent/pursuits/<date>-breakout-<slug>.md` with the measured constraint, required invariants, proposal or no-change decision, evidence, and deciding test.
Carry this result into the next authorized work without restarting the analysis.

## Log the run

```bash
skill-run-log /breakout --target "<outcome and constraint>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The constraint still needs measurement on the actual path | `/ground-truth` | The missing evidence and execution boundary |
| Unnecessary work can be removed directly | `/simplify` | The candidate and required behavior |
| The supported proposal is a coherent architectural build | `/pursue` | The mechanism, constraints, and deciding test |
| Independent proposals warrant parallel builds | `/multi-pursue` | The track scopes, common outcome, and limits |
| A completed proof is null, surprising, or suspect | `/autopsy` | The raw results and causal prediction |
