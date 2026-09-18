---
name: hypothesize
description: Research relevant mechanisms, assess their evidence, and choose the experiments most likely to resolve an improvement decision.
---

# Hypothesize

Use this when the next useful approach is unclear or current attempts keep varying the same unsupported idea.
Finish with supported candidates and deciding experiments, not an obligatory number of bets.

## Investigate before proposing

Read the goal, measured constraints, existing capability, and prior rejected approaches.
Research relevant primary sources and implementations by mechanism, not just by the project's terminology.
Record what each source actually establishes and whether its assumptions match the current system.
Distinguish reproduced local evidence, external evidence, causal reasoning, and an unsupported guess.

Do not treat missing accessible research as proof that no prior art exists.
Use the research tools available within scope; this skill does not implicitly request a special research mode or new spending authority.

## Form and compare candidates

For each viable candidate, record:

- the mechanism and required user outcome;
- supporting and contrary evidence with source locations;
- assumptions that remain untested;
- the expected effect in real units when estimable, otherwise the uncertainty;
- experiment and operating costs, dependencies, and risk;
- the smallest observation that would refute the useful-effect claim.

Include deleting work or using an existing simpler solution when it meets the requirement.
Seek a different mechanism when the current family cannot address the demonstrated cause.
Do not invent alternatives, probabilities, or improvement multipliers to fill a table.
Read [candidate comparison](references/candidate-comparison.md) when tradeoffs or dependent experiments make the order unclear.

## Record the choice

Write `.agent/hypotheses/<date>-<slug>.md` with sources, candidates, rejected alternatives, deciding tests, and the recommended sequence.
A single supported candidate, or no justified change, is a valid result.
Record why further research or measurement would change that decision when it remains open.
This skill selects experiments; subsequent execution follows the completed analysis and the task's existing authority.

## Log the run

```bash
skill-run-log /hypothesize --target "<outcome and unresolved mechanism>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A scoped change has a deciding experiment | `/evolve` | The hypothesis, baseline, and test |
| The chosen mechanism requires an architectural build | `/pursue` | The candidate, alternatives, and required behavior |
| A measured constraint or target assumption needs reconsideration | `/breakout` | The constraint and evidence limiting the candidates |
| An external technique needs a concrete adopt/adapt/reject decision | `/reconcile` | The source, local capability, and transfer assumptions |
