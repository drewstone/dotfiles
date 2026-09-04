---
name: dont-collapse-the-architecture
description: Decide whether a disappointing architecture result tested the claimed mechanism in the regime where it should help.
---

# Do not collapse the architecture

Use this before simplifying an ambitious design because an early comparison tied or lost.
It protects an untested mechanism, not an architecture forever.

## Audit the test

A negative result can reject the design only when all four conditions hold:

1. The task entered the regime where the design claims an advantage.
2. The claimed mechanism fired and was recorded.
3. The assessment could detect the smallest useful effect.
4. The compared arms received equal actual resources and enough paired cases for the stopping rule.

If a condition is missing, state that the architecture remains untested.
Repair the test or activate the mechanism before drawing a quality conclusion.

For recursive agents, a long task alone is insufficient.
The record must show context replacement, descendant work, ancestor use of descendant artifacts, and evidence-driven revision.

If all four conditions hold and the effect remains below the registered useful threshold, simplify or reject the design.
Do not protect it with a new unmeasured explanation.

## Log the run

```bash
skill-run-log /dont-collapse-the-architecture --target "<architecture and result>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The assessment or task has not been calibrated | `/calibrate-before-measure` | the metric, good/bad cases, and trivial baseline |
| The mechanism cannot be observed | `/ground-truth` | the missing event and real execution path |
| The target regime was absent | `/push-past-easy` | the regime definition and a task that enters it |
| All conditions held and the useful effect was absent | `/pursue` | the paired result and failed mechanism |
