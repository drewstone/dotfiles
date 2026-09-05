---
name: calibrate-before-measure
description: Before an evaluation, check that scoring distinguishes required behavior and establish what a simple baseline can do.
---

# Calibrate before measure

This guard checks whether an evaluation can answer its intended question before broader spending.
Reuse existing calibration while its cases, scoring path, and relevant conditions remain applicable.

## Check the scoring path

1. State the required behavior and the decision the result controls.
2. Select independently justified acceptable and realistic unacceptable fixtures.
   Include borderline cases when the decision depends on a boundary.
3. Score them through the exact path the evaluation will use.
4. Check the inputs and intermediate results for leakage, missing evidence, constant output, and unrelated proxy measures.
5. Confirm that acceptable behavior passes and the relevant failure fails with adequate separation for the observed scoring variation.
   Use the domain's decision boundary and error costs; do not invent a universal score cutoff.
6. Repair and repeat when the scoring path cannot support the intended decision.

## Establish the simple baseline

Run the simplest plausible solution under the same conditions.
Examples include a constant answer, a direct lookup, or one unguided attempt.
If it ties the intended system, determine what the comparison was meant to establish.

- If the user task is solved adequately, retain the result as evidence that the simpler solution may suffice.
- If the claim concerns a capability or difficult condition absent from the case, add a case that exercises that claim.
- If leaked answers or scoring defects explain the tie, repair them before comparing systems.

Do not make a task harder solely to ensure that the intended system wins.

## Completion

Record the fixtures and label sources, scores, sample counts, scoring variation, baseline result, exact command, and artifact paths.
Resume the original evaluation once these checks support its stated question.
If they do not, identify the failed condition and the correction required before broader spending.

## Log the run

```bash
skill-run-log /calibrate-before-measure --target "<evaluation and decision>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The task omits a difficulty required by the original claim | `/push-past-easy` | The missing difficulty and calibration evidence |
| The case or scoring path cannot distinguish required behavior | `/eval-engineering` | The failed fixtures and scoring evidence |
| Semantic judgments disagree with independent labels beyond the decision's tolerance | `/eval-agent` | The disagreement rows, labels, and rubric |
| The simple solution meets the actual requirement | `/simplify` | The requirement, comparison, and implementation scope |
