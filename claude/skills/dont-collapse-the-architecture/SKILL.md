---
name: dont-collapse-the-architecture
description: Check whether a disappointing architecture result tested the claimed mechanism under the conditions where it should help.
---

# Check the architecture claim

Use this when a disappointing comparison may not have tested the proposed mechanism.
Preserve the original claim and its limits; do not invent conditions after seeing the result.

## Audit the comparison

Check whether:

1. The task entered the conditions where the design claims an advantage.
2. The claimed mechanism ran and its required events were recorded.
3. The assessment could distinguish the smallest useful effect.
4. The comparison met its registered resource, sampling, and stopping rules.

If a condition is missing, state which conclusion remains untested.
Repair the relevant test within the existing scope and resource limits.
A mechanism that cannot execute or costs too much may still fail a feasibility or efficiency requirement.
Missing evidence of quality is not an exemption from those requirements.

For a recursive claim, use [the recursive proof requirements](../discovery-lead/references/recursive-proof.md) to identify the events that the claim needs.

If a valid comparison excludes the registered useful effect or violates required limits, reject or simplify the design.
If the evidence cannot decide, retain the uncertainty and name the test that would resolve it.
Do not continue defending the design with new, unmeasured explanations.

## Log the run

```bash
skill-run-log /dont-collapse-the-architecture --target "<architecture and result>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The assessment has not been calibrated | `/calibrate-before-measure` | The decision, fixtures, and baseline |
| A required execution event cannot be observed | `/ground-truth` | The missing event and actual execution path |
| The original claim requires an untested difficulty | `/push-past-easy` | The claim and relevant task condition |
| The useful-effect claim was rejected and complexity can be removed | `/simplify` | The comparison and required behavior |
